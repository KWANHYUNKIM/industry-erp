#!/usr/bin/env node
/**
 * 스키마 대조 — DB 를 직접 들여다봐야 하는 검사들.
 *
 *   node qa/schema-check.mjs
 *
 * qa.mjs 는 HTTP 만 쓰는데, 여기 있는 것들은 DB 를 봐야 알 수 있어서 따로 뒀다.
 * 둘 다 <b>기동만으로는 안 잡히고 나중에 아프게 무는</b> 것들이다.
 *
 *  1) 자바 enum 상수 vs CHECK 제약 허용값
 *     enum 에 값을 추가하고 마이그레이션을 잊으면 컴파일도 되고 기동도 된다
 *     (ddl-auto: validate 는 CHECK 내용을 안 본다). 그 값을 처음 저장하는 순간
 *     23514 로 터진다 — 몇 달 뒤 운영에서.
 *
 *  2) 본사(public) vs 회사 스키마(co_*) 의 테이블·컬럼·CHECK
 *     validate 는 기본 스키마만 본다. 테넌트가 뒤처져도 앱은 멀쩡히 뜨고,
 *     그 회사로 로그인해 그 화면을 열 때만 터진다(CLAUDE.md §7.4).
 *
 * 사전 조건: docker compose up -d (컨테이너 이름 erp-postgres)
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const CONTAINER = process.env.ERP_PG ?? 'erp-postgres'
const SRC = 'backend/src/main/java/com/erp'

let pass = 0
let fail = 0
const eq = (label, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`  ${ok ? '✅' : '❌'} ${label}${ok ? '' : `\n     ${actual}`}`)
  ok ? pass++ : fail++
}

const psql = (sql) => execFileSync(
  'docker', ['exec', CONTAINER, 'psql', '-U', 'erp', '-d', 'erp', '-t', '-A', '-F', '', '-c', sql],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
).split('\n').filter((l) => l.trim()).map((l) => l.split(''))

/** CHECK 정의 문자열에서 허용값만 뽑는다. 표기(ARRAY[...] 중첩 캐스팅)는 스키마마다 달라서 값만 본다. */
const allowedValues = (def) => new Set(
  [...def.matchAll(/'([A-Z_0-9]+)'::character varying/g)].map((m) => m[1]),
)

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

// ── 1) 자바 enum vs public CHECK ────────────────────────────────────────────
console.log('\n■ 자바 enum ↔ CHECK 제약')

const javaFiles = walk(SRC).filter((f) => f.endsWith('.java'))
const byName = new Map(javaFiles.map((f) => [f.split(sep).pop().replace('.java', ''), readFileSync(f, 'utf8')]))

/** enum 이름 → 상수 집합 */
const enumConsts = new Map()
for (const [name, src] of byName) {
  const m = src.match(new RegExp(`public\\s+enum\\s+${name}\\s*\\{([\\s\\S]*?)(?:;|\\})`))
  if (!m) continue
  const consts = [...m[1].matchAll(/\b([A-Z][A-Z_0-9]*)\s*(?:\(|,|;|\})/g)].map((x) => x[1])
  if (consts.length) enumConsts.set(name, new Set(consts))
}

const checkRows = psql(`
  select rel.relname, pg_get_constraintdef(con.oid)
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname='public' and con.contype='c'`)

const dbAllowed = new Map()   // "table.column" → Set(values)
for (const [table, def] of checkRows) {
  const col = def.match(/\(\((\w+)\)::text = ANY/)?.[1]
  if (!col) continue
  const vals = allowedValues(def)
  if (vals.size) dbAllowed.set(`${table}.${col}`, vals)
}

const snake = (s) => s.replace(/(?<!^)(?=[A-Z])/g, '_').toLowerCase()
const mismatches = []
let compared = 0
for (const [, src] of byName) {
  const table = src.match(/@Table\s*\(\s*name\s*=\s*"(\w+)"/)?.[1]
  if (!table) continue
  const fields = src.matchAll(
    /@Enumerated\s*\(\s*EnumType\.STRING\s*\)([\s\S]{0,400}?)private\s+(\w+)\s+(\w+)\s*;/g)
  for (const [, between, etype, field] of fields) {
    const col = between.match(/@Column\s*\([^)]*name\s*=\s*"(\w+)"/)?.[1] ?? snake(field)
    const key = `${table}.${col}`
    const dbVals = dbAllowed.get(key)
    const javaVals = enumConsts.get(etype)
    if (!dbVals || !javaVals) continue
    compared++
    const blocked = [...javaVals].filter((v) => !dbVals.has(v)).sort()
    const stale = [...dbVals].filter((v) => !javaVals.has(v)).sort()
    if (blocked.length) mismatches.push(`${key}(${etype}) 저장하면 23514: ${blocked.join(', ')}`)
    if (stale.length) mismatches.push(`${key}(${etype}) 자바에 없는 DB 값: ${stale.join(', ')}`)
  }
}
eq(`CHECK 걸린 enum 컬럼 ${compared}개가 자바 enum 과 일치`,
  mismatches.join(' / ') || '없음', '없음')

// ── 2) 본사 vs 회사 스키마 ─────────────────────────────────────────────────
console.log('\n■ 본사(public) ↔ 회사 스키마')

const tenants = psql(`
  select nspname from pg_namespace where nspname like 'co\\_%' order by 1`).map((r) => r[0])

if (!tenants.length) {
  console.log('  (회사 스키마가 없어 건너뜀)')
} else {
  for (const t of tenants) {
    // 테넌트에 없는 테이블. companies 는 테넌트 레지스트리라 본사에만 있는 게 정상이다.
    const missingTables = psql(`
      select table_name from information_schema.tables where table_schema='public'
      except select table_name from information_schema.tables where table_schema='${t}'`)
      .map((r) => r[0]).filter((x) => x !== 'companies')
    eq(`${t}: 빠진 테이블 없음`, missingTables.join(', ') || '없음', '없음')

    const missingCols = psql(`
      select p.table_name || '.' || p.column_name
      from information_schema.columns p
      left join information_schema.columns c
        on c.table_schema='${t}' and c.table_name=p.table_name and c.column_name=p.column_name
      where p.table_schema='public' and c.column_name is null
        and p.table_name in (select table_name from information_schema.tables where table_schema='${t}')`)
      .map((r) => r[0])
    eq(`${t}: 빠진 컬럼 없음`, missingCols.join(', ') || '없음', '없음')

    // CHECK 은 표기가 스키마마다 달라서(인라인 CHECK vs ALTER ADD) 정의 문자열이 아니라 허용값을 본다.
    const rows = psql(`
      with c as (
        select n.nspname as schema, rel.relname as tbl, con.conname as name,
               pg_get_constraintdef(con.oid) as def
        from pg_constraint con
        join pg_class rel on rel.oid=con.conrelid
        join pg_namespace n on n.oid=rel.relnamespace
        where n.nspname in ('public','${t}') and con.contype='c'
      )
      select p.tbl, p.name, p.def, coalesce(x.def, '')
      from c p left join c x on x.schema='${t}' and x.tbl=p.tbl and x.name=p.name
      where p.schema='public'
        and p.tbl in (select table_name from information_schema.tables where table_schema='${t}')`)

    const bad = []
    for (const [tbl, name, pdef, tdef] of rows) {
      if (!tdef) { bad.push(`${tbl}.${name} 없음`); continue }
      const a = allowedValues(pdef)
      const b = allowedValues(tdef)
      if (a.size !== b.size || [...a].some((v) => !b.has(v))) {
        bad.push(`${tbl}.${name} 허용값 다름`)
      }
    }
    eq(`${t}: CHECK 제약 허용값 일치`, bad.join(', ') || '없음', '없음')
  }
}

console.log('\n' + '─'.repeat(50))
console.log(`통과 ${pass} · 실패 ${fail}`)
if (fail) {
  console.log('\n어긋난 곳이 있습니다. enum 을 늘렸다면 db/migration 과 db/tenant 양쪽에')
  console.log('CHECK 제약 마이그레이션을 넣었는지 확인하세요 (CLAUDE.md §7.4).')
  process.exit(1)
}
console.log('전부 일치합니다.')

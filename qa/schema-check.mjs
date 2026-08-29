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
 *  3) 장부 정합성 — 재고 잔량 = 재고이동 합, 회계전표 대차평형
 *     어긋나도 아무도 안 알려 준다. 화면은 멀쩡히 숫자를 보여 주고,
 *     보통 재고를 세어 보거나 결산이 안 맞을 때야 알아챈다.
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

/**
 * 열 구분자. 눈에 보이지 않는 제어문자(SOH)를 쓴다 — 자료에 절대 안 나오는 값이라야
 * 이름·정의 문자열에 파이프나 쉼표가 들어 있어도 열이 안 밀린다.
 * 소스에 리터럴로 박아 두면 편집기에서 빈 문자열처럼 보여서, 다음 사람이 '고치다가'
 * split('') 로 만들어 버린다(그러면 글자 단위로 쪼개진다). 그래서 이스케이프로 적는다.
 */
const SEP = '\x01'

const psql = (sql) => execFileSync(
  'docker', ['exec', CONTAINER, 'psql', '-U', 'erp', '-d', 'erp', '-t', '-A', '-F', SEP, '-c', sql],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
).split('\n').filter((l) => l.trim()).map((l) => l.split(SEP))

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

    /*
     * <b>있는 것만 세지 말고 같은 모양인지도 본다.</b> 여태 빠진 표·컬럼·CHECK 만 봤는데,
     * 그것만으로는 조용히 갈라지는 것을 못 잡는다.
     *
     * <ul>
     *   <li>같은 이름인데 <b>자리 수가 다르면</b>(varchar(50) vs varchar(20)) 회사에서만
     *       글자가 잘리거나 22001 로 터진다.</li>
     *   <li><b>NOT NULL 이 한쪽에만</b> 있으면 회사에는 빈 값이 들어가고, 그 줄을 읽는
     *       화면이 나중에 터진다.</li>
     *   <li><b>외래키가 빠지면</b> 지운 자료를 가리키는 줄이 남고, <b>인덱스가 빠지면</b>
     *       같은 화면이 그 회사에서만 느려진다. 둘 다 기동해서는 아무 티가 안 난다.</li>
     * </ul>
     *
     * <p>{@code companies} 는 회사 레지스트리라 본사에만 있는 것이 정상이다 — 그 표에
     *  딸린 인덱스·제약도 같이 뺀다.
     */
    const 모양다름 = psql(`
      select p.table_name || '.' || p.column_name || ': 본사 ' ||
             p.data_type || coalesce('(' || p.character_maximum_length || ')', '') ||
             case when p.is_nullable='NO' then ' NOT NULL' else '' end ||
             ' · 회사 ' ||
             t.data_type || coalesce('(' || t.character_maximum_length || ')', '') ||
             case when t.is_nullable='NO' then ' NOT NULL' else '' end
      from information_schema.columns p
      join information_schema.columns t
        on t.table_schema='${t}' and t.table_name=p.table_name and t.column_name=p.column_name
      where p.table_schema='public'
        and (p.data_type is distinct from t.data_type
          or p.character_maximum_length is distinct from t.character_maximum_length
          or p.numeric_precision is distinct from t.numeric_precision
          or p.numeric_scale is distinct from t.numeric_scale
          or p.is_nullable is distinct from t.is_nullable)`).map((r) => r[0])
    eq(`${t}: 컬럼 자료형·NOT NULL 이 본사와 같다`, 모양다름.join(' / ') || '없음', '없음')

    const 없는제약 = psql(`
      select c.conrelid::regclass::text || '.' || c.conname
      from pg_constraint c
      where c.connamespace='public'::regnamespace
        and c.conrelid::regclass::text <> 'companies'
        and c.conrelid::regclass::text in (
              select table_name from information_schema.tables where table_schema='${t}')
        and not exists (select 1 from pg_constraint x
                        where x.connamespace='${t}'::regnamespace and x.conname=c.conname)`)
      .map((r) => r[0])
    eq(`${t}: 제약(외래키·유일·기본키)이 본사와 같다`, 없는제약.join(' / ') || '없음', '없음')

    const 없는인덱스 = psql(`
      select p.tablename || '.' || p.indexname
      from pg_indexes p
      where p.schemaname='public' and p.tablename <> 'companies'
        and p.tablename in (select table_name from information_schema.tables where table_schema='${t}')
        and not exists (select 1 from pg_indexes x
                        where x.schemaname='${t}' and x.tablename=p.tablename and x.indexname=p.indexname)`)
      .map((r) => r[0])
    eq(`${t}: 인덱스가 본사와 같다`, 없는인덱스.join(' / ') || '없음', '없음')


    /*
     * 표만 만들고 <b>기준자료를 안 넣은</b> 경우.
     *
     * 결재 양식 22종은 V13 이 심는데 그 INSERT 가 `INSERT INTO public.…` 로 스키마를
     * 박아 넣고 있었다. 테넌트 baseline 은 표만 만든다. 그래서 회사를 새로 만들면
     * 기안서작성의 양식 목록이 통째로 비어 결재를 시작할 수조차 없었다.
     * 앱은 멀쩡히 뜨고 그 회사로 로그인해 그 화면을 열어야만 알 수 있는 종류다.
     */
    for (const tbl of ['approval_form_templates', 'accounts']) {
      const [[pub]] = psql(`select count(*) from public.${tbl}`)
      const [[ten]] = psql(`select count(*) from ${t}.${tbl}`)
      eq(`${t}: ${tbl} 기준자료가 비어 있지 않다`, Number(ten) > 0, true)
      if (Number(ten) === 0) console.log(`     본사 ${pub}건, ${t} ${ten}건`)
    }
  }
}

// ── 3) 장부 정합성 ────────────────────────────────────────────────────────
console.log('\n■ 장부 정합성')

/**
 * 이 둘은 어긋나도 아무도 안 알려 준다. 화면은 멀쩡히 숫자를 보여 주고,
 * 어긋난 걸 알아채는 건 보통 재고를 세어 보거나 결산이 안 맞을 때다.
 */
for (const schema of ['public', ...tenants]) {
  // 잔량 = 그 품목·창고의 재고이동 합. 한쪽만 갱신하는 코드가 생기면 여기서 갈린다.
  const drift = psql(`
    with tx as (
      select item_id, warehouse_id, sum(quantity_change) as moved
      from ${schema}.stock_transactions group by item_id, warehouse_id
    )
    select coalesce(s.item_id, tx.item_id) || '/' || coalesce(s.warehouse_id, tx.warehouse_id)
           || ': 잔량 ' || coalesce(s.quantity,0) || ' vs 이동합 ' || coalesce(tx.moved,0)
    from ${schema}.stocks s
    full outer join tx on tx.item_id = s.item_id and tx.warehouse_id = s.warehouse_id
    where coalesce(s.quantity,0) <> coalesce(tx.moved,0)`).map((r) => r[0])
  eq(`${schema}: 재고 잔량 = 재고이동 합`, drift.join(' / ') || '없음', '없음')

  // 대차평형. 한쪽만 쓰는 분개가 끼면 시산표가 영영 안 맞는다.
  const unbalanced = psql(`
    select je.doc_no || ': 차변 ' || sum(l.debit) || ' vs 대변 ' || sum(l.credit)
    from ${schema}.journal_entries je join ${schema}.journal_lines l on l.entry_id = je.id
    group by je.id, je.doc_no having sum(l.debit) <> sum(l.credit)`).map((r) => r[0])
  eq(`${schema}: 회계전표 대차평형`, unbalanced.join(' / ') || '없음', '없음')

  // 라인이 없는 전표는 금액이 0 인 유령이다.
  const empty = psql(`
    select je.doc_no from ${schema}.journal_entries je
    where not exists (select 1 from ${schema}.journal_lines l where l.entry_id = je.id)`).map((r) => r[0])
  eq(`${schema}: 라인 없는 회계전표 없음`, empty.join(', ') || '없음', '없음')

  /*
   * <b>전표 머리에 찍힌 돈이 줄의 합과 같은가.</b>
   *
   * <p>화면은 머리의 합계를 크게 보여 주고 줄은 아래에 늘어놓는다. 둘이 갈라지면
   * 보는 사람은 <b>어느 쪽을 믿을지 고를 수가 없다</b> — 게다가 채권·매출현황·부가세는
   * 머리를 더하고, 품목별 이익은 줄을 더해서, 같은 달을 보는 화면 둘이 다른 숫자를 낸다.
   *
   * <p>줄만 고치고 머리를 다시 안 더하는 코드가 하나만 생겨도 이렇게 갈라진다.
   * 지금은 다섯 전표 모두 맞다 — 맞는 지금을 못 박아 둔다.
   */
  const 머리줄 = [
    ['판매', 'sales', 'sales_lines', 'sales_id', 'quantity*unit_price'],
    ['구매', 'purchases', 'purchase_lines', 'purchase_id', 'quantity*unit_price'],
    ['견적', 'quotations', 'quotation_lines', 'quotation_id', 'quantity*unit_price'],
    ['수주', 'sales_orders', 'sales_order_lines', 'sales_order_id', 'quantity*unit_price'],
    ['발주', 'purchase_orders', 'purchase_order_lines', 'purchase_order_id', 'supply_amount'],
  ]
  for (const [이름, 머리, 줄, 키, 식] of 머리줄) {
    const 갈린것 = psql(`
      select h.id || ': 머리 ' || coalesce(h.supply_amount,0) || ' vs 줄합 ' ||
             coalesce((select sum(${식}) from ${schema}.${줄} l where l.${키}=h.id),0)
      from ${schema}.${머리} h
      where abs(coalesce(h.supply_amount,0)
            - coalesce((select sum(${식}) from ${schema}.${줄} l where l.${키}=h.id),0)) > 1
      limit 5`).map((r) => r[0])
    eq(`${schema}: ${이름} 머리 공급가액 = 줄의 합`, 갈린것.join(' / ') || '없음', '없음')
  }

  /* 합계 = 공급가액 + 부가세. 세액만 따로 고치면 여기서 갈린다. */
  for (const [이름, 표] of [['판매', 'sales'], ['구매', 'purchases']]) {
    const 갈린것 = psql(`
      select id || ': 합계 ' || coalesce(total_amount,0) || ' vs ' ||
             coalesce(supply_amount,0) || '+' || coalesce(vat_amount,0)
      from ${schema}.${표}
      where abs(coalesce(total_amount,0) - (coalesce(supply_amount,0)+coalesce(vat_amount,0))) > 1
      limit 5`).map((r) => r[0])
    eq(`${schema}: ${이름} 합계 = 공급가액 + 부가세`, 갈린것.join(' / ') || '없음', '없음')
  }

  /*
   * <b>수량이 제 상한을 넘지 않았나.</b> 넘은 줄이 하나 있으면 미출하·잔여수량이
   * 음수가 되어, 그 화면이 '아직 덜 나갔다'와 '더 나갔다'를 구분 못 한다.
   */
  const 상한 = [
    ['수주 줄의 출하수량 ≤ 주문수량', 'sales_order_lines', 'coalesce(shipped_qty,0) > quantity'],
    ['작업지시 기생산 ≤ 지시수량', 'work_orders', 'coalesce(produced_qty,0) > planned_qty'],
    ['재고 잔량이 음수가 아니다', 'stocks', 'quantity < 0'],
  ]
  for (const [이름, 표, 조건] of 상한) {
    const 넘은것 = psql(`select id from ${schema}.${표} where ${조건} limit 5`).map((r) => r[0])
    eq(`${schema}: ${이름}`, 넘은것.join(', ') || '없음', '없음')
  }

  /*
   * <b>줄이 하나도 없는 전표.</b> 목록에는 뜨는데 열면 빈 표가 나오고, 합계는 0 이라
   * 매출에도 안 잡힌다. 지우다 만 것인지 처음부터 잘못 만든 것인지도 알 수 없다.
   */
  const 빈전표 = psql(`
    select t || ' ' || c from (
      select 'sales' t, count(*) c from ${schema}.sales h
        where not exists (select 1 from ${schema}.sales_lines l where l.sales_id=h.id)
      union all select 'purchases', count(*) from ${schema}.purchases h
        where not exists (select 1 from ${schema}.purchase_lines l where l.purchase_id=h.id)
      union all select 'quotations', count(*) from ${schema}.quotations h
        where not exists (select 1 from ${schema}.quotation_lines l where l.quotation_id=h.id)
      union all select 'sales_orders', count(*) from ${schema}.sales_orders h
        where not exists (select 1 from ${schema}.sales_order_lines l where l.sales_order_id=h.id)
      union all select 'purchase_orders', count(*) from ${schema}.purchase_orders h
        where not exists (select 1 from ${schema}.purchase_order_lines l where l.purchase_order_id=h.id)
    ) x where c > 0`).map((r) => r[0])
  eq(`${schema}: 줄이 하나도 없는 전표가 없다`, 빈전표.join(' / ') || '없음', '없음')

  /* 급여명세: 실지급 = 기본급 + 수당 − 공제, 그리고 그 수당·공제가 줄의 합과 같은가. */
  const 급여 = psql(`
    select id || ': 실지급 ' || coalesce(net_pay,0) || ' vs ' || coalesce(base_salary,0)
           || '+' || coalesce(allowance_total,0) || '-' || coalesce(deduction_total,0)
    from ${schema}.payslips
    where abs(coalesce(net_pay,0)
          - (coalesce(base_salary,0)+coalesce(allowance_total,0)-coalesce(deduction_total,0))) > 1
    limit 5`).map((r) => r[0])
  eq(`${schema}: 급여 실지급 = 기본급 + 수당 − 공제`, 급여.join(' / ') || '없음', '없음')
  for (const [이름, 칸, 갈래] of [['수당', 'allowance_total', 'ALLOWANCE'], ['공제', 'deduction_total', 'DEDUCTION']]) {
    const 갈린것 = psql(`
      select p.id from ${schema}.payslips p
      where abs(coalesce(p.${칸},0) - coalesce((select sum(l.amount) from ${schema}.payslip_lines l
            where l.payslip_id=p.id and l.kind='${갈래}'),0)) > 1
      limit 5`).map((r) => r[0])
    eq(`${schema}: 급여 ${이름}합계 = ${이름}줄의 합`, 갈린것.join(', ') || '없음', '없음')
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

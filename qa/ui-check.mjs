#!/usr/bin/env node
/**
 * 화면 정적 검사 — 타입체크가 통과시키는데 화면에서 어긋나는 것들.
 *
 *   node qa/ui-check.mjs
 *
 *  1) 표의 헤더 열 수 vs 합계행(tfoot) 열 수
 *     합계행 colSpan 을 잘못 잡으면 합계 칸이 밀려서 엉뚱한 열 아래 붙는다.
 *     타입체크는 아무 말도 안 한다. 이 저장소에서 가장 자주 낸 실수라 못 박아 둔다.
 *
 *  2) 메뉴가 가리키는 경로 vs 실제 라우트
 *     메뉴에만 있으면 눌렀을 때 빈 화면이 뜨고, 라우트에만 있으면 메뉴로 닿을 수 없다
 *     (실제로 채권/채무현황의 채무 쪽이 라우트 없이 화면만 있었다).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

let pass = 0
let fail = 0
const eq = (label, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`  ${ok ? '✅' : '❌'} ${label}`)
  if (!ok) String(actual).split('\n').forEach((l) => console.log(`     ${l}`))
  ok ? pass++ : fail++
}

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

// ── 1) 표 열 수 ────────────────────────────────────────────────────────────
console.log('\n■ 표 헤더 ↔ 합계행 열 수')

/** colSpan 을 반영해 센다. colSpan={표현식} 이면 정적으로 못 세므로 null. */
const countCells = (row, tag) => {
  let total = 0
  for (const m of row.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))) {
    const attrs = m[1]
    const fixed = attrs.match(/colSpan=\{(\d+)\}/)
    if (fixed) total += Number(fixed[1])
    else if (attrs.includes('colSpan')) return null
    else total += 1
  }
  return total
}
const firstRow = (block) => block.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/)?.[1] ?? null
// 조건부 열이 섞인 표는 셀 수가 상황마다 달라 정적으로 셀 수 없다.
const hasConditionalCell = (block) => /\{[^{}]*(?:&&|\?)[^{}]*<t[hd]\b/s.test(block)

const mismatches = []
let compared = 0
let skipped = 0
for (const f of walk('frontend/src/pages').filter((x) => x.endsWith('.tsx'))) {
  const src = readFileSync(f, 'utf8')
  for (const tm of src.matchAll(/<table\b[\s\S]*?<\/table>/g)) {
    const t = tm[0]
    const head = t.match(/<thead\b[\s\S]*?<\/thead>/)?.[0]
    const foot = t.match(/<tfoot\b[\s\S]*?<\/tfoot>/)?.[0]
    if (!head || !foot) continue
    if (hasConditionalCell(head) || hasConditionalCell(foot)) { skipped++; continue }
    const hRow = firstRow(head)
    const fRow = firstRow(foot)
    if (!hRow || !fRow) { skipped++; continue }
    const hc = countCells(hRow, 'th')
    const fc = countCells(fRow, 'td')
    if (hc === null || fc === null || !hc || !fc) { skipped++; continue }
    compared++
    if (hc !== fc) {
      const line = src.slice(0, tm.index).split('\n').length
      mismatches.push(`${f.split(sep).pop()}:${line}  헤더 ${hc}칸 vs 합계행 ${fc}칸`)
    }
  }
}
eq(`표 ${compared}개의 헤더와 합계행 열 수가 같다 (조건부 열 ${skipped}개는 정적으로 셀 수 없어 건너뜀)`,
  mismatches.join('\n') || '없음', '없음')

// ── 1-b) 조건부 열 표의 런타임 검사 ────────────────────────────────────────
console.log('\n■ 조건부 열 표의 개발 모드 검사')

/**
 * 위 정적 검사는 조건부 열(&&, ?:)이 섞인 표를 셀 수 없어 건너뛴다.
 * 그 표들은 useTableColumnCheck 훅이 렌더된 DOM 을 직접 재서 잡는데,
 * <b>훅만 부르고 ref 를 요소에 안 달면 조용히 아무것도 안 한다</b> — 실제로 그렇게 넣었다가 고쳤다.
 * 훅을 쓰는 화면은 ref 가 실제로 달려 있어야 한다.
 */
{
  const pages = walk('frontend/src/pages').filter((f) => f.endsWith('.tsx'))
  const bad = []
  let hooked = 0
  for (const f of pages) {
    const src = readFileSync(f, 'utf8')
    const call = src.match(/useTableColumnCheck\(\s*(\w+)/)
    if (!call) continue
    hooked++
    if (!new RegExp(`ref=\\{${call[1]}\\}`).test(src)) {
      bad.push(`${f.split(sep).pop()}: ${call[1]} 를 요소에 안 달았다`)
    }
  }
  eq(`훅을 쓰는 화면 ${hooked}개가 ref 를 요소에 달았다`, bad.join('\n') || '없음', '없음')
}

// ── 2) 메뉴 ↔ 라우트 ───────────────────────────────────────────────────────
console.log('\n■ 메뉴 ↔ 라우트')

const app = readFileSync('frontend/src/App.tsx', 'utf8')
const menu = readFileSync('frontend/src/components/EcountLayout.tsx', 'utf8')

const routes = new Set([...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]))
const menuTargets = new Map()
for (const m of menu.matchAll(/label: '([^']+)'[^}]*?to: '([^']+)'/g)) {
  const path = m[2].split('?')[0]
  menuTargets.set(path, [...(menuTargets.get(path) ?? []), m[1]])
}

/** /a/:id 같은 동적 세그먼트도 맞다고 본다. */
const matches = (path) => {
  if (routes.has(path)) return true
  for (const r of routes) {
    if (!r.includes(':')) continue
    const rp = r.replace(/^\//, '').split('/')
    const pp = path.replace(/^\//, '').split('/')
    if (rp.length === pp.length && rp.every((a, i) => a.startsWith(':') || a === pp[i])) return true
  }
  return false
}

const dead = [...menuTargets.keys()].filter((p) => !matches(p)).sort()
eq('메뉴가 가리키는 경로에 라우트가 다 있다',
  dead.map((p) => `${p}  (${menuTargets.get(p).join(', ')})`).join('\n') || '없음', '없음')

// ── 3) 메뉴 그룹 ↔ 권한 ────────────────────────────────────────────────────
console.log('\n■ 같은 메뉴 그룹은 같은 권한')

/**
 * 한 메뉴 그룹(재고현황·영업관리현황 …) 안의 화면들은 같은 권한으로 묶여야 한다.
 * 하나만 다른 바구니에 들어가면 메뉴가 사람마다 들쭉날쭉해진다 —
 * STOCK_MOVE 만 가진 사람에게 재고현황은 보이는데 창고별재고현황은 안 보이는 식이다.
 *
 * 실제로 새로 만든 재고현황 8개가 접두어 규칙에 걸려 INV_MASTER 로 새고 있었다.
 */
{
  const menuSrc = readFileSync('frontend/src/components/EcountLayout.tsx', 'utf8')
  const permSrc = readFileSync('frontend/src/auth/menuPermissions.ts', 'utf8')

  // menuPermissions 의 규칙을 그대로 읽어 같은 방식(최장 접두어)으로 푼다.
  const rules = [...permSrc.matchAll(/\['(\/[^']*)',\s*(?:'(\w+)'|null)\]/g)]
    .map((m) => [m[1], m[2] ?? null])
  const permFor = (path) => {
    let best = null
    for (const [prefix, code] of rules) {
      if (prefix === '/') continue
      if (path === prefix || path.startsWith(prefix + '/')) {
        if (!best || prefix.length > best[0].length) best = [prefix, code]
      }
    }
    return best ? best[1] : null
  }

  // children 배열을 가진 그룹을 통째로 떠서 그 안의 to: 들을 모은다.
  const groups = []
  for (const m of menuSrc.matchAll(/label: '([^']+)',\s*\n?\s*children: \[([\s\S]*?)\n(\s*)\],/g)) {
    const paths = [...m[2].matchAll(/to: '([^']+)'/g)].map((x) => x[1].split('?')[0])
    if (paths.length > 1) groups.push([m[1], paths])
  }

  /**
   * 섞여도 되는 그룹. 성격이 다른 화면을 한 묶음에 둔 것이라 권한도 갈리는 게 맞다.
   * 늘릴 때는 <b>왜 섞이는지</b> 한 줄로 적는다 — 적을 말이 없으면 그건 새는 것이다.
   */
  const MIXED_BY_DESIGN = new Map([
    ['판매일괄회계반영', '회계반영 화면이라 ACCOUNTING 이 섞인다'],
    ['영업관리현황', '회계미반영현황(판매)만 ACCOUNTING'],
    ['구매관리현황', '채무 화면이 /sales 경로를 쓰고, 회계미반영현황은 ACCOUNTING'],
    ['기타이동현황', '불량률파악보고서만 QUALITY'],
    ['기타', '거래이력·집계표·경영자보고서를 모아 둔 잡동사니 묶음'],
    ['일별이익', '일별재고현황(STOCK_MOVE)과 일별이익현황(PROFIT)을 나란히 둔다'],
    ['기본사항등록', '회계 기초와 인사 기초가 같은 이름을 쓴다 — 각자 제 권한'],
    ['출/퇴근(사원)', '근태(HR)와 그룹웨어 화면이 섞인다'],
    ['출/퇴근', '위와 같다'],
    ['조직도관리', '사원(HR)과 조직도·연락처(GROUPWARE)가 섞인다'],
  ])

  const mixed = []
  for (const [name, paths] of groups) {
    const byPerm = new Map()
    for (const p of paths) {
      const code = permFor(p) ?? '(권한없음)'
      byPerm.set(code, [...(byPerm.get(code) ?? []), p])
    }
    if (byPerm.size > 1 && !MIXED_BY_DESIGN.has(name)) {
      const detail = [...byPerm.entries()]
        .map(([c, ps]) => `${c}(${ps.join(', ')})`).join(' / ')
      mixed.push(`${name} — ${detail}`)
    }
  }
  eq(`메뉴 그룹 ${groups.length}개 중 섞인 것은 이유가 적힌 ${MIXED_BY_DESIGN.size}개뿐`,
    mixed.join('\n') || '없음', '없음')
}

console.log('\n' + '─'.repeat(50))
console.log(`통과 ${pass} · 실패 ${fail}`)
if (fail) process.exit(1)
console.log('전부 통과했습니다.')

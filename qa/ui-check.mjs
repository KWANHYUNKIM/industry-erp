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

console.log('\n' + '─'.repeat(50))
console.log(`통과 ${pass} · 실패 ${fail}`)
if (fail) process.exit(1)
console.log('전부 통과했습니다.')

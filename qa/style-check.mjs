#!/usr/bin/env node
/**
 * 화면 디자인 래칫 — 화면 코드(.tsx)에 직접 쓴 디자인이 <b>늘지 않게</b> 막는다. 서버 없이 돈다.
 *
 *   node qa/style-check.mjs            검사
 *   node qa/style-check.mjs --update   지금 개수를 기준(qa/style-baseline.json)으로 적는다
 *
 * 색·크기·둥글기의 단일 출처는 frontend/src/styles/tokens.css 다(CLAUDE.md 10.1). 화면은 클래스(.ec-btn …)를
 * 붙이거나, 꼭 인라인이어야 하면 var(--ec-…) 토큰을 쓴다. 2026-10-03 에 재 보니 인라인 style 이 13,161곳,
 * 색 값을 그대로 쓴 곳이 5,295곳이었다 — 원본이 버튼을 h28 → h26 으로 바꿨을 때 이 자리들은 하나도 따라가지 않았다.
 * 한꺼번에 고치기엔 크다. 그래서 파일마다 지금 개수를 적어 두고(기준),
 *   - 기준보다 <b>늘면</b> 실패 — 새 화면·새 코드는 규칙대로 쓴다(새 파일의 기준은 0).
 *   - 기준보다 <b>줄면</b>도 실패 — `--update` 로 기준을 조이라고 알려 준다(arch-check 의 KNOWN 과 같은 방식).
 *     안 조이면 다른 곳에서 다시 늘려도 검사가 모른다.
 *
 * 세는 것
 *   inline  style={…} 의 개수. var(--ec-…) 만 쓴 인라인도 센다 — 반복되면 클래스로 빼라는 뜻이다.
 *   color   색 값을 그대로 쓴 개수: #fff · #1f48d4 · rgb( · rgba( (토큰 var(--ec-…) 는 세지 않는다)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../frontend/src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const BASELINE = new URL('./style-baseline.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const walk = (d) => readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))

const COLOR = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b|\brgba?\(/g
const INLINE = /\bstyle=\{/g

const now = {}
for (const f of walk(ROOT).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))) {
  const src = readFileSync(f, 'utf8')
  const inline = (src.match(INLINE) ?? []).length
  const color = (src.match(COLOR) ?? []).length
  if (inline || color) now[relative(ROOT, f).replaceAll('\\', '/')] = { inline, color }
}
const total = (m, k) => Object.values(m).reduce((n, x) => n + x[k], 0)

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(Object.entries(now).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 1) + '\n')
  console.log(`기준을 적었다: inline ${total(now, 'inline')} · color ${total(now, 'color')} (${Object.keys(now).length}개 파일)`)
  process.exit(0)
}
if (!existsSync(BASELINE)) {
  console.log('기준 파일이 없다 — node qa/style-check.mjs --update')
  process.exit(1)
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'))

const grew = [], shrank = []
for (const file of new Set([...Object.keys(now), ...Object.keys(base)])) {
  for (const k of ['inline', 'color']) {
    const a = base[file]?.[k] ?? 0, b = now[file]?.[k] ?? 0
    if (b > a) grew.push(`${file} ${k} ${a} → ${b}`)
    else if (b < a) shrank.push(`${file} ${k} ${a} → ${b}`)
  }
}

console.log('■ 화면 코드에 직접 쓴 디자인 (CLAUDE.md 10.1)')
console.log(`  inline ${total(base, 'inline')} → ${total(now, 'inline')} · color ${total(base, 'color')} → ${total(now, 'color')}`)
for (const g of grew) console.log(`  ❌ 늘었다: ${g} — 클래스(styles/*.css)나 var(--ec-…) 토큰을 쓰세요`)
if (shrank.length) {
  for (const s of shrank.slice(0, 10)) console.log(`  ❌ 줄었다: ${s}`)
  if (shrank.length > 10) console.log(`  … 외 ${shrank.length - 10}곳`)
  console.log('  줄인 만큼 기준을 조이세요 — node qa/style-check.mjs --update')
}
const fail = grew.length + shrank.length
console.log(fail ? `\n실패 ${fail}` : '\n기준과 같다')
process.exit(fail ? 1 : 0)

#!/usr/bin/env node
/**
 * 화면 모양 회귀 시험 — 라우트마다 모든 요소의 <b>계산된 스타일</b>을 떠 두고, 고치고 나서 다시 떠 비교한다.
 * 픽셀이 아니라 getComputedStyle 값을 견주므로 그림 라이브러리 없이 돌고, 어느 요소의 무엇이 바뀌었는지 바로 나온다.
 * 앱이 떠 있어야 한다(백엔드 8081 · 프론트 5180).
 *
 *   node qa/style-snapshot.mjs save <폴더> [접두사]     예: save /tmp/before sales
 *   node qa/style-snapshot.mjs diff <전 폴더> <후 폴더>
 *
 * 왜: 인라인 style 을 클래스로 옮기면 모양이 그대로여야 한다. 그런데 인라인은 CSS 규칙을 이기고
 * Tailwind 클래스는 우리 CSS 규칙(층 밖)에 진다 — 옮긴 자리 일부가 <b>조용히</b> 달라질 수 있다.
 * 타입체크도 화면 점검도 그건 못 본다. 큰 회사들이 시각 회귀 시험(Chromatic·Percy)으로 막는 그것이다.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [, , cmd, a, b] = process.argv
const PROPS = ['color', 'background-color', 'font-size', 'font-weight', 'font-family', 'font-style', 'text-align',
  'text-decoration-line', 'white-space', 'vertical-align', 'display', 'position', 'cursor', 'opacity',
  'width', 'height', 'min-width', 'max-width',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-top-width', 'border-top-color', 'border-bottom-width', 'border-bottom-color',
  'border-left-width', 'border-right-width', 'border-top-left-radius',
  'align-items', 'justify-content', 'gap', 'flex-grow', 'flex-direction', 'flex-wrap', 'overflow-x', 'line-height']

const file = (r) => (r.replace(/^\//, '').replace(/\//g, '__') || 'home') + '.json'

if (cmd === 'save') {
  const { openBrowser } = await import('./browser.mjs')
  const prefix = b ? '/' + b.replace(/^\//, '') : ''
  const router = readFileSync(new URL('../frontend/src/app/router.tsx', import.meta.url), 'utf8')
  const routes = [...new Set([...router.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
    .filter((r) => !r.includes(':') && !r.includes('*') && r !== '/login' && r.startsWith(prefix))
  if (!prefix) routes.unshift('/')
  mkdirSync(a, { recursive: true })
  const br = await openBrowser({ port: Number(process.env.CDP_PORT ?? 9341), width: 1600, height: 900 })
  let n = 0
  for (const r of routes) {
    if (existsSync(join(a, file(r)))) { n++; continue }   // 끊겼다 다시 돌리면 이어서 뜬다
    try {
      await br.goto(r, 1200)
      const snap = await br.evaluate(`(() => {
        const P = ${JSON.stringify(PROPS)}, out = {}
        const key = (el) => { const p = []; for (let e = el; e && e.id !== 'root'; e = e.parentElement) {
          let i = 1; for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i++
          p.unshift(e.tagName.toLowerCase() + i) } return p.join('>') }
        for (const el of document.querySelectorAll('#root *')) {
          if (el.closest('svg')) continue
          const s = getComputedStyle(el); out[key(el)] = P.map((p) => s.getPropertyValue(p)).join('|')
        }
        return out })()`)
      writeFileSync(join(a, file(r)), JSON.stringify(snap))
      n++
    } catch (e) {
      console.log('  ⚠', r, e.message.slice(0, 80))
      if (/WebSocket|closed|ECONNREFUSED/i.test(e.message)) break
    }
  }
  await br.close()
  console.log(`${n}/${routes.length} 화면을 떴다 → ${a}`)
  process.exit(0)
}

if (cmd === 'diff') {
  let changed = 0, screens = 0
  const byProp = {}
  for (const f of readdirSync(a).filter((x) => x.endsWith('.json'))) {
    if (!existsSync(join(b, f))) { console.log('  ⚠ 후에 없음', f); continue }
    const A = JSON.parse(readFileSync(join(a, f), 'utf8')), B = JSON.parse(readFileSync(join(b, f), 'utf8'))
    const lines = []
    for (const k of Object.keys(A)) {
      if (!(k in B)) continue
      if (A[k] === B[k]) continue
      const x = A[k].split('|'), y = B[k].split('|')
      const d = PROPS.map((p, i) => (x[i] !== y[i] ? `${p}: ${x[i]} → ${y[i]}` : null)).filter(Boolean)
      for (const p of PROPS.filter((_, i) => x[i] !== y[i])) byProp[p] = (byProp[p] ?? 0) + 1
      lines.push(`    ${k.split('>').slice(-3).join('>')}  ${d.join(' · ')}`)
    }
    const missing = Object.keys(A).filter((k) => !(k in B)).length
    if (lines.length || missing) {
      screens++; changed += lines.length
      console.log(`■ ${f.replace(/\.json$/, '')}  — 바뀐 요소 ${lines.length}${missing ? ` · 사라진 요소 ${missing}` : ''}`)
      lines.slice(0, 8).forEach((l) => console.log(l))
      if (lines.length > 8) console.log(`    … 외 ${lines.length - 8}`)
    }
  }
  console.log(`\n바뀐 화면 ${screens} · 바뀐 요소 ${changed}`)
  console.log('속성별:', Object.entries(byProp).sort((x, y) => y[1] - x[1]).map(([p, c]) => `${p} ${c}`).join(' · ') || '없음')
  process.exit(changed ? 1 : 0)
}
console.log('사용법: node qa/style-snapshot.mjs save <폴더> [접두사] | diff <전> <후>')
process.exit(2)

#!/usr/bin/env node
/**
 * 휴대폰 화면 점검 — 라우트마다 폭 375(휴대폰)로 열어 <b>화면 밖으로 삐져나간 것</b>을 찾는다.
 * 앱이 떠 있어야 한다(백엔드 8081 · 프론트 5180).
 *
 *   node qa/mobile-check.mjs              전부(약 25분)
 *   node qa/mobile-check.mjs sales        접두사(/sales)만
 *   WIDTH=768 node qa/mobile-check.mjs    태블릿 폭으로
 *   ROUTES=/sales/sell,/sales/buy node qa/mobile-check.mjs   몇 화면만
 *
 * 원본(ec56)은 화면 폭 768px 이하에서 휴대폰 틀로 바뀐다(CLAUDE.md 10.2). 그 틀에서
 *   - 격자(table)는 표 안에서만 옆으로 밀린다 — 스크롤 상자 안에 든 것은 넘쳐도 괜찮다.
 *   - 그 밖의 것(제목 줄 · 조건 판 · 버튼 · 입력칸)이 화면 오른쪽 끝을 넘으면 손가락으로 못 누른다 → 실패.
 * 왼쪽 메뉴 · 북마크 줄 · 2단 판이 보이면 휴대폰 틀이 안 먹은 것이다 → 실패.
 */
import { readFileSync } from 'node:fs'
import { openBrowser } from './browser.mjs'

const WIDTH = Number(process.env.WIDTH ?? 375)
const prefix = process.argv[2] ? '/' + process.argv[2].replace(/^\//, '') : ''
const router = readFileSync(new URL('../frontend/src/app/router.tsx', import.meta.url), 'utf8')
const routes = [...new Set([...router.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
  .filter((r) => !r.includes(':') && !r.includes('*') && r !== '/login' && r.startsWith(prefix))
if (!prefix) routes.unshift('/')
// ROUTES=/a,/b 로 몇 화면만 다시 볼 수 있다(고친 뒤 실패했던 화면만 재점검)
if (process.env.ROUTES) routes.splice(0, routes.length, ...process.env.ROUTES.split(','))

const b = await openBrowser({ port: Number(process.env.CDP_PORT ?? 9342), width: WIDTH, height: 800 })
let bad = 0, seen = 0
for (const r of routes) {
  try {
    await b.goto(r, 1000)
    seen++
    const res = await b.evaluate(`(() => {
      const W = innerWidth, out = []
      const shown = (s) => { const e = document.querySelector(s); if (!e) return false; const c = getComputedStyle(e); return c.display !== 'none' && e.getBoundingClientRect().width > 0 }
      for (const s of ['.ec-lnb', '.ec-bookbar', '.ec-subnav', '.ec-appbar']) if (shown(s)) out.push('PC 틀이 보인다: ' + s)
      // 본문 틀(.ec-frame)도 스크롤 상자지만, 틀 전체가 옆으로 밀리면 그게 바로 문제다 — 틀 <b>안쪽</b>의,
      // 화면 안에 들어오는 스크롤 상자(표 · 가로 스크롤 띠)에 든 것만 괜찮다고 본다.
      const clipped = (el) => { for (let p = el.parentElement; p && !p.classList.contains('ec-frame') && p.id !== 'root'; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= W + 1) return true } return false }
      const frame = document.querySelector('.ec-frame')
      if (frame && frame.scrollWidth > frame.clientWidth + 1) out.push('본문 틀이 옆으로 밀린다: ' + frame.scrollWidth + 'px')
      const seenKeys = new Set()
      for (const el of document.querySelectorAll('#root *')) {
        const rc = el.getBoundingClientRect()
        if (rc.width === 0 || rc.right <= W + 1 || rc.left >= W) continue
        if (getComputedStyle(el).position === 'fixed') continue
        if (clipped(el)) continue
        const label = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')
          + ' "' + (el.innerText || el.value || el.placeholder || '').trim().slice(0, 14) + '" → ' + Math.round(rc.right) + 'px'
        if (seenKeys.has(label)) continue
        seenKeys.add(label); out.push(label)
        if (out.length > 6) break
      }
      const docW = document.documentElement.scrollWidth
      if (docW > W + 1) out.unshift('문서가 옆으로 넘친다: ' + docW + 'px')
      return out })()`)
    const errs = b.takeErrors()
    if (res.length || errs.length) {
      bad++
      console.log('■', r)
      for (const x of [...res, ...errs].slice(0, 6)) console.log('   ', x)
    }
  } catch (e) {
    bad++; console.log('■', r, '⚠', e.message.slice(0, 90))
    if (/WebSocket|closed|ECONNREFUSED|not open/i.test(e.message)) { console.log('크롬 연결이 끊겼다 — 여기서 멈춘다'); break }
  }
}
await b.close()
console.log(`\n폭 ${WIDTH} · 화면 ${seen}/${routes.length} · 문제 있는 화면 ${bad}`)
process.exit(bad ? 1 : 0)

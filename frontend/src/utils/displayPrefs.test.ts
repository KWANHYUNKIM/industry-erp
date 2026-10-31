import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zeroText, timeText, printPageCss, toDisplayPrefs, DEFAULT_DISPLAY_PREFS } from './displayPrefs.ts'
import { fmtNumber } from './format.ts'


test('0값표시 — 표시안함이면 0 만 공란', () => {
  assert.equal(zeroText(0, fmtNumber, false), '')
  assert.equal(zeroText(1200, fmtNumber, false), '1,200')
  assert.equal(zeroText(0, fmtNumber, true), '0')
})

test('12시간제 — 원본 적용예시 오전 0:03, 정오는 오후 12', () => {
  assert.equal(timeText(new Date(2026, 9, 22, 0, 3), false), '오전 0:03')
  assert.equal(timeText(new Date(2026, 9, 22, 12, 30, 5), false, true), '오후 12:30:05')
  assert.equal(timeText(new Date(2026, 9, 22, 13, 7), false), '오후 1:07')
})

test('24시간제', () => {
  assert.equal(timeText(new Date(2026, 9, 22, 13, 7, 9), true, true), '13:07:09')
})

test('인쇄설정 — 기본(가운데 · 세로)은 지금 양식 CSS 와 같은 @page', () => {
  assert.match(printPageCss(DEFAULT_DISPLAY_PREFS), /@page \{ size: A4 portrait; margin: 12mm; \}/)
  assert.match(printPageCss({ printAlign: 'LEFT', printOrientation: 'LANDSCAPE' }), /landscape.*margin-right: auto/)
})

test('서버 값이 비면 원본 기본값', () => {
  assert.deepEqual(toDisplayPrefs(null), DEFAULT_DISPLAY_PREFS)
  assert.equal(toDisplayPrefs({ clock24: true }).clock24, true)
})

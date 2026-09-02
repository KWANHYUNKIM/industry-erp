import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDays } from './dayCount.ts'

test('원본처럼 소수 셋째 자리까지 채운다', () => {
  assert.equal(formatDays(1), '1.000')
  assert.equal(formatDays(1.25), '1.250')
  assert.equal(formatDays(0.5), '0.500')
})

test('반반차·시간단위도 자리가 맞는다', () => {
  const shown = [1, 0.5, 0.25, 0.125].map((n) => formatDays(n))
  assert.deepEqual(shown, ['1.000', '0.500', '0.250', '0.125'])
  // 소수점 앞뒤 길이가 모두 같아야 세로로 견줄 수 있다
  assert.equal(new Set(shown.map((s) => s.length)).size, 1)
})

test('천단위는 끊어 적는다', () => {
  assert.equal(formatDays(1234.5), '1,234.500')
})

test('자릿수를 정할 수 있다 — 휴가잔여일수현황의 [소수점] 조건', () => {
  assert.equal(formatDays(1.25, 0), '1')
  assert.equal(formatDays(1.25, 1), '1.3')
  assert.equal(formatDays(1.25, 2), '1.25')
})

test('숫자가 아니면 0 으로 친다 — NaN 이 화면에 새지 않는다', () => {
  assert.equal(formatDays(NaN), '0.000')
})

/** 라인 공급가액 반올림 — npm run test:unit */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineSupply, roundWon } from './lineSupply.ts'

/* 2026-10-06 loginaa 판매입력 실측값 그대로. */
test('3 × 333.5 = 1,000.5 → 1,001 (원본 판매입력·구매입력)', () => {
  assert.equal(lineSupply(3, 333.5), 1001)
})

test('3 × 333.35 = 1,000.05 → 1,000', () => {
  assert.equal(lineSupply(3, 333.35), 1000)
})

test('부가세 100.5 → 101 · 100.9 → 101 · 100.1 → 100 (원본 판매입력)', () => {
  assert.equal(roundWon(1005 * 0.1), 101)
  assert.equal(roundWon(1009 * 0.1), 101)
  assert.equal(roundWon(1001 * 0.1), 100)
})

test('부동소수 오차로 .5 가 아래로 빠지지 않는다', () => {
  assert.equal(lineSupply(1.5, 0.7), 1) // 1.05 → 1
  assert.equal(lineSupply(10, 100.05), 1001) // 1000.5 (부동소수 1000.4999…)
})

test('반품(음수)은 크기를 반올림한다 — Java HALF_UP 과 같게', () => {
  assert.equal(roundWon(-1000.5), -1001)
  assert.equal(Object.is(roundWon(-0.4), -0) || roundWon(-0.4) === 0, true)
})

test('0 은 0', () => {
  assert.equal(lineSupply(0, 333.5), 0)
})

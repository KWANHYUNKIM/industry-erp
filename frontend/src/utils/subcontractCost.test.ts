/**
 * 생산입고 외주비 — 화면 계산이 서버(HALF_UP · DOWN)와 같은지. 사례는 2026-10-03 로컬 시험 자료다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subcontractCost, subcontractVat } from './subcontractCost.ts'

test('합계 = 단가 × 수량, 부가세 = 합계의 10% 버림 (서버가 준 값과 같다)', () => {
  assert.deepEqual(subcontractCost(1000, 3), { amount: 3000, vat: 300 })
  assert.deepEqual(subcontractCost(1500, 2), { amount: 3000, vat: 300 })
  assert.deepEqual(subcontractCost(333.33, 7), { amount: 2333, vat: 233 })
  assert.deepEqual(subcontractCost(250, 4), { amount: 1000, vat: 100 })
})

test('원 미만 반올림은 .5 에서 올린다', () => {
  assert.deepEqual(subcontractCost(0.5, 5), { amount: 3, vat: 0 })
  assert.deepEqual(subcontractCost(1.15, 10), { amount: 12, vat: 1 })   // 11.499999… 로 떠도 11.5 로 본다
})

test('음수(반품 성격)는 서버처럼 0 에서 먼 쪽 반올림 · 0 쪽 버림', () => {
  assert.deepEqual(subcontractCost(2.5, -1), { amount: -3, vat: 0 })
  assert.deepEqual(subcontractCost(333.33, -7), { amount: -2333, vat: -233 })
  assert.equal(subcontractVat(-2333), -233)
})

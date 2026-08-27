import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rollupConsume, type ConsumeRow } from './consumeRollup.ts'

const R = (o: Partial<ConsumeRow>): ConsumeRow => ({
  key: 'k', date: '2026-07-01', prodNo: 'PR-1', productionId: 1,
  productId: 10, productCode: 'P10', productName: '완제품',
  materialId: 20, materialCode: 'M20', materialName: '자재',
  producedQty: 5, stdQty: 10, actualQty: 12, amount: 1000, ...o,
})

test('거래별은 줄을 건드리지 않는다', () => {
  const rows = [R({}), R({ materialId: 21 })]
  const out = rollupConsume(rows, '거래별')
  assert.equal(out.length, 2)
  assert.equal(out[0].actualQty, 12)
  assert.equal(out[0].count, 1)
})

test('소모품목별집계는 같은 자재끼리 수량을 더한다', () => {
  // 같은 품목이니 단위가 같다 — 더해도 된다.
  const out = rollupConsume([R({ actualQty: 12, stdQty: 10 }), R({ productionId: 2, actualQty: 3, stdQty: 2 })], '소모품목별집계')
  assert.equal(out.length, 1)
  assert.equal(out[0].actualQty, 15)
  assert.equal(out[0].stdQty, 12)
  assert.equal(out[0].amount, 2000)
  assert.equal(out[0].qtyMixed, false)
})

test('생산품목별집계는 소모수량을 더하지 않는다', () => {
  // 자재가 섞이면 'EA 3개 + kg 2' 같은 숫자가 나온다. 틀린 줄 모르고 읽히는 숫자다.
  const out = rollupConsume([R({ materialId: 20 }), R({ materialId: 21 })], '생산품목별집계')
  assert.equal(out.length, 1)
  assert.equal(out[0].stdQty, null)
  assert.equal(out[0].actualQty, 0)
  assert.equal(out[0].qtyMixed, true)
  assert.equal(out[0].amount, 2000)   // 금액은 언제나 더해도 된다
})

test('생산수량은 전표당 한 번만 센다', () => {
  // 한 입고전표가 자재 수만큼 줄로 나온다. 그대로 더하면 생산수량이 부풀어 오른다.
  const out = rollupConsume(
    [R({ productionId: 1, materialId: 20, producedQty: 5 }),
     R({ productionId: 1, materialId: 21, producedQty: 5 }),
     R({ productionId: 2, materialId: 20, producedQty: 3 })], '생산품목별집계')
  assert.equal(out[0].producedQty, 8)
})

test('묶음이 대표하지 않는 칸은 비운다', () => {
  const out = rollupConsume([R({}), R({ productionId: 2 })], '소모품목별집계')
  assert.equal(out[0].date, '')
  assert.equal(out[0].prodNo, '')
  assert.equal(out[0].productName, '')
  assert.equal(out[0].materialName, '자재')
})

test('금액을 모르는 줄은 0 으로 치지 않는다', () => {
  // 0 으로 채우면 합계가 조용히 작아지고 아무도 그 차이를 못 본다.
  const out = rollupConsume([R({ amount: null }), R({ productionId: 2, amount: null })], '소모품목별집계')
  assert.equal(out[0].amount, null)
  const mixed = rollupConsume([R({ amount: null }), R({ productionId: 2, amount: 700 })], '소모품목별집계')
  assert.equal(mixed[0].amount, 700)
})

test('표준소모를 모르는 줄이 섞여도 아는 것만 더한다', () => {
  const out = rollupConsume([R({ stdQty: null }), R({ productionId: 2, stdQty: 4 })], '소모품목별집계')
  assert.equal(out[0].stdQty, 4)
})

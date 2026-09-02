import assert from 'node:assert/strict'
import { test } from 'node:test'
import { amountVariance, priceVariance, qtyVariance, weightedAvgPrice } from './costVariance.ts'

test('비싸게 사면 양수(불리)', () => {
  const v = priceVariance(1000, 1200, 50)
  assert.equal(v.amount, 10000)      // (1200 − 1000) × 50
})

test('싸게 사면 음수(유리)', () => {
  assert.equal(priceVariance(1000, 900, 50).amount, -5000)
})

test('기준단가를 안 정했으면 재지 않는다 — 0 이 아니라 null', () => {
  // 0 으로 채우면 "차이가 없다" 와 "잴 수 없다" 가 같은 얼굴이 된다.
  assert.equal(priceVariance(0, 1200, 50).amount, null)
  assert.equal(priceVariance(null, 1200, 50).amount, null)
  assert.equal(priceVariance(1000, null, 50).amount, null)
})

test('많이 쓰면 양수(불리)', () => {
  const v = qtyVariance(20, 25, 100)
  assert.equal(v.diffQty, 5)
  assert.equal(v.amount, 500)
})

test('덜 쓰면 음수(유리)', () => {
  assert.equal(qtyVariance(20, 15, 100).amount, -500)
})

test('단가를 몰라도 몇 개 더 썼는지는 나온다', () => {
  const v = qtyVariance(20, 25, null)
  assert.equal(v.diffQty, 5)
  assert.equal(v.amount, null)
})

test('수량차이 소수도 잃지 않는다', () => {
  assert.equal(qtyVariance(0.125, 0.25, 800).diffQty, 0.125)
  assert.equal(qtyVariance(0.125, 0.25, 800).amount, 100)
})

test('금액차이는 실제 − 표준', () => {
  assert.equal(amountVariance(6000, 6300), 300)
  assert.equal(amountVariance(6000, 5700), -300)
  assert.equal(amountVariance(null, 6300), null)
})

test('가중평균 단가는 수량으로 가중한다', () => {
  // 단순평균이면 (100+200)/2 = 150 이 되어 1개짜리가 1000개짜리와 같은 무게를 갖는다.
  const p = weightedAvgPrice([
    { quantity: 1, unitPrice: 200 },
    { quantity: 999, unitPrice: 100 },
  ])
  assert.equal(p, 100.1)
})

test('매입이 없으면 평균단가가 없다', () => {
  assert.equal(weightedAvgPrice([]), null)
  assert.equal(weightedAvgPrice([{ quantity: 0, unitPrice: 500 }]), null)
})

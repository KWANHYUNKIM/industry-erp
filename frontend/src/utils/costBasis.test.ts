import assert from 'node:assert/strict'
import { test } from 'node:test'
import { costOf, sumProfit } from './costBasis.ts'

test("'입고단가(품목)' 은 구매단가를 쓴다 — 판매단가가 아니다", () => {
  // 판매단가 145,000 짜리를 90,000 에 사 왔다면 원가는 90,000 이다.
  // 예전에는 여기가 판매단가를 읽어서 원가가 매출보다 커졌다(개발 자료에서 매출의 4배).
  assert.equal(costOf('입고단가(품목)', {
    monthlyCost: null, lastPurchasePrice: null, itemPurchasePrice: 90000,
  }), 90000)
})

test('기준을 안 정했으면 0 이 아니라 null 이다', () => {
  // 0 을 돌려주면 "원가 0원" 이 되어 이익이 매출 전액으로 부풀고 합계에 섞인다.
  assert.equal(costOf('입고단가(품목)', {
    monthlyCost: null, lastPurchasePrice: null, itemPurchasePrice: 0,
  }), null)
  assert.equal(costOf('월별원가', {
    monthlyCost: null, lastPurchasePrice: 5000, itemPurchasePrice: 9000,
  }), null)
  assert.equal(costOf('최종구매가', {
    monthlyCost: 3000, lastPurchasePrice: null, itemPurchasePrice: 9000,
  }), null)
})

test('기준마다 다른 값을 고른다', () => {
  const src = { monthlyCost: 3000, lastPurchasePrice: 5000, itemPurchasePrice: 9000 }
  assert.equal(costOf('월별원가', src), 3000)
  assert.equal(costOf('최종구매가', src), 5000)
  assert.equal(costOf('입고단가(품목)', src), 9000)
})

test('원가를 모르는 줄은 합계에서 뺀다', () => {
  const rows = [
    { revenue: 10000, cost: 6000 },
    { revenue: 20000, cost: null },   // 기준 없음
    { revenue: 5000, cost: 1000 },
  ]
  const t = sumProfit(rows)
  assert.equal(t.revenue, 35000)        // 매출은 전부 센다
  assert.equal(t.knownRevenue, 15000)   // 이익률을 낼 때 쓰는 분모는 아는 줄만
  assert.equal(t.cost, 7000)
  assert.equal(t.profit, 8000)          // 15,000 − 7,000. 35,000 − 7,000 이 아니다
  assert.equal(t.unknown, 1)
})

test('전부 모르면 이익은 0 이고 그 사실이 드러난다', () => {
  const t = sumProfit([{ revenue: 1000, cost: null }, { revenue: 2000, cost: null }])
  assert.equal(t.revenue, 3000)
  assert.equal(t.knownRevenue, 0)
  assert.equal(t.profit, 0)
  assert.equal(t.unknown, 2)
})

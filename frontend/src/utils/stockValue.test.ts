import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stockCostMap, stockUnitCost, sumStockValue } from './stockValue.ts'

test('실제 입고단가가 있으면 그걸 쓴다', () => {
  assert.equal(stockUnitCost({ lastInboundPrice: 900, itemPurchasePrice: 1000 }), 900)
})

test('입고 이력이 없으면 품목의 구매단가를 쓴다', () => {
  assert.equal(stockUnitCost({ lastInboundPrice: null, itemPurchasePrice: 1000 }), 1000)
  assert.equal(stockUnitCost({ lastInboundPrice: 0, itemPurchasePrice: 1000 }), 1000)
})

test('둘 다 없으면 null — 판매단가로 대신 채우지 않는다', () => {
  // 판매단가로 채우면 아직 팔지도 않은 이익이 재고에 얹힌다.
  // 개발 자료에서 그 차이가 184,574,000 vs 34,908,000(5배)이었다.
  assert.equal(stockUnitCost({ lastInboundPrice: null, itemPurchasePrice: null }), null)
  assert.equal(stockUnitCost({ lastInboundPrice: null, itemPurchasePrice: 0 }), null)
})

test('평가단가를 모르는 칸은 합계에서 빼고 몇 칸인지 알려 준다', () => {
  const t = sumStockValue([
    { quantity: 10, unitCost: 900 },
    { quantity: 5, unitCost: null },    // 기준 없음
    { quantity: 2, unitCost: 1000 },
  ])
  assert.equal(t.value, 11000)          // 9,000 + 2,000. 5개는 안 센다
  assert.equal(t.unknown, 1)
})

test('수량이 0 인 칸은 기준이 없어도 문제 삼지 않는다', () => {
  // 평가할 재고가 없는데 "기준 없음" 이라고 세면 경고만 시끄러워진다.
  const t = sumStockValue([
    { quantity: 0, unitCost: null },
    { quantity: 3, unitCost: 100 },
  ])
  assert.equal(t.value, 300)
  assert.equal(t.unknown, 0)
})

test('음수 재고도 그대로 평가한다', () => {
  // 재고가 음수면 그 자체가 문제지만, 평가액을 0 으로 감추면 문제가 안 보인다.
  const t = sumStockValue([{ quantity: -4, unitCost: 500 }])
  assert.equal(t.value, -2000)
  assert.equal(t.unknown, 0)
})

test('평가단가 표는 마지막 입고단가를 뽑는다', () => {
  const items = [{ id: 1, purchasePrice: 1000 }, { id: 2, purchasePrice: 0 }, { id: 3, purchasePrice: 700 }]
  const purchases = [
    { purchaseDate: '2026-01-10', lines: [{ itemId: 1, unitPrice: 800 }] },
    { purchaseDate: '2026-03-05', lines: [{ itemId: 1, unitPrice: 950 }] },   // 더 최근
    { purchaseDate: '2026-02-01', lines: [{ itemId: 2, unitPrice: 400 }] },
  ]
  const m = stockCostMap(items, purchases)
  assert.equal(m.get(1), 950)     // 마지막 입고단가
  assert.equal(m.get(2), 400)     // 구매단가는 0 이지만 입고 이력이 있다
  assert.equal(m.get(3), 700)     // 입고 이력이 없으면 품목 구매단가
})

test('입고도 구매단가도 없으면 평가단가가 없다', () => {
  const m = stockCostMap([{ id: 9 }], [])
  assert.equal(m.get(9), null)
})

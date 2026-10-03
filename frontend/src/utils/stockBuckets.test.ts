/** 재고변동표 [일별]·[월별] — npm run test:unit */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stockBuckets, bucketTotals } from './stockBuckets.ts'

/* 본사창고 기초 100 · 9/15 창고이동 -10 · 9/20 자가사용 -3 · 10/02 이동 +2 */
const txs = [
  { transactionDate: '2026-09-15', quantityChange: -10 },
  { transactionDate: '2026-09-20', quantityChange: -3 },
  { transactionDate: '2026-10-02', quantityChange: 2 },
]

test('일별 — 앞 구간 기말이 다음 기초로 이어진다', () => {
  const b = stockBuckets(100, txs, '일별')
  assert.deepEqual(b.map((x) => [x.key, x.opening, x.inQty, x.outQty, x.closing]), [
    ['2026-09-15', 100, 0, 10, 90],
    ['2026-09-20', 90, 0, 3, 87],
    ['2026-10-02', 87, 2, 0, 89],
  ])
})

test('월별 — 같은 달은 한 줄', () => {
  const b = stockBuckets(100, txs, '월별')
  assert.deepEqual(b.map((x) => [x.key, x.opening, x.inQty, x.outQty, x.closing, x.count]), [
    ['2026-09', 100, 0, 13, 87, 2],
    ['2026-10', 87, 2, 0, 89, 1],
  ])
})

test('합계는 구간들로 — 기초는 첫 구간, 기말은 끝 구간', () => {
  assert.deepEqual(bucketTotals(stockBuckets(100, txs, '일별')), { opening: 100, inQty: 2, outQty: 13, closing: 89 })
  assert.deepEqual(bucketTotals([]), { opening: 0, inQty: 0, outQty: 0, closing: 0 })
})

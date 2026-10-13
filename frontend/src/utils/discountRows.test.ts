/** 판매·구매·외주비 할인현황 줄 — npm run test:unit */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discountRows, discountSubtotals, type DiscountSrc } from './discountRows.ts'

const doc = (p: Partial<DiscountSrc>): DiscountSrc => ({
  date: '2026-10-03', docNo: 'S', partnerId: 5, partnerName: '한울ICT',
  warehouseId: 1, warehouseName: '본사창고', employeeName: '김철수', projectId: null, projectName: null,
  supplyAmount: 0, reflected: false, remark: null, taxable: true, ...p,
})
/* 같은 날 같은 거래처, 창고·담당자가 다른 전표 둘 + 반품 하나. */
const docs = [
  doc({ docNo: 'A', supplyAmount: 2000 }),
  doc({ docNo: 'B', warehouseId: 2, warehouseName: 'QA창고', employeeName: '이영희', supplyAmount: 1500, reflected: true }),
  doc({ docNo: 'C', supplyAmount: -1000 }),
]
const all = { from: '2026-10-01', to: '2026-10-03' }

test('같은 날 같은 거래처는 한 줄 — 반품(음수)도 더한다', () => {
  const rows = discountRows(docs, all)
  assert.equal(rows.length, 1)
  assert.deepEqual([rows[0].orgAmount, rows[0].reflectedAmount], [2500, 1500])
})

test('창고 조건은 전표마다 건다 — 둘째 전표의 창고로 걸어도 나온다', () => {
  const qa = discountRows(docs, { ...all, warehouse: '2' })
  assert.deepEqual(qa.map((r) => [r.orgAmount, r.reflectedAmount, r.docNos.join()]), [[1500, 1500, 'B']])
  const hq = discountRows(docs, { ...all, warehouse: '1' })
  assert.deepEqual(hq.map((r) => [r.orgAmount, r.docNos.join()]), [[1000, 'A,C']])
})

test('담당자 조건도 전표마다', () => {
  assert.deepEqual(discountRows(docs, { ...all, employee: '이영희' }).map((r) => r.orgAmount), [1500])
  assert.deepEqual(discountRows(docs, { ...all, employee: '김철수' }).map((r) => r.orgAmount), [1000])
})

test('창고 소계는 줄 안의 전표를 창고별로 나눈다', () => {
  const g = discountSubtotals(discountRows(docs, all), '창고')
  assert.deepEqual(g.map((x) => [x.label, x.count, x.sums.org, x.sums.ref]),
    [['본사창고', 1, 1000, 0], ['QA창고', 1, 1500, 1500]])
  const e = discountSubtotals(discountRows(docs, all), '담당자')
  assert.deepEqual(e.map((x) => [x.label, x.sums.org]), [['김철수', 1000], ['이영희', 1500]])
  const p = discountSubtotals(discountRows(docs, all), '거래처')
  assert.deepEqual(p.map((x) => [x.label, x.count, x.sums.org]), [['한울ICT', 1, 2500]])
})

test('기간 · 거래유형', () => {
  const more = [...docs, doc({ date: '2026-09-30', supplyAmount: 7 }), doc({ docNo: 'F', taxable: false, supplyAmount: 300 })]
  assert.equal(discountRows(more, all).reduce((s, r) => s + r.orgAmount, 0), 2800)
  assert.deepEqual(discountRows(more, { ...all, tradeType: '면세' }).map((r) => r.orgAmount), [300])
})

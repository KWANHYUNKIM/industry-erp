/** 세금계산서 전표의 공급가액 · 부가세 — npm run test:unit */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoiceSlipAmounts, vatEntrySide, vatSlipAmounts } from './vatSlip.ts'

const L = (accountCode: string, debit: number, credit: number) => ({ accountCode, debit, credit })

/* 2026-10-03 로컬에서 회계반영한 전표 그대로(GL-20261003-0015~0017). */
test('판매 — 차)외상매출금 2,200 / 대)제품매출 2,000 · 부가세예수금 200', () => {
  assert.deepEqual(vatSlipAmounts([L('108', 2200, 0), L('404', 0, 2000), L('255', 0, 200)], '매출'), { supply: 2000, vat: 200 })
})

test('판매반품 — 역분개라 공급가액도 음수(외상매출금을 공급가액으로 읽지 않는다)', () => {
  assert.deepEqual(vatSlipAmounts([L('108', 0, 1100), L('404', 1000, 0), L('255', 100, 0)], '매출'), { supply: -1000, vat: -100 })
})

test('구매반품 — 차)외상매입금 1,540 / 대)원재료 1,400 · 부가세대급금 140', () => {
  assert.deepEqual(vatSlipAmounts([L('153', 0, 1400), L('135', 0, 140), L('251', 1540, 0)], '매입'), { supply: -1400, vat: -140 })
})

test('구매 — 정상', () => {
  assert.deepEqual(vatSlipAmounts([L('153', 1400, 0), L('135', 140, 0), L('251', 0, 1540)], '매입'), { supply: 1400, vat: 140 })
})

test('부가세 줄이 없으면 null', () => {
  assert.equal(vatSlipAmounts([L('108', 1000, 0), L('404', 0, 1000)], '매출'), null)
})

test('매출전표 I · 매입전표 I 의 수수료 두 줄(차 지급수수료 / 대 입금 · 출금계좌)은 공급가액에 넣지 않는다', () => {
  assert.deepEqual(vatSlipAmounts([L('108', 110000, 0), L('404', 0, 100000), L('255', 0, 10000), L('831', 1000, 0), L('108', 0, 1000)], '매출'), { supply: 100000, vat: 10000 })
  assert.deepEqual(vatSlipAmounts([L('153', 100000, 0), L('135', 10000, 0), L('251', 0, 110000), L('831', 1000, 0), L('251', 0, 1000)], '매입'), { supply: 100000, vat: 10000 })
  /* 짝 없는 지급수수료(지출결의서)는 그대로 공급가액 */
  assert.deepEqual(vatSlipAmounts([L('831', 1000, 0), L('135', 100, 0), L('101', 0, 1100)], '매입'), { supply: 1000, vat: 100 })
})

test('부가세유형 전표의 쪽 — 판매 회계반영(SALES)은 매출, 구매(PURCHASE)는 매입, 그 밖은 부가세 줄', () => {
  const sale = [L('108', 110, 0), L('404', 0, 100), L('255', 0, 10)]
  const buy = [L('153', 100, 0), L('135', 10, 0), L('251', 0, 110)]
  assert.equal(vatEntrySide({ sourceType: 'SALES', lines: sale }), '매출')
  assert.equal(vatEntrySide({ sourceType: 'VAT_SALES', lines: [L('108', 100, 0), L('404', 0, 100)] }), '매출')
  assert.equal(vatEntrySide({ sourceType: 'PURCHASE', lines: buy }), '매입')
  assert.equal(vatEntrySide({ sourceType: 'VAT_PURCHASE', lines: [L('153', 100, 0), L('251', 0, 100)] }), '매입')
  assert.equal(vatEntrySide({ sourceType: 'MANUAL', lines: sale }), '매출')
  assert.equal(vatEntrySide({ sourceType: 'MANUAL', lines: buy }), '매입')
  assert.equal(vatEntrySide({ sourceType: 'MANUAL', lines: [L('101', 1, 0), L('102', 0, 1)] }), null)
})

test('계산서(면세) — 부가세 줄이 없어도 부가세유형 계산서면 공급가액, 부가세 0', () => {
  const sale = { sourceType: 'VAT_SALES', vatType: '계산서', lines: [L('108', 100000, 0), L('404', 0, 100000)] }
  assert.deepEqual(invoiceSlipAmounts(sale, '매출'), { supply: 100000, vat: 0 })
  assert.equal(invoiceSlipAmounts(sale, '매입'), null)
  const buy = { sourceType: 'VAT_PURCHASE', vatType: '계산서', lines: [L('153', 50000, 0), L('251', 0, 50000)] }
  assert.deepEqual(invoiceSlipAmounts(buy, '매입'), { supply: 50000, vat: 0 })
  assert.equal(invoiceSlipAmounts({ ...sale, vatType: '카드매출' }, '매출'), null)
})

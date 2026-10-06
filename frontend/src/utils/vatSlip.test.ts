/** 세금계산서 전표의 공급가액 · 부가세 — npm run test:unit */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vatSlipAmounts } from './vatSlip.ts'

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

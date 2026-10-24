/** 일/월계표 현금 · 대체 가름 — npm run test:unit */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cashSplit } from './cashSplit.ts'

test('원천징수가 낀 출금 — 현금 금액만 현금, 나머지는 대체', () => {
  const ps = cashSplit([
    { accountCode: '805', debit: 200000, credit: 0 },
    { accountCode: '101', debit: 0, credit: 198520 },
    { accountCode: '254', debit: 0, credit: 1480 },
  ], '101')
  assert.deepEqual(ps[0], { dCash: 198520, dTrans: 1480, cCash: 0, cTrans: 0 })
  assert.deepEqual(ps[2], { dCash: 0, dTrans: 0, cCash: 0, cTrans: 1480 })
})

test('현금이 없는 전표는 전부 대체', () => {
  const ps = cashSplit([{ accountCode: '108', debit: 500, credit: 0 }, { accountCode: '401', debit: 0, credit: 500 }], '101')
  assert.deepEqual(ps, [{ dCash: 0, dTrans: 500, cCash: 0, cTrans: 0 }, { dCash: 0, dTrans: 0, cCash: 0, cTrans: 500 }])
})

test('현금 입금 — 대변 줄을 차례로 채운다', () => {
  const ps = cashSplit([
    { accountCode: '101', debit: 300, credit: 0 },
    { accountCode: '108', debit: 200, credit: 0 },
    { accountCode: '401', debit: 0, credit: 400 },
    { accountCode: '255', debit: 0, credit: 100 },
  ], '101')
  assert.deepEqual(ps[2], { dCash: 0, dTrans: 0, cCash: 300, cTrans: 100 })
  assert.deepEqual(ps[3], { dCash: 0, dTrans: 0, cCash: 0, cTrans: 100 })
  assert.deepEqual(ps[1], { dCash: 0, dTrans: 200, cCash: 0, cTrans: 0 })
})

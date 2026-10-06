/** 통장 이름 — npm run test:unit */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bankLabel } from './bankLabel.ts'

test('통장명이 있으면 그대로', () => {
  assert.equal(bankLabel({ name: '급여통장', bankName: '기업은행', accountNo: '123-456-1122' }), '급여통장')
})

test('없으면 은행명-계좌끝4자리(숫자만)', () => {
  assert.equal(bankLabel({ name: null, bankName: '기업은행', accountNo: '123-456-1122' }), '기업은행-1122')
  assert.equal(bankLabel({ bankName: 'QA은행', accountNo: 'QA-110-999-000001' }), 'QA은행-0001')
})

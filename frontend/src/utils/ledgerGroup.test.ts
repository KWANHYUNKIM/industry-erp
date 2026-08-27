import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupKeyOf, UNPOSTED } from './ledgerGroup.ts'

const E = (date: string, journalDocNo: string | null = null) => ({ date, journalDocNo })

test('전표별은 묶지 않는다', () => {
  assert.equal(groupKeyOf(E('2026-07-15'), '전표별'), null)
  assert.equal(groupKeyOf(E('2026-07-15'), '전표별+내역'), null)
})

test('일별은 날짜, 월별은 달', () => {
  assert.equal(groupKeyOf(E('2026-07-15'), '일별'), '2026-07-15')
  assert.equal(groupKeyOf(E('2026-07-15'), '월별'), '2026-07')
})

test('회계전표별은 전표번호로 묶는다', () => {
  assert.equal(groupKeyOf(E('2026-07-15', 'JV-20260715-0001'), '회계전표별'), 'JV-20260715-0001')
})

test('회계로 안 넘어간 줄은 사라지지 않고 미반영으로 모인다', () => {
  // 이 줄이 빠지면 대장 합계가 조용히 달라진다 — 눈에 안 띄는 종류의 오류다.
  assert.equal(groupKeyOf(E('2026-07-15', null), '회계전표별'), UNPOSTED)
})

test('빈 전표번호도 미반영으로 본다', () => {
  // 빈 키로 두면 다른 줄과 한 묶음이 되어 남의 회계전표에 얹힌다.
  assert.equal(groupKeyOf(E('2026-07-15', ''), '회계전표별'), UNPOSTED)
  assert.equal(groupKeyOf(E('2026-07-15', '   '), '회계전표별'), UNPOSTED)
})

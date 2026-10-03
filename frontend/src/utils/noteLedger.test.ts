/** 어음거래내역 묶음 · 잔액 — npm run test:unit */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noteLedgerGroups } from './noteLedger.ts'

const N = (noteNo: string, partnerName: string, issueDate: string, closedDate: string | null, amount: number) =>
  ({ noteNo, partnerName, issueDate, closedDate, amount })

const NOTES = [
  N('BN-1', '가상사', '2026-08-20', '2026-09-10', 1_000_000),   // 기간 앞에 받아 기간 안에 결제
  N('BN-2', '가상사', '2026-09-05', null, 300_000),               // 기간 안에 받아 들고 있음
  N('BN-3', '나상사', '2026-08-01', null, 500_000),               // 기간 내내 들고만 있음
  N('BN-4', '다상사', '2026-07-01', '2026-08-31', 700_000),       // 기간 앞에 이미 결제 — 안 나온다
  N('BN-5', '가상사', '2026-10-05', null, 999),                   // 기간 뒤 — 안 나온다
]

test('기간 앞에 받은 어음이 결제되면 이월잔액에서 빠진다 — 잔액이 음수가 되지 않는다', () => {
  const gs = noteLedgerGroups(NOTES, '2026-09-01', '2026-09-30', '거래처별')
  const ga = gs.find((g) => g.key === '가상사')!
  assert.equal(ga.opening, 1_000_000)
  assert.deepEqual(ga.lines.map((l) => [l.date, l.kind, l.bal]), [
    ['2026-09-05', '증가', 1_300_000],
    ['2026-09-10', '감소', 300_000],
  ])
  assert.equal(ga.bal, 300_000)
  assert.equal(ga.inc, 300_000)
  assert.equal(ga.dec, 1_000_000)
})

test('기간 내내 들고만 있던 어음도 이월잔액 묶음으로 나온다', () => {
  const gs = noteLedgerGroups(NOTES, '2026-09-01', '2026-09-30', '거래처별')
  const gb = gs.find((g) => g.key === '나상사')!
  assert.equal(gb.opening, 500_000)
  assert.equal(gb.lines.length, 0)
  assert.equal(gb.bal, 500_000)
  assert.deepEqual(gs.map((g) => g.key), ['가상사', '나상사'])
  /* 합계 잔액 = 기간 끝날 들고 있는 어음 합(BN-2 + BN-3) */
  assert.equal(gs.reduce((s, g) => s + g.bal, 0), 800_000)
})

test('첫날 결제된 어음은 이월에 들고 감소 줄을 남긴다', () => {
  const gs = noteLedgerGroups([N('BN-9', '가상사', '2026-08-01', '2026-09-01', 100)], '2026-09-01', '2026-09-30', '거래처/어음번호별')
  assert.equal(gs[0].key, '가상사 / BN-9')
  assert.equal(gs[0].opening, 100)
  assert.deepEqual(gs[0].lines.map((l) => [l.kind, l.bal]), [['감소', 0]])
})

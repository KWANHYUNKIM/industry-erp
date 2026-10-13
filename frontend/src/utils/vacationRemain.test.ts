import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withRemain } from './vacationRemain.ts'

const row = (id: number, type: string, startDate: string, days: number, status = 'APPROVED') =>
  ({ id, empName: '김부장', type, startDate, days, status })

test('승인된 연차·반차만 잔여에서 뺀다 — 경조·병가는 연차와 따로 간다', () => {
  const lines = withRemain([
    row(1, '반차', '2026-06-10', 0.5),
    row(2, '병가', '2026-06-15', 2, 'PENDING'),
    row(3, '반차', '2026-08-12', 0.5),
    row(4, '연차', '2026-08-13', 2),
    row(5, '경조', '2026-08-17', 3),
    row(6, '연차', '2026-08-20', 1, 'PENDING'),
  ], new Map([['김부장', 15]]))
  assert.deepEqual(lines.map((l) => l.remain), [14.5, 14.5, 14, 12, 12, 12])
  // 마지막 잔여가 휴가잔여일수현황(15 − 0.5 − 0.5 − 2 = 12)과 같아야 한다
  assert.equal(lines.at(-1)!.remain, 12)
  assert.deepEqual(lines.map((l) => l.grant), [15, null, null, null, null, null])
})

test('부여일수를 모르면 잔여를 지어내지 않는다', () => {
  const lines = withRemain([row(1, '연차', '2026-01-02', 1)], new Map())
  assert.equal(lines[0].remain, null)
})

test('시간 단위(0.125)가 쌓여도 소수 셋째 자리에서 맞는다', () => {
  const lines = withRemain([1, 2, 3].map((i) => row(i, '연차', `2026-03-0${i}`, 0.125)), new Map([['김부장', 1]]))
  assert.equal(lines.at(-1)!.remain, 0.625)
})

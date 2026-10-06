/** 인원현황 줄 계산 — npm run test:unit */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { headcountRows } from './headcount.ts'

const EMPS = [
  { name: '김기존', hireDate: '2025-03-01', resignDate: null },
  { name: '박입사', hireDate: '2026-10-02', resignDate: null },
  { name: '이퇴사', hireDate: '2024-01-10', resignDate: '2026-10-02' },
  { name: '최미입력', hireDate: null, resignDate: null },
]

test('일별 — 입사한 날 들어오고, 퇴사한 날부터 빠진다', () => {
  const rs = headcountRows(EMPS, '일별', '2026-10-01', '2026-10-03')
  assert.deepEqual(rs.map((r) => r.label), ['2026/10/01', '2026/10/02', '2026/10/03'])
  assert.deepEqual(rs.map((r) => r.total), [3, 3, 3])
  assert.deepEqual(rs[1].hired, ['박입사'])
  assert.deepEqual(rs[1].resigned, ['이퇴사'])
  assert.deepEqual(rs[0].hired, [])
})

test('입사일자가 빈 사원도 총인원에 든다', () => {
  const rs = headcountRows([{ name: 'A', hireDate: null, resignDate: null }], '일별', '2026-10-01', '2026-10-01')
  assert.equal(rs[0].total, 1)
})

test('월별 — 달 끝(이번 달은 기간 끝) 인원, 입퇴사는 그 달에 묶는다', () => {
  const rs = headcountRows(EMPS, '월별', '2026-09-01', '2026-10-03')
  assert.deepEqual(rs.map((r) => r.label), ['2026/09', '2026/10'])
  assert.deepEqual(rs.map((r) => r.total), [3, 3])
  assert.deepEqual(rs[1].hired, ['박입사'])
  assert.deepEqual(rs[1].resigned, ['이퇴사'])
})

test('시작이 끝보다 뒤면 줄이 없다', () => {
  assert.deepEqual(headcountRows(EMPS, '일별', '2026-10-05', '2026-10-01'), [])
})

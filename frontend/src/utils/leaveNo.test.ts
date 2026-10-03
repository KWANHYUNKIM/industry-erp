import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leaveNo } from './leaveNo.ts'

test('근태번호 AT-YYYYMMDD-0001 → 원본 꼴 2026/10/29 -1', () => {
  assert.equal(leaveNo('AT-20261029-0001', '2026-10-01'), '2026/10/29 -1')
  assert.equal(leaveNo('AT-20261025-0012', '2026-10-01'), '2026/10/25 -12')
})

test('번호를 못 읽으면 날짜만', () => {
  assert.equal(leaveNo(null, '2026-10-01'), '2026/10/01')
  assert.equal(leaveNo('X-1', '2026-10-01'), '2026/10/01')
})

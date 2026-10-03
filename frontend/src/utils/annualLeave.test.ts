/**
 * [연차계산] 셈 — 원본(loginaa, 연차계산기준 40시간제)에서 2026-10-04 잰 값을 못 박는다.
 *
 *   cd frontend && npm run test:unit
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { annualLeaveDays } from './annualLeave.ts'

test('앞 해 입사는 그 해 일한 날 비례 — 2024/10/01 입사, 2025 사용기간 → 3.770492 (원본 값)', () => {
  assert.equal(annualLeaveDays('2024-10-01', '2025-01-01'), 3.770492)
})

test('근속 6년 → 15 + ⌊5/2⌋ = 17 — 2019/01/05 입사, 2025 사용기간 (원본 값)', () => {
  assert.equal(annualLeaveDays('2019-01-05', '2025-01-01'), 17)
})

test('근속 2년은 15, 상한 25', () => {
  assert.equal(annualLeaveDays('2023-03-01', '2025-01-01'), 15)
  assert.equal(annualLeaveDays('1980-01-01', '2025-01-01'), 25)
})

test('사용기간 해 입사 · 입사일 없음은 0', () => {
  assert.equal(annualLeaveDays('2025-02-01', '2025-01-01'), 0)
  assert.equal(annualLeaveDays(null, '2025-01-01'), 0)
})

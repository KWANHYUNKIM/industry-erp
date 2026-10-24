import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vacationFetchRange } from './vacationFetchRange.ts'

test('1월에 [전월](작년 12월)을 보면 작년 것까지 묻는다', () => {
  assert.deepEqual(vacationFetchRange('2026-12-01', '2026-12-31'), { from: '2025-01-01', to: '2027-12-31' })
  assert.deepEqual(vacationFetchRange('2025-12-01', '2025-12-31'), { from: '2024-01-01', to: '2026-12-31' })
})

test('한쪽만 있으면 다른 쪽은 열어 둔다', () => {
  assert.deepEqual(vacationFetchRange('2026-03-01', ''), { from: '2025-01-01', to: '9999-12-31' })
  assert.deepEqual(vacationFetchRange('', '2024-05-01'), { from: '1900-01-01', to: '2025-12-31' })
})

test('둘 다 비면 서버 기본(올해)대로 묻는다', () => {
  assert.equal(vacationFetchRange('', ''), null)
})

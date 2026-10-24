/**
 * 시리얼/로트No. [유효기한] 직접입력 기본 구간 테스트.
 *
 *   npm run test:unit
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expiryDirectRange } from './expiryRange.ts'

test('원본 실측 — 2026/10/04 → 2026/10/04 ~ 2031/10/03', () => {
  assert.deepEqual(expiryDirectRange('2026-10-04'), { from: '2026-10-04', to: '2031-10-03' })
})

test('달 첫날이면 끝은 전달 말일', () => {
  assert.deepEqual(expiryDirectRange('2026-03-01'), { from: '2026-03-01', to: '2031-02-28' })
})

test('윤일 2/29 — 5년 뒤에 없는 날은 3/1 로 밀린 뒤 하루 전', () => {
  assert.deepEqual(expiryDirectRange('2028-02-29'), { from: '2028-02-29', to: '2033-02-28' })
})

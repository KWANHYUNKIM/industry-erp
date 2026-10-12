import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultRepeat, repeatProblem, repeatSummary } from './scheduleRepeat.ts'

/* 원본 요약보기 글(2026-10-13 loginaa E070201 반복설정 실측) */
test('매일 — 날짜로 끝', () => {
  assert.equal(repeatSummary(defaultRepeat('2026-10-13')), '매일, 2026/10/13 부터 2026/10/13 까지')
})

test('매주 — 고른 요일, 횟수로 끝', () => {
  const r = { ...defaultRepeat('2026-10-13'), unit: 'WEEK' as const, weekdays: [3, 1], endType: 'COUNT' as const }
  assert.equal(repeatSummary(r), '매주, 월요일,수요일, 2026/10/13 부터 0회 까지')
})

test('매주 — 요일을 안 고르면 빈 자리가 남는다(원본 그대로)', () => {
  assert.equal(repeatSummary({ ...defaultRepeat('2026-10-13'), unit: 'WEEK' }), '매주, , 2026/10/13 부터 2026/10/13 까지')
})

test('매월 — 기준 일 / 기준 주', () => {
  const m = { ...defaultRepeat('2026-10-13'), unit: 'MONTH' as const, endType: 'COUNT' as const }
  assert.equal(repeatSummary(m), '매월, 1 일, 2026/10/13 부터 0회 까지')
  assert.equal(repeatSummary({ ...m, monthBasis: 'WEEK' }), '매월, 1번째, , 2026/10/13 부터 0회 까지')
})

test('매년 — 월 일', () => {
  const y = { ...defaultRepeat('2026-10-13'), unit: 'YEAR' as const, endType: 'COUNT' as const }
  assert.equal(repeatSummary(y), '매년, 1월 1일, 2026/10/13 부터 0회 까지')
})

test('적용 막기 — 횟수 0 은 원본 말풍선, 같은 날 종료는 반복 없음', () => {
  assert.equal(repeatProblem({ ...defaultRepeat('2026-10-13'), endType: 'COUNT' }), '값이 입력되지 않았습니다.\n값을 입력 바랍니다.')
  assert.equal(repeatProblem(defaultRepeat('2026-10-13')), 'none')
  assert.equal(repeatProblem({ ...defaultRepeat('2026-10-13'), endType: 'COUNT', count: 3 }), null)
})

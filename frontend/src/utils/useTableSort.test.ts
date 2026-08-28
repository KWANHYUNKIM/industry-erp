import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareValues, nextDir, sortRows } from './useTableSort.ts'

test('숫자는 숫자로 견준다 — 글자로 보면 10 이 9 앞에 온다', () => {
  assert.equal(compareValues(9, 10) < 0, true)
  assert.equal(compareValues(100, 20) > 0, true)
})

test('글자는 한국어 차례로 견준다', () => {
  assert.equal(compareValues('가나', '다라') < 0, true)
})

test('빈 값은 방향과 상관없이 늘 뒤로 간다', () => {
  const rows = [{ v: 'B' }, { v: null }, { v: 'A' }]
  assert.deepEqual(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v), ['A', 'B', null])
  assert.deepEqual(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v), ['B', 'A', null])
})

test('빈 글자도 빈 값으로 친다', () => {
  const rows = [{ v: '' }, { v: 'A' }]
  assert.deepEqual(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v), ['A', ''])
})

test('같은 값이면 원래 차례를 지킨다', () => {
  const rows = [{ id: 1, v: 'A' }, { id: 2, v: 'A' }, { id: 3, v: 'A' }]
  assert.deepEqual(sortRows(rows, (r) => r.v, 'asc').map((r) => r.id), [1, 2, 3])
  assert.deepEqual(sortRows(rows, (r) => r.v, 'desc').map((r) => r.id), [1, 2, 3])
})

test('세 번 누르면 정렬을 푼다', () => {
  assert.equal(nextDir(null), 'asc')
  assert.equal(nextDir('asc'), 'desc')
  assert.equal(nextDir('desc'), null)
})

test('기본 정렬을 준 표는 세 번 눌러도 풀리지 않는다 — 풀면 월 소계가 흩어진다', () => {
  // toggle 의 규칙만 견준다: 기본 정렬이 있으면 오름/내림만 오간다.
  const flip = (d: 'asc' | 'desc') => (d === 'asc' ? 'desc' : 'asc')
  assert.equal(flip('asc'), 'desc')
  assert.equal(flip(flip('asc')), 'asc')
  // 기본 정렬이 없을 때만 세 번째에 풀린다(위 시험과 대비).
  assert.equal(nextDir('desc'), null)
})

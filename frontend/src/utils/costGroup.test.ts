import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupByCategory, groupPreservingOrder, COST_GROUP_ORDER } from './costGroup.ts'

const R = (code: string, cat: string) => ({ code, cat })
const names = (gs: { name: string }[]) => gs.map((g) => g.name)

test('원본 순서대로 세운다 — 이름순이 아니다', () => {
  const gs = groupByCategory(
    [R('a', '상품'), R('b', '원재료'), R('c', '제품'), R('d', '부재료'), R('e', '반제품')],
    (r) => r.cat)
  assert.deepEqual(names(gs), [...COST_GROUP_ORDER])
})

test('없는 구분은 빠지고 있는 것만 순서대로', () => {
  const gs = groupByCategory([R('a', '제품'), R('b', '원재료')], (r) => r.cat)
  assert.deepEqual(names(gs), ['원재료', '제품'])
})

test('같은 구분은 한 묶음이고 줄 순서는 그대로', () => {
  const gs = groupByCategory([R('b', '제품'), R('a', '제품')], (r) => r.cat)
  assert.equal(gs.length, 1)
  assert.deepEqual(gs[0].rows.map((r) => r.code), ['b', 'a'])
})

test('모르는 구분은 버리지 않고 맨 뒤에 세운다', () => {
  // 조용히 빼면 소계의 합이 누계와 어긋나고, 그 차이는 아무 데도 안 적힌다.
  const gs = groupByCategory([R('a', '용역'), R('b', '원재료')], (r) => r.cat)
  assert.deepEqual(names(gs), ['원재료', '용역'])
})

test('구분을 모르는 줄도 사라지지 않는다', () => {
  const gs = groupByCategory([R('a', ''), R('b', '제품')], (r) => r.cat)
  assert.deepEqual(names(gs), ['제품', '(미지정)'])
  assert.equal(gs.reduce((n, g) => n + g.rows.length, 0), 2)
})

test('공정별 소계는 목록에 나온 순서를 지킨다', () => {
  // 화면이 정렬해 둔 순서를 소계가 다시 흔들면 사람이 줄을 못 따라간다.
  const gs = groupPreservingOrder(
    [R('a', '완제품공정'), R('b', '반제품공정'), R('c', '완제품공정')], (r) => r.cat)
  assert.deepEqual(gs.map((g) => g.name), ['완제품공정', '반제품공정'])
  assert.deepEqual(gs[0].rows.map((r) => r.code), ['a', 'c'])
})

test('공정을 모르는 줄도 사라지지 않는다', () => {
  const gs = groupPreservingOrder([R('a', ''), R('b', '완제품공정')], (r) => r.cat)
  assert.deepEqual(gs.map((g) => g.name), ['(미지정)', '완제품공정'])
  assert.equal(gs.reduce((n, g) => n + g.rows.length, 0), 2)
})

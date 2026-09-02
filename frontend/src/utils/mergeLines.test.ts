import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeLoadedLines } from './mergeLines.ts'

const L = (itemId: string, qty = '') => ({ itemId, qty })

test('손으로 적어 둔 줄을 덮지 않는다', () => {
  // 덮어쓰면 방금 적은 수량이 사라진 것을 한참 뒤에야 안다.
  const out = mergeLoadedLines([L('7', '5')], [L('9', '10')])
  assert.deepEqual(out, [L('7', '5'), L('9', '10')])
})

test('빈 줄만 걷어낸다', () => {
  const out = mergeLoadedLines([L(''), L('7', '5'), L('')], [L('9', '10')])
  assert.deepEqual(out, [L('7', '5'), L('9', '10')])
})

test('기존이 전부 빈 줄이면 불러온 것만 남는다', () => {
  const out = mergeLoadedLines([L(''), L('')], [L('9', '10'), L('8', '3')])
  assert.deepEqual(out, [L('9', '10'), L('8', '3')])
})

test('불러온 것이 없으면 기존만 남는다', () => {
  assert.deepEqual(mergeLoadedLines([L('7', '5')], []), [L('7', '5')])
})

test('둘 다 비면 빈 목록', () => {
  assert.deepEqual(mergeLoadedLines([L('')], []), [])
})

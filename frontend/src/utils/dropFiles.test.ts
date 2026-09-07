import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDrop } from './dropFiles.ts'

test('아무것도 안 놓으면 아무 일도 없다', () => {
  assert.deepEqual(planDrop([], false), { accepted: [], skipped: 0 })
  assert.deepEqual(planDrop([], true), { accepted: [], skipped: 0 })
})

test('여러 개 받는 자리는 전부 올린다', () => {
  assert.deepEqual(planDrop(['a', 'b', 'c'], true), { accepted: ['a', 'b', 'c'], skipped: 0 })
})

test('한 개만 받는 자리는 첫 개만 올리고 몇 개를 뺐는지 알린다', () => {
  // 말없이 첫 개만 올리면 사람은 셋을 놓고 셋이 올라간 줄 안다.
  assert.deepEqual(planDrop(['a', 'b', 'c'], false), { accepted: ['a'], skipped: 2 })
})

test('한 개만 놓으면 알릴 것이 없다', () => {
  assert.deepEqual(planDrop(['a'], false), { accepted: ['a'], skipped: 0 })
})

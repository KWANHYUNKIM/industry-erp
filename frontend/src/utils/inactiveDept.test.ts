import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inactiveDeptNames, showsJournal } from './inactiveDept.ts'

const master = inactiveDeptNames([
  { name: '영업부', active: true },
  { name: '옛기획부', active: false },
])

test('사용중단 부서의 일지는 기본으로 안 보인다', () => {
  assert.equal(showsJournal('옛기획부', master, false), false)
})

test('켜면 보인다', () => {
  assert.equal(showsJournal('옛기획부', master, true), true)
})

test('쓰는 부서는 그대로 보인다', () => {
  assert.equal(showsJournal('영업부', master, false), true)
})

test('마스터에 없는 부서명은 숨기지 않는다', () => {
  // 업무일지의 부서는 자유입력이다. '마스터에 없으면 뺀다' 로 만들면
  // 옛 부서명으로 적힌 일지가 통째로 사라진다.
  assert.equal(showsJournal('현장팀', master, false), true)
})

test('부서를 안 적은 일지도 숨기지 않는다', () => {
  assert.equal(showsJournal('', master, false), true)
  assert.equal(showsJournal(null, master, false), true)
  assert.equal(showsJournal('  ', master, false), true)
})

test('마스터를 못 받으면 아무것도 숨기지 않는다', () => {
  const none = inactiveDeptNames([])
  assert.equal(showsJournal('옛기획부', none, false), true)
})

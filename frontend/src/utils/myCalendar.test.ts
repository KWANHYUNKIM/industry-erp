import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMyEvent } from './myCalendar.ts'

const row = (o: Partial<{ createdBy: string; owner: string; attendees: string }>) => ({
  createdBy: o.createdBy ?? null,
  owner: o.owner ?? null,
  attendees: o.attendees ?? null,
})
const me = { name: '김관현', username: 'admin' }

test('내가 만든 일정', () => {
  assert.equal(isMyEvent(row({ createdBy: 'admin' }), me), true)
})

test('남이 잡아 준 회의도 내 것이다 — 참석자에 내가 있으면', () => {
  // 만든 사람만 봤다면 여기서 false 가 되고, 화면은 그냥 목록이 짧아 보일 뿐이다.
  assert.equal(isMyEvent(row({ createdBy: 'someone', attendees: '유한영, 김관현' }), me), true)
})

test('담당이 나여도 내 것이다', () => {
  assert.equal(isMyEvent(row({ createdBy: 'someone', owner: '김관현' }), me), true)
})

test('나와 무관한 일정은 아니다', () => {
  assert.equal(isMyEvent(row({ createdBy: 'someone', owner: '유한영', attendees: '최미란' }), me), false)
})

test('이름만 알아도 걸린다', () => {
  assert.equal(isMyEvent(row({ owner: '김관현' }), { name: '김관현' }), true)
})

test('아이디만 알아도 걸린다', () => {
  assert.equal(isMyEvent(row({ createdBy: 'admin' }), { username: 'admin' }), true)
})

test('누구인지 모르면 아무것도 내 것이 아니다', () => {
  // 빈 문자열로 훑으면 모든 줄이 걸려 '내 캘린더' 가 전체와 같아진다.
  assert.equal(isMyEvent(row({ createdBy: 'admin', owner: '김관현' }), {}), false)
  assert.equal(isMyEvent(row({ createdBy: 'admin' }), { name: '  ', username: '' }), false)
})

test('빈 칸은 걸리지 않는다', () => {
  assert.equal(isMyEvent(row({}), me), false)
})

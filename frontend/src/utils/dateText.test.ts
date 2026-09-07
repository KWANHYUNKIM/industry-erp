import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dateText } from './dateText.ts'

test('원본대로 슬래시로 찍는다', () => {
  assert.equal(dateText('2026-07-16'), '2026/07/16')
})

test('값이 없으면 빈 글자 — 호출부가 || \'-\' 로 받친다', () => {
  assert.equal(dateText(null), '')
  assert.equal(dateText(undefined), '')
  assert.equal(dateText(''), '')
})

test('뒤에 시각이 붙어 있으면 날짜 앞머리만 바꾼다', () => {
  assert.equal(dateText('2026-07-16T09:30:00'), '2026/07/16T09:30:00')
})

test('날짜가 아닌 글자는 건드리지 않는다 — 코드에 하이픈이 있어도 그대로', () => {
  assert.equal(dateText('QA-2026-07'), 'QA-2026-07')
  assert.equal(dateText('123456-04-567890'), '123456-04-567890')
})

test('이미 슬래시면 그대로', () => {
  assert.equal(dateText('2026/07/16'), '2026/07/16')
})

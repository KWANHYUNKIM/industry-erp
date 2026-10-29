import { test } from 'node:test'
import assert from 'node:assert/strict'
import { minToHours, hoursToMin, fmt2 } from './workHours.ts'

test('분 → 시간: 원본 14H · 26H · 0.2H', () => {
  assert.equal(minToHours(840), 14)
  assert.equal(minToHours(1560), 26)
  assert.equal(minToHours(12), 0.2)
  assert.equal(minToHours(null), 0)
})

test('시간 → 분: 빈 칸은 0, 소수 시간은 분으로 반올림', () => {
  assert.equal(hoursToMin('14'), 840)
  assert.equal(hoursToMin('0.2'), 12)
  assert.equal(hoursToMin(''), 0)
  assert.equal(hoursToMin('abc'), 0)
})

test('합계는 소수 둘째 자리까지(원본 40.00)', () => {
  assert.equal(fmt2(40), '40.00')
  assert.equal(fmt2(1234.5), '1,234.50')
})

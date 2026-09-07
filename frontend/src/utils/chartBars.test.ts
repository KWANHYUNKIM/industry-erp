import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toBars, topRows } from './chartBars.ts'

test('가장 큰 값이 100%', () => {
  const bars = toBars([{ label: 'a', value: 50 }, { label: 'b', value: 100 }])
  assert.equal(bars[1].percent, 100)
  assert.equal(bars[0].percent, 50)
})

test('전부 0이면 막대가 없다 — 0으로 나누지 않는다', () => {
  const bars = toBars([{ label: 'a', value: 0 }, { label: 'b', value: 0 }])
  assert.deepEqual(bars.map((b) => b.percent), [0, 0])
})

test('음수는 절댓값으로 재고 반대편으로 표시한다', () => {
  const bars = toBars([{ label: '매출', value: 100 }, { label: '반품', value: -500 }])
  assert.equal(bars[1].percent, 100)
  assert.equal(bars[1].negative, true)
  // 최댓값(100)만 봤다면 매출이 100% 가 되고 반품은 500% 로 넘친다.
  assert.equal(bars[0].percent, 20)
})

test('값이 0인 줄도 목록에서 빼지 않는다', () => {
  const bars = toBars([{ label: 'a', value: 10 }, { label: 'b', value: 0 }])
  assert.equal(bars.length, 2)
})

test('줄이 적으면 그대로 둔다', () => {
  const rows = [{ label: 'a', value: 1 }, { label: 'b', value: 2 }]
  assert.deepEqual(topRows(rows, 15), rows)
})

test('많으면 큰 것부터 남기고 나머지는 한 줄로 합친다', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ label: `x${i}`, value: i }))
  const out = topRows(rows, 5)
  assert.equal(out.length, 6)
  assert.equal(out[0].value, 19)
  // 잘라 버리지 않는다 — 합계가 보존된다.
  assert.equal(out.reduce((s, r) => s + r.value, 0), rows.reduce((s, r) => s + r.value, 0))
  assert.equal(out[5].label, '그 외 15건')
})

test('합칠 때 음수도 그대로 더한다', () => {
  const rows = [
    { label: 'a', value: 100 }, { label: 'b', value: 90 },
    { label: 'c', value: -30 }, { label: 'd', value: 5 },
  ]
  const out = topRows(rows, 2)
  assert.equal(out[2].value, -25)
})

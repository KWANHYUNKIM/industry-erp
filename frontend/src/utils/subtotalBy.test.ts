import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subtotalBy, UNSET_LABEL } from './subtotalBy.ts'

interface Row { wh: string | null; item: string; qty: number; amt: number }
const rows: Row[] = [
  { wh: '제품창고', item: '모뎀', qty: 3, amt: 300 },
  { wh: '자재창고', item: '케이스', qty: 2, amt: 200 },
  { wh: '제품창고', item: '모뎀', qty: 5, amt: 500 },
  { wh: null, item: '나사', qty: 1, amt: 100 },
  { wh: '', item: '너트', qty: 4, amt: 400 },
]
const M = { qty: (r: Row) => r.qty, amt: (r: Row) => r.amt }

test('같은 키끼리 묶어 더한다', () => {
  const g = subtotalBy(rows, (r) => r.wh, M)
  const prod = g.find((x) => x.label === '제품창고')!
  assert.equal(prod.count, 2)
  assert.equal(prod.sums.qty, 8)
  assert.equal(prod.sums.amt, 800)
})

test('축을 바꾸면 다르게 묶인다', () => {
  const g = subtotalBy(rows, (r) => r.item, M)
  assert.deepEqual(g.map((x) => x.label), ['나사', '너트', '모뎀', '케이스'])
  assert.equal(g.find((x) => x.label === '모뎀')!.sums.qty, 8)
})

test('null 과 빈 값은 (미지정) 하나로 묶는다', () => {
  const g = subtotalBy(rows, (r) => r.wh, M)
  const none = g.find((x) => x.label === UNSET_LABEL)!
  assert.equal(none.count, 2)
  assert.equal(none.sums.qty, 5)
})

test('(미지정) 은 이름 순서에 섞이지 않고 맨 뒤에 선다', () => {
  const g = subtotalBy(rows, (r) => r.wh, M)
  assert.equal(g[g.length - 1].label, UNSET_LABEL)
})

test('소계의 합은 전체 합과 같다 — 줄이 사라지거나 겹치지 않는다', () => {
  for (const keyOf of [(r: Row) => r.wh, (r: Row) => r.item]) {
    const g = subtotalBy(rows, keyOf, M)
    assert.equal(g.reduce((n, x) => n + x.count, 0), rows.length)
    assert.equal(g.reduce((n, x) => n + x.sums.qty, 0), rows.reduce((n, r) => n + r.qty, 0))
  }
})

test('숫자가 아닌 값은 0 으로 친다 — NaN 이 소계를 통째로 삼키지 않는다', () => {
  const g = subtotalBy([{ wh: 'A', item: 'x', qty: NaN, amt: 10 }], (r) => r.wh, M)
  assert.equal(g[0].sums.qty, 0)
  assert.equal(g[0].sums.amt, 10)
})

test('빈 목록은 빈 묶음', () => {
  assert.deepEqual(subtotalBy([], (r: Row) => r.wh, M), [])
})

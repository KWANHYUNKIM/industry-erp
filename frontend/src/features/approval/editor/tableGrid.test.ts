/**
 * 본문 편집기 표 격자 테스트 — rowspan · colspan 이 섞인 표를 격자로 바르게 펴는가.
 *
 *   npm run test:unit
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGrid, cellsIn, coverRect } from './tableGrid.ts'

const c = (name: string, rowSpan = 1, colSpan = 1) => ({ name, rowSpan, colSpan })

test('합친 칸이 덮은 자리를 건너뛰고 다음 칸을 놓는다', () => {
  // A(2줄) B C / (A) D E
  const A = c('A', 2), B = c('B'), C = c('C'), D = c('D'), E = c('E')
  const g = buildGrid([[A, B, C], [D, E]])
  assert.deepEqual(g.grid.map((r) => r.map((x) => x?.name)), [['A', 'B', 'C'], ['A', 'D', 'E']])
  assert.equal(g.pos.get(D)!.col, 1)
})

test('고른 칸이 합친 칸 반쪽에 걸치면 그 칸까지 넓힌다', () => {
  // A B(2칸) / C D E
  const A = c('A'), B = c('B', 1, 2), C = c('C'), D = c('D'), E = c('E')
  const g = buildGrid([[A, B], [C, D, E]])
  const rect = coverRect(g, [D])!
  assert.deepEqual(rect, { r0: 1, c0: 1, r1: 1, c1: 1 })
  const wide = coverRect(g, [A, D])!
  assert.deepEqual(wide, { r0: 0, c0: 0, r1: 1, c1: 2 }) // B 가 c2 까지 걸쳐 넓어짐
  assert.deepEqual(cellsIn(g, wide).map((x) => x.name), ['A', 'B', 'C', 'D', 'E'])
})

test('rowspan 이 표 밖으로 넘치면 마지막 줄에서 자른다', () => {
  const A = c('A', 5), B = c('B')
  const g = buildGrid([[A, B]])
  assert.equal(g.pos.get(A)!.rowSpan, 1)
})

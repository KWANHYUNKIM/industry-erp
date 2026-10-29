/**
 * MyPage 위젯 격자 배치 테스트.
 *
 *   npm run test:unit
 *
 * 위젯이 겹치면 아래 위젯의 제목줄이 가려져 다시 잡을 수 없다 — 어떤 조작 뒤에도 겹침 0 이어야 한다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collides, normalize, place, twoColumns, MIN_H, MIN_W, type GridItem } from './gridLayout.ts'

const noOverlap = (items: GridItem[]) => {
  for (const a of items) for (const b of items) assert.ok(!collides(a, b), `${a.id} ↔ ${b.id} 겹침`)
}

// 원본 기본 배치(일정관리 · 전자결재 · 공지사항 · 오더관리진행단계)
const ORIGIN: GridItem[] = [
  { id: 'cal', x: 0, y: 0, w: 15, h: 10 },
  { id: 'appr', x: 15, y: 0, w: 13, h: 5 },
  { id: 'notice', x: 15, y: 5, w: 13, h: 5 },
  { id: 'order', x: 0, y: 10, w: 28, h: 4 },
]

test('원본 기본 배치는 그대로 둔다', () => {
  assert.deepEqual(normalize(ORIGIN, 41), ORIGIN)
})

test('위젯을 다른 위젯 위로 옮기면 그 위젯이 아래로 비킨다', () => {
  const out = place(ORIGIN, { id: 'order', x: 15, y: 0, w: 13, h: 4 }, 41)
  noOverlap(out)
  const order = out.find((i) => i.id === 'order')!
  assert.deepEqual([order.x, order.y], [15, 0])
  assert.equal(out.find((i) => i.id === 'appr')!.y, 4)
})

test('빈 줄은 위로 떠오른다 — 높이를 줄이면 아래 위젯이 올라온다', () => {
  const out = place(ORIGIN, { id: 'appr', x: 15, y: 0, w: 13, h: 3 }, 41)
  assert.equal(out.find((i) => i.id === 'notice')!.y, 3)
})

test('최소 크기 아래로는 줄지 않는다', () => {
  const out = place(ORIGIN, { id: 'appr', x: 15, y: 0, w: 1, h: 0 }, 41)
  const a = out.find((i) => i.id === 'appr')!
  assert.deepEqual([a.w, a.h], [MIN_W, MIN_H])
})

test('판이 좁아지면 폭을 깎고 겹침을 푼다', () => {
  const out = normalize(ORIGIN, 20)
  noOverlap(out)
  for (const it of out) assert.ok(it.x + it.w <= 20)
})

test('없던 위젯을 놓으면 목록 끝에 더한다', () => {
  const out = place(ORIGIN, { id: 'new', x: 0, y: 0, w: 6, h: 3 }, 41)
  assert.equal(out.at(-1)!.id, 'new')
  noOverlap(out)
})

test('두 단 배치 — 낮은 단에 차례로 쌓는다', () => {
  const out = twoColumns(['a', 'b', 'c'], 24, () => 5)
  assert.deepEqual(out.map((i) => [i.x, i.y, i.w]), [[0, 0, 12], [12, 0, 12], [0, 5, 12]])
})

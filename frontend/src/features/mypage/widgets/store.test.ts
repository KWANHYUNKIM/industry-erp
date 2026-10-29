/**
 * MyPage 위젯 [설정] 이 표에 먹는 규칙 — 종류로 묶기 · 거르기 · 정렬 · 기준일자.
 *
 *   npm run test:unit
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterRows, groupRows, kindOf, rangeOf, sortRows, visibleColumns } from './store.ts'
import type { ColumnDef, Row } from './types.ts'

const cols: ColumnDef[] = [
  { key: 'date', label: '일자' },
  { key: 'item', label: '품명' },
  { key: 'partner', label: '거래처' },
  { key: 'qty', label: '수량', num: true },
  { key: 'memo', label: '적요', off: true },
]
const rows: Row[] = [
  { date: '2026-10-01', item: 'A', partner: '갑', qty: 2 },
  { date: '2026-10-02', item: 'A', partner: '을', qty: 3 },
  { date: '2026-09-30', item: 'B', partner: '갑', qty: 5 },
]

test('품목별 — 같은 품목은 한 줄, 수량은 더하고 서로 다른 글자 열은 비운다', () => {
  const g = groupRows(rows, cols, 'item', '품목별')
  assert.equal(g.length, 2)
  const a = g.find((r) => r.item === 'A')!
  assert.equal(a.qty, 5)
  assert.equal(a.partner, '')
  assert.equal(rows[0].qty, 2, '원래 줄은 건드리지 않는다')
})

test('월별 — 날짜를 달로 잘라 묶는다', () => {
  const g = groupRows(rows, cols, 'date', '월별')
  assert.deepEqual(g.map((r) => [r.date, r.qty]), [['2026-10', 5], ['2026-09', 5]])
})

test('라인별(묶을 열 없음)은 그대로', () => {
  assert.equal(groupRows(rows, cols, undefined, '라인별'), rows)
})

test('검색조건 값으로 거르고 · 정렬한다', () => {
  assert.equal(filterRows(rows, 'partner', '갑').length, 2)
  assert.deepEqual(sortRows(rows, cols, 'qty', true).map((r) => r.qty), [5, 3, 2])
  assert.deepEqual(sortRows(rows, cols, 'date', false).map((r) => r.date), ['2026-09-30', '2026-10-01', '2026-10-02'])
})

test('보일 열 — 기본은 off 아닌 것, 저장한 것이 있으면 그것만', () => {
  assert.deepEqual(visibleColumns(cols, {}).map((c) => c.key), ['date', 'item', 'partner', 'qty'])
  assert.deepEqual(visibleColumns(cols, { columns: ['qty', 'memo'] }).map((c) => c.key), ['qty', 'memo'])
  assert.equal(visibleColumns(cols, { columns: ['gone'] }).length, 4, '다 없어진 열이면 기본으로')
})

test('기준일자 — 금월(~오늘) 기본 · 직접설정은 저장한 기간', () => {
  const t = new Date(2026, 9, 30)
  assert.deepEqual(rangeOf({}, undefined, t), { from: '2026-10-01', to: '2026-10-30' })
  assert.deepEqual(rangeOf({ period: '전일' }, undefined, t), { from: '2026-10-29', to: '2026-10-29' })
  assert.deepEqual(rangeOf({ period: '직접설정', from: '2026-01-01', to: '2026-01-31' }, undefined, t), { from: '2026-01-01', to: '2026-01-31' })
})

test('종류 처음 값 — 라인별이 있으면 라인별, 정해 둔 것이 먼저', () => {
  assert.equal(kindOf({}, { kinds: ['품목별', '라인별'] }), '라인별')
  assert.equal(kindOf({}, { kinds: ['품목별', '안전재고미만품목별'] }), '품목별')
  assert.equal(kindOf({}, { kinds: ['매입', '매출', '매입/매출'], defaultKind: '매입/매출' }), '매입/매출')
  assert.equal(kindOf({ kind: '품목별' }, { kinds: ['품목별', '라인별'] }), '품목별')
})

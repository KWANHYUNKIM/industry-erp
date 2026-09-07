/**
 * 현황 집계 테스트.
 *
 *   npm run test:unit
 *
 * 판매현황·구매현황의 [집계] 모드가 이 계산을 쓴다. 여기가 틀리면 합계가 조용히
 * 어긋나는데, 화면은 멀쩡히 숫자를 보여 주므로 아무도 못 알아챈다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, groupValue, weekOfYear, type AggregatableRow } from './statusAggregate.ts'
import { periodOf } from '../components/periods.ts'

const row = (over: Partial<AggregatableRow> = {}): AggregatableRow => ({
  date: '2026-08-26',
  docNo: 'SO-1',
  partner: '거래처A',
  itemName: '품목A',
  qty: 1,
  supply: 1000,
  vat: 100,
  warehouseName: '본사창고',
  projectName: null,
  taxable: true,
  employeeName: null,
  managementItemName: null,
  ...over,
})

test('주차는 EcPeriodPicks 의 주(월요일 시작)와 같은 셈법이어야 한다', () => {
  // 한쪽만 일요일 시작이면 같은 날이 화면마다 다른 주에 들어간다.
  // 월요일부터 일요일까지가 한 주 — 특히 일요일이 앞 주에 붙는지가 갈리는 지점이다.
  const mondayOf = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return periodOf('금주(~오늘)', new Date(y, m - 1, d))!.from
  }
  const week = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-29', '2026-08-30']
  const numbers = new Set(week.map(weekOfYear))
  assert.equal(numbers.size, 1, '월~일은 같은 주여야 한다')
  assert.equal(new Set(week.map(mondayOf)).size, 1)

  // 앞 일요일과 다음 월요일은 다른 주다
  assert.notEqual(weekOfYear('2026-08-23'), weekOfYear('2026-08-24'))
  assert.notEqual(weekOfYear('2026-08-30'), weekOfYear('2026-08-31'))
  assert.equal(mondayOf('2026-08-23'), '2026-08-17')
})

test('그룹 값 — 날짜 계열', () => {
  const r = row({ date: '2026-08-26' })
  assert.equal(groupValue(r, '일별'), '2026-08-26')
  assert.equal(groupValue(r, '월별'), '2026-08')
  assert.equal(groupValue(r, '연별'), '2026')
  assert.equal(groupValue(r, '분기별'), '2026 3분기')
  assert.equal(groupValue(r, '반기별'), '2026 하반기')
  assert.equal(groupValue(row({ date: '2026-06-30' }), '반기별'), '2026 상반기')
  assert.equal(groupValue(row({ date: '2026-01-01' }), '분기별'), '2026 1분기')
  assert.equal(groupValue(row({ date: '2026-12-31' }), '분기별'), '2026 4분기')
})

test('그룹 값 — 빈 값은 흩어뜨리지 않고 묶는다', () => {
  assert.equal(groupValue(row({ employeeName: null }), '담당자별'), '(미지정)')
  assert.equal(groupValue(row({ projectName: null }), '프로젝트별'), '(없음)')
  assert.equal(groupValue(row({ managementItemName: null }), '관리항목별'), '(없음)')
  // 빈 문자열도 null 과 같이 취급해야 한다 — 안 그러면 빈칸 그룹이 따로 생긴다.
  // 예전엔 관리항목만 그랬고 담당자·프로젝트는 ?? 라 빈 문자열이 그대로 그룹이 됐다.
  assert.equal(groupValue(row({ managementItemName: '' }), '관리항목별'), '(없음)')
  assert.equal(groupValue(row({ employeeName: '' }), '담당자별'), '(미지정)')
  assert.equal(groupValue(row({ projectName: '' }), '프로젝트별'), '(없음)')
})

test('그룹 값 — 거래유형은 과세/면세', () => {
  assert.equal(groupValue(row({ taxable: true }), '거래유형별'), '과세')
  assert.equal(groupValue(row({ taxable: false }), '거래유형별'), '면세')
})

test('그룹 조건이 없으면 빈 문자열', () => {
  assert.equal(groupValue(row(), ''), '')
})

test('집계는 수량·공급가·부가세를 더하고 건수를 센다', () => {
  const rows = [
    row({ itemName: '가', qty: 2, supply: 1000, vat: 100 }),
    row({ itemName: '가', qty: 3, supply: 2000, vat: 200 }),
    row({ itemName: '나', qty: 1, supply: 500, vat: 50 }),
  ]
  const out = aggregate(rows, '품목별', '')
  assert.equal(out.length, 2)
  const 가 = out.find((x) => x.g1 === '가')!
  assert.deepEqual(
    { count: 가.count, qty: 가.qty, supply: 가.supply, vat: 가.vat },
    { count: 2, qty: 5, supply: 3000, vat: 300 })
})

test('집계 합계는 원본 합계와 같아야 한다 — 어떻게 묶든', () => {
  const rows = [
    row({ itemName: '가', partner: 'A', qty: 2, supply: 1000, vat: 100 }),
    row({ itemName: '나', partner: 'A', qty: 3, supply: 2000, vat: 200 }),
    row({ itemName: '가', partner: 'B', qty: 1, supply: 500, vat: 50 }),
  ]
  const total = (list: { qty: number; supply: number; vat: number }[]) =>
    list.reduce((a, r) => ({ qty: a.qty + r.qty, supply: a.supply + r.supply, vat: a.vat + r.vat }),
      { qty: 0, supply: 0, vat: 0 })
  const expected = total(rows)
  for (const [g1, g2] of [['품목별', ''], ['거래처별', ''], ['품목별', '거래처별'], ['', '']] as const) {
    assert.deepEqual(total(aggregate(rows, g1, g2)), expected, `${g1}/${g2} 에서 합계가 어긋난다`)
  }
})

test('2단계 그룹은 조합마다 한 줄', () => {
  const rows = [
    row({ itemName: '가', partner: 'A' }),
    row({ itemName: '가', partner: 'B' }),
    row({ itemName: '나', partner: 'A' }),
    row({ itemName: '가', partner: 'A' }),
  ]
  assert.equal(aggregate(rows, '품목별', '거래처별').length, 3)
})

test('금액이 큰 그룹이 위로 온다', () => {
  const out = aggregate([
    row({ itemName: '작은', supply: 100 }),
    row({ itemName: '큰', supply: 9000 }),
  ], '품목별', '')
  assert.equal(out[0].g1, '큰')
})

test('빈 목록은 빈 결과', () => {
  assert.deepEqual(aggregate([], '품목별', ''), [])
})

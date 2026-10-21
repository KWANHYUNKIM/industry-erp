import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTree, percentOf, shiftPeriod, type AggEntry } from './journalAggregate.ts'

const e = (date: string, partner: string, code: string, supply: number, vat = 0): AggEntry => ({
  date, partner, partnerCode: code, dept: '', deptCode: '', project: '', projectCode: '',
  supply, vat, fee: 0, withholding: 0, foreign: 0, total: supply + vat,
})

test('월별 + 거래처: 빈 거래처가 코드순 맨 앞, 합계는 공급가액 · 합계 따로', () => {
  const t = buildTree([[e('2026-09-28', '이카운트', '2208', 4000000, 400000), e('2026-09-27', '', '', 60000), e('2026-10-01', '(주)구로', '00010', 3850000)]],
    [{ key: '월별', sort: '시간순', desc: false }, { key: '거래처', sort: '코드순', desc: false }], ['공급가액', '합계'])
  assert.deepEqual(t.children.map((m) => m.label), ['2026/09', '2026/10'])
  assert.deepEqual(t.children[0].children.map((p) => p.label), ['', '이카운트'])
  assert.equal(t.children[0].sums[0]['합계'], 4460000)
  assert.equal(t.sums[0]['공급가액'], 7910000)
})

test('비교기간 전월동일기간은 시작 · 끝을 한 달씩 민다', () => {
  assert.deepEqual(shiftPeriod('2026-09-22', '2026-10-22', '전월동일기간'), { from: '2026-08-22', to: '2026-09-22' })
})

test('비율은 정수 %, 0 이면 빈칸', () => {
  assert.equal(percentOf(530145000, 1698988000), '31')
  assert.equal(percentOf(6500000, 1698988000), '')
})

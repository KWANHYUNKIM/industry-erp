/**
 * 월별채권/채무증감내역 셈 테스트.
 *
 *   npm run test:unit
 *
 * <p>두 표(월별 합계 · 거래처별 × 달)는 같은 자료를 두 번 센다. 그래서 <b>늘 맞아야 한다</b> —
 * 2026-09-21 에 둘이 어긋나 있었다(거래처별 이월이 늘 0). 그 불변식과 그때 사라졌던 줄을 못 박는다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthRows, partnerYearRows, type ArApDoc, type ArApOpening } from './monthlyArAp.ts'

const all = () => true
/* 2027 판에서 실제로 본 모양을 줄였다: 이월 있는 거래처 둘, 그중 하나는 그 해 거래가 없다. */
const openings: ArApOpening[] = [
  { name: 'QA고객사', receivable: 26_281_690, payable: 0 },
  { name: '한울ICT', receivable: 22_000, payable: 0 },
]
const sales: ArApDoc[] = [{ date: '2027-05-10', amt: 9_845_000, name: 'QA고객사' }]
const receipts: ArApDoc[] = []

test('거래처별 이월을 다 더하면 월별 1월 이월이다', () => {
  const months = monthRows(sales, receipts, openings, all, 'AR', 2027)
  const partners = partnerYearRows(sales, receipts, openings, all, 'AR', 2027)
  assert.equal(partners.reduce((n, r) => n + r.opening, 0), months[0].opening)
  assert.equal(months[0].opening, 26_303_690)
})

test('거래처별 기말을 다 더하면 월별 12월 잔액이다', () => {
  const months = monthRows(sales, receipts, openings, all, 'AR', 2027)
  const partners = partnerYearRows(sales, receipts, openings, all, 'AR', 2027)
  assert.equal(partners.reduce((n, r) => n + r.closing, 0), months[11].closing)
  assert.equal(months[11].closing, 36_148_690)
})

test('그 해 거래가 없어도 이월이 있으면 줄이 선다 — 고치기 전에는 한울ICT 가 사라졌다', () => {
  const partners = partnerYearRows(sales, receipts, openings, all, 'AR', 2027)
  const hanul = partners.find((r) => r.name === '한울ICT')
  assert.ok(hanul, '이월만 있는 거래처의 줄이 없다')
  assert.equal(hanul.opening, 22_000)
  assert.equal(hanul.closing, 22_000)
})

test('이월은 서버 잔액에서만 온다 — 전 해 전표가 섞여 와도 이월로 접지 않는다', () => {
  /* 예전 셈은 y < year 인 전표를 접어 이월을 냈다. 서버 잔액과 겹쳐 두 번 세게 된다. */
  const withLastYear = [...sales, { date: '2026-12-01', amt: 1_000, name: 'QA고객사' }]
  const partners = partnerYearRows(withLastYear, receipts, openings, all, 'AR', 2027)
  assert.equal(partners.find((r) => r.name === 'QA고객사')?.opening, 26_281_690)
})

test('거래처를 고르면 이월도 그 거래처만 센다 — 두 표가 같은 잣대를 쓴다', () => {
  const onlyQa = (n: string) => n === 'QA고객사'
  const months = monthRows(sales, receipts, openings, onlyQa, 'AR', 2027)
  const partners = partnerYearRows(sales, receipts, openings, onlyQa, 'AR', 2027)
  assert.deepEqual(partners.map((r) => r.name), ['QA고객사'])
  assert.equal(months[0].opening, 26_281_690)
  assert.equal(partners[0].opening, months[0].opening)
})

test('채무 판은 payable 을 이월로 쓴다', () => {
  const ap: ArApOpening[] = [{ name: '공급사', receivable: 5, payable: 700 }]
  const partners = partnerYearRows([], [], ap, all, 'AP', 2027)
  assert.equal(partners[0].opening, 700)
  assert.equal(monthRows([], [], ap, all, 'AP', 2027)[0].opening, 700)
})

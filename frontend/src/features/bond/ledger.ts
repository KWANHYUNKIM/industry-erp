import { bondKey, signed, type BondRow } from './types'

/** 채권거래내역 · 증가 · 감소현황의 기간 빠른선택 — 금일 … 전월 · 종료일 · 최근30일(2026-10-12 원본 실측). */
export const BOND_FLOW_PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일', '최근30일'] as const
/** 채권현황(기준일자 한 날) — 금일 … 전월 · 이번기수 · 직전기수 · 종료일. */
export const BOND_STATUS_PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '이번기수', '직전기수', '종료일'] as const

/** 한 채권(계정 · 거래처 · 채권번호)의 기준일 잔액. 발생일자 · 만기일자 · 적요는 그 번호의 첫 증가 줄에서 온다. */
export interface OpenBond {
  key: string
  bondNo: string
  accountId: number
  accountCode: string
  accountName: string
  partnerId: number | null
  partnerCode: string | null
  partnerName: string | null
  issueDate: string
  dueDate: string | null
  memo: string | null
  departmentId: number | null
  projectName: string | null
  balance: number
}

/** 기준일(포함)까지 남은 채권 — 잔액이 0 인 번호는 뺀다(원본 채권현황 · 채권감소등록). */
export function openBonds(rows: BondRow[], asOf: string): OpenBond[] {
  const m = new Map<string, OpenBond>()
  const sorted = rows.filter((r) => r.entryDate <= asOf)
    .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.entryNo - b.entryNo))
  for (const r of sorted) {
    const k = bondKey(r)
    let b = m.get(k)
    if (!b) {
      b = {
        key: k, bondNo: r.bondNo, accountId: r.accountId, accountCode: r.accountCode, accountName: r.accountName,
        partnerId: r.partnerId, partnerCode: r.partnerCode, partnerName: r.partnerName,
        issueDate: r.entryDate, dueDate: null, memo: null, departmentId: r.departmentId, projectName: r.projectName, balance: 0,
      }
      m.set(k, b)
    }
    if (r.direction === 'INCREASE' && b.dueDate == null && b.memo == null) {
      b.issueDate = r.entryDate
      b.dueDate = r.dueDate
      b.memo = r.memo
      b.departmentId = r.departmentId
      b.projectName = r.projectName
    }
    b.balance += signed(r)
  }
  return [...m.values()].filter((b) => Math.round(b.balance) !== 0)
}

/** 거래처 이름 차례(원본 채권현황 · 증가현황의 거래처 소계 차례). 거래처 없는 줄은 끝. */
export const byPartnerName = (a: { partnerName: string | null }, b: { partnerName: string | null }) =>
  (a.partnerName ?? '￿').localeCompare(b.partnerName ?? '￿', 'ko')

import { api } from '../../api/client'
import { bankLabel } from '../../utils/bankLabel'
import type { JournalEntry } from '../../types/api'
import type { FundPlan, FundPlanDirection, FundPlanMethod } from './types'

/**
 * 회계 II › 자금계획 › 출력물 — <b>추정자금월보 · 연보</b>가 같이 쓰는 계산(2026-10-12 loginaa 실측).
 *
 * <p>추정자금 = <b>실적</b>(실적기준일까지 회계전표의 자금 계정 증감) + <b>계획</b>(실적기준일 뒤의 계획전표).
 * 실적기준일 뒤의 회계전표는 빠지고(원본: 기준일 10/12 에 10/13 · 10/21 예금 거래가 안 보이다가 기준일을 10/22 로 옮기면 실적에 든다),
 * 실적기준일 앞의 계획전표도 빠진다(기준일 10/22 에 10/20 계획이 사라짐). [실적기준일의 계획전표 포함하기](기본 켬)는 그날 계획을 넣는다.
 * 계획은 입력구분이 늘 '자금'이라 예금(현금)이든 어음이든 자금증가 · 자금감소로 잡힌다(입금 · 어음 10,000 → 연보 자금증가 +10,000).
 *
 * <p>자금 계정은 회계 I 자금일보와 같은 현금 · 당좌 · 보통예금(101 · 102 · 103).
 */
export const FUND_CODES = ['1019', '1029', '1039']

export interface ActualMove {
  key: string; date: string; text: string; partner: string; inc: number; dec: number
  /** 일보 1~4번 표 — 계정 · 통장 · 상대계정 · 전표. */
  entryId: number; accountCode: string; accountName: string; bookKey: string; bookLabel: string; counter: string; entryPartner: string
  /** 같은 전표의 줄이 모두 자금 계정이면 계좌간이동(원본 4번 표). */
  transfer: boolean
}
export interface PlanFilter {
  dir: '' | FundPlanDirection
  method: '' | FundPlanMethod
  fundKind: boolean
  dept: string
  project: string
  includeBaseDay: boolean
}

interface JournalList { rows: JournalEntry[] }
interface BankTxn { journalEntryId: number | null; bankAccountId: number }
interface BankAccount { id: number; name: string | null; bankName: string | null; accountNo: string | null }

/** 처음부터 실적기준일까지의 자금 계정 줄 — 이월을 내려고 처음부터 받는다. 예금 줄의 거래처 자리는 그 전표를 만든 통장. */
export async function fetchActualMoves(baseDate: string): Promise<ActualMove[]> {
  const [r, t, a] = await Promise.all([
    api.get<JournalList>('/journals', { params: { from: '1900-01-01', to: baseDate, all: true } }),
    api.get<{ rows: BankTxn[] }>('/bank-cards/transactions', { params: { all: true, from: '1900-01-01', to: baseDate } }).catch(() => ({ data: { rows: [] as BankTxn[] } })),
    api.get<BankAccount[]>('/bank-cards/accounts').catch(() => ({ data: [] as BankAccount[] })),
  ])
  const acc = new Map(a.data.map((x) => [x.id, x]))
  const bookOf = new Map(t.data.rows.filter((x) => x.journalEntryId != null && acc.has(x.bankAccountId))
    .map((x) => [x.journalEntryId!, bankLabel(acc.get(x.bankAccountId)!)]))
  const out: ActualMove[] = []
  const sorted = [...r.data.rows].sort((x, y) => (x.entryDate < y.entryDate ? -1 : x.entryDate > y.entryDate ? 1 : x.docNo.localeCompare(y.docNo)))
  for (const e of sorted) {
    const transfer = e.lines.every((o) => FUND_CODES.includes(o.accountCode))
    for (const l of e.lines) {
      if (!FUND_CODES.includes(l.accountCode)) continue
      const d = Number(l.debit), c = Number(l.credit)
      if (!d && !c) continue
      const book = l.accountCode === '1019' ? undefined : bookOf.get(e.id)
      const partner = book || e.partnerName || ''
      const others = [...new Set(e.lines.filter((o) => o !== l && !FUND_CODES.includes(o.accountCode)).map((o) => o.accountName))]
      const counter = others.length === 0 ? '' : others.length === 1 ? others[0] : `${others[0]} 외 ${others.length - 1}`
      out.push({
        key: `${e.id}-${l.id}`, date: e.entryDate, text: l.description ?? e.description ?? '', partner, inc: d, dec: c,
        entryId: e.id, accountCode: l.accountCode, accountName: l.accountName, bookKey: book ? `#${book}` : '[ ]', bookLabel: book ?? '[ ]',
        counter, entryPartner: e.partnerName ?? '', transfer,
      })
    }
  }
  return out
}

/** 원본 계획포함 조건 · 부서 · 프로젝트 · 실적기준일로 거른 계획전표. */
export function filterPlans(plans: FundPlan[], baseDate: string, f: PlanFilter): FundPlan[] {
  return plans
    .filter(() => f.fundKind)
    .filter((p) => (f.includeBaseDay ? p.planDate >= baseDate : p.planDate > baseDate))
    .filter((p) => !f.dir || p.direction === f.dir)
    .filter((p) => !f.method || p.method === f.method)
    .filter((p) => !f.dept || String(p.departmentId) === f.dept)
    .filter((p) => !f.project || String(p.projectId) === f.project)
    .sort((a, b) => (a.planDate < b.planDate ? -1 : a.planDate > b.planDate ? 1 : a.id - b.id))
}

export const planInc = (p: FundPlan) => (p.direction === 'IN' ? Number(p.amount) : 0)
export const planDec = (p: FundPlan) => (p.direction === 'OUT' ? Number(p.amount) : 0)

/** 0 은 빈칸, 음수는 '-'(연보 순증가액 -20,000). */
export const amt = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
export const slash = (d: string) => d.replace(/-/g, '/')
/** 'YYYY-MM' 의 말일. */
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

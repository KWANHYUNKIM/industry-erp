import { api } from '../../api/client'

/**
 * 회계 I › FastEntry › 잔액조정(입력 · 실사조회 · 조회 · 현황) — 서버 /api/journals/balance-adjustments(BalanceAdjustController).
 * 원본 2026-10-14 loginaa 실측은 plans/회계1/E010209.md.
 */
export interface AccountBalanceRow {
  accountId: number; code: string; name: string; division: string; aggregation: string
  debitAmount: number; creditAmount: number; adjustmentIds: number[]
}
export interface AuditGroupRow { departmentId: number | null; projectId: number | null; bookAmount: number; actualAmount: number; memo: string | null }
export interface AuditResponse { asOf: string; accountId: number; accountCode: string; accountName: string; rows: AuditGroupRow[] }
export interface AdjustmentRow {
  entryId: number; docNo: string; entryDate: string; accountId: number | null; accountCode: string | null; accountName: string | null
  bookAmount: number; actualAmount: number; memo: string | null; createdBy: string | null
}
export interface StatusRow {
  entryDate: string; accountCode: string; accountName: string; partnerName: string | null; departmentId: number | null; projectId: number | null
  afterDebit: number | null; afterCredit: number | null; diffDebit: number | null; diffCredit: number | null; memo: string | null
}
export interface SaveRow { departmentId: number | null; projectId: number | null; actualAmount: number | null; memo: string | null }

export const fetchAccounts = (asOf: string, dept = 0, proj = 0) =>
  api.get<AccountBalanceRow[]>('/journals/balance-adjustments/accounts', { params: { asOf, dept, proj } }).then((r) => r.data)
export const fetchAudit = (asOf: string, accountId: number, entryId?: number) =>
  api.get<AuditResponse>('/journals/balance-adjustments/audit', { params: { asOf, accountId, entryId } }).then((r) => r.data)
export const saveAdjustment = (body: { asOf: string; accountId: number; zeroUnchanged: boolean; rows: SaveRow[]; replaceEntryId?: number | null }) =>
  api.post<AdjustmentRow>('/journals/balance-adjustments', body).then((r) => r.data)
export const fetchAdjustments = (from: string, to: string) =>
  api.get<AdjustmentRow[]>('/journals/balance-adjustments', { params: { from, to } }).then((r) => r.data)
export const fetchAdjustStatus = (from: string, to: string) =>
  api.get<StatusRow[]>('/journals/balance-adjustments/status', { params: { from, to } }).then((r) => r.data)
export const deleteAdjustments = (ids: number[]) => api.post('/journals/balance-adjustments/delete', ids)

export const won = (n: number | null | undefined) => (n == null ? '' : Math.round(Number(n)).toLocaleString('ko-KR'))
/** 원본 [잔액조정번호] · [회계전표] 모양 — GL-20260930-0016 → '2026/09/30 -16'(잔액조정조회 · 잔액실사조회 실측). */
export function adjustNo(docNo: string) {
  const m = /^[A-Z]+-(\d{4})(\d{2})(\d{2})-0*(\d+)$/.exec(docNo)
  return m ? `${m[1]}/${m[2]}/${m[3]} -${m[4]}` : docNo
}
export const slashDate = (d: string) => d.replaceAll('-', '/')

/** 원본 [계정종류] 체크칸 — 자산 · 부채 · 자본 · 손익 · 원가1 · 원가2 · 원가3 · 없음. 우리 계정 구분은 다섯이라 원가 · 없음에 걸리는 계정은 없다. */
export const ACCOUNT_KINDS: { key: string; label: string; divisions: string[] }[] = [
  { key: 'AS', label: '자산', divisions: ['ASSET'] },
  { key: 'DE', label: '부채', divisions: ['LIABILITY'] },
  { key: 'CP', label: '자본', divisions: ['EQUITY'] },
  { key: 'PL', label: '손익', divisions: ['REVENUE', 'EXPENSE'] },
  { key: 'CA', label: '원가1', divisions: [] },
  { key: 'CB', label: '원가2', divisions: [] },
  { key: 'CC', label: '원가3', divisions: [] },
  { key: 'XX', label: '없음', divisions: [] },
]

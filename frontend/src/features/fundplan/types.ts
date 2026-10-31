/** 회계 II › 자금계획 — 계획전표. 서버 FundPlanDtos 와 같은 모양. */
export type FundPlanDirection = 'OUT' | 'IN'
export type FundPlanMethod = 'DEPOSIT' | 'NOTE'

export interface FundPlan {
  id: number
  direction: FundPlanDirection
  directionName: string
  planDate: string
  departmentId: number | null
  projectId: number | null
  projectName: string | null
  method: FundPlanMethod
  methodName: string
  bankAccountId: number | null
  bankAccountCode: string | null
  bankAccountName: string | null
  bankGlAccountId: number | null
  bankGlAccountName: string | null
  noteNo: string | null
  counterAccountId: number | null
  counterAccountCode: string | null
  counterAccountName: string | null
  partnerId: number | null
  partnerCode: string | null
  partnerName: string | null
  amount: number
  memo: string | null
  createdBy: string | null
  updatedBy: string | null
}

export interface BankAccountOpt {
  id: number
  code: string | null
  name: string | null
  bankName: string
  accountNo: string
  glAccountId: number
  glAccountName: string
  balance: number
  active: boolean
}

export const bankLabel = (b: BankAccountOpt) => b.name ?? `${b.bankName} ${b.accountNo}`
/**
 * 원본 목록 · 계획전표현황 [입력구분] 열 — 계획전표는 예금(현금)이든 어음이든 늘 '자금'(2026-10-12 실측: 입금 · 어음 50,000 도 '자금').
 * '수금 · 지급 · 어음 · 채권 · 채무' 는 다른 전표에서 오는 계획이라 계획전표에는 없다.
 */
export const methodCell = (_m: FundPlanMethod) => '자금'

/** 계획전표현황 캘린더 칸 글자 — 원본 실측: 예금(현금)증가 · 예금(현금)감소 · 받을어음증가 · 지급어음증가. */
export const calendarLabel = (d: FundPlanDirection, m: FundPlanMethod) =>
  m === 'NOTE' ? (d === 'IN' ? '받을어음증가' : '지급어음증가') : (d === 'IN' ? '예금(현금)증가' : '예금(현금)감소')
export const CALENDAR_LABEL_ORDER = ['예금(현금)증가', '예금(현금)감소', '받을어음증가', '지급어음증가']

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
/** 원본 목록 [입력구분] 열 — 예금(현금)은 '자금', 어음은 '어음'. */
export const methodCell = (m: FundPlanMethod) => (m === 'NOTE' ? '어음' : '자금')
export const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

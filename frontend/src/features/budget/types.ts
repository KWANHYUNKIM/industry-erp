/** 회계 II › 예산관리(E020201 · E020202~06) — 서버 BudgetDtos 와 같은 모양. */
export interface BudgetAccountRow {
  accountId: number
  accountCode: string
  accountName: string
  division: string
  total: number
}

/** 예산입력 창 한 줄(부서 × 프로젝트). 부서 · 프로젝트 null = 원본 '[00]기타'. months = 1~12월. */
export interface BudgetPlanLine {
  id: number | null
  departmentId: number | null
  projectId: number | null
  remark: string | null
  months: number[]
  total: number
}

export interface BudgetAccountDetail {
  year: number
  accountId: number
  accountCode: string
  accountName: string
  lines: BudgetPlanLine[]
}

export interface BudgetReportPlan {
  year: number
  accountId: number
  accountCode: string
  accountName: string
  departmentId: number | null
  projectId: number | null
  months: number[]
}

export interface BudgetActualLine {
  journalId: number
  date: string
  docNo: string
  description: string | null
  partnerName: string | null
  accountId: number
  amount: number
  departmentId: number | null
  projectId: number | null
}

export interface BudgetReport {
  plans: BudgetReportPlan[]
  actuals: BudgetActualLine[]
}

/** 원본 숫자 칸 — 쉼표, 0 은 '0'. */
export const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 월별예산입력 [배분] — 원본 기존 자료 50,000,000 → 4,166,666 · 4,166,666 · 4,166,668(분기 끝 달에 나머지).
 * 분기 = 총액 ÷ 4 내림(나머지는 4/4분기), 달 = 분기 ÷ 3 내림, 분기 끝 달 = 분기 − 앞 두 달.
 */
export function distribute(total: number): number[] {
  const t = Math.max(0, Math.floor(total))
  const q = Math.floor(t / 4)
  const out: number[] = []
  for (let i = 0; i < 4; i++) {
    const qt = i === 3 ? t - q * 3 : q
    const m = Math.floor(qt / 3)
    out.push(m, m, qt - m * 2)
  }
  return out
}

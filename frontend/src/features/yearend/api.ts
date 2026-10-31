import { api } from '../../api/client'

/** 연말정산(E030109) · 중도정산(E030114) — 서버 TaxSettlementController(accounting) · YearEndPayController(hr). */
export type SettlementKind = 'YEAR_END' | 'MID_TERM'
export type DeductionKind = 'PROTECTION_INSURANCE' | 'DISABLED_INSURANCE' | 'MEDICAL'
export type DataSource = 'NTS' | 'OTHER'

export type PrevEmployer = {
  id?: number; lineNo?: number; bizNo: string; companyName: string; periodFrom: string | null; periodTo: string | null
  salary: number; bonus: number; otherPay: number; taxablePay?: number; nonTaxable: number; reducedIncome: number
  nationalPension: number; otherPension: number; healthInsurance: number; employmentInsurance: number
  decidedIncomeTax: number; decidedLocalTax: number; decidedRuralTax: number
}

export type Deduction = {
  id?: number; lineNo?: number; kind: DeductionKind | null; targetName: string; relation: string
  dataSource: DataSource; unlimited: boolean; amount: number; receiptCount: number | null
}

/** 원천징수영수증 칸 낱낱(계산기 Result) — 계산처리 뒤에만 온다. */
export type Receipt = {
  totalSalary: number; earnedIncomeDeduction: number; earnedIncomeAmount: number; personalDeduction: number
  pensionDeduction: number; specialIncomeDeduction: number; otherIncomeDeduction: number; incomeDeductionTotal: number
  taxBase: number; computedTax: number; taxReduction: number; earnedIncomeTaxCredit: number; childTaxCredit: number
  insuranceBase: number; insuranceCredit: number; medicalBase: number; medicalCredit: number; otherSpecialTaxCredit: number
  standardTaxCredit: number; otherTaxCredit: number; taxCreditTotal: number; standardChosen: boolean
  decidedIncomeTax: number; decidedLocalTax: number; decidedRuralTax: number
  prevIncomeTax: number; prevLocalTax: number; currentIncomeTax: number; currentLocalTax: number
  balanceIncomeTax: number; balanceLocalTax: number
}

export type Settlement = {
  id: number; attributionYear: number; employeeId: number; kind: SettlementKind; withholdingMonth: string | null
  standardAuto: boolean; childCredit: boolean; singleRate: boolean; basicDeductionCount: number; memo: string | null
  calculatedAt: string | null
  totalPay: number; totalSalary: number; earnedIncomeDeduction: number; earnedIncomeAmount: number; incomeDeductionTotal: number
  taxBase: number; computedTax: number; taxReduction: number; taxCreditTotal: number; standardTaxCredit: number
  decidedIncomeTax: number; decidedLocalTax: number; decidedRuralTax: number
  prevIncomeTax: number; prevLocalTax: number; currentIncomeTax: number; currentLocalTax: number
  balanceIncomeTax: number; balanceLocalTax: number
  receipt: Receipt | null
  prevEmployers: PrevEmployer[]; deductions: Deduction[]
}

export type Candidate = { employeeId: number; code: string; name: string; resignDate: string | null }

export const yearEndApi = {
  list: (year: number, kind: SettlementKind) => api.get<Settlement[]>('/tax-settlements', { params: { year, kind } }).then((r) => r.data),
  get: (id: number) => api.get<Settlement>(`/tax-settlements/${id}`).then((r) => r.data),
  candidates: (year: number, kind: SettlementKind, includeRetired: boolean) =>
    api.get<Candidate[]>(`/tax-settlements/candidates`, { params: { year, kind, includeRetired } }).then((r) => r.data),
  addTargets: (attributionYear: number, kind: SettlementKind, employeeIds: number[]) =>
    api.post<Settlement[]>(`/tax-settlements/targets`, { attributionYear, kind, employeeIds }).then((r) => r.data),
  remove: (ids: number[]) => api.post(`/tax-settlements/delete`, ids),
  calculate: (ids: number[]) => api.post<Settlement[]>(`/tax-settlements/calculate`, ids).then((r) => r.data),
  saveWithholdingMonth: (id: number, withholdingMonth: string) =>
    api.put<Settlement>(`/tax-settlements/${id}/withholding-month`, { withholdingMonth }).then((r) => r.data),
  savePrevEmployers: (id: number, rows: PrevEmployer[]) => api.put<Settlement>(`/tax-settlements/${id}/prev-employers`, rows).then((r) => r.data),
  saveDeductions: (id: number, group: 'INSURANCE' | 'MEDICAL', rows: Deduction[]) =>
    api.put<Settlement>(`/tax-settlements/${id}/deductions`, rows, { params: { group } }).then((r) => r.data),
}

/** 원본 숫자 칸 — 쉼표, 0 은 0 */

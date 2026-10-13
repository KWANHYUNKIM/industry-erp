/** 4대보험신고 — 서버 /api/hr/insurance 의 요청 · 응답(InsuranceReportDtos). */
export type InsuranceKind = 'ACQUIRE' | 'LOSS' | 'DEPENDENT'

export interface InsuranceWorkplace { id: number; name: string; manageNo: string; phone: string | null; active: boolean }

export interface InsuranceReport {
  id: number
  reportDate: string
  reportSeq: number
  kind: InsuranceKind
  formName: string
  employeeId: number
  employeeCode: string
  employeeName: string
  pensionWorkplace: InsuranceWorkplace | null
  healthWorkplace: InsuranceWorkplace | null
  employmentWorkplace: InsuranceWorkplace | null
  accidentWorkplace: InsuranceWorkplace | null
  pensionApply: boolean
  pensionDate: string | null
  healthApply: boolean
  healthDate: string | null
  employmentApply: boolean
  employmentDate: string | null
  accidentApply: boolean
  accidentDate: string | null
  phone: string | null
  detail: string | null
  dependents: string | null
  deleted: boolean
}

export const INSURANCE_FORM_NAMES: Record<InsuranceKind, string> = {
  ACQUIRE: '사업장가입자 자격취득 신고서',
  LOSS: '사업장가입자 자격상실 신고서',
  DEPENDENT: '피부양자 자격(취득,상실) 신고서',
}

export const INSURANCE_INPUT_PATHS: Record<InsuranceKind, string> = {
  ACQUIRE: '/hr/insurance/acquire',
  LOSS: '/hr/insurance/loss',
  DEPENDENT: '/hr/insurance/dependent',
}

/** 원본 저장 거절 창의 머리 세 줄(급여 [선택삭제] 거절과 같은 창). */
export const REJECT_HEAD = '아래의 경우 처리가 불가능합니다.\n자세한 내용은 아래의 사항을 참고하시기 바랍니다.\n아래 사항을 수정 후 다시 진행하시기 바랍니다.'

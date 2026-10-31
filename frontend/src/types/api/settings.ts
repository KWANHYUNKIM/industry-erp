// 백엔드 응답과 매칭되는 타입 — Self-Customizing(통화 · 공통코드 · 사용자정의). types/api.ts 가 다시 내보낸다(기존 import 경로 그대로).

// ===== 외화 (통화 마스터 · 고시환율) =====

export interface Currency {
  id: number
  code: string
  name: string
  symbol: string | null
  /** 고시 단위 (JPY는 100) */
  unit: number
  active: boolean
  latestRate: number | null
  latestRateDate: string | null
}

export interface ExchangeRate {
  id: number
  currencyId: number
  currencyCode: string
  currencyName: string
  unit: number
  rateDate: string
  rate: number
  /** 1 통화당 원화 (rate / unit) */
  ratePerUnit: number
  createdBy: string | null
}

export interface CurrencyConversion {
  currencyId: number
  currencyCode: string
  baseDate: string
  appliedRateDate: string
  appliedRate: number
  unit: number
  foreignAmount: number
  krwAmount: number
}

// ===== 사용자정의 필드(Self-Customizing) =====

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'CODE'

export interface CustomFieldDef {
  id: number
  entityType: string
  fieldKey: string
  label: string
  fieldType: CustomFieldType
  fieldTypeName: string
  options: string | null
  required: boolean
  sortOrder: number
  active: boolean
}

export interface EntityCustomFields {
  defs: CustomFieldDef[]
  values: Record<string, string>
}

// ===== 공통코드 =====

export interface CommonCode {
  id: number
  code: string
  name: string
  value1: string | null
  value2: string | null
  sortOrder: number
  active: boolean
  remark: string | null
}

export interface CodeGroup {
  id: number
  groupCode: string
  name: string
  description: string | null
  system: boolean
  active: boolean
  codes: CommonCode[]
}

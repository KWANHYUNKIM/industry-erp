/** 회계 II › 계약관리(정기청구) — 서버 com.erp.accounting.{contractitem, billingcontract, contractbill} 응답. */
export type BillingCycle = 'ONCE' | 'PERIODIC'

export interface ContractItemRow {
  id: number; code: string; name: string; unitPrice: number; vatIncluded: boolean
  billingCycle: BillingCycle; billingCycleName: string
  salesAccountId: number | null; salesAccountCode: string | null; salesAccountName: string | null; active: boolean
}

export interface BillingUnitRow { id: number; code: string; name: string }

export interface ContractLineRow {
  id: number; lineNo: number; itemId: number; itemCode: string; itemName: string; billMonths: string
  quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number
  billingUnitId: number | null; billingUnitCode: string | null; billingUnitName: string | null; remark: string | null
}

export interface BillingContractRow {
  id: number; contractDate: string; docNo: number; code: string; name: string | null
  partnerId: number; partnerCode: string; partnerName: string
  billStart: string; billEnd: string; vatType: string; foreignCurrency: boolean
  employeeId: number | null; departmentId: number | null; projectId: number | null; projectName: string | null
  remark: string | null; totalAmount: number; lines: ContractLineRow[]
}

export interface BillableLine {
  contractLineId: number; contractId: number; contractDate: string; docNo: number; contractCode: string; contractName: string | null
  partnerId: number; partnerName: string; itemCode: string; itemName: string; billMonth: string; billMonths: string
  quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number
  billingUnitId: number; billingUnitCode: string; billingUnitName: string; remark: string | null
}

export interface BillLineRow {
  id: number; contractLineId: number; itemCode: string; itemName: string; contractCode: string; contractName: string | null
  partnerId: number; partnerName: string; billMonth: string
  quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number
  billingUnitCode: string | null; billingUnitName: string | null; remark: string | null
}

export interface ContractBillRow {
  id: number; billDate: string; docNo: number; vatType: string
  accountingReflected: boolean; salesCreated: boolean; totalAmount: number; lines: BillLineRow[]
}

/** 원본 계약입력 [부가세유형] 목록(2026-10-13 실측) — 기본 세금계산서. */
export const VAT_TYPES = ['세금계산서', '영세율', '계산서', '소매매출', '수출', '카드매출', '계산서(고정자산)', '세.계(고정자산)',
  '소매(면세)', '카드매출(면세)', '현금영수증(면세)']

export const won = (n: number) => Math.round(Number(n)).toLocaleString('ko-KR')

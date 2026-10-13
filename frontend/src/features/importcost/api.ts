/**
 * 회계 II › 수입비용(輸入 — 미착품) 묶음이 같이 쓰는 타입 · 경로(원본 2026-10-14 loginaa 실측 — plans/회계2/수입비용.md).
 * 서버: /api/import-costs (accounting/importcost).
 */

export interface ImportCostItem { id: number; code: string; name: string; sortOrder: number; active: boolean }

export interface ImportLot {
  id: number; code: string; name: string
  partnerId: number; partnerCode: string; partnerName: string
  firstTradeDate: string | null; remark: string | null; active: boolean
}

export type ImportCostKind = 'BILL_RECEIPT' | 'TAX_INVOICE' | 'GENERAL_RECEIPT' | 'TRADE_PAYMENT' | 'BROKER_PAYMENT' | 'TRANSFER'

export interface ImportCostVoucher {
  id: number; voucherDate: string; kind: ImportCostKind; kindName: string
  lotId: number; lotCode: string; lotName: string
  partnerId: number | null; partnerCode: string | null; partnerName: string | null
  costItemId: number | null; costItemName: string | null
  amount: number; vat: number; fee: number; total: number
  accountId: number | null; accountCode: string | null; accountName: string | null
  bankAccountId: number | null; bankAccountCode: string | null; bankAccountName: string | null
  departmentId: number | null; projectId: number | null; projectName: string | null
  vatType: string | null; remark: string | null; journalEntryId: number | null; journalDocNo: string | null
}

export interface ImportLedgerRow {
  lotId: number; lotCode: string; lotName: string; partnerName: string; active: boolean
  carry: number; goods: number; costs: Record<string, number>; total: number
  transfer: number; balance: number; firstPaymentDate: string | null; clearanceDate: string | null
  tradePaid: number; brokerPaid: number
}

/** 입력 화면 여섯 — 원본 제목 · 우리 경로. 관세사에지급만 제목 앞에 '수입비용-' 이 없다(원본 그대로). */
export const IMPORT_ENTRY: Record<ImportCostKind, { title: string; path: string; short: string }> = {
  BILL_RECEIPT: { title: '수입비용-매입대금청구서수령', path: '/accounting/import-cost/bill', short: '매입대금청구서수령' },
  TAX_INVOICE: { title: '수입비용-세금계산서수령', path: '/accounting/import-cost/tax-invoice', short: '세금계산서수령' },
  GENERAL_RECEIPT: { title: '수입비용-일반영수증수령', path: '/accounting/import-cost/receipt', short: '일반영수증수령' },
  TRADE_PAYMENT: { title: '수입비용-거래대금지급', path: '/accounting/import-cost/trade-payment', short: '거래대금지급' },
  BROKER_PAYMENT: { title: '관세사에지급', path: '/accounting/import-cost/broker-payment', short: '관세사에지급' },
  TRANSFER: { title: '수입비용-본계정대체', path: '/accounting/import-cost/transfer', short: '본계정대체' },
}

export const IMPORT_VOUCHER_LIST = '/accounting/import-cost/vouchers'

/** 숫자 칸 — 0 은 빈칸(원본 출력물 · 목록). */
export function money(n: number | null | undefined): string {
  return n ? Math.round(n).toLocaleString('ko-KR') : ''
}

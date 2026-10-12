/**
 * 회계 I › 현금거래의 한 장짜리 입력 열한 종(원본 2026-10-12 loginaa 실측).
 * 화면마다 칸 차례 · 이름이 다르다 — 이 표 하나로 그린다(CashQuickEntryPage).
 */
export type CashQuickType =
  | 'SALES_COLLECTION' | 'CARD_SALES_COLLECTION' | 'TEMP_DEPOSIT' | 'BANK_BORROWING' | 'OTHER_DEPOSIT'
  | 'PURCHASE_PAYMENT' | 'CARD_BILL_PAYMENT' | 'ACCOUNT_TRANSFER' | 'TEMP_WITHDRAW' | 'LOAN_REPAYMENT' | 'OTHER_WITHDRAW'

/** 칸 종류. main = 머리 계좌(입금 · 출금계좌), counter = 맞은편 계좌(출금계좌 · 차입처). */
export type CashQuickField = 'main' | 'counter' | 'partner' | 'issuer' | 'feeRate' | 'amount' | 'fee' | 'total'
  | 'employee' | 'card' | 'account'

export interface CashQuickKind {
  type: CashQuickType
  /** 화면 제목 · 메뉴 이름 */
  title: string
  /** 원본 회계거래조회 [거래유형] 글자 — 서버 typeName 과 같다. */
  typeName: string
  path: string
  /** 칸 차례와 이름(원본 글자 그대로). 전표일자 · 부서 · 프로젝트 뒤, 적요 · 회계전표No. 앞에 선다. */
  fields: [CashQuickField, string][]
}

export const CASH_QUICK_KINDS: CashQuickKind[] = [
  { type: 'SALES_COLLECTION', title: '매출처로부터', typeName: '매출처로부터', path: '/accounting/sales-collection',
    fields: [['main', '입금계좌'], ['partner', '거래처'], ['amount', '금액'], ['fee', '수수료']] },
  { type: 'CARD_SALES_COLLECTION', title: '카드매출대금회수', typeName: '카드매출대금회수', path: '/accounting/card-sales-collection',
    fields: [['issuer', '카드사'], ['main', '입금계좌'], ['feeRate', '수수료율'], ['amount', '통장입금액'], ['fee', '수수료'], ['total', '총금액']] },
  { type: 'TEMP_DEPOSIT', title: '일시적으로(입금)', typeName: '입금-일시적으로', path: '/accounting/temp-deposit',
    fields: [['main', '입금계좌'], ['employee', '사원'], ['amount', '금액'], ['fee', '수수료']] },
  { type: 'BANK_BORROWING', title: '은행차입으로', typeName: '은행차입으로', path: '/accounting/bank-borrowing',
    fields: [['main', '입금계좌'], ['counter', '차입처(은행)'], ['amount', '총차입금'], ['fee', '수수료']] },
  { type: 'OTHER_DEPOSIT', title: '기타입금', typeName: '기타입금', path: '/accounting/other-deposit',
    fields: [['main', '입금계좌'], ['partner', '거래처'], ['amount', '금액'], ['account', '대변계정']] },
  { type: 'PURCHASE_PAYMENT', title: '매입처로', typeName: '매입처로', path: '/accounting/purchase-payment',
    fields: [['main', '출금계좌'], ['partner', '거래처'], ['amount', '금액'], ['fee', '수수료']] },
  { type: 'CARD_BILL_PAYMENT', title: '법인카드대금결제', typeName: '법인카드대금결제', path: '/accounting/card-bill-payment',
    fields: [['main', '출금계좌'], ['card', '카드'], ['amount', '금액'], ['fee', '수수료']] },
  { type: 'ACCOUNT_TRANSFER', title: '계좌간이동', typeName: '계좌간이동', path: '/accounting/account-transfer',
    fields: [['main', '입금계좌'], ['counter', '출금계좌'], ['amount', '금액'], ['fee', '수수료']] },
  { type: 'TEMP_WITHDRAW', title: '일시적으로(출금)', typeName: '출금-일시적으로', path: '/accounting/temp-withdraw',
    fields: [['main', '출금계좌'], ['employee', '사원'], ['amount', '금액'], ['fee', '수수료']] },
  { type: 'LOAN_REPAYMENT', title: '은행으로', typeName: '은행으로', path: '/accounting/loan-repayment',
    fields: [['main', '출금계좌'], ['counter', '차입처'], ['amount', '원금상환액'], ['fee', '이자금액']] },
  { type: 'OTHER_WITHDRAW', title: '기타출금', typeName: '기타출금', path: '/accounting/other-withdraw',
    fields: [['main', '출금계좌'], ['partner', '거래처'], ['amount', '금액'], ['fee', '수수료'], ['account', '차변계정']] },
]

export const cashQuickKind = (type: CashQuickType) => CASH_QUICK_KINDS.find((k) => k.type === type)!

/** 회계거래조회 [거래유형] 글자 → 그 전표를 여는 화면. 영수증으로도 같은 식으로 연다. */
export const VOUCHER_SCREEN_BY_TYPE_NAME: Record<string, string> = {
  영수증으로: '/accounting/receipt-payment',
  ...Object.fromEntries(CASH_QUICK_KINDS.map((k) => [k.typeName, k.path])),
}

/** 서버 간편전표 응답 중 현금거래가 더 싣는 칸. */
export interface CashQuickVoucher {
  id: number
  voucherNo: string
  type: CashQuickType
  typeName: string
  voucherDate: string
  bankAccountId: number | null
  bankAccountCode: string | null
  partnerId: number | null
  journalDocNo: string | null
  payeeName: string | null
  fee: number
  totalAmount: number
  counterBankAccountId: number | null
  creditCardId: number | null
  cardIssuerId: number | null
  employeeId: number | null
  feeRate: number | null
  lines: { accountId: number; amount: number; description: string | null }[]
}

// 백엔드 응답과 매칭되는 타입 — 회계 · 자금 · 자산 · 세무. types/api.ts 가 다시 내보낸다(기존 import 경로 그대로).

// ===== 회계/원가 =====

export interface VatSummary {
  salesSupply: number
  salesVat: number
  salesTotal: number
  purchaseSupply: number
  purchaseVat: number
  purchaseTotal: number
  /** 지출(비용)의 매입세액 — 46·47회차 */
  expenseVat?: number
  /** 카드 사용의 매입세액 */
  cardVat?: number
  vatPayable: number
}

export interface ItemProfit {
  itemId: number
  code: string
  name: string
  costBasis: string
  soldQty: number
  salesAmount: number
  unitCost: number
  costAmount: number
  profit: number
  marginRate: number
}

export interface ProfitSummary {
  totalSales: number
  totalCost: number
  grossProfit: number
  marginRate: number
}

// ===== 카드사(E010109) / 결제대행사(E010114) 기초등록 마스터 =====

export interface CardIssuer {
  id: number
  code: string
  name: string
  feeRate: number | null
  remark: string | null
  active: boolean
  /** 원본 폼의 [계정]·[입금계좌]·[검색창내용]. */
  accountId: number | null
  accountName: string | null
  depositAccount: string | null
  searchKeyword: string | null
}

export interface PaymentAgency {
  id: number
  code: string
  name: string
  ceoName: string | null
  phone: string | null
  email: string | null
  remark: string | null
  active: boolean
  /** 원본 E010114 폼의 나머지 칸들. */
  accountId: number | null
  accountName: string | null
  depositAccount: string | null
  searchKeyword: string | null
  feeRate: number | null
  regNoKind: string
  /** 원본 [외화거래처]. #281 에 [업종별구분]으로 잘못 만들었던 칸을 깃발로 바로잡았다. */
  foreignCurrency: boolean
  /** 외화거래처로 고른 통화(외화등록). 내자면 null. */
  currencyId: number | null
  currencyName: string | null
  bizType: string | null
  bizItem: string | null
  manager: string | null
  taxReport: boolean
  postalCode: string | null
  address: string | null
  postalCode2: string | null
  address2: string | null
}

// ===== 계약관리 · 전자계약 (회계 II) =====

export type BusinessContractType = 'SALES' | 'PURCHASE' | 'OTHER'
export type BusinessContractStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'TERMINATED'

export interface BusinessContract {
  id: number
  contractNo: string
  title: string
  type: BusinessContractType
  typeName: string
  status: BusinessContractStatus
  statusName: string
  partnerId: number
  partnerName: string
  startDate: string
  endDate: string
  amount: number
  paymentTerms: string | null
  content: string | null
  sentAt: string | null
  signerName: string | null
  signedAt: string | null
  agreement: string | null
  terminatedDate: string | null
  terminationReason: string | null
  /** 오늘 기준 만료까지 남은 일수 */
  daysToExpiry: number
  createdBy: string | null
  /** 전자계약 &gt; 계약서진행단계 [일자] · 계약서현황 [최종수정일자] */
  createdAt: string | null
  updatedAt: string | null
}

// ===== 현금거래 세분류 (계좌간이동 · 법인카드 대금결제) =====

export interface AccountTransfer {
  id: number
  transferNo: string
  transferDate: string
  fromAccountId: number
  fromAccountName: string
  fromBalanceAfter: number
  toAccountId: number
  toAccountName: string
  toBalanceAfter: number
  amount: number
  journalEntryId: number | null
  journalDocNo: string | null
  description: string | null
  createdBy: string | null
}

export interface CardPaymentLine {
  cardUsageId: number
  usageNo: string
  usageDate: string
  merchant: string
  expenseAccountName: string
  amount: number
}

export interface CardPayment {
  id: number
  paymentNo: string
  paymentDate: string
  cardId: number
  cardName: string
  cardCompany: string
  bankAccountId: number
  bankAccountName: string
  amount: number
  journalEntryId: number | null
  journalDocNo: string | null
  createdBy: string | null
  lines: CardPaymentLine[]
}

// ===== 수표관리 (회계 II) =====

export type CheckType = 'RECEIVED' | 'ISSUED'
export type CheckStatus = 'HELD' | 'DEPOSITED' | 'PAID' | 'DISHONORED'

export interface BankCheck {
  id: number
  checkNo: string
  type: CheckType
  typeName: string
  status: CheckStatus
  statusName: string
  issueDate: string
  amount: number
  bankName: string | null
  partnerId: number | null
  partnerName: string | null
  bankAccountId: number | null
  bankAccountName: string | null
  settledDate: string | null
  remark: string | null
  createdBy: string | null
  /** 원본 [최종수정자] — 입금 · 부도 · 결제와 그 취소를 한 사람 */
  updatedBy: string | null
  /** 수표내역입력에서 분개 없이 넣은 수표 — 거래유형 '수표만증가' · '수표만감소' */
  directEntry: boolean
  /** 받을 때(발행할 때) 회계전표 번호 — 원본 수령수표증가현황의 [일자-No.]. 목록에서만 온다. */
  issueJournalNo?: string | null
  /** 손을 떠날 때(입금 · 부도) 회계전표 번호 — 원본 수령수표감소현황의 [일자-No.]. 발행수표 결제는 분개가 없어 비어 있다. */
  settleJournalNo?: string | null
  /** 수표내역입력 전표 번호 — 원본 [일자] '2026/10/13 -5' 의 5(늘린 전표 · 줄인 전표). */
  directInNo?: number | null
  directOutNo?: number | null
  /** 수령수표입금처리 [입금보고서작성] 으로 손을 떠난 수표 — 수령수표조회 거래유형 '입금보고서', 감소 줄 체크칸 막힘. */
  settledByVoucher?: boolean
  /** 손을 떠날 때 회계전표 id — 감소 줄 [회계전표일자-No.] 가 그 입금보고서(수정) · 지출결의서(수정)를 연다. */
  settleJournalId?: number | null
  /** 수표내역입력 줄의 [부서] · [프로젝트] — 부서 이름은 부서 목록에서 붙인다. */
  departmentId?: number | null
  projectId?: number | null
  projectName?: string | null
  /** 채권감소 [입금보고서작성] 수금형태 '수표'(채무감소 지급형태 '수표')로 늘어난 수표 — 증가 줄 거래유형 '입금보고서' · '지출결의서', 체크칸 막힘. */
  issuedByVoucher?: boolean
  /** 그 입금보고서(지출결의서)의 회계전표 id — 증가 줄 [일자-No.] · [회계전표일자-No.] 가 그 전표(수정)를 연다. */
  issueJournalId?: number | null
  /** 감소 줄의 적요 — 비면 증가 적요(remark)를 그대로(원본 [수표만감소] '증가적요동일', 2026-10-21). */
  outRemark?: string | null
}

// ===== 비현금거래 (대체전표) =====

export type NonCashType = 'OFFSET' | 'BAD_DEBT' | 'ACCRUAL' | 'TRANSFER'

export interface NonCashTxn {
  id: number
  txnNo: string
  type: NonCashType
  typeName: string
  txnDate: string
  debitAccountId: number
  debitAccountCode: string
  debitAccountName: string
  creditAccountId: number
  creditAccountCode: string
  creditAccountName: string
  amount: number
  partnerId: number | null
  partnerName: string | null
  journalEntryId: number | null
  journalDocNo: string | null
  description: string | null
  createdBy: string | null
}

// ===== FastEntry 간편전표 (지출결의서·입금보고서·가지급금정산서) =====

export type FastVoucherType = 'EXPENSE_REPORT' | 'DEPOSIT_REPORT' | 'ADVANCE_SETTLEMENT' | 'RECEIPT_PAYMENT'
export type PaymentMethod = 'CASH' | 'BANK' | 'CREDIT'

export interface VoucherLine {
  id: number
  lineNo: number
  accountId: number
  accountCode: string
  accountName: string
  amount: number
  description: string | null
  /** 줄의 결제 계좌 — 원본 [돈 나간(들어온) 계좌]. cash 면 000 현금, 둘 다 없으면 머리 결제수단(옛 줄). */
  bankAccountId: number | null
  cash: boolean
  partnerId: number | null
  bankAccountCode: string | null
  bankAccountName: string | null
  partnerCode: string | null
  partnerName: string | null
  /** 가지급금정산서 [정산자] 사원 · [정산대상자명]. */
  employeeId: number | null
  employeeName: string | null
  /** [추가정보] 부가세정보 — 없으면 vatType null(지출결의서 · 가지급금정산서). */
  vatType?: string | null
  vatDate?: string | null
  vatPartnerId?: number | null
  vatPartnerCode?: string | null
  vatPartnerName?: string | null
  vatSupply?: number | null
  vatAmount?: number | null
  /** 돈 들어온(나간) 쪽이 계정인 줄(수금형태 어음 — 1109 받을어음) */
  settleAccountId?: number | null
  settleAccountCode?: string | null
  settleAccountName?: string | null
  /** 입금보고서 격자 [수수료] — 남기기만 한다(분개 안 됨). */
  fee?: number | null
  /** 지출결의서 격자 [거래처명] 글자 — 거래처 코드 없이 친 것. */
  payeeName?: string | null
}

export interface FastVoucher {
  id: number
  voucherNo: string
  type: FastVoucherType
  typeName: string
  voucherDate: string
  method: PaymentMethod
  methodName: string
  bankAccountId: number | null
  bankAccountName: string | null
  partnerId: number | null
  partnerName: string | null
  advanceAmount: number | null
  totalAmount: number
  /** 가지급금정산서: 가지급금 − 실사용액 (양수 반납, 음수 추가지급) */
  balance: number | null
  journalEntryId: number | null
  journalDocNo: string | null
  description: string | null
  createdBy: string | null
  lines: VoucherLine[]
  /** 영수증으로 [거래처명](친 글자) · [수수료] */
  payeeName: string | null
  fee: number
}

// ===== 고정자산 (회계 I) =====

export type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE'
export type AssetStatus = 'IN_USE' | 'DISPOSED'

export interface FixedAsset {
  id: number
  assetNo: string
  name: string
  assetAccountId: number
  assetAccountCode: string
  assetAccountName: string
  acquisitionDate: string
  acquisitionCost: number
  salvageValue: number
  usefulLifeYears: number
  method: DepreciationMethod
  methodName: string
  declineRate: number | null
  accumulatedDepreciation: number
  bookValue: number
  status: AssetStatus
  statusName: string
  disposalDate: string | null
  disposalAmount: number | null
  remark: string | null
  createdBy: string | null
  /** 자산마다 고르는 계정(원본 E010610) — 비면 203 · 818 */
  accumAccountId: number | null
  accumAccountName: string | null
  expenseAccountId: number | null
  expenseAccountName: string | null
  /** 증가 전표의 출금계좌 · 부가세(원본 E010611) */
  paymentAccountId: number | null
  paymentAccountName: string | null
  acquisitionVat: number
  /** 감소 전표(원본 E010612) */
  disposalType: 'SALE' | 'SCRAP' | null
  disposalTypeName: string | null
  disposalVat: number | null
  receiptAccountId: number | null
  receiptAccountName: string | null
  /** 원본 E010610 [수량관리] 사용 — 수불부 · 대장 [수량] 은 사용 자산만 */
  quantityManaged: boolean
  /** 증가 수량 합(감소를 빼지 않는다) — 남은 수량 = quantity − decreasedQuantity */
  quantity: number
  /** 감소 전표들의 합 — 남은 취득가 = acquisitionCost − decreasedCost */
  decreasedCost: number
  decreasedAccum: number
  decreasedQuantity: number
  /** 첫 증가 전표의 수수료(지급수수료(판)) · 거래처 */
  acquisitionFee?: number
  partnerId?: number | null
  partnerName?: string | null
  /** 증가 · 감소 전표(원본 고정자산전표조회 한 줄씩) */
  movements: FixedAssetMovement[]
}

/** 고정자산증가(E010611) · 감소(E010612) 전표 한 장 — 자산 하나에 여러 장, 각각 회계전표 한 장 */
export interface FixedAssetMovement {
  id: number
  kind: 'INCREASE' | 'DECREASE'
  kindName: string
  slipDate: string
  quantity: number
  /** 증가 = 공급가액, 감소 = 취득원가 몫 */
  amount: number
  vat: number
  accumAmount: number
  saleAmount: number
  disposalType: 'SALE' | 'SCRAP' | null
  disposalTypeName: string | null
  gainLoss: number
  accountId: number | null
  accountName: string | null
  journalEntryId: number | null
  journalDocNo: string | null
  remark: string | null
}

export interface DepreciationRow {
  id: number
  assetId: number
  assetNo: string
  assetName: string
  period: string
  depreciationDate: string
  amount: number
  accumulatedAfter: number
  bookValueAfter: number
  journalEntryId: number | null
  journalDocNo: string | null
  createdBy: string | null
}

export interface DepreciationRun {
  period: string
  assetCount: number
  totalAmount: number
  skippedCount: number
  rows: DepreciationRow[]
  /** 앞 달 상각이 빠진 자산 — "자산명: 2026-08, 2026-09" */
  gaps?: string[]
}

// ===== 계좌/카드 (회계 I) =====

export type CardType = 'CORPORATE' | 'PERSONAL'

export interface BankAccountRow {
  id: number
  /** 원본 계좌등록의 [계좌코드]·[계좌명]. 이미 있는 계좌에는 없으므로 널이다. */
  code: string | null
  name: string | null
  bankName: string
  accountNo: string
  holder: string | null
  glAccountId: number
  glAccountCode: string
  glAccountName: string
  /** 원본 계좌등록의 [외화통장환종]. 안 정한 통장은 null — 원화다. */
  currencyId: number | null
  currencyCode: string | null
  currencyName: string | null
  balance: number
  active: boolean
  remark: string | null
  /** 원본 계좌등록의 [검색창내용] · [이체정보] 적요1 · 적요2. */
  searchText: string | null
  transferRemark1: string | null
  transferRemark2: string | null
  /** 조건 [수정일자순(정렬)] */
  updatedAt?: string | null
}

export interface CreditCardRow {
  id: number
  /** 원본 카드등록의 [카드코드]. 이미 있는 카드에는 없으므로 널이다. */
  code: string | null
  cardName: string
  cardCompany: string
  cardNo: string
  type: CardType
  typeName: string
  ownerName: string | null
  settlementAccountId: number | null
  settlementAccountName: string | null
  /** 원본 카드등록의 [계정명] — 결제계좌가 물고 있는 예금계정이다. */
  glAccountName: string | null
  settlementDay: number | null
  active: boolean
  remark: string | null
  /** 원본 카드등록의 [카드구분] — 신용카드 · 체크카드. */
  cardKind: CardKind
  cardKindName: string
  /** 원본 [사업용 카드 구분]. */
  businessUse: boolean
  /** 원본 [계정] — 카드사용 분개의 대변(기본 미지급금). */
  glAccountId: number | null
  glAccountCode: string | null
  /** 원본 [카드관리자] · [검색창내용]. */
  manager: string | null
  searchText: string | null
}

export type CardKind = 'CREDIT' | 'CHECK'

export interface BankTxn {
  id: number
  txnNo: string
  txnDate: string
  bankAccountId: number
  bankName: string
  accountNo: string
  deposit: boolean
  directionName: string
  amount: number
  counterAccountId: number
  counterAccountName: string
  partnerId: number | null
  partnerName: string | null
  balanceAfter: number
  journalEntryId: number | null
  journalDocNo: string | null
  description: string | null
  createdBy: string | null
}

export interface CardUsage {
  id: number
  usageNo: string
  usageDate: string
  cardId: number
  cardName: string
  cardCompany: string
  cardNo: string
  cardTypeName: string
  merchant: string
  expenseAccountId: number
  expenseAccountName: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  journalEntryId: number | null
  journalDocNo: string | null
  description: string | null
  createdBy: string | null
}

// ===== 증빙(증빙센터) =====

export type EvidenceMethod = 'TAX_INVOICE' | 'CARD' | 'CASH_RECEIPT' | 'STATEMENT' | 'ETC'

export interface EvidenceAttachment {
  id: number
  entityType: string
  menuLabel: string
  entityId: number
  docNo: string | null
  docDate: string | null
  evidenceDate: string | null
  method: EvidenceMethod
  methodName: string
  worker: string | null
  note: string | null
  fileId: number | null
  fileName: string | null
  fileSize: number | null
  attached: boolean
}

// ===== 회계전표(복식부기) =====

export type JournalSourceType = 'SALES' | 'PURCHASE' | 'EXPENSE' | 'MANUAL'
export type AccountDivision = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

export interface JournalLine {
  id: number
  lineNo: number
  accountId: number
  accountCode: string
  accountName: string
  debit: number
  credit: number
  description: string | null
  departmentId?: number | null
  projectId?: number | null
  /** 줄 거래처(일반전표 격자 거래처코드 · 거래처명) */
  partnerId?: number | null
  partnerCode?: string | null
  partnerName?: string | null
  /** 줄 [외화] · [외화금액](V456) — 외화장부가 읽는다 */
  currencyCode?: string | null
  foreignAmount?: number | null
}

export interface JournalEntry {
  id: number
  docNo: string
  entryDate: string
  description: string | null
  partnerId: number | null
  partnerName: string | null
  sourceType: JournalSourceType
  sourceTypeName: string
  sourceId: number | null
  totalDebit: number
  totalCredit: number
  balanced: boolean
  lines: JournalLine[]
  /** 원본 거래이력조회(회계)의 [작업자] · [작업일자]. */
  createdBy?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  /** 일반전표 [첨언내용] */
  memo?: string | null
}

export interface LedgerRow {
  entryDate: string
  docNo: string
  description: string | null
  partnerName: string | null
  debit: number
  credit: number
  balance: number
  /** 원본 현금출납장의 [상대계정명] — 같은 전표의 다른 줄 계정. */
  counterAccountName?: string | null
  /** 원본 계정별거래처별원장 — 거래처마다 원장을 가르는 열쇠. 전표에 거래처가 없으면 null. */
  partnerId?: number | null
}

export interface AccountLedger {
  accountId: number
  accountCode: string
  accountName: string
  division: AccountDivision
  totalDebit: number
  totalCredit: number
  closingBalance: number
  rows: LedgerRow[]
}

export interface TrialBalanceRow {
  accountId: number
  accountCode: string
  accountName: string
  division: AccountDivision
  debit: number
  credit: number
  balance: number
}

export interface TrialBalance {
  from: string
  to: string
  totalDebit: number
  totalCredit: number
  balanced: boolean
  rows: TrialBalanceRow[]
}

export interface StatementRow {
  accountCode: string
  accountName: string
  division: AccountDivision
  amount: number
}

export interface BalanceSheet {
  asOf: string
  assets: StatementRow[]
  totalAssets: number
  liabilities: StatementRow[]
  totalLiabilities: number
  equity: StatementRow[]
  totalEquity: number
  netIncome: number
  balanced: boolean
}

export interface IncomeStatement {
  from: string
  to: string
  revenues: StatementRow[]
  totalRevenue: number
  expenses: StatementRow[]
  totalExpense: number
  netIncome: number
}

// ===== 전자(세금)계산서 =====

export type TaxInvoiceType = 'SALES' | 'PURCHASE'
export type TaxInvoiceStatus = 'DRAFT' | 'ISSUED' | 'SENT' | 'APPROVED'

export interface TaxInvoice {
  id: number
  invoiceNo: string
  invoiceType: TaxInvoiceType
  invoiceTypeName: string
  status: TaxInvoiceStatus
  statusName: string
  issueDate: string
  partnerId: number
  partnerName: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  sourceDocNo: string | null
  remark: string | null
  createdBy: string | null
}

// ===== 원천징수 =====

export interface WithholdingRow {
  payslipId: number
  employeeId: number
  employeeCode: string
  employeeName: string
  grossPay: number
  incomeTax: number
  localIncomeTax: number
  totalWithheld: number
}

export interface WithholdingStatement {
  payMonth: string
  headcount: number
  draftCount: number
  totalGrossPay: number
  totalIncomeTax: number
  totalLocalIncomeTax: number
  totalWithheld: number
  rows: WithholdingRow[]
  /** 소득 구분별 줄(근로 간이세액 · 일용근로 · 사업·기타 …). 위 total* 은 근로소득만, 납부할 세액은 grand* */
  sections: { code: string; name: string; count: number; grossPay: number; incomeTax: number; localIncomeTax: number }[]
  grandIncomeTax: number
  grandLocalIncomeTax: number
  grandWithheld: number
}

/** 원천징수이행상황신고서 목록 한 줄 (E030101) */
export interface WithholdingReturn {
  id: number
  filingType: 'REGULAR' | 'LATE'
  filingTypeName: string
  filingMethod: 'MONTHLY' | 'HALF'
  filingMethodName: string
  attributionMonth: string
  payMonth: string
  reportDate: string
  includeYearEnd: boolean
  companyName: string | null
  bizRegNo: string | null
}

/** 원천징수부 (E020116) — 소득자 한 사람의 달별 근로소득 지급명세 */
export interface WithholdingLedgerEmployee {
  employeeId: number
  employeeCode: string
  employeeName: string
  hireDate: string | null
  resignDate: string | null
  /** payBracket — 원천징수부 (31) 급여구간(간이세액표 구간 '4,240,000~4,260,000'), 표 밖이면 null. */
  months: { payMonth: string; taxablePay: number; nonTaxablePay: number; incomeTax: number; localIncomeTax: number; payBracket: string | null }[]
}

/** 퇴직금계산 (E030117) 목록 한 줄 */
export interface RetirementPay {
  id: number
  employeeId: number
  employeeCode: string
  employeeName: string
  department: string
  hireDate: string | null
  startDate: string
  retireDate: string
  payDate: string
  withholdingMonth: string
  retireReason: string | null
  executive: boolean
  extraPay: number
  retirementPay: number
  nonTaxable: number
  incomeTax: number
  localIncomeTax: number
  deductionTotal: number
  netPay: number
}

/** 퇴직금계산 내역(ⓐ~ⓘ) · 퇴직소득세 (28)~(34) */
export interface RetirementPayCalculation {
  wageFrom: string
  wageTo: string
  wages: { month: string; amount: number }[]
  wage3m: number
  bonusFrom: string
  bonusTo: string
  bonuses: { month: string; amount: number }[]
  bonus1y: number
  bonus3m: number
  extraPay: number
  total3m: number
  workDays3m: number
  dailyWage: number
  serviceDays: number
  computedPay: number
  serviceMonths: number
  serviceYears: number
  retirementPay: number
  nonTaxable: number
  tax: {
    income: number; serviceDeduction: number; converted: number; convertedDeduction: number
    taxBase: number; convertedTax: number; computedTax: number; incomeTax: number; localIncomeTax: number
  }
}

export interface ReceiptMonth {
  payMonth: string
  grossPay: number
  incomeTax: number
  localIncomeTax: number
}

export interface WithholdingReceipt {
  year: number
  employeeId: number
  employeeCode: string
  employeeName: string
  grossPay: number
  incomeTax: number
  localIncomeTax: number
  totalWithheld: number
  socialInsurance: number
  months: ReceiptMonth[]
}

// ===== 어음거래 =====

export type NoteType = 'RECEIVABLE' | 'PAYABLE'
export type NoteStatus = 'HELD' | 'SETTLED' | 'DISCOUNTED' | 'DISHONORED' | 'RECORD_DECREASED' | 'ENDORSED'

export interface PromissoryNote {
  id: number
  noteNo: string
  type: NoteType
  typeName: string
  partnerId: number
  partnerName: string
  issueDate: string
  dueDate: string
  amount: number
  status: NoteStatus
  statusName: string
  closedDate: string | null
  discountFee: number | null
  bankName: string | null
  remark: string | null
  createdBy: string | null
}

export interface NoteSummary {
  receivableHeld: number
  payableHeld: number
  receivableDueSoon: number
  payableDueSoon: number
  notes: PromissoryNote[]
  /** 조건에 걸린 전체 어음 수. 잘렸을 때 "몇 장 중 몇 장" 을 말하려고 받는다. */
  totalRows: number
  /** 잘라서 온 것인가. 이때만 [오천건이상조회] 를 띄운다. */
  truncated: boolean
}

// ===== 회계 II: 예산관리 · 자금계획 =====

export interface Account {
  id: number
  code: string
  name: string
  division: AccountDivision
  divisionName: string
  detailCategory: string | null
  active: boolean
}

export interface BudgetRow {
  id: number
  period: string
  accountId: number
  accountCode: string
  accountName: string
  division: AccountDivision
  amount: number
  actual: number
  remaining: number
  executionRate: number
  over: boolean
  remark: string | null
}

export interface BudgetStatus {
  period: string
  totalBudget: number
  totalActual: number
  totalRemaining: number
  executionRate: number
  rows: BudgetRow[]
}

export type CashFlowType = 'INFLOW' | 'OUTFLOW'

export interface CashPlanRow {
  id: number
  period: string
  type: CashFlowType
  typeName: string
  category: string
  amount: number
  remark: string | null
}

export interface CashPlanStatus {
  period: string
  plannedInflow: number
  plannedOutflow: number
  plannedNet: number
  actualInflow: number
  actualOutflow: number
  actualNet: number
  inflowDiff: number
  outflowDiff: number
  plans: CashPlanRow[]
}

// ===== 기타원천세 =====

export type IncomeType = 'BUSINESS' | 'OTHER' | 'INTEREST' | 'DIVIDEND' | 'NON_RESIDENT'

export interface OtherWithholding {
  id: number
  docNo: string
  payDate: string
  attributionMonth: string
  incomeType: IncomeType
  incomeTypeName: string
  partnerId: number | null
  payeeName: string
  payeeRegNo: string | null
  incomeCode: string | null
  grossAmount: number
  expenseAmount: number
  taxableAmount: number
  incomeTax: number
  localIncomeTax: number
  netAmount: number
  description: string | null
  createdBy: string | null
}

export interface IncomeTypeSummary {
  incomeType: IncomeType
  incomeTypeName: string
  count: number
  grossAmount: number
  incomeTax: number
  localIncomeTax: number
}

export interface OtherWithholdingSummary {
  month: string
  count: number
  totalGross: number
  totalIncomeTax: number
  totalLocalIncomeTax: number
  totalNet: number
  byIncomeType: IncomeTypeSummary[]
  rows: OtherWithholding[]
}

// ===== 법인세 =====

export type TaxAdjustmentType = 'ADD' | 'DEDUCT'
export type TaxReturnStatus = 'DRAFT' | 'CONFIRMED'

export interface TaxAdjustment {
  id: number
  type: TaxAdjustmentType
  typeName: string
  name: string
  amount: number
  remark: string | null
}

export interface TaxReturn {
  id: number
  fiscalYear: number
  periodFrom: string
  periodTo: string
  status: TaxReturnStatus
  statusName: string
  netIncome: number
  additions: number
  deductions: number
  incomeForYear: number
  lossCarryforward: number
  taxBase: number
  calculatedTax: number
  taxCredit: number
  penaltyTax: number
  totalTax: number
  prepaidTax: number
  payableTax: number
  localIncomeTax: number
  remark: string | null
  createdBy: string | null
  adjustments: TaxAdjustment[]
}

// ===== 회계 II: 수입비용 =====

export type ReceiptMethod = 'CASH' | 'BANK' | 'CREDIT'

export interface Income {
  id: number
  incomeDate: string
  accountId: number
  accountCode: string
  accountName: string
  content: string
  partnerName: string | null
  amount: number
  receiptMethod: ReceiptMethod
  receiptMethodName: string
  bankAccountId: number | null
  bankAccountName: string | null
  journalEntryId: number | null
  journalDocNo: string | null
  department: string | null
  createdBy: string | null
}

export interface AccountSummaryRow {
  accountId: number
  accountCode: string
  accountName: string
  amount: number
  ratio: number
}

export interface IncomeExpenseStatus {
  from: string
  to: string
  totalIncome: number
  totalExpense: number
  net: number
  incomeByAccount: AccountSummaryRow[]
  expenseByAccount: AccountSummaryRow[]
}

// 백엔드 응답과 매칭되는 타입 정의

export interface User {
  id: number
  username: string
  name: string
  email: string | null
  department: string | null
  enabled: boolean
  roles: string[]
}

export interface Role {
  id: number
  name: string
  displayName: string
  description: string | null
}

export interface LoginResponse {
  token: string
  user: User
}

export interface CreateUserRequest {
  username: string
  password: string
  name: string
  email?: string
  department?: string
  roleNames: string[]
}

export interface UpdateUserRequest {
  name: string
  email?: string
  department?: string
  enabled?: boolean
  roleNames?: string[]
  password?: string
}

// ===== 재고관리 =====

export interface CodeOption {
  code: string
  name: string
}

export interface Item {
  id: number
  code: string
  name: string
  spec: string | null
  unit: string
  category: string
  categoryName: string
  unitPrice: number
  safetyStock: number
  barcode: string | null
  active: boolean
}

export interface Warehouse {
  id: number
  code: string
  name: string
  location: string | null
  active: boolean
}

export type StockTxType = 'INBOUND' | 'OUTBOUND' | 'ADJUST'

export interface StockRow {
  itemId: number
  itemCode: string
  itemName: string
  spec: string | null
  unit: string
  warehouseId: number
  warehouseName: string
  quantity: number
  safetyStock: number
  belowSafety: boolean
}

export interface StockTransaction {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number
  warehouseName: string
  type: StockTxType
  typeName: string
  quantityChange: number
  balanceAfter: number
  unitPrice: number | null
  transactionDate: string
  note: string | null
  createdBy: string | null
}

// Spring Data Page 응답
export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

// ===== 판매/구매 =====

export type PartnerType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH'

export interface Partner {
  id: number
  code: string
  name: string
  type: PartnerType
  typeName: string
  bizRegNo: string | null
  ceoName: string | null
  bizType: string | null
  bizItem: string | null
  manager: string | null
  phone: string | null
  address: string | null
  salesPriceGroup: string | null
  purchasePriceGroup: string | null
  active: boolean
}

export interface TradeLine {
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
}

export type SalesConfirmStatus = 'UNCONFIRMED' | 'IN_APPROVAL' | 'CONFIRMED'

export interface SalesDoc {
  id: number
  docNo: string
  partnerId: number
  partnerName: string
  warehouseId: number
  warehouseName: string
  saleDate: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  remark: string | null
  createdBy: string | null
  confirmStatus: SalesConfirmStatus
  confirmStatusName: string
  confirmedAt: string | null
  accountingReflected: boolean
  lines: TradeLine[]
}

export interface PurchaseDoc {
  id: number
  docNo: string
  partnerId: number
  partnerName: string
  warehouseId: number
  warehouseName: string
  purchaseDate: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  remark: string | null
  createdBy: string | null
  lines: TradeLine[]
}

export interface PartnerBalance {
  partnerId: number
  code: string
  name: string
  type: PartnerType
  typeName: string
  receivable: number
  payable: number
}

// ===== 생산관리 =====

export interface BomLine {
  componentId: number
  componentCode: string
  componentName: string
  unit: string
  quantity: number
}

export interface Bom {
  id: number
  productId: number
  productCode: string
  productName: string
  productUnit: string
  remark: string | null
  active: boolean
  lines: BomLine[]
}

export type WorkOrderStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'

export interface WorkOrder {
  id: number
  orderNo: string
  productId: number
  productCode: string
  productName: string
  productUnit: string
  warehouseId: number
  warehouseName: string
  plannedQty: number
  producedQty: number
  remainingQty: number
  status: WorkOrderStatus
  statusName: string
  orderDate: string
  dueDate: string | null
  remark: string | null
  createdBy: string | null
}

export interface ProductionMaterial {
  componentId: number
  componentCode: string
  componentName: string
  unit: string
  quantity: number
}

export interface Production {
  id: number
  prodNo: string
  workOrderId: number
  workOrderNo: string
  productId: number
  productCode: string
  productName: string
  productUnit: string
  warehouseId: number
  warehouseName: string
  producedQty: number
  productionDate: string
  createdBy: string | null
  materials: ProductionMaterial[]
}

// ===== 회계/원가 =====

export interface VatSummary {
  salesSupply: number
  salesVat: number
  salesTotal: number
  purchaseSupply: number
  purchaseVat: number
  purchaseTotal: number
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

// ===== 그룹웨어: 전자결재 =====

/** 양식코드. 양식은 approval_form_templates 마스터가 정하므로 열린 문자열이다. */
export type ApprovalFormType = string

export type ApprovalStatus = 'DRAFTING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED'

export type ApprovalLineStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type ApprovalParticipantRole = 'REFERENCE' | 'SHARE'

/** 양식별 입력 항목 정의. 백엔드 field_schema(jsonb)를 그대로 받는다. */
export type ApprovalFieldType = 'text' | 'textarea' | 'date' | 'datetime' | 'number' | 'table'

export interface ApprovalFieldColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'date'
}

export interface ApprovalField {
  key: string
  label: string
  type: ApprovalFieldType
  required?: boolean
  /** type='table' 전용 */
  columns?: ApprovalFieldColumn[]
  defaultRows?: Record<string, unknown>[]
  /** 이 컬럼을 합계 낸다 (예: 여비 총계) */
  totalOf?: string
  totalLabel?: string
}

export interface ApprovalFormTemplate {
  id: number
  code: string
  name: string
  sortOrder: number
  fieldSchema: ApprovalField[]
}

export interface ApprovalLine {
  id: number
  stepOrder: number
  approverId: number
  approverName: string
  status: ApprovalLineStatus
  statusName: string
  comment: string | null
  actedAt: string | null
}

export interface ApprovalParticipant {
  userId: number
  userName: string
  role: ApprovalParticipantRole
  roleName: string
}

export interface ApprovalVoucher {
  id: number
  voucherType: 'SALES' | 'PURCHASE' | 'EXPENSE'
  voucherId: number
  voucherNo: string
}

export interface ApprovalDoc {
  id: number
  /** 기안서No. */
  docNo: string
  /** 기안No. (2026/07/10-2) */
  draftNo: string
  formTemplateId: number
  formType: ApprovalFormType
  formTypeName: string
  title: string
  content: string
  formData: Record<string, unknown>
  drafterId: number
  drafterName: string
  draftDate: string
  department: string | null
  projectId: number | null
  projectName: string | null
  status: ApprovalStatus
  statusName: string
  currentStep: number
  reference: string | null
  deleted: boolean
  currentApproverName: string | null
  voucherCount: number
  lines: ApprovalLine[]
  participants: ApprovalParticipant[]
  vouchers: ApprovalVoucher[]
}

// ===== 그룹웨어: 업무일지 =====

export interface WorkJournal {
  id: number
  reportDate: string
  authorId: number
  authorName: string
  department: string | null
  partnerName: string | null
  title: string
  content: string
}

// ===== 그룹웨어: 출퇴근 =====

export interface Attendance {
  id: number
  userId: number
  userName: string
  workDate: string
  clockIn: string | null
  clockOut: string | null
  workMinutes: number | null
  late: boolean
  note: string | null
}

// 결재선 지정용 간단 사용자 옵션
export interface MemberOption {
  id: number
  name: string
  department: string
}

// ===== 전자결재 설정 (공통양식등록 · 결재선 프리셋) =====

/** 관리 화면용 양식 (사용중지된 양식도 포함) */
export interface ApprovalFormTemplateAdmin {
  id: number
  code: string
  name: string
  sortOrder: number
  active: boolean
  fieldSchema: ApprovalField[]
  /** 이 양식으로 작성된 기안서 수 — 0건일 때만 삭제 가능 */
  documentCount: number
}

export interface ApprovalPresetStep {
  stepOrder: number
  approverId: number
  approverName: string
  department: string | null
}

export interface ApprovalPreset {
  id: number
  name: string
  active: boolean
  formTemplateId: number | null
  formTemplateName: string | null
  steps: ApprovalPresetStep[]
}

// ===== 재고 기초등록: 관리항목 / 단가적용순서 =====

export interface ManagementItem {
  id: number
  code: string
  name: string
  description: string | null
  active: boolean
}

export interface PriceOrderLine {
  functionName: string
  applyOrder: number
  active: boolean
}

// ===== 품질검사 =====

export type QualityInspectionType = 'INCOMING' | 'PROCESS' | 'SHIPMENT'
export type QualityResult = 'PASS' | 'CONDITIONAL' | 'FAIL'

export interface QualityInspection {
  id: number
  inspectionNo: string
  inspectionDate: string
  type: QualityInspectionType
  typeName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  lotNo: string | null
  inspectedQty: number
  defectQty: number
  goodQty: number
  defectRate: number
  result: QualityResult
  resultName: string
  inspector: string | null
  remark: string | null
}

// ===== 재고 창고간이동 =====

export interface StockTransfer {
  id: number
  transferNo: string
  transferDate: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  fromWarehouseId: number
  fromWarehouseName: string
  toWarehouseId: number
  toWarehouseName: string
  quantity: number
  reason: string | null
  createdBy: string | null
}

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

export type FastVoucherType = 'EXPENSE_REPORT' | 'DEPOSIT_REPORT' | 'ADVANCE_SETTLEMENT'
export type PaymentMethod = 'CASH' | 'BANK' | 'CREDIT'

export interface VoucherLine {
  id: number
  lineNo: number
  accountId: number
  accountCode: string
  accountName: string
  amount: number
  description: string | null
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
}

// ===== 계좌/카드 (회계 I) =====

export type CardType = 'CORPORATE' | 'PERSONAL'

export interface BankAccountRow {
  id: number
  bankName: string
  accountNo: string
  holder: string | null
  glAccountId: number
  glAccountCode: string
  glAccountName: string
  balance: number
  active: boolean
  remark: string | null
}

export interface CreditCardRow {
  id: number
  cardName: string
  cardCompany: string
  cardNo: string
  type: CardType
  typeName: string
  ownerName: string | null
  settlementAccountId: number | null
  settlementAccountName: string | null
  settlementDay: number | null
  active: boolean
  remark: string | null
}

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

// ===== 기타이동 (자가사용·불량처리·재고조정) =====

export type StockAdjustmentType = 'SELF_USE' | 'DEFECT' | 'ADJUST'

export interface StockAdjustment {
  id: number
  adjustNo: string
  adjustDate: string
  type: StockAdjustmentType
  typeName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number
  warehouseName: string
  beforeQty: number
  quantityChange: number
  afterQty: number
  reason: string | null
  createdBy: string | null
}

// ===== 시리얼/로트 관리 =====

export interface Lot {
  id: number
  lotNo: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number | null
  warehouseName: string | null
  inboundDate: string
  expireDate: string | null
  inboundQty: number
  stockQty: number
  held: boolean
  statusName: string
}

// ===== 고객관리(CRM) =====

export type CrmStage = 'LEAD' | 'CONSULTING' | 'QUOTE' | 'CONTRACT' | 'LOST'

export interface CrmActivity {
  id: number
  activityDate: string
  partnerId: number
  partnerCode: string
  partnerName: string
  contactName: string | null
  charge: string | null
  activity: string | null
  stage: CrmStage
  stageName: string
  nextAction: string | null
}

// ===== WORK 업무게시판 =====

export type WorkPostStatus = 'IN_PROGRESS' | 'DONE'

export interface WorkPost {
  id: number
  postNo: number
  postDate: string
  title: string
  content: string
  writer: string
  forwardTo: string | null
  status: WorkPostStatus
  statusName: string
}

// ===== ECDrive 문서 드라이브 =====

export interface DriveDocument {
  id: number
  name: string
  drive: string
  sizeBytes: number
  uploader: string | null
  important: boolean
  trashed: boolean
  updatedAt: string | null
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
}

export interface LedgerRow {
  entryDate: string
  docNo: string
  description: string | null
  partnerName: string | null
  debit: number
  credit: number
  balance: number
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

// ===== 급여관리 =====

export type PayslipStatus = 'DRAFT' | 'CONFIRMED'
export type PayslipLineKind = 'ALLOWANCE' | 'DEDUCTION'

/** 사원 마스터 (/api/employees). 로그인 User 와는 별개다. */
export interface EmployeeMaster {
  id: number
  code: string
  name: string
  departmentId: number | null
  department: string
  jobTitle: string
  baseSalary: number
  hireDate: string | null
  resignDate: string | null
  active: boolean
}

export interface PayslipLine {
  id: number
  lineNo: number
  kind: PayslipLineKind
  kindName: string
  name: string
  amount: number
  auto: boolean
}

export interface Payslip {
  id: number
  employeeId: number
  employeeCode: string
  employeeName: string
  department: string | null
  payMonth: string
  baseSalary: number
  allowanceTotal: number
  deductionTotal: number
  grossPay: number
  netPay: number
  status: PayslipStatus
  statusName: string
  remark: string | null
  lines: PayslipLine[]
}

// ===== 견적서 =====

export type QuotationStatus = 'DRAFT' | 'SENT' | 'CONVERTED' | 'CANCELLED'

export interface QuoteLine {
  id: number
  lineNo: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
}

export interface Quotation {
  id: number
  quoteNo: string
  quoteDate: string
  validUntil: string | null
  partnerId: number
  partnerName: string
  status: QuotationStatus
  statusName: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  convertedOrderId: number | null
  remark: string | null
  createdBy: string | null
  lines: QuoteLine[]
}

// ===== 발주서 =====

export type PurchaseOrderStatus =
  | 'REQUESTED' | 'PLANNED' | 'PRICED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'

export interface PurchaseOrderLine {
  id: number
  lineNo: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
}

export interface PurchaseOrder {
  id: number
  orderNo: string
  orderDate: string
  dueDate: string | null
  partnerId: number
  partnerName: string
  status: PurchaseOrderStatus
  statusName: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  taxable: boolean
  convertedPurchaseId: number | null
  remark: string | null
  createdBy: string | null
  lines: PurchaseOrderLine[]
}

export interface Department {
  id: number
  code: string
  name: string
  parentId: number | null
  parentName: string | null
  sortOrder: number
  active: boolean
  employeeCount: number
}

// ===== 인사관리 (발령이력) =====

export type AssignmentType = 'HIRE' | 'TRANSFER' | 'PROMOTION' | 'RESIGN' | 'REHIRE'

export interface Assignment {
  id: number
  employeeId: number
  employeeCode: string
  employeeName: string
  assignDate: string
  type: AssignmentType
  typeName: string
  departmentId: number | null
  department: string
  jobTitle: string
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
export type NoteStatus = 'HELD' | 'SETTLED' | 'DISCOUNTED' | 'DISHONORED'

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
}

// ===== 전자근로계약 =====

export type ContractType = 'PERMANENT' | 'FIXED_TERM' | 'DAILY'
export type ContractStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'TERMINATED'

export interface EmploymentContract {
  id: number
  contractNo: string
  employeeId: number
  employeeCode: string
  employeeName: string
  type: ContractType
  typeName: string
  status: ContractStatus
  statusName: string
  startDate: string
  endDate: string | null
  departmentId: number | null
  department: string
  jobTitle: string
  monthlySalary: number
  weeklyHours: number
  workPlace: string | null
  duty: string | null
  signedAt: string | null
  signedBy: string | null
  remark: string | null
  createdBy: string | null
}

// ===== 일용근로급여 =====

export interface DailyWork {
  id: number
  employeeId: number
  employeeCode: string
  employeeName: string
  department: string
  workDate: string
  workHours: number
  dailyWage: number
  incomeTax: number
  localIncomeTax: number
  netPay: number
  paid: boolean
  paidDate: string | null
  remark: string | null
  createdBy: string | null
}

export interface DailyWorkSummary {
  month: string
  headcount: number
  workDays: number
  totalWage: number
  totalIncomeTax: number
  totalLocalIncomeTax: number
  totalNetPay: number
  unpaidNetPay: number
  rows: DailyWork[]
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

export type IncomeType = 'BUSINESS' | 'OTHER' | 'INTEREST' | 'DIVIDEND'

export interface OtherWithholding {
  id: number
  docNo: string
  payDate: string
  incomeType: IncomeType
  incomeTypeName: string
  partnerId: number | null
  payeeName: string
  payeeRegNo: string | null
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

// ===== 명함관리 =====

export interface BusinessCard {
  id: number
  name: string
  partnerId: number | null
  partnerName: string | null
  companyName: string | null
  department: string | null
  jobTitle: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  address: string | null
  ownerUserId: number | null
  ownerName: string | null
  tags: string[]
  memo: string | null
}

// ===== 그룹웨어: 공용메일 =====

export type MailType = 'INTERNAL' | 'SHARED'
export type MailStatus = 'UNREAD' | 'READ' | 'IN_PROGRESS' | 'HANDLED'

export interface Mail {
  id: number
  type: MailType
  typeName: string
  senderId: number | null
  senderName: string | null
  fromAddress: string | null
  recipientId: number | null
  recipientName: string | null
  subject: string
  body: string | null
  sentAt: string
  status: MailStatus
  statusName: string
  assigneeId: number | null
  assigneeName: string | null
  handledAt: string | null
  handleNote: string | null
}

export interface SharedMailBox {
  pendingCount: number
  mails: Mail[]
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

// ===== WMS (로케이션) =====

export interface WarehouseLocation {
  id: number
  warehouseId: number
  warehouseName: string
  code: string
  zone: string | null
  rack: string | null
  level: string | null
  description: string | null
  active: boolean
}

export interface LocationStock {
  id: number
  locationId: number
  locationCode: string
  warehouseId: number
  warehouseName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  quantity: number
}

/** (품목, 창고)별 배치 현황: 창고 재고 = 배치 + 미배치 */
export interface AllocationRow {
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number
  warehouseName: string
  stockQuantity: number
  allocatedQuantity: number
  unallocatedQuantity: number
}

export interface WmsOverview {
  locations: WarehouseLocation[]
  locationStocks: LocationStock[]
  allocations: AllocationRow[]
}

// ===== 수출관리 =====

export type ExportStatus = 'ORDER' | 'CUSTOMS' | 'SHIPPED' | 'PAID'

export interface ExportOrderLine {
  id: number
  lineNo: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface ExportOrder {
  id: number
  invoiceNo: string
  invoiceDate: string
  partnerId: number
  buyerName: string
  currencyId: number
  currencyCode: string
  currencySymbol: string | null
  foreignAmount: number
  appliedRate: number
  krwAmount: number
  incoterms: string | null
  destination: string | null
  status: ExportStatus
  statusName: string
  declarationNo: string | null
  blNo: string | null
  shippedDate: string | null
  paidDate: string | null
  remark: string | null
  createdBy: string | null
  lines: ExportOrderLine[]
}

export interface ExportSummary {
  totalKrw: number
  unpaidKrw: number
  orderCount: number
  shippingCount: number
  unpaidCount: number
  exports: ExportOrder[]
}

// ===== 쇼핑몰관리 =====

export type MallOrderStatus = 'RECEIVED' | 'CONFIRMED' | 'CONVERTED' | 'CANCELLED'

export interface MallOrder {
  id: number
  mall: string
  mallOrderNo: string
  orderDate: string
  status: MallOrderStatus
  statusName: string
  buyerName: string
  buyerPhone: string | null
  address: string | null
  productName: string
  itemId: number | null
  itemCode: string | null
  itemName: string | null
  quantity: number
  unitPrice: number
  totalAmount: number
  salesId: number | null
  salesDocNo: string | null
  remark: string | null
  createdBy: string | null
}

export interface MallSummary {
  mall: string
  orderCount: number
  totalAmount: number
  unconverted: number
}

export interface MallOverview {
  totalOrders: number
  totalAmount: number
  unmapped: number
  unconverted: number
  byMall: MallSummary[]
  orders: MallOrder[]
}

// ===== 쇼핑몰관리 =====

export type MallOrderStatus = 'RECEIVED' | 'CONFIRMED' | 'CONVERTED' | 'CANCELLED'

export interface MallOrder {
  id: number
  mall: string
  mallOrderNo: string
  orderDate: string
  status: MallOrderStatus
  statusName: string
  buyerName: string
  buyerPhone: string | null
  address: string | null
  productName: string
  itemId: number | null
  itemCode: string | null
  itemName: string | null
  quantity: number
  unitPrice: number
  totalAmount: number
  salesId: number | null
  salesDocNo: string | null
  remark: string | null
  createdBy: string | null
}

export interface MallSummary {
  mall: string
  orderCount: number
  totalAmount: number
  unconverted: number
}

export interface MallOverview {
  totalOrders: number
  totalAmount: number
  unmapped: number
  unconverted: number
  byMall: MallSummary[]
  orders: MallOrder[]
}

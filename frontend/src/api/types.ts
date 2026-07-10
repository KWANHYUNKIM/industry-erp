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

export type ApprovalFormType =
  | 'LEAVE' | 'BIZ_TRIP' | 'TRIP_REPORT' | 'EXPENSE' | 'PURCHASE_REQ' | 'GENERAL'

export type ApprovalStatus = 'DRAFTING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED'

export type ApprovalLineStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

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

export interface ApprovalDoc {
  id: number
  docNo: string
  formType: ApprovalFormType
  formTypeName: string
  title: string
  content: string
  drafterId: number
  drafterName: string
  draftDate: string
  status: ApprovalStatus
  statusName: string
  currentStep: number
  reference: string | null
  currentApproverName: string | null
  lines: ApprovalLine[]
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

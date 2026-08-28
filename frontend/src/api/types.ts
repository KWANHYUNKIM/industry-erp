// 백엔드 응답과 매칭되는 타입 정의

export interface User {
  id: number
  username: string
  name: string
  email: string | null
  department: string | null
  /**
   * 이어진 사원(hr.Employee) id. 안 이으면 null.
   *
   * <p>이름·직급·사원번호는 여기 없다 — auth 는 기반층이라 hr 을 참조할 수 없어
   * 서버가 붙이지 못한다(CLAUDE.md 4.1). 근태 응답은 hr 이 붙여서 보낸다.
   */
  employeeId: number | null
  enabled: boolean
  roles: string[]
}

export interface Role {
  id: number
  name: string
  displayName: string
  description: string | null
  system?: boolean
  userCount?: number
  permissionCodes?: string[]
}

export interface Permission {
  code: string
  name: string
  category: string
  sort: number
}

export interface LoginResponse {
  token: string
  companyCode: string
  companyName: string
  user: User
}

export interface Company {
  id: number
  code: string
  name: string
  schemaName: string
  active: boolean
  createdAt: string | null
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
  /** 구매(입고) 기준단가. 0 이면 안 정한 것이고, 구매할인현황이 할인을 계산하지 않는다. */
  purchasePrice: number
  safetyStock: number
  barcode: string | null
  /** 원본 품목등록 리스트의 [이미지]. 파일이 없으면 둘 다 null. */
  imageFileId: number | null
  imageFileName: string | null
  /**
   * 원본 품목등록 리스트의 [구매처명] — 이 품목을 늘 사 오는 곳.
   * 서버는 id 만 준다(inventory 가 trade 를 참조할 수 없어서). 이름은 화면이 거래처 목록에서 붙인다.
   */
  supplierId: number | null
  /** 원본 품목등록 리스트의 [검색창내용]. */
  searchKeyword: string | null
  /**
   * 재고수량관리 — 원본 품목등록 리스트의 열('수량관리대상' · '수량관리제외').
   * false 면 재고를 잡지 않는다(용역·운반비 같은 품목).
   */
  stockTracked: boolean
  /** 의료기기 표준코드(UDI-DI). 값이 있으면 의료기기공급내역보고 대상. */
  udiDi: string | null
  /**
   * 관리항목 (이카운트 품목등록 A7 탭 `item_type`).
   * 전표 라인의 관리항목 열은 이 값을 읽기전용으로 보여 준다 — 라인에서 고르는 값이 아니다.
   */
  managementItemId: number | null
  managementItemName: string | null
  /**
   * 품목그룹 (원본 품목등록 리스트의 '품목그룹1명' 열).
   * 오랫동안 엔티티에만 있고 등록 요청에는 없어서 아무도 지정할 수 없었다.
   */
  itemGroupId: number | null
  itemGroupName: string | null
  active: boolean
}

/** 품목그룹·거래처그룹 마스터. 두 그룹의 모양이 같아 한 타입으로 쓴다. */
export interface GroupMaster {
  id: number
  code: string
  name: string
  sortOrder: number
  active: boolean
}

export interface Warehouse {
  id: number
  code: string
  name: string
  location: string | null
  active: boolean
  /**
   * 구분 — 창고 · 공장 · 외주. 원본 창고등록리스트의 [구분] 열.
   * 공정·외주거래처는 <b>id 만</b> 온다 — inventory 는 다른 모듈을 참조할 수 없어
   * 서버가 이름을 붙이지 못한다(CLAUDE.md 4.1). 화면이 각자 목록에서 붙인다.
   */
  kind: string
  processId: number | null
  outsourcingPartnerId: number | null
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
  /** 모바일. 원본 거래처리스트의 열 — 전화와 따로다. */
  mobile: string | null
  /** 원본 거래처관리대장 I 머리말의 Email. */
  email: string | null
  /** 원본 거래처관리대장 I 머리말의 Fax. */
  fax: string | null
  /** 원본 거래처관리대장 I 머리말의 여신한도. 0 은 '한도 없음' 이 아니라 원본이 찍는 값이다. */
  creditLimit: number
  /** 이체정보 — 지급할 때 쓸 계좌. 원본 [이체정보] 열이 이게 있는지를 보여 준다. */
  bankName: string | null
  accountNo: string | null
  accountHolder: string | null
  /** 우편번호. 원본 거래처등록 [기본] 탭의 [주소1 우편번호]. */
  postalCode: string | null
  address: string | null
  salesPriceGroup: string | null
  purchasePriceGroup: string | null
  /** 원본 거래처검색·거래처리스트의 [검색창내용]. 부르는 이름으로 찾는다. */
  searchKeyword: string | null
  /** 원본 [거래처코드구분] — 사업자등록번호 · 주민등록번호 · 외국인. */
  regNoKind: string
  /** 원본 [업종별구분] — 일반 · 관세사 · 외화거래처. */
  industryKind: string
  subBizNo: string | null
  postalCode2: string | null
  address2: string | null
  homepage: string | null
  remark: string | null
  /** 원본 [세무신고거래처]. */
  taxReport: boolean
  /** 원본 [출하대상거래처]. */
  shipmentTarget: boolean
  /**
   * 원본 [관계설정]의 대표거래처. 이 거래처가 어느 회사의 지점·사업장이면 그 회사다.
   * 미지정이면 자기가 곧 대표다 — 거래처관리대장의 [대표거래처로 합산]이 이걸 쓴다.
   */
  parentId: number | null
  parentName: string | null
  partnerGroupId: number | null
  partnerGroupName: string | null
  active: boolean
}

export interface TradeLine {
  /**
   * 라인 id. 라인 단위로 무언가를 붙이려면(추가항목 등) 이 키가 있어야 한다.
   * 수주는 예전부터 주는데 판매·구매만 빠져 있었다.
   */
  lineId: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  spec: string | null
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
  remark: string | null
  /** 시리얼/로트 (이카운트 판매입력 그리드의 serial_cd) */
  lotNo: string | null
  /** 부대비용 (cust_amt). 합계 금액에는 더하지 않는다. */
  extraCost: number | null
  /**
   * 불러온 근거전표 — 이카운트 판매입력·구매입력 그리드의 [불러온 전표 / 전표일자 / 전표No.] 3열.
   * [전표불러오기]로 수주·발주 라인을 담았을 때만 채워지고, 직접 입력한 줄은 전부 null 이다.
   */
  sourceOrderId: number | null
  /** '주문서'(판매) 또는 '발주서'(구매) */
  sourceDocType: string | null
  sourceDocDate: string | null
  sourceDocNo: string | null
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
  /** 부가세를 전표 단위로 계산한 전표인가 (이카운트 [거래별부가세계산]) */
  vatBySlip: boolean
  /** 과세 전표인가. 예전에는 부가세 > 0 인지로 되짚었는데 반올림으로 0 이 된 과세 전표가 면세로 섞였다. */
  taxable: boolean
  /** 원본 [거래구분]이 반품인가. 반품이면 수량·금액이 음수로 저장돼 있다. */
  returnSlip: boolean
  /** 원본 [거래구분] 표시값 — 일반 · 반품. */
  tradeKindName: string
  /** 귀속 프로젝트 (백엔드 SalesResponse 가 이미 주고 있던 필드 — 타입에 빠져 있었다) */
  projectId: number | null
  projectName: string | null
  employeeId: number | null
  employeeName: string | null
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
  /** 부가세를 전표 단위로 계산한 전표인가 (이카운트 [거래별부가세계산]) */
  vatBySlip: boolean
  /** 과세 전표인가. 예전에는 부가세 > 0 인지로 되짚었는데 반올림으로 0 이 된 과세 전표가 면세로 섞였다. */
  taxable: boolean
  /** 원본 [거래구분]이 반품인가. 반품이면 수량·금액이 음수로 저장돼 있다. */
  returnSlip: boolean
  /** 원본 [거래구분] 표시값 — 일반 · 반품. */
  tradeKindName: string
  /** 회계반영 여부 (판매와 맞추려고 응답에 추가했다) */
  accountingReflected: boolean
  /** 귀속 프로젝트 (백엔드 PurchaseResponse 가 이미 주고 있던 필드 — 타입에 빠져 있었다) */
  projectId: number | null
  projectName: string | null
  employeeId: number | null
  employeeName: string | null
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
  /** 채권/채무현황 조건용 (기존 화면은 쓰지 않아도 된다) */
  partnerGroupId: number | null
  partnerGroupName: string | null
  manager: string | null
  active: boolean
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
  /**
   * 규격. 원본 작업지시서조회의 열 이름이 <b>[품목명[규격]]</b> 이다 —
   * 서버는 보내고 있었는데 이 타입에 없어 화면이 쓸 수가 없었다.
   */
  productSpec: string | null
  productUnit: string
  warehouseId: number
  warehouseName: string
  /** 납품처. 원본 작업지시서조회의 [거래처명] 열. */
  partnerId: number | null
  partnerName: string | null
  /**
   * 담당자(사원) id. <b>이름은 여기 없다</b> — production 은 hr 을 참조할 수 없어
   * 서버가 붙이지 못한다(hr → accounting → production 이 이미 있어 순환).
   * 화면이 사원 목록에서 붙인다.
   */
  employeeId: number | null
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
  /**
   * 생산된공장 — 자재가 빠진 곳. 원본 생산입고조회의 [생산된공장명] 열.
   * 안 고르면 null 이고 받는창고 하나에서 오간 것이다.
   */
  fromWarehouseId: number | null
  fromWarehouseName: string | null
  /** 귀속 프로젝트. 원본 생산입고현황 조건의 [프로젝트]. */
  projectId: number | null
  projectName: string | null
  /** 적요. 원본 생산입고현황의 마지막 열. */
  note: string | null
  /** 원본 생산입고 I·II 의 [노무시간](분). 안 적었으면 null — 0 과 다르다. */
  laborMinutes: number | null
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
  /**
   * 셀 배치 — 원본은 「신청일자 | 시작 ~ 종료」처럼 여러 필드를 한 줄에 놓는다.
   * 같은 `row` 값을 가진 필드들이 한 줄에 그려진다. 없으면 한 줄에 한 필드(기존 동작).
   */
  row?: number
  /** 그 줄의 라벨. 줄의 첫 필드에만 준다. 없으면 첫 필드의 label 을 쓴다. */
  rowLabel?: string
  /** 앞 필드와 이 필드 사이에 넣을 글자 (예: '~'). */
  sep?: string
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
  /** 원본 기안서통합관리 조건의 [라벨] — 문서에 붙이는 꼬리표. 서버는 이미 주고 있었다. */
  labelText: string | null
  /** 원본 조건의 [첨부] — 붙임 파일. 서버는 이미 주고 있었다. */
  attachmentId: number | null
  attachmentName: string | null
  currentApproverName: string | null
  /**
   * 작업자 · 작업일시 — 원본 기안서통합관리의 마지막 두 열.
   * 마지막으로 이 문서를 움직인 사람과 시각이다. 아무도 결재 안 했으면 기안자·기안 시각.
   */
  lastActorName: string | null
  lastActedAt: string | null
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
  /** 거래처 마스터와 이름이 정확히 일치할 때만 채워진다 */
  partnerId: number | null
  projectId: number | null
  projectName: string | null
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

/**
 * 품목별 원가 (`GET /api/costs`). 회계 모듈이 소유하고, 판매입력의 [이익계산] 이 읽어 간다.
 * (원가 화면 4개가 각자 같은 모양을 지역 선언하고 있다 — 그 화면들을 손볼 때 이걸로 모은다.)
 */
export interface ItemCost {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  /** 귀속 기간 'YYYY-MM' */
  period: string
  materialCost: number
  laborCost: number
  overheadCost: number
  standardTotal: number
  actualMaterial: number
  actualLabor: number
  actualOverhead: number
  actualTotal: number
  /** 실제 - 표준 */
  variance: number
  varianceRate: number
}

/**
 * My품목 (`GET /api/my-items`) — 전표 입력 툴바 [My품목 ▾] 의 즐겨찾기 품목.
 * users × items 를 함께 참조해야 해서 백엔드에서는 groupware 모듈이 소유한다.
 */
export interface MyItem {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  spec: string | null
  unit: string
  unitPrice: number
  /** 담을 기본 수량 */
  defaultQty: number
  sortOrder: number
}

export interface PriceOrderLine {
  functionName: string
  applyOrder: number
  active: boolean
}

// ===== 특별단가(E040124) =====

export type SpecialPriceType = 'SALES' | 'PURCHASE'

export interface SpecialPrice {
  id: number
  tradeType: SpecialPriceType
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  partnerId: number | null
  partnerName: string | null
  priceGroup: string | null
  unitPrice: number
  active: boolean
  remark: string | null
  createdBy: string | null
}

export interface SpecialPriceResolve {
  found: boolean
  unitPrice: number | null
  source: 'PARTNER' | 'GROUP' | null
  priceGroup: string | null
}

// ===== 카드사(E010109) / 결제대행사(E010114) 기초등록 마스터 =====

export interface CardIssuer {
  id: number
  code: string
  name: string
  feeRate: number | null
  remark: string | null
  active: boolean
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

export type QualityRequestStatus = 'REQUESTED' | 'INSPECTED' | 'CANCELED'

export interface QualityInspectionRequest {
  id: number
  requestNo: string
  requestDate: string
  type: QualityInspectionType
  typeName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  lotNo: string | null
  requestQty: number
  dueDate: string | null
  status: QualityRequestStatus
  statusName: string
  requester: string | null
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

export type StockAdjustmentType = 'SELF_USE' | 'DEFECT' | 'SUBSTITUTE' | 'DISPOSAL' | 'ADJUST'

export type StagedStatus = 'REQUESTED' | 'APPLIED' | 'REJECTED'

export interface StagedAdjustment {
  id: number
  adjustNo: string
  requestDate: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number
  warehouseName: string
  bookQty: number
  actualQty: number
  diff: number
  reason: string | null
  status: StagedStatus
  statusName: string
  requester: string | null
  handler: string | null
}

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

export type LotStatus = 'IN_STOCK' | 'SHIPPED' | 'HOLD'

export interface Lot {
  id: number
  lotNo: string
  itemId: number
  itemCode: string
  itemName: string
  /** 규격 — 원본 열 [품목명[규격]]·[규격] 이 쓴다. */
  spec: string | null
  unit: string
  warehouseId: number | null
  warehouseName: string | null
  inboundDate: string
  expireDate: string | null
  inboundQty: number
  stockQty: number
  held: boolean
  /** 저장하지 않고 파생되는 상태 (보류 우선 → 수량 0이면 출고완료) */
  status: LotStatus
  statusName: string
}

export type LotTxType = 'INBOUND' | 'OUTBOUND' | 'ADJUST'

export interface LotTransaction {
  id: number
  lotId: number
  lotNo: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  txDate: string
  type: LotTxType
  typeName: string
  quantityChange: number
  balanceAfter: number
  note: string | null
  createdBy: string | null
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
  /** 게시판. 게시글번호는 게시판을 가로질러 한 줄기라 목록 번호에 구멍이 보인다 */
  board: 'WORK' | 'NOTICE'
  boardName: string
  postNo: number
  postDate: string
  title: string
  content: string
  /** 작성자 로그인 아이디 (users.username FK) */
  writer: string
  /** 작성자 표시 이름. 화면은 이걸 쓴다 — writer 는 아이디라 사람이 읽기 나쁘다. */
  writerName: string
  forwardTo: string | null
  /** 원본 WORK입력 폼의 [참조자]. */
  ccTo: string | null
  /** 원본 WORK입력 폼의 [공지사항여부]. true 면 목록 맨 위에 붙는다. */
  notice: boolean
  /** 원본 WORK입력 폼의 [완료일시]. 진행중이면 null. */
  completedAt: string | null
  /** 원본 격자의 [첨부] 열. 파일이 없으면 셋 다 null 이다. */
  attachmentId: number | null
  attachmentName: string | null
  attachmentSize: number | null
  /** 원본 격자의 [조회] 열 — 글을 편 횟수. */
  viewCount: number
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
  /** 실제 업로드된 파일 id. null 이면 메타데이터만 등록된 항목(다운로드 불가). */
  fileId: number | null
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

// ===== 급여 설정 (수당·공제 항목/그룹) · 급여이체 =====
// PayslipLineKind 는 위 급여관리 블록에 이미 있다.

export interface PayItem {
  id: number
  code: string
  name: string
  kind: PayslipLineKind
  kindName: string
  /** 비과세 수당이면 false — 4대보험·소득세 기준에서 빠진다 */
  taxable: boolean
  defaultAmount: number
  active: boolean
}

export interface PayGroupLine {
  payItemId: number
  code: string
  name: string
  kind: PayslipLineKind
  kindName: string
  taxable: boolean
  amount: number
}

export interface PayGroup {
  id: number
  name: string
  remark: string | null
  active: boolean
  allowanceTotal: number
  deductionTotal: number
  lines: PayGroupLine[]
}

export interface PayrollTransferLine {
  payslipId: number
  employeeId: number
  employeeName: string
  department: string | null
  netPay: number
}

export interface PayrollTransfer {
  id: number
  transferNo: string
  payMonth: string
  transferDate: string
  bankAccountId: number
  bankAccountName: string
  totalPay: number
  totalDeduction: number
  netPay: number
  journalEntryId: number | null
  journalDocNo: string | null
  createdBy: string | null
  lines: PayrollTransferLine[]
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
  /** 원본 견적서의 [창고]·[프로젝트]. 견적 시점에는 안 정했을 수 있어 널이다. */
  warehouseId: number | null
  warehouseName: string | null
  projectId: number | null
  projectName: string | null
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
  employeeId: number | null
  employeeName: string | null
  warehouseId: number | null
  warehouseName: string | null
  currency: string | null
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
  draft: boolean
  deletedAt: string | null
  /** 스팸 메일함 분류 여부와 사유(어떤 규칙에 걸렸는지 / 수동 지정) */
  spam: boolean
  spamReason: string | null
}

export interface SharedMailBox {
  pendingCount: number
  mails: Mail[]
}

// ===== 쪽지 =====

/** 쪽지. senderId 가 null 이면 시스템 자동알림(senderName 은 'ECOUNT'). */
export interface ShortMessage {
  id: number
  senderId: number | null
  senderName: string
  recipientId: number
  recipientName: string
  partnerId: number | null
  partnerName: string | null
  content: string
  sentAt: string
  readAt: string | null
  archived: boolean
  system: boolean
  statusName: string
  linkSource: string | null
  linkRef: string | null
  linkPath: string | null
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

export type MallOrderStatus = 'RECEIVED' | 'CONFIRMED' | 'CONVERTED' | 'SHIPPED' | 'RETURNED' | 'EXCHANGED' | 'CANCELLED'

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
  mallProductCode: string | null
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
  courier: string | null
  trackingNo: string | null
  shippedAt: string | null
  closeReason: string | null
  closedAt: string | null
}

export interface MallSummary {
  mall: string
  orderCount: number
  totalAmount: number
  unconverted: number
}

export interface MallItemMapping {
  id: number
  mall: string
  mallProductCode: string
  mallProductName: string | null
  itemId: number
  itemCode: string
  itemName: string
  active: boolean
}

// ===== 수집데이터 소스 등록(E100000) =====

export interface CollectSource {
  id: number
  name: string
  category: string
  endpoint: string
  paged: boolean
  sortOrder: number
  active: boolean
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

export type MallAccountType = 'MALL' | 'SOLUTION'

export interface MallAccount {
  id: number
  code: string
  name: string
  type: MallAccountType
  typeName: string
  partnerId: number | null
  partnerName: string | null
  sellerId: string | null
  memo: string | null
  active: boolean
}

export interface MallOverview {
  totalOrders: number
  totalAmount: number
  unmapped: number
  unconverted: number
  byMall: MallSummary[]
  orders: MallOrder[]
}

// ===== 인쇄용 결재라인 =====

export interface SignSlot {
  id: number
  slotOrder: number
  title: string
  signerName: string | null
}

export interface SignLine {
  id: number
  name: string
  defaultLine: boolean
  active: boolean
  remark: string | null
  slots: SignSlot[]
}

// ===== 프로젝트 (기초등록 마스터) · 프로젝트별 손익 =====

export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE'

export interface Project {
  id: number
  code: string
  name: string
  manager: string | null
  startDate: string
  endDate: string | null
  progress: number
  status: ProjectStatus
  statusName: string
  remark: string | null
  createdBy: string | null
}

export interface ProjectProfitRow {
  projectId: number
  projectCode: string
  projectName: string
  status: string | null
  revenue: number
  purchaseCost: number
  expense: number
  profit: number
  marginRate: number
  salesCount: number
  purchaseCount: number
  expenseCount: number
}

export interface ProjectProfitSummary {
  from: string
  to: string
  totalRevenue: number
  totalCost: number
  totalProfit: number
  unassignedRevenue: number
  unassignedCost: number
  rows: ProjectProfitRow[]
}

// ===== 익명게시판 · 외근조회 =====

export interface BoardPost {
  id: number
  title: string
  /** 목록에도 본문이 실린다 — 익명게시판은 목록이 곧 본문이라서 */
  content: string | null
  category: string | null
  author: string | null
  anonymous: boolean
  views: number
  createdAt: string
}

export interface BoardPostDetail extends BoardPost {
  content: string | null
}

export type FieldWorkStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED'

export interface FieldWork {
  id: number
  userId: number
  userName: string
  department: string | null
  workDate: string
  startTime: string | null
  endTime: string | null
  destination: string
  purpose: string
  status: FieldWorkStatus
  statusName: string
  approverName: string | null
  rejectReason: string | null
}

export interface FieldWorkSummary {
  requestedCount: number
  approvedCount: number
  rejectedCount: number
  rows: FieldWork[]
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

// ===== 담당자별 실적 =====

export interface PerformanceRow {
  employeeId: number | null
  employeeCode: string
  employeeName: string
  department: string | null
  salesCount: number
  salesAmount: number
  purchaseCount: number
  purchaseAmount: number
  salesShare: number
}

export interface PerformanceSummary {
  from: string
  to: string
  totalSales: number
  totalPurchase: number
  rows: PerformanceRow[]
}

// ===== 우측 앱바 위젯 (통합검색 · 알림 · E Note) =====

export interface SearchHit {
  title: string
  subtitle: string
  /** 클릭하면 이동할 화면 경로 */
  to: string
}

export interface SearchGroup {
  type: string
  typeName: string
  /** 전체 매칭 건수 (hits 는 상위 일부만) */
  total: number
  hits: SearchHit[]
}

export interface WorkspaceSearch {
  keyword: string
  total: number
  groups: SearchGroup[]
}

export interface WorkspaceNotification {
  type: string
  level: 'INFO' | 'WARN'
  title: string
  message: string
  count: number
  to: string
}

export interface NotificationResponse {
  total: number
  notifications: WorkspaceNotification[]
}

export interface UserNote {
  id: number
  content: string
  pinned: boolean
  updatedAt: string
}

/* ── 메신저 (앱바 💬) ───────────────────────────────────────────── */

export interface ChatMember {
  userId: number
  name: string
  department: string | null
}

export interface ChatRoom {
  id: number
  /** 1:1 이면 상대 이름, 그룹이면 방 이름 (백엔드가 내 기준으로 만들어 준다) */
  title: string
  direct: boolean
  memberCount: number
  members: ChatMember[]
  lastMessage: string | null
  lastSenderName: string | null
  lastMessageAt: string | null
  unread: number
}

export interface ChatMessage {
  id: number
  roomId: number
  senderId: number | null
  senderName: string
  content: string
  sentAt: string
  /** 참여·퇴장 같은 시스템 안내 */
  system: boolean
}

// ── 설문조사 (그룹웨어 > 공유정보 > 설문조사) ───────────────────────────────

/** 원본 설문조사입력의 질문유형 9종. */
export type QuestionType =
  | 'SINGLE' | 'MULTI' | 'SINGLE_ETC' | 'MULTI_ETC'
  | 'SHORT_TEXT' | 'LONG_TEXT' | 'RANK' | 'DATE' | 'SCALE'

export type SurveyStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'UNSENT'

export interface SurveyQuestion {
  id: number
  seq: number
  type: QuestionType
  typeName: string
  /** 보기항목을 쓰는 유형인가 — 화면이 보기 칸을 그릴지 판단한다 */
  usesOptions: boolean
  content: string
  options: string[]
  required: boolean
}

export interface SurveyDoc {
  id: number
  postNo: number
  title: string
  endAt: string | null
  targetScope: 'INTERNAL' | 'EXTERNAL'
  targetScopeName: string
  anonymous: boolean
  resultVisibility: 'ALL' | 'PARTIAL' | 'NONE'
  resultVisibilityName: string
  headerText: string | null
  status: SurveyStatus
  statusName: string
  createdBy: string | null
  writerName: string | null
  createdAt: string | null
  questionCount: number
  targetCount: number
  responseCount: number
  responseRate: number
  /** 지금 보는 사람이 이미 응답했는가 — 원본 '설문조사 참여여부' 칸 */
  answeredByMe: boolean
  /** 설문종료일이 지났는가. 상태가 '진행중'이어도 시간으로 닫힌다 */
  expired: boolean
  questions: SurveyQuestion[]
  targets: { userId: number; userName: string }[]
}

export interface SurveyQuestionResult {
  questionId: number
  seq: number
  typeName: string
  content: string
  usesOptions: boolean
  /** 보기 → 응답 수. 보기 없는 유형이면 비어 있다 */
  counts: Record<string, number>
  /** 서술형 답변 원문 + '기타' 직접 입력 */
  texts: string[]
  answeredCount: number
}

export interface SurveyResult {
  surveyId: number
  title: string
  targetCount: number
  responseCount: number
  responseRate: number
  anonymous: boolean
  questions: SurveyQuestionResult[]
}

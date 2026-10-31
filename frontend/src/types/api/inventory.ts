// 백엔드 응답과 매칭되는 타입 — 재고 · 품목 · 창고 · 프로젝트(기초 마스터). types/api.ts 가 다시 내보낸다(기존 import 경로 그대로).

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
  /** 단가A ~ 단가J (원본 품목등록 [단가] 탭). 늘 열 칸. */
  gradePrices: number[]
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
  /* 원본 품목등록 폼의 나머지 칸들. */
  remark: string | null
  vatRateSales: number | null
  vatRatePurchase: number | null
  subcontractPrice: number | null
  leadTimeDays: number | null
  minPurchaseUnit: number | null
  setItem: boolean
  sharedItem: boolean
  itemType: string | null
  parentItemId: number | null
  parentItemName: string | null
  lotManaged: boolean
  qcType: string | null
  qcMethod: string | null
  qcOnPurchase: boolean
  qcOnProduction: boolean
  autoProductionOnSales: boolean
  autoProductionOnTransfer: boolean
  /** [원가] 탭(원본 C000029). 경비 · 노무비 · 외주비표준원가는 원본 창에서 잠긴 칸 — 보기만 한다. */
  stdLaborHours: number
  expenseWeight: number
  materialStdCost: number | null
  expenseStdCost: number
  laborStdCost: number
  subcontractStdCost: number
  /** 원본 조건 [최초작성일자]·[최종수정일자]. */
  createdDate: string | null
  updatedDate: string | null
  /** 원본 [품목정보] 의 [생산공정] — 공정 id(태그 여러 개). 이름은 화면이 공정 목록에서 붙인다. */
  productionProcessIds?: number[]
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

// ===== 재고 기초등록: 관리항목 / 단가적용순서 =====

export interface ManagementItem {
  id: number
  code: string
  name: string
  description: string | null
  active: boolean
  /** 조회 조건 [수정일자순(정렬)] 의 축 */
  updatedAt?: string | null
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
  /** 원본 조건의 [프로젝트]·[담당자]. 옮길 때 안 정했을 수 있어 널이다. */
  projectId: number | null
  projectName: string | null
  employeeId: number | null
  reason: string | null
  createdBy: string | null
  /** 머리 적요 — 원본 창고이동입력 머리 [새로운 항목 추가]. */
  remark?: string | null
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
  /** 실사 전표 번호(줄들이 같이 쓴다) · 이 줄로 맞춘 재고조정(없으면 null). */
  slipNo: string
  adjustmentNo: string | null
  adjustmentDate: string | null
  /** 실사 전표 머리 [담당자](사원 id) — 이름은 사원 목록에서 붙인다. */
  employeeId: number | null
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
  /** 규격 — 원본 [품목] 열이 '이름 [규격]' 으로 찍는다. */
  spec?: string | null
  warehouseId: number
  warehouseName: string
  beforeQty: number
  quantityChange: number
  afterQty: number
  /** 원본 조건의 [프로젝트]·[담당자]. 옮길 때 안 정했을 수 있어 널이다. */
  projectId: number | null
  projectName: string | null
  employeeId: number | null
  reason: string | null
  createdBy: string | null
  /** 원본 [불량유형]·[사용유형] · [처리방법](불량처리). */
  kind?: string | null
  handling?: string | null
  /** 전표 안 줄 차례 — 같은 adjustNo 의 줄들이 한 장이다(자가사용입력). */
  lineNo?: number
  /** 원본 자가사용입력 머리 [거래처]. 이름은 화면이 거래처 목록에서 붙인다. */
  partnerId?: number | null
  /** 불량처리의 정상품목 줄(재고가 들어온 줄 — 품목대체 [정상품목] · 정상사용의 되돌아온 수량). */
  normal?: boolean
  /** 줄을 쓴 때(전표를 고치면 다시 쓴다) — 자가사용수정 [H] 이력. */
  createdAt?: string | null
}

/** 원본 자가사용입력(E040503) 전표 한 장 — 머리 + 줄. */
export interface StockAdjustmentSlip {
  adjustNo: string
  date: string
  type: StockAdjustmentType
  partnerId: number | null
  employeeId: number | null
  warehouseId: number
  warehouseName: string
  projectId: number | null
  projectName: string | null
  /** 불량처리의 [처리방법](폐기 · 품목대체 · 정상사용). */
  handling?: string | null
  /** 자가사용 머리 [새로운 항목 추가](전표 비고). */
  headerNote?: string | null
  lines: StockAdjustment[]
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
  /** 원본 [사용구분] — true 사용, false 사용중단. */
  useYn: boolean
  udiCode: string | null
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
  /*
   * 원본 시리얼/로트No.재고수불부 조건의 [창고]. 로트가 물고 있는 창고인데 응답에 안 실어
   * 어느 창고에서 오간 로트인지 보이지도 걸리지도 않았다. 안 정한 로트는 null.
   */
  warehouseId: number | null
  warehouseName: string | null
  /** 원본 시리얼/로트No.내역현황의 [유효기한] 조건(거기서는 구간이다)이 쓰는 축. */
  expireDate: string | null
  /** 원본 수불부 [기타]의 [사용중단시리얼/로트포함] 이 쓰는 축 — 우리 '사용중단' 은 보류다. */
  held: boolean
  txDate: string
  type: LotTxType
  typeName: string
  quantityChange: number
  balanceAfter: number
  note: string | null
  createdBy: string | null
  /** 원본 [전표구분] · [연결전표-No.] — 구매 · 판매가 남긴 줄이면 '구매' · 그 전표번호, 직접 남긴 줄이면 null. */
  docType: string | null
  sourceId: number | null
  sourceNo: string | null
  partnerName: string | null
  /** [신규(F2)] 내역입력으로 손으로 넣은 줄 — 그 줄만 열어 고치고 [선택삭제] 로 지운다. */
  manual: boolean
  txWarehouseId: number | null
  txWarehouseName: string | null
  projectId: number | null
  projectName: string | null
  chargeName: string | null
  mgmtName: string | null
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
  /** 원본 프로젝트리스트의 [사용] */
  active: boolean
  group1: string | null
  group2: string | null
  extraText1: string | null
  extraText2: string | null
  extraText3: string | null
  extraNum1: number | null
  extraNum2: number | null
  extraNum3: number | null
  extraLong1: string | null
  extraLong2: string | null
  extraLong3: string | null
  extraDate1: string | null
  extraDate2: string | null
  extraDate3: string | null
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

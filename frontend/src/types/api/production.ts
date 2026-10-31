// 백엔드 응답과 매칭되는 타입 — 생산. types/api.ts 가 다시 내보낸다(기존 import 경로 그대로).

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
  /** 원본 [BOM버전] · [기본BOM] — 제품 하나에 버전이 여럿일 수 있다(V226). */
  versionName: string
  defaultVersion: boolean
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
  /** 원본 조건 [품목구분]. 품목 마스터의 값이라 서버가 실어 준다. */
  productCategoryName: string | null
  /** 원본 조건 [최초작성일자]·[최종작업일자], [기타]의 수정일자순(정렬). */
  createdAt: string | null
  updatedAt: string | null
  /** 전표 안 줄 차례. 같은 orderNo 를 가진 줄들이 한 작업지시서다. */
  lineNo: number
  /** 원본 작업지시서입력 머리의 [프로젝트]. */
  projectId: number | null
  projectName: string | null
  /** 진행상태 — 결재중·미확인·확인. */
  confirmStatus?: 'UNCONFIRMED' | 'IN_APPROVAL' | 'CONFIRMED'
  /** 원본 작업지시서입력 머리의 [첨부]. */
  attachmentId?: number | null
  attachmentName?: string | null
  attachmentSize?: number | null
}

export interface ProductionMaterial {
  componentId: number
  componentCode: string
  componentName: string
  unit: string
  quantity: number
  /** 규격. 원본 [소모] 탭의 [규격]. */
  componentSpec?: string | null
  /** 원본 [소모] 탭의 [적요]. */
  note?: string | null
  /** 원본 [소모] 탭의 [시리얼/로트No.]. */
  lotNo?: string | null
}

/** 생산입고를 넣은 화면 — 원본 생산입고 I(BOM기준소모)·II(소모품목 선택)·III(공정별). */
export type ProductionEntryType = 'I' | 'II' | 'III'

export interface Production {
  id: number
  /** 전표번호. 한 전표의 줄들이 같은 번호를 나눠 가진다(원본처럼 전표 하나에 번호 하나). */
  prodNo: string
  /** 전표 안 줄 차례(1부터). */
  lineNo: number
  /** 넣은 화면 — 고칠 때 같은 화면으로 연다. */
  entryType: ProductionEntryType
  /** 불러온 작업지시서. 원본처럼 없어도 된다. */
  workOrderId: number | null
  workOrderNo: string | null
  workOrderDate: string | null
  /** 생산입고 III 의 [공정]. */
  processId: number | null
  processName: string | null
  /** 원본 격자 [외주비단가]·[외주비합계]·[외주비부가세]. */
  subcontractUnitPrice: number
  subcontractAmount: number
  subcontractVat: number
  /** 원본 격자 [시리얼/로트No.]. */
  lotNo: string | null
  /** 원본 격자 [BOM버전] — 비었으면 기본 BOM 으로 소모했다. */
  bomId?: number | null
  bomVersionName?: string | null
  /** 원본 생산입고입력 머리의 [첨부]. */
  attachmentId?: number | null
  attachmentName?: string | null
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
  /** 담당자(사원) id. 원본 생산입고 머리의 [담당자]. 이름은 화면이 사원 목록에서 붙인다. */
  employeeId: number | null
  producedQty: number
  productionDate: string
  createdBy: string | null
  materials: ProductionMaterial[]
}

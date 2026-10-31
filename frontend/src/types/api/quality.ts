// 백엔드 응답과 매칭되는 타입 — 품질. types/api.ts 가 다시 내보낸다(기존 import 경로 그대로).

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
  /** 원본 조건의 [창고]·[프로젝트]. 검사 시점에 안 정했을 수 있어 널이다. */
  warehouseId: number | null
  warehouseName: string | null
  projectId: number | null
  projectName: string | null
  inspector: string | null
  remark: string | null
  /**
   * 원본 불량률파악보고서의 [불량유형] — 공통코드 DEFECT_TYPE 의 <b>코드</b>다.
   * 불량이 없는 검사에는 없다. 이름은 화면이 공통코드에서 붙인다.
   */
  defectType: string | null
  /** 원본 [종결여부] 진행중 · 완료(2026-10-04 실측). */
  status: 'IN_PROGRESS' | 'COMPLETED'
  statusName: string
  /** 원본 품질검사입력의 품목 줄 — 머리의 품목 · 검사수량(시료 합) · 불량수량(부적격 합)은 여기서 모은 값이다. */
  lines: QualityInspectionLine[]
  totalQuantity: number
  /** 불러온 검사요청(원본 목록의 [출처]). */
  requestId: number | null
  requestNo: string | null
}

export interface QualityInspectionLine {
  id: number
  lineNo: number
  itemId: number
  itemCode: string
  itemName: string
  spec: string | null
  method: 'FULL' | 'SAMPLING'
  methodName: string
  quantity: number
  sampleQty: number
  goodQty: number
  defectQty: number
  passResult: 'NA' | 'PASS' | 'FAIL'
  passResultName: string
  defectType: string | null
  /** 원본 [검사항목] — 품목의 품질검사유형 칸에 적은 값(코드형식은 고른 상세항목명). */
  checks: QualityCheckValue[]
}

export interface QualityCheckValue {
  checkItemId: number
  detailId: number | null
  value: string
}

/** 품질검사입력 [검사항목] [내역] 창의 한 칸 — 품목에 붙은 검사유형의 검사항목. */
export interface QualityItemCheck {
  checkItemId: number
  code: string
  name: string
  format: 'CODE' | 'NUMBER' | 'TEXT'
  slot: number
  required: boolean
  details: { id: number; code: string; name: string; active: boolean }[]
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
  /** 원본 격자의 [규격]. 품목이 들고 있는 값이다. */
  spec: string | null
  unit: string
  lotNo: string | null
  requestQty: number
  dueDate: string | null
  status: QualityRequestStatus
  statusName: string
  /** 원본 품질검사요청입력 격자의 [프로젝트]. 안 걸었으면 null. */
  projectId: number | null
  projectName: string | null
  /** 원본 [검사방법] — 전수 · 샘플링. 샘플링이면 비율이 함께 온다. */
  inspectMethod: string | null
  samplePercent: number | null
  requester: string | null
  remark: string | null
  /** 원본 품질검사요청입력의 품목 줄(2026-10-04 실측). 머리의 품목 · 요청수량은 여기서 모은 값이다. */
  lines: { id: number; lineNo: number; itemId: number; itemCode: string; itemName: string; spec: string | null; method: 'FULL' | 'SAMPLING'; methodName: string; quantity: number; extraQty: number | null }[]
  /** 원본 [연결전표] — 이 요청을 [검사요청] 으로 불러와 만든 검사들. */
  inspections: { id: number; inspectionNo: string; inspectionDate: string; quantity: number }[]
  inspectedQty: number
  /** 원본 [잔량적용] 이 불러오는 남은 수량. */
  remainingQty: number
}

import type { SalesDoc, PurchaseDoc, Partner } from '../../types/api'
import { roundWon } from '../../utils/lineSupply'

/* 판매입력 · 구매입력(pages/trade/sales/TradeEntry)의 판매 / 구매 설정(CFG) · 줄 모양 · 불러오기 자료형 — TradeEntry 에서 몸통 그대로 옮겼다(단계 10). */

export type Mode = 'sales' | 'purchase'

/**
 * 판매조회 · 구매조회 위에 뜨는 <b>수정 창</b>으로 쓸 때 넘긴다(원본 E040206 에서 일자-No. 를 누르면
 * '판매입력(수정)' 창이 목록 위에 뜬다 — 2026-10-21 loginaa 실측). 주소(?edit=)를 쓰지 않고 이 값으로 전표를 연다.
 */
export interface TradeEntryPopup {
  /** 고칠 전표. null 이면 판매조회 [신규(F2)] 의 '판매입력' 창(원본 2026-10-21 실측 — 저장하면 말 없이 닫힌다). */
  editId: number | null
  /** 수정 창에서 [복사] 를 눌렀다 — 창 제목이 '판매입력(수정)' 에서 '판매입력' 으로 바뀐다. */
  onCopy?: () => void
  /** 창을 닫는다. changed 면 목록을 다시 읽는다(저장 · 삭제 뒤). */
  onClose: (changed: boolean) => void
  /** [이전] · [다음] — 원본은 목록 한 줄 아래(이전) · 위(다음)로 옮기고, 끝이면 '다음 자료가 없습니다.' */
  onMove: (dir: 'prev' | 'next') => void
  /** [반품처리] — 그 전표를 근거로 반품 입력을 연다. */
  onReturn: () => void
  /** 조회 화면이 이미 받아 둔 전표 목록(응답 그대로). 창을 열 때마다 2MB 넘는 목록을 다시 받지 않는다. */
  docs: (SalesDoc | PurchaseDoc)[]
  /**
   * 새 전표를 이 값으로 채워 연다 — 발주서조회 '생성한 전표' 창 [신규(F2)] 가 그 발주의 잔량으로 구매입력을 띄운다
   * (2026-10-28 원본 실측: 거래처 · 담당자 · 입고창고 · 줄(품목 · 잔량 · 단가) · 불러온 전표No., 일자는 오늘).
   */
  prefill?: TradeEntryPrefill
}

export interface TradeEntryPrefill {
  partnerId: number | null
  employeeId: number | null
  warehouseId: number | null
  projectId: number | null
  /** 외화 발주서에서 왔으면 그 통화 · 환율 — 구매가 외자 전표로 열린다(줄 unitPrice 는 외화단가). */
  currencyCode?: string | null
  exchangeRate?: number | null
  lines: { itemId: number; quantity: number; unitPrice: number; sourceOrderId: number; sourceDocType: string; sourceDocDate: string; sourceDocNo: string; itemName?: string | null }[]
}

export interface LineInput {
  itemId: string
  quantity: string
  unitPrice: string
  /** 외자 구매의 줄 환율. 비우면 머리 환율. (외자일 때 unitPrice 는 외화단가다) */
  lineRate: string
  /**
   * 줄 규격 — 원본은 줄마다 따로 저장한다(품목을 고르면 품목 규격으로 채우되 줄에서 고치거나 비울 수 있다).
   * null = 아직 안 건드림(품목 규격을 따라간다), 빈 글자 = 일부러 비움.
   */
  spec: string | null
  /** 줄 품목명 — null = 품목 이름을 따라감. 원본은 품목을 고른 뒤 이름 칸을 고쳐 쓴다(구매 '포장김치1kg' ↔ 마스터 '포장김치'). */
  name: string | null
  /** 시리얼/로트 (원본 serial_cd) */
  lotNo: string
  /** 부대비용 (원본 cust_amt). 합계 금액에는 더하지 않는다. */
  extraCost: string
  /**
   * 손으로 고친 공급가액. 원본 격자의 [공급가액] 칸은 고칠 수 있고(2026-10-06 loginaa: 3 × 333.5 → 1,009 로 고치면
   * 부가세 101 · 합계 1,110 으로 저장, 단가는 그대로), <b>수량이나 단가를 바꾸면 다시 계산</b>된다.
   * 그래서 고칠 때의 수량|단가({@link supplyBase})를 같이 들고, 둘 중 하나라도 달라지면 이 값을 버린다 —
   * 특별단가·단가일괄처럼 다른 길로 단가가 바뀌어도 같은 규칙이 걸린다.
   */
  supplyOverride: string
  supplyBase: string
  /**
   * 손으로 고친 부가세. 원본 [부가세] 칸도 고칠 수 있고(2026-10-06 loginaa: 1,001 줄을 99 로 → 합계 1,100 저장, 다시 열어도 99),
   * <b>공급가액이 바뀌면 다시 계산</b>된다(1,009 로 바꾸자 101). 그래서 고칠 때의 공급가액({@link vatBase})을 같이 든다.
   */
  vatOverride: string
  vatBase: string
  /**
   * 원본 구매입력 격자의 <b>[품질검사요청]</b>(열 id qcRequest_chk).
   *
   * <p>켜 두고 저장하면 그 줄의 품목·수량으로 <b>입고검사 요청</b>이 만들어진다.
   * 지금까지는 사 온 물건을 검사하려면 품질검사요청 화면에 가서 품목·수량을 다시 적어야 했다 —
   * 옮겨 적는 사이에 수량이 어긋나면 검사한 것과 산 것이 다른 물건이 된다.
   *
   * <p>판매에는 없다. 원본 판매입력 격자에도 이 열이 없다 — 파는 물건을 우리가 입고검사할 일이 없다.
   */
  qcRequest: boolean
  remark: string
  /**
   * 불러온 근거전표 — 원본 그리드의 [불러온 전표 / 전표일자 / 전표No.] 3열.
   * [전표불러오기]로 담은 줄에만 붙고 사람이 고칠 수 없다(읽기 전용 열).
   */
  sourceOrderId: string
  sourceDocType: string
  sourceDocDate: string
  sourceDocNo: string
  /**
   * 라인 추가항목 값 (fieldKey → 값).
   *
   * <p>원본 판매입력II 그리드에는 ADD_TXT_01~06 · ADD_NUM_01~05 · ADD_LTXT_01 ·
   * ADD_DATE_01~03 · ADD_CD_01~03 같은 <b>라인 추가항목 열</b>이 있다.
   * 우리 추가항목은 전표 <b>머리</b>에만 붙어서, 줄마다 다른 값(차수·납품처 같은 것)을
   * 적을 자리가 없었다.
   */
  custom: Record<string, string>
  /** 수정으로 불러온 줄의 원래 라인 id. 저장하면 서버가 라인을 새로 만들어 id 가 바뀐다. */
  lineId: number | null
  checked: boolean
}

/**
 * 판매입력 II [금액조정] 할인 합계 → 공급가액 · 부가세. 원본 창은 할인의 [합계] 칸만 고칠 수 있고
 * 1,100 을 넣으면 1,000 · 100 으로 나눈다(2026-10-13 loginaa 실측). 과세면 공급가액 = round(합계 ÷ 1.1).
 */
export function splitDiscount(total: number, taxable: boolean) {
  const t = Math.max(0, Math.round(total))
  const supply = taxable ? Math.round(t / 1.1) : t
  return { supply, vat: t - supply, total: t }
}
export const num = (s: string) => Number(s) || 0
export const emptyLine = (): LineInput => ({
  itemId: '', quantity: '', unitPrice: '', lineRate: '', spec: null, name: null, lotNo: '', extraCost: '', remark: '',
  supplyOverride: '', supplyBase: '', vatOverride: '', vatBase: '',
  qcRequest: false,
  sourceOrderId: '', sourceDocType: '', sourceDocDate: '', sourceDocNo: '', checked: false,
  custom: {}, lineId: null,
})
/** 원본은 빈 입력행 3줄로 뜬다. */
/** 저장 뒤 전표 인쇄(판매 거래명세서 · 구매 구매전표)를 하라는 표시 — afterSaveRef 의 특별한 값. */
export const SLIP_PRINT_AFTER_SAVE = '__slip_print__'
/** 저장 뒤 그 전표의 수정 화면으로 바꾸라는 표시 — 원본 [저장/내용유지]. */
export const KEEP_AFTER_SAVE = '__keep__'

export const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]

/** 손으로 고친 공급가액 — 고친 뒤 수량·단가가 그대로일 때만 살아 있다(원본: 둘 중 하나를 바꾸면 다시 계산). */
export function overriddenSupply(l: LineInput): number | null {
  if (l.supplyOverride === '' || l.supplyBase !== `${num(l.quantity)}|${num(l.unitPrice)}`) return null
  return roundWon(num(l.supplyOverride))
}

/** 원본 [전표불러오기] '메뉴검색' 창의 목록(2026-10-31 loginad — 판매입력에서는 [판매], 구매입력에서는 [구매] 가 빠진다). */
export const SLIP_LOAD_MENUS: [string, string][] = [
  ['영업관리', '견적서'], ['영업관리', '주문서'], ['영업관리', '판매'], ['영업관리', '출하지시서'], ['영업관리', '출하'],
  ['구매관리', '발주요청'], ['구매관리', '발주계획'], ['구매관리', '단가요청서'], ['구매관리', '발주서'], ['구매관리', '구매'],
  ['생산/외주', '작업지시서'], ['생산/외주', '생산불출'], ['생산/외주', '생산입고'],
  ['기타이동', '창고이동'], ['기타이동', '자가사용'], ['기타이동', '불량처리'],
  ['A/S관리', 'A/S접수'], ['A/S관리', 'A/S수리'],
  ['품질관리', '품질검사요청'], ['품질관리', '품질검사'],
  ['수출관리', 'Invoice / Packing List'],
  ['창고관리', '입고예정'], ['창고관리', '출고예정'], ['창고관리', 'ERP전표생성(입고)'], ['창고관리', 'ERP전표생성(출고)'],
]

export const CFG = {
  sales: {
    endpoint: '/sales',
    title: '판매입력',
    entityType: 'SALES',
    partnerLabel: '거래처',
    whLabel: '출하창고',
    docNoLabel: '판매No.',
    lineTab: '판매',
    canUse: (p: Partner) => p.type === 'CUSTOMER' || p.type === 'BOTH',
    accent: 'var(--ec-blue)',
    /** 원본의 연결전표 탭 — 저장 뒤에 열린다 */
    related: [
      { label: '매출전표 I', to: '/sales/accounting-reflection' },
      { label: '생산입고 I', to: '/production/receipt-manual' },
      { label: '출하지시서', to: '/sales/shipment-order' },
    ],
    counterpartLabel: '구매',
    /** 근거전표 불러오기 — 판매는 수주(주문서) */
    loadLabel: '주문',
    /* 원본 판매입력 [주문] 창 제목(2026-10-28 실측). 전표 단위 목록 — 줄 단위는 [라인별]. */
    loadTitle: '주문서검색창(조회)',
    cashLabel: '현금수금',
    cashTo: '/sales/collection',
    /** 푸터 [리스트] — 원본은 이 버튼으로 조회 화면을 연다 */
    listTo: '/sales/sales-list',
  },
  purchase: {
    endpoint: '/purchases',
    title: '구매입력',
    entityType: 'PURCHASE',
    partnerLabel: '거래처',
    whLabel: '입고창고',
    docNoLabel: '구매No.',
    lineTab: '구매',
    canUse: (p: Partner) => p.type === 'SUPPLIER' || p.type === 'BOTH',
    accent: '#2f8401',
    related: [
      { label: '매입전표 I', to: '/sales/accounting-reflection' },
      { label: '생산불출 I', to: '/production/issue' },
      { label: '입고지시서', to: '/sales/purchase-orders' },
    ],
    counterpartLabel: '판매',
    /** 근거전표 불러오기 — 구매는 발주서 */
    loadLabel: '발주',
    /* 원본 구매입력 [발주] 창 제목 '발주서조회'(2026-10-31 loginad 구매 QA) — 예전 '발주 불러오기 (미입고 잔량)' 작은 창. 담는 것(미구매 잔량)은 그대로. */
    loadTitle: '발주서조회',
    cashLabel: '현금지급',
    cashTo: '/sales/payment',
    listTo: '/sales/purchase-list',
  },
} as const

/**
 * 화면 하나가 쓰는 설정 — TradeEntry 의 cfg(판매입력 II 는 판매 설정에 제목만 바꾼 것). 쪼갠 부품 · 훅이 이 모양으로 받는다.
 * TradeEntry 의 `adjust && mode === 'sales' ? { ...CFG.sales, title: '판매입력 II' } : CFG[mode]` 와 같은 꼴이다.
 */
export type TradeEntryCfg = (Omit<(typeof CFG)['sales'], 'title'> & { title: string }) | (typeof CFG)[Mode]

/**
 * 미판매현황(`/sales-orders/unsold`) 응답 중 불러오기에 쓰는 부분만.
 *
 * 예전엔 수주 목록에서 <b>주문 − 출하</b>를 잔량으로 담았다. 출하지시서로 3개를 내보낸 주문은
 * 판매로 끊어야 할 것이 그 3개인데 남은 1개만 담겼다(23회차). 판매가 줄여야 할 잔량은
 * <b>주문 − 이미 판매한 수량</b>이다 — 미판매현황과 같은 잣대.
 */
export interface UnsoldLite {
  orderId: number
  orderNo: string
  orderLineId: number
  orderDate: string
  dueDate: string | null
  employeeId: number | null
  employeeName: string | null
  spec: string | null
  partnerId: number
  partnerName: string
  warehouseId: number | null
  projectId: number | null
  statusName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  orderQty: number
  soldQty: number
  unsoldQty: number
  unitPrice: number
}

/** 주문서출고처리 한 건(`GET /order-releases/{id}`) — 판매입력을 미리 채우는 데 쓰는 부분. */
export interface ReleaseDetail {
  orderId: number
  orderNo: string
  orderDate: string
  partnerId: number
  warehouseId: number | null
  projectId: number | null
  employeeId: number | null
  taxable: boolean
  lines: { itemId: number; quantity: number; unitPrice: number; itemName?: string | null }[]
}

/** 근거전표(수주·발주서) 라인 — 불러오기 팝업의 한 행. */
export interface LoadableLine {
  key: string
  /** 근거전표 id — 담은 라인의 sourceOrderId 가 된다. */
  orderId: number
  docNo: string
  /** '주문서'(판매) / '발주서'(구매) */
  docType: string
  date: string
  partnerId: number
  partnerName: string
  /** 근거전표의 창고·프로젝트 — 담을 때 전표 머리에 이어받는다(없으면 null). */
  warehouseId: number | null
  projectId: number | null
  /** 근거전표의 담당자 — 원본 구매입력 [발주] · 판매입력 [주문] 불러오기 둘 다 머리 담당자를 채운다(2026-10-28 실측). */
  employeeId: number | null
  /** 주문서검색창의 [사원(담당)명] · [납기일자] · 품목 규격 — 판매만 싣는다. */
  employeeName?: string | null
  dueDate?: string | null
  spec?: string | null
  statusName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  orderedQty: number
  doneQty: number
  /** 담을 수량 — 판매는 미판매 잔량(주문 − 판매), 구매는 발주 잔량 */
  restQty: number
  unitPrice: number
  /** 외화 발주서의 통화 · 환율 · 줄 외화단가 — 담으면 구매가 외자 전표가 된다. 내자는 null. */
  currencyCode?: string | null
  exchangeRate?: number | null
  foreignPrice?: number | null
}

/**
 * 주문서검색창 알약 — 원본 '전체 · 결재중 · C-Portal · 미확인 · 확인 · 진행중 · 완료'(2026-10-28 실측).
 * 결재 · C-Portal 은 우리에게 그 경로가 없어 늘 비어 있다(주문서조회 SalesOrderPage 와 같은 잣대).
 */
export type OrderLoadTab = 'ALL' | 'APPROVAL' | 'CPORTAL' | 'RECEIVED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'
export const ORDER_LOAD_TABS: [OrderLoadTab, string][] = [
  ['ALL', '전체'], ['APPROVAL', '결재중'], ['CPORTAL', 'C-Portal'], ['RECEIVED', '미확인'],
  ['CONFIRMED', '확인'], ['IN_PROGRESS', '진행중'], ['COMPLETED', '완료'],
]
/** 발주서조회 알약 — 원본 '전체 · 결재중 · 미확인 · 확인 ▸ 진행중 ▸ 완료'(2026-10-31 loginad 구매 QA). 담을 잔량이 있는 발주확정만 뜨므로 확인 · 진행중에 선다. */
export const PO_LOAD_TABS: [OrderLoadTab, string][] = [
  ['ALL', '전체'], ['APPROVAL', '결재중'], ['RECEIVED', '미확인'], ['CONFIRMED', '확인'], ['IN_PROGRESS', '진행중'], ['COMPLETED', '완료'],
]
export const ORDER_STATUS_LABEL: Record<string, string> = { RECEIVED: '미확인', IN_PROGRESS: '진행중', COMPLETED: '완료', CANCELED: '취소' }
export const ORDER_TAB_MATCH: Record<OrderLoadTab, (s: string) => boolean> = {
  ALL: () => true, APPROVAL: () => false, CPORTAL: () => false, RECEIVED: (s) => s === 'RECEIVED',
  CONFIRMED: (s) => s === 'IN_PROGRESS' || s === 'COMPLETED', IN_PROGRESS: (s) => s === 'IN_PROGRESS', COMPLETED: (s) => s === 'COMPLETED',
}

/** 선택 컬럼 — 원본에서 `hide` 로 깔려 있다가 [열 선택]으로 켜는 열들. */
export const OPTIONAL_COLS = [
  { id: 'stockAll', title: '전체수량', width: 70 },
  { id: 'stockWh', title: '창고수량', width: 70 },
  { id: 'unit', title: '단위', width: 50 },
  { id: 'priceVat', title: '단가(vat포함)', width: 95 },
  /*
   * 원본 <b>판매입력II</b> 격자에는 [부가세] 다음에 <b>[합계]</b> 열이 있다(사본 실측:
   * 품목코드·품목명·규격·수량·단가·공급가액·부가세·<b>합계</b>·적요·금액조정항목명).
   * 2026-10-14 다시 재 보니 판매입력에도 기본으로 보인다(구매입력에는 없다) — 판매는 켜고 시작한다.
   */
  { id: 'lineTotal', title: '합계', width: 100 },
  { id: 'mgmtItem', title: '관리항목', width: 90 },
  { id: 'srcType', title: '불러온 전표', width: 80 },
  { id: 'srcDate', title: '불러온 전표일자', width: 100 },
  { id: 'srcNo', title: '불러온 전표No.', width: 120 },
  /* 원본 구매입력 격자의 [품질검사요청](qcRequest_chk). 판매입력 격자에는 없는 열이다. */
  { id: 'qcRequest', title: '품질검사요청', width: 90 },
] as const
export type OptionalColId = typeof OPTIONAL_COLS[number]['id']

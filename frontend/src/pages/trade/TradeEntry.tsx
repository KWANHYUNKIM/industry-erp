import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import type {
  CustomFieldDef, EmployeeMaster, Item, ItemCost, MyItem, Partner, Project, PurchaseDoc,
  SalesDoc, StockRow, Warehouse,
} from '../../types/api'
import { exportTableToXlsx } from '../../utils/excel'
import { openPrintWindow, printTable } from '../../utils/print'
import { loadSupplierParty, printDocuments } from '../../utils/printDocument'
import { purchaseSlipDocument, salesSlipDocument } from '../../utils/tradeSlipDocument'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import EcSlipShell, { type SlipAction } from '../../components/EcSlipShell'
import EcDateField from '../../components/EcDateField'
import Modal from '../../components/Modal'
import { findDataTable } from '../../utils/tableExport'
import { useShortcut } from '../../utils/useShortcut'
import { partnerCodeItems } from '../../utils/codeItems'
import { dateText } from '../../utils/dateText'
import { lineSupply, roundWon } from '../../utils/lineSupply'
import EcNumInput from '../../components/EcNumInput'
import EcRowCap, { capRows } from '../../components/EcRowCap'

/**
 * 판매입력 / 구매입력 — 이카운트 ESD006M(판매입력) 화면 구조를 그대로 옮긴 전표 입력 화면.
 *
 * 원본 DOM 에서 가져온 것들:
 * - 헤더 폼(`ul.wrapper-form`)의 항목 순서와 코드도움 조합칸(`[코드][🔍][명칭][×]`)
 * - 일자의 연/월/일 3분할(`wrapper-datepicker`)
 * - 금액조정 합계 그리드(`#totalsum`)
 * - 명세 그리드 툴바 2줄(`wrapper-toolbar.toolbar-collapse`)과 접기(»)
 * - 명세 그리드의 <b>표시 12열 + 숨김열</b> 구성(`colgroup-col.hide`)
 * - 푸터 버튼줄(저장 F8 / 저장·전표 F7 / 회계전표연결 / 다시 작성 / 현금수금 / 닫기 …)
 *
 * 원본에 있으나 우리 백엔드가 아직 받지 않는 기능(소요·주문/구매 불러오기·보류·전표바코드 등)은
 * <b>버튼을 지우지 않고 비활성 + 사유 툴팁</b>으로 남긴다. 화면 구조를 유지하면서
 * "아직 안 된다"를 사용자가 알 수 있게 하려는 것이다. 동작하는 척하는 버튼이 제일 나쁘다.
 */

type Mode = 'sales' | 'purchase'

interface LineInput {
  itemId: string
  quantity: string
  unitPrice: string
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

const won = (n: number) => n.toLocaleString('ko-KR')
const num = (s: string) => Number(s) || 0
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const emptyLine = (): LineInput => ({
  itemId: '', quantity: '', unitPrice: '', lotNo: '', extraCost: '', remark: '',
  supplyOverride: '', supplyBase: '', vatOverride: '', vatBase: '',
  qcRequest: false,
  sourceOrderId: '', sourceDocType: '', sourceDocDate: '', sourceDocNo: '', checked: false,
  custom: {}, lineId: null,
})
/** 원본은 빈 입력행 3줄로 뜬다. */
/** 저장 뒤 전표 인쇄(판매 거래명세서 · 구매 구매전표)를 하라는 표시 — afterSaveRef 의 특별한 값. */
const SLIP_PRINT_AFTER_SAVE = '__slip_print__'

const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]

/** 손으로 고친 공급가액 — 고친 뒤 수량·단가가 그대로일 때만 살아 있다(원본: 둘 중 하나를 바꾸면 다시 계산). */
function overriddenSupply(l: LineInput): number | null {
  if (l.supplyOverride === '' || l.supplyBase !== `${num(l.quantity)}|${num(l.unitPrice)}`) return null
  return roundWon(num(l.supplyOverride))
}

const CFG = {
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
    loadTitle: '주문 불러오기 (미판매 잔량)',
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
    loadTitle: '발주 불러오기 (미입고 잔량)',
    cashLabel: '현금지급',
    cashTo: '/sales/payment',
    listTo: '/sales/purchase-list',
  },
} as const

/**
 * 미판매현황(`/sales-orders/unsold`) 응답 중 불러오기에 쓰는 부분만.
 *
 * 예전엔 수주 목록에서 <b>주문 − 출하</b>를 잔량으로 담았다. 출하지시서로 3개를 내보낸 주문은
 * 판매로 끊어야 할 것이 그 3개인데 남은 1개만 담겼다(23회차). 판매가 줄여야 할 잔량은
 * <b>주문 − 이미 판매한 수량</b>이다 — 미판매현황과 같은 잣대.
 */
interface UnsoldLite {
  orderId: number
  orderNo: string
  orderLineId: number
  orderDate: string
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

/** 근거전표(수주·발주서) 라인 — 불러오기 팝업의 한 행. */
interface LoadableLine {
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
}

/** 선택 컬럼 — 원본에서 `hide` 로 깔려 있다가 [열 선택]으로 켜는 열들. */
const OPTIONAL_COLS = [
  { id: 'stockAll', title: '전체수량', width: 70 },
  { id: 'stockWh', title: '창고수량', width: 70 },
  { id: 'unit', title: '단위', width: 50 },
  { id: 'priceVat', title: '단가(vat포함)', width: 95 },
  /*
   * 원본 <b>판매입력II</b> 격자에는 [부가세] 다음에 <b>[합계]</b> 열이 있다(사본 실측:
   * 품목코드·품목명·규격·수량·단가·공급가액·부가세·<b>합계</b>·적요·금액조정항목명).
   * 판매입력에는 없다 — 한 화면이 둘을 겸하므로 <b>켜고 끄는 열</b>로 둔다.
   */
  { id: 'lineTotal', title: '합계', width: 100 },
  { id: 'mgmtItem', title: '관리항목', width: 90 },
  { id: 'srcType', title: '불러온 전표', width: 80 },
  { id: 'srcDate', title: '불러온 전표일자', width: 100 },
  { id: 'srcNo', title: '불러온 전표No.', width: 120 },
  /* 원본 구매입력 격자의 [품질검사요청](qcRequest_chk). 판매입력 격자에는 없는 열이다. */
  { id: 'qcRequest', title: '품질검사요청', width: 90 },
] as const
type OptionalColId = typeof OPTIONAL_COLS[number]['id']

export default function TradeEntry({ mode }: { mode: Mode }) {
  const cfg = CFG[mode]
  const navigate = useNavigate()
  // 판매조회에서 [수정]으로 들어오면 `?edit=<전표 id>` 가 붙는다 — 원본도 조회에서 전표번호를 누르면
  // 같은 입력 화면이 수정 모드로 열린다.
  const [searchParams, setSearchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  /** 거래처중심입력에서 넘어오면 거래처를 미리 골라 둔다(?partnerId=). */
  const presetPartnerId = searchParams.get('partnerId')
  /**
   * 조회의 <b>[반품처리]</b> 에서 넘어온 근거 전표(?returnFrom=). 그 전표를 <b>베껴서</b>
   * 거래구분을 반품으로 두고 연다 — 수정이 아니다. 원 전표는 손대지 않는다.
   */
  const returnFromId = searchParams.get('returnFrom')

  // ── 마스터 ─────────────────────────────────────────────
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [docs, setDocs] = useState<(SalesDoc | PurchaseDoc)[]>([])
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [customDefs, setCustomDefs] = useState<CustomFieldDef[]>([])
  /** 라인 추가항목 정의. entityType 은 전표 것 뒤에 _LINE 을 붙인다(SALES_LINE / PURCHASE_LINE). */
  const [lineDefs, setLineDefs] = useState<CustomFieldDef[]>([])

  // ── 헤더 항목 ──────────────────────────────────────────
  const [date, setDate] = useState(today())
  const [partnerId, setPartnerId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [taxable, setTaxable] = useState(true)
  /**
   * 원본 [거래구분] — 일반 · 반품. 되돌려받는(되돌려주는) 수량은 <b>양수로</b> 적는다.
   * 부호를 뒤집는 것은 서버가 저장할 때 한 번만 한다.
   */
  const [returnSlip, setReturnSlip] = useState(false)
  /** [반품처리] 베끼기는 한 번만 한다 — 사람이 고친 뒤 다시 덮어쓰면 안 된다. */
  const returnLoaded = useRef(false)
  const [foreign, setForeign] = useState(false)          // 통화: 내자/외자
  const [exchangeRate, setExchangeRate] = useState('0')
  const [projectId, setProjectId] = useState('')
  const [remark, setRemark] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [showExtra, setShowExtra] = useState(false)      // 확장(추가) 항목 펼치기
  // 거래별부가세계산(원본 calcbySlip). 켜면 라인마다 반올림하지 않고 전표 합계에 한 번 물린다.
  const [vatBySlip, setVatBySlip] = useState(false)

  // ── 명세 ──────────────────────────────────────────────
  const [lines, setLines] = useState<LineInput[]>(emptyLines)
  const [cols, setCols] = useState<Record<OptionalColId, boolean>>({
    stockAll: false, stockWh: false, unit: false, priceVat: false,
    lineTotal: false,
    mgmtItem: false, srcType: false, srcDate: false, srcNo: false, qcRequest: false,
  })
  const [colPickerOpen, setColPickerOpen] = useState(false)
  // 열 선택(F4) — 버튼 라벨이 약속한 단축키. 그리드 셀 안에서 눌러도 먹어야 한다.
  // 이미 열려 있으면 다시 열지 않는다.
  useShortcut('F4', () => setColPickerOpen(true), !colPickerOpen)

  // ── 툴바 ──────────────────────────────────────────────
  const [toolbarExpanded, setToolbarExpanded] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [barcodeOpen, setBarcodeOpen] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [qtyStepOpen, setQtyStepOpen] = useState(false)
  const [qtyStep, setQtyStep] = useState('1')
  const [priceChangeOn, setPriceChangeOn] = useState(false)
  const [priceChangeTo, setPriceChangeTo] = useState('')
  const [adjustOn, setAdjustOn] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<'price' | 'amount'>('price')
  const [adjustRate, setAdjustRate] = useState('')
  const [adjustUnit, setAdjustUnit] = useState<'pct' | 'won'>('pct')
  const [adjustRound, setAdjustRound] = useState<'round' | 'floor' | 'ceil'>('round')
  const [extraCostOn, setExtraCostOn] = useState(false)
  const [extraCostAmt, setExtraCostAmt] = useState('0')

  // ── 팝업/알림 ──────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false)
  const [stockOpen, setStockOpen] = useState(false)
  // 이익계산(원본 profitCalc). 원가는 회계 모듈이 소유하므로 화면에서 /costs 를 읽어 계산한다 —
  // trade → accounting 의존은 순환이라 백엔드에서 못 부른다(CLAUDE.md 4.1).
  const [profitOpen, setProfitOpen] = useState(false)
  // 전표불러오기(원본 slip_load) — 지난 전표를 골라 그 명세를 복사해 담는다.
  const [slipLoadOpen, setSlipLoadOpen] = useState(false)
  // My품목(원본 group12myProdLoad) — 자주 쓰는 품목 묶음. 서버에 사용자별로 저장된다.
  const [myItems, setMyItems] = useState<MyItem[]>([])
  const [myItemsOpen, setMyItemsOpen] = useState(false)
  const [costs, setCosts] = useState<ItemCost[] | null>(null)
  const [loadOpen, setLoadOpen] = useState(false)
  const [loadRows, setLoadRows] = useState<LoadableLine[] | null>(null)   // null = 아직 안 불러옴
  const [loadPicked, setLoadPicked] = useState<Record<string, boolean>>({})
  /*
   * 불러오기 팝업의 찾기 · 거래처 거르기. 예전엔 열린 주문 수백 건이 오래된 것부터 늘어서
   * 오늘 받은 주문을 찾으려면 끝까지 내려야 했다(23회차). 최근 것부터, 전표 거래처가 정해져 있으면 그 거래처만.
   */
  const [loadQuery, setLoadQuery] = useState('')
  const [loadOnlyPartner, setLoadOnlyPartner] = useState(true)
  /** 방금 저장한 전표 — 연결전표 탭·회계전표연결은 이게 있어야 열린다(원본도 저장 전엔 hidden). */
  const [savedDoc, setSavedDoc] = useState<{ id: number; docNo: string } | null>(null)
  /** 수정 중인 전표. 있으면 저장이 POST 가 아니라 PUT 이 된다. */
  const [editing, setEditing] = useState<{ id: number; docNo: string } | null>(null)
  const [verifyResult, setVerifyResult] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [notice, setNotice] = useState('')
  const [savedAt, setSavedAt] = useState('')
  const [hasTemp, setHasTemp] = useState(false)

  const gridRef = useRef<HTMLDivElement>(null)
  // 열을 더할 때 합계행(tfoot)을 같이 안 고치면 숫자가 엉뚱한 열 아래에 선다. 개발 모드에서 잡는다.
  useTableColumnCheck(gridRef, '판매/구매입력 명세 그리드', [cols, lines.length])
  const tempKey = `ec-slip-temp:${mode}`

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 3000)
  }

  // ── 로딩 ──────────────────────────────────────────────
  async function loadRefs() {
    api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => {})
    api.get<CustomFieldDef[]>('/custom-fields/defs', { params: { entityType: cfg.entityType } })
      .then((r) => setCustomDefs(r.data.filter((d) => d.active)))
      .catch(() => setCustomDefs([]))
    api.get<CustomFieldDef[]>('/custom-fields/defs', { params: { entityType: `${cfg.entityType}_LINE` } })
      .then((r) => setLineDefs(r.data.filter((d) => d.active)))
      .catch(() => setLineDefs([]))
    const [p, w, i] = await Promise.all([
      api.get<Partner[]>('/partners'),
      api.get<Warehouse[]>('/warehouses'),
      api.get<Item[]>('/items'),
    ])
    setPartners(p.data)
    setWarehouses(w.data)
    setItems(i.data)
    setWarehouseId((prev) => prev || (w.data[0] ? String(w.data[0].id) : ''))
  }
  const loadDocs = () => api.get<(SalesDoc | PurchaseDoc)[]>(cfg.endpoint).then((r) => setDocs(r.data))
  /*
   * <b>지난 전표 목록은 쓸 때 받는다.</b> 이 화면은 전표를 <b>쓰는</b> 자리인데,
   * 열자마자 판매 전표를 통째로 받고 있었다(2026-09-24 실측 3,645KB · 화면 합계 3,852KB).
   * 그 목록을 쓰는 곳은 <b>모달 둘</b>(전표불러오기·거래내역보기)과
   * <code>?edit=</code>·<code>?returnFrom=</code> 로 들어왔을 때뿐이다 —
   * 새 전표를 쓰려고 연 사람은 그 3.6MB 를 한 번도 안 쓴다.
   */
  const docsAsked = useRef(false)
  const ensureDocs = () => {
    if (docsAsked.current) return
    docsAsked.current = true
    void loadDocs()
  }

  useEffect(() => {
    loadRefs()
    /* 수정·반품으로 들어왔으면 그 전표를 찾아야 하니 그때는 받는다. */
    if (editId || returnFromId) ensureDocs()
    void loadMyItems()
    setHasTemp(!!localStorage.getItem(tempKey))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  /**
   * `?partnerId=` 로 들어오면 거래처를 미리 골라 둔다(거래처중심입력 → [전표입력]).
   *
   * <p>수정으로 들어온 경우(`?edit=`)에는 손대지 않는다 — 그 전표의 거래처가 맞다.
   * 사람이 이미 다른 거래처를 골랐다면 그것도 덮지 않는다.
   */
  useEffect(() => {
    if (!presetPartnerId || editId || partnerId) return
    if (!partners.some((p) => String(p.id) === presetPartnerId)) return
    setPartnerId(presetPartnerId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPartnerId, editId, partners])

  /**
   * `?edit=` 로 들어오면 그 전표를 화면에 펼친다. 목록(`loadDocs`)이 도착한 뒤에 한 번만 채운다 —
   * 전표 단건 조회 엔드포인트가 없어 목록에서 찾는다.
   *
   * <b>`taxable` 은 이제 응답에 있다.</b> 예전에는 부가세 &gt; 0 인지로 되짚었는데,
   * 반올림으로 부가세가 0 이 된 과세 전표를 면세로 바꿔 놓고 저장하는 일이 생겼다.
   */
  /*
   * [반품처리] 로 넘어온 경우 — 그 전표를 베껴 담고 거래구분을 반품으로 둔다.
   * 근거전표(sourceOrderId)는 <b>안 옮긴다</b>. 반품은 그 수주를 다시 채우는 것이 아니라
   * 되돌려주는 것이라, 옮기면 수주 잔량이 엉뚱하게 줄어든다.
   */
  useEffect(() => {
    if (!returnFromId || editing || docs.length === 0 || returnLoaded.current) return
    const d = docs.find((x) => String(x.id) === returnFromId)
    if (!d) return
    returnLoaded.current = true
    setDate(today())
    setPartnerId(String(d.partnerId))
    setWarehouseId(String(d.warehouseId))
    setEmployeeId(d.employeeId != null ? String(d.employeeId) : '')
    setTaxable(d.taxable)
    setVatBySlip(d.vatBySlip)
    setReturnSlip(true)
    setRemark(`반품 (근거전표 ${d.docNo})`)
    setLines([
      ...d.lines.map((l) => ({
        ...emptyLine(),
        itemId: String(l.itemId),
        quantity: String(Math.abs(l.quantity)),
        unitPrice: String(l.unitPrice),
        lotNo: l.lotNo ?? '',
        remark: l.remark ?? '',
      })),
      emptyLine(),
    ])
  }, [returnFromId, editing, docs])

  useEffect(() => {
    if (!editId || editing || docs.length === 0) return
    const d = docs.find((x) => String(x.id) === editId)
    if (!d) return
    setEditing({ id: d.id, docNo: d.docNo })
    setDate((d as SalesDoc).saleDate ?? (d as PurchaseDoc).purchaseDate)
    setPartnerId(String(d.partnerId))
    setWarehouseId(String(d.warehouseId))
    setEmployeeId(d.employeeId != null ? String(d.employeeId) : '')
    setProjectId((d as SalesDoc).projectId != null ? String((d as SalesDoc).projectId) : '')
    setTaxable(d.taxable)
    // 반품 전표는 수량이 음수로 저장돼 있다. 화면에는 원본처럼 양수로 되돌려 보여 준다.
    setReturnSlip(d.returnSlip)
    setVatBySlip(d.vatBySlip)
    setRemark(d.remark ?? '')
    setLines([
      ...d.lines.map((l) => ({
        ...emptyLine(),
        itemId: String(l.itemId),
        quantity: String(Math.abs(l.quantity)),
        unitPrice: String(l.unitPrice),
        lotNo: l.lotNo ?? '',
        extraCost: l.extraCost != null ? String(l.extraCost) : '',
        // 저장된 공급가액이 수량 × 단가와 다르면 손으로 고친 값이다 — 다시 저장해도 남도록 들고 온다.
        ...(Math.abs(Number(l.supplyAmount)) !== lineSupply(Math.abs(l.quantity), Number(l.unitPrice))
          ? { supplyOverride: String(Math.abs(Number(l.supplyAmount))), supplyBase: `${Math.abs(l.quantity)}|${l.unitPrice}` }
          : {}),
        // 부가세도 같다 — 줄마다 계산하는 전표에서 공급가액 × 10% 와 다르면 손으로 고친 값이다.
        ...(d.taxable && !d.vatBySlip && Math.abs(Number(l.vatAmount)) !== roundWon(Math.abs(Number(l.supplyAmount)) * 0.1)
          ? { vatOverride: String(Math.abs(Number(l.vatAmount))), vatBase: String(Math.abs(Number(l.supplyAmount))) }
          : {}),
        remark: l.remark ?? '',
        sourceOrderId: l.sourceOrderId != null ? String(l.sourceOrderId) : '',
        sourceDocType: l.sourceDocType ?? '',
        sourceDocDate: l.sourceDocDate ?? '',
        sourceDocNo: l.sourceDocNo ?? '',
        lineId: l.lineId ?? null,
      })),
      emptyLine(),
    ])
  }, [editId, editing, docs])

  /**
   * 수정으로 불러온 줄의 라인 추가항목 값을 채운다.
   *
   * <p>라인마다 한 번씩 부르는 대신 정의가 있을 때만 부른다 — 추가항목을 안 쓰는 회사가
   * 전표를 열 때마다 쓸데없는 요청이 줄 수만큼 나가면 안 된다.
   */
  useEffect(() => {
    if (lineDefs.length === 0) return
    const ids = lines.map((l) => l.lineId).filter((v): v is number => v != null)
    if (ids.length === 0) return
    let alive = true
    Promise.all(ids.map((id) =>
      api.get<{ values: Record<string, string> }>('/custom-fields/values',
        { params: { entityType: `${cfg.entityType}_LINE`, entityId: id } })
        .then((r) => [id, r.data.values ?? {}] as const)
        .catch(() => [id, {} as Record<string, string>] as const)))
      .then((pairs) => {
        if (!alive) return
        const byId = new Map(pairs)
        setLines((prev) => prev.map((l) => (l.lineId != null && byId.has(l.lineId)
          ? { ...l, custom: byId.get(l.lineId) ?? {} } : l)))
      })
    return () => { alive = false }
  }, [editId, lineDefs.length])

  /** 라인 추가항목 한 칸을 고친다. */
  const setLineCustom = (idx: number, key: string, value: string) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, custom: { ...l.custom, [key]: value } } : l)))

  const usablePartners = useMemo(() => partners.filter(cfg.canUse), [partners, cfg])
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const codeItems = useMemo(
    () => items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.spec })),
    [items],
  )

  /** 재고 조회는 [재고불러오기]를 눌렀을 때만 한다 — 화면을 열 때마다 전 품목 재고를 끌어올 필요는 없다. */
  async function loadMyItems() {
    try {
      const r = await api.get<MyItem[]>('/my-items')
      setMyItems(r.data)
    } catch {
      // My품목은 부가기능이다 — 못 불러와도 화면을 막지 않는다.
      setMyItems([])
    }
  }

  /** My품목을 통째로 명세에 담는다(품목별 기본수량 그대로). */
  function applyMyItems() {
    if (myItems.length === 0) return flash('My품목이 비어 있습니다. 명세에서 [★]로 담아 두세요.')
    setLines((ls) => {
      const kept = ls.filter((l) => l.itemId)
      const added = myItems.map((m) => ({
        ...emptyLine(),
        itemId: String(m.itemId),
        quantity: String(m.defaultQty),
        unitPrice: String(m.unitPrice),
      }))
      return [...kept, ...added, emptyLine()]
    })
    setMyItemsOpen(false)
    flash(`My품목 ${myItems.length}건을 명세에 담았습니다.`)
  }

  /** 지금 명세의 한 줄을 My품목에 넣거나 뺀다. */
  async function toggleMyItem(itemId: string, qty: number) {
    const id = Number(itemId)
    const has = myItems.some((m) => m.itemId === id)
    try {
      if (has) {
        await api.delete(`/my-items/${id}`)
        flash('My품목에서 뺐습니다.')
      } else {
        await api.post('/my-items', { itemId: id, defaultQty: Math.max(1, Math.round(qty) || 1) })
        flash('My품목에 담았습니다.')
      }
      await loadMyItems()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function loadStocks() {
    try {
      const r = await api.get<StockRow[]>('/stock')
      setStocks(r.data)
      flash('재고를 불러왔습니다. [열 선택]에서 전체수량·창고수량을 켜면 보입니다.')
      setCols((c) => ({ ...c, stockAll: true, stockWh: true }))
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  /**
   * 이익계산 — 원본 [이익계산](`profitCalcsubmain`).
   *
   * 원가는 `item_costs`(회계)가 소유한다. 전표 월(`YYYY-MM`)을 넘지 않는 <b>가장 최근 기간</b>의 원가를
   * 쓰고, 그 이전 기간이 하나도 없으면 가장 이른 기간으로 대신한다. 실제원가가 잡혀 있으면 실제를,
   * 아직 없으면 표준을 쓴다 — 월 마감 전에는 실제원가가 0 이기 때문이다.
   */
  async function openProfit() {
    setProfitOpen(true)
    if (costs !== null) return
    try {
      const r = await api.get<ItemCost[]>('/costs')
      setCosts(r.data)
    } catch (err) {
      setCosts([])
      setError(extractErrorMessage(err))
    }
  }

  /** 이 전표 일자 기준으로 품목의 단위원가를 고른다. 등록된 원가가 없으면 null. */
  function unitCostOf(itemId: string): number | null {
    if (!costs || costs.length === 0) return null
    const mine = costs.filter((c) => String(c.itemId) === itemId)
    if (mine.length === 0) return null
    const period = date.slice(0, 7)
    const sorted = [...mine].sort((a, b) => a.period.localeCompare(b.period))
    const upTo = sorted.filter((c) => c.period <= period)
    const pick = upTo.length > 0 ? upTo[upTo.length - 1] : sorted[0]
    return pick.actualTotal > 0 ? pick.actualTotal : pick.standardTotal
  }

  const stockAllOf = (itemId: string) =>
    stocks.filter((s) => String(s.itemId) === itemId).reduce((a, s) => a + s.quantity, 0)
  const stockWhOf = (itemId: string) =>
    stocks.filter((s) => String(s.itemId) === itemId && String(s.warehouseId) === warehouseId)
      .reduce((a, s) => a + s.quantity, 0)

  /**
   * 이 화면이 라인에 채워 넣을 <b>기준단가</b>.
   *
   * <p>판매입력은 판매단가, 구매입력은 구매단가다. 예전에는 품목 단가가 하나뿐이라
   * 구매입력도 <b>판매단가</b>를 채웠다 — 팔 값으로 사는 셈이라 매번 손으로 고쳐야 했고,
   * 안 고치면 그 값이 그대로 매입가로 저장됐다.
   *
   * <p>구매단가를 안 정한 품목(0)은 빈칸으로 둔다. 판매단가를 대신 넣으면
   * 그게 매입가인 줄 알고 그냥 저장하게 된다 — 틀린 값을 채워 주느니 비워 두는 게 낫다.
   */
  function basePriceOf(it: { unitPrice: number; purchasePrice?: number }): string {
    if (mode === 'sales') return String(it.unitPrice)
    const pp = it.purchasePrice ?? 0
    return pp > 0 ? String(pp) : ''
  }

  /**
   * 거래처가 정해진 뒤 <b>특별단가</b>가 있으면 그 값으로 덮는다.
   *
   * <p>특별단가등록·단가적용순서설정 화면이 오래전부터 있었는데 <b>전표입력이 그 값을
   * 한 번도 안 불렀다.</b> 특별단가를 등록해 놓고 판매입력을 열면 그냥 표준단가가 채워졌고,
   * 두 마스터 화면은 저장만 되고 아무 데도 영향이 없었다.
   *
   * <p>서버가 이미 순서를 판단한다(거래처별 → 그 거래처의 단가그룹별). 화면은 부르기만 한다.
   * 못 찾으면 표준단가를 그대로 둔다 — 특별단가가 없다는 뜻이지 0 이라는 뜻이 아니다.
   */
  async function applySpecialPrice(idx: number, itemId: string, partnerOverride?: string) {
    const pid = partnerOverride ?? partnerId
    if (!pid || !itemId) return
    try {
      const r = await api.get<{ found: boolean; unitPrice: number | null }>('/special-prices/resolve', {
        params: { tradeType: mode === 'sales' ? 'SALES' : 'PURCHASE', itemId, partnerId: pid },
      })
      if (!r.data.found || r.data.unitPrice == null) return
      setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, unitPrice: String(r.data.unitPrice) } : l)))
    } catch { /* 특별단가를 못 읽어도 전표입력은 계속돼야 한다 */ }
  }

  /*
   * 거래처를 <b>사람이 고르면</b> 이미 담긴 품목의 특별단가를 다시 찾는다. 예전엔 품목을 고를 때만 찾아서
   * 품목을 먼저 담고 거래처를 나중에 고르면 특별단가가 안 걸렸다(49회차 — 한빛스마트홈 온습도 센서 2,200 이
   * 0 으로 남았다). 전표를 불러오거나 반품으로 열 때는 이 길을 안 타 저장된 단가를 덮지 않는다.
   */
  function choosePartner(v: string) {
    setPartnerId(v)
    if (!v) return
    lines.forEach((l, i) => { if (l.itemId) void applySpecialPrice(i, l.itemId, v) })
  }

  // ── 라인 편집 ─────────────────────────────────────────
  function updateLine(idx: number, field: keyof LineInput, value: string | boolean) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId' && value) {
        const it = itemById.get(String(value))
        if (it && !next[idx].unitPrice) next[idx] = { ...next[idx], unitPrice: basePriceOf(it) }
        if (!next[idx].quantity) next[idx] = { ...next[idx], quantity: '1' }
        // 표준단가를 채운 뒤 특별단가가 있으면 그것으로 덮는다(서버가 순서를 판단한다).
        void applySpecialPrice(idx, String(value))
        if (idx === ls.length - 1) next.push(emptyLine())
      }
      return next
    })
  }
  function removeLine(idx: number) {
    setLines((ls) => (ls.length <= 3 ? ls.map((l, i) => (i === idx ? emptyLine() : l)) : ls.filter((_, i) => i !== idx)))
  }
  function addItemLine(itemId: string, qty = 1) {
    const it = itemById.get(itemId)
    if (!it) return false
    setLines((ls) => {
      const at = ls.findIndex((l) => l.itemId === itemId)
      if (at >= 0) {
        const next = [...ls]
        next[at] = { ...next[at], quantity: String(num(next[at].quantity) + qty) }
        return next
      }
      const blank = ls.findIndex((l) => !l.itemId)
      const filled: LineInput = { ...emptyLine(), itemId, quantity: String(qty), unitPrice: basePriceOf(it) }
      if (blank >= 0) return ls.map((l, i) => (i === blank ? filled : l))
      return [...ls, filled, emptyLine()]
    })
    return true
  }

  // ── 근거전표 불러오기 (원본 [주문] / [발주]) ─────────────
  /**
   * 판매는 <b>수주의 미판매 잔량</b>(주문 − 이미 판매)을, 구매는 <b>발주의 미구매 잔량</b>(발주 − 이미 구매)을
   * 명세로 끌어온다. 둘 다 구매·판매 줄이 근거전표(sourceOrder)를 달아 부분 전환을 한다(23·42회차).
   */
  async function openLoadSource() {
    setLoadOpen(true)
    setLoadPicked({})
    setLoadQuery('')
    setLoadRows(null)
    try {
      const rows: LoadableLine[] = []
      if (mode === 'sales') {
        const r = await api.get<UnsoldLite[]>('/sales-orders/unsold')
        r.data.forEach((l) => rows.push({
          key: `${l.orderId}-${l.orderLineId}`, orderId: l.orderId, docType: '주문서',
          docNo: l.orderNo, date: l.orderDate,
          partnerId: l.partnerId, partnerName: l.partnerName, statusName: l.statusName,
          warehouseId: l.warehouseId ?? null, projectId: l.projectId ?? null,
          itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
          orderedQty: l.orderQty, doneQty: l.soldQty, restQty: l.unsoldQty, unitPrice: l.unitPrice,
        }))
      } else {
        /*
         * 미구매 잔량(발주 − 이미 구매)으로 담는다. 예전엔 발주수량 전체를 담아 100 중 60 을 입고한 뒤
         * 다시 불러오면 또 100 이 떴다(42회차) — 판매의 '주문 − 판매'(23회차 #70)와 같은 잣대.
         */
        const r = await api.get<{
          orderId: number; orderNo: string; orderLineId: number; orderDate: string
          partnerId: number; partnerName: string; statusName: string
          warehouseId: number | null; projectId: number | null
          itemId: number; itemCode: string; itemName: string; unit: string
          orderQty: number; boughtQty: number; restQty: number; unitPrice: number
        }[]>('/purchase-orders/unpurchased')
        r.data.forEach((l) => rows.push({
          key: `${l.orderId}-${l.orderLineId}`, orderId: l.orderId, docType: '발주서',
          docNo: l.orderNo, date: l.orderDate,
          partnerId: l.partnerId, partnerName: l.partnerName, statusName: l.statusName,
          warehouseId: l.warehouseId ?? null, projectId: l.projectId ?? null,
          itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
          orderedQty: l.orderQty, doneQty: l.boughtQty, restQty: l.restQty, unitPrice: l.unitPrice,
        }))
      }
      rows.sort((a, b) => b.date.localeCompare(a.date) || b.docNo.localeCompare(a.docNo))
      setLoadRows(rows)
    } catch (err) {
      setLoadRows([])
      setError(extractErrorMessage(err))
    }
  }

  /**
   * 지난 전표의 명세를 지금 화면으로 복사한다.
   * 원본은 이 동작을 두 자리에서 준다 — 툴바 [거래내역보기](거래처별)와 [전표불러오기](전체).
   * 담는 규칙은 같으므로 한 곳에 둔다.
   */
  function copyFromDoc(d: SalesDoc | PurchaseDoc, close: () => void) {
    setLines([
      ...d.lines.map((ln) => ({
        ...emptyLine(),
        itemId: String(ln.itemId), quantity: String(ln.quantity), unitPrice: String(ln.unitPrice),
        remark: ln.remark ?? '',
      })),
      emptyLine(),
    ])
    // 전표불러오기는 거래처가 다를 수 있다 — 그 전표의 거래처로 맞춰 준다.
    if (String(d.partnerId) !== partnerId) setPartnerId(String(d.partnerId))
    close()
    flash(`${d.docNo} 의 명세 ${d.lines.length}건을 가져왔습니다.`)
  }

  /** 고른 근거전표 라인을 명세에 담는다. 거래처가 섞이면 막는다 — 한 전표는 한 거래처다. */
  const loadShown = (loadRows ?? []).filter((r) => {
    if (loadOnlyPartner && partnerId && String(r.partnerId) !== partnerId) return false
    const q = loadQuery.trim().toLowerCase()
    return !q || [r.docNo, r.partnerName, r.itemCode, r.itemName].some((v) => (v ?? '').toLowerCase().includes(q))
  })

  function applyLoadPicked() {
    const picked = (loadRows ?? []).filter((r) => loadPicked[r.key])
    if (picked.length === 0) return flash('담을 행을 체크하세요.')
    const partnerIds = [...new Set(picked.map((r) => r.partnerId))]
    if (partnerIds.length > 1) return flash('거래처가 다른 행은 한 전표에 담을 수 없습니다.')
    if (partnerId && String(partnerIds[0]) !== partnerId) {
      return flash('지금 전표의 거래처와 다릅니다. 거래처를 비우거나 같은 거래처 행을 고르세요.')
    }
    if (!partnerId) setPartnerId(String(partnerIds[0]))

    /*
     * 근거전표의 프로젝트·창고도 이어받는다. 예전엔 거래처만 받아서, 수주를 불러와 만든 판매가
     * 프로젝트 없이 저장되고 <b>프로젝트별 손익에서 매출이 빠졌다</b>(2026-10-01, 프로젝트 여러 개로
     * 시연하다 발견). 프로젝트가 다른 주문을 한 전표에 섞으면 어느 프로젝트 매출인지 갈 수 없어 막는다.
     */
    const projIds = [...new Set(picked.map((r) => r.projectId).filter((x): x is number => x != null))]
    if (projIds.length > 1) return flash('프로젝트가 다른 주문은 한 전표에 담을 수 없습니다. 프로젝트별로 나눠 담으세요.')
    if (projIds.length === 1) {
      if (projectId && projectId !== String(projIds[0])) {
        return flash('지금 전표의 프로젝트와 다른 주문입니다. 프로젝트를 비우거나 같은 프로젝트 행을 고르세요.')
      }
      if (!projectId) setProjectId(String(projIds[0]))
    }
    /*
     * 창고는 화면을 열 때 기본값(마지막에 쓴 창고 등)이 이미 차 있어서 "비었으면 채운다" 로는 안 바뀐다 —
     * 주문은 본사창고인데 QA창고에서 출하하는 판매가 만들어졌다. 주문들의 창고가 하나면 그것으로 바꾸고 알린다.
     */
    const whIds = [...new Set(picked.map((r) => r.warehouseId).filter((x): x is number => x != null))]
    const whNote = whIds.length === 1 && warehouseId !== String(whIds[0])
    if (whNote) setWarehouseId(String(whIds[0]))

    setLines((ls) => {
      const kept = ls.filter((l) => l.itemId)
      const added = picked.map((r) => ({
        ...emptyLine(),
        itemId: String(r.itemId),
        quantity: String(r.restQty),
        unitPrice: String(r.unitPrice),
        // 적요에 "SO-… 불러옴" 이라고 적던 것을 근거전표 3열로 옮겼다. 적요는 사람 몫으로 비워 둔다.
        sourceOrderId: String(r.orderId),
        sourceDocType: r.docType,
        sourceDocDate: r.date,
        sourceDocNo: r.docNo,
      }))
      return [...kept, ...added, emptyLine()]
    })
    // 근거전표 열은 기본으로 숨어 있다(원본도 그렇다). 담은 순간에는 보여줘야 뭘 담았는지 안다.
    setCols((c) => ({ ...c, srcNo: true }))
    setLoadOpen(false)
    flash(`${picked.length}건을 명세에 담았습니다.${whNote ? ' 창고를 주문의 창고로 맞췄습니다.' : ''}`)
  }

  const checkedIdx = lines.map((l, i) => (l.checked && l.itemId ? i : -1)).filter((i) => i >= 0)
  const targetIdx = () => (checkedIdx.length > 0 ? checkedIdx : lines.map((l, i) => (l.itemId ? i : -1)).filter((i) => i >= 0))

  // ── 계산 ──────────────────────────────────────────────
  // 부가세 배분은 백엔드 `VatAllocator` 와 같은 규칙이어야 한다 — 화면에 보이는 값과
  // 저장된 값이 1원이라도 다르면 사용자는 화면을 못 믿는다.
  const computed = (() => {
    const supplies = lines.map((l) => overriddenSupply(l) ?? lineSupply(num(l.quantity), num(l.unitPrice)))
    const vats = supplies.map((sup) => (taxable ? roundWon(sup * 0.1) : 0))
    // 손으로 고친 부가세는 거래별 배분보다 먼저다 — 서버도 배분한 뒤 그 줄만 덮어쓴다.
    const typedVat = lines.map((l, i) => (taxable && l.vatOverride !== '' && l.vatBase === String(supplies[i]) ? roundWon(num(l.vatOverride)) : null))
    if (taxable && vatBySlip && supplies.length > 0) {
      const slipVat = roundWon(supplies.reduce((a, b) => a + b, 0) * 0.1)
      const residual = slipVat - vats.reduce((a, b) => a + b, 0)
      if (residual !== 0) {
        // 잔차는 공급가액이 가장 큰 한 줄에 몰아준다(백엔드와 동일 — 재저장해도 배분이 안 흔들린다).
        let big = 0
        supplies.forEach((sup, i) => { if (sup > supplies[big]) big = i })
        vats[big] += residual
      }
    }
    typedVat.forEach((v, i) => { if (v != null) vats[i] = v })
    return supplies.map((supply, i) => ({ supply, vat: vats[i], total: supply + vats[i], typedVat: typedVat[i] }))
  })()
  const totals = {
    qty: lines.reduce((s, l) => s + num(l.quantity), 0),
    supply: computed.reduce((s, c) => s + c.supply, 0),
    vat: computed.reduce((s, c) => s + c.vat, 0),
    extra: lines.reduce((s, l) => s + num(l.extraCost), 0),
    total: computed.reduce((s, c) => s + c.total, 0),
  }
  /** 명세 각 줄의 매출·원가·이익. 원가 미등록이면 cost 가 null 이고 합계에서 뺀다. */
  const profitRows = lines
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => l.itemId)
    .map(({ l, idx }) => {
      const unitCost = unitCostOf(l.itemId)
      const qty = num(l.quantity)
      const revenue = computed[idx].supply
      const cost = unitCost === null ? null : unitCost * qty
      return {
        name: itemById.get(l.itemId)?.name ?? '',
        code: itemById.get(l.itemId)?.code ?? '',
        qty,
        unitPrice: num(l.unitPrice),
        revenue,
        unitCost,
        cost,
        profit: cost === null ? null : revenue - cost,
        rate: cost === null || revenue === 0 ? null : ((revenue - cost) / revenue) * 100,
      }
    })
  const profitTotals = profitRows.reduce(
    (a, r) => (r.cost === null ? { ...a, missing: a.missing + 1 }
      : { revenue: a.revenue + r.revenue, cost: a.cost + r.cost, missing: a.missing }),
    { revenue: 0, cost: 0, missing: 0 },
  )

  const lineCount = lines.filter((l) => l.itemId).length
  const rate = num(exchangeRate)

  // ── 툴바 동작 ─────────────────────────────────────────
  const rounder = (n: number) =>
    adjustRound === 'floor' ? Math.floor(n) : adjustRound === 'ceil' ? Math.ceil(n) : Math.round(n)

  function applyAdjust() {
    const v = num(adjustRate)
    if (!v) return flash('조정 값을 입력하세요.')
    const idxs = targetIdx()
    setLines((ls) => ls.map((l, i) => {
      if (!idxs.includes(i)) return l
      if (adjustTarget === 'price') {
        const base = num(l.unitPrice)
        const next = adjustUnit === 'pct' ? base * (1 + v / 100) : base + v
        return { ...l, unitPrice: String(rounder(next)) }
      }
      // 금액 조정 — 수량을 고정하고 단가를 역산한다(금액 컬럼은 계산값이라 직접 못 고친다)
      const qty = num(l.quantity) || 1
      const base = qty * num(l.unitPrice)
      const nextAmt = adjustUnit === 'pct' ? base * (1 + v / 100) : base + v
      return { ...l, unitPrice: String(rounder(nextAmt / qty)) }
    }))
    flash(`${idxs.length}개 행에 조정을 적용했습니다.`)
  }

  function applyPriceChange() {
    const v = num(priceChangeTo)
    if (!v) return flash('변경할 단가를 입력하세요.')
    const idxs = targetIdx()
    setLines((ls) => ls.map((l, i) => (idxs.includes(i) ? { ...l, unitPrice: String(v) } : l)))
    flash(`${idxs.length}개 행의 단가를 ${won(v)}원으로 바꿨습니다.`)
  }

  /** 부대비용 총액을 공급가액 비율로 라인에 배분한다 — 원본 [부대비용] 적용과 같은 방식. */
  function applyExtraCost() {
    const amt = num(extraCostAmt)
    const idxs = targetIdx()
    if (idxs.length === 0) return flash('품목을 먼저 입력하세요.')
    const base = idxs.reduce((s, i) => s + computed[i].supply, 0)
    setLines((ls) => ls.map((l, i) => {
      if (!idxs.includes(i)) return l
      const share = base > 0 ? (computed[i].supply / base) * amt : amt / idxs.length
      return { ...l, extraCost: String(Math.round(share)) }
    }))
    flash(`부대비용 ${won(amt)}원을 공급가액 비율로 배분했습니다.`)
  }

  function applyQtyStep() {
    const v = num(qtyStep)
    if (!v) return flash('증감할 수량을 입력하세요.')
    const idxs = targetIdx()
    setLines((ls) => ls.map((l, i) => (idxs.includes(i) ? { ...l, quantity: String(Math.max(0, num(l.quantity) + v)) } : l)))
    flash(`${idxs.length}개 행 수량을 ${v > 0 ? '+' : ''}${v} 했습니다.`)
  }

  function deleteChecked() {
    if (checkedIdx.length === 0) return flash('삭제할 행을 체크하세요.')
    setLines((ls) => {
      const kept = ls.filter((l, i) => !(l.checked && l.itemId) || !checkedIdx.includes(i))
      return kept.length >= 3 ? kept : [...kept, ...Array(3 - kept.length).fill(null).map(emptyLine)]
    })
    flash(`${checkedIdx.length}개 행을 지웠습니다.`)
  }

  function sortLines() {
    setLines((ls) => {
      const filled = ls.filter((l) => l.itemId)
      const blanks = ls.filter((l) => !l.itemId)
      filled.sort((a, b) => (itemById.get(a.itemId)?.code ?? '').localeCompare(itemById.get(b.itemId)?.code ?? ''))
      return [...filled, ...blanks]
    })
    flash('품목코드 순으로 정렬했습니다.')
  }

  function scanBarcode() {
    const q = barcode.trim()
    if (!q) return
    const hit = items.find((i) => i.barcode === q) ?? items.find((i) => i.code.toLowerCase() === q.toLowerCase())
    if (!hit) { flash(`'${q}' 에 해당하는 품목이 없습니다.`); return }
    addItemLine(String(hit.id))
    setBarcode('')
    flash(`${hit.name} 1개를 담았습니다.`)
  }

  /** 원본 [검증] — 저장 전에 걸릴 것을 미리 모아 보여 준다. */
  function verify() {
    const msgs: string[] = []
    if (!partnerId) msgs.push(`${cfg.partnerLabel}를 선택하세요.`)
    if (!warehouseId) msgs.push(`${cfg.whLabel}를 선택하세요.`)
    if (foreign && rate <= 0) msgs.push('외자 전표는 환율을 입력해야 합니다.')
    lines.forEach((l, i) => {
      if (!l.itemId) return
      if (num(l.quantity) <= 0) msgs.push(`${i + 1}행: 수량이 0입니다.`)
      if (num(l.unitPrice) <= 0) msgs.push(`${i + 1}행: 단가가 0입니다.`)
      if (mode === 'sales' && stocks.length > 0) {
        const have = stockWhOf(l.itemId)
        if (have < num(l.quantity)) {
          msgs.push(`${i + 1}행: ${itemById.get(l.itemId)?.name} 창고재고 ${won(have)} < 출고 ${won(num(l.quantity))}`)
        }
      }
    })
    customDefs.filter((d) => d.required).forEach((d) => {
      if (!(customValues[d.fieldKey] ?? '').trim()) msgs.push(`추가항목 '${d.label}'은(는) 필수입니다.`)
    })
    if (lineCount === 0) msgs.push('품목을 1줄 이상 입력하세요.')
    setVerifyResult(msgs)
  }

  // ── 임시저장 (원본은 주기적으로 자동 저장하고 푸터에 시각을 찍는다) ──
  const snapshot = () => JSON.stringify({
    date, partnerId, employeeId, warehouseId, taxable, returnSlip, foreign, exchangeRate, projectId, remark, customValues, lines,
  })
  function saveTemp(auto = false) {
    if (lineCount === 0 && !partnerId) return
    localStorage.setItem(tempKey, snapshot())
    setHasTemp(true)
    setSavedAt(`${new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 임시저장되었습니다.`)
    if (!auto) flash('임시저장했습니다.')
  }
  function applyTemp() {
    const raw = localStorage.getItem(tempKey)
    if (!raw) return
    try {
      const s = JSON.parse(raw)
      setDate(s.date ?? today()); setPartnerId(s.partnerId ?? ''); setEmployeeId(s.employeeId ?? '')
      setWarehouseId(s.warehouseId ?? ''); setTaxable(s.taxable ?? true); setForeign(s.foreign ?? false)
      setReturnSlip(s.returnSlip ?? false)
      setExchangeRate(s.exchangeRate ?? '0'); setProjectId(s.projectId ?? ''); setRemark(s.remark ?? '')
      setCustomValues(s.customValues ?? {}); setLines(Array.isArray(s.lines) && s.lines.length ? s.lines : emptyLines())
      setHasTemp(false)
      flash('임시저장 내역을 불러왔습니다.')
    } catch { flash('임시저장 내역을 읽을 수 없습니다.') }
  }
  function deleteTemp() {
    localStorage.removeItem(tempKey)
    setHasTemp(false)
    setSavedAt('')
  }
  // 60초마다 자동 임시저장
  const snapRef = useRef(snapshot)
  snapRef.current = snapshot
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = snapRef.current()
      if (s.includes('"itemId":"')) {   // 뭔가 입력된 상태에서만
        localStorage.setItem(tempKey, s)
        setSavedAt(`${new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 임시저장되었습니다.`)
      }
    }, 60000)
    return () => window.clearInterval(t)
  }, [tempKey])

  // ── 저장 ──────────────────────────────────────────────
  function reset(keepHeader = false) {
    setLines(emptyLines())
    setRemark('')
    setCustomValues({})
    setOk(''); setError('')
    if (!keepHeader) { setPartnerId(''); setProjectId(''); setEmployeeId('') }
  }

  /*
   * 저장이 어디서 끝나든(검증에 막혀 돌아가든, 서버가 거절하든) 미리 열어 둔 인쇄창이 '준비 중' 빈 창으로
   * 남지 않게 한다 — 저장에 성공하면 위에서 그 창을 가져가 ref 를 비우므로 여기서는 닫히지 않는다.
   */
  async function submit(e: FormEvent) {
    try { await submitInner(e) } finally {
      if (printWinRef.current) { printWinRef.current.close(); printWinRef.current = null; afterSaveRef.current = null }
    }
  }

  async function submitInner(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    // 요청에 실을 줄과 그 줄의 원본(추가항목 값이 붙어 있다)을 같은 순서로 들고 간다.
    const keptLines = lines.filter((l) => l.itemId && num(l.quantity) > 0 && num(l.unitPrice) > 0)
    const validLines = keptLines
      .map((l) => ({
        itemId: Number(l.itemId),
        quantity: num(l.quantity),
        unitPrice: num(l.unitPrice),
        remark: l.remark.trim() || undefined,
        lotNo: l.lotNo.trim() || undefined,
        extraCost: l.extraCost ? num(l.extraCost) : undefined,
        sourceOrderId: l.sourceOrderId ? Number(l.sourceOrderId) : undefined,
        supplyAmount: overriddenSupply(l) ?? undefined,
        vatAmount: computed[lines.indexOf(l)]?.typedVat ?? undefined,
      }))
    if (!partnerId) return setError(`${cfg.partnerLabel}를 선택하세요.`)
    if (validLines.length === 0) return setError('품목·수량·단가를 1줄 이상 입력하세요.')
    /* 로트관리 품목은 로트No. 가 있어야 한다 — 서버도 거절한다(QA 62회차). 저장 전에 어느 줄인지 알려 준다. */
    const noLot = keptLines.find((l) => !l.lotNo.trim() && items.find((i) => String(i.id) === l.itemId)?.lotManaged)
    if (noLot) {
      const it = items.find((i) => String(i.id) === noLot.itemId)!
      return setError(`${it.code} ${it.name} 은(는) 로트관리 품목입니다 — 로트No.를 입력하세요.`)
    }

    const dateKey = mode === 'sales' ? 'saleDate' : 'purchaseDate'
    const body = {
      partnerId: Number(partnerId),
      warehouseId: Number(warehouseId),
      vatBySlip,
      [dateKey]: date,
      taxable,
      returnSlip,
      remark: remark || undefined,
      projectId: projectId ? Number(projectId) : undefined,
      employeeId: employeeId ? Number(employeeId) : undefined,
      lines: validLines,
    }
    try {
      // 수정 모드면 PUT — 서버가 옛 라인의 재고를 되돌리고 새 라인으로 다시 반영한다.
      const res = editing
        ? await api.put<SalesDoc | PurchaseDoc>(`${cfg.endpoint}/${editing.id}`, body)
        : await api.post<SalesDoc | PurchaseDoc>(cfg.endpoint, body)
      // 추가항목(사용자정의)은 전표가 생긴 뒤에야 붙일 수 있다 — id 를 키로 쓰기 때문이다.
      if (customDefs.length > 0 && Object.values(customValues).some((v) => v?.trim())) {
        await api.put('/custom-fields/values', { values: customValues },
          { params: { entityType: cfg.entityType, entityId: res.data.id } })
          .catch(() => flash('전표는 저장했지만 추가항목 저장에 실패했습니다.'))
      }

      /*
       * 라인 추가항목.
       *
       * <p>수정하면 서버가 옛 라인을 지우고 새로 만들어 <b>라인 id 가 바뀐다.</b> 그대로 두면
       * 옛 id 에 붙은 값이 아무도 안 보는 채로 남는다 — 먼저 지우고 새 id 로 다시 붙인다.
       */
      if (lineDefs.length > 0) {
        const lineEntity = `${cfg.entityType}_LINE`
        const oldIds = editing ? lines.map((l) => l.lineId).filter((v): v is number => v != null) : []
        const newLines = (res.data.lines ?? []) as { lineId?: number }[]
        await Promise.all([
          ...oldIds.map((id) => api.put('/custom-fields/values', { values: {} },
            { params: { entityType: lineEntity, entityId: id } }).catch(() => {})),
          ...keptLines.map((l, i) => {
            const id = newLines[i]?.lineId
            if (id == null || !Object.values(l.custom ?? {}).some((v) => v?.trim())) return Promise.resolve()
            return api.put('/custom-fields/values', { values: l.custom },
              { params: { entityType: lineEntity, entityId: id } }).catch(() => {})
          }),
        ]).catch(() => flash('전표는 저장했지만 라인 추가항목 저장에 실패했습니다.'))
      }
      /*
       * 원본 구매입력 격자의 <b>[품질검사요청]</b>(qcRequest_chk). 켠 줄의 품목·수량으로
       * 입고검사 요청을 만든다 — 생산입고 III 이 하는 것과 같은 흐름이다.
       *
       * <p>요청 생성이 실패해도 <b>구매는 이미 끝난 일</b>이라 되돌리지 않고 사유만 알린다.
       * 여기서 전표를 롤백하면 물건은 들어왔는데 산 기록이 없어진다.
       */
      const qcLines = mode === 'purchase'
        ? keptLines.filter((l) => l.qcRequest && l.itemId)
        : []
      if (qcLines.length > 0) {
        const made = await Promise.all(qcLines.map((l) => api.post('/quality-inspection-requests', {
          type: 'INCOMING',
          itemId: Number(l.itemId),
          requestQty: num(l.quantity),
          lotNo: l.lotNo.trim() || undefined,
          requestDate: date,
          remark: `구매 ${res.data.docNo}`,
        }).then(() => true).catch(() => false)))
        const okCount = made.filter(Boolean).length
        if (okCount < qcLines.length) {
          flash(`품질검사요청 ${qcLines.length}건 중 ${okCount}건만 만들어졌습니다.`)
        } else {
          flash(`입고검사 요청 ${okCount}건을 만들었습니다.`)
        }
      }
      setSavedDoc({ id: res.data.id, docNo: res.data.docNo })
      deleteTemp()
      if (editing) {
        // 수정을 마치면 신규 입력 상태로 돌아간다 — 같은 전표를 두 번 저장하는 사고를 막는다.
        setEditing(null)
        setSearchParams({}, { replace: true })
      }
      reset(true)
      // 완료 안내는 reset <b>뒤에</b> 띄운다 — reset 이 setOk('') 로 지워서, 저장하고 나면 화면이 말없이
      // 비기만 했다(어느 번호로 저장됐는지 볼 길이 없었다. QA 9회차, 화면으로 판매를 넣어 보다 발견).
      setOk(`${res.data.docNo} ${editing ? '수정' : '저장'} 완료 (합계 ${won(res.data.totalAmount)}원)`)
      /* 목록을 아직 안 받았으면 저장했다고 새로 받을 까닭이 없다 — 볼 자리가 안 열려 있다. */
      if (docsAsked.current) void loadDocs()
      const afterSaveTo = afterSaveRef.current
      afterSaveRef.current = null
      if (afterSaveTo === SLIP_PRINT_AFTER_SAVE) {
        const win = printWinRef.current
        printWinRef.current = null
        if (mode === 'sales') {
          const d = res.data as SalesDoc
          void loadSupplierParty().then((sup) =>
            printDocuments([salesSlipDocument(d, partners.find((p) => p.id === d.partnerId), sup)], win))
        } else {
          void printDocuments([purchaseSlipDocument(res.data as PurchaseDoc)], win)
        }
      }
      else if (afterSaveTo) navigate(afterSaveTo)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  // ── 내보내기 ──────────────────────────────────────────
  async function doExcel() {
    const t = findDataTable(gridRef.current)
    if (!t) return flash('내보낼 표가 없습니다.')
    if (!await exportTableToXlsx(t, cfg.title)) flash('내보낼 품목이 없습니다.')
  }
  function doPrint() {
    const t = findDataTable(gridRef.current)
    if (!t) return flash('인쇄할 표가 없습니다.')
    if (!printTable(t, cfg.title)) flash('인쇄할 품목이 없습니다.')
  }

  // ── 툴바 정의 ─────────────────────────────────────────
  /**
   * 저장이 끝나면 갈 곳. 원본 [저장/결제]가 이 값을 정해 두고 저장을 시킨다 —
   * 저장 자체는 폼 제출 한 길로만 흐르게 두려는 것이다(검증·연결전표가 다 거기 있다).
   */
  /*
   * 상태(useState)가 아니라 ref 다 — 값을 정하고 <b>곧바로</b> 제출하는데, 상태로 두면 제출을 처리하는 함수가
   * 아직 옛 값(null)을 본다. 그래서 [저장/결제]·[저장/전표(F7)]가 저장만 하고 넘어가지 않았다(2026-10-06 화면으로 확인).
   */
  const afterSaveRef = useRef<string | null>(null)
  /** [저장/전표(F7)] 가 클릭 순간에 열어 둔 인쇄창 — 저장(비동기) 뒤에 열면 팝업 차단에 걸린다. */
  const printWinRef = useRef<Window | null>(null)
  /*
   * 원본 [저장/전표(F7)] — 저장하고 그 전표의 인쇄 양식을 띄운다(2026-10-06 loginaa):
   * 판매입력은 <b>거래명세서</b>(2026/10/06-9), 구매입력은 <b>구매전표</b>(2026/10/06-4).
   * 예전 우리 F7 은 저장 없이 입력 격자만 인쇄했다.
   */
  function saveAndPrintSlip() {
    printWinRef.current = openPrintWindow()
    if (!printWinRef.current) return
    afterSaveRef.current = SLIP_PRINT_AFTER_SAVE
    formRef.current?.requestSubmit()
  }
  const formRef = useRef<HTMLFormElement>(null)

  /** 원본에 있으나 아직 백엔드가 없는 버튼. 지우지 않고 사유를 붙여 비활성으로 남긴다. */
  const todo = (why: string) => ({ disabled: true, title: why })

  const partnerDocs = docs.filter((d) => String(d.partnerId) === partnerId)

  const footerActions: SlipAction[] = [
    {
      label: editing ? '수정저장(F8)' : '저장(F8)', primary: true, submit: true,
      menu: [
        /*
         * 원본 [저장/결제] — 저장하고 바로 수금·지급 화면으로 넘어간다.
         * 현금 거래는 전표를 치고 곧바로 돈을 받거나 주는데, 저장하고 메뉴로
         * 돌아가 다시 찾아 들어가야 했다.
         */
        { label: '저장/결제', onClick: () => { afterSaveRef.current = cfg.cashTo; formRef.current?.requestSubmit() } },
        { label: '임시저장', onClick: () => saveTemp() },
        { label: '입력값 지우기', onClick: () => reset(true) },
        ...(editing ? [{
          label: '수정 취소(신규로)',
          onClick: () => { setEditing(null); setSearchParams({}, { replace: true }); reset(false) },
        }] : []),
      ],
    },
    { label: '저장/전표(F7)', onClick: saveAndPrintSlip },
    {
      label: '회계전표연결',
      disabled: !savedDoc,
      disabledReason: '전표를 저장하면 회계반영 화면으로 넘어갑니다.',
      onClick: () => navigate('/sales/accounting-reflection'),
    },
    { label: '다시 작성', onClick: () => { reset(false); setSavedDoc(null) } },
    {
      label: cfg.cashLabel, onClick: () => navigate(cfg.cashTo),
      menu: [
        { label: '수금 화면으로', onClick: () => navigate('/sales/collection') },
        { label: '지급 화면으로', onClick: () => navigate('/sales/payment') },
      ],
    },
    // 원본 푸터의 마지막 두 개는 [리스트][웹자료올리기] 다. '닫기' 가 아니라 조회 화면으로 간다.
    { label: '리스트', onClick: () => navigate(cfg.listTo) },
    { label: '웹자료올리기', disabled: true, disabledReason: '파일 첨부는 [전자결재·드라이브]에서 씁니다.' },
  ]

  return (
    <form ref={formRef} onSubmit={submit}>
      <EcSlipShell
        title={editing ? `${cfg.title} — ${editing.docNo} 수정` : cfg.title}
        formTabs={[{ id: 'main', label: '기본(수정불가)' }]}
        activeFormTab="main"
        /*
          원본은 저장 전에 연결전표 탭을 **비활성으로 보여 주지 않고 아예 감춘다**
          (실제 화면에 `기본(수정불가) ▾` 와 `＋` 둘뿐이다). 회색 탭 세 개가 늘 떠 있으면
          "왜 안 눌리지" 를 매번 묻게 된다 — 저장하고 나서 나타나는 편이 스스로 설명한다.
        */
        relatedTabs={savedDoc ? cfg.related.map((t) => ({
          id: t.label,
          label: t.label,
          onSelect: () => navigate(t.to),
        })) : []}
        onAddTab={() => flash('탭 추가는 [Self-Customizing > 입력양식]에서 설정합니다.')}
        tempSave={hasTemp ? { onApply: applyTemp, onDelete: deleteTemp } : null}
        savedAt={savedAt}
        options={[
          { label: showExtra ? '추가항목 접기' : '추가항목 펼치기', onClick: () => setShowExtra((v) => !v) },
          { label: '열 선택', onClick: () => setColPickerOpen(true) },
          { label: 'Excel 내려받기', onClick: () => void doExcel() },
          { label: '인쇄', onClick: doPrint },
          { label: '입력값 초기화', onClick: () => reset(false) },
        ]}
        actions={footerActions}
        help={
          <ul className="pl-[16px] m-0">
            <li>이 화면은 이카운트 <b>판매입력(ESD006M)</b> 구조를 따릅니다 — 헤더 항목 폼 · 금액조정 합계 · 명세 그리드 · 하단 버튼줄.</li>
            <li><b>일자</b>는 연/월/일 세 칸입니다. 일(日) 칸만 고쳐 치면 되고, 📅로 달력을 엽니다.</li>
            <li><b>거래처·담당자·{cfg.whLabel}·프로젝트</b>는 코드도움 칸입니다 — 🔍를 눌러 코드나 이름으로 찾습니다.</li>
            <li><b>찾기(F3)·정렬·수량±·단가변경·조정·부대비용</b>은 <u>체크한 행</u>에 적용됩니다. 체크가 없으면 전체 행에 적용됩니다.</li>
            <li><b>검증</b>은 저장 전에 걸릴 것(필수값·수량 0·재고부족)을 미리 모아 보여 줍니다.</li>
            <li><b>임시저장</b>은 60초마다 자동으로도 돌아갑니다. 다음에 화면을 열면 위에 안내줄이 뜹니다.</li>
            <li><b>{cfg.loadLabel}</b>은 {mode === 'sales' ? '아직 판매로 끊지 않은 잔량이 남은 주문' : '아직 입고되지 않은 발주서'}를 골라 명세로 담습니다. 거래처가 다른 행은 섞을 수 없습니다.</li>
            <li>연결전표 탭(<b>{cfg.related.map((t) => t.label).join(' · ')}</b>)과 <b>회계전표연결</b>은 <u>전표를 저장해야</u> 열립니다 — 원본도 저장 전에는 감춰져 있습니다.</li>
            <li>흐리게 보이는 버튼(소요·보류·전표 바코드 등)은 원본에 있으나 아직 연결되지 않은 기능입니다. 마우스를 올리면 사유가 나옵니다.</li>
          </ul>
        }
      >
        {/* ── 헤더 항목 폼 (원본 ul.wrapper-form) ───────────── */}
        <ul className="ec-form">
          <li>
            <div className="title">일자</div>
            <div className="form"><EcDateField value={date} onChange={setDate} /></div>
          </li>
          <li>
            <div className="title">{cfg.partnerLabel}<span className="req">*</span></div>
            <div className="form">
              <CodePickerField
                label={cfg.partnerLabel} hideLabel pair
                value={partnerId} onChange={choosePartner}
                items={partnerCodeItems(usablePartners)}
              />
            </div>
          </li>
          <li>
            <div className="title">담당자</div>
            <div className="form">
              <CodePickerField
                label="담당자" hideLabel pair
                value={employeeId} onChange={setEmployeeId}
                items={employees.map((em) => ({ value: String(em.id), code: em.code, name: em.name, sub: em.department }))}
              />
            </div>
          </li>
          <li>
            <div className="title">{cfg.whLabel}<span className="req">*</span></div>
            <div className="form">
              <CodePickerField
                label={cfg.whLabel} hideLabel pair
                value={warehouseId} onChange={setWarehouseId}
                items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))}
              />
            </div>
          </li>
          <li>
            <div className="title">거래유형</div>
            <div className="form">
              <select className="ec-input" value={taxable ? '11' : '12'} onChange={(e) => setTaxable(e.target.value === '11')} style={{ width: 170 }}>
                <option value="11">부가세율 적용</option>
                <option value="12">부가세율 미적용</option>
              </select>
            </div>
          </li>
          {/*
            원본 [거래구분] — 일반 · 반품. 네 화면(판매·구매일괄회계반영, 구매단가일괄변경,
            일별이익현황)이 이 구분을 조건으로 든다.
            반품은 그 거래의 반대다 — 판매반품은 물건이 창고로 돌아오고 채권이 준다.
            여기서는 되돌려받는 수량을 <b>양수로</b> 적는다. 부호는 서버가 뒤집는다.
          */}
          <li>
            <div className="title">거래구분</div>
            <div className="form">
              <select className="ec-input" value={returnSlip ? 'R' : 'N'}
                      onChange={(e) => setReturnSlip(e.target.value === 'R')} style={{ width: 100 }}>
                <option value="N">일반</option>
                <option value="R">반품</option>
              </select>
              {returnSlip && (
                <span className="ml-[8px] text-[11.5px] text-ec-danger">
                  {mode === 'sales' ? '되돌려받는' : '되돌려보내는'} 수량을 양수로 적으세요. {mode === 'sales' ? '재고가 늘고 채권이 줄어듭니다.' : '재고가 줄고 채무가 줄어듭니다.'}
                </span>
              )}
            </div>
          </li>
          <li>
            <div className="title">통화</div>
            <div className="form">
              <select className="ec-input" value={foreign ? 'F' : 'D'} onChange={(e) => setForeign(e.target.value === 'F')} style={{ width: 80 }}>
                <option value="D">내자</option>
                <option value="F">외자</option>
              </select>
              {foreign && (
                <input
                  className="ec-input" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)}
                  placeholder="환율" style={{ width: 90, textAlign: 'right' }}
                />
              )}
            </div>
          </li>
          <li>
            <div className="title">프로젝트</div>
            <div className="form">
              <CodePickerField
                label="프로젝트" hideLabel pair
                value={projectId} onChange={setProjectId}
                items={projects.map((pj) => ({ value: String(pj.id), code: pj.code, name: pj.name }))}
              />
            </div>
          </li>
          <li>
            <div className="title">{cfg.docNoLabel}</div>
            <div className="form">
              <input className="ec-input" readOnly value="(저장 시 자동채번)" style={{ width: 170, background: '#f4f5f7', color: 'var(--ec-text-hint)' }} />
            </div>
          </li>
          <li className="wide">
            <div className="title">적요</div>
            <div className="form">
              <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)}
                     placeholder="전표 적요" style={{ flex: 1 }} />
            </div>
          </li>

          {/* 확장(추가) 항목 — 원본의 ADD_TXT/ADD_NUM/ADD_DATE/ADD_CD 자리.
              우리 쪽은 Self-Customizing > 사용자정의필드에 정의한 항목이 여기에 나온다. */}
          {showExtra && (customDefs.length === 0 ? (
            <li className="wide">
              <div className="title">추가항목</div>
              <div className="form text-ec-hint">
                정의된 추가항목이 없습니다. [Self-Customizing &gt; 사용자정의필드]에서 <b>{cfg.entityType}</b> 항목을 만들면 여기에 나옵니다.
              </div>
            </li>
          ) : customDefs.map((d) => (
            <li key={d.fieldKey}>
              <div className="title">{d.label}{d.required && <span className="req">*</span>}</div>
              <div className="form">
                {d.fieldType === 'CODE' ? (
                  <select
                    className="ec-input" style={{ flex: 1 }}
                    value={customValues[d.fieldKey] ?? ''}
                    onChange={(e) => setCustomValues((v) => ({ ...v, [d.fieldKey]: e.target.value }))}
                  >
                    <option value="">선택</option>
                    {(d.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    className="ec-input"
                    type={d.fieldType === 'DATE' ? 'date' : d.fieldType === 'NUMBER' ? 'number' : 'text'}
                    style={{ flex: 1, textAlign: d.fieldType === 'NUMBER' ? 'right' : undefined }}
                    value={customValues[d.fieldKey] ?? ''}
                    onChange={(e) => setCustomValues((v) => ({ ...v, [d.fieldKey]: e.target.value }))}
                  />
                )}
              </div>
            </li>
          )))}
        </ul>

        {/*
          이 화면이 따르는 원본은 **판매입력(ESD006M)** 이고, 거기에는
          "금액조정항목명/공급가액/부가세/합계" 표가 없다. 합계는 그리드 하단 합계행이 지고,
          우리 표는 그것과 중복이었다. 원본 구조(헤더폼 → 툴바 → 그리드 → 합계행 → 푸터)에
          맞춰 걷어낸다. 다만 외화 전표일 때의 환산액은 합계행이 못 보여 주므로 한 줄로 남긴다.

          이 자리의 근거를 두 번 고쳤다. 처음에는 "아카이브 전체에 '금액조정'·'외화금액'·
          '원화금액' 0건" 이라고 적혀 있었는데 세어 보니 금액조정항목명 3건·외화금액 2건이었다.
          그다음엔 "그 3건은 다른 화면 것" 이라고 고쳤는데 **그것도 틀렸다** — 사본에서 뽑은
          화면코드 지도(qa/fixtures/ecount-screen-codes.json)로 보니 ESD066M 이 바로
          **판매입력 II** 다. 즉 원본에는 판매입력(ESD006M)과 판매입력 II(ESD066M)가 따로 있고,
          금액조정 표는 뒤엣것에 있다.

          우리 화면은 이름을 [판매입력 II] 로 달고 있으면서 구조는 앞엣것을 따른다.
          그래서 금액조정 표는 **우리에게 없는 것이 맞다** — 다만 '다른 화면이라서' 가 아니라
          '우리가 따르는 쪽에는 없어서' 다. 이름과 구조가 어긋난 것은 따로 볼 일이다.
        */}
        {foreign && rate > 0 && (
          <div className="mt-[6px] text-right text-[12px] text-ec-label">
            외화금액{' '}
            <b className="text-ec-text">
              {(totals.total / rate).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
            </b>
            {'  ·  원화금액 '}
            <b style={{ color: cfg.accent }}>{won(totals.total)}</b>
          </div>
        )}

        {/* ── 명세 탭 + 툴바 (원본 nav-tabs + wrapper-toolbar 2줄) ── */}
        <ul className="ec-tabs" style={{ marginTop: 10 }}>
          <li className="ec-tab active">{cfg.lineTab}</li>
        </ul>

        <div className="ec-toolbar">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFindOpen((v) => !v)}>찾기(F3)</button>
          {findOpen && (
            <input
              className="ec-input" autoFocus value={findText} placeholder="품목명·적요"
              onChange={(e) => setFindText(e.target.value)}
              style={{ width: 130, height: 23 }}
            />
          )}
          <button type="button" className="ec-btn ec-btn-sm" onClick={sortLines}>정렬</button>
          <button type="button" className="ec-btn ec-btn-sm" disabled={!partnerId}
                  title={partnerId ? undefined : '거래처를 먼저 고르세요.'}
                  onClick={() => { ensureDocs(); setHistoryOpen(true) }}>
            {mode === 'sales' ? '거래내역보기(판매)' : '거래내역보기(구매)'}
          </button>
          {/* 원본 순서: 거래내역보기 다음이 My품목이다. ▾ 로 목록을 펼치고, 본체를 누르면 통째로 담는다. */}
          <span className="relative inline-flex">
            <button type="button" className="ec-btn ec-btn-sm" onClick={applyMyItems}>
              My품목{myItems.length > 0 ? ` (${myItems.length})` : ''}
            </button>
            <button
              type="button" className="ec-btn ec-btn-sm ec-btn-arrow"
              aria-label="My품목 목록" onClick={() => setMyItemsOpen((v) => !v)}
            >
              ▾
            </button>
            {myItemsOpen && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 30, marginTop: 2,
                  minWidth: 280, background: '#fff', border: '1px solid var(--ec-border)',
                  borderRadius: 5, boxShadow: 'var(--ec-shadow-lg)', padding: 6,
                }}
              >
                {myItems.length === 0 ? (
                  <div className="py-[8px] px-[6px] text-[12px] text-ec-hint">
                    비어 있습니다. 명세에서 품목 줄의 [★]를 눌러 담아 두세요.
                  </div>
                ) : myItems.map((m) => (
                  <div key={m.id} className="flex items-center gap-[6px] py-[3px] px-[4px] text-[12px]">
                    <button
                      type="button" className="ec-btn ec-btn-sm" style={{ flex: 1, justifyContent: 'flex-start' }}
                      onClick={() => { addItemLine(String(m.itemId), m.defaultQty); setMyItemsOpen(false) }}
                    >
                      {m.itemCode} {m.itemName} · {m.defaultQty}
                    </button>
                    <button
                      type="button" className="ec-btn ec-btn-sm" title="My품목에서 빼기"
                      onClick={() => void toggleMyItem(String(m.itemId), m.defaultQty)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </span>
          <button type="button" className="ec-btn ec-btn-sm" {...todo('BOM 소요량 전개는 [생산] 모듈에서 씁니다.')}>소요</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openLoadSource()}>{cfg.loadLabel}</button>
          <button type="button" className="ec-btn ec-btn-sm" {...todo(`${cfg.counterpartLabel}전표 불러오기는 아직 연결되지 않았습니다.`)}>{cfg.counterpartLabel}</button>
          <button type="button" className="ec-btn ec-btn-sm" {...todo('보류 전표 기능은 아직 없습니다.')}>보류</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => { setToolbarExpanded(true); setAdjustOn(true) }}>할인</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => void loadStocks()}>재고불러오기</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setBarcodeOpen((v) => !v)}>바코드</button>
          {barcodeOpen && (
            <input
              className="ec-input" autoFocus value={barcode} placeholder="바코드/품목코드 후 Enter"
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanBarcode() } }}
              style={{ width: 170, height: 23 }}
            />
          )}
          <button type="button" className="ec-btn ec-btn-sm" {...todo('전표 단위 바코드 출력은 아직 없습니다.')}>전표 바코드</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={verify}>검증</button>
          {mode === 'sales' && (
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openProfit()}>이익계산</button>
          )}
          {/*
            원본 판매입력 툴바 순서: … 검증 · 이익계산 · [전표불러오기] · 거래별부가세계산.
            <b>구매입력은 이 버튼이 [할인] 바로 뒤에 있다</b>(사본 실측) — 한 컴포넌트가
            두 화면을 겸해서 둘 다 맞출 수 없다. 더 많은 버튼을 가진 판매입력에 맞췄다.
          */}
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => { ensureDocs(); setSlipLoadOpen(true) }}>전표불러오기</button>
          {/* 원본 calcbySlip. 누를 때마다 켜고 끄며, 켜진 상태는 전표에 저장된다. */}
          <button
            type="button"
            className={`ec-btn ec-btn-sm${vatBySlip ? ' ec-btn-primary' : ''}`}
            title={vatBySlip
              ? '전표 합계에 한 번 반올림합니다. 눌러서 라인별 계산으로 되돌립니다.'
              : '라인마다 반올림합니다. 눌러서 전표 합계 기준으로 바꿉니다.'}
            onClick={() => setVatBySlip((v) => !v)}
          >
            거래별부가세계산{vatBySlip ? ' ✓' : ''}
          </button>
          <button
            type="button" className="ec-btn ec-btn-sm" style={{ marginLeft: 'auto' }}
            title={toolbarExpanded ? '툴바 접기' : '툴바 펼치기'}
            onClick={() => setToolbarExpanded((v) => !v)}
          >
            {toolbarExpanded ? '«' : '»'}
          </button>
        </div>

        {toolbarExpanded && (
          <div className="ec-toolbar" style={{ borderTop: '1px dashed var(--ec-border)' }}>
            <button type="button" className="ec-btn ec-btn-sm" onClick={deleteChecked}>선택삭제</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => { if (stocks.length === 0) void loadStocks(); setStockOpen(true) }}>재고</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => setColPickerOpen(true)}>열 선택(F4)</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => setQtyStepOpen((v) => !v)}>수량±</button>
            {qtyStepOpen && (
              <>
                <input className="ec-input" value={qtyStep} onChange={(e) => setQtyStep(e.target.value)}
                       style={{ width: 60, height: 23, textAlign: 'right' }} />
                <button type="button" className="ec-btn ec-btn-sm" onClick={applyQtyStep}>적용</button>
              </>
            )}
            <span className="sep" />
            <label className="ec-check">
              <input type="checkbox" checked={priceChangeOn} onChange={(e) => setPriceChangeOn(e.target.checked)} />
              단가변경
            </label>
            {priceChangeOn && (
              <>
                <input className="ec-input" value={priceChangeTo} onChange={(e) => setPriceChangeTo(e.target.value)}
                       placeholder="단가" style={{ width: 90, height: 23, textAlign: 'right' }} />
                <button type="button" className="ec-btn ec-btn-sm" onClick={applyPriceChange}>적용</button>
              </>
            )}
            <span className="sep" />
            <label className="ec-check">
              <input type="checkbox" checked={adjustOn} onChange={(e) => setAdjustOn(e.target.checked)} />
              조정
            </label>
            {adjustOn && (
              <>
                <select className="ec-input" value={adjustTarget} onChange={(e) => setAdjustTarget(e.target.value as 'price' | 'amount')} style={{ width: 62, height: 23 }}>
                  <option value="price">단가</option>
                  <option value="amount">금액</option>
                </select>
                <input className="ec-input" value={adjustRate} onChange={(e) => setAdjustRate(e.target.value)}
                       placeholder="-10" style={{ width: 64, height: 23, textAlign: 'right' }} />
                <select className="ec-input" value={adjustUnit} onChange={(e) => setAdjustUnit(e.target.value as 'pct' | 'won')} style={{ width: 52, height: 23 }}>
                  <option value="pct">%</option>
                  <option value="won">액</option>
                </select>
                <select className="ec-input" value={adjustRound} onChange={(e) => setAdjustRound(e.target.value as 'round' | 'floor' | 'ceil')} style={{ width: 76, height: 23 }}>
                  <option value="round">반올림</option>
                  <option value="floor">버림</option>
                  <option value="ceil">올림</option>
                </select>
                <button type="button" className="ec-btn ec-btn-sm" onClick={applyAdjust}>적용</button>
              </>
            )}
            <span className="sep" />
            <label className="ec-check">
              <input type="checkbox" checked={extraCostOn} onChange={(e) => setExtraCostOn(e.target.checked)} />
              부대비용
            </label>
            {extraCostOn && (
              <>
                <input className="ec-input" value={extraCostAmt} onChange={(e) => setExtraCostAmt(e.target.value)}
                       style={{ width: 90, height: 23, textAlign: 'right' }} />
                <button type="button" className="ec-btn ec-btn-sm" onClick={applyExtraCost}>적용</button>
              </>
            )}
          </div>
        )}

        {notice && (
          <div className="ec-alert ec-alert-info my-[4px] mx-0">
            {notice}
          </div>
        )}

        {/* ── 명세 그리드 (원본 #gridESD006Msubmain) ─────────── */}
        {/*
          품목명 열은 폭을 안 줘서 남는 자리만 받았다 — [불러온 전표No.] 같은 선택 열이 켜지면 60px 로
          줄어 🔍·× 단추가 자리를 다 먹고 <b>품목명이 안 보였다</b>(2026-10-01, 주문을 불러오다 발견).
          최소 200 을 주고, 열이 많아 넘치면 표를 가로로 굴린다.
        */}
        <div ref={gridRef} className="overflow-x-auto">
          <table className="ec-grid-input no-ec" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col className="w-[26px]" />
              <col className="w-[26px]" />
              <col className="w-[100px]" />
              <col className="w-[200px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              {cols.stockAll && <col className="w-[70px]" />}
              {cols.stockWh && <col className="w-[70px]" />}
              {cols.unit && <col className="w-[50px]" />}
              <col className="w-[78px]" />
              <col className="w-[96px]" />
              {cols.priceVat && <col className="w-[95px]" />}
              <col className="w-[110px]" />
              <col className="w-[96px]" />
              <col className="w-[96px]" />
              {cols.lineTotal && <col className="w-[100px]" />}
              {cols.mgmtItem && <col className="w-[90px]" />}
              <col className="w-[130px]" />
              {cols.srcType && <col className="w-[80px]" />}
              {cols.srcDate && <col className="w-[100px]" />}
              {cols.srcNo && <col className="w-[120px]" />}
              {cols.qcRequest && <col className="w-[90px]" />}
              <col className="w-[30px]" />
            </colgroup>
            <thead>
              <tr>
                {/*
                  원본 그리드의 첫 두 열은 [행번호][⊕] 다 — **체크박스가 없다.**
                  선택은 행번호 칸을 눌러서 한다(엑셀 행머리와 같다). 선택삭제·일괄단가조정이
                  쓰는 checkedIdx 는 그대로라 기능은 하나도 안 바뀐다.
                */}
                <th
                  style={{ cursor: lineCount > 0 ? 'pointer' : 'default' }}
                  title="전체 선택 / 해제"
                  onClick={() => {
                    if (lineCount === 0) return
                    const all = checkedIdx.length === lineCount
                    setLines((ls) => ls.map((l) => (l.itemId ? { ...l, checked: !all } : l)))
                  }}
                >
                  {lineCount > 0 && checkedIdx.length === lineCount ? '☑' : ''}
                </th>
                <th title="My품목 담기/빼기">★</th>
                <th className="text-left">품목코드</th>
                <th className="text-left">품목명</th>
                <th className="text-left">규격</th>
                {/* 원본 실측: [시리얼/로트]는 가운데, 금액 칸들은 오른쪽이다. 값은 이미 오른쪽인데 머리만 안 따라갔다. */}
                <th className="text-center">시리얼/로트</th>
                {cols.stockAll && <th>전체수량</th>}
                {cols.stockWh && <th>창고수량</th>}
                {cols.unit && <th>단위</th>}
                {/* 원본은 판매입력이 [수량], 구매입력이 [기본수량] 이다 — 같은 칸인데 이름이 다르다. */}
                {/* 값은 이미 오른쪽인데 <b>머리만</b> 왼쪽이었다 — 삼항으로 적은 칸이라
                    이름으로 찾는 검사가 여태 이 칸을 아예 못 보고 있었다. */}
                <th className="text-right">{mode === 'sales' ? '수량' : '기본수량'}</th>
                <th className="text-right">단가</th>
                {cols.priceVat && <th>단가(vat포함)</th>}
                <th className="text-right">공급가액</th>
                <th className="text-right">부가세</th>
                {cols.lineTotal && <th className="text-right">합계</th>}
                <th className="text-right">부대비용</th>
                {cols.mgmtItem && <th>관리항목</th>}
                <th className="text-left">적요</th>
                {/* 라인 추가항목. 정의한 것만 열이 생긴다 — 안 쓰는 회사는 표가 그대로다. */}
                {lineDefs.map((d) => (
                  <th key={d.fieldKey} className="text-left">{d.label}</th>
                ))}
                {cols.srcType && <th>불러온 전표</th>}
                {cols.srcDate && <th>불러온 전표일자</th>}
                {cols.srcNo && <th className="text-left">불러온 전표No.</th>}
                {/* 원본 구매입력 격자의 [품질검사요청]. 켜고 저장하면 입고검사 요청이 생긴다. */}
                {cols.qcRequest && <th>품질검사요청</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const it = itemById.get(l.itemId)
                const needle = findText.trim().toLowerCase()
                const hit = !needle || `${it?.name ?? ''} ${it?.code ?? ''} ${l.remark}`.toLowerCase().includes(needle)
                return (
                  <tr
                    key={idx}
                    data-export-skip={l.itemId ? undefined : 'true'}
                    style={{
                      display: hit ? undefined : 'none',
                      background: l.checked && l.itemId ? 'var(--ec-warn-bg)' : undefined,
                    }}
                  >
                    {/* 행번호 칸 = 행머리. 원본처럼 회색이고, 눌러서 그 줄을 고른다. */}
                    <td
                      style={{
                        textAlign: 'center',
                        background: l.checked && l.itemId ? 'var(--ec-blue-light)' : 'var(--ec-report-stripe)',
                        color: l.checked && l.itemId ? 'var(--ec-blue-dark)' : 'var(--ec-text-hint)',
                        fontWeight: l.checked && l.itemId ? 700 : 400,
                        cursor: l.itemId ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                      title={l.itemId ? '눌러서 이 줄을 고릅니다' : undefined}
                      onClick={() => { if (l.itemId) updateLine(idx, 'checked', !l.checked) }}
                    >
                      {idx + 1}
                    </td>
                    {/* 원본 2열의 ⊕ 자리. 우리는 이 줄의 품목을 My품목에 담고 빼는 ★ 로 쓴다. */}
                    <td className="text-center">
                      {l.itemId && (
                        <button
                          type="button" className="no-ec"
                          title={myItems.some((m) => String(m.itemId) === l.itemId)
                            ? 'My품목에서 빼기' : 'My품목에 담기'}
                          style={{
                            border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                            fontSize: 13, lineHeight: 1,
                            color: myItems.some((m) => String(m.itemId) === l.itemId) ? '#f0a500' : 'var(--ec-text-off)',
                          }}
                          onClick={() => void toggleMyItem(l.itemId, num(l.quantity))}
                        >
                          ★
                        </button>
                      )}
                    </td>
                    <td className="pad text-ec-label overflow-hidden whitespace-nowrap">
                      {it?.code ?? ''}
                    </td>
                    <td className="pad">
                      <CodePickerField
                        label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제"
                        value={l.itemId} onChange={(v) => updateLine(idx, 'itemId', v)}
                        items={codeItems}
                      />
                    </td>
                    <td className="pad text-ec-label overflow-hidden text-ellipsis whitespace-nowrap">
                      {it?.spec ?? ''}
                    </td>
                    <td>
                      <input className="cell" value={l.lotNo} disabled={!l.itemId}
                             onChange={(e) => updateLine(idx, 'lotNo', e.target.value)} />
                    </td>
                    {cols.stockAll && (
                      <td className="pad text-right text-ec-hint">{l.itemId ? won(stockAllOf(l.itemId)) : ''}</td>
                    )}
                    {cols.stockWh && (
                      <td className="pad text-right text-ec-hint">{l.itemId ? won(stockWhOf(l.itemId)) : ''}</td>
                    )}
                    {cols.unit && <td className="pad text-center text-ec-label">{it?.unit ?? ''}</td>}
                    <td>
                      <EcNumInput className="cell text-right"
                             value={l.quantity} onValue={(v) => updateLine(idx, 'quantity', v)} />
                    </td>
                    <td>
                      <EcNumInput className="cell text-right"
                             value={l.unitPrice} onValue={(v) => updateLine(idx, 'unitPrice', v)} />
                    </td>
                    {cols.priceVat && (
                      <td className="pad text-right text-ec-hint">
                        {l.itemId ? won(Math.round(num(l.unitPrice) * (taxable ? 1.1 : 1))) : ''}
                      </td>
                    )}
                    <td>
                      <EcNumInput className="cell text-right" disabled={!l.itemId}
                             aria-label="공급가액"
                             value={l.itemId ? (overriddenSupply(l) != null ? l.supplyOverride : String(computed[idx].supply)) : ''}
                             onValue={(v) => setLines((ls) => ls.map((x, i) => (i === idx
                               ? { ...x, supplyOverride: v, supplyBase: `${num(x.quantity)}|${num(x.unitPrice)}` } : x)))} />
                    </td>
                    <td>
                      <EcNumInput className="cell text-right" disabled={!l.itemId || !taxable}
                             aria-label="부가세"
                             value={l.itemId ? (computed[idx].typedVat != null ? l.vatOverride : String(computed[idx].vat)) : ''}
                             onValue={(v) => setLines((ls) => ls.map((x, i) => (i === idx
                               ? { ...x, vatOverride: v, vatBase: String(computed[idx].supply) } : x)))} />
                    </td>
                    {cols.lineTotal && (
                      <td className="pad text-right font-semibold text-ec-text">
                        {l.itemId ? won(computed[idx].supply + computed[idx].vat) : ''}
                      </td>
                    )}
                    <td>
                      <EcNumInput className="cell text-right" disabled={!l.itemId}
                             value={l.extraCost} onValue={(v) => updateLine(idx, 'extraCost', v)} />
                    </td>
                    {/* 관리항목은 품목 마스터에 붙는 값이라 라인에서는 읽기 전용이다(원본도 disabled). */}
                    {cols.mgmtItem && (
                      <td className="pad text-center text-ec-hint">
                        {it?.managementItemName ?? ''}
                      </td>
                    )}
                    <td>
                      <input className="cell" value={l.remark} disabled={!l.itemId}
                             onChange={(e) => updateLine(idx, 'remark', e.target.value)} />
                    </td>
                    {lineDefs.map((d) => (
                      <td key={d.fieldKey}>
                        {/*
                          머리의 추가항목과 <b>같은 잣대로</b> 그린다. 예전에는 줄만 선택지가
                          채워졌는지를 봤는데, 정의 화면은 [코드] 형식일 때만 선택지를 받으므로
                          선택지를 안 채운 코드 필드가 <b>머리에선 드롭다운, 줄에선 글자 칸</b>이
                          됐다 — 같은 화면의 같은 필드가 위아래에서 다르게 굴었다.
                          원본도 사용자정의 칸은 치는 칸이 아니라 고르는 칸이다(사본 실측: 잠김 20/20).
                        */}
                        {d.fieldType === 'CODE' ? (
                          <select className="cell" value={l.custom[d.fieldKey] ?? ''} disabled={!l.itemId}
                                  onChange={(e) => setLineCustom(idx, d.fieldKey, e.target.value)}>
                            <option value=""></option>
                            {(d.options ?? '').split(',').map((o) => o.trim()).filter(Boolean)
                              .map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            className="cell" disabled={!l.itemId}
                            type={d.fieldType === 'NUMBER' ? 'number' : d.fieldType === 'DATE' ? 'date' : 'text'}
                            value={l.custom[d.fieldKey] ?? ''}
                            onChange={(e) => setLineCustom(idx, d.fieldKey, e.target.value)} />
                        )}
                      </td>
                    ))}
                    {/* 불러온 전표 3열은 읽기 전용이다 — 근거전표는 [전표불러오기]로만 붙는다. */}
                    {cols.srcType && (
                      <td className="pad text-center text-ec-hint">{l.sourceDocType}</td>
                    )}
                    {cols.srcDate && (
                      <td className="pad text-center text-ec-hint">{dateText(l.sourceDocDate)}</td>
                    )}
                    {cols.srcNo && (
                      <td className="pad text-ec-hint overflow-hidden text-ellipsis whitespace-nowrap">
                        {l.sourceDocNo}
                      </td>
                    )}
                    {cols.qcRequest && (
                      <td className="pad text-center">
                        <input type="checkbox" checked={l.qcRequest} disabled={!l.itemId}
                               onChange={(e) => updateLine(idx, 'qcRequest', e.target.checked)} />
                      </td>
                    )}
                    <td className="text-center">
                      {l.itemId && (
                        <button type="button" onClick={() => removeLine(idx)} className="no-ec"
                                style={{ border: 'none', background: 'none', color: '#c0c5cc', cursor: 'pointer' }}>
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} />
                <td colSpan={4} className="pl-[6px]">합계 ({lineCount}건)</td>
                {cols.stockAll && <td />}
                {cols.stockWh && <td />}
                {cols.unit && <td />}
                <td className="text-right">{won(totals.qty)}</td>
                <td />
                {cols.priceVat && <td />}
                <td className="text-right">{won(totals.supply)}</td>
                <td className="text-right">{won(totals.vat)}</td>
                <td className="text-right">{won(totals.extra)}</td>
                {/*
                  합계행은 헤더와 칸 수가 정확히 같아야 한다. 선택 열을 켜면 그만큼 빈 칸을 끼워야
                  숫자가 제 열 아래에 선다. (관리항목은 부대비용과 적요 사이, 불러온 전표 3열은 적요 뒤다.)
                */}
                {cols.mgmtItem && <td />}
                <td style={{ textAlign: 'right', color: cfg.accent }}>{won(totals.total)}</td>
                {cols.srcType && <td />}
                {cols.srcDate && <td />}
                {cols.srcNo && <td />}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {error && <p className="ec-alert ec-alert-danger mt-[10px]">{error}</p>}
        {ok && <p className="ec-alert ec-alert-success mt-[10px]">{ok}</p>}

        {/*
          원본 전표 입력 화면에는 "최근 전표" 목록이 없다 — 헤더폼 → 툴바 → 그리드 → 합계행 → 푸터가 전부다.
          최근 전표를 보는 자리는 푸터의 [리스트](= 조회 화면)이고, 거래처별 최근 내역은 툴바의
          [거래내역보기] 팝업이 진다. 우리 목록은 그 둘과 겹쳐서 걷어냈다.
        */}
      </EcSlipShell>

      {/* ── 열 선택 ──────────────────────────────────────── */}
      <Modal error={error} open={colPickerOpen} title="열 선택" width={360} onClose={() => setColPickerOpen(false)}>
        <p className="text-[12px] text-ec-label mt-0">
          원본에서 기본 숨김으로 깔려 있는 열입니다. 켜면 그리드에 나타납니다.
        </p>
        {OPTIONAL_COLS.filter((c) => c.id !== 'qcRequest' || mode === 'purchase').map((c) => (
          <label key={c.id} className="block py-[5px] px-0 text-[12.5px]">
            <input
              type="checkbox" checked={cols[c.id]} style={{ marginRight: 6 }}
              onChange={(e) => setCols((s) => ({ ...s, [c.id]: e.target.checked }))}
            />
            {c.title}
            {(c.id === 'stockAll' || c.id === 'stockWh') && stocks.length === 0 && (
              <span style={{ color: '#c07800', marginLeft: 6 }}>· [재고불러오기] 후 값이 채워집니다</span>
            )}
          </label>
        ))}
      </Modal>

      {/* ── 거래내역보기 ─────────────────────────────────── */}
      <Modal error={error} open={historyOpen} title={`거래내역보기 (${cfg.lineTab})`} width={720} onClose={() => setHistoryOpen(false)}>
        <p className="text-[12px] text-ec-label mt-0">
          이 거래처의 최근 전표입니다. 행을 누르면 그 전표의 품목·수량·단가를 지금 명세로 가져옵니다.
        </p>
        <div className="max-h-[340px] overflow-y-auto border border-ec-line border-solid">
          {/* 고르는 창이라 합계가 없다 — 몇 중 몇인지만 적는다. 안 적으면 찾는 전표가
              없다고 읽는다. */}
          <EcRowCap capped={partnerDocs.length > 30} shown={30} total={partnerDocs.length} sums={false}
                    hint="거래처를 바꾸거나 기간을 좁혀 보세요." />
          <table className="w-full text-left">
            <thead>
              <tr><th>전표번호</th><th>일자</th><th>품목</th><th className="text-right">합계</th></tr>
            </thead>
            <tbody>
              {partnerDocs.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
              ) : capRows(partnerDocs, 30).rows.map((d) => (
                <tr
                  key={d.id} className="cursor-pointer"
                  onClick={() => copyFromDoc(d, () => setHistoryOpen(false))}
                >
                  <td>{d.docNo}</td>
                  <td>{(d as SalesDoc).saleDate ?? (d as PurchaseDoc).purchaseDate}</td>
                  <td>{d.lines[0]?.itemName}{d.lines.length > 1 ? ` 외 ${d.lines.length - 1}건` : ''}</td>
                  <td className="text-right">{won(d.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* ── 전표불러오기 (원본 slip_load) — 거래처 상관없이 지난 전표를 복사 ── */}
      <Modal error={error} open={slipLoadOpen} title={`전표불러오기 (${cfg.lineTab})`} width={760} onClose={() => setSlipLoadOpen(false)}>
        <p className="text-[12px] text-ec-label mt-0">
          지난 {cfg.lineTab} 전표입니다. 행을 누르면 그 전표의 품목·수량·단가를 지금 명세로 가져오고,
          거래처도 그 전표의 것으로 맞춰집니다. (거래처별로 보려면 툴바 [거래내역보기]를 쓰세요.)
        </p>
        <div className="max-h-[380px] overflow-y-auto border border-ec-line border-solid">
          {/* 고르는 창이라 합계가 없다 — 몇 중 몇인지만 적는다. 안 적으면 찾는 전표가
              없다고 읽는다. */}
          <EcRowCap capped={docs.length > 50} shown={50} total={docs.length} sums={false}
                    hint="전표번호로 찾아 보세요." />
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>전표번호</th><th>일자</th><th>{cfg.partnerLabel}</th><th>품목</th>
                <th className="text-right">합계</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
              ) : capRows(docs, 50).rows.map((d) => (
                <tr key={d.id} className="cursor-pointer" onClick={() => copyFromDoc(d, () => setSlipLoadOpen(false))}>
                  <td>{d.docNo}</td>
                  <td>{(d as SalesDoc).saleDate ?? (d as PurchaseDoc).purchaseDate}</td>
                  <td>{d.partnerName}</td>
                  <td>{d.lines[0]?.itemName}{d.lines.length > 1 ? ` 외 ${d.lines.length - 1}건` : ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: cfg.accent }}>{won(d.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* ── 근거전표 불러오기 (원본 [주문]/[발주]) ────────── */}
      <Modal error={error} open={loadOpen} title={cfg.loadTitle} width={840} onClose={() => setLoadOpen(false)}>
        {loadRows === null ? (
          <p className="text-[12.5px] text-ec-hint m-0">불러오는 중…</p>
        ) : loadRows.length === 0 ? (
          <p className="text-[12.5px] text-ec-hint m-0">
            {mode === 'sales' ? '미판매 잔량이 있는 주문이 없습니다.' : '아직 입고되지 않은 발주서가 없습니다.'}
          </p>
        ) : (
          <>
            <p className="text-[12px] text-ec-label mt-0">
              담을 행을 체크하고 [선택 담기]를 누르면 품목·수량·단가가 명세로 들어갑니다.
            </p>
            <div className="flex items-center gap-[10px] mb-[6px]">
              <input className="ec-input" style={{ width: 260 }} placeholder={`${mode === 'sales' ? '주문No.' : '발주No.'} · 거래처 · 품목 찾기`}
                     value={loadQuery} onChange={(e) => setLoadQuery(e.target.value)} />
              {partnerId && (
                <label className="text-[12.5px] inline-flex items-center gap-[4px]">
                  <input type="checkbox" checked={loadOnlyPartner} onChange={(e) => setLoadOnlyPartner(e.target.checked)} />
                  이 전표 거래처만
                </label>
              )}
              <span className="ml-auto text-[12px] text-ec-hint">{loadShown.length.toLocaleString()} / {loadRows.length.toLocaleString()}줄 · 최근 것부터</span>
            </div>
            <div className="max-h-[360px] overflow-y-auto border border-ec-line border-solid">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="w-[30px]" />
                    <th>{mode === 'sales' ? '주문No.' : '발주No.'}</th>
                    <th className="w-[90px]">일자</th>
                    <th>거래처</th>
                    <th>품목</th>
                    <th className="w-[70px] text-right">{mode === 'sales' ? '주문' : '발주'}</th>
                    <th className="w-[60px] text-right">{mode === 'sales' ? '판매' : '입고'}</th>
                    <th className="w-[70px] text-right">담을수량</th>
                    <th className="w-[80px] text-right">단가</th>
                    <th className="w-[70px]">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {loadShown.map((r) => (
                    <tr
                      key={r.key}
                      onClick={() => setLoadPicked((p) => ({ ...p, [r.key]: !p[r.key] }))}
                      style={{ cursor: 'pointer', background: loadPicked[r.key] ? 'var(--ec-blue-light)' : undefined }}
                    >
                      <td className="text-center">
                        <input type="checkbox" readOnly checked={!!loadPicked[r.key]} />
                      </td>
                      <td>{r.docNo}</td>
                      <td>{dateText(r.date)}</td>
                      <td>{r.partnerName}</td>
                      <td>{r.itemName}</td>
                      <td className="text-right">{won(r.orderedQty)}</td>
                      <td className="text-right text-ec-hint">{won(r.doneQty)}</td>
                      <td className="text-right font-bold">{won(r.restQty)}</td>
                      <td className="text-right">{won(r.unitPrice)}</td>
                      <td className="text-ec-hint">{r.statusName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-[8px] mt-[8px]">
              <span className="text-[12.5px] text-ec-label">
                선택 <b className="text-ec-blue">{Object.values(loadPicked).filter(Boolean).length}</b>건
              </span>
              <div className="ml-auto flex gap-[6px]">
                <button type="button" className="ec-btn" onClick={() => setLoadPicked({})}>전체 해제</button>
                <button type="button" className="ec-btn ec-btn-primary" onClick={applyLoadPicked}>선택 담기</button>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* ── 재고 ─────────────────────────────────────────── */}
      <Modal error={error} open={stockOpen} title="재고 (명세 품목)" width={620} onClose={() => setStockOpen(false)}>
        <table className="w-full text-left">
          <thead>
            <tr><th>품목</th><th>창고</th><th className="text-right">재고</th><th className="text-right">이 전표 수량</th></tr>
          </thead>
          <tbody>
            {lines.filter((l) => l.itemId).length === 0 ? (
              <tr><td colSpan={4} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
            ) : lines.filter((l) => l.itemId).map((l, i) => {
              const have = stockWhOf(l.itemId)
              const need = num(l.quantity)
              return (
                <tr key={i}>
                  <td>{itemById.get(l.itemId)?.name}</td>
                  <td>{warehouses.find((w) => String(w.id) === warehouseId)?.name ?? ''}</td>
                  <td style={{ textAlign: 'right', color: mode === 'sales' && have < need ? 'var(--ec-danger)' : undefined }}>{won(have)}</td>
                  <td className="text-right">{won(need)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Modal>

      {/* ── 검증 결과 ────────────────────────────────────── */}
      {/* 이익계산 — 원본 profitCalc. 원가는 회계(item_costs)가 소유하므로 화면에서 읽어 계산한다. */}
      <Modal error={error} open={profitOpen} title="이익계산" width={780} onClose={() => setProfitOpen(false)}>
        {costs === null ? (
          <div className="p-[20px] text-center text-ec-hint">원가를 불러오는 중…</div>
        ) : profitRows.length === 0 ? (
          <div className="p-[20px] text-center text-ec-hint">명세에 품목이 없습니다.</div>
        ) : (
          <>
            <table className="ec-grid" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th className="text-left">품목</th>
                  <th className="w-[70px] text-right">수량</th>
                  <th className="w-[90px] text-right">매출액</th>
                  <th className="w-[90px] text-right">단위원가</th>
                  <th className="w-[90px] text-right">원가액</th>
                  <th className="w-[90px] text-right">이익</th>
                  <th className="w-[70px] text-right">이익률</th>
                </tr>
              </thead>
              <tbody>
                {profitRows.map((r, i) => (
                  <tr key={i}>
                    <td className="pad">{r.code} {r.name}</td>
                    <td className="pad text-right">{won(r.qty)}</td>
                    <td className="pad text-right">{won(r.revenue)}</td>
                    {r.cost === null ? (
                      <td className="pad" colSpan={4} style={{ textAlign: 'center', color: '#c98a00' }}>
                        원가 미등록 — [회계 &gt; 원가] 에서 등록해야 이익이 잡힙니다
                      </td>
                    ) : (
                      <>
                        <td className="pad text-right">{won(Math.round(r.unitCost!))}</td>
                        <td className="pad text-right">{won(Math.round(r.cost))}</td>
                        <td className="pad" style={{ textAlign: 'right', color: r.profit! < 0 ? '#d03a3a' : '#1a7f37' }}>
                          {won(Math.round(r.profit!))}
                        </td>
                        <td className="pad" style={{ textAlign: 'right', color: r.profit! < 0 ? '#d03a3a' : '#1a7f37' }}>
                          {r.rate === null ? '' : `${r.rate.toFixed(1)}%`}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 600, background: '#f6f7f9' }}>
                  <td className="pad" colSpan={2}>합계 (원가 등록분)</td>
                  <td className="pad text-right">{won(profitTotals.revenue)}</td>
                  <td className="pad" />
                  <td className="pad text-right">{won(Math.round(profitTotals.cost))}</td>
                  <td className="pad text-right">
                    {won(Math.round(profitTotals.revenue - profitTotals.cost))}
                  </td>
                  <td className="pad text-right">
                    {profitTotals.revenue === 0 ? ''
                      : `${(((profitTotals.revenue - profitTotals.cost) / profitTotals.revenue) * 100).toFixed(1)}%`}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p style={{ marginTop: 10, fontSize: 12, color: '#6b727d', lineHeight: 1.6 }}>
              전표 일자({date.slice(0, 7)})를 넘지 않는 가장 최근 기간의 원가를 씁니다.
              실제원가가 잡혀 있으면 실제를, 아직 없으면 표준을 씁니다(월 마감 전에는 실제원가가 0입니다).
              {profitTotals.missing > 0 && ` 원가가 없는 품목 ${profitTotals.missing}건은 합계에서 뺐습니다.`}
            </p>
          </>
        )}
      </Modal>

      <Modal error={error} open={verifyResult !== null} title="검증 결과" width={520} onClose={() => setVerifyResult(null)}>
        {verifyResult && verifyResult.length === 0 ? (
          <p className="text-ec-success text-[13px] m-0">문제가 없습니다. 저장할 수 있습니다.</p>
        ) : (
          <ul className="pl-[18px] m-0 text-[12.5px] leading-[1.8] text-ec-danger">
            {verifyResult?.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        )}
      </Modal>
    </form>
  )
}

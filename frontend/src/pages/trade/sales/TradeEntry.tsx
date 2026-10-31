import { resolveSpecialPrice } from '../../../features/price/specialPrice'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../features/auth/AuthContext'
import { api, extractErrorMessage } from '../../../api/client'
import type { CustomFieldDef, EmployeeMaster, Item, ItemCost, MyItem, Partner, Project, PurchaseDoc, SalesDoc, StockRow, Warehouse } from '../../../types/api'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import EcSlipShell from '../../../components/EcSlipShell'
import { useShortcut } from '../../../utils/useShortcut'
import { lineSupply, roundWon } from '../../../utils/lineSupply'
import { ecAlert } from '../../../components/EcDialog'
import { useSubmitting } from '../../../utils/useSubmitting'
import { isAnyPartner } from '../../../utils/anyPartner'
import { todayYmd } from '../../../utils/periods'
import TradeEntryHead from '../../../features/trade-entry/components/TradeEntryHead'
import TradeEntryToolbar from '../../../features/trade-entry/components/TradeEntryToolbar'
import TradeEntryGrid from '../../../features/trade-entry/components/TradeEntryGrid'
import TradeEntryModals from '../../../features/trade-entry/components/TradeEntryModals'
import TradeLoadModals from '../../../features/trade-entry/components/TradeLoadModals'
import TradeCalcModals from '../../../features/trade-entry/components/TradeCalcModals'
import { useSlipLoad } from '../../../features/trade-entry/useSlipLoad'
import { useTradeSave } from '../../../features/trade-entry/useTradeSave'
import { CFG, emptyLine, emptyLines, type LineInput, type LoadableLine, type Mode, type OptionalColId, type OrderLoadTab, type ReleaseDetail, type TradeEntryPopup } from '../../../features/trade-entry/tradeEntryConfig'
import { parseNumPlain } from '../../../utils/format'
export type { TradeEntryPopup, TradeEntryPrefill } from '../../../features/trade-entry/tradeEntryConfig'

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

/**
 * `adjust` — <b>판매입력 II</b>(원본 E040253 · ESD066M). 판매입력과 같은 전표지만 격자 아래에 <b>금액조정</b> 표가 있고
 * 툴바 [금액조정] 창에서 <b>할인 감소(-)</b> 를 넣는다(2026-10-13 loginaa 실측). 할인은 전표 머리 금액에서 빠진다.
 */
export default function TradeEntry({ mode, adjust = false, popup }: { mode: Mode; adjust?: boolean; popup?: TradeEntryPopup }) {
  const cfg = adjust && mode === 'sales' ? { ...CFG.sales, title: '판매입력 II' } : CFG[mode]
  const isAdjust = adjust && mode === 'sales'
  const navigate = useNavigate()
  // 판매조회에서 [수정]으로 들어오면 `?edit=<전표 id>` 가 붙는다 — 원본도 조회에서 전표번호를 누르면
  // 같은 입력 화면이 수정 모드로 열린다.
  const [searchParams, setSearchParams] = useSearchParams()
  const editId = popup ? (popup.editId == null ? null : String(popup.editId)) : searchParams.get('edit')
  /** 거래처중심입력에서 넘어오면 거래처를 미리 골라 둔다(?partnerId=). */
  const presetPartnerId = popup ? null : searchParams.get('partnerId')
  /**
   * 조회의 <b>[반품처리]</b> 에서 넘어온 근거 전표(?returnFrom=). 그 전표를 <b>베껴서</b>
   * 거래구분을 반품으로 두고 연다 — 수정이 아니다. 원 전표는 손대지 않는다.
   */
  const returnFromId = popup ? null : searchParams.get('returnFrom')
  /**
   * 주문서출고처리 '처리' 탭 [판매] '입력' 에서 넘어온 출고처리 건(?fromRelease=). 원본은 판매입력 창이 그 건의
   * 거래처 · 출하창고 · 품목 · 수량(주문 단가)으로 차서 뜨고, 저장하면 처리 탭 [판매] 칸이 그 판매 일자-No. 로 바뀐다(2026-10-13 실측).
   */
  const fromReleaseId = mode === 'sales' && !popup ? searchParams.get('fromRelease') : null
  const releaseIds = (fromReleaseId ?? '').split(',').filter(Boolean)
  const releaseLoaded = useRef(false)

  // ── 마스터 ─────────────────────────────────────────────
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [docs, setDocs] = useState<(SalesDoc | PurchaseDoc)[]>(popup?.docs ?? [])
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [customDefs, setCustomDefs] = useState<CustomFieldDef[]>([])
  /** 라인 추가항목 정의. entityType 은 전표 것 뒤에 _LINE 을 붙인다(SALES_LINE / PURCHASE_LINE). */
  const [lineDefs, setLineDefs] = useState<CustomFieldDef[]>([])

  // ── 헤더 항목 ──────────────────────────────────────────
  const [date, setDate] = useState(todayYmd())
  const [partnerId, setPartnerId] = useState('')
  /** 임의거래처(12341234)에 고친 거래처명 — 고른 거래처 id 와 같이 들어 다른 거래처를 고르면 저절로 버려진다. */
  const [anyName, setAnyName] = useState<{ id: string; name: string } | null>(null)
  const [employeeId, setEmployeeId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [taxable, setTaxable] = useState(true)
  /** [반품처리] 베끼기는 한 번만 한다 — 사람이 고친 뒤 다시 덮어쓰면 안 된다. */
  const returnLoaded = useRef(false)
  const [foreign, setForeign] = useState(false)          // 통화: 내자/외자
  const [exchangeRate, setExchangeRate] = useState('0')
  const [currencyCode, setCurrencyCode] = useState('')
  useEffect(() => {
    if (mode !== 'purchase') return
    api.get<typeof currencies>('/currencies').then((r) => setCurrencies(r.data)).catch(() => {})
  }, [mode])
  const [currencies, setCurrencies] = useState<{ id: number; code: string; name: string; active: boolean; latestRate: number | null }[]>([])
  const [projectId, setProjectId] = useState('')
  const [remark, setRemark] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [showExtra, setShowExtra] = useState(false)      // 확장(추가) 항목 펼치기
  // 거래별부가세계산(원본 calcbySlip). 켜면 라인마다 반올림하지 않고 전표 합계에 한 번 물린다.
  const [vatBySlip, setVatBySlip] = useState(false)
  /**
   * 판매입력 II [금액조정] 의 할인 <b>합계</b>(원본 창은 이 칸만 고칠 수 있다). 공급가액 · 부가세는 여기서 나눈다 — {@link splitDiscount}.
   * 창에서 고치는 값(adjDraft)과 [적용(F8)] 한 값(discountTotal)을 따로 둔다: 원본도 [적용] 전에는 전표가 안 바뀐다.
   */
  const [discountTotal, setDiscountTotal] = useState(0)
  const [adjOpen, setAdjOpen] = useState(false)
  const [adjDraft, setAdjDraft] = useState('')
  const [adjFolded, setAdjFolded] = useState(false)

  // ── 명세 ──────────────────────────────────────────────
  const [lines, setLines] = useState<LineInput[]>(emptyLines)
  const [cols, setCols] = useState<Record<OptionalColId, boolean>>({
    stockAll: false, stockWh: false, unit: false, priceVat: false,
    // 원본 판매입력 II 격자는 [부가세] 다음 [합계] 를 기본으로 보인다(2026-10-13 실측).
    // 원본 판매입력 격자도 [부가세] 다음 [합계] 를 기본으로 보인다(2026-10-14 실측 — 판매입력 II 와 같다). 구매입력은 없다.
    lineTotal: mode === 'sales',
    mgmtItem: false, srcType: false, srcDate: false, srcNo: false, qcRequest: false,
  })
  const [colPickerOpen, setColPickerOpen] = useState(false)
  /*
   * 원본 판매입력 격자(2026-10-14 loginaa 실측, 보이는 열): 품목코드 · 품목명 · 규격 · 수량 · 시리얼/로트No. · 단가 · 공급가액 · 부가세 ·
   * 새로운 항목 추가 · 합계. 구매입력: 품목코드 · 품목명 · 규격 · 수량 · 단가 · 공급가액 · 부가세 · 새로운 항목 추가
   * (전체수량 · 창고수량 · 단위 · 단가(vat포함) · 관리항목 · 부대비용 … 은 양식에 깔려 있고 꺼져 있다).
   * 그래서 판매는 시리얼/로트를 수량 뒤에 두고 부대비용(구매 쪽 값)은 그리지 않는다.
   */
  /*
   * 판매입력 II(원본 E040253, 2026-10-22 실측) 격자는 품목코드 · 품목명 · 규격 · 수량 · 단가 · 공급가액 · 부가세 · 합계 · 새로운 항목 추가 —
   * 판매입력의 [시리얼/로트No.] · [적요] 열이 없다. 머리에도 [거래구분] · 판매No. · [적요] 가 없다.
   */
  const lineLotCol = !isAdjust
  const lineRemarkCol = !isAdjust
  const lotAfterQty = mode === 'sales'
  const showExtraCost = mode !== 'sales'
  /*
   * 원본 판매입력 [현금수금] — 화면을 떠나지 않고 '매출처로부터' 입금 창을 띄운다(2026-10-06 loginaa 실측):
   * 전표일자 오늘 · 입금계좌 000 현금 · 거래처 = 입력 중인 거래처 · 금액 = 전표 합계(1,101) · 수수료 0 · 적요.
   * 입금계좌는 000 현금 또는 등록된 계좌(settlement.bankAccountId) — 아래 cashBanks.
   * 구매입력 [현금지급]도 같은 모양의 '매입처로' 창이다 — 단 <b>출금계좌는 비어</b> 있다(같은 날 실측).
   */
  const [cashOpen, setCashOpen] = useState(false)
  const [cashForm, setCashForm] = useState({ date: '', departmentId: '', projectId: '', method: '현금', amount: '', fee: '0', note: '' })
  /*
   * [입금계좌]/[출금계좌] 후보 — 원본 계좌검색은 <b>등록된 계좌</b>(기업은행-1122 · 외환은행-2211 …)와 000 현금을 띄운다
   * (2026-10-06 loginaa 실측). 예전 우리는 '현금 · 보통예금' 두 값뿐이라 어느 통장으로 받았는지 남지 않았다.
   * 계좌를 고르면 회계반영 때 그 계좌의 계정으로 분개하고 계좌잔액 · 입출금 내역도 같이 움직인다.
   * 카드사 · PG사 계정과 [다른계정찾기]는 아직 없다.
   */
  /** [부서] 후보 — 원본 창의 둘째 칸. */
  const [cashDepts, setCashDepts] = useState<{ id: number; code: string | null; name: string }[]>([])
  const [cashBanks, setCashBanks] = useState<{ id: number; code: string | null; name: string | null; bankName: string; accountNo: string | null; active: boolean }[]>([])
  const [cashMsg, setCashMsg] = useState('')
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
  /** 수정 창 [H] · [최종이력] — 판매 'SALES' · 구매 'PURCHASE'(각 서비스 HISTORY_TARGET), 구매는 [H] 만. */
  const [slipHistory, setSlipHistory] = useState<'H' | 'last' | null>(null)
  const [stockOpen, setStockOpen] = useState(false)
  // 이익계산(원본 profitCalc). 원가는 회계 모듈이 소유하므로 화면에서 /costs 를 읽어 계산한다 —
  // trade → accounting 의존은 순환이라 백엔드에서 못 부른다(CLAUDE.md 4.1).
  const [profitOpen, setProfitOpen] = useState(false)
  // 전표불러오기(원본 slip_load) — 지난 전표를 골라 그 명세를 복사해 담는다.
  const [slipLoadOpen, setSlipLoadOpen] = useState(false)
  /** 툴바 [전표불러오기] — 원본은 '메뉴검색' 창(어느 전표에서 불러올지 메뉴를 고른다, 2026-10-31 loginad 실측). */
  const [menuSearchOpen, setMenuSearchOpen] = useState(false)
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
  /*
   * 판매 [주문] = 원본 '주문서검색창(조회)'(2026-10-28 실측): 전표 단위 목록 · 알약 · [라인별 ▾] 로 줄 단위.
   * 주문 전표의 합계 · 진행상태 · 줄 수는 주문서 목록에서 가져온다(미판매 응답은 남은 줄만 싣는다).
   */
  const [loadByLine, setLoadByLine] = useState(false)
  const [loadDocPicked, setLoadDocPicked] = useState<Record<number, boolean>>({})
  const [loadTab, setLoadTab] = useState<OrderLoadTab>('ALL')
  /** 구매 '발주서조회' 창 [이력조회] — 발주서 이력조회 창. */
  const [poHistoryOpen, setPoHistoryOpen] = useState(false)
  /** 구매 툴바 [주문] — 원본 '주문서검색창(조회)'(2026-10-31 loginad 구매 QA). 고른 주문의 품목 · 수량을 구매 단가로 담는다. */
  const [orderPickOpen, setOrderPickOpen] = useState(false)
  const [loadOrderMeta, setLoadOrderMeta] = useState<Map<number, { total: number; status: string; lineCount: number }>>(new Map())
  /** 방금 저장한 전표 — 연결전표 탭·회계전표연결은 이게 있어야 열린다(원본도 저장 전엔 hidden). */
  const [savedDoc, setSavedDoc] = useState<{ id: number; docNo: string } | null>(null)
  /** 저장 요청이 도는 동안 두 번째 저장을 막는다(2026-10-28 [복사] 뒤 두 번 눌러 같은 구매가 두 건 생겼다). */
  const submitting = useSubmitting()
  /** 수정 중인 전표. 있으면 저장이 POST 가 아니라 PUT 이 된다. */
  const [editing, setEditing] = useState<{ id: number; docNo: string } | null>(null)
  /* [Fn] → [일자변경] 작은 창 — 원본: 수정 창의 일자 칸은 잠겨 있고 이 창에서만 바꾼다(2026-10-28 21시 실측). */
  const [dateChgOpen, setDateChgOpen] = useState(false)
  const [dateChgTo, setDateChgTo] = useState('')
  const [fnOpen, setFnOpen] = useState(false)
  const dateChangedRef = useRef(false)
  /** 수정 창 [복사] 를 누른 뒤 — 같은 내용을 새 전표로 쓴다. 불러오기 효과가 그 전표를 다시 펼치지 않게 막는다. */
  const copiedRef = useRef(false)
  const [verifyResult, setVerifyResult] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  /** 품목은 골랐는데 수량이 빈 줄 — 원본은 그 [수량] 칸 위에 '유효키항목 필수입력' 말풍선(2026-10-21 E040205 실측). */
  const [qtyErr, setQtyErr] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [savedAt, setSavedAt] = useState('')
  const [hasTemp, setHasTemp] = useState(false)

  const gridRef = useRef<HTMLDivElement>(null)
  // 열을 더할 때 합계행(tfoot)을 같이 안 고치면 숫자가 엉뚱한 열 아래에 선다. 개발 모드에서 잡는다.
  useTableColumnCheck(gridRef, '판매/구매입력 명세 그리드', [cols, lines.length])
  // 회사 · 사용자마다 따로 둔다. 같은 브라우저에서 다른 회사로 들어가면 앞 회사의 쓰던 전표가 불려 오던 것.
  const { companyCode, user } = useAuth()
  const whKey = `ec-slip-wh:${companyCode ?? '-'}:${user?.username ?? '-'}:${mode}`
  /** 원본은 새 전표를 열면 마지막으로 쓴 머리(일자 · 담당자 · 창고)를 채운다 — 일자 · 담당자는 창고와 같은 열쇠 꼴로 함께 기억한다. */
  const hdKey = `ec-slip-hd:${companyCode ?? '-'}:${user?.username ?? '-'}:${mode}`
  /** 원본은 계정마다 서버에 남긴다 → 우리도 /me/memory. 서버가 안 되면 이 브라우저 저장소로 대신한다. */
  const memKey = `trade-head:${mode}`
  const readLocalHd = (): { date?: string; employeeId?: string; warehouseId?: string } => {
    try {
      const hd = JSON.parse(localStorage.getItem(hdKey) ?? '{}')
      return { ...hd, warehouseId: localStorage.getItem(whKey) ?? undefined }
    } catch { return {} }
  }
  /** 저장 뒤 [새로] 에서 머리 담당자를 되채울 때 쓴다(서버 응답을 다시 기다리지 않게 들고 있는다). */
  const rememberedEmpRef = useRef('')
  const readHd = async (): Promise<{ date?: string; employeeId?: string; warehouseId?: string }> => {
    try {
      const r = await api.get<{ value: string | null }>(`/me/memory/${memKey}`)
      return r.data.value ? JSON.parse(r.data.value) : {}
    } catch { return readLocalHd() }
  }
  const tempKey = `ec-slip-temp:${companyCode ?? '-'}:${user?.username ?? '-'}:${mode}`

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 3000)
  }

  // ── 로딩 ──────────────────────────────────────────────
  async function loadRefs() {
    api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
    api.get<EmployeeMaster[]>('/sales-reps').then((r) => setEmployees(r.data)).catch(() => {})
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
    /* 원본은 안내용 더미 창고('00000 창고/공장/외주공장 등록을 통해…')를 처음 값으로 깔지 않는다 — 마지막에 쓴 창고, 없으면 빈 칸.
       (실제 창고가 있으면 첫 실창고로 채워 입력이 막히지 않게 한다.) */
    const isNew = !editId && !returnFromId && !popup
    const hd = isNew ? await readHd() : {}
    rememberedEmpRef.current = hd.employeeId ?? ''
    const remembered = hd.warehouseId ?? ''
    const guide = (x: Warehouse) => x.code === '00000' || (x.name ?? '').startsWith('창고/공장/외주공장 등록')
    const first = w.data.find((x) => x.active && !guide(x))
    const start = w.data.find((x) => String(x.id) === remembered && x.active) ?? first
    setWarehouseId((prev) => prev || (start ? String(start.id) : ''))
    if (isNew) {
      if (hd.date && /^\d{4}-\d{2}-\d{2}$/.test(hd.date)) setDate(hd.date)
      if (hd.employeeId) setEmployeeId((prev) => prev || hd.employeeId!)
    }
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
    if (docsAsked.current || popup) return
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
   * [반품처리] 로 넘어온 경우 — 원본(2026-10-28 loginaa 판매 수정 창 [반품처리] 실측)처럼 새 입력 창을 같은 머리
   * (일자 오늘 · 거래처 · 담당자 · 출하창고)로 열고 줄 수량을 <b>음수</b>로 담는다(-30 → 공급가액 -60,000 · 부가세 -6,000).
   * 적요는 비우고 거래구분은 일반 그대로다 — 원본 판매입력에는 거래구분 칸이 없고, 줄이 전부 음수면 서버가 반품 전표로 적는다.
   * 근거전표(sourceOrderId)는 <b>안 옮긴다</b>. 반품은 그 수주를 다시 채우는 것이 아니라
   * 되돌려주는 것이라, 옮기면 수주 잔량이 엉뚱하게 줄어든다.
   */
  useEffect(() => {
    if (!returnFromId || editing || docs.length === 0 || returnLoaded.current) return
    const d = docs.find((x) => String(x.id) === returnFromId)
    if (!d) return
    returnLoaded.current = true
    setDate(todayYmd())
    setPartnerId(d.partnerId != null ? String(d.partnerId) : '')
    setAnyName(d.partnerId != null ? { id: String(d.partnerId), name: d.partnerName ?? '' } : null)
    setWarehouseId(String(d.warehouseId))
    setEmployeeId(d.employeeId != null ? String(d.employeeId) : '')
    setTaxable(d.taxable)
    setVatBySlip(d.vatBySlip)
    setRemark('')
    setLines([
      ...d.lines.map((l) => ({
        ...emptyLine(),
        itemId: String(l.itemId),
        quantity: String(-Math.abs(l.quantity)),
        unitPrice: String(l.unitPrice),
        spec: l.spec ?? null,
        name: l.itemName ?? null,
        lotNo: l.lotNo ?? '',
        remark: l.remark ?? '',
      })),
      emptyLine(),
    ])
  }, [returnFromId, editing, docs])

  /* 발주서조회 '생성한 전표' [신규(F2)] — 그 발주의 잔량으로 채운다. loadRefs 의 창고 기본값은 prev 를 지키므로 덮이지 않는다. */
  useEffect(() => {
    const pf = popup?.prefill
    if (!pf || editId) return
    setPartnerId(pf.partnerId != null ? String(pf.partnerId) : '')
    setEmployeeId(pf.employeeId != null ? String(pf.employeeId) : '')
    if (pf.warehouseId != null) setWarehouseId(String(pf.warehouseId))
    setProjectId(pf.projectId != null ? String(pf.projectId) : '')
    if (mode === 'purchase' && pf.currencyCode) {
      setForeign(true); setCurrencyCode(pf.currencyCode)
      if (pf.exchangeRate != null) setExchangeRate(String(pf.exchangeRate))
    }
    setLines([
      ...pf.lines.map((l) => ({
        ...emptyLine(),
        itemId: String(l.itemId), quantity: String(l.quantity), unitPrice: String(l.unitPrice), name: l.itemName ?? null,
        sourceOrderId: String(l.sourceOrderId), sourceDocType: l.sourceDocType,
        sourceDocDate: l.sourceDocDate, sourceDocNo: l.sourceDocNo,
      })),
      emptyLine(),
    ])
    setCols((c) => ({ ...c, srcNo: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!fromReleaseId || releaseLoaded.current) return
    releaseLoaded.current = true
    /*
     * 여러 건(?fromRelease=1,2)이면 <b>한 판매로 묶는다</b> — 원본 처리 탭에서 두 건을 골라 [판매입력] 하거나
     * 출고등록 창의 [판매입력] 을 켜고 두 주문을 한 번에 출고하면 판매입력 창에 두 주문의 품목이 한꺼번에 차고,
     * 저장하면 두 처리 건의 [판매] 칸이 같은 판매(2026/10/13-7)를 가리킨다(2026-10-13 실측). 머리는 첫 건을 따른다.
     */
    void Promise.all(releaseIds.map((id) => api.get<ReleaseDetail>(`/order-releases/${id}`))).then((res) => {
      const rs = res.map((x) => x.data)
      const r = rs[0]
      setPartnerId(r.partnerId != null ? String(r.partnerId) : '')
      if (r.warehouseId != null) setWarehouseId(String(r.warehouseId))
      setProjectId(r.projectId != null ? String(r.projectId) : '')
      setEmployeeId(r.employeeId != null ? String(r.employeeId) : '')
      setTaxable(r.taxable)
      setLines([
        ...rs.flatMap((rr) => rr.lines.map((l) => ({
          ...emptyLine(),
          itemId: String(l.itemId),
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          name: l.itemName ?? null,
          sourceOrderId: String(rr.orderId),
          sourceDocType: '주문서',
          sourceDocDate: rr.orderDate,
          sourceDocNo: rr.orderNo,
        }))),
        emptyLine(),
      ])
    }).catch((err) => flash(extractErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromReleaseId])

  useEffect(() => {
    if (!editId || editing || docs.length === 0 || copiedRef.current) return
    const d = docs.find((x) => String(x.id) === editId)
    if (!d) return
    // 금액조정(할인)이 든 전표는 판매입력 II 전표다 — 원본도 판매조회에서 그 전표를 열면 [판매입력 II(수정)] 창이 뜬다.
    const disc = mode === 'sales' ? Number((d as SalesDoc).discountSupply ?? 0) + Number((d as SalesDoc).discountVat ?? 0) : 0
    // 판매입력 II 로 만든 전표(inputII)도 — 할인이 없어도 원본 창 제목은 '판매입력 II(수정)'. 목록 위 창은 판매조회가 adjust 로 연다.
    if ((disc !== 0 || (d as SalesDoc).inputII) && !isAdjust && !popup) { navigate(`/sales/sell2?edit=${d.id}`, { replace: true }); return }
    setDiscountTotal(disc)
    setEditing({ id: d.id, docNo: d.docNo })
    setDate((d as SalesDoc).saleDate ?? (d as PurchaseDoc).purchaseDate)
    setPartnerId(d.partnerId != null ? String(d.partnerId) : '')
    setAnyName(d.partnerId != null ? { id: String(d.partnerId), name: d.partnerName ?? '' } : null)
    setWarehouseId(String(d.warehouseId))
    setEmployeeId(d.employeeId != null ? String(d.employeeId) : '')
    setProjectId((d as SalesDoc).projectId != null ? String((d as SalesDoc).projectId) : '')
    setTaxable(d.taxable)
    setVatBySlip(d.vatBySlip)
    setRemark(d.remark ?? '')
    const fxDoc = mode === 'purchase' && !!(d as PurchaseDoc).currencyCode
    setForeign(fxDoc)
    setCurrencyCode(fxDoc ? ((d as PurchaseDoc).currencyCode ?? '') : '')
    setExchangeRate(fxDoc ? String((d as PurchaseDoc).exchangeRate ?? 0) : '0')
    setLines([
      ...d.lines.map((l) => ({
        ...emptyLine(),
        itemId: String(l.itemId),
        quantity: String(l.quantity),
        unitPrice: fxDoc && l.foreignPrice != null ? String(l.foreignPrice) : String(l.unitPrice),
        lineRate: fxDoc && l.lineRate != null && l.lineRate !== (d as PurchaseDoc).exchangeRate ? String(l.lineRate) : '',
        spec: l.spec ?? null,
        name: l.itemName ?? null,
        lotNo: l.lotNo ?? '',
        extraCost: l.extraCost != null ? String(l.extraCost) : '',
        // 저장된 공급가액이 수량 × 단가와 다르면 손으로 고친 값이다 — 다시 저장해도 남도록 들고 온다.
        ...(!fxDoc && Number(l.supplyAmount) !== lineSupply(l.quantity, Number(l.unitPrice))
          ? { supplyOverride: String(Number(l.supplyAmount)), supplyBase: `${l.quantity}|${l.unitPrice}` }
          : {}),
        // 부가세도 같다 — 줄마다 계산하는 전표에서 공급가액 × 10% 와 다르면 손으로 고친 값이다.
        ...(d.taxable && !d.vatBySlip && Number(l.vatAmount) !== roundWon(Number(l.supplyAmount) * 0.1)
          ? { vatOverride: String(Number(l.vatAmount)), vatBase: String(Number(l.supplyAmount)) }
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
  const chosenPartner = partners.find((p) => String(p.id) === partnerId)
  const anyPartner = isAnyPartner(chosenPartner)
  /** 임의거래처 이름 칸의 값 — 고친 것이 없으면 마스터 이름('임의거래처'). */
  const anyPartnerName = anyPartner ? (anyName?.id === partnerId ? anyName.name : chosenPartner?.name ?? '') : ''
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const codeItems = useMemo(
    () => items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.spec, stopped: !i.active })),
    [items],
  )

  /** 재고 조회는 [재고불러오기]를 눌렀을 때만 한다 — 화면을 열 때마다 전 품목 재고를 끌어올 필요는 없다. */
  /** [일자변경] 저장 — 서버가 새 날짜의 다음 번호로 전표번호를 다시 매긴다. */
  async function changeDate() {
    if (!editing) return
    if (!dateChgTo || dateChgTo === date) { void ecAlert('변경일자를 기존일자와 다르게 입력하세요.'); return }
    try {
      const res = await api.post<SalesDoc | PurchaseDoc>(mode === 'sales' ? `/sales/${editing.id}/change-date` : `/purchases/${editing.id}/change-date`, { date: dateChgTo })
      setEditing({ id: editing.id, docNo: res.data.docNo })
      setDate(dateChgTo)
      dateChangedRef.current = true
      setDateChgOpen(false)
      void ecAlert('정상적으로 변경되었습니다.')
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

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
   * <p>서버가 단가적용순서설정의 '사용' 줄을 차례로 본다(창고별 · 거래처별 특별단가). 화면은 부르기만 한다.
   * 못 찾으면 표준단가를 그대로 둔다 — 특별단가가 없다는 뜻이지 0 이라는 뜻이 아니다.
   */
  async function applySpecialPrice(idx: number, itemId: string, partnerOverride?: string) {
    const pid = partnerOverride ?? partnerId
    // 창고별특별단가도 단가적용순서에 있다(E040124 [창고설정]) — 거래처 없이 창고만으로도 걸릴 수 있다.
    const p = await resolveSpecialPrice(mode === 'sales' ? 'SALES' : 'PURCHASE', itemId, pid, warehouseId)
    if (p == null) return
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, unitPrice: String(p) } : l)))
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
      // 품목을 새로 고르면 규격도 새 품목 규격으로 다시 채운다(원본). 고친 규격은 같은 품목에서만 남는다.
      if (field === 'itemId') next[idx] = { ...next[idx], spec: null, name: null }
      if (field === 'itemId' && value) {
        const it = itemById.get(String(value))
        if (it && !next[idx].unitPrice) next[idx] = { ...next[idx], unitPrice: basePriceOf(it) }
        // 원본 판매입력 · 구매입력 둘 다 품목을 골라도 [수량] 이 빈칸이다(단가만 찬다, 공급가액 0 —
        // 판매 2026-10-14, 구매 2026-10-20 재고1c 실측: 품목 고름 → 수량 빈칸 · 단가 100(입고단가) · 0 · 0). 미리 1 을 넣지 않는다.
        // 표준단가를 채운 뒤 특별단가가 있으면 그것으로 덮는다(서버가 순서를 판단한다).
        void applySpecialPrice(idx, String(value))
        if (idx === ls.length - 1) next.push(emptyLine())
      }
      return next
    })
  }
  const lotCell = (l: LineInput, idx: number) => (
    <td>
      <input className="cell" value={l.lotNo} maxLength={500} disabled={!l.itemId}
             onChange={(e) => updateLine(idx, 'lotNo', e.target.value)} />
    </td>
  )
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
        next[at] = { ...next[at], quantity: String(parseNumPlain(next[at].quantity) + qty) }
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
  const { applyAmountAdjust, applyLoadPicked, applyOrdersToPurchase, checkedIdx, copyFromDoc, loadDocsShown, loadLineTable, openAdjust, openLoadSource, targetIdx, vatBySlipButton } = useSlipLoad({ addItemLine, adjDraft, currencyCode, date, discountTotal, flash, foreign, isAdjust, lines, loadByLine, loadDocPicked, loadOnlyPartner, loadOrderMeta, loadPicked, loadQuery, loadRows, loadTab, mode, partnerId, projectId, setAdjDraft, setAdjOpen, setCols, setCurrencyCode, setDiscountTotal, setEmployeeId, setError, setExchangeRate, setForeign, setLines, setLoadByLine, setLoadDocPicked, setLoadOpen, setLoadOrderMeta, setLoadPicked, setLoadQuery, setLoadRows, setLoadTab, setOrderPickOpen, setPartnerId, setProjectId, setVatBySlip, setWarehouseId, vatBySlip, warehouseId })
  /*
   * 창의 [적용(F8)]. 전표 틀(EcSlipShell)도 window 에 F8(저장)을 걸어 두었다 — 창이 열려 있을 때 저장이 돌면 안 되므로
   * <b>capture 단계</b>에서 먼저 받아 전파를 끊는다.
   */
  useEffect(() => {
    if (!adjOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F8' || e.repeat) return
      e.preventDefault(); e.stopPropagation()
      applyAmountAdjust()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  /* 주문서검색창 [잔량적용(F8)] — 위 금액조정 창과 같은 이유로 capture 단계에서 받아 저장(F8)을 막는다. */
  useEffect(() => {
    if (!loadOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F8' || e.repeat) return
      e.preventDefault(); e.stopPropagation()
      applyLoadPicked()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // ── 계산 ──────────────────────────────────────────────
  // 부가세 배분은 백엔드 `VatAllocator` 와 같은 규칙이어야 한다 — 화면에 보이는 값과
  // 저장된 값이 1원이라도 다르면 사용자는 화면을 못 믿는다.
  /** 구매입력의 외자(수입) — 단가는 외화단가, 공급가액은 round(외화금액 × 환율) 원화, 부가세는 붙지 않는다. */
  const { applyAdjust, applyExtraCost, applyPriceChange, applyQtyStep, applyTemp, computed, deleteChecked, deleteTemp, discount, doExcel, doPrint, footerActions, formRef, fx, fxAmountOf, lineCount, net, orderLoaded, partnerDocs, popupActions, profitRows, profitTotals, rate, reset, saveCash, scanBarcode, sortLines, submit, todo, totalTd, totals, verify } = useTradeSave({ addItemLine, adjustRate, adjustRound, adjustTarget, adjustUnit, anyPartner, anyPartnerName, barcode, cashBanks, cashDepts, cashForm, cfg, checkedIdx, copiedRef, currencyCode, customDefs, customValues, date, dateChangedRef, discountTotal, docs, docsAsked, editing, employeeId, ensureDocs, exchangeRate, extraCostAmt, flash, foreign, fromReleaseId, gridRef, hdKey, isAdjust, itemById, items, lineDefs, lines, loadDocs, memKey, mode, navigate, partnerId, partners, popup, priceChangeTo, projectId, qtyStep, releaseIds, remark, rememberedEmpRef, savedDoc, setBarcode, setCashBanks, setCashDepts, setCashForm, setCashMsg, setCashOpen, setCurrencyCode, setCustomValues, setDate, setDiscountTotal, setEditing, setEmployeeId, setError, setExchangeRate, setForeign, setHasTemp, setLines, setPartnerId, setProjectId, setQtyErr, setRemark, setSavedAt, setSavedDoc, setSearchParams, setSlipHistory, setTaxable, setVerifyResult, setWarehouseId, stockWhOf, stocks, submitting, targetIdx, taxable, tempKey, unitCostOf, vatBySlip, warehouseId, whKey })

  return (
    <form ref={formRef} onSubmit={submitting.wrap(submit)}>
      <EcSlipShell
        title={popup ? (editing ? `${cfg.title}(수정)` : cfg.title) : editing ? `${cfg.title} — ${editing.docNo} 수정` : cfg.title}
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
        }))
          /* 회계반영된 판매의 수정 창: 원본 알약 [기본(수정불가)] [매출전표 I] [+](2026-10-22 판매입력 II(수정) 실측). */
          : editing && mode === 'sales' && (docs.find((x) => x.id === editing.id) as SalesDoc | undefined)?.accountingReflected
            ? [{ id: '매출전표 I', label: '매출전표 I', onSelect: () => navigate('/sales/accounting-reflection') }]
            : []}
        onAddTab={() => flash('탭 추가는 [Self-Customizing > 입력양식]에서 설정합니다.')}
        /* 원본 판매입력 머리 [기본(수정불가) ▾] · [Option] · [도움말](2026-10-31 loginad). 구매입력 머리에는 양식 단추가 없다. */
        layouts={mode === 'sales' && !isAdjust ? {
          label: '기본(수정불가)',
          items: [
            { label: '✓ 기본(수정불가)' },
            { label: '적요', onClick: () => flash('입력 양식 바꾸기는 아직 없습니다 — 기본(수정불가) 양식으로 입력합니다.') },
            { label: '신규양식추가', onClick: () => flash('탭 추가는 [Self-Customizing > 입력양식]에서 설정합니다.') },
          ],
        } : undefined}
        plainOption
        tempSave={hasTemp && !popup ? { onApply: applyTemp, onDelete: deleteTemp } : null}
        savedAt={savedAt}
        options={[
          { label: showExtra ? '추가항목 접기' : '추가항목 펼치기', onClick: () => setShowExtra((v) => !v) },
          { label: '열 선택', onClick: () => setColPickerOpen(true) },
          { label: 'Excel 내려받기', onClick: () => void doExcel() },
          { label: '인쇄', onClick: doPrint },
          { label: '입력값 초기화', onClick: () => reset(false) },
          // 예전 [전표불러오기] 창(지난 같은 전표 복사). 툴바 단추는 원본처럼 '메뉴검색' 창이 됐다.
          { label: `지난 ${cfg.lineTab}전표 불러오기`, onClick: () => { ensureDocs(); setSlipLoadOpen(true) } },
        ]}
        actions={popupActions ?? footerActions}
        busy={submitting.busy}
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
        <TradeEntryHead adjust={adjust} anyPartner={anyPartner} anyPartnerName={anyPartnerName} cfg={cfg} choosePartner={choosePartner} currencies={currencies} currencyCode={currencyCode} customDefs={customDefs} customValues={customValues} date={date} editing={editing} employeeId={employeeId} employees={employees} exchangeRate={exchangeRate} fnOpen={fnOpen} foreign={foreign} fx={fx} isAdjust={isAdjust} mode={mode} partnerId={partnerId} projectId={projectId} projects={projects} rate={rate} remark={remark} setAnyName={setAnyName} setCurrencyCode={setCurrencyCode} setCustomValues={setCustomValues} setDate={setDate} setDateChgOpen={setDateChgOpen} setDateChgTo={setDateChgTo} setEmployeeId={setEmployeeId} setExchangeRate={setExchangeRate} setFnOpen={setFnOpen} setForeign={setForeign} setProjectId={setProjectId} setRemark={setRemark} setTaxable={setTaxable} setWarehouseId={setWarehouseId} showExtra={showExtra} taxable={taxable} totals={totals} usablePartners={usablePartners} warehouseId={warehouseId} warehouses={warehouses} />

        <TradeEntryToolbar addItemLine={addItemLine} adjustOn={adjustOn} adjustRate={adjustRate} adjustRound={adjustRound} adjustTarget={adjustTarget} adjustUnit={adjustUnit} applyAdjust={applyAdjust} applyExtraCost={applyExtraCost} applyMyItems={applyMyItems} applyPriceChange={applyPriceChange} applyQtyStep={applyQtyStep} barcode={barcode} barcodeOpen={barcodeOpen} cfg={cfg} deleteChecked={deleteChecked} discount={discount} ensureDocs={ensureDocs} extraCostAmt={extraCostAmt} extraCostOn={extraCostOn} findOpen={findOpen} findText={findText} isAdjust={isAdjust} loadStocks={loadStocks} mode={mode} myItems={myItems} myItemsOpen={myItemsOpen} notice={notice} openAdjust={openAdjust} openLoadSource={openLoadSource} openProfit={openProfit} orderLoaded={orderLoaded} partnerId={partnerId} priceChangeOn={priceChangeOn} priceChangeTo={priceChangeTo} qtyStep={qtyStep} qtyStepOpen={qtyStepOpen} scanBarcode={scanBarcode} setAdjustOn={setAdjustOn} setAdjustRate={setAdjustRate} setAdjustRound={setAdjustRound} setAdjustTarget={setAdjustTarget} setAdjustUnit={setAdjustUnit} setBarcode={setBarcode} setBarcodeOpen={setBarcodeOpen} setColPickerOpen={setColPickerOpen} setExtraCostAmt={setExtraCostAmt} setExtraCostOn={setExtraCostOn} setFindOpen={setFindOpen} setFindText={setFindText} setHistoryOpen={setHistoryOpen} setMenuSearchOpen={setMenuSearchOpen} setMyItemsOpen={setMyItemsOpen} setOrderPickOpen={setOrderPickOpen} setPriceChangeOn={setPriceChangeOn} setPriceChangeTo={setPriceChangeTo} setQtyStep={setQtyStep} setQtyStepOpen={setQtyStepOpen} setStockOpen={setStockOpen} setToolbarExpanded={setToolbarExpanded} sortLines={sortLines} stocks={stocks} todo={todo} toggleMyItem={toggleMyItem} toolbarExpanded={toolbarExpanded} vatBySlipButton={vatBySlipButton} verify={verify} />

        <TradeEntryGrid checkedIdx={checkedIdx} codeItems={codeItems} cols={cols} computed={computed} discount={discount} exchangeRate={exchangeRate} findText={findText} fx={fx} fxAmountOf={fxAmountOf} gridRef={gridRef} isAdjust={isAdjust} itemById={itemById} lineCount={lineCount} lineDefs={lineDefs} lineLotCol={lineLotCol} lineRemarkCol={lineRemarkCol} lines={lines} lotAfterQty={lotAfterQty} lotCell={lotCell} myItems={myItems} net={net} qtyErr={qtyErr} removeLine={removeLine} setLineCustom={setLineCustom} setLines={setLines} setQtyErr={setQtyErr} showExtraCost={showExtraCost} stockAllOf={stockAllOf} stockWhOf={stockWhOf} taxable={taxable} toggleMyItem={toggleMyItem} totalTd={totalTd} totals={totals} updateLine={updateLine} />

        {error && <p className="ec-alert ec-alert-danger mt-[10px]">{error}</p>}

        {/*
          원본 전표 입력 화면에는 "최근 전표" 목록이 없다 — 헤더폼 → 툴바 → 그리드 → 합계행 → 푸터가 전부다.
          최근 전표를 보는 자리는 푸터의 [리스트](= 조회 화면)이고, 거래처별 최근 내역은 툴바의
          [거래내역보기] 팝업이 진다. 우리 목록은 그 둘과 겹쳐서 걷어냈다.
        */}
      </EcSlipShell>

      <TradeEntryModals cashBanks={cashBanks} cashDepts={cashDepts} cashForm={cashForm} cashMsg={cashMsg} cashOpen={cashOpen} cfg={cfg} changeDate={changeDate} colPickerOpen={colPickerOpen} cols={cols} copyFromDoc={copyFromDoc} date={date} dateChgOpen={dateChgOpen} dateChgTo={dateChgTo} editing={editing} error={error} historyOpen={historyOpen} menuSearchOpen={menuSearchOpen} mode={mode} openLoadSource={openLoadSource} partnerDocs={partnerDocs} partnerId={partnerId} partners={partners} projects={projects} saveCash={saveCash} setCashForm={setCashForm} setCashOpen={setCashOpen} setColPickerOpen={setColPickerOpen} setCols={setCols} setDateChgOpen={setDateChgOpen} setDateChgTo={setDateChgTo} setHistoryOpen={setHistoryOpen} setMenuSearchOpen={setMenuSearchOpen} setSlipHistory={setSlipHistory} slipHistory={slipHistory} stocks={stocks} />

      <TradeLoadModals applyLoadPicked={applyLoadPicked} applyOrdersToPurchase={applyOrdersToPurchase} cfg={cfg} copyFromDoc={copyFromDoc} docs={docs} error={error} loadByLine={loadByLine} loadDocPicked={loadDocPicked} loadDocsShown={loadDocsShown} loadLineTable={loadLineTable} loadOnlyPartner={loadOnlyPartner} loadOpen={loadOpen} loadQuery={loadQuery} loadRows={loadRows} loadTab={loadTab} mode={mode} orderPickOpen={orderPickOpen} partnerId={partnerId} poHistoryOpen={poHistoryOpen} setLoadByLine={setLoadByLine} setLoadDocPicked={setLoadDocPicked} setLoadOnlyPartner={setLoadOnlyPartner} setLoadOpen={setLoadOpen} setLoadQuery={setLoadQuery} setLoadTab={setLoadTab} setOrderPickOpen={setOrderPickOpen} setPoHistoryOpen={setPoHistoryOpen} setSlipLoadOpen={setSlipLoadOpen} slipLoadOpen={slipLoadOpen} />

      <TradeCalcModals adjDraft={adjDraft} adjFolded={adjFolded} adjOpen={adjOpen} applyAmountAdjust={applyAmountAdjust} costs={costs} date={date} error={error} itemById={itemById} lines={lines} mode={mode} profitOpen={profitOpen} profitRows={profitRows} profitTotals={profitTotals} setAdjDraft={setAdjDraft} setAdjFolded={setAdjFolded} setAdjOpen={setAdjOpen} setProfitOpen={setProfitOpen} setStockOpen={setStockOpen} setVerifyResult={setVerifyResult} stockOpen={stockOpen} stockWhOf={stockWhOf} taxable={taxable} totals={totals} verifyResult={verifyResult} warehouseId={warehouseId} warehouses={warehouses} />
    </form>
  )
}

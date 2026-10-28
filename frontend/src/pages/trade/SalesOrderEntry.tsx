import { resolveSpecialPrice } from '../../features/price/specialPrice'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, Item, MyItem, Partner, Project, Warehouse } from '../../types/api'
import { openPrintWindow } from '../../utils/print'
import { loadSupplierParty, printDocuments } from '../../utils/printDocument'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import EcSlipShell, { type SlipAction } from '../../components/EcSlipShell'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import Modal from '../../components/Modal'
import { ErrTip } from '../../components/GridCode'
import { partnerCodeItems } from '../../utils/codeItems'
import { dateNo } from '../../utils/dateNo'
import { dateText } from '../../utils/dateText'
import { lineSupply, roundWon } from '../../utils/lineSupply'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { useSubmitting } from '../../utils/useSubmitting'
import { SlipHistoryModal } from '../../features/sliphistory/SlipHistoryModal'
import SourceDocSearch from '../../features/slipload/components/SourceDocSearch'

/**
 * 주문서입력 — 원본 영업관리 &gt; 주문서 &gt; <b>주문서입력</b>(2026-10-28 진행자 실측). 판매입력(TradeEntry)과 같은 큰 입력 화면이다.
 *
 * 머리: 일자-No. · 거래처 · 담당자 · 출하창고 · 거래유형 · 통화 · 프로젝트 · 납기일자 · 첨부.
 * 줄: 품목코드 · 품목명 · 규격 · 수량 · 단가 · 공급가액 · 부가세 · 적요 · 합계, 아래 합계 줄.
 * 저장은 말 없이 빈 칸으로 돌아간다(거래처는 비우고 창고는 남긴다). 머리 기억(일자 · 담당자 · 창고)은 판매입력과 같은 /me/memory.
 *
 * 저장 API 는 `/sales-orders` 그대로 — 줄 적요도 함께 보내고 다시 열면 보인다.
 * 주문서조회의 [신규(F2)] · [일자-No.] · `?edit=` · `?fromQuotes=` 가 모두 이 화면으로 온다. 창이 아니라 화면이라 Esc 로 닫히지 않는다.
 */

interface LineInput { itemId: string; quantity: string; unitPrice: string; remark: string; spec: string | null /* 줄 규격 — null = 품목 규격을 따라감, '' = 일부러 비움 */ }
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', unitPrice: '', remark: '', spec: null })
/** 원본은 빈 입력행 3줄로 뜬다. */
const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]
const num = (s: string) => Number(s) || 0
const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const MEM_KEY = 'sales-order-head'
/** 서버(SalesOrderService.delete)가 막을 때 첫 줄 — 원본 '알림' 창의 첫 줄 그대로. */
const BLOCKED_HEAD = '아래의 경우 처리가 불가능합니다.'

interface OrderLineDoc { itemId: number; itemCode?: string; itemName: string; spec?: string | null; unit: string; quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number; remark?: string | null }
interface OrderDoc {
  id: number; orderNo: string; partnerId: number; partnerName: string
  orderDate: string; dueDate: string | null
  warehouseId?: number | null; projectId?: number | null; employeeId?: number | null; employeeName: string | null
  supplyAmount: number; vatAmount: number; totalAmount: number; remark: string | null; lines: OrderLineDoc[]
}
/** [견적] 창이 쓰는 견적서(`GET /quotations` 응답 중 쓰는 것만). */
interface QuoteLite {
  id: number; quoteNo: string; quoteDate: string; validUntil: string | null
  partnerId: number; partnerName: string; warehouseId: number | null; employeeId: number | null; employeeName: string | null
  status: string; statusName: string; totalAmount: number; convertedOrderId: number | null
  lines: { itemId: number; itemName: string; spec: string | null; quantity: number; unitPrice: number; remark?: string | null }[]
}
/**
 * 견적서검색창 알약 — 원본 '전체 · 결재중 · 미확인 · 확인 · 진행중 · 완료'(2026-10-28 루프 26 실측).
 * 결재는 우리에게 그 경로가 없어 늘 비어 있다(견적서조회 QuotationPage 와 같은 잣대).
 */
type QuoteTab = 'ALL' | 'APPROVAL' | 'UNCONFIRMED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'
const QUOTE_TABS: [QuoteTab, string][] = [['ALL', '전체'], ['APPROVAL', '결재중'], ['UNCONFIRMED', '미확인'], ['CONFIRMED', '확인'], ['IN_PROGRESS', '진행중'], ['COMPLETED', '완료']]
const QUOTE_TAB_MATCH: Record<QuoteTab, (s: string) => boolean> = {
  ALL: () => true, APPROVAL: () => false, UNCONFIRMED: (s) => s === 'UNCONFIRMED',
  CONFIRMED: (s) => s === 'IN_PROGRESS' || s === 'COMPLETED', IN_PROGRESS: (s) => s === 'IN_PROGRESS', COMPLETED: (s) => s === 'COMPLETED',
}
interface GeneratedRow { itemCode: string; itemName: string; spec: string | null; quantity: number; remaining: number; slipType: string | null; slipDate: string | null; slipNo: string | null }

export default function SalesOrderEntry() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const editParam = params.get('edit')
  const quotesParam = params.get('fromQuotes')
  const { companyCode, user } = useAuth()

  // ── 마스터 ─────────────────────────────────────────────
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [myItems, setMyItems] = useState<MyItem[]>([])
  const [myItemsOpen, setMyItemsOpen] = useState(false)

  // ── 머리 ──────────────────────────────────────────────
  const [date, setDate] = useState(today())
  const [partnerId, setPartnerId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [taxable, setTaxable] = useState(true)
  const [projectId, setProjectId] = useState('')
  /* 원본 주문서입력은 납기일자가 오늘로 차서 열린다(2026-10-14 실측). */
  const [dueDate, setDueDate] = useState(today())
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState<LineInput[]>(emptyLines)
  /** 수정 중인 주문. 있으면 저장이 POST 가 아니라 PUT 이다(일자는 잠긴다 — 번호가 일자에 묶여 있다). */
  const [editing, setEditing] = useState<{ id: number; orderNo: string; orderDate: string } | null>(null)
  /** 견적서조회 [다른전표생성] › 주문서 › 1장라인별로 채운 화면이면 그 견적들 — 저장하면 주문서가 그 견적들에 걸린다. */
  const [fromQuotes, setFromQuotes] = useState<number[] | null>(null)
  /** 툴바 [견적] 창(원본 '견적서검색창(조회)') — 담고 나면 툴바에서 견적 · 전표 바코드 · 전표불러오기를 감춘다(원본 실측). */
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quoteRows, setQuoteRows] = useState<QuoteLite[] | null>(null)
  const [quoteTab, setQuoteTab] = useState<QuoteTab>('ALL')
  const [quoteQuery, setQuoteQuery] = useState('')
  const [quotePicked, setQuotePicked] = useState<Record<number, boolean>>({})
  const [quoteByLine, setQuoteByLine] = useState(false)
  const [quoteLinePicked, setQuoteLinePicked] = useState<Record<string, boolean>>({})
  const [quoteLoaded, setQuoteLoaded] = useState(false)
  /** 빈 [출하창고] — 원본은 안내 없이 그 칸만 빨갛게 두르고 저장하지 않는다(2026-10-13 실측). */
  const [whMissing, setWhMissing] = useState(false)
  /** 품목은 골랐는데 수량이 빈 줄 — 그 [수량] 칸 위에 '유효키항목 필수입력' 말풍선(판매입력과 같다). */
  const [qtyErr, setQtyErr] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(''), 3000) }

  // ── 툴바 ──────────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [barcodeOpen, setBarcodeOpen] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [verifyResult, setVerifyResult] = useState<string[] | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  /** 지우기가 막힌 줄(구분 · 해당 메뉴 · 사유) — 원본 '알림' 창의 표(주문출고처리된 내역 등). */
  const [blocked, setBlocked] = useState<string[][] | null>(null)
  const [generated, setGenerated] = useState<GeneratedRow[] | null>(null)
  const [loaded, setLoaded] = useState<{ rows: { code: string; name: string; spec: string | null; qty: number; slip: string; slipNo: string }[] } | null>(null)

  const rememberedEmpRef = useRef('')
  const formRef = useRef<HTMLFormElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(gridRef, '주문서입력 명세 그리드', [lines.length])
  const afterSaveRef = useRef<'print' | null>(null)
  const printWinRef = useRef<Window | null>(null)

  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const codeItems = useMemo(
    () => items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.spec, stopped: !i.active })),
    [items],
  )

  // ── 로딩 ──────────────────────────────────────────────
  async function readHd(): Promise<{ date?: string; employeeId?: string; warehouseId?: string }> {
    try {
      const r = await api.get<{ value: string | null }>(`/me/memory/${MEM_KEY}`)
      return r.data.value ? JSON.parse(r.data.value) : {}
    } catch {
      try {
        const k = `${companyCode ?? '-'}:${user?.username ?? '-'}`
        return { ...JSON.parse(localStorage.getItem(`ec-order-hd:${k}`) ?? '{}'), warehouseId: localStorage.getItem(`ec-order-wh:${k}`) ?? undefined }
      } catch { return {} }
    }
  }
  async function loadMyItems() {
    try { setMyItems((await api.get<MyItem[]>('/my-items')).data) } catch { setMyItems([]) }
  }

  useEffect(() => {
    api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => {})
    void loadMyItems()
    void (async () => {
      const [p, w, i] = await Promise.all([api.get<Partner[]>('/partners'), api.get<Warehouse[]>('/warehouses'), api.get<Item[]>('/items')])
      setPartners(p.data); setWarehouses(w.data); setItems(i.data)
      if (editParam || quotesParam) return
      /* 원본은 새 전표를 열면 마지막으로 쓴 머리(일자 · 담당자 · 창고)를 채운다. */
      const hd = await readHd()
      rememberedEmpRef.current = hd.employeeId ?? ''
      const guide = (x: Warehouse) => x.code === '00000' || (x.name ?? '').startsWith('창고/공장/외주공장 등록')
      const first = w.data.find((x) => x.active && !guide(x))
      const start = w.data.find((x) => String(x.id) === (hd.warehouseId ?? '') && x.active) ?? first
      setWarehouseId((prev) => prev || (start ? String(start.id) : ''))
      if (hd.date && /^\d{4}-\d{2}-\d{2}$/.test(hd.date)) setDate(hd.date)
      if (hd.employeeId) setEmployeeId((prev) => prev || hd.employeeId!)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** `?edit=<id>` — 주문 하나를 받아 펼친다(기간 밖의 주문일 수 있어 목록에서 찾지 않는다). */
  useEffect(() => {
    if (!editParam) return
    api.get<OrderDoc>(`/sales-orders/${editParam}`)
      .then((r) => openOrder(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam])

  function openOrder(o: OrderDoc) {
    setError(''); setWhMissing(false); setQtyErr(null); setFromQuotes(null); setQuoteLoaded(false)
    setEditing({ id: o.id, orderNo: o.orderNo, orderDate: o.orderDate })
    setDate(o.orderDate); setDueDate(o.dueDate ?? '')
    setPartnerId(String(o.partnerId))
    setTaxable(o.vatAmount > 0 || o.supplyAmount === 0); setRemark(o.remark ?? '')
    setWarehouseId(o.warehouseId ? String(o.warehouseId) : '')
    setProjectId(o.projectId ? String(o.projectId) : '')
    setEmployeeId(o.employeeId ? String(o.employeeId) : '')
    setLines([...o.lines.map((l) => ({ itemId: String(l.itemId), quantity: String(l.quantity), unitPrice: String(l.unitPrice), remark: l.remark ?? '', spec: l.spec ?? null })), emptyLine()])
  }

  /**
   * `?fromQuotes=<id,id>` — 견적서조회 [다른전표생성] › 주문서 › 1장라인별. 일자 · 납기일자 오늘, 거래처 · 줄은 견적 그대로,
   * 출하창고 · 프로젝트는 견적에 있으면 그것으로 채워 뜬다(2026-10-14 실측). 고른 견적 여럿은 한 장에 줄을 이어 붙인다.
   */
  useEffect(() => {
    if (!quotesParam) return
    const ids = quotesParam.split(',').map(Number).filter((n) => n > 0)
    api.get<{ id: number; partnerId: number; warehouseId: number | null; projectId: number | null; vatAmount: number; convertedOrderId: number | null
      lines: { itemId: number; quantity: number; unitPrice: number; remark?: string | null; spec?: string | null }[] }[]>('/quotations')
      .then((r) => {
        const qs = ids.map((id) => r.data.find((q) => q.id === id)).filter((q) => q != null)
        if (qs.length === 0) return
        const first = qs[0]
        setEditing(null)
        setPartnerId(String(first.partnerId)); setDate(today()); setDueDate(today())
        setTaxable(first.vatAmount > 0)
        setWarehouseId(first.warehouseId ? String(first.warehouseId) : '')
        setProjectId(first.projectId ? String(first.projectId) : '')
        /* 원본(2026-10-21 실측): 이미 주문서를 만든 견적을 다시 하면 막지 않고 잔량 0 이라 줄이 빈 창이 뜬다. */
        setLines([...qs.filter((q) => q.convertedOrderId == null).flatMap((q) => q.lines.map((l) => ({ itemId: String(l.itemId), quantity: String(l.quantity), unitPrice: String(l.unitPrice), remark: l.remark ?? '', spec: l.spec ?? null }))), emptyLine()])
        setFromQuotes(qs.map((q) => q.id))
      })
      .catch((err) => setError(extractErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotesParam])

  // ── [견적] 불러오기 (원본 '견적서검색창(조회)') ─────────
  /**
   * 원본 주문서입력 [견적](2026-10-28 루프 26 실측): 주문 일자보다 늦은 견적도 보인다 — <b>날짜로 거르지 않는다</b>
   * (판매입력 [주문] 은 늦은 주문을 뺀다 — 불러오기마다 다르다). 취소한 견적은 주문서로 못 바꾸므로 뺀다(서버 convertToOrder 가 막는다).
   */
  async function openQuoteLoad() {
    setQuoteOpen(true); setQuoteRows(null); setQuotePicked({}); setQuoteLinePicked({})
    setQuoteByLine(false); setQuoteTab('ALL'); setQuoteQuery('')
    try {
      const r = await api.get<QuoteLite[]>('/quotations')
      setQuoteRows(r.data.filter((q) => q.status !== 'CANCELLED')
        .sort((a, b) => b.quoteDate.localeCompare(a.quoteDate) || b.quoteNo.localeCompare(a.quoteNo)))
    } catch (err) { setQuoteRows([]); setError(extractErrorMessage(err)) }
  }
  const quoteShown = (quoteRows ?? []).filter((q) => {
    const k = quoteQuery.trim().toLowerCase()
    return !k || [q.quoteNo, dateNo(q.quoteDate, q.quoteNo), q.partnerName, q.employeeName, ...q.lines.map((l) => l.itemName)]
      .some((v) => (v ?? '').toLowerCase().includes(k))
  })
  const quoteDocsShown = quoteShown.filter((q) => QUOTE_TAB_MATCH[quoteTab](q.status))

  /**
   * [잔량적용(F8)] — 담으면 일자 그대로 · 거래처 · 담당자(견적의 것으로 덮어씀 Z20 → Z12) · <b>프로젝트 비움</b>(20250010 이 지워짐) ·
   * 창고 · 줄(잔량). 잔량은 `?fromQuotes=` 와 같은 잣대 — 이미 주문서를 만든 견적은 0 이라 줄이 없다.
   * 저장하면 `/quotations/convert` 로 그 견적들의 [생성한전표] 에 이 주문서가 걸린다.
   */
  function applyQuotePicked() {
    const lineKeys = Object.keys(quoteLinePicked).filter((k) => quoteLinePicked[k])
    const picked = quoteByLine
      ? (quoteRows ?? []).filter((q) => lineKeys.some((k) => k.startsWith(`${q.id}-`)))
      : quoteDocsShown.filter((q) => quotePicked[q.id])
    if (picked.length === 0) return flash(quoteByLine ? '담을 행을 체크하세요.' : '담을 견적을 체크하세요.')
    const partnerIds = [...new Set(picked.map((q) => q.partnerId))]
    if (partnerIds.length > 1) return flash('거래처가 다른 행은 한 전표에 담을 수 없습니다.')
    if (partnerId && String(partnerIds[0]) !== partnerId && lines.some((l) => l.itemId)) {
      return flash('지금 전표의 거래처와 다릅니다. 거래처를 비우거나 같은 거래처 행을 고르세요.')
    }
    setPartnerId(String(partnerIds[0]))
    const emp = picked.find((q) => q.employeeId != null)?.employeeId
    if (emp != null) setEmployeeId(String(emp))
    setProjectId('')
    const wh = picked.find((q) => q.warehouseId != null)?.warehouseId
    if (wh != null) { setWarehouseId(String(wh)); setWhMissing(false) }
    const added = picked.filter((q) => q.convertedOrderId == null).flatMap((q) => q.lines
      .map((l, i) => ({ l, key: `${q.id}-${i}` }))
      .filter(({ key }) => !quoteByLine || quoteLinePicked[key])
      .map(({ l }) => ({ itemId: String(l.itemId), quantity: String(l.quantity), unitPrice: String(l.unitPrice), remark: l.remark ?? '', spec: l.spec ?? null })))
    setLines((ls) => [...ls.filter((l) => l.itemId), ...added, emptyLine()])
    setFromQuotes((prev) => [...new Set([...(prev ?? []), ...picked.map((q) => q.id)])])
    setQuoteLoaded(true)
    setQuoteOpen(false)
  }
  /* 창의 [잔량적용(F8)] — 전표 틀(EcSlipShell)도 F8(저장)을 걸어 두어 capture 단계에서 먼저 받는다(판매입력 [주문] 과 같다). */
  useEffect(() => {
    if (!quoteOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F8' || e.repeat) return
      e.preventDefault(); e.stopPropagation()
      applyQuotePicked()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // ── 줄 편집 ───────────────────────────────────────────
  async function applySpecialPrice(idx: number, itemId: string, partnerOverride?: string) {
    const p = await resolveSpecialPrice('SALES', itemId, partnerOverride ?? partnerId, warehouseId)
    if (p == null) return
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, unitPrice: String(p) } : l)))
  }
  function choosePartner(v: string) {
    setPartnerId(v)
    if (!v) return
    lines.forEach((l, i) => { if (l.itemId) void applySpecialPrice(i, l.itemId, v) })
  }
  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId') next[idx] = { ...next[idx], spec: null } // 품목을 새로 고르면 규격도 품목 규격으로 다시 채운다(원본)
      if (field === 'itemId' && value) {
        const it = itemById.get(value)
        if (it && !next[idx].unitPrice) next[idx] = { ...next[idx], unitPrice: String(it.unitPrice) }
        /* 원본 주문서입력: 품목을 고르면 단가만 차고 수량은 빈칸 · 공급가 0 (2026-10-14 실측). */
        void applySpecialPrice(idx, value)
        if (idx === ls.length - 1) next.push(emptyLine())
      }
      return next
    })
  }
  function removeLine(idx: number) {
    setLines((ls) => (ls.length <= 3 ? ls.map((l, i) => (i === idx ? emptyLine() : l)) : ls.filter((_, i) => i !== idx)))
  }
  function addItemLine(itemId: string, qty = 1, price?: number) {
    const it = itemById.get(itemId)
    if (!it) return false
    setLines((ls) => {
      const at = ls.findIndex((l) => l.itemId === itemId)
      if (at >= 0) {
        const next = [...ls]
        next[at] = { ...next[at], quantity: String(num(next[at].quantity) + qty) }
        return next
      }
      const filled: LineInput = { itemId, quantity: String(qty), unitPrice: String(price ?? it.unitPrice), remark: '', spec: null }
      const blank = ls.findIndex((l) => !l.itemId)
      if (blank >= 0) return ls.map((l, i) => (i === blank ? filled : l))
      return [...ls, filled, emptyLine()]
    })
    return true
  }

  const computed = lines.map((l) => {
    const supply = lineSupply(num(l.quantity), num(l.unitPrice))
    const vat = taxable ? roundWon(supply * 0.1) : 0
    return { supply, vat, total: supply + vat }
  })
  const lineCount = lines.filter((l) => l.itemId).length
  const totals = computed.reduce<{ qty: number; supply: number; vat: number; total: number }>((a, c, i) => (lines[i].itemId
    ? { qty: a.qty + num(lines[i].quantity), supply: a.supply + c.supply, vat: a.vat + c.vat, total: a.total + c.total } : a),
  { qty: 0, supply: 0, vat: 0, total: 0 })

  // ── 툴바 동작 ─────────────────────────────────────────
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
  function verify() {
    const msgs: string[] = []
    if (!warehouseId) msgs.push('출하창고를 선택하세요.')
    if (!partnerId) msgs.push('거래처를 선택하세요.')
    lines.forEach((l, i) => {
      if (!l.itemId) return
      if (num(l.quantity) <= 0) msgs.push(`${i + 1}행: 수량이 0입니다.`)
      if (num(l.unitPrice) <= 0) msgs.push(`${i + 1}행: 단가가 0입니다.`)
    })
    if (lineCount === 0) msgs.push('품목을 1줄 이상 입력하세요.')
    setVerifyResult(msgs)
  }
  function applyMyItems() {
    if (myItems.length === 0) return flash('My품목이 비어 있습니다. 명세에서 [★]로 담아 두세요.')
    setLines((ls) => [...ls.filter((l) => l.itemId),
      ...myItems.map((m) => ({ itemId: String(m.itemId), quantity: String(m.defaultQty), unitPrice: String(m.unitPrice), remark: '', spec: null })), emptyLine()])
    setMyItemsOpen(false)
    flash(`My품목 ${myItems.length}건을 명세에 담았습니다.`)
  }
  async function toggleMyItem(itemId: string, qty: number) {
    const id = Number(itemId)
    try {
      if (myItems.some((m) => m.itemId === id)) { await api.delete(`/my-items/${id}`); flash('My품목에서 뺐습니다.') }
      else { await api.post('/my-items', { itemId: id, defaultQty: Math.max(1, Math.round(qty) || 1) }); flash('My품목에 담았습니다.') }
      await loadMyItems()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  async function openGenerated() {
    if (!editing) return
    try { setGenerated((await api.get<GeneratedRow[]>(`/sales-orders/${editing.id}/generated`)).data) }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  /** [불러온 전표] — 줄마다 이 주문서를 만든 견적서(견적 → 주문은 견적의 convertedOrderId 로 걸려 있다). */
  async function openLoaded() {
    if (!editing) return
    try {
      const qs = (await api.get<{ quoteNo: string; quoteDate: string; convertedOrderId: number | null; lines: { itemId: number }[] }[]>('/quotations')).data
        .filter((q) => q.convertedOrderId === editing.id)
      setLoaded({
        rows: lines.filter((l) => l.itemId).map((l) => {
          const it = itemById.get(l.itemId)
          const q = qs.find((x) => x.lines.some((ql) => String(ql.itemId) === l.itemId))
          return { code: it?.code ?? '', name: it?.name ?? '', spec: it?.spec ?? null, qty: num(l.quantity), slip: q ? '견적서' : '', slipNo: q ? dateNo(q.quoteDate, q.quoteNo) : '' }
        }),
      })
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  // ── 저장 ──────────────────────────────────────────────
  function reset(keepHeader = false) {
    setLines(emptyLines()); setRemark(''); setQtyErr(null); setError(''); setWhMissing(false); setQuoteLoaded(false)
    setDueDate(today())
    if (!keepHeader) { setPartnerId(''); setProjectId(''); setEmployeeId(rememberedEmpRef.current) }
  }

  async function printSaved(o: OrderDoc, win: Window | null) {
    const p = partners.find((x) => x.id === o.partnerId)
    const company = await loadSupplierParty()
    await printDocuments([{
      title: '주 문 서',
      docNo: dateNo(o.orderDate, o.orderNo),
      docDate: o.orderDate,
      supplier: company ?? { label: '공급자', name: '(회사정보 미등록)' },
      customer: { label: '수신', name: o.partnerName, bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem, tel: p?.phone, address: p?.address },
      extra: [{ label: '납기일자', value: dateText(o.dueDate) }, { label: '담당자', value: o.employeeName }],
      remark: o.remark,
      lines: o.lines.map((l) => ({ itemCode: l.itemCode, itemName: l.itemName, spec: l.spec, unit: l.unit,
        quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount })),
    }], win)
  }
  function saveAndPrint() {
    if (submitting.isBusy()) return   // 저장 중에 인쇄창만 하나 더 열리지 않게
    printWinRef.current = openPrintWindow()
    if (!printWinRef.current) return
    afterSaveRef.current = 'print'
    formRef.current?.requestSubmit()
  }

  /** 저장 요청이 도는 동안 두 번째 저장을 막는다(utils/useSubmitting). */
  const submitting = useSubmitting()
  async function submit(e: FormEvent) {
    try { await submitInner(e) } finally {
      if (printWinRef.current) { printWinRef.current.close(); printWinRef.current = null; afterSaveRef.current = null }
    }
  }
  async function submitInner(e: FormEvent) {
    e.preventDefault()
    setError(''); setQtyErr(null)
    const kept = lines.filter((l) => l.itemId)
    if (kept.length === 0) {
      void ecAlert(`아래의 경우 처리가 불가능합니다.
자세한 내용은 아래의 사항을 참고하시기 바랍니다.
아래 사항을 수정 후 다시 진행하시기 바랍니다.

주문서입력 - 그리드(표)에 최소 1줄 이상 입력되어야 합니다.`)
      return
    }
    const noQty = lines.findIndex((l) => l.itemId && num(l.quantity) <= 0)
    if (noQty >= 0) { setQtyErr(noQty); return }
    if (!partnerId) return setError('거래처를 선택하세요.')
    const noPrice = kept.find((l) => num(l.unitPrice) <= 0)
    if (noPrice) return setError('단가를 입력하세요.')
    if (!warehouseId) { setWhMissing(true); return }
    const body = {
      partnerId: Number(partnerId), dueDate: dueDate || undefined,
      warehouseId: Number(warehouseId),
      projectId: projectId ? Number(projectId) : undefined,
      employeeId: employeeId ? Number(employeeId) : undefined,
      taxable, remark: remark || undefined,
      lines: kept.map((l) => ({ itemId: Number(l.itemId), quantity: num(l.quantity), unitPrice: num(l.unitPrice), remark: l.remark || undefined, spec: l.spec ?? undefined })),
    }
    try {
      let saved: OrderDoc
      if (editing) {
        saved = (await api.put<OrderDoc>(`/sales-orders/${editing.id}`, body)).data
      } else if (fromQuotes) {
        /* 원본: 견적으로 채운 창의 [저장(F8)] — 말 없이 닫히고 견적의 [생성한전표] 에 이 주문서가 걸린다(2026-10-14 실측). */
        saved = (await api.post<OrderDoc>('/quotations/convert', { quotationIds: fromQuotes, order: { ...body, orderDate: date } })).data
      } else {
        saved = (await api.post<OrderDoc>('/sales-orders', { ...body, orderDate: date })).data
      }
      if (!editing) {
        rememberedEmpRef.current = employeeId
        api.put(`/me/memory/${MEM_KEY}`, { value: JSON.stringify({ date, employeeId, warehouseId }) }).catch(() => {
          try {
            const k = `${companyCode ?? '-'}:${user?.username ?? '-'}`
            localStorage.setItem(`ec-order-wh:${k}`, warehouseId); localStorage.setItem(`ec-order-hd:${k}`, JSON.stringify({ date, employeeId }))
          } catch { /* 무시 */ }
        })
      }
      if (afterSaveRef.current === 'print') {
        const win = printWinRef.current
        printWinRef.current = null; afterSaveRef.current = null
        if (saved?.lines) void printSaved(saved, win)
        else win?.close()
      }
      if (editing) {
        /* 수정은 조회에서 들어온 길이다 — 저장하면 말 없이 목록으로 돌아가 새 금액을 본다(원본은 창이 닫히고 목록이 다시 읽힌다). */
        navigate('/sales/orders')
        return
      }
      /* 원본 주문서입력 [저장(F8)] — 말 없이 빈 칸으로 돌아간다. 거래처는 비우고 창고는 남긴다. 번호는 주문서조회에서 본다. */
      setFromQuotes(null)
      if (quotesParam) setParams({}, { replace: true })
      reset(true)
      setPartnerId('')
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function removeEditing() {
    if (!editing) return
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 주문서'))) return
    try { await api.delete(`/sales-orders/${editing.id}`); navigate('/sales/orders') }
    catch (err) {
      const [head, ...rest] = extractErrorMessage(err).split('\n')
      if (head === BLOCKED_HEAD) setBlocked(rest.map((l) => l.split(' · ')))
      else void ecAlert([head, ...rest].join('\n'))
    }
  }
  /** 수정 중 [복사] — 같은 내용이 새 주문서가 된다: 일자 · 납기일자 오늘, 번호는 저장할 때 새로 받는다(2026-10-13 실측). */
  function copyEditing() {
    setEditing(null); setDate(today()); setDueDate(today()); setWhMissing(false); setError('')
    setParams({}, { replace: true })
  }
  /** 리스트로 — 품목을 넣은 채면 원본 알림('작성한 내용이 저장되지 않았습니다. 페이지를 벗어나겠습니까?')을 먼저 띄운다. */
  async function toList() {
    if (!editing && lines.some((l) => l.itemId) && !(await ecConfirm('작성한 내용이 저장되지 않았습니다. 페이지를 벗어나겠습니까?'))) return
    navigate('/sales/orders')
  }

  const actions: SlipAction[] = editing ? [
    { label: '수정저장(F8)', primary: true, submit: true },
    { label: '저장/전표(F7)', onClick: saveAndPrint },
    { label: '복사', onClick: copyEditing },
    { label: '삭제', onClick: () => void removeEditing() },
    { label: '리스트', onClick: () => void toList() },
    { label: 'H', onClick: () => setHistoryOpen(true) },
  ] : [
    { label: '저장(F8)', primary: true, submit: true },
    { label: '저장/전표(F7)', onClick: saveAndPrint },
    { label: '다시 작성', onClick: () => reset(false) },
    { label: '리스트', onClick: () => void toList() },
    { label: '웹자료올리기', disabled: true, disabledReason: '파일 첨부는 [전자결재·드라이브]에서 씁니다.' },
  ]
  const todo = (why: string) => ({ disabled: true, title: why })

  return (
    <form ref={formRef} onSubmit={submitting.wrap(submit)}>
      <EcSlipShell
        title={editing ? '주문서입력(수정)' : '주문서입력'}
        formTabs={[{ id: 'main', label: '기본(수정불가)' }]}
        activeFormTab="main"
        onAddTab={() => flash('탭 추가는 [Self-Customizing > 입력양식]에서 설정합니다.')}
        options={[
          { label: '입력값 초기화', onClick: () => reset(false) },
        ]}
        actions={actions}
        busy={submitting.busy}
        help={
          <ul className="pl-[16px] m-0">
            <li>이카운트 <b>주문서입력</b> 구조를 따릅니다 — 헤더 항목 폼 · 명세 그리드 · 하단 버튼줄.</li>
            <li><b>일자 · 납기일자</b>는 연/월/일 세 칸입니다. 일(日) 칸만 고쳐 치면 되고, 📅로 달력을 엽니다.</li>
            <li>저장하면 말 없이 빈 칸으로 돌아갑니다(거래처는 비우고 출하창고는 남깁니다). 번호는 [리스트](주문서조회)에서 봅니다.</li>
            <li>흐리게 보이는 버튼은 원본에 있으나 아직 연결되지 않은 기능입니다. 마우스를 올리면 사유가 나옵니다.</li>
          </ul>
        }
      >
        {/* ── 헤더 항목 폼 ─────────────────────────────────── */}
        <ul className="ec-form [&>li>.title]:basis-[120px]">
          <li>
            <div className="title">일자-No.</div>
            <div className="form flex items-center gap-[6px]">
              {/* 주문수정에서는 원본도 일자가 잠긴다 — 번호가 일자에 묶여 있다. */}
              <EcDateField value={date} onChange={setDate} disabled={editing != null} />
              {editing && <span className="text-ec-label">{dateNo(editing.orderDate, editing.orderNo)}</span>}
            </div>
          </li>
          <li>
            <div className="title">거래처<span className="req">*</span></div>
            <div className="form">
              <CodePickerField label="거래처" hideLabel pair value={partnerId} onChange={choosePartner} items={partnerCodeItems(customers, true)} />
            </div>
          </li>
          <li>
            <div className="title">담당자</div>
            <div className="form">
              <CodePickerField label="담당자" hideLabel pair value={employeeId} onChange={setEmployeeId}
                               items={employees.map((em) => ({ value: String(em.id), code: em.code, name: em.name, sub: em.department }))} />
            </div>
          </li>
          <li>
            <div className="title">출하창고<span className="req">*</span></div>
            <div className="form">
              <div className={`inline-block${whMissing ? ' rounded-ec outline outline-1 outline-ec-danger' : ''}`} data-invalid={whMissing || undefined}>
                <CodePickerField label="출하창고" hideLabel pair value={warehouseId} onChange={(v) => { setWarehouseId(v); if (v) setWhMissing(false) }}
                                 items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location, stopped: !w.active }))} />
              </div>
            </div>
          </li>
          <li>
            <div className="title">거래유형</div>
            <div className="form">
              <select className="ec-input w-[170px]" value={taxable ? '11' : '12'} onChange={(e) => setTaxable(e.target.value === '11')}>
                <option value="11">부가세율 적용</option>
                <option value="12">부가세율 미적용</option>
              </select>
            </div>
          </li>
          <li>
            <div className="title">통화</div>
            <div className="form">
              {/* 외자 주문은 환율을 받을 자리가 서버에 없다(요청에 currencyCode 만 있다) — 내자만 둔다. */}
              <select className="ec-input w-[80px]" value="D" onChange={() => {}} aria-label="통화" title="외자 주문서는 아직 없습니다."><option value="D">내자</option></select>
            </div>
          </li>
          <li>
            <div className="title">프로젝트</div>
            <div className="form">
              <CodePickerField label="프로젝트" hideLabel pair value={projectId} onChange={setProjectId}
                               items={projects.filter((pj) => pj.active !== false || String(pj.id) === projectId).map((pj) => ({ value: String(pj.id), code: pj.code, name: pj.name }))} />
            </div>
          </li>
          <li>
            <div className="title">납기일자</div>
            <div className="form"><EcDateField value={dueDate} onChange={setDueDate} /></div>
          </li>
          <li>
            <div className="title">첨부</div>
            <div className="form"><button type="button" className="ec-btn ec-btn-sm" {...todo('파일 첨부는 [전자결재·드라이브]에서 씁니다.')}>첨부</button></div>
          </li>
          <li className="wide">
            <div className="title">적요</div>
            <div className="form"><input className="ec-input flex-1" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="전표 적요" /></div>
          </li>
        </ul>

        {/* ── 명세 탭 + 툴바 ───────────────────────────────── */}
        <ul className="ec-tabs mt-[10px]"><li className="ec-tab active">주문</li></ul>
        <div className="ec-toolbar">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFindOpen((v) => !v)}>찾기(F3)</button>
          {findOpen && <input className="ec-input w-[130px] h-[23px]" autoFocus value={findText} placeholder="품목명·적요" onChange={(e) => setFindText(e.target.value)} />}
          <button type="button" className="ec-btn ec-btn-sm" onClick={sortLines}>정렬</button>
          <button type="button" className="ec-btn ec-btn-sm" {...todo('거래처별 지난 주문 보기는 아직 없습니다 — 주문서조회에서 거래처 조건으로 봅니다.')}>거래내역보기(주문)</button>
          <span className="relative inline-flex">
            <button type="button" className="ec-btn ec-btn-sm" onClick={applyMyItems}>My품목{myItems.length > 0 ? ` (${myItems.length})` : ''}</button>
            <button type="button" className="ec-btn ec-btn-sm ec-btn-arrow" aria-label="My품목 목록" onClick={() => setMyItemsOpen((v) => !v)}>▾</button>
            {myItemsOpen && (
              <div className="ec-menu absolute top-full left-0 z-30 mt-[2px] min-w-[280px] p-[6px]">
                {myItems.length === 0 ? (
                  <div className="py-[8px] px-[6px] text-[12px] text-ec-hint">비어 있습니다. 명세에서 품목 줄의 [★]를 눌러 담아 두세요.</div>
                ) : myItems.map((m) => (
                  <div key={m.id} className="flex items-center gap-[6px] py-[3px] px-[4px] text-[12px]">
                    <button type="button" className="ec-btn ec-btn-sm flex-1 justify-start"
                            onClick={() => { addItemLine(String(m.itemId), m.defaultQty, m.unitPrice); setMyItemsOpen(false) }}>
                      {m.itemCode} {m.itemName} · {m.defaultQty}
                    </button>
                    <button type="button" className="ec-btn ec-btn-sm" title="My품목에서 빼기" onClick={() => void toggleMyItem(String(m.itemId), m.defaultQty)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </span>
          {!quoteLoaded && <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openQuoteLoad()}>견적</button>}
          <button type="button" className="ec-btn ec-btn-sm" {...todo('주문서에는 할인 금액조정이 없습니다.')}>할인</button>
          <button type="button" className="ec-btn ec-btn-sm" {...todo('주문서입력에서 재고를 불러오는 기능은 아직 없습니다.')}>재고불러오기</button>
          {!quoteLoaded && <button type="button" className="ec-btn ec-btn-sm" disabled={!editing} title={editing ? undefined : '저장한 주문서를 열었을 때만 쓸 수 있습니다.'} onClick={() => void openLoaded()}>불러온전표</button>}
          <button type="button" className="ec-btn ec-btn-sm" disabled={!editing} title={editing ? undefined : '저장한 주문서를 열었을 때만 쓸 수 있습니다.'} onClick={() => void openGenerated()}>생성한전표</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setBarcodeOpen((v) => !v)}>바코드</button>
          {barcodeOpen && (
            <input className="ec-input w-[170px] h-[23px]" autoFocus value={barcode} placeholder="바코드/품목코드 후 Enter"
                   onChange={(e) => setBarcode(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanBarcode() } }} />
          )}
          {!quoteLoaded && <button type="button" className="ec-btn ec-btn-sm" {...todo('전표 단위 바코드 출력은 아직 없습니다.')}>전표 바코드</button>}
          <button type="button" className="ec-btn ec-btn-sm" onClick={verify}>검증</button>
          <button type="button" className="ec-btn ec-btn-sm" {...todo('주문서입력의 이익계산은 아직 없습니다 — 판매입력에서 합니다.')}>이익계산</button>
          {!quoteLoaded && <button type="button" className="ec-btn ec-btn-sm" {...todo('다른 전표를 복사해 오는 기능은 아직 없습니다.')}>전표불러오기</button>}
        </div>

        {notice && <div className="ec-alert ec-alert-info my-[4px] mx-0">{notice}</div>}
        {verifyResult && (
          <div className={`ec-alert my-[4px] mx-0 ${verifyResult.length ? 'ec-alert-danger' : 'ec-alert-info'}`}>
            {verifyResult.length === 0 ? '문제가 없습니다.' : verifyResult.map((m, i) => <div key={i}>{m}</div>)}
            <button type="button" className="ec-btn ec-btn-sm mt-[4px]" onClick={() => setVerifyResult(null)}>닫기</button>
          </div>
        )}

        {/* ── 명세 그리드 ──────────────────────────────────── */}
        <div ref={gridRef} className="overflow-x-auto">
          <table className="ec-grid-input no-ec table-fixed">
            <colgroup>
              <col className="w-[26px]" /><col className="w-[26px]" /><col className="w-[100px]" /><col className="w-[200px]" /><col className="w-[110px]" />
              <col className="w-[78px]" /><col className="w-[96px]" /><col className="w-[110px]" /><col className="w-[96px]" /><col className="w-[130px]" />
              <col className="w-[100px]" /><col className="w-[30px]" />
            </colgroup>
            <thead>
              <tr>
                <th /><th title="My품목 담기/빼기">★</th>
                <th className="text-left">품목코드</th><th className="text-left">품목명</th><th className="text-left">규격</th>
                <th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th>
                <th className="text-right">부가세</th><th className="text-left">적요</th><th className="text-right">합계</th><th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const it = itemById.get(l.itemId)
                const needle = findText.trim().toLowerCase()
                const hit = !needle || `${it?.name ?? ''} ${it?.code ?? ''} ${l.remark}`.toLowerCase().includes(needle)
                const mine = myItems.some((m) => String(m.itemId) === l.itemId)
                return (
                  <tr key={idx} data-export-skip={l.itemId ? undefined : 'true'} className={hit ? undefined : 'hidden'}>
                    <td className="text-center text-ec-hint">{idx + 1}</td>
                    <td className="text-center">
                      {l.itemId && (
                        <button type="button" className={`no-ec border-0 bg-transparent cursor-pointer p-0 text-[13px] leading-none ${mine ? 'text-ec-star' : 'text-ec-hint'}`}
                                title={mine ? 'My품목에서 빼기' : 'My품목에 담기'} onClick={() => void toggleMyItem(l.itemId, num(l.quantity))}>★</button>
                      )}
                    </td>
                    <td className="pad text-ec-label overflow-hidden whitespace-nowrap">{it?.code ?? ''}</td>
                    <td className="pad">
                      <CodePickerField label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제" value={l.itemId}
                                       onChange={(v) => updateLine(idx, 'itemId', v)} items={codeItems} />
                    </td>
                    <td><input className="cell" value={l.spec ?? it?.spec ?? ''} maxLength={200} disabled={!l.itemId} onChange={(e) => updateLine(idx, 'spec', e.target.value)} /></td>
                    <td className="relative">
                      <EcNumInput className="cell text-right" value={l.quantity}
                                  onValue={(v) => { if (qtyErr === idx) setQtyErr(null); updateLine(idx, 'quantity', v) }} />
                      {qtyErr === idx && <ErrTip msg="유효키항목 필수입력" />}
                    </td>
                    <td><EcNumInput className="cell text-right" value={l.unitPrice} onValue={(v) => updateLine(idx, 'unitPrice', v)} /></td>
                    <td className="pad text-right">{l.itemId ? won(computed[idx].supply) : ''}</td>
                    <td className="pad text-right">{l.itemId ? won(computed[idx].vat) : ''}</td>
                    <td><input className="cell" value={l.remark} disabled={!l.itemId} onChange={(e) => updateLine(idx, 'remark', e.target.value)} /></td>
                    <td className="pad text-right font-semibold text-ec-text">{l.itemId ? won(computed[idx].total) : ''}</td>
                    <td className="text-center">
                      {l.itemId && <button type="button" onClick={() => removeLine(idx)} className="no-ec border-0 bg-transparent cursor-pointer text-ec-hint">✕</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} />
                <td colSpan={3} className="pl-[6px]">합계 ({lineCount}건)</td>
                <td className="text-right">{won(totals.qty)}</td>
                <td />
                <td className="text-right">{won(totals.supply)}</td>
                <td className="text-right">{won(totals.vat)}</td>
                <td />
                <td className="text-right font-bold text-ec-blue">{won(totals.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {error && <p className="ec-alert ec-alert-danger mt-[10px]">{error}</p>}
      </EcSlipShell>

      {historyOpen && editing && (
        <SlipHistoryModal target="SALES_ORDER" id={editing.id} confirmLabel="확인"
                          head={`[${editing.orderDate.replace(/-/g, '/')} -${Number(editing.orderNo.split('-').pop()) || editing.orderNo}]`}
                          onClose={() => setHistoryOpen(false)} />
      )}

      {/* ── [견적] — 원본 '견적서검색창(조회)'(판매입력 [주문] 의 주문서검색창과 같은 부품) ── */}
      <Modal error={error} open={quoteOpen} title="견적서검색창(조회)" width={960} onClose={() => setQuoteOpen(false)}>
        {quoteRows === null ? (
          <p className="text-[12.5px] text-ec-hint m-0">불러오는 중…</p>
        ) : (
          <SourceDocSearch
            tabs={QUOTE_TABS} tab={quoteTab} onTab={setQuoteTab}
            query={quoteQuery} onQuery={setQuoteQuery}
            date2Label="유효기간" totalLabel="견적금액합계"
            docs={quoteDocsShown.map((q) => ({
              key: q.id, dateNo: dateNo(q.quoteDate, q.quoteNo), partnerName: q.partnerName, employeeName: q.employeeName ?? '',
              itemSummary: `${q.lines[0]?.itemName ?? ''}${q.lines[0]?.spec ? ` [${q.lines[0].spec}]` : ''}${q.lines.length > 1 ? ` 외 ${q.lines.length - 1}건` : ''}`,
              date2: dateText(q.validUntil ?? '') || '', total: q.totalAmount, statusLabel: q.statusName, created: q.convertedOrderId != null,
            }))}
            picked={quotePicked} onPicked={setQuotePicked}
            createdTitle="생성한 전표는 견적서조회의 [생성한전표] 에서 봅니다."
            byLine={quoteByLine} onToggleByLine={() => setQuoteByLine((v) => !v)}
            lineView={(
              <div className="max-h-[360px] overflow-y-auto border border-ec-line border-solid">
                <table className="w-full text-left">
                  <thead><tr>
                    <th className="w-[30px]" /><th>견적No.</th><th className="w-[90px]">일자</th><th>거래처</th><th>품목</th>
                    <th className="w-[70px] text-right">잔량</th><th className="w-[80px] text-right">단가</th><th className="w-[70px]">상태</th>
                  </tr></thead>
                  <tbody>
                    {quoteShown.flatMap((q) => q.lines.map((l, i) => {
                      const key = `${q.id}-${i}`
                      return (
                        <tr key={key} className="cursor-pointer" onClick={() => setQuoteLinePicked((p) => ({ ...p, [key]: !p[key] }))}>
                          <td className="text-center"><input type="checkbox" readOnly checked={!!quoteLinePicked[key]} /></td>
                          <td>{dateNo(q.quoteDate, q.quoteNo)}</td>
                          <td>{dateText(q.quoteDate)}</td>
                          <td>{q.partnerName}</td>
                          <td>{l.itemName}</td>
                          <td className="text-right font-bold">{won(q.convertedOrderId == null ? l.quantity : 0)}</td>
                          <td className="text-right">{won(l.unitPrice)}</td>
                          <td className="text-ec-hint">{q.statusName}</td>
                        </tr>
                      )
                    }))}
                  </tbody>
                </table>
              </div>
            )}
            onApply={applyQuotePicked}
            applyAllTitle="견적 수량 전체를 담는 [전체적용] 은 원본 동작을 아직 재지 않았습니다."
            onNew={() => window.open('/sales/quotation-entry', '_blank')}
            onList={() => window.open('/sales/quotations', '_blank')}
            onClose={() => setQuoteOpen(false)}
          />
        )}
      </Modal>

      <Modal open={blocked != null} title="알림" width={630} onClose={() => setBlocked(null)}>{blocked && (
        <div>
          <p className="m-0 leading-[18px]">{BLOCKED_HEAD}<br />자세한 내용은 아래의 사항을 참고하시기 바랍니다.<br />아래 사항을 수정 후 다시 진행하시기 바랍니다.</p>
          <table className="w-full text-left mt-[9px]">
            <thead><tr><th>구분</th><th>해당 메뉴</th><th>사유</th></tr></thead>
            <tbody>{blocked.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1] ?? ''}</td><td>{r[2] ?? ''}</td></tr>)}</tbody>
          </table>
          <div className="mt-[9px]"><button type="button" className="ec-btn" onClick={() => setBlocked(null)}>닫기</button></div>
        </div>
      )}</Modal>

      <Modal open={generated != null} title="생성한 전표" width={760} onClose={() => setGenerated(null)}>{generated && editing && (
        <div>
          <p className="mb-[6px]">주문서조회 : {dateNo(editing.orderDate, editing.orderNo)}</p>
          <table className="w-full text-left">
            <thead><tr>
              <th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th className="text-right">잔량</th>
              <th>생성한 전표</th><th>생성한 전표일자-No.</th>
            </tr></thead>
            <tbody>
              {generated.map((r, i) => (
                <tr key={i}>
                  <td>{r.itemCode}</td><td>{r.itemName}</td><td>{r.spec ?? ''}</td>
                  <td className="text-right">{won(r.quantity)}</td><td className="text-right">{won(r.remaining)}</td>
                  <td>{r.slipType ?? ''}</td><td>{r.slipDate && r.slipNo ? dateNo(r.slipDate, r.slipNo) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[8px]"><button type="button" className="ec-btn" onClick={() => setGenerated(null)}>닫기</button></div>
        </div>
      )}</Modal>

      <Modal open={loaded != null} title="불러온 전표" width={760} onClose={() => setLoaded(null)}>{loaded && editing && (
        <div>
          <p className="mb-[6px]">주문서 : {dateNo(editing.orderDate, editing.orderNo)}</p>
          <table className="w-full text-left">
            <thead><tr>
              <th className="w-[34px]"></th><th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th>
              <th>불러온 전표</th><th>불러온 전표일자-No.</th>
            </tr></thead>
            <tbody>
              {loaded.rows.map((r, i) => (
                <tr key={i}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{r.code}</td><td>{r.name}</td><td>{r.spec ?? ''}</td><td className="text-right">{won(r.qty)}</td>
                  <td>{r.slip}</td><td>{r.slipNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[8px] flex gap-[4px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setLoaded(null)}>적용(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setLoaded(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>
    </form>
  )
}

import { resolveSpecialPrice } from '../../features/price/specialPrice'
import { useEffect, useMemo, useState, useRef} from 'react'
import EcListShell, { type OptionItem } from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import type { CustomFieldDef, Currency, EmployeeMaster, Item, Partner, PurchaseDoc, PurchaseOrder, PurchaseOrderStatus, StockRow, Warehouse } from '../../types/api'
import { partnerCodeItems } from '../../utils/codeItems'
import { lineSupply, roundWon } from '../../utils/lineSupply'
import EcNumInput from '../../components/EcNumInput'
import { dateText } from '../../utils/dateText'
import { useMyItemsPick, MyItemsNote } from '../../components/MyItemsButton'
import EcPeriodPicks, { ORDER_DOC_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { usePartnerManagers } from '../../utils/partnerManagers'
import Modal, { ModalWindow } from '../../components/Modal'
import EcIcon from '../../components/ui/EcIcon'
import TradeEntry, { type TradeEntryPrefill } from './TradeEntry'
import { openPrintWindow } from '../../utils/print'
import { purchaseSlipDocument } from '../../utils/tradeSlipDocument'
import EcSlipPrintModal, { type SlipPrintDoc } from '../../components/EcSlipPrintModal'
import { purchaseOrderSlip } from '../../utils/slipLetter'
import { ecAlert, ecConfirm, requireSelection } from '../../components/EcDialog'
import { SlipMenuHistoryModal, EMAIL_NOT_HERE, BARCODE_NOT_HERE } from '../../features/sliphistory/SlipMenuHistoryModal'
import PurchaseRequestForm from '../../features/purchaserequest/PurchaseRequestForm'
import ProductionSlipWindow from '../production/ProductionSlipWindow'
import { dateNo } from '../../utils/dateNo'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'
import { todayYmd } from '../../utils/periods'
import { fmtNumber } from '../../utils/format'

const notHere = (what: string) => () => void ecAlert(`이 기능은 이 ERP 에서 제공하지 않습니다.\n(${what})`)
/** 생성한 전표가 있으면 원본처럼 주황 꼬리표(QuotationPage GEN_TAG 와 같은 실측 — 바탕 --ec-tag-warn · 흰 글자 · 둥글기 6). */
const GEN_TAG = 'inline-block rounded-[6px] px-[1.8px] py-[0.9px] text-[12px] leading-[13.2px] bg-[var(--ec-tag-warn)] text-[var(--ec-bg-panel)] no-underline'

/**
 * 원본 발주서조회 알약(2026-10-31 loginad): 전체 · 결재중 · 미확인 · 확인 ▸ 진행중 – 완료(개수 없음).
 * 우리 발주서 단계를 원본 진행상태에 맞춘다 — 단가확정(PRICED, 발주확정 전) = 미확인, 발주확정(ORDERED) = 진행중, 입고전환 · 취소 = 완료.
 * 결재중은 우리 결재가 발주서를 안 받아 늘 비어 있다.
 * 발주요청 · 발주계획 · 단가요청은 <b>다른 전표</b>(2026-10-21 전표 가르기)라 이 화면에 안 뜬다 — 각자 조회 화면이 있다.
 */
type Progress = '미확인' | '진행중' | '완료'
const progressOf = (s: PurchaseOrderStatus): Progress => (s === 'PRICED' ? '미확인' : s === 'ORDERED' ? '진행중' : '완료')
type Tab = '전체' | '결재중' | '미확인' | '확인' | '진행중' | '완료'
const TABS: [Tab, string][] = [['전체', '전체'], ['결재중', '결재중'], ['미확인', '미확인'], ['확인', '확인 ▸'], ['진행중', '진행중'], ['완료', '완료']]
const TAB_MATCH: Record<Tab, (p: Progress) => boolean> = {
  전체: () => true, 결재중: () => false, 미확인: (p) => p === '미확인',
  확인: (p) => p !== '미확인', 진행중: (p) => p === '진행중', 완료: (p) => p === '완료',
}
const OTHER_SLIPS: PurchaseOrderStatus[] = ['REQUESTED', 'PLANNED', 'PRICE_REQUESTED']

/** GET /purchase-orders/{id}/generated 한 줄 — '생성한 전표' 창(PurchaseOrderDtos.GeneratedSlipRow). */
interface GeneratedRow {
  orderLineId: number
  itemId: number
  itemCode: string
  itemName: string
  spec: string | null
  quantity: number
  remaining: number
  unitPrice: number
  slipType: string | null
  slipDate: string | null
  slipNo: string | null
  slipId: number | null
}

/**
 * 줄 하나. <code>custom</code> 은 <b>줄 추가항목</b>(사용자정의)이다 —
 * 원본 발주서입력 격자는 회사가 추가문자·추가숫자·추가일자·추가코드로 칸을 늘린다.
 * 우리는 반대로 Self-Customizing 에서 <b>이름을 지어</b> 정의하면 그만큼 열이 생긴다.
 * 정의가 없으면 열이 하나도 안 생긴다(안 쓰는 회사의 격자는 그대로다).
 */
interface LineForm { itemId: string; quantity: string; unitPrice: string; partnerId: string; remark: string; custom: Record<string, string> }
const emptyLine = (): LineForm => ({ itemId: '', quantity: '', unitPrice: '', partnerId: '', remark: '', custom: {} })

/** '생성한 전표' [신규(F2)] 가 여는 구매입력의 처음 값 — 잔량이 남은 발주 줄만, 한 발주 줄은 한 번(전표가 여럿이면 줄이 겹쳐 온다). */
function prefillOf(o: PurchaseOrder, rows: GeneratedRow[]): TradeEntryPrefill {
  const fx = !!o.currency && o.currency !== 'KRW'
  const seen = new Set<number>()
  const lines = rows.filter((r) => {
    if (Number(r.remaining) <= 0 || seen.has(r.orderLineId)) return false
    seen.add(r.orderLineId)
    return true
  }).map((r) => ({
    /* 외화 발주서면 단가 칸은 외화단가(구매 외자 줄과 같은 꼴). */
    itemId: r.itemId, quantity: Number(r.remaining), itemName: r.itemName,
    unitPrice: Number(fx ? (o.lines.find((l) => l.id === r.orderLineId)?.foreignPrice ?? r.unitPrice) : r.unitPrice),
    sourceOrderId: o.id, sourceDocType: '발주서', sourceDocDate: o.orderDate, sourceDocNo: o.orderNo,
  }))
  return { partnerId: o.partnerId ?? null, employeeId: o.employeeId ?? null, warehouseId: o.warehouseId ?? null, projectId: o.projectId ?? null,
    currencyCode: fx ? o.currency : null, exchangeRate: fx ? (o.exchangeRate ?? null) : null, lines }
}

/** 발주서 — 구매 흐름의 시작점. 발주요청 → 발주계획 → 단가확정 → 발주확정 → 입고전환(구매전표 생성). */
/*
 * 원본 발주서는 <b>기준일자</b>를 들고 [최근30일(+1개월)] 로 열린다(사본 실측 —
 * 달 스핀박스가 06·08 셋이다). 발주는 <b>앞으로 들어올 것</b>이라 미래가 들어간다.
 */
const initP = periodOf('최근30일(+1개월)')!

/**
 * 재고 I &gt; 구매관리 &gt; 발주서 &gt; <b>발주서조회</b> — 2026-10-31 loginad 클릭 대조(5번)로 맞춘 꼴:
 * <ul>
 *   <li>머리 검색칸 · Search(F3) · Option · 도움말, 알약 전체 · 결재중 · 미확인 · 확인 ▸ 진행중 – 완료(개수 없음).</li>
 *   <li>조건 판(접힘 · Search(F3)): 기준일자 · 발주No. · 내.외자구분 · 창고 · 프로젝트 · 거래처 · 품목 · 발송여부, ⌄ 펼치면 납기일자 · 규격 · 담당자 ·
 *       거래처관리담당자 · 적요 · 참조 · 최초작성자 · 최종수정자 · 최초작성일자 · 최종작업일자 · 기타, 아래 줄 적용양식.</li>
 *   <li>표: ☑ · 일자-No. · 거래처명 · 담당자명 · 품목명[규격명] · 납기일자 · 발주금액합계 · 진행상태(완료 주황) · 생성한 전표(주황 [조회]) · 인쇄.</li>
 *   <li>하단: 신규(F2) · Email│▲ · 진행상태변경 ▲ · 보내기 ▲ · 인쇄│▲ · 바코드(품목)│▲ · 다른전표생성 ▲ · 전자결재 · 선택삭제 · Excel · 이력조회.</li>
 *   <li>[신규(F2)] · 일자-No. = 목록 위 떠 있는 '발주서입력' · '발주서수정' 창(견적서 · 주문서와 같은 ProductionSlipWindow).</li>
 * </ul>
 */
export default function PurchaseOrderPage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [keyword, setKeyword] = useState('')
  /**
   * 원본 [생성한 전표] [조회] → 목록 위 '생성한 전표' 창(2026-10-28 실측).
   * entryOpen 은 창의 [신규(F2)] 가 띄운 구매입력 창(그 발주의 잔량으로 채움).
   */
  const [generated, setGenerated] = useState<{ order: PurchaseOrder; rows: GeneratedRow[] } | null>(null)
  const [entryOpen, setEntryOpen] = useState(false)
  async function openGenerated(po: PurchaseOrder) {
    try {
      const g = { order: po, rows: (await api.get<GeneratedRow[]>(`/purchase-orders/${po.id}/generated`)).data }
      setGenerated(g)
      return g
    } catch (err) { setError(extractErrorMessage(err)); return null }
  }
  /** 일자-No. 링크 — 그 구매전표 인쇄 미리보기(원본). 창은 누른 순간에 열어야 팝업 차단을 피한다. */
  async function printPurchase(r: GeneratedRow) {
    if (r.slipId == null || !r.slipDate) return
    const win = openPrintWindow()
    if (!win) return
    try {
      const docs = (await api.get<PurchaseDoc[]>('/purchases', { params: { from: r.slipDate, to: r.slipDate } })).data
      const d = docs.find((x) => x.id === r.slipId)
      if (!d) { win.close(); return }
      void printDocuments([purchaseSlipDocument(d)], win)
    } catch (err) { win.close(); setError(extractErrorMessage(err)) }
  }
  /* 창이 떠 있을 때 F2 는 목록의 [신규(F2)](발주서입력)가 아니라 창의 [신규(F2)] — capture 단계에서 먼저 받는다. */
  useEffect(() => {
    if (!generated || entryOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F2' || e.repeat) return
      e.preventDefault(); e.stopPropagation()
      setEntryOpen(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [generated, entryOpen])
  function closeEntry(changed: boolean) {
    setEntryOpen(false)
    if (changed && generated) { void openGenerated(generated.order); load() }
  }
  const [error, setError] = useState('')
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [orderNoCond, setOrderNoCond] = useState('')
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  /*
   * 원본 [내.외자구분] · [발송여부] 알약(2026-10-31 loginad). 내자 · 외자는 통화(KRW 인지)로 가른다.
   * 우리는 발주서를 밖으로 보내지 않아 모두 미발송이다.
   */
  const [fxCond, setFxCond] = useState<'전체' | '내자' | '외자'>('전체')
  const [sentCond, setSentCond] = useState<'전체' | '미발송' | '발송'>('전체')
  /** 원본 접힌 줄(⌄) — 펼치면 납기일자부터 기타까지. */
  const [moreConds, setMoreConds] = useState(false)
  const condPickers = useCondPickers(['warehouses', 'partners', 'items'])
  /*
   * 거래처그룹1 · 품목구분 · 품목그룹1 은 원본 기본 판(2026-10-31 loginad)에 없다 — 2026-09-07 사본에서 잰 서른넷 조건 중 우리가 만든 것이라
   * 지우지 않고 접힌 줄 맨 뒤에 둔다.
   */
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [partnerGroupCond, setPartnerGroupCond] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [pmgrCond, setPmgrCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [refCond, setRefCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [editorCond, setEditorCond] = useState('')
  const [madeFrom, setMadeFrom] = useState('')
  const [madeTo, setMadeTo] = useState('')
  const [editedFrom, setEditedFrom] = useState('')
  const [editedTo, setEditedTo] = useState('')
  /** 원본 [기타] — 이 화면에서는 <b>수정일자순(정렬)</b> 하나다(실측). */
  const [byUpdated, setByUpdated] = useState(false)
  /** 품목 마스터에 붙는 [품목그룹1]. 이 화면은 /items 를 진작 통째로 받아 두고 있다. */
  const mgmt = useItemMgmt(items)
  const pgroups = usePartnerGroups()
  const pmgr = usePartnerManagers(partners)
  /**
   * [프로젝트명] 열 — 원본 기본 양식에는 없다(2026-10-31 loginad). 우리가 예전부터 보이던 열이라 지우지 않고
   * [Option] › '프로젝트명 열 보기' 로 켠다(원본은 이런 열을 양식설정으로 더한다).
   */
  const [showProject, setShowProject] = useState(false)
  const [company, setCompany] = useState<DocParty | null>(null)
  /** [신규(F2)] · [일자-No.] — 목록 위 '발주서입력' · '발주서수정' 창. key 로 창을 새로 띄운다. */
  const [form, setForm] = useState<{ order: PurchaseOrder | null; key: number } | null>(null)
  const openForm = (order: PurchaseOrder | null) => setForm({ order, key: Date.now() })
  const [historyWin, setHistoryWin] = useState(false)

  function load() {
    setError('')
    /* 고른 기간을 서버에도 보낸다. */
    const period: Record<string, string> = {}
    if (from) period.from = from
    if (to) period.to = to
    api.get<PurchaseOrder[]>('/purchase-orders', { params: period })
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  /* 기간을 바꾸면 그 기간으로 다시 받는다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  useEffect(() => {
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data.filter((p) => p.type !== 'CUSTOMER'))).catch(() => {})
    api.get<{ id: number; code: string; name: string }[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
    api.get<EmployeeMaster[]>('/sales-reps').then((r) => setEmployees(r.data)).catch(() => {})
  }, [])

  const shown = useMemo(() => rows
    .filter((r) => !OTHER_SLIPS.includes(r.status) && TAB_MATCH[tab](progressOf(r.status)))
    .filter((r) => (!from || r.orderDate >= from) && (!to || r.orderDate <= to))
    .filter((r) => !keyword || (r.partnerName ?? '').includes(keyword) || r.orderNo.includes(keyword)
      || r.lines.some((l) => (l.itemName ?? '').includes(keyword)))
    .filter((r) => !orderNoCond || r.orderNo.includes(orderNoCond))
    .filter((r) => fxCond === '전체' || ((r.currency ?? 'KRW') === 'KRW') === (fxCond === '내자'))
    .filter(() => sentCond !== '발송')
    .filter((r) => !whCond || String(r.warehouseId) === whCond)
    .filter((r) => !projCond || String(r.projectId) === projCond)
    .filter((r) => !partnerCond || String(r.partnerId) === partnerCond)
    .filter((r) => !itemCond || r.lines.some((l) => String(l.itemId) === itemCond))
    /* 줄이 여럿이면 <b>한 줄이라도 걸리면</b> 그 발주를 남긴다 — 품목 조건과 같은 규칙이다. */
    .filter((r) => !categoryCond || r.lines.some((l) => (l.itemCategoryName ?? '') === categoryCond))
    .filter((r) => mgmt.groupHits(r.lines.map((l) => l.itemId), itemGroupCond))
    .filter((r) => !partnerGroupCond || pgroups.groupOfName(r.partnerName) === partnerGroupCond)
    .filter((r) => !dueFrom || (r.dueDate ?? '') >= dueFrom)
    .filter((r) => !dueTo || ((r.dueDate ?? '') !== '' && (r.dueDate as string) <= dueTo))
    .filter((r) => !specCond || r.lines.some((l) => (l.spec ?? '') === specCond))
    .filter((r) => !empCond || (r.employeeName ?? '') === empCond)
    .filter((r) => !pmgrCond || pmgr.managerOfName(r.partnerName) === pmgrCond)
    /* 원본 [적요]는 <b>줄</b>에 붙는 메모고, [참조]는 전표 머리에 붙는다 — 다른 칸이다. */
    .filter((r) => !remarkCond || r.lines.some((l) => (l.remark ?? '').includes(remarkCond)))
    .filter((r) => !refCond || (r.remark ?? '').includes(refCond))
    .filter((r) => !authorCond || (r.createdBy ?? '') === authorCond)
    .filter((r) => !editorCond || (r.updatedBy ?? '') === editorCond)
    .filter((r) => !madeFrom || (r.createdAt ?? '').slice(0, 10) >= madeFrom)
    .filter((r) => !madeTo || ((r.createdAt ?? '') !== '' && r.createdAt!.slice(0, 10) <= madeTo))
    .filter((r) => !editedFrom || (r.updatedAt ?? '').slice(0, 10) >= editedFrom)
    .filter((r) => !editedTo || ((r.updatedAt ?? '') !== '' && r.updatedAt!.slice(0, 10) <= editedTo))
    /* 원본 [기타]의 수정일자순(정렬) — 켜면 마지막에 고친 발주가 위로 온다. */
    .sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') : 0)),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [rows, tab, keyword, from, to, orderNoCond, fxCond, sentCond, whCond, projCond, partnerCond, itemCond,
     categoryCond, itemGroupCond, mgmt.groupOptions, partnerGroupCond, pgroups.groupOptions,
     dueFrom, dueTo, specCond, empCond, pmgrCond, pmgr.options, remarkCond, refCond,
     authorCond, editorCond, madeFrom, madeTo, editedFrom, editedTo, byUpdated])

  useEffect(() => { loadSupplierParty().then(setCompany) }, [])

  /**
   * 발주서 [인쇄] — 원본은 새 창이 아니라 목록 위 '발주서' 인쇄 미리보기 창이다(2026-10-31 loginad C000077 실측).
   * 줄 [인쇄] 는 그 발주서, 하단 [인쇄] 는 고른 발주서들.
   */
  const [slipDocs, setSlipDocs] = useState<SlipPrintDoc[] | null>(null)
  const toSlip = (po: PurchaseOrder) => {
    const p = partners.find((x) => x.id === po.partnerId)
    return purchaseOrderSlip({ key: po.id, dateNo: dateNo(po.orderDate, po.orderNo), partnerName: po.partnerName, partnerTel: p?.phone, partnerFax: p?.fax,
      employeeName: po.employeeName ?? po.createdBy, dueDate: po.dueDate, supplyAmount: po.supplyAmount, vatAmount: po.vatAmount,
      totalAmount: po.totalAmount, lines: po.lines }, company)
  }
  function printOrder(po: PurchaseOrder) { setSlipDocs([toSlip(po)]) }
  function printChecked() {
    const list = shown.filter((po) => picked.has(po.id))
    if (list.length) setSlipDocs(list.map(toSlip))
  }

  /* 원본 하단 [선택삭제] — 고른 줄을 한 번에 지운다. 하나가 막혀도 나머지는 지우고 몇 건이 남았는지 알린다. */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const pick = (id: number) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  /*
   * 원본 [진행상태변경 ▲] › 진행중 — 고른 줄 중 단가확정(미확인)까지 끝난 것을 발주확정(진행중)으로 넘긴다.
   * 넘어간 줄과 건너뛴 줄을 함께 말한다.
   */
  async function bulkStatus() {
    if (!requireSelection(picked.size)) return
    const targets = shown.filter((po) => picked.has(po.id) && po.status === 'PRICED')
    const skipped = picked.size - targets.length
    if (targets.length === 0) { setError('미확인(단가확정)인 발주서를 고르세요 — 그 줄만 진행중(발주확정)으로 넘깁니다.'); return }
    const results = await Promise.allSettled(
      targets.map((po) => api.post(`/purchase-orders/${po.id}/confirm`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError([
      failed ? `${failed}건은 확정하지 못했습니다.` : '',
      skipped ? `${skipped}건은 미확인이 아니라 건너뛰었습니다.` : '',
    ].filter(Boolean).join(' '))
    load()
  }

  async function removeChecked() {
    const ids = [...picked]
    if (!(await ecConfirm(`고른 ${ids.length}건을 삭제할까요?`))) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/purchase-orders/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError(failed ? `${failed}건은 삭제하지 못했습니다(이미 입고로 넘어간 발주서일 수 있습니다).` : '')
    load()
  }

  /** [다른전표생성 ▲] › 구매전표 — 고른 발주서 한 장의 잔량으로 찬 구매입력 창('생성한 전표' 창 [신규(F2)] 와 같은 길). */
  async function makePurchase() {
    if (!requireSelection(picked.size)) return
    if (picked.size > 1) { void ecAlert('구매전표는 발주서 한 장씩 만듭니다. 한 줄만 고르세요.'); return }
    const po = shown.find((x) => picked.has(x.id))
    if (!po) return
    if (await openGenerated(po)) setEntryOpen(true)
  }

  /** 창의 [이전](+1, 목록 아래) · [다음](-1, 목록 위) — 발주요청조회 창과 같은 잣대. */
  function step(dir: 1 | -1) {
    const at = shown.findIndex((o) => o.id === form?.order?.id)
    const target = at < 0 ? undefined : shown[at + dir]
    if (!target) return ecAlert(dir < 0 ? '다음에 표시할 전표가 없습니다.' : '이전에 표시할 전표가 없습니다.')
    openForm(target)
  }

  /* 원본 [Option](2026-10-31 loginad 발주서조회): 검색항목설정 · 양식설정 ▶ · 조건양식설정 · 리스트탭설정 · 문서발송내역. 끝 줄은 우리 열 켜기. */
  const optionMenu: OptionItem[] = [
    { label: '검색항목설정', onClick: notHere('검색항목설정') },
    { label: '양식설정', sub: [
      { label: '기본(수정불가)', active: true, onClick: () => void ecAlert('양식은 하나만 지원합니다.') },
      { label: '신규양식추가', onClick: () => void ecAlert('신규양식추가는 지원하지 않습니다(양식 하나).') },
    ] },
    { label: '조건양식설정', onClick: notHere('조건양식설정') },
    { label: '리스트탭설정', onClick: notHere('리스트탭설정') },
    { label: '문서발송내역', onClick: notHere('문서발송내역') },
    { label: showProject ? '프로젝트명 열 감추기' : '프로젝트명 열 보기', onClick: () => setShowProject((v) => !v) },
  ]

  return (
    <EcListShell
      title="발주서조회"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      newLabel="신규(F2)"
      onNew={() => openForm(null)}
      formMenu={{ current: '기본(수정불가)' }}
      optionMenu={optionMenu}
      /*
       * 원본 하단(2026-10-31 loginad 발주서조회): 신규(F2) · Email▲ · 진행상태변경▲(미확인 / 확인 ▸ 진행중 · 완료) · 보내기▲(E Note · 대화방 · 사용자 · 북마크) ·
       * 인쇄▲ · 바코드(품목)▲ · 다른전표생성▲(주문서 · 판매전표 · 구매전표) · 전자결재 · 선택삭제 · Excel · 이력조회 — 견적서 · 주문서조회와 같은 꼴.
       * 진행상태변경 › 미확인 · 완료 는 우리 발주 단계가 되돌리기 · 손으로 닫기를 안 받아 안내만(완료는 구매입력이 전량 입고하면 선다).
       */
      actions={[
        { label: 'Email', onClick: () => void ecAlert(EMAIL_NOT_HERE), menu: [{ label: '카카오톡', onClick: notHere('카카오톡') }] },
        { label: '진행상태변경', menuOnly: true, selected: picked.size, menu: [
          { label: '미확인', onClick: () => { if (requireSelection(picked.size)) void ecAlert('발주확정한 발주서는 미확인(단가확정)으로 되돌리지 않습니다.') } },
          { label: '진행중', onClick: () => void bulkStatus() },
          { label: '완료', onClick: () => { if (requireSelection(picked.size)) void ecAlert('완료는 구매입력에서 이 발주서를 불러와 전량 입고하면 바뀝니다.') } },
        ] },
        { label: '보내기', menuOnly: true, menu: ['E Note', '대화방', '사용자', '북마크'].map((l) => ({ label: l, onClick: notHere(`보내기 › ${l}`) })) },
        { label: '인쇄', onClick: printChecked, selected: picked.size, menu: [{ label: '프린트문제해결', onClick: notHere('프린트문제해결') }] },
        { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE), selected: picked.size, menu: [
          { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE) },
          { label: '바코드(사업장/번호No.)', onClick: notHere('바코드(사업장/번호No.)') },
        ] },
        { label: '다른전표생성', menuOnly: true, menu: [
          { label: '주문서', onClick: notHere('다른전표생성 › 주문서') },
          { label: '판매전표', onClick: notHere('다른전표생성 › 판매전표') },
          { label: '구매전표', onClick: () => void makePurchase() },
        ] },
        { label: '전자결재', onClick: notHere('전자결재') },
        { label: '선택삭제', onClick: removeChecked, selected: picked.size },
        { label: 'Excel' },
        { label: '이력조회', onClick: () => setHistoryWin(true) },
      ]}>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {slipDocs && <EcSlipPrintModal title="발주서" docs={slipDocs} forms={['내자기본']} width={782} onClose={() => setSlipDocs(null)} />}
      {historyWin && <SlipMenuHistoryModal menu="발주서" statusLabel="확인" noLabel="전표번호" onClose={() => setHistoryWin(false)} />}
      {form && (
        <ProductionSlipWindow title={form.order && form.order.id > 0 ? '발주서수정' : '발주서입력'}
                              popout="/sales/purchase-order-input" onClose={() => setForm(null)}>
          {/* 원본 발주서수정 머리 [확인취소] — 판매 · 주문 수정 창과 같이 이 회사 설정으로는 알림만 뜬다. */}
          {form.order && form.order.id > 0 && (
            <div className="flex justify-end mb-[6px]">
              <button type="button" className="ec-btn ec-btn-sm"
                      onClick={() => void ecAlert('전표상태관리유형 설정으로 인해 전표상태를 변경할 수 없습니다.')}>확인취소</button>
            </div>
          )}
          <PurchaseRequestForm key={form.key} bare order editing={form.order}
            onClose={() => setForm(null)}
            onSaved={() => { setForm(null); load() }}
            onDeleted={() => { setForm(null); load() }}
            onCopy={(src) => openForm({ ...src, id: 0, orderDate: todayYmd(), dueDate: todayYmd() })}
            onStep={step} />
        </ProductionSlipWindow>
      )}

      <ul className="ec-cond mb-[8px]">
        {/* 원본 조건 첫째 <b>[기준일자]</b> — 단추줄에 [말일]이 낀다(사본 실측). */}
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={ORDER_DOC_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="발주No.">
          <input className="ec-input w-[170px]" value={orderNoCond} onChange={(e) => setOrderNoCond(e.target.value)} />
        </EcCond>
        <EcCond label="내.외자구분">
          <div className="ec-pills">
            {(['전체', '내자', '외자'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${fxCond === v ? ' active' : ''}`} onClick={() => setFxCond(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond} items={condPickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projCond} onChange={setProjCond}
                           items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={condPickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={condPickers.items} />
        </EcCond>
        <EcCond label="발송여부">
          <div className="ec-pills">
            {(['전체', '미발송', '발송'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${sentCond === v ? ' active' : ''}`} onClick={() => setSentCond(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
        {/*
          원본 접힌 줄(⌄)을 펼친 칸(2026-10-31 loginad): 납기일자 · (오더관리번호) · 규격 · 담당자 · 거래처관리담당자 · 적요 · 참조 · 최초작성자 ·
          최종수정자 · 최초작성일자 · 최종작업일자 · (입력경로 · 삭제구분) · 기타. 괄호 안은 발주서에 그 값이 없어 칸을 두지 않는다.
          거래처그룹1 · 품목구분 · 품목그룹1 은 원본 판에 없는 우리 조건이라 맨 뒤.
        */}
        {moreConds && <>
          <EcCond label="납기일자">
            <EcDateRange from={{ className: "ec-input", value: dueFrom, onChange: (e) => setDueFrom(e.target.value) }} to={{ className: "ec-input", value: dueTo, onChange: (e) => setDueTo(e.target.value) }} />
          </EcCond>
          <EcCond label="규격" pick>
            <CodePickerField label="규격" hideLabel width={170} emptyLabel="전체"
                             value={specCond} onChange={setSpecCond}
                             items={[...new Set(rows.flatMap((r) => r.lines.map((l) => l.spec)).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          {/* 원본 [담당자] — 발주를 맡은 사원. 전표를 친 [최초작성자]와 다르다. */}
          <EcCond label="담당자" pick>
            <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                             value={empCond} onChange={setEmpCond}
                             items={employees.map((e) => ({ value: e.name, name: e.name }))} />
          </EcCond>
          <EcCond label="거래처관리담당자" pick>
            <CodePickerField label="거래처관리담당자" hideLabel width={170} emptyLabel="전체"
                             value={pmgrCond} onChange={setPmgrCond}
                             items={pmgr.options.map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="적요">
            <input className="ec-input w-[170px]" placeholder="줄 적요 일부" value={remarkCond} onChange={(e) => setRemarkCond(e.target.value)} />
          </EcCond>
          <EcCond label="참조">
            <input className="ec-input w-[170px]" placeholder="참조 일부" value={refCond} onChange={(e) => setRefCond(e.target.value)} />
          </EcCond>
          <EcCond label="최초작성자" pick>
            <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체"
                             value={authorCond} onChange={setAuthorCond}
                             items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="최종수정자" pick>
            <CodePickerField label="최종수정자" hideLabel width={170} emptyLabel="전체"
                             value={editorCond} onChange={setEditorCond}
                             items={[...new Set(rows.map((r) => r.updatedBy).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="최초작성일자">
            <EcDateRange from={{ className: "ec-input", value: madeFrom, onChange: (e) => setMadeFrom(e.target.value) }} to={{ className: "ec-input", value: madeTo, onChange: (e) => setMadeTo(e.target.value) }} />
          </EcCond>
          <EcCond label="최종작업일자">
            <EcDateRange from={{ className: "ec-input", value: editedFrom, onChange: (e) => setEditedFrom(e.target.value) }} to={{ className: "ec-input", value: editedTo, onChange: (e) => setEditedTo(e.target.value) }} />
          </EcCond>
          <EcCond label="기타">
            <label className="text-[12.5px] flex items-center gap-[4px]">
              <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
              수정일자순(정렬)
            </label>
          </EcCond>
          <EcCond label="거래처그룹1" pick>
            <CodePickerField label="거래처그룹1" hideLabel width={170} emptyLabel="전체"
                             value={partnerGroupCond} onChange={setPartnerGroupCond}
                             items={pgroups.groupOptions.map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="품목구분" pick>
            <CodePickerField label="품목구분" hideLabel width={170} emptyLabel="전체"
                             value={categoryCond} onChange={setCategoryCond}
                             items={[...new Set(rows.flatMap((r) => r.lines.map((l) => l.itemCategoryName)).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="품목그룹1" pick>
            <CodePickerField label="품목그룹1" hideLabel width={170} emptyLabel="전체"
                             value={itemGroupCond} onChange={setItemGroupCond}
                             items={mgmt.groupOptions.map((n) => ({ value: n, name: n }))} />
          </EcCond>
        </>}
        <li className="full justify-center">
          <button type="button" className="ec-btn ec-btn-sm" aria-expanded={moreConds}
                  title={moreConds ? '조건 접기' : '조건 더 보기'} aria-label={moreConds ? '조건 접기' : '조건 더 보기'} onClick={() => setMoreConds((v) => !v)}>
            <EcIcon name={moreConds ? 'chevron-up' : 'chevron-down'} size={12} glyph={moreConds ? '▴' : '▾'} />
          </button>
        </li>
      </ul>

      {/* 원본 제목 옆 알약: 전체 · 결재중 · 미확인 · 확인 ▸ 진행중 – 완료(개수 없음) */}
      <div className="ec-pills mb-[6px]">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`ec-pill no-ec${tab === k ? ' active' : ''}`}>{label}</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            {/* 원본 발주서조회 열(2026-10-31 loginad): ☑ · 일자-No. · 거래처명 · 담당자명 · 품목명[규격명] · 납기일자 · 발주금액합계 · 진행상태 · 생성한 전표 · 인쇄 — 번호 열 없음. */}
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((po) => picked.has(po.id))}
                onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((po) => po.id)) : new Set())} />
            </th>
            <th className="w-[150px]">일자-No.</th>
            <th>거래처명</th>
            <th className="w-[90px]">담당자명</th>
            <th>품목명[규격명]</th>
            <th className="w-[100px] text-center">납기일자</th>
            <th className="text-right">발주금액합계</th>
            <th className="text-center">진행상태</th>
            <th className="w-[100px] text-center">생성한 전표</th>
            <th className="text-center">인쇄</th>
            {showProject && <th>프로젝트명</th>}
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={showProject ? 11 : 10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((po) => (
            <tr key={po.id}>
              <td className="text-center">
                <input type="checkbox" aria-label="선택" checked={picked.has(po.id)} onChange={() => pick(po.id)} />
              </td>
              {/* 원본 '2026/10/21 -1' — 누르면 목록 위 '발주서수정' 창. */}
              <td><a className="cursor-pointer" onClick={() => openForm(po)}>{dateNo(po.orderDate, po.orderNo)}</a></td>
              <td>{po.partnerName}</td>
              <td>{po.employeeName ?? ''}</td>
              {/* 여러 줄이면 첫 줄에 '외 N건' 을 붙인다 — 원본도 한 칸에 대표 품목을 적는다. */}
              <td>
                {po.lines[0]
                  ? po.lines[0].itemName + (po.lines[0].spec ? ` [${po.lines[0].spec}]` : '')
                    + (po.lines.length > 1 ? ` 외 ${po.lines.length - 1}건` : '')
                  : ''}
              </td>
              <td className="text-center">{dateText(po.dueDate) || ''}</td>
              <td className="text-right">{fmtNumber(po.totalAmount)}</td>
              <td className={`text-center${progressOf(po.status) === '완료' ? ' text-[var(--ec-done)]' : ''}`} title={po.statusName}>{progressOf(po.status)}</td>
              {/*
                원본 [생성한 전표] — 구매전표를 만든 줄만 주황 [조회] → '생성한 전표' 창. 우리 응답은 다 사서 닫힌 것(입고전환)만 알려 줘서
                일부만 산 발주서는 꼬리표 대신 흐린 '조회' 글자로 둔다(창은 같다).
              */}
              <td className="text-center">
                {po.status === 'RECEIVED' || po.convertedPurchaseId != null
                  ? <a className={`cursor-pointer ${GEN_TAG}`} onClick={() => void openGenerated(po)}>조회</a>
                  : <a className="cursor-pointer text-ec-hint" onClick={() => void openGenerated(po)}>조회</a>}
              </td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => printOrder(po)}>인쇄</a></td>
              {showProject && <td>{po.projectName ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {/*
        원본 '생성한 전표' 창(2026-10-28 발주서조회 실측): 머리 '발주서조회 : 2026/11/08 -1', 표 품목코드 · 품목명 · 규격 · 수량 · 잔량 ·
        생성한 전표 · 생성한 전표일자-No., 아래 [신규(F2)] · [닫기]. 다 넘어간 줄은 잔량이 빈칸(0 을 안 찍음).
      */}
      <Modal open={generated != null && !entryOpen} title="생성한 전표" width={760} onClose={() => setGenerated(null)}>{generated && (
        <div>
          <p className="mb-[6px]">발주서조회 : {dateNo(generated.order.orderDate, generated.order.orderNo)}</p>
          <table className="w-full text-left">
            <thead><tr>
              <th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th className="text-right">잔량</th>
              <th>생성한 전표</th><th>생성한 전표일자-No.</th>
            </tr></thead>
            <tbody>
              {generated.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.itemCode}</td><td>{r.itemName}</td><td>{r.spec ?? ''}</td>
                  <td className="text-right">{fmtNumber(r.quantity)}</td>
                  <td className="text-right">{Number(r.remaining) > 0 ? fmtNumber(r.remaining) : ''}</td>
                  <td>{r.slipType ?? ''}</td>
                  <td>{r.slipDate && r.slipNo
                    ? <a className="cursor-pointer" onClick={() => void printPurchase(r)}>{dateNo(r.slipDate, r.slipNo)}</a>
                    : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[8px] flex gap-[4px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setEntryOpen(true)}>신규(F2)</button>
            <button type="button" className="ec-btn" onClick={() => setGenerated(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>
      {generated && entryOpen && (
        /* 원본 [신규(F2)] — 그 발주의 잔량으로 찬 구매입력 창(일자는 오늘). 구매조회 [신규(F2)] 창과 같은 틀, 바깥을 눌러도 안 닫힌다. */
        <div className="ec-modal-back">
          <ModalWindow title="구매입력" onClose={() => closeEntry(false)} className="w-[max(960px,50vw)]">
              <TradeEntry mode="purchase" popup={{
                editId: null, onClose: closeEntry, onMove: () => {}, onReturn: () => {}, docs: [],
                prefill: prefillOf(generated.order, generated.rows),
              }} />
          </ModalWindow>
        </div>
      )}
    </EcListShell>
  )
}


/*
 * 아래 PurchaseOrderForm 은 옛 발주 입력 폼이다 — 화면에서는 더 쓰지 않는다(메뉴 발주서입력 · 목록 위 창은 PurchaseRequestForm order).
 * qa/ui-check.mjs 의 발주서입력 열 대조 예외와 reason-witnesses 가 이 폼의 글자를 증거로 읽어서 남겨 둔다.
 */
export function PurchaseOrderForm({ items, partners, employees, warehouses, projects, currencies, onClose, onSaved }: {
  items: Item[]; partners: Partner[]; employees: EmployeeMaster[]; warehouses: Warehouse[]
  projects: { id: number; code: string; name: string }[]; currencies: Currency[]
  onClose: () => void; onSaved: () => void
}) {
  const [partnerId, setPartnerId] = useState('')
  const [orderDate, setOrderDate] = useState(todayYmd())
  const [dueDate, setDueDate] = useState('')
  const [employeeId, setEmployeeId] = useState('')   // 담당자
  const [warehouseId, setWarehouseId] = useState('') // 입고창고
  /* 원본 발주서입력의 [프로젝트]. 발주 단계가 빠져 프로젝트별 손익에 안 잡혔다. */
  const [projectId, setProjectId] = useState('')
  const [currency, setCurrency] = useState('KRW')    // 통화
  const [taxable, setTaxable] = useState(true)   // 거래유형: 부가세율 적용 / 면세
  const [remark, setRemark] = useState('')       // 참조
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  /**
   * 원본 격자 툴바의 [My품목]. <b>단가는 My품목이 들고 온 값을 쓰지 않는다</b> —
   * 그 값은 품목의 판매단가다. 발주는 사는 쪽이라 구매단가를 채워야 한다
   * (아래 pickItem 과 같은 규칙). 판매가를 채우면 그게 발주단가로 굳는다.
   */
  const myItems = useMyItemsPick((picked) => setLines((ls) => {
    const kept = ls.filter((l) => l.itemId)
    const added = picked.map((m) => {
      const pp = items.find((x) => x.id === m.itemId)?.purchasePrice ?? 0
      return { ...emptyLine(), itemId: String(m.itemId), quantity: String(m.defaultQty), unitPrice: pp > 0 ? String(pp) : '' }
    })
    return [...kept, ...added, emptyLine()]
  }))
  /**
   * 줄 추가항목의 <b>정의</b>. 열 예외에 "발주서 화면이 아직 안 읽는다" 고 적혀 있던
   * 그 나머지 반쪽이다(머리는 앞 커밋에 이었다). 판매·구매 입력이 쓰는 것과 같은 길이다 —
   * <code>/custom-fields/defs?entityType=PURCHASE_ORDER_LINE</code>.
   */
  const [lineDefs, setLineDefs] = useState<CustomFieldDef[]>([])
  useEffect(() => {
    api.get<CustomFieldDef[]>('/custom-fields/defs', { params: { entityType: 'PURCHASE_ORDER_LINE' } })
      .then((r) => setLineDefs(r.data.filter((d) => d.active !== false)))
      /* 추가항목은 곁가지다 — 못 불러와도 입력을 막지 않는다. */
      .catch(() => setLineDefs([]))
  }, [])
  /** 줄 추가항목 한 칸을 고친다. */
  const setLineCustom = (idx: number, key: string, value: string) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, custom: { ...l.custom, [key]: value } } : l)))

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const specOf = (itemId: string) => items.find((x) => String(x.id) === itemId)?.spec ?? ''
  /* 원본 격자의 [단위] — 품목이 들고 있는 값이라 고르면 바로 따라 붙는다. */
  const unitOf = (itemId: string) => items.find((x) => String(x.id) === itemId)?.unit ?? ''

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function pickItem(i: number, itemId: string) {
    const it = items.find((x) => String(x.id) === itemId)
    // 발주는 사는 쪽이다 — 판매단가가 아니라 <b>구매단가</b>를 채운다.
    // 구매단가를 안 정한 품목(0)은 비워 둔다. 판매가를 채우면 그게 발주단가로 굳는다.
    const pp = it?.purchasePrice ?? 0
    setLine(i, { itemId, unitPrice: pp > 0 ? String(pp) : '' })
    // 매입처의 특별단가(구매)가 있으면 덮는다(50회차 — 발주서는 특별단가를 몰랐다).
    void resolveSpecialPrice('PURCHASE', itemId, partnerId).then((p) => { if (p != null) setLine(i, { unitPrice: String(p) }) })
  }
  /** 매입처를 고르면 담긴 품목의 특별단가를 다시 찾는다 — 품목을 먼저 담아도 걸리게. */
  function choosePartner(v: string) {
    setPartnerId(v)
    lines.forEach((l, i) => {
      if (l.itemId) void resolveSpecialPrice('PURCHASE', l.itemId, v).then((p) => { if (p != null) setLine(i, { unitPrice: String(p) }) })
    })
  }

  const calc = lines.map((l) => lineSupply(Number(l.quantity) || 0, Number(l.unitPrice) || 0))
  const supply = calc.reduce((a, b) => a + b, 0)
  // 서버처럼 줄마다 반올림한 부가세를 더한다(전표 합계에 한 번 반올림하면 1원씩 어긋난다).
  const vat = taxable ? calc.reduce((a, s) => a + roundWon(s * 0.1), 0) : 0

  async function save() {
    setError('')
    if (!partnerId) return setError('매입처를 선택하세요.')
    const payload = lines
      .filter((l) => l.itemId && Number(l.quantity) > 0)
      .map((l) => ({
        itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0,
        partnerId: l.partnerId ? Number(l.partnerId) : undefined,
        remark: l.remark || undefined,
      }))
    if (payload.length === 0) return setError('품목을 1개 이상 입력하세요.')
    /* 보낸 줄과 <b>같은 차례로</b> 돌아온다 — 추가항목을 새 줄 id 에 붙일 때 이 짝을 쓴다. */
    const kept = lines.filter((l) => l.itemId && Number(l.quantity) > 0)
    setSaving(true)
    try {
      const res = await api.post<PurchaseOrder>('/purchase-orders', {
        partnerId: Number(partnerId), orderDate, dueDate: dueDate || undefined,
        employeeId: employeeId ? Number(employeeId) : undefined,
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        projectId: projectId ? Number(projectId) : undefined,
        currency,
        taxable, remark: remark || undefined, lines: payload,
      })
      /*
       * 줄 추가항목은 <b>줄 id 가 생긴 뒤에야</b> 붙일 수 있어서 저장을 두 번 한다.
       * 값을 하나도 안 채운 줄은 부르지 않는다 — 안 쓰는 회사에 헛요청이 줄 수만큼 나간다.
       * 여기서 실패해도 발주는 이미 저장됐으므로 <b>그 사실을 알리고</b> 닫는다.
       */
      if (lineDefs.length > 0) {
        const newLines = res.data.lines ?? []
        const puts = kept.map((l, i) => {
          const id = newLines[i]?.id
          if (id == null || !Object.values(l.custom ?? {}).some((v) => v?.trim())) return null
          return api.put('/custom-fields/values', { values: l.custom },
            { params: { entityType: 'PURCHASE_ORDER_LINE', entityId: id } })
        }).filter(Boolean) as Promise<unknown>[]
        if (puts.length > 0) {
          try { await Promise.all(puts) }
          catch { setError('발주는 저장했지만 줄 추가항목 저장에 실패했습니다.') }
        }
      }
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '발주서 품목 격자', [lineDefs.length])

  /**
   * 원본 격자 툴바의 <b>[재고불러오기]</b>와 그것이 채우는 두 칸.
   *
   * <p>발주는 <b>모자라는 것을 채우는 일</b>이다. 얼마를 시킬지는 <b>지금 얼마 있나</b>를
   * 봐야 정하는데, 우리 격자에는 그 칸이 없어 재고현황을 따로 열어 보고 와야 했다.
   * 원본 발주서입력 격자에는 <b>[전체수량]·[창고수량]</b> 두 칸이 있고
   * (<code>qa/fixtures/ecount-column-width.json</code> 의 발주서입력 — 각 67),
   * 이 단추가 그것을 채운다.
   *
   * <p>화면을 열 때마다 전 품목 재고를 끌어오지 않는다 — <b>누를 때만</b> 부른다
   * (생산불출입력·판매/구매입력과 같다). 부르기 전에는 <b>'-'</b> 로 둔다.
   * 0 으로 채우면 "재고가 없다" 로 읽힌다.
   */
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [stockLoaded, setStockLoaded] = useState(false)
  const [stockBusy, setStockBusy] = useState(false)
  async function loadStocks() {
    setStockBusy(true)
    try {
      setStocks((await api.get<StockRow[]>('/stock')).data)
      setStockLoaded(true)
    } catch (err) { setError(extractErrorMessage(err)) } finally { setStockBusy(false) }
  }
  /** 그 품목의 전 창고 합계. 아직 안 불러왔으면 null 이다(0 이 아니다). */
  const stockAllOf = (itemId: string): number | null => {
    if (!stockLoaded || !itemId) return null
    return stocks.filter((s) => String(s.itemId) === itemId).reduce((a, s) => a + s.quantity, 0)
  }
  /** 머리에서 고른 <b>입고창고</b>의 수량. 창고를 안 골랐으면 잴 것이 없어 null 이다. */
  const stockAtOf = (itemId: string): number | null => {
    if (!stockLoaded || !itemId || !warehouseId) return null
    const hit = stocks.find((s) => String(s.itemId) === itemId && String(s.warehouseId) === warehouseId)
    return hit ? hit.quantity : 0
  }
  const stockCell = (n: number | null) => (n === null ? '-' : n.toLocaleString())

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 880, maxWidth: '96vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">발주요청</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <table className="w-full text-left mb-[12px]">
            <tbody>
              <tr>
                <th className="w-[90px] bg-ec-page">매입처<span className="text-ec-danger">*</span></th>
                <td>
                  <CodePickerField label="매입처" hideLabel width={240} emptyLabel="선택 안 함" placeholder="매입처 선택"
                                   value={partnerId} onChange={choosePartner}
                                   items={partnerCodeItems(partners.filter((p) => p.type !== 'CUSTOMER'), true)} />
                </td>
                {/* 원본 발주서입력의 이름은 [발주일]이 아니라 <b>[일자]</b> 다(사본 실측). */}
                <th className="w-[70px] bg-ec-page">일자</th>
                <td><EcDateInput className="ec-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></td>
              </tr>
              <tr>
                {/* 원본 발주서입력의 이름은 [납기요청일]이 아니라 <b>[납기일자]</b> 다(사본 실측).
                    목록 열도 이미 [납기일자]라 <b>우리끼리도 어긋나</b> 있었다. */}
                <th className="bg-ec-page">납기일자</th>
                <td><EcDateInput className="ec-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></td>
{/* 원본 차례: 담당자 · 거래유형 · 통화 · 참조 — 담당자가 거래유형보다 앞이다. */}
                {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다 —
                    사원·창고가 몇십 개만 돼도 드롭다운으로는 코드로 못 찾는다. */}
                <th className="bg-ec-page">담당자</th>
                <td>
                  <CodePickerField label="담당자" hideLabel width={150} emptyLabel="담당자 선택"
                                   value={employeeId} onChange={setEmployeeId}
                                   items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">거래유형</th>
                <td>
                  <select className="ec-input" value={taxable ? 'VAT' : 'FREE'} onChange={(e) => setTaxable(e.target.value === 'VAT')} style={{ width: 150 }}>
                    <option value="VAT">부가세율 적용</option>
                    <option value="FREE">면세</option>
                  </select>
                </td>
                {/* 원본 발주서입력의 이름은 [창고]가 아니라 <b>[입고창고]</b> 다 — 목록 상세도 그렇게 적는다. */}
                <th className="bg-ec-page">입고창고</th>
                <td>
                  <CodePickerField label="입고창고" hideLabel width={150} emptyLabel="창고 선택"
                                   value={warehouseId} onChange={setWarehouseId}
                                   items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name, stopped: x.active === false }))} />
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">통화</th>
                <td>
                  <select className="ec-input" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 150 }}>
                    <option value="KRW">내자(KRW)</option>
                    {currencies.filter((c) => c.code !== 'KRW').map((c) => <option key={c.id} value={c.code}>{c.code} {c.name}</option>)}
                  </select>
                </td>
                <th className="bg-ec-page">참조</th>
                <td><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="참조/비고" style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                {/* 원본 발주서입력 차례의 <b>맨 뒤</b>가 [프로젝트]다(사본 실측). */}
                <th className="bg-ec-page">프로젝트</th>
                <td colSpan={3}>
                  <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="선택 안 함"
                                   value={projectId} onChange={setProjectId}
                                   items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
            </tbody>
          </table>

          <table ref={tableRef} className="w-full text-left">
            {/*
              원본 발주서입력 격자에는 <b>[No.]·[단위]·[단가(vat포함)]</b> 도 있다(사본 실측).
              줄 번호는 <b>첫 칸에 찍고도 이름이 없어</b> 무엇인지 몰랐고, 단위는 품목이 들고 있는데
              안 보여 "3" 이 세 개인지 세 박스인지 알 수 없었다. 부가세 포함 단가는 <b>매입처가 부르는 값</b>이라
              머릿속으로 곱해 보고 있었다.
            */}
            <thead><tr><th className="w-[30px]"></th><th>품목</th><th className="w-[100px]">규격</th><th className="w-[130px]">거래처</th><th className="w-[67px] text-right">전체수량</th><th className="w-[67px] text-right">창고수량</th><th className="w-[70px] text-right">수량</th><th className="w-[90px] text-right">예상단가</th><th className="text-right">공급가액</th><th className="w-[110px]">적요</th>{/* 줄 추가항목. 정의한 것만 열이 생긴다 — 안 쓰는 회사는 격자가 그대로다. */}{lineDefs.map((d) => (<th key={d.fieldKey} className="w-[120px]">{d.label}</th>))}<th className="w-[40px]">No.</th><th className="w-[46px]">단위</th><th className="w-[100px] text-right">단가(vat포함)</th><th className="w-[34px]"></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>
                    <CodePickerField label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제"
                                     value={l.itemId} onChange={(v) => pickItem(i, v)}
                                     items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec, stopped: it.active === false }))} />
                  </td>
                  <td className="text-ec-muted">{specOf(l.itemId)}</td>
                  <td>
                    <CodePickerField label="매입처" hideLabel fill emptyLabel="(헤더 매입처)" placeholder="(헤더 매입처)"
                                     value={l.partnerId} onChange={(v) => setLine(i, { partnerId: v })}
                                     items={partnerCodeItems(partners.filter((p) => p.type !== 'CUSTOMER'), true)} />
                  </td>
                  {/* [재고불러오기]가 채우는 두 칸. 누르기 전에는 '-' 다. */}
                  <td className="text-right text-ec-label">{stockCell(stockAllOf(l.itemId))}</td>
                  <td className="text-right text-ec-label">{stockCell(stockAtOf(l.itemId))}</td>
                  <td><EcNumInput className="ec-input w-full text-right" value={l.quantity} onValue={(v) => setLine(i, { quantity: v })} /></td>
                  <td><EcNumInput className="ec-input w-full text-right" value={l.unitPrice} onValue={(v) => setLine(i, { unitPrice: v })} /></td>
                  <td className="text-right">{fmtNumber(calc[i])}</td>
                  <td><input className="ec-input" value={l.remark} onChange={(e) => setLine(i, { remark: e.target.value })} style={{ width: '100%' }} /></td>
                  {/*
                    머리의 추가항목과 <b>같은 잣대로</b> 그린다 — [코드] 형식이면 고르는 칸,
                    나머지는 치는 칸이다. 판매·구매 격자가 예전에 이 둘을 다르게 그려
                    같은 필드가 위아래에서 다르게 굴었던 적이 있다.
                  */}
                  {lineDefs.map((d) => (
                    <td key={d.fieldKey}>
                      {d.fieldType === 'CODE' ? (
                        <select className="ec-input" value={l.custom[d.fieldKey] ?? ''} disabled={!l.itemId}
                                onChange={(e) => setLineCustom(i, d.fieldKey, e.target.value)} style={{ width: '100%' }}>
                          <option value=""></option>
                          {(d.options ?? '').split(',').map((o) => o.trim()).filter(Boolean)
                            .map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input className="ec-input" disabled={!l.itemId}
                               type={d.fieldType === 'DATE' ? 'date' : d.fieldType === 'NUMBER' ? 'number' : 'text'}
                               value={l.custom[d.fieldKey] ?? ''}
                               onChange={(e) => setLineCustom(i, d.fieldKey, e.target.value)} style={{ width: '100%' }} />
                      )}
                    </td>
                  ))}
                  <td className="text-ec-muted">{i + 1}</td>
                  <td className="text-ec-muted">{unitOf(l.itemId)}</td>
                  <td className="text-right text-ec-muted">{fmtNumber(Math.round(Number(l.unitPrice || 0) * (taxable ? 1.1 : 1)))}</td>
                  <td className="text-center">{lines.length > 1 && <button className="ec-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-ec-page">
                <td colSpan={8} className="text-right">공급가액 / 부가세 / 합계</td>
                {/* 추가항목 열이 늘어난 만큼 여기도 늘어야 한다 — 안 그러면 합계가 엉뚱한 열 아래 붙는다. */}
                <td className="text-right" colSpan={6 + lineDefs.length}>{fmtNumber(supply)} / {fmtNumber(vat)} / <span className="text-ec-navy">{fmtNumber(supply + vat)}</span></td>
              </tr>
            </tfoot>
          </table>
          <div className="flex items-center gap-[6px] mt-[8px]">
            <button className="ec-btn" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ 행 추가</button>
            {/* 단추는 화면이 <b>글자로</b> 그린다 — 자식 컴포넌트에 넣으면 버튼 검사가 못 본다. */}
            <button type="button" className="ec-btn" disabled={myItems.busy} onClick={myItems.pick}>My품목</button>
            <button type="button" className="ec-btn" disabled={stockBusy} onClick={loadStocks}>재고불러오기</button>
            <MyItemsNote note={myItems.note} />
            {stockLoaded && (
              <span className="text-[12px] text-ec-label">
                재고를 불러왔습니다{warehouseId ? '' : ' — [입고창고]를 고르면 창고수량도 찹니다'}.
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

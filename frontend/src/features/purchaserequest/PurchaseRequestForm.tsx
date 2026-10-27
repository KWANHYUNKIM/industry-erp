import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import EcSlipShell from '../../components/EcSlipShell'
import CodePickerField from '../../components/CodePickerField'
import EcNumInput from '../../components/EcNumInput'
import { useCondPickers } from '../../utils/useCondPickers'
import { partnerCodeItems } from '../../utils/codeItems'
import { lineSupply, roundWon } from '../../utils/lineSupply'
import { dateNo } from '../../utils/dateNo'
import { SlipHistoryModal, slipHeadLabel } from '../sliphistory/SlipHistoryModal'
import { printDocuments } from '../../utils/printDocument'
import { openPrintWindow } from '../../utils/print'
import type { Currency, Item, MyItem, Partner, PurchaseOrder, PurchaseOrderLine, StockRow } from '../../types/api'
import { purchaseRequestDocument } from './purchaseRequestDocument'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import RequestPickModal from './RequestPickModal'
import PriceRequestPickModal from './PriceRequestPickModal'

/** 서버 줄 응답은 줄 거래처도 싣는다(OrderLineResponse.partnerId · partnerName) — 공용 타입에 없어 여기서만 넓힌다. */
type RequestLine = PurchaseOrderLine & {
  partnerId?: number | null; partnerName?: string | null
  /** 베껴 온 앞 전표 줄과 그 전표 번호 · 일자(서버 OrderLineResponse). */
  sourceLineId?: number | null; sourceOrderNo?: string | null; sourceOrderDate?: string | null
}
export interface PurchaseLineSeed {
  itemId: string; partnerId: string; quantity: string; unitPrice: string
  /** 원본 줄 열 [발주요청] · [No] / [발주계획] · [No.] — 베껴 온 앞 전표 줄. */
  sourceLineId?: number | null; sourceNo?: string; sourceDate?: string
}
type LineForm = PurchaseLineSeed
const emptyLine = (): LineForm => ({ itemId: '', partnerId: '', quantity: '', unitPrice: '' })
/** 앞 전표(발주요청 · 발주계획)의 줄 하나를 그대로 베낀다 — 수량 · 단가 · 줄 거래처, 출처 일자 · No.(원본 E040315 2026-10-20 실측). */
export const copyLine = (o: PurchaseOrder, l: PurchaseOrderLine): LineForm => {
  const rl = l as RequestLine
  return {
    itemId: String(rl.itemId),
    partnerId: String(rl.partnerId ?? o.partnerId ?? ''),
    quantity: String(Number(rl.quantity)),
    /* 단가요청에서 베끼면 [단가확정] 의 확정단가가 발주서 단가다(없으면 요청단가). */
    unitPrice: String(Number(o.status === 'PRICE_REQUESTED' ? (rl.confirmedPrice ?? rl.unitPrice) : rl.unitPrice)),
    sourceLineId: rl.id,
    sourceNo: o.orderNo,
    sourceDate: o.orderDate,
  }
}
export const copyLines = (orders: PurchaseOrder[]): LineForm[] => orders.flatMap((o) => o.lines.map((l) => copyLine(o, l)))
/** 원본 [발주요청] 열 '20261020' · [No] '1'. */
const srcDate = (d?: string) => (d ? d.replace(/-/g, '') : '')
const srcNo = (n?: string) => { const seq = (n ?? '').split('-').pop() ?? ''; return n ? String(Number(seq) || seq) : '' }
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const today = () => new Date().toLocaleDateString('sv-SE')
/** 원본 격자는 빈 줄 셋으로 열린다(신규 2026-10-13 실측). 고칠 때는 담긴 줄 뒤에 한 줄을 더 둔다. */
const MIN_ROWS = 3

/**
 * 재고 I &gt; 구매관리 &gt; 발주요청 &gt; <b>발주요청입력</b> 창 — 발주요청조회의 [신규(F2)] 와 [발주요청일자] 를 누르면 뜬다
 * (2026-10-13 loginaa E040315 실측).
 *
 * <p>발주서입력과 <b>모양이 다르다</b>: 거래처가 머리가 아니라 <b>줄마다</b> 있다(품목코드 · 품목명 · 거래처코드 · 거래처명 · 규격 ·
 * 수량 · 단가 · 공급가액 · 부가세 · 합계). 품목을 고르면 품목의 구매처 · 규격 · 구매단가가 채워진다(A002 → 최고전자 · 1EA · 299,000).
 * 머리: 일자-No. · 담당자 / 거래유형(부가세율 적용) · 창고 / 프로젝트 · 통화(내자) / 납기일자(오늘).
 *
 * <p>막는 것: 줄이 없으면 '그리드(표)에 최소 1줄 이상 입력되어야 합니다.', 창고가 비면 문구 없이 그 칸만 빨갛게.
 * 저장하면 창이 닫히고 목록 맨 위에 선다. 고칠 때는 일자가 잠기고 [복사] · [이전] · [다음] · [삭제] 가 붙는다
 * — 삭제는 '전표를 삭제하겠습니까?\n- 발주요청'.
 *
 * <p>우리 발주요청은 발주서(REQUESTED)와 같은 자료다. 머리 매입처는 첫 줄의 거래처로 둔다.
 *
 * <p><b>page</b> 면 창이 아니라 메뉴 '발주요청입력'(E040314) 화면으로 그린다 — 원본 사이드바에 따로 있다(2026-10-13 실측).
 * 단추줄 [저장(F8) ▴] · [저장/전표(F7)] · [다시 작성] · [리스트]. [저장(F8)] 은 저장하고 빈 화면으로(안내 없음),
 * ▴ 메뉴 '저장/전자결재 · 저장/내용유지 · 저장/신규', [저장/전표(F7)] 는 저장하고 '발주요청서' 인쇄창을 띄운 뒤 빈 화면,
 * [리스트] 는 발주요청조회로. 전자결재는 우리 결재가 발주요청을 안 받아 뺐다.
 *
 * <p><b>plan</b> 이면 '발주계획입력'(E040316, 2026-10-13 loginaa 실측)이다 — 칸은 같고 다른 것만: 머리 이름 [일자] · [입고될창고],
 * 격자에 [합계] 열이 없고(공급가액 · 부가세까지), 툴바에 [발주요청] · [품목별안전재고] 가 끼고, 단추줄은 저장(F8) ▴ · 다시 작성 · 리스트
 * (저장/전표가 없다). 저장하면 안내 없이 비우되 <b>입고될창고는 남긴다</b>. 입고될창고가 비면 그 칸만 빨갛게 — 요청과 같다.
 * 서버에는 plan: true 로 보내 요청을 거치지 않고 바로 [발주계획] 단계가 된다.
 */
export default function PurchaseRequestForm({ editing, page, plan, order, priceRequest, seed, onClose, onSaved, onDeleted, onCopy, onStep, onList }: {
  /** 고칠 발주요청. null 이면 신규. */
  editing: PurchaseOrder | null
  /** 창이 아니라 '발주요청입력' 화면으로 그린다. */
  page?: boolean
  /** 발주계획입력 — 바로 계획 단계로 저장한다. */
  plan?: boolean
  /**
   * 발주서입력 — 발주계획조회 [다른전표생성 › 발주서 › 1장라인별] 이 띄우는 창(원본 2026-10-20 실측). 거래처는 머리에 하나,
   * 줄 열 … · [발주계획] · [No.]. 저장하면 바로 발주서(발주확정)가 되고 계획은 그대로다.
   */
  order?: boolean
  /**
   * 단가요청입력(E040321, 2026-10-21 loginaa 실측) — 머리 일자 · 거래처 · 담당자 · 통화 · 프로젝트 · 유효기간(기본 오늘), 줄 품목코드 · 품목명 · 규격 ·
   * 수량 · 단가(요청단가 — 품목 입고단가) · 공급가액 · 부가세. 창고 · 납기가 없다. 저장(F8)은 말 없이 빈 화면. 서버에는 priceRequest: true.
   */
  priceRequest?: boolean
  /** 앞 전표에서 베껴 온 줄(copyLines) — 창이 이 줄로 찬 채 열린다. 입고창고도 같이 받는다. */
  seed?: { lines: LineForm[]; warehouseId?: number | null; srcHead?: [string, string] }
  onClose?: () => void
  onSaved?: () => void
  onDeleted?: () => void
  /** [복사] — 같은 내용을 신규 창으로(일자 · 납기 오늘). */
  onCopy?: (src: PurchaseOrder) => void
  /** [이전](+1, 목록 아래) · [다음](-1, 목록 위). */
  onStep?: (dir: 1 | -1) => void
  /** 화면 [리스트] — 발주요청조회로. */
  onList?: () => void
}) {
  const pickers = useCondPickers(['warehouses', 'projects', 'employees'], { withStopped: true })
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  useEffect(() => {
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data.filter((p) => p.type !== 'CUSTOMER'))).catch(() => {})
    api.get<Currency[]>('/currencies').then((r) => setCurrencies(r.data)).catch(() => {})
  }, [])

  const isEdit = editing != null && editing.id > 0
  const [historyOpen, setHistoryOpen] = useState(false)
  const docName = priceRequest ? '단가요청' : order ? '발주서' : plan ? '발주계획' : '발주요청'
  /** 거래처가 머리에 하나인 전표(발주서 · 단가요청) — 줄 거래처 열 · [합계] 열이 없다. */
  const headParty = order || priceRequest
  const [validUntil, setValidUntil] = useState(editing?.priceValidUntil ?? today())
  /** 줄 출처 열 이름 — 계획은 [발주요청] · [No], 발주서는 [발주계획] · [No.]. */
  /** 발주서입력 [단가요청] 으로 베꼈으면 줄 출처 열도 [단가요청] · [No.] 다. */
  const [priceSrc, setPriceSrc] = useState(false)
  const [pricePickOpen, setPricePickOpen] = useState(false)
  const srcHead = seed?.srcHead ?? (order && priceSrc ? ['단가요청', 'No.'] : order ? ['발주계획', 'No.'] : plan ? ['발주요청', 'No'] : null)
  const [orderDate, setOrderDate] = useState(editing?.orderDate ?? today())
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? today())
  const [employeeId, setEmployeeId] = useState(editing?.employeeId ? String(editing.employeeId) : '')
  const [warehouseId, setWarehouseId] = useState(editing?.warehouseId ? String(editing.warehouseId) : seed?.warehouseId ? String(seed.warehouseId) : '')
  /** 발주서입력 머리 [거래처] — 원본 발주서는 거래처가 머리에 하나다. 베껴 온 첫 줄 거래처로 시작한다. */
  const [headPartnerId, setHeadPartnerId] = useState(editing?.partnerId ? String(editing.partnerId) : seed?.lines.find((l) => l.partnerId)?.partnerId ?? '')
  /** [발주요청] 을 적용했나 — 원본은 적용하면 [발주요청] · [전표불러오기] 가 툴바에서 사라진다. */
  const [pickOpen, setPickOpen] = useState(false)
  const [applied, setApplied] = useState(Boolean(seed?.lines.length))
  const [projectId, setProjectId] = useState(editing?.projectId ? String(editing.projectId) : '')
  const [currency, setCurrency] = useState(editing?.currency ?? 'KRW')
  const [taxable, setTaxable] = useState(editing?.taxable ?? true)
  const [whMissing, setWhMissing] = useState(false)
  const [lines, setLines] = useState<LineForm[]>(() => {
    const got: LineForm[] = ((editing?.lines ?? []) as RequestLine[]).map((l) => ({
      itemId: String(l.itemId),
      partnerId: String(l.partnerId ?? editing?.partnerId ?? ''),
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      sourceLineId: l.sourceLineId ?? null,
      sourceNo: l.sourceOrderNo ?? undefined,
      sourceDate: l.sourceOrderDate ?? undefined,
    }))
    if (got.length === 0 && seed?.lines.length) got.push(...seed.lines)
    return [...got, ...Array.from({ length: Math.max(1, MIN_ROWS - got.length) }, emptyLine)]
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const itemOf = (id: string) => items.find((x) => String(x.id) === id)
  const partnerOf = (id: string) => partners.find((x) => String(x.id) === id)
  const itemPicks = useMemo(() => items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec, stopped: x.active === false })), [items])
  const partnerPicks = useMemo(() => partnerCodeItems(partners, true).map((p, i) => ({ ...p, value: String(partners[i].id) })), [partners])

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => {
      const next = ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
      /* 마지막 줄을 채우면 빈 줄을 하나 더 단다 — 원본 격자처럼 줄이 모자라지 않게. */
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
  }
  /** 원본: 품목을 고르면 품목의 구매처 · 구매단가가 따라온다(A002 → 1234567001 최고전자 · 299,000). */
  function pickItem(i: number, itemId: string) {
    const it = itemOf(itemId)
    const pp = it?.purchasePrice ?? 0
    setLine(i, {
      itemId,
      partnerId: it?.supplierId ? String(it.supplierId) : lines[i].partnerId,
      unitPrice: pp > 0 ? String(pp) : '',
    })
  }

  const filled = lines.filter((l) => l.itemId)
  const calc = lines.map((l) => {
    const supply = lineSupply(Number(l.quantity) || 0, Number(l.unitPrice) || 0)
    const vat = taxable ? roundWon(supply * 0.1) : 0
    return { supply, vat, total: supply + vat }
  })
  const sum = (k: 'supply' | 'vat' | 'total') => calc.reduce((a, c) => a + c[k], 0)
  const qtySum = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0)

  /*
   * 격자 툴바 — 원본 발주요청입력(E040314) 2026-10-13 실측 차례: 찾기(F3) · 정렬 · My품목 ▴ · 소요 · 주문 · 전표불러오기 ·
   * 재고불러오기 · 바코드 · 전표 바코드 · 검증.
   * - My품목: 담긴 것이 없으면 '등록된 MY품목이 없습니다. MY품목 설정에서 기본그룹을 설정하기 바랍니다.'
   * - 재고불러오기: 격자 [규격] 뒤에 전체수량 · 창고수량 열이 생긴다.
   * - 바코드: 누르면 켜져 주황(btn-warning)이 되고 '합산기본수량' 고르기가 붙는다.
   * - 소요(소요량계산 창) · 주문(주문서검색창) · 전표불러오기(메뉴 고르기 창)는 원본 창이 커서 아직 안 옮겼고, 전표 바코드 · 검증은 못 쟀다.
   */
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [stocks, setStocks] = useState<StockRow[] | null>(null)
  const [barcodeOn, setBarcodeOn] = useState(false)
  const [barcode, setBarcode] = useState('')
  const hit = (l: LineForm) => {
    const q = findText.trim().toLowerCase()
    if (!q || !l.itemId) return false
    const it = itemOf(l.itemId)
    return [it?.code, it?.name, partnerOf(l.partnerId)?.name].some((v) => (v ?? '').toLowerCase().includes(q))
  }
  function sortLines() {
    setLines((ls) => {
      const full = ls.filter((l) => l.itemId).sort((a, b) => (itemOf(a.itemId)?.code ?? '').localeCompare(itemOf(b.itemId)?.code ?? ''))
      return [...full, ...ls.filter((l) => !l.itemId)]
    })
  }
  function addLines(add: LineForm[]) {
    setLines((ls) => {
      const full = [...ls.filter((l) => l.itemId), ...add]
      return [...full, ...Array.from({ length: Math.max(1, MIN_ROWS - full.length) }, emptyLine)]
    })
  }
  async function applyMyItems() {
    const mine = (await api.get<MyItem[]>('/my-items').catch(() => ({ data: [] as MyItem[] }))).data
    if (mine.length === 0) return ecAlert('등록된 MY품목이 없습니다.\nMY품목 설정에서 기본그룹을 설정하기 바랍니다.')
    addLines(mine.map((m) => {
      const it = itemOf(String(m.itemId))
      return { itemId: String(m.itemId), partnerId: it?.supplierId ? String(it.supplierId) : '', quantity: String(m.defaultQty), unitPrice: String(m.unitPrice || it?.purchasePrice || '') }
    }))
  }
  async function loadStocks() {
    try { setStocks((await api.get<StockRow[]>('/stock')).data) } catch (e) { setError(extractErrorMessage(e)) }
  }
  const stockAll = (itemId: string) => (stocks ?? []).filter((x) => String(x.itemId) === itemId).reduce((a, x) => a + Number(x.quantity), 0)
  const stockWh = (itemId: string) => (stocks ?? []).filter((x) => String(x.itemId) === itemId && String(x.warehouseId) === warehouseId).reduce((a, x) => a + Number(x.quantity), 0)
  function scan() {
    const q = barcode.trim()
    if (!q) return
    const it = items.find((x) => x.barcode === q) ?? items.find((x) => x.code.toLowerCase() === q.toLowerCase())
    if (!it) return ecAlert(`'${q}' 에 해당하는 품목이 없습니다.`)
    const at = lines.findIndex((l) => l.itemId === String(it.id))
    if (at >= 0) setLine(at, { quantity: String((Number(lines[at].quantity) || 0) + 1) })
    else addLines([{ itemId: String(it.id), partnerId: it.supplierId ? String(it.supplierId) : '', quantity: '1', unitPrice: it.purchasePrice ? String(it.purchasePrice) : '' }])
    setBarcode('')
  }
  const notYet = (why: string) => ({ disabled: true, title: why })

  /**
   * after — 'close': 창을 닫는다(창 모드) · 'new': 빈 화면(화면 [저장(F8)] · 저장/신규) · 'keep': 저장/내용유지 ·
   * 'print': 저장/전표(F7) — 저장한 전표로 '발주요청서' 인쇄창을 띄우고 창이면 닫고 화면이면 비운다.
   */
  async function save(after: 'close' | 'new' | 'keep' | 'print' = page ? 'new' : 'close') {
    setError('')
    /* 인쇄창은 누른 순간 연다 — 저장을 기다린 뒤 열면 팝업 차단에 걸린다. 막히면 닫는다. */
    const win = after === 'print' ? openPrintWindow() : null
    if (filled.length === 0) {
      win?.close()
      void ecAlert(`아래의 경우 처리가 불가능합니다.\n자세한 내용은 아래의 사항을 참고하시기 바랍니다.\n아래 사항을 수정 후 다시 진행하시기 바랍니다.\n\n${docName}입력 - 그리드(표)에 최소 1줄 이상 입력되어야 합니다.`)
      return
    }
    /* 원본: 창고가 비면 문구 없이 그 칸만 빨갛게 두르고 저장하지 않는다. */
    if (!warehouseId && !priceRequest) { win?.close(); setWhMissing(true); return }
    const firstLinePartner = filled.find((l) => l.partnerId)?.partnerId
    const headPartner = headParty ? headPartnerId : firstLinePartner
    const body = {
      partnerId: headPartner ? Number(headPartner) : null,
      orderDate,
      dueDate: priceRequest ? null : dueDate || null,
      priceValidUntil: priceRequest ? validUntil || null : undefined,
      taxable,
      employeeId: employeeId ? Number(employeeId) : null,
      warehouseId: warehouseId ? Number(warehouseId) : null,
      projectId: projectId ? Number(projectId) : null,
      currency,
      remark: editing?.remark ?? null,
      lines: filled.map((l) => ({
        itemId: Number(l.itemId),
        quantity: Number(l.quantity) || 0,
        unitPrice: l.unitPrice === '' ? null : Number(l.unitPrice),
        partnerId: headParty ? (headPartnerId ? Number(headPartnerId) : null) : l.partnerId ? Number(l.partnerId) : null,
        sourceLineId: l.sourceLineId ?? null,
      })),
      plan: plan || undefined,
      order: order || undefined,
      priceRequest: priceRequest || undefined,
    }
    setSaving(true)
    try {
      const saved = (isEdit
        ? await api.put<PurchaseOrder>(`/purchase-orders/${editing!.id}`, body)
        : await api.post<PurchaseOrder>('/purchase-orders', body)).data
      if (after === 'print') await printDocuments([purchaseRequestDocument(saved)], win)
      if (page) { if (after !== 'keep') reset(plan) }
      else onSaved?.()
    } catch (e) {
      win?.close()
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!isEdit) return
    if (!(await ecConfirm(`전표를 삭제하겠습니까?\n- ${docName}`))) return
    try {
      await api.delete(`/purchase-orders/${editing!.id}`)
      onDeleted?.()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  /** 원본 발주계획입력은 저장 뒤 비울 때 입고될창고를 남긴다(2026-10-13 실측) — [다시 작성]은 다 비운다. */
  const reset = (keepWarehouse = false) => {
    setOrderDate(today()); setDueDate(today()); setEmployeeId(''); if (!keepWarehouse) setWarehouseId(''); setProjectId('')
    setCurrency('KRW'); setTaxable(true); setWhMissing(false); setLines(Array.from({ length: MIN_ROWS }, emptyLine)); setError('')
    setApplied(false); setPriceSrc(false); setHeadPartnerId(''); setValidUntil(today())
  }

  const body = (
    <>
      <div className="ec-form mb-[8px] grid grid-cols-2 gap-x-[24px] gap-y-[6px] mobile:grid-cols-1">
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">{plan ? '일자' : '일자-No.'}</span>
          <input type="date" className="ec-input w-[150px]" value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
            /* 원본 수정 창도 일자를 잠근다 — 번호가 일자에 묶여 있다. */
            disabled={isEdit} />
          {isEdit && <span className="text-ec-hint">{dateNo(editing!.orderDate, editing!.orderNo)}</span>}
        </label>
        {headParty && (
          <div className="flex items-center gap-[8px]">
            <span className="w-[93px] shrink-0 text-ec-label">거래처</span>
            <CodePickerField label="거래처" hideLabel width={240} emptyLabel="선택 안 함" placeholder="거래처"
              value={headPartnerId} onChange={setHeadPartnerId} items={partnerPicks} />
          </div>
        )}
        <div className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">담당자</span>
          <CodePickerField label="담당자" hideLabel width={240} emptyLabel="선택 안 함" placeholder="담당자"
            value={employeeId} onChange={setEmployeeId}
            items={pickers.employees.map((x) => ({ ...x, value: String(x.id) }))} />
        </div>
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">거래유형</span>
          <select className="ec-input w-[240px]" value={taxable ? 'VAT' : 'FREE'} onChange={(e) => setTaxable(e.target.value === 'VAT')}>
            <option value="VAT">부가세율 적용</option>
            <option value="FREE">부가세율 미적용</option>
          </select>
        </label>
        {!priceRequest && <div className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">{plan ? '입고될창고' : order ? '입고창고' : '창고'}</span>
          <div className={`inline-block${whMissing ? ' rounded-ec outline outline-1 outline-ec-danger' : ''}`} data-invalid={whMissing || undefined}>
            <CodePickerField label="창고" hideLabel width={240} emptyLabel="선택 안 함" placeholder={plan ? '입고될창고' : '창고'}
              value={warehouseId} onChange={(v) => { setWarehouseId(v); if (v) setWhMissing(false) }}
              items={pickers.warehouses} />
          </div>
        </div>}
        <div className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">프로젝트</span>
          <CodePickerField label="프로젝트" hideLabel width={240} emptyLabel="선택 안 함" placeholder="프로젝트"
            value={projectId} onChange={setProjectId} items={pickers.projects} />
        </div>
        <label className="flex items-center gap-[8px]">
          <span className="w-[93px] shrink-0 text-ec-label">통화</span>
          <select className="ec-input w-[240px]" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="KRW">내자</option>
            {currencies.filter((c) => c.code !== 'KRW').map((c) => <option key={c.id} value={c.code}>{c.code} {c.name}</option>)}
          </select>
        </label>
        {priceRequest ? (
          <label className="flex items-center gap-[8px]">
            <span className="w-[93px] shrink-0 text-ec-label">유효기간</span>
            <input type="date" className="ec-input w-[150px]" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </label>
        ) : (
          <label className="flex items-center gap-[8px]">
            <span className="w-[93px] shrink-0 text-ec-label">납기일자</span>
            <input type="date" className="ec-input w-[150px]" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        )}
      </div>

      <div className="ec-toolbar">
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFindOpen((v) => !v)}>찾기(F3)</button>
        {findOpen && <input className="ec-input w-[130px]" autoFocus value={findText} placeholder="품목 · 거래처" onChange={(e) => setFindText(e.target.value)} />}
        <button type="button" className="ec-btn ec-btn-sm" onClick={sortLines}>정렬</button>
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => void applyMyItems()}>My품목</button>
        <button type="button" className="ec-btn ec-btn-sm" {...notYet('소요량계산 창은 아직 없습니다.')}>소요</button>
        <button type="button" className="ec-btn ec-btn-sm" {...notYet('주문서검색창은 아직 없습니다.')}>주문</button>
        {plan && !applied && <button type="button" className="ec-btn ec-btn-sm" onClick={() => setPickOpen(true)}>발주요청</button>}
        {/* 원본 발주서입력 툴바: … 주문 · 계획 · 단가요청 · 전표불러오기 — [단가요청] 은 확정단가를 실어 줄을 채운다(2026-10-21 실측). */}
        {order && !applied && <button type="button" className="ec-btn ec-btn-sm" onClick={() => setPricePickOpen(true)}>단가요청</button>}
        {!applied && <button type="button" className="ec-btn ec-btn-sm" {...notYet('전표불러오기 메뉴 창은 아직 없습니다.')}>전표불러오기</button>}
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => void loadStocks()}>재고불러오기</button>
        {plan && <button type="button" className="ec-btn ec-btn-sm" {...notYet('품목별안전재고 불러오기는 아직 없습니다.')}>품목별안전재고</button>}
        <button type="button" className={`ec-btn ec-btn-sm${barcodeOn ? ' bg-[var(--ec-bg-tag)] border-[var(--ec-bg-tag)] text-ec-panel' : ''}`}
          onClick={() => setBarcodeOn((v) => !v)}>바코드</button>
        {barcodeOn && (
          <input className="ec-input w-[170px]" autoFocus value={barcode} placeholder="바코드/품목코드 후 Enter"
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scan() } }} />
        )}
        <button type="button" className="ec-btn ec-btn-sm" {...notYet('전표 바코드 출력은 아직 없습니다.')}>전표 바코드</button>
        <button type="button" className="ec-btn ec-btn-sm" {...notYet('원본 [검증] 결과 창을 아직 못 쟀습니다.')}>검증</button>
      </div>

      <table className="w-full text-left table-fixed">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[150px]">품목코드</th>
            <th>품목명</th>
            {!headParty && <th className="w-[150px]">거래처코드</th>}
            {!headParty && <th>거래처명</th>}
            <th className="w-[70px]">규격</th>
            {stocks && <th className="w-[80px] text-right">전체수량</th>}
            {stocks && <th className="w-[80px] text-right">창고수량</th>}
            <th className="w-[80px] text-right">수량</th>
            <th className="w-[100px] text-right">단가</th>
            <th className="w-[100px] text-right">공급가액</th>
            <th className="w-[80px] text-right">부가세</th>
            {!plan && !headParty && <th className="w-[100px] text-right">합계</th>}
            {srcHead && <th className="w-[90px] text-center">{srcHead[0]}</th>}
            {srcHead && <th className="w-[50px] text-center">{srcHead[1]}</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className={hit(l) ? 'bg-ec-blue-wash' : undefined}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>
                <CodePickerField label="품목" hideLabel fill placeholder="품목코드" emptyLabel="선택 해제"
                  value={l.itemId} onChange={(v) => pickItem(i, v)} items={itemPicks} />
              </td>
              <td>{itemOf(l.itemId)?.name ?? ''}</td>
              {!headParty && <td>
                <CodePickerField label="거래처" hideLabel fill placeholder="거래처코드" emptyLabel="선택 해제"
                  value={l.partnerId} onChange={(v) => setLine(i, { partnerId: v })} items={partnerPicks} />
              </td>}
              {!headParty && <td>{partnerOf(l.partnerId)?.name ?? ''}</td>}
              <td>{itemOf(l.itemId)?.spec ?? ''}</td>
              {stocks && <td className="text-right text-ec-hint">{l.itemId ? stockAll(l.itemId).toLocaleString('ko-KR') : ''}</td>}
              {stocks && <td className="text-right text-ec-hint">{l.itemId ? stockWh(l.itemId).toLocaleString('ko-KR') : ''}</td>}
              <td><EcNumInput className="ec-input w-full text-right" value={l.quantity} onValue={(v) => setLine(i, { quantity: v })} /></td>
              <td><EcNumInput className="ec-input w-full text-right" value={l.unitPrice} onValue={(v) => setLine(i, { unitPrice: v })} /></td>
              <td className="text-right">{l.itemId ? won(calc[i].supply) : ''}</td>
              <td className="text-right">{l.itemId ? won(calc[i].vat) : ''}</td>
              {!plan && !headParty && <td className="text-right">{l.itemId ? won(calc[i].total) : ''}</td>}
              {srcHead && <td className="text-center">{srcDate(l.sourceDate)}</td>}
              {srcHead && <td className="text-center">{srcNo(l.sourceNo)}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={(stocks ? 8 : 6) - (headParty ? 2 : 0)}></td>
            <td className="text-right">{qtySum.toLocaleString('ko-KR')}</td>
            <td></td>
            <td className="text-right">{won(sum('supply'))}</td>
            <td className="text-right">{won(sum('vat'))}</td>
            {!plan && !headParty && <td className="text-right">{won(sum('total'))}</td>}
            {srcHead && <td colSpan={2}></td>}
          </tr>
        </tfoot>
      </table>
      {pricePickOpen && (
        <PriceRequestPickModal onClose={() => setPricePickOpen(false)}
          onApply={(picked) => {
            setPricePickOpen(false); setApplied(true); setPriceSrc(true)
            addLines(picked.map((x) => copyLine(x.order, x.line)))
            if (!headPartnerId) setHeadPartnerId(String(picked[0].order.partnerId))
          }} />
      )}
      {pickOpen && (
        <RequestPickModal onClose={() => setPickOpen(false)}
          onApply={(picked) => {
            setPickOpen(false); setApplied(true)
            addLines(copyLines(picked))
            if (!warehouseId) { const wh = picked.find((o) => o.warehouseId)?.warehouseId; if (wh) setWarehouseId(String(wh)) }
          }} />
      )}
    </>
  )

  if (page) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); void save('new') }}>
        <EcSlipShell title={`${docName}입력`}
          actions={[
            { label: '저장(F8)', primary: true, submit: true, disabled: saving,
              menu: [{ label: '저장/내용유지', onClick: () => void save('keep') }, { label: '저장/신규', onClick: () => void save('new') }] },
            ...(plan ? [] : [{ label: '저장/전표(F7)', disabled: saving, onClick: () => void save('print') }]),
            { label: '다시 작성', onClick: () => reset() },
            { label: '리스트', onClick: () => onList?.() },
          ]}>
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          {body}
        </EcSlipShell>
      </form>
    )
  }

  return (
    <Modal open title={isEdit ? `${docName}입력(수정)` : `${docName}입력`} width={1040} onClose={() => onClose?.()} error={error}>
      {body}
      {/* 원본 단추줄 — 신규: 저장(F8) · 저장/전표(F7) · 다시 작성 · 닫기 / 수정: 저장(F8) · 저장/전표(F7) · 복사 · 이전 · 다음 · 닫기 · 삭제 · 보내기 · H */}
      <div className="mt-[10px] flex flex-wrap items-center gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void save()}>{saving ? '저장 중…' : '저장(F8)'}</button>
        {!plan && !order && <button type="button" className="ec-btn" disabled={saving} onClick={() => void save('print')}>저장/전표(F7)</button>}
        {isEdit ? <>
          <button type="button" className="ec-btn" onClick={() => onCopy?.(editing!)}>복사</button>
          <button type="button" className="ec-btn" onClick={() => onStep?.(1)}>이전</button>
          <button type="button" className="ec-btn" onClick={() => onStep?.(-1)}>다음</button>
          <button type="button" className="ec-btn" onClick={() => onClose?.()}>닫기</button>
          <button type="button" className="ec-btn" onClick={remove}>삭제</button>
          <button type="button" className="ec-btn" onClick={() => setHistoryOpen(true)}>H</button>
        </> : <>
          <button type="button" className="ec-btn" onClick={() => reset()}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={() => onClose?.()}>닫기</button>
        </>}
      </div>
      {historyOpen && isEdit && <SlipHistoryModal target="PURCHASE_ORDER" id={editing!.id} head={slipHeadLabel(editing!.orderDate, editing!.orderNo)} onClose={() => setHistoryOpen(false)} />}
    </Modal>
  )
}

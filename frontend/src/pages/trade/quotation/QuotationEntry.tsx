import { resolveSpecialPrice } from '../../../features/price/specialPrice'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../features/auth/AuthContext'
import { api, extractErrorMessage } from '../../../api/client'
import type { EmployeeMaster, Item, MyItem, Partner, Project, Quotation, Warehouse } from '../../../types/api'
import { openPrintWindow } from '../../../utils/print'
import { loadSupplierParty, printDocuments } from '../../../utils/printDocument'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import CustomFieldsPanel from '../../../components/CustomFieldsPanel'
import EcSlipShell, { type SlipAction } from '../../../components/EcSlipShell'
import EcDateField from '../../../components/EcDateField'
import EcNumInput from '../../../components/EcNumInput'
import Modal from '../../../components/Modal'
import DateChangeFn from '../../../features/datechange/DateChangeFn'
import { partnerCodeItems } from '../../../utils/codeItems'
import { isAnyPartner } from '../../../utils/anyPartner'
import { dateNo } from '../../../utils/dateNo'
import { lineSupply } from '../../../utils/lineSupply'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import { useSubmitting } from '../../../utils/useSubmitting'
import { SlipHistoryModal, SlipLastHistoryModal } from '../../../features/sliphistory/SlipHistoryModal'
import EcIcon from '../../../components/ui/EcIcon'
import { todayYmd } from '../../../utils/periods'
import { fmtNumber } from '../../../utils/format'

/**
 * 견적서입력 — 원본 영업관리 &gt; 견적서 &gt; <b>견적서입력</b>(E040201). 주문서입력 · 출하지시서입력과 같은 큰 입력 화면이다
 * (원본 견적서 메뉴 = 견적서조회 · 견적서입력 · 견적서현황 · 미주문현황, 데이터이관 루프 21 실측).
 *
 * 머리는 원본(2026-10-31 loginad 견적서조회 [신규(F2)] 창): 일자-No. · 거래처 · 담당자 · 출하창고 · 거래유형 · 통화 · 참조 · 결제조건 · <b>유효기간</b> · 첨부.
 * 참조 · 결제조건은 견적 요청(CreateQuotationRequest)에 자리가 없어 칸을 만들지 않았다(자료 없음). 프로젝트 · 적요는 저장하는 값이라 남긴다
 * (loginaa 견적서입력 머리에는 프로젝트가 있었다 — 회사 양식 차이).
 * 툴바도 원본 차례: 찾기(F3) · 정렬 · 거래내역보기(견적) · My품목 · 할인 · 재고불러오기 · 생성한전표 · 바코드 · 검증 · 이익계산 · 전표불러오기.
 * 줄: 품목코드 · 품목명 · 규격 · 수량 · 단가 · 공급가액 · 부가세 · 합계 · 적요(원본 2026-10-31 loginad 차례 — 3 × 1,001 → 3,003 · 300 · 3,303).
 * 품목을 고르면 수량은 비어 있고 단가는 품목 출고단가(특별단가가 있으면 그것). 줄 없이 저장하면 '알림' 창, 거래처가 비면 그 칸만 빨갛게,
 * 출하창고는 비워도 저장된다. 저장하면 말 없이 빈 칸으로 돌아간다(거래처는 비우고 창고 · 담당자 · 일자는 남긴다).
 * 메뉴 [견적서입력] 은 이 화면, 견적서조회의 [신규(F2)] · [일자-No.] 는 목록 위에 떠 있는 창(popup)으로 연다(원본 2026-10-31 — 판매조회 · 작업지시서조회와 같다).
 */

/** 견적서조회 위에 떠 있는 창으로 열 때. editId 가 null 이면 새 견적서. */
export interface QuotationEntryPopup {
  editId: number | null
  /** 창을 닫는다. changed 면 목록을 다시 읽는다(저장 · 삭제 뒤). */
  onClose: (changed: boolean) => void
  /** [이전] · [다음] — 목록에서 앞 · 뒤 견적으로 옮긴다(판매조회 창과 같은 잣대). */
  onMove: (dir: 'prev' | 'next') => void
  /** [복사] — 창 제목을 '견적서입력' 으로 돌린다. */
  onCopy?: () => void
}
const NOT_HERE = '이 기능은 이 ERP 에서 제공하지 않습니다.'

interface LineInput { itemId: string; quantity: string; unitPrice: string; remark: string; spec: string | null /* 줄 규격 — null = 품목 규격을 따라감, '' = 일부러 비움 */; name: string | null /* 줄 품목명 — null = 품목 이름을 따라감(원본은 고른 뒤 고쳐 쓴다) */ }
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', unitPrice: '', remark: '', spec: null, name: null })
const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]
const num = (s: string) => Number(s) || 0
const MEM_KEY = 'quotation-head'
interface GeneratedRow { itemCode: string; itemName: string; spec: string | null; quantity: number; remaining: number; slipType: string | null; slipDate: string | null; slipNo: string | null }

export default function QuotationEntry({ popup }: { popup?: QuotationEntryPopup }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editParam = popup ? (popup.editId == null ? null : String(popup.editId)) : params.get('edit')
  /** 창의 [저장/신규] · [저장/내용유지] — 저장하고 창을 닫지 않는다. 창에서 저장한 것이 있으면 닫을 때 목록을 다시 읽는다. */
  const afterSaveModeRef = useRef<'new' | 'keep' | null>(null)
  const savedRef = useRef(false)
  const { companyCode, user } = useAuth()

  // ── 마스터 ─────────────────────────────────────────────
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])

  // ── 머리 ──────────────────────────────────────────────
  const [date, setDate] = useState(todayYmd())
  const [partnerId, setPartnerId] = useState('')
  /** 임의거래처(12341234)에 고친 거래처명 — 고른 거래처 id 와 같이 들어 다른 거래처를 고르면 저절로 버려진다. */
  const [anyName, setAnyName] = useState<{ id: string; name: string } | null>(null)
  const [employeeId, setEmployeeId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [taxable, setTaxable] = useState(true)
  const [projectId, setProjectId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState<LineInput[]>(emptyLines)
  /** 수정 중인 견적. 있으면 저장이 POST 가 아니라 PUT 이다. */
  const [editing, setEditing] = useState<Quotation | null>(null)
  /** 빈 [거래처] — 원본 입력 화면들처럼 글 없이 그 칸만 빨갛게(판매 · 주문서와 같다). */
  const [partnerMissing, setPartnerMissing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(''), 3000) }

  // ── 툴바 ──────────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [verifyResult, setVerifyResult] = useState<string[] | null>(null)
  /** [H] · [최종이력] — QuotationService.HISTORY_TARGET 'QUOTATION'. */
  const [slipHistory, setSlipHistory] = useState<'H' | 'last' | null>(null)
  const [generated, setGenerated] = useState<GeneratedRow[] | null>(null)
  /** My품목(사용자별, 서버 /my-items) — 주문서입력 · 판매입력과 같은 목록을 쓴다. */
  const [myItems, setMyItems] = useState<MyItem[]>([])
  const [myItemsOpen, setMyItemsOpen] = useState(false)
  const [barcodeOpen, setBarcodeOpen] = useState(false)
  const [barcode, setBarcode] = useState('')

  const rememberedEmpRef = useRef('')
  const formRef = useRef<HTMLFormElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(gridRef, '견적서입력 명세 그리드', [lines.length])
  const afterSaveRef = useRef<'print' | null>(null)
  const printWinRef = useRef<Window | null>(null)

  const customers = useMemo(() => partners.filter((p) => p.type !== 'SUPPLIER'), [partners])
  const chosenPartner = partners.find((p) => String(p.id) === partnerId)
  const anyPartner = isAnyPartner(chosenPartner)
  /** 임의거래처 이름 칸의 값 — 고친 것이 없으면 마스터 이름('임의거래처'). 원본 견적 11/21-2 '경동상회'(2026-10-28 실측). */
  const anyPartnerName = anyPartner ? (anyName?.id === partnerId ? anyName.name : chosenPartner?.name ?? '') : ''
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
      try { return JSON.parse(localStorage.getItem(`ec-quote-hd:${companyCode ?? '-'}:${user?.username ?? '-'}`) ?? '{}') } catch { return {} }
    }
  }

  async function loadMyItems() {
    try { setMyItems((await api.get<MyItem[]>('/my-items')).data) } catch { setMyItems([]) }
  }

  useEffect(() => {
    void loadMyItems()
    api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
    api.get<EmployeeMaster[]>('/sales-reps').then((r) => setEmployees(r.data.filter((e) => e.active !== false))).catch(() => {})
    void (async () => {
      const [p, w, i] = await Promise.all([api.get<Partner[]>('/partners'), api.get<Warehouse[]>('/warehouses'), api.get<Item[]>('/items')])
      setPartners(p.data); setWarehouses(w.data); setItems(i.data)
      if (editParam) return
      /* 새 전표는 마지막으로 쓴 머리(일자 · 담당자 · 창고)를 채운다 — 주문서입력과 같다. 견적의 창고는 필수가 아니라 기억이 없으면 비워 둔다. */
      const hd = await readHd()
      rememberedEmpRef.current = hd.employeeId ?? ''
      if (hd.warehouseId && w.data.some((x) => String(x.id) === hd.warehouseId && x.active)) setWarehouseId((prev) => prev || hd.warehouseId!)
      if (hd.date && /^\d{4}-\d{2}-\d{2}$/.test(hd.date)) setDate(hd.date)
      if (hd.employeeId) setEmployeeId((prev) => prev || hd.employeeId!)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** `?edit=<id>` — 견적 하나를 받아 펼친다. 단건 API 가 없어 목록(전 기간)에서 찾는다. */
  useEffect(() => {
    if (!editParam) return
    api.get<Quotation[]>('/quotations')
      .then((r) => {
        const q = r.data.find((x) => String(x.id) === editParam)
        if (q) openQuote(q)
        else setError('견적서를 찾을 수 없습니다.')
      })
      .catch((err) => setError(extractErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam])

  function openQuote(q: Quotation) {
    setError(''); setPartnerMissing(false)
    setEditing(q)
    setDate(q.quoteDate); setValidUntil(q.validUntil ?? '')
    setPartnerId(String(q.partnerId))
    setAnyName({ id: String(q.partnerId), name: q.partnerName ?? '' })
    setTaxable(q.vatAmount > 0 || q.supplyAmount === 0); setRemark(q.remark ?? '')
    setWarehouseId(q.warehouseId ? String(q.warehouseId) : '')
    setProjectId(q.projectId ? String(q.projectId) : '')
    setEmployeeId(q.employeeId ? String(q.employeeId) : '')
    setLines([...q.lines.map((l) => ({ itemId: String(l.itemId), quantity: String(l.quantity), unitPrice: String(l.unitPrice), remark: l.remark ?? '', spec: l.spec ?? null, name: l.itemName && l.itemName !== itemById.get(String(l.itemId))?.name ? l.itemName : null })), emptyLine(), emptyLine()])
  }

  // ── 줄 편집 ───────────────────────────────────────────
  async function applySpecialPrice(idx: number, itemId: string, partnerOverride?: string) {
    const p = await resolveSpecialPrice('SALES', itemId, partnerOverride ?? partnerId)
    if (p == null) return
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, unitPrice: String(p) } : l)))
  }
  /** 거래처를 고르면 담긴 품목의 특별단가를 다시 찾는다 — 품목을 먼저 담아도 걸리게(49회차). */
  function choosePartner(v: string) {
    setPartnerId(v); if (v) setPartnerMissing(false)
    if (!v) return
    lines.forEach((l, i) => { if (l.itemId) void applySpecialPrice(i, l.itemId, v) })
  }
  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId') next[idx] = { ...next[idx], spec: null, name: null } // 품목을 새로 고르면 규격도 품목 규격으로 다시 채운다(원본)
      if (field === 'itemId' && value) {
        /* 원본: 품목을 고르면 수량은 비어 있고 단가는 품목 출고단가(없으면 0). */
        const it = itemById.get(value)
        next[idx] = { ...next[idx], unitPrice: String(it?.unitPrice ?? 0) }
        void applySpecialPrice(idx, value)
        if (idx === ls.length - 1) next.push(emptyLine())
      }
      return next
    })
  }
  function removeLine(idx: number) {
    setLines((ls) => (ls.length <= 3 ? ls.map((l, i) => (i === idx ? emptyLine() : l)) : ls.filter((_, i) => i !== idx)))
  }

  /* 부가세는 줄마다 원 단위로 반올림해 더한다 — 서버(QuotationService)가 그렇게 저장한다. ÷10 은 ×0.1 의 부동소수 오차를 피하려는 것. */
  const computed = lines.map((l) => {
    const supply = lineSupply(num(l.quantity), num(l.unitPrice))
    const vat = taxable ? Math.round(supply / 10) : 0
    return { supply, vat, total: supply + vat }
  })
  const lineCount = lines.filter((l) => l.itemId).length
  const totals = computed.reduce<{ qty: number; supply: number; vat: number; total: number }>((a, c, i) => (lines[i].itemId
    ? { qty: a.qty + num(lines[i].quantity), supply: a.supply + c.supply, vat: a.vat + c.vat, total: a.total + c.total } : a),
  { qty: 0, supply: 0, vat: 0, total: 0 })

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
      const filled: LineInput = { itemId, quantity: String(qty), unitPrice: String(price ?? it.unitPrice ?? 0), remark: '', spec: null, name: null }
      const blank = ls.findIndex((l) => !l.itemId)
      if (blank >= 0) return ls.map((l, i) => (i === blank ? filled : l))
      return [...ls, filled, emptyLine()]
    })
    return true
  }

  // ── 툴바 동작 ─────────────────────────────────────────
  /** My품목을 통째로 명세에 담는다(품목별 기본수량 그대로) — 주문서입력과 같다. */
  function applyMyItems() {
    if (myItems.length === 0) return flash('My품목이 비어 있습니다. 주문서입력 · 판매입력 명세의 [★]로 담아 두세요.')
    setLines((ls) => [...ls.filter((l) => l.itemId),
      ...myItems.map((m) => ({ itemId: String(m.itemId), quantity: String(m.defaultQty), unitPrice: String(m.unitPrice), remark: '', spec: null, name: null })), emptyLine()])
    setMyItemsOpen(false)
    flash(`My품목 ${myItems.length}건을 명세에 담았습니다.`)
  }
  async function removeMyItem(itemId: number) {
    try { await api.delete(`/my-items/${itemId}`); flash('My품목에서 뺐습니다.'); await loadMyItems() }
    catch (err) { setError(extractErrorMessage(err)) }
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
  function sortLines() {
    setLines((ls) => {
      const filled = ls.filter((l) => l.itemId)
      const blanks = ls.filter((l) => !l.itemId)
      filled.sort((a, b) => (itemById.get(a.itemId)?.code ?? '').localeCompare(itemById.get(b.itemId)?.code ?? ''))
      return [...filled, ...blanks]
    })
    flash('품목코드 순으로 정렬했습니다.')
  }
  function verify() {
    const msgs: string[] = []
    if (!partnerId) msgs.push('거래처를 선택하세요.')
    lines.forEach((l, i) => {
      if (!l.itemId) return
      if (num(l.quantity) <= 0) msgs.push(`${i + 1}행: 수량이 0입니다.`)
      if (num(l.unitPrice) <= 0) msgs.push(`${i + 1}행: 단가가 0입니다.`)
    })
    if (lineCount === 0) msgs.push('품목을 1줄 이상 입력하세요.')
    setVerifyResult(msgs)
  }
  async function openGenerated() {
    if (!editing) return
    try { setGenerated((await api.get<GeneratedRow[]>(`/quotations/${editing.id}/generated`)).data) }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  // ── 저장 ──────────────────────────────────────────────
  function reset(keepHeader = false) {
    setLines(emptyLines()); setRemark(''); setValidUntil(''); setError(''); setPartnerMissing(false)
    if (!keepHeader) { setPartnerId(''); setProjectId(''); setEmployeeId(rememberedEmpRef.current) }
  }

  async function printSaved(q: Quotation, win: Window | null) {
    const p = partners.find((x) => x.id === q.partnerId)
    const company = await loadSupplierParty()
    await printDocuments([{
      title: '견 적 서',
      docNo: q.quoteNo,
      docDate: q.quoteDate,
      supplier: company ?? { label: '공급자', name: '(회사정보 미등록)' },
      customer: { label: '수신처', name: q.partnerName, bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem, tel: p?.phone, address: p?.address },
      extra: [{ label: '유효기간', value: q.validUntil }, { label: '담당', value: q.employeeName }],
      remark: q.remark,
      lines: q.lines.map((l) => ({ itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
        quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount })),
      footNote: '아래와 같이 견적합니다.',
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
    setError('')
    const kept = lines.filter((l) => l.itemId)
    if (kept.length === 0) {
      void ecAlert('아래의 경우 처리가 불가능합니다.\n자세한 내용은 아래의 사항을 참고하시기 바랍니다.\n아래 사항을 수정 후 다시 진행하시기 바랍니다.\n\n'
        + `${date.replace(/-/g, '')} 견적서입력 - 그리드(표)에 최소 1줄 이상 입력되어야 합니다.`)
      return
    }
    if (!partnerId) { setPartnerMissing(true); return }
    const body = {
      partnerId: Number(partnerId), partnerName: anyPartner ? anyPartnerName : null, quoteDate: date,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      projectId: projectId ? Number(projectId) : undefined,
      employeeId: employeeId ? Number(employeeId) : undefined,
      validUntil: validUntil || undefined, taxable, remark: remark || undefined,
      lines: kept.map((l) => ({ itemId: Number(l.itemId), quantity: num(l.quantity), unitPrice: num(l.unitPrice), remark: l.remark || undefined, spec: l.spec ?? undefined, itemName: l.name ?? undefined })),
    }
    try {
      const saved = editing
        ? (await api.put<Quotation>(`/quotations/${editing.id}`, body)).data
        : (await api.post<Quotation>('/quotations', body)).data
      if (!editing) {
        rememberedEmpRef.current = employeeId
        const hd = JSON.stringify({ date, employeeId, warehouseId })
        api.put(`/me/memory/${MEM_KEY}`, { value: hd }).catch(() => {
          try { localStorage.setItem(`ec-quote-hd:${companyCode ?? '-'}:${user?.username ?? '-'}`, hd) } catch { /* 무시 */ }
        })
      }
      if (afterSaveRef.current === 'print') {
        const win = printWinRef.current
        printWinRef.current = null; afterSaveRef.current = null
        if (saved?.lines) void printSaved(saved, win)
        else win?.close()
      }
      const mode = afterSaveModeRef.current
      afterSaveModeRef.current = null
      savedRef.current = true
      /* [저장/내용유지] — 저장하고 그 견적의 수정으로 바뀐다(판매입력과 같다). */
      if (mode === 'keep') { if (saved?.lines) openQuote(saved); return }
      /* 조회 위의 창 — 말 없이 닫히고 목록이 다시 읽힌다. [저장/신규] 는 창을 남기고 빈 칸으로. */
      if (popup && mode !== 'new') { popup.onClose(true); return }
      /* 수정은 조회에서 들어온 길이다 — 저장하면 말 없이 목록으로 돌아간다. */
      if (editing && !popup && mode !== 'new') { navigate('/sales/quotations'); return }
      /* 원본 견적서입력 [저장(F8)] — 말 없이 빈 칸으로 돌아간다. 번호는 견적서조회에서 본다. */
      if (editing) setEditing(null)
      reset(true)
      setPartnerId('')
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function removeEditing() {
    if (!editing || !(await ecConfirm('전표를 삭제하겠습니까?\n- 견적서'))) return
    try { await api.delete(`/quotations/${editing.id}`); if (popup) popup.onClose(true); else navigate('/sales/quotations') }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  /** 수정 중 [복사] — 같은 내용이 새 견적서가 된다(일자 오늘, 번호는 저장할 때 받는다). */
  function copyEditing() {
    setEditing(null); setDate(todayYmd()); setPartnerMissing(false); setError('')
    if (popup) popup.onCopy?.()
    else navigate('/sales/quotation-entry', { replace: true })
  }
  /** 리스트로 — 품목을 넣은 채면 원본 알림을 먼저 띄운다(주문서입력과 같다). */
  async function toList() {
    if (!editing && lines.some((l) => l.itemId) && !(await ecConfirm('작성한 내용이 저장되지 않았습니다. 페이지를 벗어나겠습니까?'))) return
    if (popup) popup.onClose(savedRef.current)
    else navigate('/sales/quotations')
  }

  /*
   * 원본 아래 줄(2026-10-31 loginad 견적서조회 [신규(F2)] · 일자-No. 창):
   *   신규 — ✈ · 저장(F8)▲(저장/전자결재 · 저장/내용유지 · 저장/신규) · 저장/전표(F7) · 다시 작성 · 닫기 · 웹자료올리기
   *   수정 — ✈ · 저장(F8)▾ · 저장/전표(F7)▲(명세서) · 복사 · 이전 · 다음 · 닫기 · 삭제 · 보내기▲ · H · 최종이력
   * 메뉴 [견적서입력] 화면(창이 아님)은 [닫기] 자리에 [리스트] 를 두고, 이전 · 다음은 창에서만 선다(목록이 있어야 옮긴다).
   * ✈ · 저장/전자결재 · 명세서 · 보내기 펼침 항목은 받쳐 줄 것이 없어 안내만 한다(보내기 펼침 항목은 원본 창에서 못 봐 견적서조회 [보내기 ▲] 와 같게 둔다).
   */
  const notHere = (what: string) => () => void ecAlert(`${NOT_HERE}\n(${what})`)
  const sendAction: SlipAction = { label: '보내기', icon: 'send', onClick: notHere('전표 보내기') }
  const saveMenu = [
    { label: '저장/전자결재', onClick: notHere('저장/전자결재') },
    { label: '저장/내용유지', onClick: () => { afterSaveModeRef.current = 'keep'; formRef.current?.requestSubmit() } },
    { label: '저장/신규', onClick: () => { afterSaveModeRef.current = 'new'; formRef.current?.requestSubmit() } },
  ]
  const closeAction: SlipAction = popup ? { label: '닫기', onClick: () => void toList() } : { label: '리스트', onClick: () => void toList() }
  const actions: SlipAction[] = editing ? [
    sendAction,
    { label: '저장(F8)', primary: true, submit: true, menu: saveMenu },
    { label: '저장/전표(F7)', onClick: saveAndPrint, menu: [{ label: '명세서', onClick: notHere('명세서') }] },
    { label: '복사', onClick: copyEditing },
    ...(popup ? [{ label: '이전', onClick: () => popup.onMove('prev') }, { label: '다음', onClick: () => popup.onMove('next') }] : []),
    closeAction,
    { label: '삭제', onClick: () => void removeEditing() },
    { label: '보내기', menu: ['E Note', '대화방', '사용자', '북마크'].map((l) => ({ label: l, onClick: notHere(`보내기 › ${l}`) })) },
    { label: 'H', onClick: () => setSlipHistory('H') },
    { label: '최종이력', onClick: () => setSlipHistory('last') },
  ] : [
    sendAction,
    { label: '저장(F8)', primary: true, submit: true, menu: saveMenu },
    { label: '저장/전표(F7)', onClick: saveAndPrint },
    { label: '다시 작성', onClick: () => reset(false) },
    closeAction,
    { label: '웹자료올리기', disabled: true, disabledReason: '파일 첨부는 [전자결재·드라이브]에서 씁니다.' },
  ]
  /** 원본에 있으나 견적서에는 아직 없는 기능 — 흐리게 두고 이유를 단다(주문서입력과 같은 방식). */
  const todo = (why: string) => ({ disabled: true, title: why })

  return (
    <form ref={formRef} onSubmit={submitting.wrap(submit)}>
      <EcSlipShell
        title={editing ? '견적서수정' : '견적서입력'}
        formTabs={[{ id: 'main', label: '기본(수정불가)' }]}
        activeFormTab="main"
        onAddTab={() => flash('탭 추가는 [Self-Customizing > 입력양식]에서 설정합니다.')}
        /* 원본 머리 [기본(수정불가)▾] · [Option] · [도움말](2026-10-31 loginad 견적서입력 창 — 판매입력과 같은 꼴). */
        layouts={{
          label: '기본(수정불가)',
          items: [
            { label: '✓ 기본(수정불가)' },
            { label: '신규양식추가', onClick: () => flash('탭 추가는 [Self-Customizing > 입력양식]에서 설정합니다.') },
          ],
        }}
        plainOption
        options={[
          { label: '입력값 초기화', onClick: () => reset(false) },
        ]}
        actions={actions}
        busy={submitting.busy}
        help={
          <ul className="pl-[16px] m-0">
            <li>이카운트 <b>견적서입력</b> 구조를 따릅니다 — 헤더 항목 폼 · 명세 그리드 · 하단 버튼줄.</li>
            <li>저장하면 말 없이 빈 칸으로 돌아갑니다(거래처는 비우고 출하창고는 남깁니다). 번호는 [리스트](견적서조회)에서 봅니다.</li>
            <li>출하창고는 비워도 저장됩니다. 주문서로 넘길 때 정합니다.</li>
            <li>흐리게 보이는 버튼은 원본에 있으나 아직 연결되지 않은 기능입니다.</li>
          </ul>
        }
      >
        {/* ── 헤더 항목 폼 ─────────────────────────────────── */}
        <ul className="ec-form [&>li>.title]:basis-[120px]">
          <li>
            <div className="title">일자-No.</div>
            <div className="form flex items-center gap-[6px]">
              <EcDateField value={date} onChange={setDate} disabled={editing != null} />
              {editing && <span className="text-ec-label">{dateNo(editing.quoteDate, editing.quoteNo)}</span>}
              {editing && <DateChangeFn date={date} onSubmit={async (d) => { const r = await api.post<Quotation>(`/quotations/${editing.id}/change-date`, { date: d }); setEditing(r.data); setDate(d) }} />}
            </div>
          </li>
          <li>
            <div className="title">거래처<span className="req">*</span></div>
            <div className="form">
              <div className={`inline-block${partnerMissing ? ' rounded-ec outline outline-1 outline-ec-danger' : ''}`} data-invalid={partnerMissing || undefined}>
                <CodePickerField label="거래처" hideLabel pair value={partnerId} onChange={choosePartner} items={partnerCodeItems(customers, true)}
                {...(anyPartner ? { nameValue: anyPartnerName, onNameChange: (n: string) => setAnyName({ id: partnerId, name: n }) } : {})} />
              </div>
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
            <div className="title">출하창고</div>
            <div className="form">
              <CodePickerField label="출하창고" hideLabel pair value={warehouseId} onChange={setWarehouseId}
                               items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location, stopped: !w.active }))} />
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
              {/* 견적 요청에 통화 · 환율 자리가 없다 — 내자만 둔다(주문서입력과 같다). */}
              <select className="ec-input w-[80px]" value="D" onChange={() => {}} aria-label="통화" title="외자 견적서는 아직 없습니다."><option value="D">내자</option></select>
            </div>
          </li>
          {/* 원본 차례: 통화 · 참조 · 결제조건 · <b>유효기간</b> · 첨부. 참조 · 결제조건은 저장할 자리가 없어 칸을 두지 않는다. */}
          <li>
            <div className="title">유효기간</div>
            <div className="form"><EcDateField value={validUntil} onChange={setValidUntil} /></div>
          </li>
          <li>
            <div className="title">프로젝트</div>
            <div className="form">
              <CodePickerField label="프로젝트" hideLabel pair value={projectId} onChange={setProjectId}
                               items={projects.filter((pj) => pj.active !== false || String(pj.id) === projectId).map((pj) => ({ value: String(pj.id), code: pj.code, name: pj.name }))} />
            </div>
          </li>
          <li>
            <div className="title">첨부</div>
            <div className="form"><button type="button" className="ec-btn ec-btn-sm" {...todo('파일 첨부는 [전자결재·드라이브]에서 씁니다.')}>첨부</button></div>
          </li>
          {/* 원본 머리 끝 [새로운 항목 추가] — 견적서에 찍힐 비고(quotations.remark). 예전엔 [Option] › 추가항목 펼치기 안에 숨어 있었다(2026-10-29 QA). */}
          <li className="wide">
            <div className="title">적요</div>
            <div className="form"><input className="ec-input flex-1" aria-label="머리 적요" maxLength={500} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="새로운 항목 추가" /></div>
          </li>
        </ul>

        {/* ── 명세 탭 + 툴바 ───────────────────────────────── */}
        <ul className="ec-tabs mt-[10px]"><li className="ec-tab active">견적</li></ul>
        <div className="ec-toolbar">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFindOpen((v) => !v)}>찾기(F3)</button>
          {findOpen && <input className="ec-input w-[130px] h-[23px]" autoFocus value={findText} placeholder="품목명·품목코드" onChange={(e) => setFindText(e.target.value)} />}
          <button type="button" className="ec-btn ec-btn-sm" onClick={sortLines}>정렬</button>
          <button type="button" className="ec-btn ec-btn-sm" {...todo('거래처별 지난 견적 보기는 아직 없습니다 — 견적서조회에서 거래처 조건으로 봅니다.')}>거래내역보기(견적)</button>
          <span className="relative inline-flex">
            <button type="button" className="ec-btn ec-btn-sm" onClick={applyMyItems}>My품목{myItems.length > 0 ? ` (${myItems.length})` : ''}</button>
            <button type="button" className="ec-btn ec-btn-sm ec-btn-arrow" aria-label="My품목 목록" onClick={() => setMyItemsOpen((v) => !v)}><EcIcon name="caret-down" size={10} glyph="▾" /></button>
            {myItemsOpen && (
              <div className="ec-menu absolute top-full left-0 z-30 mt-[2px] min-w-[280px] p-[6px]">
                {myItems.length === 0 ? (
                  <div className="py-[8px] px-[6px] text-[12px] text-ec-hint">비어 있습니다. 주문서입력 · 판매입력 명세의 [★]로 담아 두세요.</div>
                ) : myItems.map((m) => (
                  <div key={m.id} className="flex items-center gap-[6px] py-[3px] px-[4px] text-[12px]">
                    <button type="button" className="ec-btn ec-btn-sm flex-1 justify-start"
                            onClick={() => { addItemLine(String(m.itemId), m.defaultQty, m.unitPrice); setMyItemsOpen(false) }}>
                      {m.itemCode} {m.itemName} · {m.defaultQty}
                    </button>
                    <button type="button" className="ec-btn ec-btn-sm" title="My품목에서 빼기" onClick={() => void removeMyItem(m.itemId)}><EcIcon name="close" size={12} glyph="✕" /></button>
                  </div>
                ))}
              </div>
            )}
          </span>
          <button type="button" className="ec-btn ec-btn-sm" {...todo('견적서에는 할인 금액조정이 없습니다.')}>할인</button>
          <button type="button" className="ec-btn ec-btn-sm" {...todo('견적서입력에서 재고를 불러오는 기능은 아직 없습니다.')}>재고불러오기</button>
          <button type="button" className="ec-btn ec-btn-sm" disabled={!editing} title={editing ? undefined : '저장한 견적서를 열었을 때만 쓸 수 있습니다.'} onClick={() => void openGenerated()}>생성한전표</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setBarcodeOpen((v) => !v)}>바코드</button>
          {barcodeOpen && (
            <input className="ec-input w-[170px] h-[23px]" autoFocus value={barcode} placeholder="바코드/품목코드 후 Enter"
                   onChange={(e) => setBarcode(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanBarcode() } }} />
          )}
          <button type="button" className="ec-btn ec-btn-sm" onClick={verify}>검증</button>
          <button type="button" className="ec-btn ec-btn-sm" {...todo('견적서입력의 이익계산은 아직 없습니다 — 판매입력에서 합니다.')}>이익계산</button>
          <button type="button" className="ec-btn ec-btn-sm" {...todo('다른 전표를 복사해 오는 기능은 아직 없습니다.')}>전표불러오기</button>
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
              <col className="w-[26px]" /><col className="w-[100px]" /><col className="w-[200px]" /><col className="w-[110px]" />
              <col className="w-[78px]" /><col className="w-[96px]" /><col className="w-[110px]" /><col className="w-[96px]" /><col className="w-[100px]" /><col className="w-[140px]" />
              <col className="w-[30px]" />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th className="text-left">품목코드</th><th className="text-left">품목명</th><th className="text-left">규격</th>
                <th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th>
                <th className="text-right">부가세</th><th className="text-right">합계</th><th className="text-left">적요</th><th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const it = itemById.get(l.itemId)
                const needle = findText.trim().toLowerCase()
                const hit = !needle || `${it?.name ?? ''} ${it?.code ?? ''}`.toLowerCase().includes(needle)
                return (
                  <tr key={idx} data-export-skip={l.itemId ? undefined : 'true'} className={hit ? undefined : 'hidden'}>
                    <td className="text-center text-ec-hint">{idx + 1}</td>
                    <td className="pad text-ec-label overflow-hidden whitespace-nowrap">{it?.code ?? ''}</td>
                    <td className="pad">
                      {l.itemId ? (
                        /* 원본 견적서입력: 품목을 고르면 품목명 칸이 글자 칸이 되어 줄마다 이름을 고쳐 쓴다(임의품목 Z00007). 고르기 전에는 검색 칸. */
                        <div className="flex">
                          <input className="cell" placeholder="품목 선택" value={l.name ?? it?.name ?? ''} maxLength={200} onChange={(e) => updateLine(idx, 'name', e.target.value)} />
                          <button type="button" className="no-ec border-0 bg-transparent cursor-pointer text-ec-hint" title="품목 다시 고르기" onClick={() => updateLine(idx, 'itemId', '')}><EcIcon name="search" /></button>
                        </div>
                      ) : (
                        <CodePickerField label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제" value={l.itemId}
                                         onChange={(v) => updateLine(idx, 'itemId', v)} items={codeItems} />
                      )}
                    </td>
                    <td><input className="cell" value={l.spec ?? it?.spec ?? ''} maxLength={200} disabled={!l.itemId} onChange={(e) => updateLine(idx, 'spec', e.target.value)} /></td>
                    <td><EcNumInput className="cell text-right" value={l.quantity} onValue={(v) => updateLine(idx, 'quantity', v)} /></td>
                    <td><EcNumInput className="cell text-right" value={l.unitPrice} onValue={(v) => updateLine(idx, 'unitPrice', v)} /></td>
                    <td className="pad text-right">{l.itemId ? fmtNumber(computed[idx].supply) : ''}</td>
                    <td className="pad text-right">{l.itemId ? fmtNumber(computed[idx].vat) : ''}</td>
                    <td className="pad text-right font-semibold text-ec-text">{l.itemId ? fmtNumber(computed[idx].total) : ''}</td>
                    <td><input className="cell" value={l.remark} disabled={!l.itemId} onChange={(e) => updateLine(idx, 'remark', e.target.value)} /></td>
                    <td className="text-center">
                      {l.itemId && <button type="button" onClick={() => removeLine(idx)} className="no-ec border-0 bg-transparent cursor-pointer text-ec-hint"><EcIcon name="close" size={12} glyph="✕" /></button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td colSpan={3} className="pl-[6px]">합계 ({lineCount}건)</td>
                <td className="text-right">{fmtNumber(totals.qty)}</td>
                <td />
                <td className="text-right">{fmtNumber(totals.supply)}</td>
                <td className="text-right">{fmtNumber(totals.vat)}</td>
                <td className="text-right font-bold text-ec-blue">{fmtNumber(totals.total)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 추가항목(사용자정의) — Self-Customizing › 사용자정의필드의 [견적서] 정의가 있으면 여기 뜬다(저장된 견적만). */}
        {editing && <div className="pt-[6px]"><CustomFieldsPanel entityType="QUOTE" entityId={editing.id} /></div>}

        {error && <p className="ec-alert ec-alert-danger mt-[10px]">{error}</p>}
      </EcSlipShell>

      {/* 원본 견적서 [H](2026-10-21 실측): 판매와 같은 꼴 — 머리 '[20261021-4]', 전표상태 '확인' · 진행상태 '진행중' · 행위, 보안 · 발송이력 */}
      {slipHistory === 'H' && editing && (
        <SlipHistoryModal target="QUOTATION" id={editing.id} withSections confirmLabel="확인"
                          head={`[${editing.quoteDate.replace(/-/g, '')}-${Number(editing.quoteNo.split('-').pop()) || editing.quoteNo}]`}
                          onClose={() => setSlipHistory(null)} />
      )}
      {slipHistory === 'last' && editing && <SlipLastHistoryModal target="QUOTATION" id={editing.id} onClose={() => setSlipHistory(null)} />}

      <Modal open={generated != null} title="생성한 전표" width={760} onClose={() => setGenerated(null)}>{generated && editing && (
        <div>
          <p className="mb-[6px]">견적서조회 : {dateNo(editing.quoteDate, editing.quoteNo)}</p>
          <table className="w-full text-left">
            <thead><tr>
              <th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th className="text-right">잔량</th>
              <th>생성한 전표</th><th>생성한 전표일자-No.</th>
            </tr></thead>
            <tbody>
              {generated.map((r, i) => (
                <tr key={i}>
                  <td>{r.itemCode}</td><td>{r.itemName}</td><td>{r.spec ?? ''}</td>
                  <td className="text-right">{fmtNumber(r.quantity)}</td><td className="text-right">{r.remaining ? fmtNumber(r.remaining) : ''}</td>
                  <td>{r.slipType ?? ''}</td><td>{r.slipDate && r.slipNo ? dateNo(r.slipDate, r.slipNo) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[8px]"><button type="button" className="ec-btn" onClick={() => setGenerated(null)}>닫기</button></div>
        </div>
      )}</Modal>
    </form>
  )
}

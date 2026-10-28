import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, Item, MyItem, Partner, Project, SalesDoc, Warehouse } from '../../types/api'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import EcSlipShell, { type SlipAction } from '../../components/EcSlipShell'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import Modal from '../../components/Modal'
import { partnerCodeItems } from '../../utils/codeItems'
import { dateNo } from '../../utils/dateNo'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { SlipHistoryModal, slipHeadLabel } from '../../features/sliphistory/SlipHistoryModal'
import SourceDocSearch from '../../features/slipload/components/SourceDocSearch'

/**
 * 출하지시서입력(E040220) — 원본 영업관리 &gt; 출하지시서 &gt; <b>출하지시서입력</b>(2026-10-28 데이터이관 루프 18 실측).
 * 판매입력 · 주문서입력과 같은 큰 입력 화면이다(예전에는 출하지시서조회의 작은 창이었다).
 *
 * 머리: 일자-No. · 거래처 · 담당자 · 출하창고 · 프로젝트 · 연락처 · 출하예정일 · 우편번호 · 주소. 일자는 연/월/일 칸(EcDateField),
 * 거래처 · 담당자 · 창고 · 프로젝트는 코드칸(코드도움). 줄: 품목코드(코드 J001) · 품목명 · 규격 · 수량 · 적요 — 단가 · 금액은 없다.
 * 툴바(원본 차례): 찾기 · 정렬 · My품목 · 판매 · 재고불러오기 · 생성한전표 · 바코드 · 전표 바코드 · 검증 · 전표불러오기.
 * 품목 코드도움은 사용중단 품목도 담는다 — [사용중단포함] 으로 J001 · J002 를 넣는다(2cb70643).
 *
 * [판매] = 원본 '판매검색창(조회)'(루프 27 실측) — 출하지시서가 안 걸린 판매(일자까지)를 담는다. 담으면 일자 그대로 · 거래처 ·
 * 담당자 · 프로젝트(판매의 것) · 출하창고(판매 창고) · 연락처(거래처의 것) · 출하예정일 오늘 · 줄, 툴바에서 [판매] 가 빠진다.
 * 저장하면 그 줄이 판매에 걸려(shipment_order_lines.sales_id) 판매검색창에서 빠진다.
 *
 * 저장은 말 없이 빈 칸으로 돌아간다(창고는 남긴다). 출하지시서조회의 [신규(F2)] · [일자-No.](`?edit=`) 가 이 화면으로 온다.
 */

interface LineInput { id: number | null; itemId: string; quantity: string; remark: string; salesId?: number | null }
const emptyLine = (): LineInput => ({ id: null, itemId: '', quantity: '', remark: '' })
/** 판매검색창 알약 — 원본 전체 · 결재중 · 미확인 · 확인. */
type SalesTab = 'ALL' | 'IN_APPROVAL' | 'UNCONFIRMED' | 'CONFIRMED'
const SALES_TABS: [SalesTab, string][] = [['ALL', '전체'], ['IN_APPROVAL', '결재중'], ['UNCONFIRMED', '미확인'], ['CONFIRMED', '확인']]
const won = (n: number) => n.toLocaleString('ko-KR')
const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]
const num = (s: string) => Number(s) || 0
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface SoDoc {
  id: number; orderNo: string; orderDate: string
  partnerId: number; employeeId: number | null; warehouseId: number | null; projectId: number | null
  contact: string | null; dueDate: string | null; postalCode: string | null; address: string | null; remark: string | null
  lines: { id: number; itemId: number; quantity: number; remark: string | null; salesId: number | null }[]
}
interface SalesOrderLite {
  id: number; orderNo: string; orderDate: string; partnerId: number; partnerName: string
  warehouseId: number | null; employeeId: number | null; projectId: number | null; statusName: string
  lines: { itemId: number; itemName: string; quantity: number }[]
}
interface ShipLite { shipNo: string; shipDate: string; lines: { itemCode: string; itemName: string; spec: string | null; quantity: number; shipmentOrderLineId: number | null }[] }

export default function ShipmentOrderEntry() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const editParam = params.get('edit')

  // ── 마스터 ─────────────────────────────────────────────
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [myItems, setMyItems] = useState<MyItem[]>([])

  // ── 머리 ──────────────────────────────────────────────
  const [date, setDate] = useState(today())
  const [partnerId, setPartnerId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [contact, setContact] = useState('')
  const [dueDate, setDueDate] = useState(today())
  const [postalCode, setPostalCode] = useState('')
  const [address, setAddress] = useState('')
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState<LineInput[]>(emptyLines)
  const [editing, setEditing] = useState<{ id: number; orderNo: string; orderDate: string } | null>(null)
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
  const [loadOpen, setLoadOpen] = useState(false)
  const [orders, setOrders] = useState<SalesOrderLite[]>([])
  const [pickOrder, setPickOrder] = useState<number | null>(null)
  // [판매] — 원본 판매검색창
  const [salesOpen, setSalesOpen] = useState(false)
  const [salesDocs, setSalesDocs] = useState<SalesDoc[] | null>(null)
  const [salesTab, setSalesTab] = useState<SalesTab>('ALL')
  const [salesQuery, setSalesQuery] = useState('')
  const [salesPicked, setSalesPicked] = useState<Record<number, boolean>>({})
  const [salesByLine, setSalesByLine] = useState(false)
  const [salesLoaded, setSalesLoaded] = useState(false)
  const [generated, setGenerated] = useState<{ code: string; name: string; spec: string | null; qty: number; slipNo: string }[] | null>(null)

  const gridRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(gridRef, '출하지시서입력 명세 그리드', [lines.length])

  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  /* 사용중단 품목도 담는다 — 코드도움 [사용중단포함] 을 켜면 보인다(원본 11/15-2 J001 · J002). */
  const codeItems = useMemo(
    () => items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.spec, stopped: i.active === false })),
    [items],
  )

  async function loadMyItems() {
    try { setMyItems((await api.get<MyItem[]>('/my-items')).data) } catch { setMyItems([]) }
  }
  useEffect(() => {
    api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => {})
    void loadMyItems()
    Promise.all([api.get<Partner[]>('/partners'), api.get<Warehouse[]>('/warehouses'), api.get<Item[]>('/items')])
      .then(([p, w, i]) => { setPartners(p.data); setWarehouses(w.data); setItems(i.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  /** `?edit=<id>` — 지시서 하나를 받아 펼친다(기간 밖일 수 있어 목록에서 찾지 않는다). */
  useEffect(() => {
    if (!editParam) { setEditing(null); return }
    api.get<SoDoc>(`/shipment-orders/${editParam}`)
      .then((r) => {
        const s = r.data
        setEditing({ id: s.id, orderNo: s.orderNo, orderDate: s.orderDate })
        setDate(s.orderDate); setPartnerId(String(s.partnerId))
        setEmployeeId(s.employeeId ? String(s.employeeId) : ''); setWarehouseId(s.warehouseId ? String(s.warehouseId) : '')
        setProjectId(s.projectId ? String(s.projectId) : ''); setContact(s.contact ?? ''); setDueDate(s.dueDate ?? '')
        setPostalCode(s.postalCode ?? ''); setAddress(s.address ?? ''); setRemark(s.remark ?? '')
        setLines([...s.lines.map((l) => ({ id: l.id, itemId: String(l.itemId), quantity: String(l.quantity), remark: l.remark ?? '', salesId: l.salesId ?? null })), emptyLine()])
      })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [editParam])

  // ── 줄 편집 ───────────────────────────────────────────
  function updateLine(idx: number, field: 'itemId' | 'quantity' | 'remark', value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId' && value && idx === ls.length - 1) next.push(emptyLine())
      return next
    })
  }
  function removeLine(idx: number) {
    setLines((ls) => (ls.length <= 3 ? ls.map((l, i) => (i === idx ? emptyLine() : l)) : ls.filter((_, i) => i !== idx)))
  }
  function addItemLine(itemId: string, qty = 1) {
    setLines((ls) => {
      const at = ls.findIndex((l) => l.itemId === itemId)
      if (at >= 0) return ls.map((l, i) => (i === at ? { ...l, quantity: String(num(l.quantity) + qty) } : l))
      const filled: LineInput = { id: null, itemId, quantity: String(qty), remark: '' }
      const blank = ls.findIndex((l) => !l.itemId)
      if (blank >= 0) return ls.map((l, i) => (i === blank ? filled : l))
      return [...ls, filled, emptyLine()]
    })
  }
  const lineCount = lines.filter((l) => l.itemId).length
  const totalQty = lines.reduce((a, l) => a + (l.itemId ? num(l.quantity) : 0), 0)

  // ── 툴바 동작 ─────────────────────────────────────────
  function sortLines() {
    setLines((ls) => {
      const filled = ls.filter((l) => l.itemId)
      filled.sort((a, b) => (itemById.get(a.itemId)?.code ?? '').localeCompare(itemById.get(b.itemId)?.code ?? ''))
      return [...filled, ...ls.filter((l) => !l.itemId)]
    })
    flash('품목코드 순으로 정렬했습니다.')
  }
  function scanBarcode() {
    const q = barcode.trim()
    if (!q) return
    const hit = items.find((i) => i.barcode === q) ?? items.find((i) => i.code.toLowerCase() === q.toLowerCase())
    if (!hit) { flash(`'${q}' 에 해당하는 품목이 없습니다.`); return }
    addItemLine(String(hit.id)); setBarcode('')
    flash(`${hit.name} 1개를 담았습니다.`)
  }
  function verify() {
    const msgs: string[] = []
    if (!partnerId) msgs.push('거래처를 선택하세요.')
    lines.forEach((l, i) => { if (l.itemId && num(l.quantity) <= 0) msgs.push(`${i + 1}행: 수량이 0입니다.`) })
    if (lineCount === 0) msgs.push('품목을 1줄 이상 입력하세요.')
    setVerifyResult(msgs)
  }
  function applyMyItems() {
    if (myItems.length === 0) return flash('My품목이 비어 있습니다. 판매입력 명세에서 [★]로 담아 두세요.')
    setLines((ls) => [...ls.filter((l) => l.itemId), ...myItems.map((m) => ({ id: null, itemId: String(m.itemId), quantity: String(m.defaultQty), remark: '' })), emptyLine()])
    flash(`My품목 ${myItems.length}건을 명세에 담았습니다.`)
  }
  /** [전표불러오기] › 주문서 — 원본은 값만 베끼고 잇지 않는다(주문서 잔량 그대로). */
  async function openLoad() {
    try {
      const res = await api.get<SalesOrderLite[]>('/sales-orders')
      setOrders(res.data.filter((o) => o.statusName !== '취소').sort((a, b) => b.id - a.id)); setPickOrder(null); setLoadOpen(true)
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  function applyOrder() {
    const o = orders.find((x) => x.id === pickOrder)
    if (!o) { void ecAlert('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    setPartnerId(String(o.partnerId))
    if (o.employeeId) setEmployeeId(String(o.employeeId))
    if (o.warehouseId) setWarehouseId(String(o.warehouseId))
    if (o.projectId) setProjectId(String(o.projectId))
    setLines([...o.lines.map((l) => ({ id: null, itemId: String(l.itemId), quantity: String(l.quantity), remark: '' })), emptyLine()])
    setLoadOpen(false)
  }
  /** [생성한전표] — 이 지시서 줄에 이어진 출하(출하 줄의 shipmentOrderLineId). */
  async function openGenerated() {
    if (!editing) return
    try {
      const ids = new Set(lines.map((l) => l.id).filter((x): x is number => x != null))
      const ships = (await api.get<ShipLite[]>('/shipments')).data
      setGenerated(ships.flatMap((s) => s.lines.filter((l) => l.shipmentOrderLineId != null && ids.has(l.shipmentOrderLineId))
        .map((l) => ({ code: l.itemCode, name: l.itemName, spec: l.spec, qty: l.quantity, slipNo: dateNo(s.shipDate, s.shipNo) }))))
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  /** [판매] — 출하지시서가 안 걸린 판매, 이 전표 일자까지. */
  async function openSales() {
    setSalesDocs(null); setSalesPicked({}); setSalesTab('ALL'); setSalesQuery(''); setSalesByLine(false); setSalesOpen(true)
    try {
      const res = await api.get<SalesDoc[]>('/shipment-orders/loadable-sales', { params: { to: date || today() } })
      setSalesDocs(res.data)
    } catch (err) { setSalesDocs([]); void ecAlert(extractErrorMessage(err)) }
  }
  const salesShown = useMemo(() => {
    const q = salesQuery.trim().toLowerCase()
    return (salesDocs ?? []).filter((d) => salesTab === 'ALL' || d.confirmStatus === salesTab)
      .filter((d) => !q || `${d.docNo} ${d.partnerName} ${d.warehouseName} ${d.lines.map((l) => l.itemName).join(' ')}`.toLowerCase().includes(q))
  }, [salesDocs, salesTab, salesQuery])
  const salesSummary = (d: SalesDoc) => {
    const f = d.lines[0]
    if (!f) return ''
    return `${f.itemName}${f.spec ? ` [${f.spec}]` : ''}${d.lines.length > 1 ? ` 외 ${d.lines.length - 1}건` : ''}`
  }
  /** [적용(F8)] — 원본(10/28-4 라라금속): 일자 그대로 · 거래처 · 담당자 · 프로젝트 · 출하창고 · 연락처(거래처) · 출하예정일 오늘 · 줄. */
  function applySales() {
    const picked = (salesDocs ?? []).filter((d) => salesPicked[d.id])
    if (picked.length === 0) { void ecAlert('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    const s = picked[0]
    if (s.partnerId != null) {
      setPartnerId(String(s.partnerId))
      setContact(partners.find((p) => p.id === s.partnerId)?.phone ?? '')
    }
    if (s.employeeId) setEmployeeId(String(s.employeeId))
    if (s.projectId) setProjectId(String(s.projectId))
    if (s.warehouseId) setWarehouseId(String(s.warehouseId))
    setDueDate(today())
    const loaded: LineInput[] = picked.flatMap((d) => d.lines.map((l) => ({ id: null, itemId: String(l.itemId), quantity: String(l.quantity), remark: '', salesId: d.id })))
    setLines((ls) => [...ls.filter((l) => l.itemId), ...loaded, emptyLine()])
    setSalesLoaded(true)
    setSalesOpen(false)
  }

  // ── 저장 ──────────────────────────────────────────────
  function reset(keepWarehouse = false) {
    setLines(emptyLines()); setError(''); setSalesLoaded(false); setPartnerId(''); setEmployeeId(''); setProjectId('')
    setContact(''); setPostalCode(''); setAddress(''); setRemark(''); setDate(today()); setDueDate(today())
    if (!keepWarehouse) setWarehouseId('')
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const filled = lines.filter((l) => l.itemId && num(l.quantity) > 0)
    if (filled.length === 0) {
      void ecAlert('아래의 경우 처리가 불가능합니다.\n자세한 내용은 아래의 사항을 참고하시기 바랍니다.\n아래 사항을 수정 후 다시 진행하시기 바랍니다.\n\n출하지시서입력 - 그리드(표)에 최소 1줄 이상 입력되어야 합니다.')
      return
    }
    const body = {
      orderDate: date || undefined,
      partnerId: partnerId ? Number(partnerId) : null,
      employeeId: employeeId ? Number(employeeId) : null,
      warehouseId: warehouseId ? Number(warehouseId) : null,
      projectId: projectId ? Number(projectId) : null,
      contact: contact || null, dueDate: dueDate || null,
      postalCode: postalCode || null, address: address || null, remark: remark || null,
      lines: filled.map((l) => ({ id: l.id, itemId: Number(l.itemId), quantity: num(l.quantity), remark: l.remark || null, salesId: l.salesId ?? null })),
    }
    try {
      if (editing) {
        await api.put(`/shipment-orders/${editing.id}`, body)
        navigate('/sales/shipment-order')   // 원본: 수정은 말 없이 닫히고 목록이 다시 읽힌다
        return
      }
      await api.post('/shipment-orders', body)
      reset(true)                            // 원본: 말 없이 빈 칸
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  async function removeEditing() {
    if (!editing) return
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 출하지시서'))) return
    try { await api.delete(`/shipment-orders/${editing.id}`); navigate('/sales/shipment-order') }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  function copyEditing() {
    setEditing(null); setDate(today()); setDueDate(today()); setError('')
    setLines((ls) => ls.map((l) => ({ ...l, id: null })))
    setParams({}, { replace: true })
  }
  async function toList() {
    if (!editing && lines.some((l) => l.itemId) && !(await ecConfirm('작성한 내용이 저장되지 않았습니다. 페이지를 벗어나겠습니까?'))) return
    navigate('/sales/shipment-order')
  }

  const actions: SlipAction[] = editing ? [
    { label: '수정저장(F8)', primary: true, submit: true },
    { label: '복사', onClick: copyEditing },
    { label: '삭제', onClick: () => void removeEditing() },
    { label: '리스트', onClick: () => void toList() },
    { label: 'H', onClick: () => setHistoryOpen(true) },
  ] : [
    { label: '저장(F8)', primary: true, submit: true },
    { label: '다시 작성', onClick: () => reset(false) },
    { label: '리스트', onClick: () => void toList() },
    { label: '웹자료올리기', disabled: true, disabledReason: '파일 첨부는 [전자결재·드라이브]에서 씁니다.' },
  ]
  const todo = (why: string) => ({ disabled: true, title: why })

  return (
    <form onSubmit={submit}>
      <EcSlipShell
        title={editing ? '출하지시서입력(수정)' : '출하지시서입력'}
        formTabs={[{ id: 'main', label: '기본(수정불가)' }]}
        activeFormTab="main"
        onAddTab={() => flash('탭 추가는 [Self-Customizing > 입력양식]에서 설정합니다.')}
        options={[{ label: '입력값 초기화', onClick: () => reset(false) }]}
        actions={actions}
        help={
          <ul className="pl-[16px] m-0">
            <li>이카운트 <b>출하지시서입력</b> 구조를 따릅니다 — 헤더 항목 폼 · 명세 그리드 · 하단 버튼줄. 단가 · 금액은 없습니다(수량만).</li>
            <li>저장하면 말 없이 빈 칸으로 돌아갑니다(출하창고는 남깁니다). 번호는 [리스트](출하지시서조회)에서 봅니다.</li>
            <li>흐리게 보이는 버튼은 원본에 있으나 아직 연결되지 않은 기능입니다. 마우스를 올리면 사유가 나옵니다.</li>
          </ul>
        }
      >
        <ul className="ec-form [&>li>.title]:basis-[120px]">
          <li>
            <div className="title">일자-No.</div>
            <div className="form flex items-center gap-[6px]">
              <EcDateField value={date} onChange={setDate} disabled={editing != null} />
              {editing && <span className="text-ec-label">{dateNo(editing.orderDate, editing.orderNo)}</span>}
            </div>
          </li>
          <li>
            <div className="title">거래처</div>
            <div className="form">
              <CodePickerField label="거래처" hideLabel pair value={partnerId} onChange={setPartnerId} items={partnerCodeItems(customers, true)} />
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
            <div className="title">프로젝트</div>
            <div className="form">
              <CodePickerField label="프로젝트" hideLabel pair value={projectId} onChange={setProjectId}
                               items={projects.filter((pj) => pj.active !== false || String(pj.id) === projectId).map((pj) => ({ value: String(pj.id), code: pj.code, name: pj.name }))} />
            </div>
          </li>
          <li>
            <div className="title">연락처</div>
            <div className="form"><input className="ec-input w-[200px]" value={contact} onChange={(e) => setContact(e.target.value)} aria-label="연락처" /></div>
          </li>
          <li>
            <div className="title">출하예정일</div>
            <div className="form"><EcDateField value={dueDate} onChange={setDueDate} /></div>
          </li>
          <li>
            <div className="title">우편번호</div>
            <div className="form"><input className="ec-input w-[110px]" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} aria-label="우편번호" /></div>
          </li>
          <li className="wide">
            <div className="title">주소</div>
            <div className="form"><input className="ec-input flex-1" value={address} onChange={(e) => setAddress(e.target.value)} aria-label="주소" /></div>
          </li>
        </ul>

        <ul className="ec-tabs mt-[10px]"><li className="ec-tab active">출하지시</li></ul>
        <div className="ec-toolbar">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFindOpen((v) => !v)}>찾기(F3)</button>
          {findOpen && <input className="ec-input w-[130px] h-[23px]" autoFocus value={findText} placeholder="품목명·적요" onChange={(e) => setFindText(e.target.value)} />}
          <button type="button" className="ec-btn ec-btn-sm" onClick={sortLines}>정렬</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={applyMyItems}>My품목{myItems.length > 0 ? ` (${myItems.length})` : ''}</button>
          {/* 원본: 판매를 담은 뒤에는 툴바에서 [판매] 가 빠진다 */}
          {!salesLoaded && <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openSales()}>판매</button>}
          <button type="button" className="ec-btn ec-btn-sm" {...todo('출하지시서입력에서 재고를 불러오는 기능은 아직 없습니다.')}>재고불러오기</button>
          <button type="button" className="ec-btn ec-btn-sm" disabled={!editing} title={editing ? undefined : '저장한 출하지시서를 열었을 때만 쓸 수 있습니다.'} onClick={() => void openGenerated()}>생성한전표</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setBarcodeOpen((v) => !v)}>바코드</button>
          {barcodeOpen && (
            <input className="ec-input w-[170px] h-[23px]" autoFocus value={barcode} placeholder="바코드/품목코드 후 Enter"
                   onChange={(e) => setBarcode(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanBarcode() } }} />
          )}
          <button type="button" className="ec-btn ec-btn-sm" {...todo('전표 단위 바코드 출력은 아직 없습니다.')}>전표 바코드</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={verify}>검증</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openLoad()}>전표불러오기</button>
        </div>

        {notice && <div className="ec-alert ec-alert-info my-[4px] mx-0">{notice}</div>}
        {verifyResult && (
          <div className={`ec-alert my-[4px] mx-0 ${verifyResult.length ? 'ec-alert-danger' : 'ec-alert-info'}`}>
            {verifyResult.length === 0 ? '문제가 없습니다.' : verifyResult.map((m, i) => <div key={i}>{m}</div>)}
            <button type="button" className="ec-btn ec-btn-sm mt-[4px]" onClick={() => setVerifyResult(null)}>닫기</button>
          </div>
        )}

        <div ref={gridRef} className="overflow-x-auto">
          <table className="ec-grid-input no-ec table-fixed">
            <colgroup>
              <col className="w-[26px]" /><col className="w-[100px]" /><col className="w-[220px]" /><col className="w-[110px]" />
              <col className="w-[96px]" /><col className="w-[200px]" /><col className="w-[30px]" />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th className="text-left">품목코드</th><th className="text-left">품목명</th><th className="text-left">규격</th>
                <th className="text-right">수량</th><th className="text-left">적요</th><th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const it = itemById.get(l.itemId)
                const needle = findText.trim().toLowerCase()
                const hit = !needle || `${it?.name ?? ''} ${it?.code ?? ''} ${l.remark}`.toLowerCase().includes(needle)
                return (
                  <tr key={idx} data-export-skip={l.itemId ? undefined : 'true'} className={hit ? undefined : 'hidden'}>
                    <td className="text-center text-ec-hint">{idx + 1}</td>
                    <td className="pad text-ec-label overflow-hidden whitespace-nowrap">{it?.code ?? ''}</td>
                    <td className="pad">
                      <CodePickerField label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제" value={l.itemId}
                                       onChange={(v) => updateLine(idx, 'itemId', v)} items={codeItems} />
                    </td>
                    <td className="pad text-ec-label overflow-hidden text-ellipsis whitespace-nowrap">{it?.spec ?? ''}</td>
                    <td><EcNumInput className="cell text-right" value={l.quantity} onValue={(v) => updateLine(idx, 'quantity', v)} /></td>
                    <td><input className="cell" value={l.remark} disabled={!l.itemId} onChange={(e) => updateLine(idx, 'remark', e.target.value)} /></td>
                    <td className="text-center">
                      {l.itemId && <button type="button" onClick={() => removeLine(idx)} className="no-ec border-0 bg-transparent cursor-pointer text-ec-hint">✕</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td colSpan={3} className="pl-[6px]">합계 ({lineCount}건)</td>
                <td className="text-right">{qty2(totalQty)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {error && <p className="ec-alert ec-alert-danger mt-[10px]">{error}</p>}
      </EcSlipShell>

      {historyOpen && editing && (
        <SlipHistoryModal target="SHIPMENT_ORDER" id={editing.id} head={slipHeadLabel(editing.orderDate, editing.orderNo)} onClose={() => setHistoryOpen(false)} />
      )}

      <Modal open={loadOpen} error={error} width={760} title="주문서검색창" onClose={() => setLoadOpen(false)}>
        <table className="w-full text-left">
          <thead><tr><th className="w-[35px]"></th><th>일자-No.</th><th>거래처명</th><th>품목명(요약)</th><th>진행상태</th></tr></thead>
          <tbody>
            {orders.length === 0 ? <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr> : orders.map((o) => (
              <tr key={o.id}>
                <td className="text-center"><input type="checkbox" checked={pickOrder === o.id} onChange={() => setPickOrder(pickOrder === o.id ? null : o.id)} /></td>
                <td>{dateNo(o.orderDate, o.orderNo)}</td><td>{o.partnerName}</td>
                <td>{o.lines[0]?.itemName ?? ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td><td>{o.statusName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-[8px] flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={applyOrder}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setLoadOpen(false)}>닫기</button>
        </div>
      </Modal>

      {/* 원본 출하지시서입력 [판매] = '판매검색창(조회)'(루프 27 실측). */}
      <Modal open={salesOpen} width={960} title="판매검색창" onClose={() => setSalesOpen(false)}>
        {salesDocs === null ? <p className="text-ec-hint m-0">불러오는 중…</p> : (
          <SourceDocSearch
            tabs={SALES_TABS} tab={salesTab} onTab={setSalesTab}
            query={salesQuery} onQuery={setSalesQuery}
            date2Label="" totalLabel=""
            columns={[
              { label: '일자-No.' }, { label: '거래처명' }, { label: '품목명(요약)' }, { label: '금액합계', className: 'text-right' },
              { label: '거래유형명' }, { label: '창고명' }, { label: '회계반영여부', className: 'text-center' },
              { label: '인쇄', className: 'text-center' }, { label: '불러온전표', className: 'text-center' },
            ]}
            docs={salesShown.map((d) => ({
              key: d.id, dateNo: dateNo(d.saleDate, d.docNo), partnerName: d.partnerName, employeeName: d.employeeName ?? '',
              itemSummary: salesSummary(d), date2: '', total: d.totalAmount, statusLabel: d.confirmStatusName, created: false,
              cells: [
                dateNo(d.saleDate, d.docNo), d.partnerName, salesSummary(d), won(d.totalAmount),
                d.taxable ? '부가세율 적용' : '부가세율 미적용', d.warehouseName, d.accountingReflected ? 'Y' : 'N',
                <span className="text-ec-hint">인쇄</span>,
                <span className="ec-btn ec-btn-sm" title="불러온 전표는 판매조회에서 봅니다.">조회</span>,
              ],
            }))}
            picked={salesPicked} onPicked={setSalesPicked}
            createdTitle=""
            byLine={salesByLine} onToggleByLine={() => setSalesByLine((v) => !v)}
            lineView={(
              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead><tr><th className="w-[30px]" /><th>일자-No.</th><th>거래처명</th><th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th>창고명</th></tr></thead>
                  <tbody>
                    {salesShown.length === 0 ? <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr> : salesShown.flatMap((d) => d.lines.map((l) => (
                      <tr key={`${d.id}-${l.lineId}`}>
                        <td className="text-center"><input type="checkbox" aria-label="선택" checked={!!salesPicked[d.id]} onChange={(e) => setSalesPicked({ ...salesPicked, [d.id]: e.target.checked })} /></td>
                        <td>{dateNo(d.saleDate, d.docNo)}</td><td>{d.partnerName}</td><td>{l.itemCode}</td><td>{l.itemName}</td><td>{l.spec ?? ''}</td>
                        <td className="text-right">{qty2(l.quantity)}</td><td>{d.warehouseName}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}
            onApply={applySales} applyLabel="적용(F8)"
            onNew={() => window.open('/sales/sell', '_blank')}
            onList={() => window.open('/sales/sales-list', '_blank')}
            onClose={() => setSalesOpen(false)}
          />
        )}
      </Modal>

      <Modal open={generated != null} title="생성한 전표" width={760} onClose={() => setGenerated(null)}>{generated && editing && (
        <div>
          <p className="mb-[6px]">출하지시서 : {dateNo(editing.orderDate, editing.orderNo)}</p>
          <table className="w-full text-left">
            <thead><tr><th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th>생성한 전표</th><th>생성한 전표일자-No.</th></tr></thead>
            <tbody>
              {generated.length === 0 ? <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr> : generated.map((r, i) => (
                <tr key={i}><td>{r.code}</td><td>{r.name}</td><td>{r.spec ?? ''}</td><td className="text-right">{qty2(r.qty)}</td><td>출하</td><td>{r.slipNo}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[8px]"><button type="button" className="ec-btn" onClick={() => setGenerated(null)}>닫기</button></div>
        </div>
      )}</Modal>
    </form>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { partnerCodeItems } from '../../utils/codeItems'
import { ymd } from '../../components/EcPeriodPicks'
import { dateNo } from '../../utils/dateNo'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { SlipHistoryModal, slipHeadLabel } from '../../features/sliphistory/SlipHistoryModal'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerManagers } from '../../utils/partnerManagers'

/**
 * 재고 I › 영업관리 › 출하지시서조회(E040221) · 출하지시서입력(E040220) — 2026-10-20 loginaa 실측(plans/재고1/E040221.md).
 *
 * <p>원본은 출하지시서와 출하가 <b>다른 전표</b>다(판매/주문 → 출하지시서 → 출하). 그래서 이 화면은
 * `/api/shipment-orders` 를 본다 — 예전에는 출하(`/api/shipments`) 한 줄의 READY/SHIPPED 로 겸했다.
 * 단가 · 금액은 없다(수량만). 미출하 잔량은 출하지시서 줄 - 이어진 출하.
 *
 * <p>조회: 탭 전체 · 결재중 · 확인 · 진행중 · 완료, 열 일곱(☐ · 일자-No. · 창고명 · 품목명(요약) · 수량합계 · 진행상태 · 인쇄),
 * 합계줄 없음, 일자 내림차순, 조건 판은 접혀서 시작. 진행상태 링크 → 펼침 [진행중 · 완료] 로 확인 창 없이 바뀐다.
 * 입력: 저장하면 <b>말 없이</b> 창이 닫힌다. 줄 없이 저장하면 '그리드(표)에 최소 1줄 이상 입력되어야 합니다.'.
 */
type Status = 'IN_PROGRESS' | 'COMPLETED'
interface SoLine { id: number; itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string; quantity: number; shippedQty: number; unshippedQty: number; remark: string | null }
interface ShipmentOrder {
  id: number; orderNo: string; orderDate: string
  partnerId: number; partnerCode: string; partnerName: string
  employeeId: number | null; employeeName: string | null
  warehouseId: number | null; warehouseName: string | null
  projectId: number | null; projectName: string | null
  contact: string | null; dueDate: string | null; postalCode: string | null; address: string | null; remark: string | null
  status: Status; statusName: string; totalQuantity: number; createdBy: string | null
  createdAt: string | null; updatedAt: string | null
  lines: SoLine[]
}
interface SalesOrderLite {
  id: number; orderNo: string; orderDate: string; partnerId: number; partnerName: string
  warehouseId: number | null; employeeId: number | null; projectId: number | null; statusName: string
  lines: { itemId: number; itemName: string; quantity: number }[]
}

const TABS = ['전체', '결재중', '확인', '진행중', '완료'] as const
type Tab = typeof TABS[number]
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => ymd(new Date())
/** 원본 기준일자 기본 — 2026/10/20 에 2026/09/20 ~ 2026/11/19(한 달 전 ~ 한 달 뒤 전날). */
function defaultPeriod(): [string, string] {
  const d = new Date()
  const from = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
  const to = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate() - 1)
  return [ymd(from), ymd(to)]
}
const summary = (s: ShipmentOrder) => {
  const first = s.lines[0]
  if (!first) return ''
  const name = first.spec ? `${first.itemName} [${first.spec}]` : first.itemName
  return s.lines.length > 1 ? `${name} 외 ${s.lines.length - 1}건` : name
}

interface LineInput { id: number | null; itemId: string; quantity: string; remark: string }
const emptyLine = (): LineInput => ({ id: null, itemId: '', quantity: '', remark: '' })
interface Head { orderDate: string; partnerId: string; employeeId: string; warehouseId: string; projectId: string; contact: string; dueDate: string; postalCode: string; address: string; remark: string }
const emptyHead = (): Head => ({ orderDate: today(), partnerId: '', employeeId: '', warehouseId: '', projectId: '', contact: '', dueDate: today(), postalCode: '', address: '', remark: '' })

async function printOne(s: ShipmentOrder, company: DocParty | null) {
  await printDocuments([{
    title: '출하지시서', docNo: dateNo(s.orderDate, s.orderNo), docDate: s.orderDate, hideAmounts: true,
    supplier: company ? { ...company, label: '지시자' } : { label: '지시자', name: '(회사정보 미등록)' },
    customer: { label: '납품처', name: s.partnerName },
    extra: [
      { label: '출하예정일', value: s.dueDate }, { label: '출하창고', value: s.warehouseName },
      { label: '담당자', value: s.employeeName }, { label: '연락처', value: s.contact },
      { label: '배송지', value: [s.postalCode, s.address].filter(Boolean).join(' ') },
    ],
    remark: s.remark,
    lines: s.lines.map((l) => ({ itemCode: l.itemCode, itemName: l.itemName, spec: l.spec, unit: l.unit, quantity: l.quantity, unitPrice: 0, supplyAmount: 0, vatAmount: 0, remark: l.remark })),
    footNote: '위와 같이 출하하여 주시기 바랍니다.',
  }])
}

export default function ShipmentOrderPage() {
  const [rows, setRows] = useState<ShipmentOrder[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<{ id: number; code: string; name: string }[]>([])
  const [employees, setEmployees] = useState<{ id: number; name: string; code?: string }[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [company, setCompany] = useState<DocParty | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('전체')
  const [keyword, setKeyword] = useState('')
  const [period0] = useState(defaultPeriod)
  const [from, setFrom] = useState(period0[0])
  const [to, setTo] = useState(period0[1])
  const [noCond, setNoCond] = useState('')
  const [whCond, setWhCond] = useState('')
  const [pjCond, setPjCond] = useState('')
  const [ptCond, setPtCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  /* 원본 Option 으로 펼치는 조건(2026-09-07 실측) — 관리항목 · 발송여부 · 규격 · 거래처관리담당자 · 적요 · 작성자 · 최초작성일자 · 최종작업일자. */
  const [mgmtCond, setMgmtCond] = useState('')
  const [sendCond, setSendCond] = useState<'' | '미발송' | '발송'>('')
  const [specCond, setSpecCond] = useState('')
  const [pmgrCond, setPmgrCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [made, setMade] = useState(['', ''])
  const [edited, setEdited] = useState(['', ''])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [statusMenu, setStatusMenu] = useState<number | null>(null)
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects'])

  /* 입력 창 */
  const [editing, setEditing] = useState<ShipmentOrder | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [head, setHead] = useState<Head>(emptyHead)
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])
  const [loadOpen, setLoadOpen] = useState(false)
  const [orders, setOrders] = useState<SalesOrderLite[]>([])
  const [pickOrder, setPickOrder] = useState<number | null>(null)

  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const mgmt = useItemMgmt(items)
  const pmgr = usePartnerManagers(partners)
  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])

  async function load() {
    try {
      const res = await api.get<ShipmentOrder[]>('/shipment-orders', { params: { from: from || undefined, to: to || undefined } })
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])
  useEffect(() => {
    loadSupplierParty().then(setCompany)
    Promise.all([
      api.get<Partner[]>('/partners'), api.get<Item[]>('/items'),
      api.get<{ id: number; code: string; name: string }[]>('/warehouses'),
      api.get<{ id: number; name: string; code?: string }[]>('/employees'),
      api.get<{ id: number; code: string; name: string }[]>('/projects'),
    ]).then(([p, i, w, e, pj]) => { setPartners(p.data); setItems(i.data); setWarehouses(w.data); setEmployees(e.data); setProjects(pj.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  const filtered = rows
    .filter((s) => !keyword || s.partnerName.includes(keyword) || dateNo(s.orderDate, s.orderNo).includes(keyword) || s.lines.some((l) => l.itemName.includes(keyword)))
    .filter((s) => !noCond || dateNo(s.orderDate, s.orderNo).includes(noCond) || s.orderNo.includes(noCond))
    .filter((s) => !whCond || String(s.warehouseId) === whCond)
    .filter((s) => !pjCond || String(s.projectId) === pjCond)
    .filter((s) => !ptCond || String(s.partnerId) === ptCond)
    .filter((s) => !itemCond || s.lines.some((l) => String(l.itemId) === itemCond))
    .filter((s) => mgmt.hits(s.lines.map((l) => l.itemId), mgmtCond))
    /* 발송(Email · 보내기)은 바깥 발송이라 우리에게 없다 — 모두 미발송이다. */
    .filter((s) => sendCond !== '발송' || !s)
    .filter((s) => !specCond || s.lines.some((l) => (l.spec ?? '') === specCond))
    .filter((s) => !pmgrCond || pmgr.managerOfName(s.partnerName) === pmgrCond)
    .filter((s) => !remarkCond || (s.remark ?? '').includes(remarkCond) || s.lines.some((l) => (l.remark ?? '').includes(remarkCond)))
    .filter((s) => !authorCond || (s.createdBy ?? '') === authorCond)
    .filter((s) => !made[0] || (s.createdAt ?? '').slice(0, 10) >= made[0])
    .filter((s) => !made[1] || ((s.createdAt ?? '') !== '' && s.createdAt!.slice(0, 10) <= made[1]))
    .filter((s) => !edited[0] || (s.updatedAt ?? '').slice(0, 10) >= edited[0])
    .filter((s) => !edited[1] || ((s.updatedAt ?? '') !== '' && s.updatedAt!.slice(0, 10) <= edited[1]))
  /* 결재중 · 확인 탭은 전자결재 · 확인 기능이 붙어야 찬다(원본도 이번 자료로는 비어 있었다). */
  const tabbed = filtered.filter((s) => tab === '전체' || (tab === '진행중' && s.status === 'IN_PROGRESS') || (tab === '완료' && s.status === 'COMPLETED'))
  const shown = byUpdated ? [...tabbed].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')) : tabbed

  function openNew() {
    setEditing(null); setHead(emptyHead()); setLines([emptyLine()]); setOpen(true)
  }
  function openEdit(s: ShipmentOrder) {
    setEditing(s)
    setHead({
      orderDate: s.orderDate, partnerId: String(s.partnerId), employeeId: s.employeeId ? String(s.employeeId) : '',
      warehouseId: s.warehouseId ? String(s.warehouseId) : '', projectId: s.projectId ? String(s.projectId) : '',
      contact: s.contact ?? '', dueDate: s.dueDate ?? '', postalCode: s.postalCode ?? '', address: s.address ?? '', remark: s.remark ?? '',
    })
    setLines([...s.lines.map((l) => ({ id: l.id, itemId: String(l.itemId), quantity: String(l.quantity), remark: l.remark ?? '' })), emptyLine()])
    setOpen(true)
  }
  const setH = (k: keyof Head, v: string) => setHead((h) => ({ ...h, [k]: v }))
  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId' && value && idx === ls.length - 1) next.push(emptyLine())
      return next
    })
  }
  const totalQty = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0)

  async function save() {
    const filled = lines.filter((l) => l.itemId && Number(l.quantity) > 0)
    if (filled.length === 0) {
      void ecAlert('아래의 경우 처리가 불가능합니다.\n자세한 내용은 아래의 사항을 참고하시기 바랍니다.\n아래 사항을 수정 후 다시 진행하시기 바랍니다.\n\n출하지시서입력 - 그리드(표)에 최소 1줄 이상 입력되어야 합니다.')
      return
    }
    const body = {
      orderDate: head.orderDate || undefined,
      partnerId: head.partnerId ? Number(head.partnerId) : null,
      employeeId: head.employeeId ? Number(head.employeeId) : null,
      warehouseId: head.warehouseId ? Number(head.warehouseId) : null,
      projectId: head.projectId ? Number(head.projectId) : null,
      contact: head.contact || null, dueDate: head.dueDate || null,
      postalCode: head.postalCode || null, address: head.address || null, remark: head.remark || null,
      lines: filled.map((l) => ({ id: l.id, itemId: Number(l.itemId), quantity: Number(l.quantity), remark: l.remark || null })),
    }
    try {
      if (editing) await api.put(`/shipment-orders/${editing.id}`, body)
      else await api.post('/shipment-orders', body)
      setOpen(false)              // 원본: 말 없이 닫힌다
      load()
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  async function remove(s: ShipmentOrder) {
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 출하지시서'))) return
    try { await api.delete(`/shipment-orders/${s.id}`); setOpen(false); load() }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  async function removeChecked() {
    const targets = shown.filter((s) => checked.has(s.id))
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 출하지시서'))) return
    try { for (const t of targets) await api.delete(`/shipment-orders/${t.id}`); setChecked(new Set()); load() }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  async function setStatus(ids: number[], status: Status) {
    setStatusMenu(null)
    try { for (const id of ids) await api.patch(`/shipment-orders/${id}/status`, { status }); setChecked(new Set()); load() }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  /* [전표불러오기] › 주문서 — 원본은 값만 베끼고 잇지 않는다(주문서 잔량 그대로). */
  async function openLoad() {
    try {
      const res = await api.get<SalesOrderLite[]>('/sales-orders')
      setOrders(res.data.filter((o) => o.statusName !== '취소').sort((a, b) => b.id - a.id)); setPickOrder(null); setLoadOpen(true)
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  function applyOrder() {
    const o = orders.find((x) => x.id === pickOrder)
    if (!o) { void ecAlert('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    setHead((h) => ({
      ...h, partnerId: String(o.partnerId),
      employeeId: o.employeeId ? String(o.employeeId) : h.employeeId,
      warehouseId: o.warehouseId ? String(o.warehouseId) : h.warehouseId,
      projectId: o.projectId ? String(o.projectId) : h.projectId,
    }))
    setLines([...o.lines.map((l) => ({ id: null, itemId: String(l.itemId), quantity: String(l.quantity), remark: '' })), emptyLine()])
    setLoadOpen(false)
  }

  return (
    <EcListShell
      title="출하지시서조회"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      newLabel="신규(F2)"
      onNew={openNew}
      onReset={() => { setFrom(period0[0]); setTo(period0[1]); setNoCond(''); setWhCond(''); setPjCond(''); setPtCond(''); setItemCond(''); setByUpdated(false); setMgmtCond(''); setSendCond(''); setSpecCond(''); setPmgrCond(''); setRemarkCond(''); setAuthorCond(''); setMade(['', '']); setEdited(['', '']) }}
      actions={[
        { label: '진행상태변경', selected: checked.size, onClick: () => setStatus([...checked], 'COMPLETED'), menu: [
          { label: '진행중', onClick: () => setStatus([...checked], 'IN_PROGRESS') },
          { label: '완료', onClick: () => setStatus([...checked], 'COMPLETED') },
        ] },
        { label: '인쇄', selected: checked.size, onClick: () => { shown.filter((s) => checked.has(s.id)).forEach((s) => void printOne(s, company)) } },
        { label: '선택삭제', selected: checked.size, onClick: removeChecked },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-[6px] text-ec-label">~</span>
          <input type="date" className="ec-input w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </EcCond>
        <EcCond label="출하지시No.">
          <input className="ec-input w-[170px]" value={noCond} onChange={(e) => setNoCond(e.target.value)} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체" value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체" value={pjCond} onChange={setPjCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체" value={mgmtCond} onChange={setMgmtCond} items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체" value={ptCond} onChange={setPtCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체" value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        <EcCond label="발송여부">
          <div className="ec-pills">
            {(['', '미발송', '발송'] as const).map((v) => (
              <button key={v || 'all'} type="button" className={`ec-pill no-ec${sendCond === v ? ' active' : ''}`} onClick={() => setSendCond(v)}>{v || '전체'}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="규격" pick>
          <CodePickerField label="규격" hideLabel width={170} emptyLabel="전체" value={specCond} onChange={setSpecCond}
                           items={[...new Set(rows.flatMap((s) => s.lines.map((l) => l.spec)).filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={170} emptyLabel="전체" value={pmgrCond} onChange={setPmgrCond} items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="적요"><input className="ec-input w-[170px]" value={remarkCond} onChange={(e) => setRemarkCond(e.target.value)} /></EcCond>
        <EcCond label="작성자" pick>
          <CodePickerField label="작성자" hideLabel width={170} emptyLabel="전체" value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(rows.map((s) => s.createdBy).filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="최초작성일자">
          <input type="date" className="ec-input w-[140px]" value={made[0]} onChange={(e) => setMade([e.target.value, made[1]])} />
          <span className="mx-[6px] text-ec-label">~</span>
          <input type="date" className="ec-input w-[140px]" value={made[1]} onChange={(e) => setMade([made[0], e.target.value])} />
        </EcCond>
        <EcCond label="최종작업일자">
          <input type="date" className="ec-input w-[140px]" value={edited[0]} onChange={(e) => setEdited([e.target.value, edited[1]])} />
          <span className="mx-[6px] text-ec-label">~</span>
          <input type="date" className="ec-input w-[140px]" value={edited[1]} onChange={(e) => setEdited([edited[0], e.target.value])} />
        </EcCond>
        <EcCond label="기타">
          <label className="flex items-center gap-[4px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      <ul className="ec-tabs">
        {TABS.map((t) => <li key={t} className={`ec-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}{t === '전체' ? '*' : ''}</li>)}
      </ul>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <p className="mb-[4px] text-ec-label">{from.replace(/-/g, '/')} ~ {to.replace(/-/g, '/')}</p>

      <table className="w-full table-fixed text-left">
        <colgroup>
          <col className="w-[35px]" /><col className="w-[141px]" /><col className="w-[141px]" /><col className="w-[380px]" />
          <col className="w-[146px]" /><col className="w-[112px]" /><col className="w-[112px]" />
        </colgroup>
        <thead>
          <tr>
            <th className="text-center">
              <input type="checkbox" checked={shown.length > 0 && shown.every((s) => checked.has(s.id))}
                     onChange={() => setChecked(shown.every((s) => checked.has(s.id)) ? new Set() : new Set(shown.map((s) => s.id)))} />
            </th>
            <th className="text-center">일자-No.</th><th>창고명</th><th>품목명(요약)</th>
            <th className="text-right">수량합계</th><th className="text-center">진행상태</th><th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((s) => (
            <tr key={s.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(s.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); return next
                })} />
              </td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); openEdit(s) }}>{dateNo(s.orderDate, s.orderNo)}</a></td>
              <td>{s.warehouseName ?? ''}</td>
              <td>{summary(s)}</td>
              <td className="text-right">{qty2(s.totalQuantity)}</td>
              <td className="relative text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); setStatusMenu(statusMenu === s.id ? null : s.id) }}>{s.statusName}</a>
                {statusMenu === s.id && (
                  <ul className="absolute left-[20px] top-[24px] z-10 min-w-[80px] p-[4px] list-none text-left bg-ec-panel border border-ec-line border-solid rounded-ec">
                    <li className="py-[4px] px-[8px]"><a href="#" onClick={(e) => { e.preventDefault(); void setStatus([s.id], 'IN_PROGRESS') }}>진행중</a></li>
                    <li className="py-[4px] px-[8px]"><a href="#" onClick={(e) => { e.preventDefault(); void setStatus([s.id], 'COMPLETED') }}>완료</a></li>
                  </ul>
                )}
              </td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); void printOne(s, company) }}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={open} error={error} width={900} title={editing ? '출하지시서입력(수정)' : '출하지시서입력'} onClose={() => setOpen(false)}>
        <ul className="ec-form">
          <EcCond label="일자-No.">
            <input type="date" className="ec-input w-[140px]" value={head.orderDate} disabled={!!editing} onChange={(e) => setH('orderDate', e.target.value)} />
            {editing && <span className="ml-[6px]">-{Number(editing.orderNo.split('-').pop())}</span>}
          </EcCond>
          <EcCond label="거래처" pick>
            <CodePickerField label="거래처" hideLabel width={200} emptyLabel="선택 해제" value={head.partnerId} onChange={(v) => setH('partnerId', v)} items={partnerCodeItems(customers)} />
          </EcCond>
          <EcCond label="담당자" pick>
            <CodePickerField label="담당자" hideLabel width={200} emptyLabel="선택 안 함" value={head.employeeId} onChange={(v) => setH('employeeId', v)}
                             items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
          </EcCond>
          <EcCond label="출하창고" pick>
            <CodePickerField label="출하창고" hideLabel width={200} emptyLabel="선택 안 함" value={head.warehouseId} onChange={(v) => setH('warehouseId', v)}
                             items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
          </EcCond>
          <EcCond label="프로젝트" pick>
            <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="선택 안 함" value={head.projectId} onChange={(v) => setH('projectId', v)}
                             items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
          </EcCond>
          <EcCond label="연락처"><input className="ec-input w-[200px]" value={head.contact} onChange={(e) => setH('contact', e.target.value)} /></EcCond>
          <EcCond label="출하예정일"><input type="date" className="ec-input w-[140px]" value={head.dueDate} onChange={(e) => setH('dueDate', e.target.value)} /></EcCond>
          <EcCond label="우편번호"><input className="ec-input w-[110px]" value={head.postalCode} onChange={(e) => setH('postalCode', e.target.value)} /></EcCond>
          <EcCond label="주소"><input className="ec-input w-[360px]" value={head.address} onChange={(e) => setH('address', e.target.value)} /></EcCond>
        </ul>

        <div className="ec-toolbar my-[6px] flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-sm" onClick={openLoad}>전표불러오기</button>
        </div>
        <table className="w-full table-fixed text-left">
          <colgroup><col className="w-[35px]" /><col className="w-[160px]" /><col className="w-[169px]" /><col className="w-[88px]" /><col className="w-[93px]" /><col /></colgroup>
          <thead><tr><th className="text-center"></th><th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th>적요</th></tr></thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={idx}>
                <td className="text-center text-ec-hint">{idx + 1}</td>
                <td>
                  <CodePickerField label="품목" hideLabel fill placeholder="품목" emptyLabel="선택 해제" value={l.itemId} onChange={(v) => updateLine(idx, 'itemId', v)}
                                   items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword, stopped: it.active === false }))} />
                </td>
                <td>{itemById.get(l.itemId)?.name ?? ''}</td>
                <td>{itemById.get(l.itemId)?.spec ?? ''}</td>
                <td><input type="number" className="ec-input w-full text-right" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} /></td>
                <td><input className="ec-input w-full" value={l.remark} onChange={(e) => updateLine(idx, 'remark', e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} className="text-right">합계</td><td className="text-right">{qty2(totalQty)}</td><td></td></tr>
          </tfoot>
        </table>
        <div className="mt-[8px] flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
          {!editing && <button type="button" className="ec-btn" onClick={() => { setHead(emptyHead()); setLines([emptyLine()]) }}>다시 작성</button>}
          <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          {editing && <button type="button" className="ec-btn" onClick={() => remove(editing)}>삭제</button>}
          {editing && <button type="button" className="ec-btn" onClick={() => setHistoryOpen(true)}>H</button>}
        </div>
      </Modal>
      {historyOpen && editing && <SlipHistoryModal target="SHIPMENT_ORDER" id={editing.id} head={slipHeadLabel(editing.orderDate, editing.orderNo)} onClose={() => setHistoryOpen(false)} />}

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
    </EcListShell>
  )
}

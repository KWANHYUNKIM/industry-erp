import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { AS_REPAIR_LIST_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { useShortcut } from '../../utils/useShortcut'
import { loadSupplierParty, printDocuments } from '../../utils/printDocument'
import type { Item, Partner, Warehouse } from '../../types/api'

/**
 * 재고 II › A/S관리 › A/S수리조회(E040606) · A/S수리입력(E040605) · 판매연결전표
 *
 * <p>2026-10-03 원본(loginaa)에서 수리를 직접 넣고 지워 보며 맞췄다.
 * <ul>
 *   <li>수리는 접수와 <b>따로인 전표</b>다 — 일자 · 거래처 · 담당자(필수) · 창고 · 수리유형 · 제목 · 수리내용 ·
 *       수리진행상태 + 품목 격자. 예전 우리 화면은 접수의 상태(처리중 · 완료)를 수리로 보여 줄 뿐이었다.</li>
 *   <li>수리 자체는 재고를 움직이지 않는다. 부품 · 수리비는 [생성한 전표] → <b>판매연결전표</b>의 [신규]로 판매를
 *       만들어 잇는다 — 재고 차감 · 매출은 그 판매가 한다. [금액] = 이어진 판매 합계.</li>
 *   <li>판매가 남아 있으면 수리를 지우지 않는다(판매를 먼저 지워 재고 · 매출을 되돌린다).</li>
 * </ul>
 */
const won = (n: number) => Math.round(Number(n)).toLocaleString('ko-KR')
const yy = (d: string | null) => (d ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : '')
const dateNo = (date: string, no: string | null) => {
  const seq = (no ?? '').split('-').pop() ?? ''
  return `${yy(date)}-${Number(seq) || seq}`
}

type RepairType = 'FREE_EXCHANGE' | 'FREE_REPAIR' | 'PAID_EXCHANGE' | 'PAID_REPAIR' | 'RETURN'
/* 원본 [수리유형] 코드도움 — 01 무상교환 · 02 무상수리 · 05 유상교환 · 06 유상수리 · 11 반품. */
const REPAIR_TYPES: { value: RepairType; code: string; name: string }[] = [
  { value: 'FREE_EXCHANGE', code: '01', name: '무상교환' }, { value: 'FREE_REPAIR', code: '02', name: '무상수리' },
  { value: 'PAID_EXCHANGE', code: '05', name: '유상교환' }, { value: 'PAID_REPAIR', code: '06', name: '유상수리' },
  { value: 'RETURN', code: '11', name: '반품' },
]
type Status = 'IN_PROGRESS' | 'COMPLETED'
const STATUS_LABEL: Record<Status, string> = { IN_PROGRESS: '진행중', COMPLETED: '완료' }

interface RepairLine { id: number; lineNo: number; itemId: number; itemCode: string; itemName: string; itemSpec: string | null; quantity: number }
interface LinkedSale { salesId: number; docNo: string; saleDate: string; supplyAmount: number; vatAmount: number; totalAmount: number }
interface Repair {
  id: number; repairNo: string; repairDate: string; partnerId: number; partnerName: string
  asRequestId: number | null; asNo: string | null; receiptDate: string | null
  warehouseId: number; warehouseName: string; charge: string
  repairType: RepairType | null; repairTypeName: string | null; title: string | null; content: string | null
  status: Status; statusName: string; lines: RepairLine[]; saleAmount: number; sales: LinkedSale[]
  updatedAt: string | null
}
interface AsReq { id: number; asNo: string; receiptDate: string; partnerId: number; partnerName: string; title: string | null; warehouseId: number | null; lines: { itemId: number; quantity: number }[] }
/*
 * 원본 탭 [전체 · 확인 · 진행중 · 완료](2026-10-04 실측). [확인]은 진행상태가 아니라 <b>전표상태</b>다 — [진행상태변경] 메뉴가
 * '전표상태: 확인' 과 '진행상태: 진행중 · 완료' 둘로 나뉜다. 원본 수리 26건이 모두 확인이었고 미확인으로 돌리는 길이 없다
 * (결재를 거치지 않는 회사). 우리도 저장한 수리는 모두 확인이라 [확인] 탭은 전체와 같다.
 */
type Tab = '전체' | '확인' | '진행중' | '완료'
type FormLine = { itemId: string; quantity: string }
const blankLines = (): FormLine[] => [{ itemId: '', quantity: '' }, { itemId: '', quantity: '' }, { itemId: '', quantity: '' }]

export default function AsRepairListPage() {
  const pickers = useCondPickers(['partners', 'items'])
  const init = periodOf('6개월(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const [tab, setTab] = useState<Tab>('전체')
  const [rows, setRows] = useState<Repair[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [asReqs, setAsReqs] = useState<AsReq[]>([])

  async function load() {
    setLoading(true); setError('')
    try { setRows((await api.get<Repair[]>('/as-repairs', { params: { from, to } })).data) }
    catch (e) { setError(extractErrorMessage(e)) } finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])
  useEffect(() => {
    Promise.all([api.get<Partner[]>('/partners'), api.get<Item[]>('/items'), api.get<Warehouse[]>('/warehouses'), api.get<AsReq[]>('/as-requests')])
      .then(([p, i, w, a]) => { setPartners(p.data); setItems(i.data); setWarehouses(w.data); setAsReqs(a.data) })
      .catch(() => {})
  }, [])

  const shown = useMemo(() => rows
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !item || r.lines.some((l) => String(l.itemId) === item))
    .filter((r) => tab === '전체' || tab === '확인' || STATUS_LABEL[r.status] === tab)
    .sort(byUpdated
      ? (a, b) => ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : (a.updatedAt ?? '') > (b.updatedAt ?? '') ? -1 : 0)
      : (a, b) => (a.repairDate > b.repairDate ? -1 : a.repairDate < b.repairDate ? 1 : b.repairNo.localeCompare(a.repairNo))),
  [rows, partner, item, tab, byUpdated])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'A/S수리조회', [shown.length])
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.id))

  /* ── A/S수리입력 · 수정 ─────────────────────────────────────── */
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Repair | null>(null)
  const [f, setF] = useState({ repairDate: ymd(new Date()), partnerId: '', charge: '', warehouseId: '', asRequestId: '',
    repairType: '' as RepairType | '', title: '', content: '', status: 'IN_PROGRESS' as Status })
  const [lines, setLines] = useState<FormLine[]>(blankLines())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const setFv = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  function openNew() {
    setEditing(null); setFormError(''); setLines(blankLines())
    /* 원본은 저장 뒤 새 창에 [담당자] · [창고]를 남긴다. */
    setF((x) => ({ repairDate: ymd(new Date()), partnerId: '', charge: x.charge, warehouseId: x.warehouseId, asRequestId: '',
      repairType: '', title: '', content: '', status: 'IN_PROGRESS' }))
    setOpen(true)
  }
  function openEdit(r: Repair) {
    setEditing(r); setFormError('')
    setF({ repairDate: r.repairDate, partnerId: String(r.partnerId), charge: r.charge, warehouseId: String(r.warehouseId),
      asRequestId: r.asRequestId ? String(r.asRequestId) : '', repairType: r.repairType ?? '', title: r.title ?? '',
      content: r.content ?? '', status: r.status })
    setLines([...r.lines.map((l) => ({ itemId: String(l.itemId), quantity: String(l.quantity) })), { itemId: '', quantity: '' }])
    setOpen(true)
  }
  /* 원본 줄 도구 [A/S접수] — 고른 접수의 거래처 · 제목 · 품목 줄을 불러온다. */
  function pullAsRequest(id: string) {
    setFv('asRequestId', id)
    const a = asReqs.find((x) => String(x.id) === id)
    if (!a) return
    setF((x) => ({ ...x, asRequestId: id, partnerId: String(a.partnerId), title: x.title || (a.title ?? ''),
      warehouseId: x.warehouseId || (a.warehouseId ? String(a.warehouseId) : '') }))
    setLines([...a.lines.map((l) => ({ itemId: String(l.itemId), quantity: String(l.quantity) })), { itemId: '', quantity: '' }])
  }
  const setLine = (i: number, patch: Partial<FormLine>) => setLines((ls) => {
    const n = ls.map((l, k) => (k === i ? { ...l, ...patch } : l))
    if (n[n.length - 1].itemId) n.push({ itemId: '', quantity: '' })
    return n
  })
  const filled = lines.filter((l) => l.itemId)

  async function save() {
    if (saving || !open) return
    if (!f.partnerId) return setFormError('거래처를 선택하세요.')
    if (!f.charge.trim()) return setFormError('담당자를 입력하세요.')
    if (!f.warehouseId) return setFormError('창고를 선택하세요.')
    if (filled.length === 0) return setFormError('품목을 1개 이상 입력하세요.')
    setSaving(true); setFormError('')
    const body = {
      repairDate: f.repairDate, partnerId: Number(f.partnerId), charge: f.charge, warehouseId: Number(f.warehouseId),
      asRequestId: f.asRequestId ? Number(f.asRequestId) : null, repairType: f.repairType || null,
      title: f.title, content: f.content, status: f.status,
      lines: filled.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity) || 1 })),
    }
    try {
      if (editing) { await api.put(`/as-repairs/${editing.id}`, body); setOpen(false) }
      else { await api.post('/as-repairs', body); openNew() }
      load()
    } catch (e) { setFormError(extractErrorMessage(e)) } finally { setSaving(false) }
  }

  async function removeOne() {
    if (!editing || !window.confirm('선택한 전표를 삭제 하겠습니까?')) return
    try { await api.delete(`/as-repairs/${editing.id}`); setOpen(false); load() }
    catch (e) { setFormError(extractErrorMessage(e)) }
  }
  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0 || !window.confirm('선택한 전표를 삭제 하겠습니까?')) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/as-repairs/${id}`)))
    const failed = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]
    setPicked(new Set())
    setError(failed.map((x) => extractErrorMessage(x.reason)).join(' / '))
    load()
  }

  /* ── 판매연결전표 ─────────────────────────────────────────────── */
  const [saleFor, setSaleFor] = useState<Repair | null>(null)
  const [saleLines, setSaleLines] = useState<{ itemId: string; quantity: string; unitPrice: string }[]>([])
  const [saleError, setSaleError] = useState('')
  useShortcut('F8', save, open && !saleFor)
  function openSales(r: Repair) { setSaleFor(r); setSaleError(''); setSaleLines([{ itemId: '', quantity: '', unitPrice: '' }]) }
  async function addSale() {
    if (!saleFor) return
    const ls = saleLines.filter((l) => l.itemId)
    if (ls.length === 0) return setSaleError('품목을 1개 이상 입력하세요.')
    try {
      const r = (await api.post<Repair>(`/as-repairs/${saleFor.id}/sales`, {
        lines: ls.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      })).data
      setSaleFor(r); setSaleLines([{ itemId: '', quantity: '', unitPrice: '' }]); setSaleError(''); load()
    } catch (e) { setSaleError(extractErrorMessage(e)) }
  }
  async function removeSale(s: LinkedSale) {
    if (!saleFor || !window.confirm(`${s.docNo} 판매를 삭제할까요? (재고 · 매출이 되돌아갑니다)`)) return
    try { setSaleFor((await api.delete<Repair>(`/as-repairs/${saleFor.id}/sales/${s.salesId}`)).data); load() }
    catch (e) { setSaleError(extractErrorMessage(e)) }
  }

  /** 목록 [진행상태변경] — 고른 수리를 진행중 · 완료로. */
  const [statusOpen, setStatusOpen] = useState(false)
  async function changeStatus(status: Status) {
    const ids = [...picked]
    const results = await Promise.allSettled(ids.map((id) => api.patch(`/as-repairs/${id}/status`, { status })))
    const failed = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]
    setStatusOpen(false)
    setPicked(new Set())
    setError(failed.map((x) => extractErrorMessage(x.reason)).join(' / '))
    load()
  }

  /** 목록 [인쇄] — 고른 수리를 한 번에(줄의 [인쇄]는 한 건). */
  async function printRepairs(rs: Repair[]) {
    const ours = await loadSupplierParty('수리처')
    await printDocuments(rs.map((r) => ({
      title: 'A/S 수리내역', docNo: r.repairNo, docDate: r.repairDate,
      supplier: ours ?? { label: '수리처', name: '(회사정보 미등록)' },
      customer: { label: '의뢰처', name: r.partnerName },
      extra: [{ label: '제목', value: r.title }, { label: '수리유형', value: r.repairTypeName }, { label: '수리담당자', value: r.charge }, { label: '수리진행상태', value: r.statusName }],
      remark: r.content, hideAmounts: true,
      lines: r.lines.map((l) => ({ itemName: l.itemName, spec: l.itemSpec ?? undefined, unit: '', quantity: l.quantity, unitPrice: 0, supplyAmount: 0, vatAmount: 0 })),
    })))
  }
  const printRepair = (r: Repair) => printRepairs([r])

  const partnerPicks = partners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))
  const itemPicks = items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec }))
  const itemById = new Map(items.map((x) => [String(x.id), x]))

  return (
    <EcListShell
      onSearch={load}
      title="A/S수리조회"
      searchable={false}
      onNew={openNew}
      actions={[
        /* 원본 버튼줄: 신규(F2) · Email · 진행상태변경 · 보내기 · 인쇄 · 바코드(품목) · 다른전표생성 · 선택삭제 · Excel · 이력조회.
           Email · 보내기는 바깥으로 보내는 일이라 두지 않는다. */
        { label: '진행상태변경', onClick: () => setStatusOpen(true), disabled: picked.size === 0 },
        { label: '인쇄', onClick: () => void printRepairs(rows.filter((r) => picked.has(r.id))), disabled: picked.size === 0 },
        { label: '선택삭제', onClick: removeChecked, disabled: picked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={AS_REPAIR_LIST_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      {/* 원본 알약: 전체 · 확인 · 진행중 · 완료 */}
      <div className="ec-pills mb-[8px]">
        {(['전체', '확인', '진행중', '완료'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full ec-head700">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <input type="checkbox" checked={allPicked} disabled={shown.length === 0}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
            <th className="text-center">수리번호</th>
            <th className="text-center">접수번호</th>
            <th>거래처명</th>
            <th>제목</th>
            <th>수리내용</th>
            <th>수리품목명</th>
            <th>수리담당자명</th>
            <th className="text-right">금액</th>
            <th className="w-[60px] text-center">인쇄</th>
            <th className="w-[84px] text-center">생성한 전표</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((s) => {
                  const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n
                })} />
              </td>
              <td className="text-center"><a className="ec-link cursor-pointer" onClick={() => openEdit(r)}>{dateNo(r.repairDate, r.repairNo)}</a></td>
              <td className="text-center">{r.receiptDate ? dateNo(r.receiptDate, r.asNo) : ''}</td>
              <td>{r.partnerName}</td>
              <td>{r.title ?? ''}</td>
              <td>{r.content ?? ''}</td>
              <td>{r.lines[0] ? `${r.lines[0].itemName}${r.lines[0].itemSpec ? ` [${r.lines[0].itemSpec}]` : ''}${r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}` : ''}</td>
              <td>{r.charge}</td>
              <td className="text-right">{won(r.saleAmount)}</td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => printRepair(r)}>인쇄</button></td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => openSales(r)}>조회</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={open} width={980} error={formError} onClose={() => setOpen(false)} title={editing ? 'A/S수리수정' : 'A/S수리입력'}>
        <ul className="ec-form">
          <li><div className="title">일자</div><div className="form">
            <input type="date" className="ec-input w-[150px]" value={f.repairDate} disabled={!!editing} onChange={(e) => setFv('repairDate', e.target.value)} />
          </div></li>
          <li><div className="title">거래처</div><div className="form">
            <CodePickerField label="거래처" hideLabel fill emptyLabel="" placeholder="거래처" value={f.partnerId} onChange={(v) => setFv('partnerId', v)} items={partnerPicks} />
          </div></li>
          <li><div className="title">담당자</div><div className="form">
            <input className="ec-input w-full" placeholder="담당자" value={f.charge} onChange={(e) => setFv('charge', e.target.value)} />
          </div></li>
          <li><div className="title">창고</div><div className="form">
            <CodePickerField label="창고" hideLabel fill emptyLabel="" placeholder="창고" value={f.warehouseId} onChange={(v) => setFv('warehouseId', v)}
                             items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
          </div></li>
          <li><div className="title">접수일자</div><div className="form">
            <CodePickerField label="A/S접수" hideLabel fill emptyLabel="선택 안 함" placeholder="A/S접수" value={f.asRequestId} onChange={pullAsRequest}
                             items={asReqs.map((a) => ({ value: String(a.id), code: dateNo(a.receiptDate, a.asNo), name: `${a.partnerName} ${a.title ?? ''}` }))} />
          </div></li>
          <li><div className="title">수리유형</div><div className="form">
            <CodePickerField label="수리유형" hideLabel fill emptyLabel="선택 안 함" placeholder="수리유형" value={f.repairType} onChange={(v) => setFv('repairType', v)}
                             items={REPAIR_TYPES.map((t) => ({ value: t.value, code: t.code, name: t.name }))} />
          </div></li>
          <li className="wide"><div className="title">제목</div><div className="form">
            <input className="ec-input w-full" placeholder="제목" value={f.title} onChange={(e) => setFv('title', e.target.value)} />
          </div></li>
          <li className="wide"><div className="title">소모(판매)금액</div><div className="form">{won(editing?.saleAmount ?? 0)}</div></li>
          <li className="wide"><div className="title">수리내용</div><div className="form">
            <textarea className="ec-input w-full h-[52px]" placeholder="수리내용" value={f.content} onChange={(e) => setFv('content', e.target.value)} />
          </div></li>
          <li><div className="title">수리진행상태</div><div className="form">
            <select className="ec-input w-[150px]" value={f.status} onChange={(e) => setFv('status', e.target.value)}>
              <option value="IN_PROGRESS">진행중</option><option value="COMPLETED">완료</option>
            </select>
          </div></li>
        </ul>
        <table className="w-full ec-head700 mt-[8px]">
          <thead><tr><th className="w-[34px]"></th><th className="w-[200px]">품목코드</th><th>품목명</th><th className="w-[160px]">규격</th><th className="w-[110px] text-right">수량</th></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const it = itemById.get(l.itemId)
              return (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td><CodePickerField label="품목" hideLabel fill emptyLabel="지우기" placeholder="품목코드" value={l.itemId}
                                       onChange={(v) => setLine(i, { itemId: v, quantity: l.quantity || (v ? '1' : '') })} items={itemPicks} /></td>
                  <td>{it?.name ?? ''}</td>
                  <td>{it?.spec ?? ''}</td>
                  <td><input className="ec-input w-full text-right" value={l.quantity} disabled={!l.itemId} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr><td colSpan={4}></td><td className="text-right">{won(filled.reduce((a, l) => a + (Number(l.quantity) || 0), 0))}</td></tr></tfoot>
        </table>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
          {editing
            ? <button className="ec-btn" onClick={removeOne}>삭제</button>
            : <button className="ec-btn" onClick={() => { setLines(blankLines()); setF((x) => ({ ...x, partnerId: '', asRequestId: '', title: '', content: '' })) }}>다시 작성</button>}
          <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={!!saleFor} width={760} error={saleError} onClose={() => setSaleFor(null)} title="판매연결전표">
        <p className="mb-[6px]">A/S수리전표 : {saleFor ? `${saleFor.repairDate.replace(/-/g, '/')} -${Number(saleFor.repairNo.split('-').pop())}` : ''}</p>
        <table className="w-full ec-head700 mb-[10px]">
          <thead><tr><th>판매연결전표</th><th className="w-[110px] text-center">일자</th><th className="w-[120px] text-right">합계</th><th className="w-[60px]"></th></tr></thead>
          <tbody>
            {(saleFor?.sales.length ?? 0) === 0 ? (
              <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : saleFor!.sales.map((s) => (
              <tr key={s.salesId}>
                <td>{s.docNo}</td><td className="text-center">{yy(s.saleDate)}</td><td className="text-right">{won(s.totalAmount)}</td>
                <td className="text-center"><button type="button" className="ec-link" onClick={() => removeSale(s)}>삭제</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="font-bold mb-[4px]">신규 — 부품 · 수리비를 판매로 잡는다(재고가 빠지고 매출이 선다)</div>
        <table className="w-full ec-head700">
          <thead><tr><th>품목</th><th className="w-[100px] text-right">수량</th><th className="w-[120px] text-right">단가</th></tr></thead>
          <tbody>
            {saleLines.map((l, i) => (
              <tr key={i}>
                <td><CodePickerField label="품목" hideLabel fill emptyLabel="지우기" placeholder="품목" value={l.itemId} items={itemPicks}
                                     onChange={(v) => setSaleLines((ls) => {
                                       const n = ls.map((x, k) => (k === i ? { ...x, itemId: v, quantity: x.quantity || (v ? '1' : '') } : x))
                                       if (n[n.length - 1].itemId) n.push({ itemId: '', quantity: '', unitPrice: '' })
                                       return n
                                     })} /></td>
                <td><input className="ec-input w-full text-right" value={l.quantity} onChange={(e) => setSaleLines((ls) => ls.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))} /></td>
                <td><input className="ec-input w-full text-right" value={l.unitPrice} onChange={(e) => setSaleLines((ls) => ls.map((x, k) => (k === i ? { ...x, unitPrice: e.target.value } : x)))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={addSale}>신규(F2)</button>
          <button className="ec-btn" onClick={() => setSaleFor(null)}>닫기</button>
        </div>
      </Modal>
      {/* 원본 [진행상태변경] 메뉴 — 전표상태(확인) · 진행상태(진행중 · 완료). 전표상태는 늘 확인이라 진행상태만 고른다. */}
      <Modal error={error} open={statusOpen} title="진행상태변경" onClose={() => setStatusOpen(false)} width={320}>
        <p className="mb-[8px]">진행상태</p>
        <div className="flex gap-[6px]">
          {(Object.keys(STATUS_LABEL) as Status[]).map((st) => (
            <button key={st} type="button" className="ec-btn" onClick={() => void changeStatus(st)}>{STATUS_LABEL[st]}</button>
          ))}
        </div>
      </Modal>
    </EcListShell>
  )
}

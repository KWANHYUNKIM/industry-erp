import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import EcDateField from '../../components/EcDateField'
import EcSlipShell from '../../components/EcSlipShell'
import { ymd } from '../../components/EcPeriodPicks'
import SlipLoadModal, { type LoadedSlip } from '../../features/slipload/components/SlipLoadModal'
import SalesOrderPickModal, { type SalesOrderLite } from '../../features/salesorder/components/SalesOrderPickModal'
import { useMyItemsPick, MyItemsNote } from '../../components/MyItemsButton'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { downloadStoredFile } from '../../utils/fileDownload'
import type { Item, Warehouse, WorkOrder } from '../../types/api'

/**
 * 재고 I &gt; 생산/외주 &gt; <b>작업지시서입력</b>.
 *
 * <p>원본은 머리(일자·납품처·프로젝트·담당자·납기일자) 아래 품목을 여러 줄(품목코드·품목명·규격·
 * 수량·생산공장) 넣고 [저장] 하면 번호 하나("2026/10/07 -1")가 붙는다. 우리는 품목 하나짜리 창이라
 * 같은 주문의 제품 셋을 지시하면 번호가 셋 생겼다.
 *
 * <p>줄의 [생산공장]이 그 지시의 창고다 — 생산입고에서 지시를 불러오면 받는창고 기본값이 된다.
 * <code>?no=WO-…</code> 로 열면 그 전표를 고친다(작업지시서조회에서 번호를 누른 것).
 * 이미 생산한 줄은 품목을 바꾸거나 기생산 밑으로 줄일 수 없다(서버가 막는다).
 */

const won = (n: number) => (Number.isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '')
const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0 }
const today = () => ymd(new Date())

interface Line { key: number; productId: string; qty: string; warehouseId: string; produced: number }
let seq = 1
const blank = (warehouseId = ''): Line => ({ key: seq++, productId: '', qty: '', warehouseId, produced: 0 })
const BLANK_ROWS = 5


export default function WorkOrderEntryPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editNo = params.get('no')

  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [partners, setPartners] = useState<{ id: number; code: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [employees, setEmployees] = useState<{ id: number; code: string; name: string }[]>([])

  const [date, setDate] = useState(today())
  /** 원본도 [납기일자]가 오늘로 뜬다 — 일자칸은 비워 둘 수 없어 보이는 값이 곧 저장값이다. */
  const [dueDate, setDueDate] = useState(today())
  const [partnerId, setPartnerId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  /** 원본 머리의 [첨부] — 파일을 먼저 올려 id 를 받고, 저장할 때 그 id 를 붙인다(업무게시판과 같은 방식). */
  const [attachment, setAttachment] = useState<{ id: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  async function upload(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post<{ id: number; name: string }>('/files', fd)
      setAttachment({ id: r.data.id, name: r.data.name })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }
  const [lines, setLines] = useState<Line[]>(() => Array.from({ length: BLANK_ROWS }, () => blank()))
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)
  /*
   * 원본 툴바의 <b>[주문]</b> — 주문서검색창(조회)에서 주문을 골라 [적용(F8)] 하면 납품처·납기일자가 그 주문으로
   * 바뀌고 <b>생산할 수 있는 품목(제품·반제품)</b> 줄만 들어온다(2026-10-02 loginaa 실측: 상품만 든 주문은
   * 머리만 바뀌고 줄은 안 들어왔다). 수량은 주문수량이다.
   */
  const [orderOpen, setOrderOpen] = useState(false)
  /** 원본 툴바의 [전표불러오기] — 메뉴검색에서 고른 전표의 생산할 수 있는 품목 줄을 수량 그대로 붓는다([주문] 과 같은 규칙). */
  const [slipLoadOpen, setSlipLoadOpen] = useState(false)
  /**
   * 원본 툴바의 [재고불러오기] — 줄마다 <b>전체수량</b>(전 창고 합)과 <b>창고수량</b>(그 줄 생산공장의 재고)을 채운다
   * (2026-10-02 loginaa 실측: 격자 끝에 두 열이 있고 버튼을 누르면 채워진다). 안 눌렀으면 비어 있다(0 이 아니다).
   */
  const [stocks, setStocks] = useState<{ itemId: number; warehouseId: number; quantity: number }[] | null>(null)
  const [stockBusy, setStockBusy] = useState(false)
  async function loadStocks() {
    setStockBusy(true)
    try {
      setStocks((await api.get<{ itemId: number; warehouseId: number; quantity: number }[]>('/stock')).data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setStockBusy(false)
    }
  }
  const stockAll = (itemId: string) => (stocks == null || !itemId ? null
    : stocks.filter((x) => String(x.itemId) === itemId).reduce((a, x) => a + Number(x.quantity), 0))
  const stockAt = (itemId: string, whId: string) => (stocks == null || !itemId || !whId ? null
    : Number(stocks.find((x) => String(x.itemId) === itemId && String(x.warehouseId) === whId)?.quantity ?? 0))
  function applyLoadedSlips(slips: LoadedSlip[]) {
    const factory = lastFactory()
    const makeable = slips.flatMap((x) => x.lines)
      .filter((l) => { const c = itemById.get(String(l.itemId))?.category; return c === 'FINISHED' || c === 'SEMI_FINISHED' })
    if (makeable.length === 0) { setOk(`고른 ${slips[0]?.kind ?? ''} 전표에 생산할 품목(제품·반제품)이 없습니다.`); return }
    setLines((ls) => {
      const kept = [...ls.filter((l) => l.productId),
        ...makeable.map((l) => ({ ...blank(factory), productId: String(l.itemId), qty: String(l.quantity) }))]
      return [...kept, ...Array.from({ length: Math.max(1, BLANK_ROWS - kept.length) }, () => blank())]
    })
    setOk(`${slips[0].kind} ${slips.length}건에서 ${makeable.length}줄을 담았습니다.`)
  }
  function applyOrders(picked: SalesOrderLite[]) {
    const first = picked[0]
    if (first.partnerId != null) setPartnerId(String(first.partnerId))
    if (first.dueDate) setDueDate(first.dueDate)
    const factory = lastFactory()
    const makeable = picked.flatMap((o) => o.lines)
      .filter((l) => { const c = itemById.get(String(l.itemId))?.category; return c === 'FINISHED' || c === 'SEMI_FINISHED' })
    setLines((ls) => {
      const kept = [...ls.filter((l) => l.productId),
        ...makeable.map((l) => ({ ...blank(factory), productId: String(l.itemId), qty: String(l.quantity) }))]
      return [...kept, ...Array.from({ length: Math.max(1, BLANK_ROWS - kept.length) }, () => blank())]
    })
    setOk(makeable.length === 0 ? '고른 주문에 생산할 품목(제품·반제품)이 없어 납품처·납기일자만 바꿨습니다.' : '')
    setOrderOpen(false)
  }

  useEffect(() => {
    void Promise.all([
      api.get<Item[]>('/items').then((r) => setItems(r.data.filter((i) => i.active))),
      api.get<Warehouse[]>('/warehouses').then((r) => setWarehouses(r.data.filter((w) => w.active))),
      api.get<{ id: number; code: string; name: string }[]>('/partners').then((r) => setPartners(r.data)),
      api.get<{ id: number; code: string; name: string }[]>('/projects').then((r) => setProjects(r.data)),
      api.get<{ id: number; code: string; name: string; active?: boolean }[]>('/employees')
        .then((r) => setEmployees(r.data.filter((e) => e.active !== false))),
    ]).catch((e) => setError(extractErrorMessage(e)))
  }, [])

  useEffect(() => {
    if (!editNo) return
    api.get<WorkOrder[]>(`/work-orders/slips/${encodeURIComponent(editNo)}`).then((r) => {
      const h = r.data[0]
      if (!h) return
      setDate(h.orderDate)
      setDueDate(h.dueDate ?? h.orderDate)
      setPartnerId(h.partnerId != null ? String(h.partnerId) : '')
      setProjectId(h.projectId != null ? String(h.projectId) : '')
      setEmployeeId(h.employeeId != null ? String(h.employeeId) : '')
      setAttachment(h.attachmentId ? { id: h.attachmentId, name: h.attachmentName ?? '첨부' } : null)
      const ls = r.data.map((w) => ({ key: seq++, productId: String(w.productId), qty: String(w.plannedQty),
        warehouseId: String(w.warehouseId), produced: Number(w.producedQty) }))
      setLines([...ls, ...Array.from({ length: Math.max(1, BLANK_ROWS - ls.length) }, () => blank())])
    }).catch((e) => setError(extractErrorMessage(e)))
  }, [editNo])

  const itemById = useMemo(() => new Map(items.map((i) => [String(i.id), i])), [items])
  const itemPicks = useMemo(() => items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, sub: i.spec })), [items])
  /** 생산공장 — 공장·외주를 먼저 보인다. */
  const factoryPicks = useMemo(() => [...warehouses]
    .sort((a, b) => Number(a.kind === '창고') - Number(b.kind === '창고'))
    .map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.kind })), [warehouses])

  /** 바로 위 줄의 생산공장을 따라간다 — 같은 공장에서 만드는 것이 보통이다. */
  const lastFactory = () => [...lines].reverse().find((l) => l.warehouseId)?.warehouseId ?? ''

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => {
      const next = ls.map((l) => {
        if (l.key !== key) return l
        const n = { ...l, ...patch }
        if (patch.productId && !n.warehouseId) n.warehouseId = lastFactory()
        return n
      })
      return next[next.length - 1].productId ? [...next, blank()] : next
    })
  }

  const myItems = useMyItemsPick((picked) => setLines((ls) => {
    const factory = lastFactory()
    return [...ls.filter((l) => l.productId),
      ...picked.map((m) => ({ ...blank(factory), productId: String(m.itemId), qty: String(m.defaultQty) })), blank()]
  }))

  const filled = lines.filter((l) => l.productId)

  function reset() {
    setDate(today()); setDueDate(today()); setPartnerId(''); setProjectId(''); setEmployeeId('')
    setLines(Array.from({ length: BLANK_ROWS }, () => blank())); setError(''); setOk('')
    if (editNo) navigate(location.pathname, { replace: true })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (filled.length === 0) return setError('품목을 한 줄 이상 넣으세요.')
    for (const [i, l] of filled.entries()) {
      if (!(num(l.qty) > 0)) return setError(`${i + 1}번째 줄: 수량을 입력하세요.`)
      if (!l.warehouseId) return setError(`${i + 1}번째 줄: 생산공장을 입력바랍니다.`)
    }
    const body = {
      orderDate: date, dueDate: dueDate || null,
      partnerId: partnerId ? Number(partnerId) : null,
      projectId: projectId ? Number(projectId) : null,
      employeeId: employeeId ? Number(employeeId) : null,
      attachmentId: attachment ? attachment.id : null,
      lines: filled.map((l) => ({ productId: Number(l.productId), plannedQty: num(l.qty), warehouseId: Number(l.warehouseId) })),
    }
    setSaving(true)
    try {
      const r = editNo
        ? await api.put<WorkOrder[]>(`/work-orders/slips/${encodeURIComponent(editNo)}`, body)
        : await api.post<WorkOrder[]>('/work-orders/slips', body)
      reset()
      setOk(`${r.data[0]?.orderNo ?? ''} 작업지시 ${editNo ? '수정' : '등록'} 완료 · ${r.data.length}줄 · 수량 ${won(r.data.reduce((n, w) => n + Number(w.plannedQty), 0))}`)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function removeSlip() {
    if (!editNo || !window.confirm(`${editNo} 작업지시서를 삭제합니다.`)) return
    try {
      await api.delete(`/work-orders/slips/${encodeURIComponent(editNo)}`)
      navigate('/production/work-orders')
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const gridRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(gridRef, '작업지시서입력', [lines.length])

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <EcSlipShell
        title={'작업지시서입력' + (editNo ? ` (${editNo})` : '')}
        actions={[
          { label: saving ? '저장 중…' : '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '다시 작성', onClick: reset },
          { label: '리스트', onClick: () => navigate('/production/work-orders') },
          ...(editNo ? [{ label: '삭제', onClick: () => void removeSlip() }] : []),
        ]}
        help={
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>품목을 여러 줄 넣어도 작업지시서 번호는 하나입니다. 줄마다 생산공장을 정합니다(위 줄을 따라갑니다).</li>
            <li>생산입고·생산불출에서 [작업지시서]로 이 지시를 불러오면 잔량(지시수량 − 기생산)과 BOM 소요량이 들어옵니다.</li>
            <li>이미 생산한 줄은 품목을 바꾸거나 지시수량을 기생산보다 줄일 수 없습니다.</li>
          </ul>
        }
      >
        <ul className="ec-form">
          <li>
            <div className="title">일자</div>
            <div className="form"><EcDateField value={date} onChange={setDate} /></div>
          </li>
          <li>
            <div className="title">납품처</div>
            <div className="form">
              <CodePickerField label="납품처" hideLabel pair value={partnerId} onChange={setPartnerId}
                               items={partners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
          </li>
          <li>
            <div className="title">프로젝트</div>
            <div className="form">
              <CodePickerField label="프로젝트" hideLabel pair value={projectId} onChange={setProjectId}
                               items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
          </li>
          <li>
            <div className="title">담당자</div>
            <div className="form">
              <CodePickerField label="담당자" hideLabel pair value={employeeId} onChange={setEmployeeId}
                               items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
          </li>
          <li>
            <div className="title">납기일자</div>
            <div className="form"><EcDateField value={dueDate} onChange={setDueDate} /></div>
          </li>
          <li>
            {/* 원본 머리의 [작업지시No.]. 번호는 저장할 때 서버가 매긴다. */}
            <div className="title">작업지시No.</div>
            <div className="form">
              <input className="ec-input" readOnly value={editNo ?? '(저장 시 자동채번)'}
                     style={{ width: 170, background: '#f4f5f7', color: 'var(--ec-text-hint)' }} />
            </div>
          </li>
          <li>
            {/* 원본 머리 맨 끝의 [첨부] — 도면·작업표준서를 붙여 현장에 내린다. */}
            <div className="title">첨부</div>
            <div className="form" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label className="ec-btn ec-btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                {uploading ? '올리는 중…' : '파일 선택'}
                <input type="file" aria-label="첨부 파일" style={{ display: 'none' }} disabled={uploading}
                       onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
              </label>
              {attachment && (
                <span style={{ fontSize: 12, color: 'var(--ec-blue-dark)' }}>
                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => void downloadStoredFile(attachment.id, attachment.name)}>{attachment.name}</span>
                  <span onClick={() => setAttachment(null)} title="첨부 빼기"
                        style={{ cursor: 'pointer', marginLeft: 6, fontWeight: 700 }}>×</span>
                </span>
              )}
            </div>
          </li>
        </ul>

        <div className="ec-toolbar" style={{ marginTop: 10 }}>
          <button type="button" className="ec-btn ec-btn-sm" disabled={myItems.busy} onClick={myItems.pick}>My품목</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => { setError(''); setOrderOpen(true) }}>주문</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setSlipLoadOpen(true)}>전표불러오기</button>
          <button type="button" className="ec-btn ec-btn-sm" disabled={stockBusy} onClick={() => void loadStocks()}>재고불러오기</button>
          <MyItemsNote note={myItems.note} />
        </div>

        <div ref={gridRef} style={{ overflowX: 'auto' }}>
          <table className="ec-grid-input no-ec" style={{ tableLayout: 'fixed', minWidth: 1100 }}>
            <colgroup>
              <col style={{ width: 30 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 260 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr>
                <th />
                <th style={{ textAlign: 'left' }}>품목코드</th>
                <th style={{ textAlign: 'left' }}>품목명</th>
                <th style={{ textAlign: 'left' }}>규격</th>
                <th style={{ textAlign: 'right' }}>수량</th>
                <th style={{ textAlign: 'left' }}>생산공장</th>
                <th style={{ textAlign: 'right' }}>기생산</th>
                <th style={{ textAlign: 'right' }}>전체수량</th>
                <th style={{ textAlign: 'right' }}>창고수량</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const it = itemById.get(l.productId)
                return (
                  <tr key={l.key}>
                    <td style={{ textAlign: 'center', background: 'var(--ec-report-stripe)', color: 'var(--ec-text-hint)' }}>{idx + 1}</td>
                    <td className="pad" style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--ec-label)', overflow: 'hidden', whiteSpace: 'nowrap' }}>{it?.code ?? ''}</td>
                    <td className="pad">
                      <CodePickerField label="품목" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                       value={l.productId} onChange={(v) => setLine(l.key, { productId: v })} items={itemPicks} />
                    </td>
                    <td className="pad" style={{ color: 'var(--ec-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it?.spec ?? ''}</td>
                    <td>
                      <input className="cell" type="number" step="any" style={{ textAlign: 'right' }} disabled={!l.productId}
                             value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                    </td>
                    <td className="pad">
                      <CodePickerField label="생산공장" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                       value={l.warehouseId} onChange={(v) => setLine(l.key, { warehouseId: v })} items={factoryPicks} />
                    </td>
                    <td className="pad" style={{ textAlign: 'right', color: 'var(--ec-text-hint)' }}>{l.produced > 0 ? won(l.produced) : ''}</td>
                    <td className="pad" style={{ textAlign: 'right', color: 'var(--ec-label)' }}>{stockAll(l.productId) == null ? '' : won(stockAll(l.productId)!)}</td>
                    <td className="pad" style={{ textAlign: 'right', color: 'var(--ec-label)' }}>{stockAt(l.productId, l.warehouseId) == null ? '' : won(stockAt(l.productId, l.warehouseId)!)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} />
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(filled.reduce((n, l) => n + num(l.qty), 0))}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>

        {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, margin: '8px 0' }}>{error}</p>}
        {ok && <p style={{ background: 'var(--ec-success-bg)', color: 'var(--ec-success)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, margin: '8px 0' }}>{ok}</p>}
      </EcSlipShell>
      <SlipLoadModal open={slipLoadOpen} onClose={() => setSlipLoadOpen(false)} onApply={applyLoadedSlips} />
      <SalesOrderPickModal open={orderOpen} onClose={() => setOrderOpen(false)} onApply={applyOrders} />
    </form>
  )
}

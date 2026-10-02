import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import EcDateField from '../../components/EcDateField'
import EcSlipShell from '../../components/EcSlipShell'
import { periodOf, ymd } from '../../components/EcPeriodPicks'
import Modal from '../../components/Modal'
import { dateText } from '../../utils/dateText'
import { useMyItemsPick, MyItemsNote } from '../../components/MyItemsButton'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
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

/** GET /sales-orders 한 건 — [주문] 창이 쓰는 것만. */
interface SalesOrderLite {
  id: number; orderNo: string; orderDate: string; dueDate: string | null
  partnerId: number | null; partnerName: string | null; employeeName: string | null
  status: string; statusName: string; totalAmount: number
  lines: { itemId: number; itemName: string; quantity: number }[]
}
/** 원본 주문서검색창의 기본 기간과 같다(전월 2일 ~ 다음 달 1일 무렵). */
const ORDER_PERIOD = periodOf('최근30일(+1개월)')!

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
  const [salesOrders, setSalesOrders] = useState<SalesOrderLite[]>([])
  const [orderPicked, setOrderPicked] = useState<number[]>([])
  const [orderTab, setOrderTab] = useState<'전체' | '진행중' | '완료'>('진행중')
  async function openOrders() {
    setError('')
    try {
      const r = await api.get<SalesOrderLite[]>('/sales-orders', { params: { from: ORDER_PERIOD.from, to: ORDER_PERIOD.to } })
      setSalesOrders(r.data); setOrderPicked([]); setOrderOpen(true)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  function applyOrders() {
    const picked = salesOrders.filter((o) => orderPicked.includes(o.id))
    if (picked.length === 0) { setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
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
                     style={{ width: 170, background: '#f4f5f7', color: '#8a929c' }} />
            </div>
          </li>
        </ul>

        <div className="ec-toolbar" style={{ marginTop: 10 }}>
          <button type="button" className="ec-btn ec-btn-sm" disabled={myItems.busy} onClick={myItems.pick}>My품목</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openOrders()}>주문</button>
          <MyItemsNote note={myItems.note} />
        </div>

        <div ref={gridRef} style={{ overflowX: 'auto' }}>
          <table className="ec-grid-input no-ec" style={{ tableLayout: 'fixed', minWidth: 900 }}>
            <colgroup>
              <col style={{ width: 30 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 260 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 200 }} />
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
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const it = itemById.get(l.productId)
                return (
                  <tr key={l.key}>
                    <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{idx + 1}</td>
                    <td className="pad" style={{ fontFamily: 'ui-monospace, monospace', color: '#5a626e', overflow: 'hidden', whiteSpace: 'nowrap' }}>{it?.code ?? ''}</td>
                    <td className="pad">
                      <CodePickerField label="품목" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                       value={l.productId} onChange={(v) => setLine(l.key, { productId: v })} items={itemPicks} />
                    </td>
                    <td className="pad" style={{ color: '#5a626e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it?.spec ?? ''}</td>
                    <td>
                      <input className="cell" type="number" step="any" style={{ textAlign: 'right' }} disabled={!l.productId}
                             value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                    </td>
                    <td className="pad">
                      <CodePickerField label="생산공장" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                       value={l.warehouseId} onChange={(v) => setLine(l.key, { warehouseId: v })} items={factoryPicks} />
                    </td>
                    <td className="pad" style={{ textAlign: 'right', color: '#8a929c' }}>{l.produced > 0 ? won(l.produced) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} />
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(filled.reduce((n, l) => n + num(l.qty), 0))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, margin: '8px 0' }}>{error}</p>}
        {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, margin: '8px 0' }}>{ok}</p>}
      </EcSlipShell>
      <Modal open={orderOpen} title="주문서검색창(조회)" error={error} width={980} onClose={() => setOrderOpen(false)}>
        <div className="ec-pills" style={{ marginBottom: 6 }}>
          {(['전체', '진행중', '완료'] as const).map((t) => (
            <button key={t} type="button" className={`ec-pill no-ec${orderTab === t ? ' active' : ''}`} onClick={() => setOrderTab(t)}>{t}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#8a929c' }}>{dateText(ORDER_PERIOD.from)} ~ {dateText(ORDER_PERIOD.to)}</span>
        </div>
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 30 }} />
                <th>일자-No.</th>
                <th>거래처명</th>
                <th>사원(담당)명</th>
                <th>품목명</th>
                <th>납기일자</th>
                <th style={{ textAlign: 'right' }}>주문금액합계</th>
                <th>진행상태</th>
              </tr>
            </thead>
            <tbody>
              {salesOrders.filter((o) => orderTab === '전체' || (orderTab === '완료') === (o.status === 'COMPLETED')).length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>등록된 데이터가 없습니다.</td></tr>
              ) : salesOrders.filter((o) => orderTab === '전체' || (orderTab === '완료') === (o.status === 'COMPLETED')).map((o) => (
                <tr key={o.id} style={{ cursor: 'pointer' }}
                    onClick={() => setOrderPicked((p) => (p.includes(o.id) ? p.filter((x) => x !== o.id) : [...p, o.id]))}>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" readOnly checked={orderPicked.includes(o.id)} /></td>
                  <td>{dateText(o.orderDate)} {o.orderNo}</td>
                  <td>{o.partnerName ?? ''}</td>
                  <td>{o.employeeName ?? ''}</td>
                  <td>{o.lines[0]?.itemName ?? ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
                  <td>{dateText(o.dueDate) || ''}</td>
                  <td style={{ textAlign: 'right' }}>{won(Number(o.totalAmount))}</td>
                  <td>{o.statusName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          <button type="button" className="ec-btn ec-btn-primary" onClick={applyOrders}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setOrderOpen(false)}>닫기</button>
        </div>
      </Modal>
    </form>
  )
}

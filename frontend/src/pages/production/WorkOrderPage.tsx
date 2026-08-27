import { useEffect, useState, type FormEvent } from 'react'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Warehouse, WorkOrder } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { Link } from 'react-router-dom'
import { printDocuments } from '../../utils/printDocument'

const inputCls = 'ec-input'

/**
 * 원본 작업지시서조회의 탭 실측(사본): 전체 · 결재중 · 미확인 · 확인 · 진행중 · 완료.
 * 결재중·미확인·확인은 결재/확인 흐름이 작업지시에 없어 만들지 않는다 —
 * 눌러도 늘 빈 목록인 탭은 있는 것만 못하다.
 */
const TABS = ['전체', '대기', '진행중', '완료'] as const
type Tab = typeof TABS[number]
const TAB_STATUS: Record<string, string> = { 대기: 'PLANNED', 진행중: 'IN_PROGRESS', 완료: 'COMPLETED' }

/**
 * 원본 작업지시서조회의 마지막 세 열은 그 지시의 현황으로 가는 <b>바로가기</b>다
 * (작업지시서별불출현황 · 작업지시서별생산현황 · 작업지시서별작업현황).
 * 우리 화면에는 지시를 골라 놓고 그 지시가 어떻게 굴러갔는지 볼 길이 없었다.
 */
const LINKS = [
  { label: '불출', to: '/production/issue-status', title: '작업지시서별불출현황' },
  { label: '생산', to: '/production/receipt-status', title: '작업지시서별생산현황' },
  { label: '작업', to: '/production/work-result-status', title: '작업지시서별작업현황' },
]

const today = () => ymd(new Date())

/**
 * 원본 작업지시서조회 격자의 마지막 열 <b>[인쇄]</b> — 그 지시 한 건을 작업지시서로 찍는다.
 * 작업지시에는 금액이 없다(무엇을 얼마나 만들라는 지시다) — 금액 칸을 안 그린다.
 */
async function printOne(o: WorkOrder, empName: (id: number | null) => string) {
  await printDocuments([{
    title: '작 업 지 시 서',
    docNo: o.orderNo,
    docDate: o.orderDate,
    hideAmounts: true,
    hideParties: true,
    supplier: { label: '', name: '' },
    customer: { label: '', name: '' },
    extra: [
      { label: '납품처', value: o.partnerName },
      { label: '담당자', value: o.employeeId ? empName(o.employeeId) : null },
      { label: '창고', value: o.warehouseName },
      { label: '납기일자', value: o.dueDate },
      { label: '진행상태', value: o.statusName },
    ],
    remark: o.remark,
    lines: [{
      itemCode: o.productCode, itemName: o.productName, unit: o.productUnit,
      quantity: o.plannedQty, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
    }],
  }])
}

const statusColor = (s: string) =>
  s === 'COMPLETED' ? '#1c7c3c' : s === 'IN_PROGRESS' ? '#b6791b' : '#7a828c'

export default function WorkOrderPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    productId: '', warehouseId: '', plannedQty: '', orderDate: today(), dueDate: '',
    partnerId: '', employeeId: '', remark: '',
  })
  const [tab, setTab] = useState<Tab>('전체')
  /** 납품처·담당자. 담당자 이름은 서버가 못 붙여서 여기서 붙인다. */
  const [partners, setPartners] = useState<{ id: number; code: string; name: string }[]>([])
  const [employees, setEmployees] = useState<{ id: number; code: string; name: string }[]>([])

  async function load() {
    setLoading(true)
    try {
      const [o, i, w, pt, emp] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ id: number; code: string; name: string }[]>('/partners'),
        api.get<{ id: number; code: string; name: string }[]>('/employees'),
      ])
      setOrders(o.data)
      setItems(i.data)
      setWarehouses(w.data)
      setPartners(pt.data)
      setEmployees(emp.data)
      setForm((f) => ({ ...f, warehouseId: f.warehouseId || (w.data[0] ? String(w.data[0].id) : '') }))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다 — 지워진 사원이면 빈칸이다. */
  const empName = (id: number | null) =>
    id == null ? '-' : (employees.find((x) => x.id === id)?.name ?? '-')

  const shown = orders.filter((o) => tab === '전체' || o.status === TAB_STATUS[tab])

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.productId) return setError('제품을 선택하세요.')
    try {
      await api.post('/work-orders', {
        productId: Number(form.productId),
        warehouseId: Number(form.warehouseId),
        plannedQty: Number(form.plannedQty),
        orderDate: form.orderDate,
        dueDate: form.dueDate || undefined,
        partnerId: form.partnerId ? Number(form.partnerId) : null,
        employeeId: form.employeeId ? Number(form.employeeId) : null,
        remark: form.remark || undefined,
      })
      setForm((f) => ({ ...f, productId: '', plannedQty: '', dueDate: '', partnerId: '', employeeId: '', remark: '' }))
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <EcListShell
      title="작업지시 리스트"
      onNew={() => setShowForm(true)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="ec-pills" style={{ marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <Modal open={showForm} title="작업지시 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 작업지시</div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">제품 *</label>
              <CodePickerField label="제품" hideLabel fill placeholder="선택하세요" emptyLabel="선택 해제"
                               value={form.productId} onChange={(v) => set('productId', v)}
                               items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">창고 *</label>
              <select className={inputCls} value={form.warehouseId} onChange={(e) => set('warehouseId', e.target.value)}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">지시수량 *</label>
              <input type="number" step="any" className={inputCls} value={form.plannedQty} onChange={(e) => set('plannedQty', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">지시일자</label>
              <input type="date" className={inputCls} value={form.orderDate} onChange={(e) => set('orderDate', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">납기일자</label>
              <input type="date" className={inputCls} value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </div>
            {/* 원본 작업지시서입력 머리: 작업지시No. · 일자 · 납품처 · 담당자 · 납기일자 */}
            <div>
              <label className="mb-1 block text-sm text-slate-600">납품처</label>
              <select className={inputCls} value={form.partnerId} onChange={(e) => set('partnerId', e.target.value)}>
                <option value="">선택 안 함</option>
                {partners.map((x) => <option key={x.id} value={x.id}>[{x.code}] {x.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">담당자</label>
              <select className={inputCls} value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)}>
                <option value="">선택 안 함</option>
                {employees.map((x) => <option key={x.id} value={x.id}>[{x.code}] {x.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">비고</label>
              <input className={inputCls} value={form.remark} onChange={(e) => set('remark', e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
          </div>
        </form>
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>지시번호 ▼</th>
            <th>납품처</th>
            <th style={{ width: 90 }}>담당자</th>
            <th>제품</th>
            <th>창고</th>
            <th style={{ textAlign: 'right' }}>지시수량</th>
            <th style={{ textAlign: 'right' }}>생산완료</th>
            <th style={{ textAlign: 'right' }}>잔여</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>지시일</th>
            <th style={{ width: 100 }}>납기일자</th>
            <th style={{ width: 150, textAlign: 'center' }}>현황</th>
            {/* 원본 작업지시서조회의 마지막 열 [인쇄] — 그 지시 한 건을 작업지시서로 찍는다. */}
            <th style={{ width: 60, textAlign: 'center' }}>인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>작업지시가 없습니다.</td></tr>
          ) : (
            shown.map((o, idx) => (
              <tr key={o.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{o.orderNo}</td>
                <td style={{ color: o.partnerName ? undefined : '#c9ced6' }}>{o.partnerName ?? '-'}</td>
                <td style={{ color: o.employeeId ? undefined : '#c9ced6' }}>{empName(o.employeeId)}</td>
                <td>{o.productName}</td>
                <td>{o.warehouseName}</td>
                <td style={{ textAlign: 'right' }}>{o.plannedQty.toLocaleString()} {o.productUnit}</td>
                <td style={{ textAlign: 'right' }}>{o.producedQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{o.remainingQty.toLocaleString()}</td>
                <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(o.status), fontWeight: 600 }}>{o.statusName}</span></td>
                <td>{o.orderDate}</td>
                <td style={{ color: o.dueDate ? undefined : '#c9ced6' }}>{o.dueDate ?? '-'}</td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {LINKS.map((l, i) => (
                    <span key={l.to}>
                      {i > 0 && <span style={{ color: '#c9ced6', margin: '0 3px' }}>·</span>}
                      <Link to={l.to} title={l.title} style={{ color: 'var(--ec-blue)' }}>{l.label}</Link>
                    </span>
                  ))}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => printOne(o, empName)} style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

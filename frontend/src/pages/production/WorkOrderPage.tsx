import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Warehouse, WorkOrder } from '../../api/types'
import EcListShell from '../../components/EcListShell'

const inputCls = 'ec-input'

const today = () => new Date().toISOString().slice(0, 10)

const statusColor = (s: string) =>
  s === 'COMPLETED' ? '#1c7c3c' : s === 'IN_PROGRESS' ? '#b6791b' : '#7a828c'

export default function WorkOrderPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ productId: '', warehouseId: '', plannedQty: '', orderDate: today(), dueDate: '', remark: '' })

  async function load() {
    setLoading(true)
    try {
      const [o, i, w] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
      ])
      setOrders(o.data)
      setItems(i.data)
      setWarehouses(w.data)
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
        remark: form.remark || undefined,
      })
      setForm((f) => ({ ...f, productId: '', plannedQty: '', dueDate: '', remark: '' }))
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <EcListShell
      title="작업지시 리스트"
      newLabel={showForm ? '입력닫기' : '신규(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 작업지시</div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">제품 *</label>
              <select className={inputCls} value={form.productId} onChange={(e) => set('productId', e.target.value)}>
                <option value="">선택하세요</option>
                {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
              </select>
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
            <div>
              <label className="mb-1 block text-sm text-slate-600">비고</label>
              <input className={inputCls} value={form.remark} onChange={(e) => set('remark', e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
          </div>
        </form>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>지시번호 ▼</th>
            <th>제품</th>
            <th>창고</th>
            <th style={{ textAlign: 'right' }}>지시수량</th>
            <th style={{ textAlign: 'right' }}>생산완료</th>
            <th style={{ textAlign: 'right' }}>잔여</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>지시일</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : orders.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>작업지시가 없습니다.</td></tr>
          ) : (
            orders.map((o, idx) => (
              <tr key={o.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{o.orderNo}</td>
                <td>{o.productName}</td>
                <td>{o.warehouseName}</td>
                <td style={{ textAlign: 'right' }}>{o.plannedQty.toLocaleString()} {o.productUnit}</td>
                <td style={{ textAlign: 'right' }}>{o.producedQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{o.remainingQty.toLocaleString()}</td>
                <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(o.status), fontWeight: 600 }}>{o.statusName}</span></td>
                <td>{o.orderDate}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

/** 생산관리 > 생산불출 — 자재 불출 등록/삭제 (백엔드 /api/material-issues 연동) */
interface MaterialIssue {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number | null
  warehouseName: string | null
  workOrderId: number | null
  workOrderNo: string | null
  qty: number
  issueDate: string
  note: string | null
}
interface Item { id: number; code: string; name: string; unit: string }
interface Warehouse { id: number; name: string }
interface WorkOrder { id: number; orderNo: string; productName: string }

const inputCls = 'ec-input w-full'
const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = { itemId: '', warehouseId: '', workOrderId: '', qty: '', issueDate: today(), note: '' }

export default function IssuePage() {
  const [rows, setRows] = useState<MaterialIssue[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<MaterialIssue[]>('/material-issues')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadRefs() {
    try {
      const [it, wh, wo] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<WorkOrder[]>('/work-orders'),
      ])
      setItems(it.data)
      setWarehouses(wh.data)
      setWorkOrders(wo.data)
    } catch {
      /* 참조 데이터 로딩 실패는 폼 사용에만 영향 */
    }
  }

  useEffect(() => { load(); loadRefs() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/material-issues', {
        itemId: Number(form.itemId),
        warehouseId: form.warehouseId === '' ? null : Number(form.warehouseId),
        workOrderId: form.workOrderId === '' ? null : Number(form.workOrderId),
        qty: form.qty === '' ? 0 : Number(form.qty),
        issueDate: form.issueDate || null,
        note: form.note,
      })
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(r: MaterialIssue) {
    if (!confirm(`'${r.itemName}' 불출내역을 삭제할까요?`)) return
    try {
      await api.delete(`/material-issues/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.itemName.includes(keyword) || (r.workOrderNo ?? '').includes(keyword))

  return (
    <EcListShell
      title="생산불출"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <Modal open={showForm} title="생산불출 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 불출 등록</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">자재 *</label>
              <select className={inputCls} value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })}>
                <option value="">선택</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.code} {i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">창고</label>
              <select className={inputCls} value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                <option value="">선택</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업지시</label>
              <select className={inputCls} value={form.workOrderId} onChange={(e) => setForm({ ...form, workOrderId: e.target.value })}>
                <option value="">선택</option>
                {workOrders.map((w) => <option key={w.id} value={w.id}>{w.orderNo} ({w.productName})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">불출수량 *</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">불출일자</label>
              <input type="date" className={inputCls} value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">비고</label>
              <input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
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
            <th>일자</th>
            <th>작업지시번호</th>
            <th>자재명</th>
            <th style={{ textAlign: 'right' }}>불출수량</th>
            <th>단위</th>
            <th>창고</th>
            <th>비고</th>
            <th style={{ width: 60, textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 불출내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.issueDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo ?? '-'}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td>{r.unit}</td>
              <td>{r.warehouseName ?? '-'}</td>
              <td>{r.note ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

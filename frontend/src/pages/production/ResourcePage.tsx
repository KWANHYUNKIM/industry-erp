import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

/**
 * 생산관리 > 자원등록.
 *
 * <p>원본 열 실측(사본 열 id CHK_H·MT0·MT0_WH·MT0_JOB):
 *   자원코드 · 자원명 · <b>위치</b> · <b>대상작업</b>.
 *
 * <p>우리에게는 구분·가용능력·단위·시간당비용만 있어서, 설비를 등록해도 <b>어디 있는지</b>도
 * <b>무슨 작업에 쓰는지</b>도 알 수 없었다. 공정(BOR 의 작업)과 이어 두면
 * "이 작업은 어느 설비로 하나" 가 답이 된다.
 *
 * <p>가용능력·단위·시간당비용은 원본에 없지만 지우지 않았다 — 우리 쪽에서 이미 쓰는 값이다.
 */
interface ProductionResource {
  id: number
  code: string
  name: string
  type: string
  capacity: number
  unit: string | null
  costPerHr: number
  warehouseId: number | null
  warehouseName: string | null
  processId: number | null
  processName: string | null
  active: boolean
}

interface WarehouseRow { id: number; code: string; name: string }
interface ProcessRow { id: number; code: string; name: string; workcenter: string | null }

const TYPES = ['설비', '인력', '외주']
const inputCls = 'ec-input w-full'
const emptyForm = { code: '', name: '', type: '설비', capacity: '', unit: '시간/일', costPerHr: '', warehouseId: '', processId: '' }

export default function ResourcePage() {
  const [rows, setRows] = useState<ProductionResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([])
  const [processes, setProcesses] = useState<ProcessRow[]>([])

  async function load() {
    setLoading(true)
    try {
      const [res, w, pr] = await Promise.all([
        api.get<ProductionResource[]>('/resources'),
        api.get<WarehouseRow[]>('/warehouses'),
        api.get<ProcessRow[]>('/processes'),
      ])
      setRows(res.data)
      setWarehouses(w.data)
      setProcesses(pr.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/resources', {
        code: form.code,
        name: form.name,
        type: form.type,
        capacity: form.capacity === '' ? 0 : Number(form.capacity),
        unit: form.unit,
        costPerHr: form.costPerHr === '' ? 0 : Number(form.costPerHr),
        warehouseId: form.warehouseId ? Number(form.warehouseId) : null,
        processId: form.processId ? Number(form.processId) : null,
      })
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(r: ProductionResource) {
    if (!confirm(`자원 '${r.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/resources/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.includes(keyword))

  return (
    <EcListShell
      title="자원등록"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <Modal open={showForm} title="자원등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 자원 등록</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div>
              <label className="mb-1 block text-sm text-slate-600">자원코드 *</label>
              <input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="RES-003" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">자원명 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">구분</label>
              <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">가용능력</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">단위</label>
              <input className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">시간당비용</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.costPerHr} onChange={(e) => setForm({ ...form, costPerHr: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">위치</label>
              <select className={inputCls} value={form.warehouseId}
                      onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                <option value="">(안 정함)</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">대상작업</label>
              <select className={inputCls} value={form.processId}
                      onChange={(e) => setForm({ ...form, processId: e.target.value })}>
                <option value="">(안 정함)</option>
                {processes.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
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
            <th>자원코드</th>
            <th>자원명</th>
            <th>위치</th>
            <th>대상작업</th>
            <th style={{ textAlign: 'center' }}>구분</th>
            <th style={{ textAlign: 'right' }}>가용능력</th>
            <th>단위</th>
            <th style={{ textAlign: 'right' }}>시간당비용</th>
            <th style={{ width: 60, textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 자원이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td>{r.name}</td>
              <td style={{ color: r.warehouseName ? undefined : '#c9ced6' }}>{r.warehouseName ?? '안 정함'}</td>
              <td style={{ color: r.processName ? undefined : '#c9ced6' }}>{r.processName ?? '안 정함'}</td>
              <td style={{ textAlign: 'center' }}>{r.type}</td>
              <td style={{ textAlign: 'right' }}>{r.capacity.toLocaleString()}</td>
              <td>{r.unit ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.costPerHr.toLocaleString()}</td>
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

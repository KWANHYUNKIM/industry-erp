import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

/** 생산관리 > 자원등록 — 설비·인력·외주 자원 마스터 (백엔드 /api/resources 연동) */
interface ProductionResource {
  id: number
  code: string
  name: string
  type: string
  capacity: number
  unit: string | null
  costPerHr: number
  active: boolean
}

const TYPES = ['설비', '인력', '외주']
const inputCls = 'ec-input w-full'
const emptyForm = { code: '', name: '', type: '설비', capacity: '', unit: '시간/일', costPerHr: '' }

export default function ResourcePage() {
  const [rows, setRows] = useState<ProductionResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<ProductionResource[]>('/resources')
      setRows(res.data)
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
            <th style={{ textAlign: 'center' }}>구분</th>
            <th style={{ textAlign: 'right' }}>가용능력</th>
            <th>단위</th>
            <th style={{ textAlign: 'right' }}>시간당비용</th>
            <th style={{ width: 60, textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 자원이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td>{r.name}</td>
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

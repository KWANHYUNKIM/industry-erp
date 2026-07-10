import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 영업 > 오더관리진행단계 — 수주 오더 진행 단계 정의 (/api/order-stages 연동) */
interface OrderStage {
  id: number
  code: string
  name: string
  sortOrder: number
  active: boolean
}

const inputCls = 'ec-input w-full'
const emptyForm = { code: '', name: '', sortOrder: '1', active: true }

export default function OrderStagePage() {
  const [rows, setRows] = useState<OrderStage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<OrderStage[]>('/order-stages')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm, sortOrder: String(rows.length + 1) })
    setShowForm(true)
  }

  function openEdit(s: OrderStage) {
    setEditId(s.id)
    setForm({ code: s.code, name: s.name, sortOrder: String(s.sortOrder), active: s.active })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (editId) {
        await api.put(`/order-stages/${editId}`, { name: form.name, sortOrder: Number(form.sortOrder), active: form.active })
      } else {
        await api.post('/order-stages', { code: form.code, name: form.name, sortOrder: Number(form.sortOrder) })
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(s: OrderStage) {
    if (!confirm(`진행단계 '${s.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/order-stages/${s.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.toLowerCase().includes(keyword.toLowerCase()))
  const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0)

  return (
    <EcListShell
      title="오더관리진행단계"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '신규(F2)'}
      onNew={showForm ? () => setShowForm(false) : openCreate}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {showForm && (
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>{editId ? '진행단계 수정' : '새 진행단계 등록'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 200px 110px 110px', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>단계코드 *</label>
              <input className={inputCls} value={form.code} disabled={!!editId} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>단계명 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>순서 *</label>
              <input type="number" className={inputCls} value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>사용여부</label>
              <select className={inputCls} value={form.active ? 'Y' : 'N'} disabled={!editId} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'Y' }))}>
                <option value="Y">사용</option>
                <option value="N">미사용</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '등록'}</button>
          </div>
        </form>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 70, textAlign: 'right' }}>순서</th>
            <th style={{ width: 110 }}>단계코드</th>
            <th>단계명</th>
            <th style={{ width: 110, textAlign: 'right' }}>진행률기준</th>
            <th style={{ width: 90, textAlign: 'center' }}>사용여부</th>
            <th style={{ width: 90 }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'right' }}>{r.sortOrder.toLocaleString()}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td>{r.name}</td>
              <td style={{ textAlign: 'right' }}>{maxOrder > 0 ? `${Math.round((r.sortOrder / maxOrder) * 100)}%` : '-'}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: r.active ? '#1c7c3c' : '#9aa1ab' }}>{r.active ? '사용' : '미사용'}</td>
              <td>
                <button onClick={() => openEdit(r)} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

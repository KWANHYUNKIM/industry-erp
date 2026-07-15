import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'

/** 영업 > 오더관리유형리스트 — 수주 오더 유형 코드 관리 (/api/order-types 연동) */
interface OrderType {
  id: number
  code: string
  name: string
  description: string | null
  active: boolean
}

const inputCls = 'ec-input w-full'
const emptyForm = { code: '', name: '', description: '', active: true }

export default function OrderTypePage() {
  const [rows, setRows] = useState<OrderType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<OrderType[]>('/order-types')
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
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  function openEdit(t: OrderType) {
    setEditId(t.id)
    setForm({ code: t.code, name: t.name, description: t.description ?? '', active: t.active })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (editId) {
        await api.put(`/order-types/${editId}`, { name: form.name, description: form.description, active: form.active })
      } else {
        await api.post('/order-types', { code: form.code, name: form.name, description: form.description })
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(t: OrderType) {
    if (!confirm(`오더유형 '${t.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/order-types/${t.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.toLowerCase().includes(keyword.toLowerCase()))

  return (
    <EcListShell
      title="오더관리유형리스트"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={showForm ? () => setShowForm(false) : openCreate}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <Modal open={showForm} title="오더관리유형 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>{editId ? '오더유형 수정' : '새 오더유형 등록'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 200px 1fr 110px', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>유형코드 *</label>
              <input className={inputCls} value={form.code} disabled={!!editId} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="OT-06" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>유형명 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="일반수주" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>설명</label>
              <input className={inputCls} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
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
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>유형코드</th><th>유형명</th><th>설명</th>
            <th style={{ textAlign: 'center' }}>사용여부</th>
            <th style={{ width: 90 }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td>{r.name}</td>
              <td>{r.description ?? ''}</td>
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

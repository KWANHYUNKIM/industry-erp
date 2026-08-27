import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { ManagementItem } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

/** 재고 기초등록 > 관리항목등록 — 실제 CRUD 연동 */
export default function ManageItemsPage() {
  const [rows, setRows] = useState<ManagementItem[]>([])
  /** 원본 관리항목리스트의 [사용중단/재사용]에 쓸 줄 고르기. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', description: '' })

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<ManagementItem[]>('/management-items')
      setRows(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function submit() {
    setError('')
    if (!form.name.trim()) return setError('관리항목명을 입력하세요.')
    try {
      await api.post('/management-items', {
        code: form.code || undefined,
        name: form.name,
        description: form.description || undefined,
      })
      setForm({ code: '', name: '', description: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function toggleActive(m: ManagementItem) {
    try {
      await api.put(`/management-items/${m.id}`, { name: m.name, description: m.description ?? undefined, active: !m.active })
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /**
   * 원본 관리항목리스트의 [사용중단/재사용]. 고른 것을 한 번에 세운다.
   * 모두 중단이면 되살리고, 하나라도 살아 있으면 중단한다(거래처·창고·품목과 같은 규칙).
   */
  async function toggleCheckedActive() {
    const targets = shown.filter((r) => checked.has(r.id))
    if (targets.length === 0) { setError('사용중단하거나 되살릴 관리항목을 고르세요.'); return }
    const reviving = targets.every((r) => !r.active)
    setError('')
    const results = await Promise.allSettled(targets.map((r) => api.put(`/management-items/${r.id}`,
      { name: r.name, description: r.description ?? undefined, active: reviving })))
    const failed = results.filter((r) => r.status === 'rejected').length
    setChecked(new Set())
    await load()
    if (failed > 0) setError(`${targets.length - failed}건 ${reviving ? '재사용' : '사용중단'}, ${failed}건 실패.`)
  }

  const shown = rows.filter((r) => !keyword || r.code.includes(keyword) || r.name.includes(keyword))

  return (
    <EcListShell
      title="관리항목리스트"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load },
                { label: `사용중단/재사용${checked.size ? ` (${checked.size})` : ''}`, onClick: toggleCheckedActive },
                { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title="관리항목 등록" onClose={() => setShowForm(false)}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>관리항목 등록</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}>
              <div style={{ color: '#5a626e', marginBottom: 3 }}>코드(미입력시 자동)</div>
              <input className="ec-input" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="MG001" style={{ width: 130 }} />
            </label>
            <label style={{ fontSize: 12.5 }}>
              <div style={{ color: '#5a626e', marginBottom: 3 }}>관리항목명 *</div>
              <input className="ec-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ width: 200 }} />
            </label>
            <label style={{ fontSize: 12.5 }}>
              <div style={{ color: '#5a626e', marginBottom: 3 }}>설명</div>
              <input className="ec-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ width: 280 }} />
            </label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
          </div>
        </div>
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34, textAlign: 'center' }}>
              <input type="checkbox"
                     checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={() => setChecked(
                       shown.every((r) => checked.has(r.id)) ? new Set() : new Set(shown.map((r) => r.id)),
                     )} />
            </th>
            <th>관리항목코드 ▼</th>
            <th>관리항목명 ▼</th>
            <th>설명</th>
            <th style={{ width: 90, textAlign: 'center' }}>사용 ▼</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id} style={{ color: r.active ? undefined : '#9aa1ab' }}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                  return next
                })} />
              </td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td>{r.name}</td>
              <td style={{ color: '#5a626e' }}>{r.description ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: r.active ? '#1c7c3c' : '#9aa1ab' }} onClick={() => toggleActive(r)}>
                  {r.active ? '사용' : '중단'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

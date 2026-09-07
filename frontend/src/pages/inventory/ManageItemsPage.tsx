import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { ManagementItem } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableSort } from '../../utils/useTableSort'

/** 재고 기초등록 > 관리항목등록 — 실제 CRUD 연동 */
export default function ManageItemsPage() {
  const [rows, setRows] = useState<ManagementItem[]>([])
  /** 고치는 중인 관리항목. */
  const [editId, setEditId] = useState<number | null>(null)
  /** 원본 관리항목리스트의 [사용중단/재사용]에 쓸 줄 고르기. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 관리항목등록 조건 차례: <b>관리항목코드</b> · 관리항목명 · 사용구분.
   * 검색상자는 코드와 이름을 <b>한꺼번에</b> 훑어서, 코드로만 좁힐 수가 없었다.
   */
  const [codeCond, setCodeCond] = useState('')
  const [useCond, setUseCond] = useState<'전체' | '사용' | '중단'>('전체')
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

  /**
   * 원본처럼 목록에서 눌러 연다. <b>수정이 아예 없었다</b> — 이름을 잘못 넣으면
   * 지우고 다시 만들어야 했고, 품목이 그 관리항목을 물고 있으면 지울 수도 없었다.
   */
  function openEdit(m: ManagementItem) {
    setEditId(m.id)
    setForm({ code: m.code, name: m.name, description: m.description ?? '' })
    setShowForm(true)
  }

  async function submit() {
    setError('')
    if (!form.name.trim()) return setError('관리항목명을 입력하세요.')
    try {
      if (editId) {
        /* 코드는 품목이 그 값으로 묶여 있어 만들 때만 정한다. */
        await api.put(`/management-items/${editId}`, {
          name: form.name,
          description: form.description || undefined,
          active: rows.find((r) => r.id === editId)?.active,
        })
      } else {
        await api.post('/management-items', {
          code: form.code || undefined,
          name: form.name,
          description: form.description || undefined,
        })
      }
      setEditId(null)
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

  const shownRows = rows
    .filter((r) => !codeCond || r.code.includes(codeCond))
    .filter((r) => !keyword || r.code.includes(keyword) || r.name.includes(keyword))
    .filter((r) => useCond === '전체' || (r.active ? '사용' : '중단') === useCond)

  /*
   * 원본 관리항목등록도 머리를 눌러 정렬한다(사본이 코드·이름에 정렬 표시를 달았다).
   * [설명]에는 원본도 표시가 없어 우리도 안 건다 — 표시를 안 단 칸까지 눌리게 하면
   * 이번에는 <b>표시가 없는데 정렬되는</b> 반대쪽 거짓말이 된다.
   */
  const sort = useTableSort(shownRows, {
    관리항목코드: (r) => r.code,
    관리항목명: (r) => r.name,
    사용: (r) => (r.active ? '사용' : '중지'),
  })
  const shown = sort.sorted

  return (
    <EcListShell
      title="관리항목리스트"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => { setEditId(null); setForm({ code: '', name: '', description: '' }); setShowForm(true) }}
      actions={[{ label: '새로고침', onClick: load },
                { label: `사용중단/재사용${checked.size ? ` (${checked.size})` : ''}`, onClick: toggleCheckedActive },
                { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title={editId ? '관리항목 수정' : '관리항목 등록'} onClose={() => { setShowForm(false); setEditId(null) }}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>{editId ? '관리항목 수정' : '관리항목 등록'}</div>
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

      {/* 원본 조건 차례: <b>관리항목코드</b> · 관리항목명 · 사용구분 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>관리항목코드</span>
        <input className="ec-input" value={codeCond} placeholder="관리항목코드"
               onChange={(e) => setCodeCond(e.target.value)} style={{ width: 150 }} />
        <span>사용구분</span>
        <select className="ec-input" value={useCond} onChange={(e) => setUseCond(e.target.value as '전체' | '사용' | '중단')} style={{ width: 100 }}>
          <option>전체</option><option>사용</option><option>중단</option>
        </select>
      </div>

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
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('관리항목코드')}>관리항목코드 {sort.mark('관리항목코드')}</th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('관리항목명')}>관리항목명 {sort.mark('관리항목명')}</th>
            <th>설명</th>
            <th style={{ width: 90, textAlign: 'center', cursor: 'pointer' }} onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
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
              {/* 원본은 코드·이름을 눌러 그 관리항목을 연다. */}
              <td style={{ fontFamily: 'monospace' }}>
                <button type="button" onClick={() => openEdit(r)}
                        style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12.5 }}>
                  {r.code}
                </button>
              </td>
              <td>
                <button type="button" onClick={() => openEdit(r)}
                        style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5 }}>
                  {r.name}
                </button>
              </td>
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

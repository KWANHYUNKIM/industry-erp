import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { CollectSource } from '../../api/types'

/**
 * 데이터센터 > 수집데이터등록 (이카운트 E100000)
 * 데이터수집(DataCollectPage)이 실행하는 수집 소스를 등록·관리한다. 소스 = 우리 API 목록 GET 엔드포인트.
 * 코드 배포 없이 소스를 추가/비활성할 수 있다. 백엔드 신규: collect_sources + /api/collect-sources.
 */
const empty = { name: '', category: '', endpoint: '', paged: false, sortOrder: '0' }

export default function CollectSourcePage() {
  const [rows, setRows] = useState<CollectSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  /* 원본 수집데이터등록의 조건에 <b>[데이터명]</b> 이 있다 — 표에 찍히는데 거를 수가 없었다. */
  const [nameCond, setNameCond] = useState('')
  /*
   * 원본 조건의 <b>[수집대상]</b>. 우리 표는 그것을 [구분] 열로 찍는데
   * 그 값으로 거를 수가 없었다. 데이터원이 늘수록 목록에서 찾기 어려워진다.
   */
  const [targetCond, setTargetCond] = useState('')
  const shown = rows
    .filter((r) => !nameCond || r.name.includes(nameCond))
    .filter((r) => !targetCond || r.category === targetCond)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(empty)

  async function load() {
    setLoading(true); setError('')
    try { setRows((await api.get<CollectSource[]>('/collect-sources')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  function openNew() { setEditId(null); setForm({ ...empty, sortOrder: String(rows.length + 1) }); setShowForm(true) }
  function openEdit(s: CollectSource) {
    setEditId(s.id); setForm({ name: s.name, category: s.category, endpoint: s.endpoint, paged: s.paged, sortOrder: String(s.sortOrder) }); setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    if (!form.name.trim() || !form.category.trim() || !form.endpoint.trim()) return setError('소스명·구분·엔드포인트를 입력하세요.')
    const body = { name: form.name, category: form.category, endpoint: form.endpoint, paged: form.paged, sortOrder: Number(form.sortOrder) || 0 }
    try {
      if (editId) { await api.put(`/collect-sources/${editId}`, body); setOk('소스를 수정했습니다.') }
      else { await api.post('/collect-sources', body); setOk('소스를 등록했습니다.') }
      setShowForm(false); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function toggleActive(s: CollectSource) {
    setError('')
    try { await api.put(`/collect-sources/${s.id}`, { name: s.name, category: s.category, endpoint: s.endpoint, paged: s.paged, sortOrder: s.sortOrder, active: !s.active }); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(id: number) {
    if (!confirm('이 수집 소스를 삭제할까요?')) return
    setError('')
    try { await api.delete(`/collect-sources/${id}`); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const inputCls = 'ec-input'

  return (
    <EcListShell title="수집데이터등록" onNew={openNew} actions={[{ label: '새로고침', onClick: load }]}>
      <p className="mb-2 text-xs text-slate-500">데이터수집 화면이 실행하는 소스 목록입니다. 소스 = 우리 API 목록 GET 엔드포인트(예: /sales, /shipments). 여기서 추가하면 코드 배포 없이 수집 대상이 늘어납니다.</p>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <Modal open={showForm} title={editId ? '수집 소스 수정' : '수집 소스 등록'} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>소스명 *</div>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: 180 }} placeholder="예: 견적 전표" /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>구분 *</div>
              <input className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value)} style={{ width: 110 }} placeholder="예: 영업" /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>엔드포인트 *</div>
              <input className={inputCls} value={form.endpoint} onChange={(e) => set('endpoint', e.target.value)} style={{ width: 240 }} placeholder="예: /quotations" /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>정렬</div>
              <input className={`${inputCls} text-right`} type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} style={{ width: 70 }} /></label>
            <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={form.paged} onChange={(e) => set('paged', e.target.checked)} /> 페이지응답(totalElements)
            </label>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '저장'}</button>
          </div>
          <p style={{ fontSize: 11.5, color: '#8a929c', marginTop: 8 }}>엔드포인트는 배열을 반환하는 목록 GET 이어야 하며, 페이지 응답이면 '페이지응답'을 체크하세요(건수=totalElements).</p>
        </form>
      )}</Modal>

      {/* 원본 조건 [데이터명] */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>데이터명</span>
        <input className="ec-input" value={nameCond} onChange={(e) => setNameCond(e.target.value)} style={{ width: 170 }} />
        <span>수집대상</span>
        <select className="ec-input" value={targetCond} onChange={(e) => setTargetCond(e.target.value)} style={{ width: 140 }}>
          <option value="">전체</option>
          {[...new Set(rows.map((r) => r.category))].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 60 }}>정렬</th>
          {/* 원본 수집데이터등록의 이름은 [소스명]이 아니라 <b>[데이터명]</b> 이다(사본 실측). */}
            <th>데이터명</th>
          <th style={{ width: 100 }}>구분</th>
          <th style={{ width: 260 }}>엔드포인트</th>
          <th style={{ textAlign: 'center', width: 70 }}>페이지</th>
          <th style={{ textAlign: 'center', width: 80 }}>사용</th>
          <th style={{ textAlign: 'center', width: 90 }}>관리</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((s) => (
            <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
              <td></td>
              <td style={{ textAlign: 'right', color: '#9aa1ab' }}>{s.sortOrder}</td>
              <td style={{ fontWeight: 600 }}>{s.name}</td>
              <td>{s.category}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#5a626e' }}>GET /api{s.endpoint}</td>
              <td style={{ textAlign: 'center' }}>{s.paged ? '●' : ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => toggleActive(s)} style={{ border: '1px solid var(--ec-border)', background: s.active ? '#eaf6ec' : '#f2f3f5', color: s.active ? '#1c7c3c' : '#8a929c', cursor: 'pointer', fontSize: 11.5, padding: '2px 8px', borderRadius: 3 }}>{s.active ? '사용' : '중단'}</button>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => openEdit(s)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>수정</button>
                <button className="no-ec" onClick={() => remove(s.id)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

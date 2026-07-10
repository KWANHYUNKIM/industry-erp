import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

interface ScheduleEvent {
  id: number
  eventDate: string
  startTime: string | null
  title: string
  category: string | null
  owner: string | null
  remark: string | null
  createdBy: string | null
}

const CATEGORIES = ['회의', '출장', '교육', '기타']
const CAT_COLOR: Record<string, string> = { 회의: 'var(--ec-blue)', 출장: '#c07a00', 교육: '#1c7c3c', 기타: '#5a626e' }
const today = () => new Date().toISOString().slice(0, 10)

/** 그룹웨어 > 일정관리 — 부서/개인 일정 등록·조회 (실제 연동) */
export default function SchedulePage() {
  const [rows, setRows] = useState<ScheduleEvent[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')

  const [eventDate, setEventDate] = useState(today())
  const [startTime, setStartTime] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('회의')
  const [owner, setOwner] = useState('')

  async function load() {
    try { setRows((await api.get<ScheduleEvent[]>('/schedule-events')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!title.trim()) return setError('일정 제목을 입력하세요.')
    try {
      await api.post<ScheduleEvent>('/schedule-events', {
        eventDate, startTime: startTime || undefined, title, category, owner: owner || undefined,
      })
      setOk('일정 등록 완료')
      setTitle(''); setStartTime(''); setOwner('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(r: ScheduleEvent) {
    if (!confirm(`[${r.title}] 일정을 삭제하시겠습니까?`)) return
    try { await api.delete(`/schedule-events/${r.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = rows.filter((r) => !keyword || r.title.includes(keyword) || (r.owner ?? '').includes(keyword))
  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }

  return (
    <EcListShell
      title="일정관리"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '일정등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">부서·개인 일정 등록/조회 · 일자 오름차순 정렬</p>

      {showForm && (
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>일자 *</th>
                <td><input type="date" className={inputCls} value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>시간</th>
                <td><input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: 120 }} /></td>
              </tr>
              <tr>
                <th style={th}>제목 *</th>
                <td colSpan={3}><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} placeholder="일정 제목을 입력하세요" /></td>
              </tr>
              <tr>
                <th style={th}>분류</th>
                <td>
                  <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 150 }}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <th style={th}>담당</th>
                <td><input className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">등록(F8)</button></div>
        </form>
      )}

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 110 }}>일자 ▼</th>
            <th style={{ width: 70 }}>시간</th>
            <th>제목 ▼</th>
            <th style={{ width: 80, textAlign: 'center' }}>분류</th>
            <th style={{ width: 90 }}>담당</th>
            <th style={{ width: 70, textAlign: 'center' }}>삭제</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>일정이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.eventDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.startTime ?? '-'}</td>
              <td style={{ fontWeight: 600 }}>{r.title}</td>
              <td style={{ textAlign: 'center', color: CAT_COLOR[r.category ?? '기타'] ?? '#5a626e', fontWeight: 700 }}>{r.category ?? '기타'}</td>
              <td>{r.owner ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(r)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

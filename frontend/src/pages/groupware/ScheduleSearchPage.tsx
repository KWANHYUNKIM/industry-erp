import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 그룹웨어 > 공유정보 > 사내관리 (이카운트 C000698)
 * 원본 DOM 은 참석자·장소·일정구분·기간으로 일정을 검색하는 '일정 검색/관리' 화면이다.
 * 일정관리(SchedulePage)가 등록·목록이라면, 여기는 조건 검색 뷰(기간·구분·참석자/장소/제목 키워드).
 * 프론트 전용(/schedule-events 집계·필터).
 */
interface ScheduleEvent {
  id: number
  eventDate: string
  startTime: string | null
  title: string
  category: string | null
  owner: string | null
  location: string | null
  attendees: string | null
}
const CATEGORIES = ['회의', '출장', '교육', '기타']
const CAT_COLOR: Record<string, string> = { 회의: 'var(--ec-blue)', 출장: '#c07a00', 교육: '#1c7c3c', 기타: '#5a626e' }
const iso = (d: Date) => d.toISOString().slice(0, 10)

export default function ScheduleSearchPage() {
  const [rows, setRows] = useState<ScheduleEvent[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const today = iso(new Date())
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const [category, setCategory] = useState('전체')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true); setError('')
    try { setRows((await api.get<ScheduleEvent[]>('/schedule-events')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => rows.filter((r) => {
    if (r.eventDate < from || r.eventDate > to) return false
    if (category !== '전체' && (r.category ?? '기타') !== category) return false
    if (keyword) {
      const k = keyword.trim()
      const hay = `${r.title} ${r.owner ?? ''} ${r.location ?? ''} ${r.attendees ?? ''}`
      if (!hay.includes(k)) return false
    }
    return true
  }), [rows, from, to, category, keyword])

  const preset = (mode: 'today' | 'week' | 'month' | 'year') => {
    const t = new Date()
    if (mode === 'today') { setFrom(iso(t)); setTo(iso(t)) }
    else if (mode === 'week') { const f = new Date(); f.setDate(f.getDate() - 6); setFrom(iso(f)); setTo(iso(t)) }
    else if (mode === 'month') { setFrom(iso(t).slice(0, 8) + '01'); setTo(iso(t)) }
    else { setFrom(iso(t).slice(0, 4) + '-01-01'); setTo(iso(t)) }
  }

  const inputCls = 'ec-input'

  return (
    <EcListShell title="사내관리(일정 검색)" actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <p className="mb-2 text-xs text-slate-500">기간·일정구분·키워드(제목/담당/장소/참석자)로 일정을 검색합니다. 일정 등록은 일정관리 화면에서.</p>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', border: '1px solid var(--ec-border)', background: '#f7f9fb', padding: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>기준일자</div>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        </label>
        <div style={{ display: 'flex', gap: 3 }}>
          <button className="ec-btn" onClick={() => preset('today')}>금일</button>
          <button className="ec-btn" onClick={() => preset('week')}>금주</button>
          <button className="ec-btn" onClick={() => preset('month')}>금월</button>
          <button className="ec-btn" onClick={() => preset('year')}>금년</button>
        </div>
        <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>일정구분</div>
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 110 }}>
            <option value="전체">전체</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
        <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검색어(제목/담당/장소/참석자)</div>
          <input className={inputCls} value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 240 }} placeholder="키워드" /></label>
      </div>

      <div style={{ marginBottom: 6, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>검색결과 <b style={{ color: 'var(--ec-blue-dark)' }}>{shown.length}</b>건</div>

      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 110 }}>일자</th>
          <th style={{ width: 60 }}>시간</th>
          <th>제목</th>
          <th style={{ width: 70, textAlign: 'center' }}>구분</th>
          <th style={{ width: 90 }}>담당</th>
          <th style={{ width: 130 }}>장소</th>
          <th style={{ width: 180 }}>참석자</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>조건에 맞는 일정이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.eventDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.startTime ?? '-'}</td>
              <td style={{ fontWeight: 600 }}>{r.title}</td>
              <td style={{ textAlign: 'center', color: CAT_COLOR[r.category ?? '기타'] ?? '#5a626e', fontWeight: 700 }}>{r.category ?? '기타'}</td>
              <td>{r.owner ?? ''}</td>
              <td style={{ color: '#5a626e' }}>{r.location ?? ''}</td>
              <td style={{ color: '#5a626e' }}>{r.attendees ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

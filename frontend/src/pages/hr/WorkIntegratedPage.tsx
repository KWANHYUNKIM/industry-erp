import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/**
 * 관리 > 출퇴근/근태/일정 통합현황 (이카운트 E070315)
 * 기간 동안 사원별·일자별로 근태(출근/퇴근/상태)와 그날 일정을 한 줄에 합쳐 보는 통합 뷰.
 * 근태(사원명)와 일정(담당명)을 이름+일자로 매칭한다. 근태만/일정만 있는 날도 각각 한 줄로 나온다.
 * 백엔드 무변경 — `/api/hr/attendance?from&to` + `/api/schedule-events` 조합(프론트 병합).
 */
interface AttendanceRow {
  id: number; date: string; empName: string; department: string | null
  clockIn: string | null; clockOut: string | null; workHours: number; status: string; note: string | null
}
interface ScheduleEvent {
  id: number; eventDate: string; startTime: string | null; title: string; category: string | null; owner: string | null
}
interface MergedRow {
  key: string; date: string; name: string; department: string | null
  clockIn: string | null; clockOut: string | null; status: string | null
  events: { title: string; category: string | null; startTime: string | null }[]
}

const mono = { fontFamily: 'monospace' as const }
function statusColor(s: string | null) {
  if (!s) return '#c5cbd3'
  if (s === '정상') return '#1c7c3c'
  if (s === '결근') return '#c60a2e'
  return '#c07a00'
}
const catColor: Record<string, string> = { 회의: '#2b6cb0', 출장: '#a5561b', 교육: '#1c7c3c', 기타: '#8a929c' }

export default function WorkIntegratedPage() {
  const [att, setAtt] = useState<AttendanceRow[]>([])
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const params: Record<string, string> = {}
      if (from) params.from = from
      if (to) params.to = to
      const [a, e] = await Promise.all([
        api.get<AttendanceRow[]>('/hr/attendance', { params }),
        api.get<ScheduleEvent[]>('/schedule-events'),
      ])
      setAtt(a.data); setEvents(e.data)
    } catch (err) { setError(extractErrorMessage(err)); setAtt([]); setEvents([]) }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const rows = useMemo(() => {
    const map = new Map<string, MergedRow>()
    for (const a of att) {
      map.set(`${a.empName}|${a.date}`, {
        key: `${a.empName}|${a.date}`, date: a.date, name: a.empName, department: a.department,
        clockIn: a.clockIn, clockOut: a.clockOut, status: a.status, events: [],
      })
    }
    // 일정을 이름+일자로 붙인다. 기간 필터는 근태와 동일하게 적용.
    for (const ev of events) {
      if (from && ev.eventDate < from) continue
      if (to && ev.eventDate > to) continue
      const name = ev.owner ?? '(미지정)'
      const key = `${name}|${ev.eventDate}`
      let row = map.get(key)
      if (!row) {
        row = { key, date: ev.eventDate, name, department: null, clockIn: null, clockOut: null, status: null, events: [] }
        map.set(key, row)
      }
      row.events.push({ title: ev.title, category: ev.category, startTime: ev.startTime })
    }
    return [...map.values()]
      .filter((r) => !keyword || r.name.includes(keyword) || (r.department ?? '').includes(keyword))
      .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'ko'))
  }, [att, events, from, to, keyword])

  const eventTotal = useMemo(() => rows.reduce((s, r) => s + r.events.length, 0), [rows])

  return (
    <EcListShell title="출퇴근/근태/일정 통합현황" search={keyword} onSearchChange={setKeyword} onSearch={load}
      onNew={undefined} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>기간</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <button className="ec-btn" onClick={load}>조회</button>
        <span style={{ marginLeft: 8, color: '#9aa1ab' }}>근태·일정을 사원명+일자로 통합</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5 }}>
          행 <b style={{ color: '#3c4553' }}>{rows.length}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          일정 <b style={{ color: '#2b6cb0', fontSize: 14 }}>{eventTotal}</b>건
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자 ▼</th><th>사원/담당</th><th>부서</th>
            <th style={{ textAlign: 'center' }}>출근</th><th style={{ textAlign: 'center' }}>퇴근</th>
            <th style={{ textAlign: 'center' }}>근태</th><th>일정</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>해당 기간 근태·일정이 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={mono}>{r.date}</td>
              <td>{r.name}</td>
              <td style={{ color: '#5a626e' }}>{r.department ?? ''}</td>
              <td style={{ ...mono, textAlign: 'center' }}>{r.clockIn ?? '-'}</td>
              <td style={{ ...mono, textAlign: 'center' }}>{r.clockOut ?? '-'}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: statusColor(r.status) }}>{r.status ?? '-'}</td>
              <td>
                {r.events.length === 0 ? <span style={{ color: '#c5cbd3' }}>-</span> : (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {r.events.map((ev, ei) => (
                      <span key={ei} style={{ fontSize: 11.5, padding: '1px 7px', borderRadius: 10, background: '#f1f4f8', color: catColor[ev.category ?? '기타'] ?? '#5a626e' }}>
                        {ev.category ? `[${ev.category}] ` : ''}{ev.startTime ? `${ev.startTime} ` : ''}{ev.title}
                      </span>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

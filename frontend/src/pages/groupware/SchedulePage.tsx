import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcMonthCalendar from '../../components/EcMonthCalendar'
import { ymd } from '../../components/EcPeriodPicks'

interface ScheduleEvent {
  id: number
  eventDate: string
  startTime: string | null
  endTime: string | null
  title: string
  category: string | null
  owner: string | null
  location: string | null
  attendees: string | null
  remark: string | null
  createdBy: string | null
}

const CATEGORIES = ['회의', '출장', '교육', '기타']
const DOW = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 그룹웨어 > 사내관리 > 일정관리 (이카운트 E070201)
 *
 * 원본은 [월 캘린더 | 일정 목록] 2분할이고, 목록 컬럼은 실측 기준으로
 * (선택칸 25) 일자(요일) 100 · 시작시간 55 · 종료시간 55 · 참석자성명 160 · 제목 300 · 장소 170 이다.
 * 분류·담당은 원본 목록에 없지만 우리 데이터에 있으므로 등록 폼에만 남긴다 — 목록은 원본을 따른다.
 *
 * 원본 하단 버튼줄은 [신규(F2)][미리보기][라벨변경][인쇄][선택삭제][Excel] 인데,
 * 미리보기·라벨변경은 그 화면이 실제로 무엇을 하는지 확인하지 못해 넣지 않았다.
 * 눌러도 아무 일 없는 버튼을 늘리는 건 원본을 닮은 게 아니다.
 */
export default function SchedulePage() {
  const [rows, setRows] = useState<ScheduleEvent[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  /** 캘린더에서 고른 날. 빈 문자열이면 고른 날 없음 = 전체 보기. */
  const [pickedDate, setPickedDate] = useState('')
  /** 원본 하단 [선택삭제] 는 고른 행을 한꺼번에 지운다. 고르는 방식은 회색 행번호 칸 클릭 — 다른 목록과 같다. */
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const [eventDate, setEventDate] = useState(() => ymd(new Date()))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('회의')
  const [owner, setOwner] = useState('')
  const [location, setLocation] = useState('')
  const [attendees, setAttendees] = useState('')

  async function load() {
    try { setRows((await api.get<ScheduleEvent[]>('/schedule-events')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!title.trim()) return setError('일정 제목을 입력하세요.')
    if (startTime && endTime && endTime < startTime) return setError('종료시간이 시작시간보다 빠릅니다.')
    try {
      await api.post<ScheduleEvent>('/schedule-events', {
        eventDate, startTime: startTime || undefined, endTime: endTime || undefined,
        title, category, owner: owner || undefined,
        location: location || undefined, attendees: attendees || undefined,
      })
      setOk('일정 등록 완료')
      setTitle(''); setStartTime(''); setEndTime(''); setOwner(''); setLocation(''); setAttendees('')
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function removeSelected() {
    const targets = shown.filter((r) => selected.has(r.id))
    if (targets.length === 0) return alert('지울 일정을 고르세요. (왼쪽 회색 번호 칸을 누릅니다)')
    if (!confirm(`${targets.length}건을 삭제할까요?`)) return
    const failed: string[] = []
    for (const r of targets) {
      try { await api.delete(`/schedule-events/${r.id}`) }
      catch (err) { failed.push(`${r.title}: ${extractErrorMessage(err)}`) }
    }
    setSelected(new Set())
    void load()
    if (failed.length) alert(`지우지 못한 일정 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  const toggle = (id: number) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const shown = rows
    // 달력에서 고른 날이 있으면 그날만. 없으면 전체 — 원본도 같은 규칙이다.
    .filter((r) => !pickedDate || r.eventDate === pickedDate)
    .filter((r) => !keyword
      || r.title.includes(keyword)
      || (r.owner ?? '').includes(keyword)
      || (r.attendees ?? '').includes(keyword)
      || (r.location ?? '').includes(keyword))

  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }

  return (
    <EcListShell
      title="일정관리"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={() => setShowForm(true)}
      actions={[{ label: '인쇄' }, { label: '선택삭제', onClick: removeSelected }, { label: 'Excel' }]}
    >
      <Modal open={showForm} title="일정 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>일자 *</th>
                <td><input type="date" className={inputCls} value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>시간</th>
                <td>
                  <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: 110 }} />
                  <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
                  <input type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: 110 }} />
                </td>
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
              <tr>
                <th style={th}>장소</th>
                <td><input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} style={{ width: 150 }} placeholder="예: 3층 회의실" /></td>
                <th style={th}>참석자</th>
                <td><input className={inputCls} value={attendees} onChange={(e) => setAttendees(e.target.value)} style={{ width: '100%' }} placeholder="콤마로 구분 (예: 김부장, 이대리)" /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">등록(F8)</button></div>
        </form>
      )}</Modal>

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <EcMonthCalendar
          value={pickedDate}
          onPick={setPickedDate}
          marks={new Set(rows.map((r) => r.eventDate))}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 원본은 목록 위에 조회 기간을 적는다. 우리는 캘린더에서 고른 날(없으면 전체)이 그 자리다. */}
          <div style={{ marginBottom: 4, fontSize: 12, color: 'var(--ec-text-grid)' }}>
            {pickedDate
              ? `${pickedDate.replace(/-/g, '/')} (${DOW[new Date(pickedDate).getDay()]})`
              : '전체 기간'}
          </div>
          <table className="w-full text-left">
            {/* 원본 실측 폭(25·100·55·55·160·300·170 = 865)을 비율로 옮겼다.
                고정 px 로 두면 우리 목록 칸이 더 넓어서 제목만 늘어나고 비율이 깨진다. */}
            <colgroup>
              {['2.9%', '11.6%', '6.4%', '6.4%', '18.5%', '34.7%', '19.7%'].map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>일자(요일)</th>
                <th>시작시간</th>
                <th>종료시간</th>
                <th>참석자성명</th>
                <th>제목</th>
                <th>장소</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={r.id}>
                  <td
                    onClick={() => toggle(r.id)}
                    title="눌러서 선택 (하단 [선택삭제])"
                    style={{
                      textAlign: 'center', cursor: 'pointer',
                      background: selected.has(r.id) ? 'var(--ec-blue-light)' : '#f3f3f3',
                      color: selected.has(r.id) ? 'var(--ec-blue-dark)' : '#8a929c',
                      fontWeight: selected.has(r.id) ? 700 : 400,
                    }}
                  >
                    {i + 1}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {r.eventDate.replace(/-/g, '/')}({DOW[new Date(r.eventDate).getDay()]})
                  </td>
                  <td style={{ textAlign: 'center' }}>{r.startTime ?? ''}</td>
                  <td style={{ textAlign: 'center' }}>{r.endTime ?? ''}</td>
                  <td>{r.attendees ?? ''}</td>
                  <td>{r.title}</td>
                  <td>{r.location ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </EcListShell>
  )
}

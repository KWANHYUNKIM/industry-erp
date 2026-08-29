import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import Modal from '../../components/Modal'
import EcMonthCalendar from '../../components/EcMonthCalendar'
import { ymd } from '../../components/EcPeriodPicks'
import { useAuth } from '../../auth/AuthContext'
import { isMyEvent } from '../../utils/myCalendar'
import { dateText } from '../../utils/dateText'

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
  /** 원본 [라벨] — 일정구분을 가로지르는 표시('급함·대외비'). */
  labelText: string | null
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
 *
 * <p>원본 왼쪽에는 <b>캘린더 고르기</b>가 있다(사본 실측): 내 캘린더 · [기본] 공유일정캘린더 ·
 * 다른 캘린더 · 근태현황. 우리는 그 자리가 없어 <b>온 회사의 일정이 늘 한 줄로 섞여</b>
 * 나왔다. 사람이 늘수록 자기 일정을 찾을 수가 없다.
 *
 * <p>일정에는 <b>만든 사람(createdBy)</b>이 진작 실려 있었다 — 응답에도 있었는데 화면이
 * 안 봤을 뿐이다. 그걸로 가른다. 개인/공개 구분은 우리 자료에 없으므로
 * [공유일정캘린더]는 <b>전체</b>다 — 없는 구분을 지어내지 않는다.
 * [근태현황]은 일정이 아니라 근태 자료라 이 화면에서 겹쳐 보이지 않는다.
 */
/** 원본 왼쪽 캘린더 목록. '다른 캘린더' 는 사람을 골라 그 사람 일정만 본다. */
const CALENDARS = ['내 캘린더', '[기본] 공유일정캘린더', '다른 캘린더'] as const
type Calendar = typeof CALENDARS[number]

export default function SchedulePage() {
  const { user } = useAuth()
  const [calendar, setCalendar] = useState<Calendar>('[기본] 공유일정캘린더')
  const [otherOwner, setOtherOwner] = useState('')
  const [rows, setRows] = useState<ScheduleEvent[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 일정관리 조건 차례: 기준일자 · 참석자 · <b>제목</b> · <b>장소</b> · 일정구분 …
   * 둘 다 목록에 찍히는데 거를 수가 없었다 — "회의실 A 에서 잡힌 것" 을 못 골랐다.
   */
  /*
   * 원본 일정관리 조건 차례: 기준일자 · 참석자 · 제목 · 장소 · <b>일정구분</b> ·
   * 라벨 · 기타 · <b>본문</b>. 분류와 본문은 일정에 실려 오는데 거를 수가 없었다.
   */
  const [kindCond, setKindCond] = useState('')
  const [bodyCond, setBodyCond] = useState('')
  const [titleCond, setTitleCond] = useState('')
  const [placeCond, setPlaceCond] = useState('')
  const [labelCond, setLabelCond] = useState('')
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
  /* 원본 일정관리 폼의 [라벨] — 일정구분을 가로지르는 표시다. */
  const [labelText, setLabelText] = useState('')
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
        labelText: labelText || undefined,
      })
      setOk('일정 등록 완료')
      setTitle(''); setStartTime(''); setEndTime(''); setOwner(''); setLocation(''); setAttendees(''); setLabelText('')
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

  /** 규칙은 utils/myCalendar 에 있다 — 조용히 좁아지기 쉬운 자리라 단위시험을 붙였다. */
  const isMine = (r: ScheduleEvent) =>
    isMyEvent(r, { name: user?.name, username: user?.username })

  /** 만든 사람 목록 — [다른 캘린더] 에서 고른다. */
  const owners = [...new Set(rows.map((r) => (r.createdBy ?? '').trim()).filter(Boolean))].sort()

  const shown = rows
    // 원본 왼쪽 [캘린더]. 공유일정캘린더는 전체다.
    .filter((r) => calendar === '[기본] 공유일정캘린더'
      || (calendar === '내 캘린더' ? isMine(r) : !otherOwner || (r.createdBy ?? '') === otherOwner))
    // 달력에서 고른 날이 있으면 그날만. 없으면 전체 — 원본도 같은 규칙이다.
    .filter((r) => !pickedDate || r.eventDate === pickedDate)
    .filter((r) => !titleCond || r.title.includes(titleCond))
    .filter((r) => !placeCond || (r.location ?? '').includes(placeCond))
    .filter((r) => !kindCond || (r.category ?? '') === kindCond)
    .filter((r) => !labelCond || (r.labelText ?? '') === labelCond)
    .filter((r) => !bodyCond || (r.remark ?? '').includes(bodyCond))
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
      actions={[
      /*
       * 원본 [미리보기] — 인쇄와 <b>같은 종이</b>를 띄우되 인쇄 대화상자는 안 띄운다.
       * '미리보기 화면이 없다' 고 적고 뺐는데, 셸이 이미 그 종이를 만들고 있었다 —
       * 없던 것은 <b>대화상자를 안 띄우는 길</b>뿐이었다. 무엇이 나오는지 보려고
       * [인쇄]를 누르면 대화상자부터 떠서 취소를 먼저 눌러야 했다.
       */
        { label: '미리보기' },
        { label: '인쇄' },
        { label: '선택삭제', onClick: removeSelected },
        { label: 'Excel' },
      ]}
    >
      {/* 원본 왼쪽의 캘린더 고르기. 우리 화면은 좌우가 달력·목록이라 위에 한 줄로 둔다. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px',
        border: '1px solid var(--ec-border)', background: '#f7f9fb', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>캘린더</span>
        <div className="ec-pills">
          {CALENDARS.map((c) => (
            <button key={c} type="button" className={`ec-pill no-ec${calendar === c ? ' active' : ''}`}
                    onClick={() => setCalendar(c)}>{c}</button>
          ))}
        </div>
        {calendar === '다른 캘린더' && (
          <select className="ec-input" value={otherOwner}
                  onChange={(e) => setOtherOwner(e.target.value)} style={{ width: 160 }}>
            <option value="">전체</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#8a929c' }}>
          내 캘린더는 내가 만들었거나 담당·참석자에 내가 있는 일정입니다.
        </span>
      </div>

      <Modal open={showForm} title="일정 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>일자 *</th>
                <td><input type="date" className={inputCls} value={dateText(eventDate)} onChange={(e) => setEventDate(e.target.value)} style={{ width: 150 }} /></td>
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
                <th style={th}>라벨</th>
                <td><input className={inputCls} value={labelText} onChange={(e) => setLabelText(e.target.value)} style={{ width: 150 }} placeholder="예: 급함" /></td>
              </tr>
              <tr>
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
          {/* 원본 차례: 참석자 · 제목 · 장소 — 참석자는 등록 폼의 칸이라 조건 판에는 둘이다. */}
          <ul className="ec-cond" style={{ marginBottom: 6 }}>
            <EcCond label="제목">
              <input className="ec-input" value={titleCond} placeholder="제목"
                     onChange={(e) => setTitleCond(e.target.value)} style={{ width: 160 }} />
            </EcCond>
            <EcCond label="장소">
              <input className="ec-input" value={placeCond} placeholder="장소"
                     onChange={(e) => setPlaceCond(e.target.value)} style={{ width: 140 }} />
            </EcCond>
            <EcCond label="일정구분">
              <select className="ec-input" value={kindCond} style={{ width: 120 }}
                      onChange={(e) => setKindCond(e.target.value)}>
                <option value="">전체</option>
                {[...new Set(rows.map((r) => r.category).filter(Boolean))].map((c) => <option key={c as string}>{c}</option>)}
              </select>
            </EcCond>
            {/* 원본 차례: … 일정구분 · <b>라벨</b> · 기타 · 본문 */}
            <EcCond label="라벨">
              <select className="ec-input" value={labelCond} style={{ width: 120 }}
                      onChange={(e) => setLabelCond(e.target.value)}>
                <option value="">전체</option>
                {[...new Set(rows.map((r) => r.labelText).filter(Boolean))].map((l) => <option key={l as string}>{l}</option>)}
              </select>
            </EcCond>
            <EcCond label="본문">
              <input className="ec-input" value={bodyCond} placeholder="본문"
                     onChange={(e) => setBodyCond(e.target.value)} style={{ width: 150 }} />
            </EcCond>
          </ul>
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

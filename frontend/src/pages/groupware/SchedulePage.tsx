import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import Modal from '../../components/Modal'
import EcMonthCalendar from '../../components/EcMonthCalendar'
import { ymd } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import { isMyEvent } from '../../utils/myCalendar'
import { useShortcut } from '../../utils/useShortcut'
import { openPrintWindow, fillAndPrint } from '../../utils/print'
import { escapeHtml } from '../../utils/escapeHtml'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

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
 * 원본 [양식] 고르기. '월간' 은 달력 칸, '기본(수정불가)' 는 일정 목록, '일간' 은 하루의 시간 줄,
 * '사용자별' 은 사람 × 시간 표다(2026-10-03 실측 — 원본 고르기 차례는 월간양식 · 기본(수정불가) · 일간 · 월간 · 사용자별).
 */
const VIEWS = ['월간', '기본(수정불가)', '일간', '사용자별'] as const
type View = typeof VIEWS[number]

type Form = {
  eventDate: string; startTime: string; endTime: string; title: string; category: string
  owner: string; location: string; labelText: string; attendees: string; remark: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 일간 · 사용자별 의 시간 줄 — 원본은 AM 08:00 ~ PM 06:00 이다. */
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
const hourText = (h: number) => `${h < 12 ? 'AM' : 'PM'} ${pad2(h > 12 ? h - 12 : h)}:00`
const dayHead = (date: string) => {
  const d = new Date(`${date}T00:00:00`)
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} (${DOW[d.getDay()]})`
}
/** 일정이 놓이는 시간 줄 — 시작 시각의 '시'. 시간이 없으면 null. */
const startHour = (r: { startTime: string | null }) => (r.startTime ? Number(r.startTime.slice(0, 2)) : null)
/** 원본 일간 줄의 글: '제목/10/03 (토) 10:00 ~ 11:00/장소/참석자'. */
const lineText = (r: ScheduleEvent) =>
  `${r.title}/${dayHead(r.eventDate)} ${r.startTime ?? ''}${r.endTime ? ` ~ ${r.endTime}` : ''}/${r.location ?? ''}/${r.attendees ?? ''}`

/**
 * 원본 신규 폼의 기본 시간 — <b>다음 정각부터 한 시간</b>이다(13:37 에 열면 14:00 ~ 15:00, 2026-10-03 실측).
 * 23시 이후면 날을 넘기지 않고 23:00 ~ 24:00 으로 둔다.
 */
function defaultTimes(now = new Date()) {
  const h = Math.min(now.getHours() + 1, 23)
  return { startTime: `${pad2(h)}:00`, endTime: `${pad2(h + 1)}:00` }
}

/**
 * 그룹웨어 > 사내관리 > 일정관리 (이카운트 E070201)
 *
 * <p><b>원본은 양식이 둘이다(2026-10-03 직접 써 보며 확인).</b> 오른쪽 위 양식 고르기에서
 * <b>[월간]</b>은 한 달 달력 칸에 일정을 얹고(칸마다 일정구분 칩 + 굵은 제목), <b>[기본(수정불가)]</b>은
 * 왼쪽 작은 달력 + 일정 목록이다. 우리는 기본 양식 하나만 있었다 — 일정관리를 열면 달력이 아니라 표가 떴다.
 * loginaa 회사가 열어 두는 양식이 달력이라 [월간]으로 시작한다.
 *
 * <p>월간 양식 왼쪽은 연도 넘기기 + 1~12월 단추 + [오늘], 그 아래 캘린더 고르기다. 칸 실측: 머리 12px 700 ·
 * 바탕 --ec-bg-page · 높이 25.7 / 날 칸 높이 76 · 여백 2.7 · 머리카락 선 · 날짜는 오른쪽 위 · 오늘 칸 바탕
 * --ec-blue-wash · 그 달 밖의 칸 --ec-bg-disabled · 일정구분 칩 둥글기 10(.ec-label-chip).
 *
 * <p>일정을 누르면 <b>'일정조회'</b> 창이 뜬다 — 제목 · 일정구분 · 장소 · 라벨 · 날짜/시간('2026/10/03 14:00 ~ 15:00')
 * · 참석자 · 본문, 하단 [수정][인쇄][닫기][삭제]. [삭제]는 '선택한 일정이 삭제 됩니다. 한번 지워진 자료는 복구 될 수
 * 없습니다. 계속 진행 하겠습니까?' 를 묻는다. 우리는 조회·수정 창이 없어 <b>한 번 넣은 일정을 고칠 수 없었다</b>
 * (서버에는 PATCH 가 진작 있었다).
 *
 * <p><b>[일간]</b>은 왼쪽 작은 달력에서 고른 날의 시간 줄(맨 위 AM 00:00 + AM 08:00 ~ PM 06:00)에, <b>[사용자별]</b>은
 * 사원 × 시간 칸에 일정을 얹는다(참석자로 가른다). 일정이 든 칸은 캘린더 색(--ec-bg-calendar) — 원본 [기본] 공유일정캘린더의 노랑.
 * 줄 글은 '제목/10/03 (토) 10:00 ~ 11:00/장소/참석자' 다.
 *
 * <p>신규 폼 '일정관리등록' 의 시간은 다음 정각부터 한 시간이 기본이고, 참석자에는 나를 넣어 둔다(원본 실측).
 * 원본의 [캘린더]·[공유자]·[권한]·[일정알림]·[반복설정] 은 받쳐 줄 자료가 없어 두지 않았다.
 *
 * <p>기본 양식 목록 컬럼은 (선택칸 25) 일자(요일) 100 · 시작시간 55 · 종료시간 55 · 참석자성명 160 · 제목 300 · 장소 170 이다.
 *
 * <p>원본 왼쪽에는 <b>캘린더 고르기</b>가 있다: 내 캘린더 · [기본] 공유일정캘린더 · 다른 캘린더.
 * 일정의 <b>만든 사람(createdBy)</b>으로 가른다. 개인/공개 구분은 우리 자료에 없으므로
 * [공유일정캘린더]는 <b>전체</b>다 — 없는 구분을 지어내지 않는다.
 */
/** 원본 왼쪽 캘린더 목록. '다른 캘린더' 는 사람을 골라 그 사람 일정만 본다. */
interface UserRow { id: number; name: string }

const CALENDARS = ['내 캘린더', '[기본] 공유일정캘린더', '다른 캘린더'] as const
type Calendar = typeof CALENDARS[number]

export default function SchedulePage() {
  const { user } = useAuth()
  const [view, setView] = useState<View>('월간')
  /** 월간 양식이 보는 달(그 달 1일). */
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  /** 일간 · 사용자별 이 보는 날. */
  const [day, setDay] = useState(() => ymd(new Date()))
  const [users, setUsers] = useState<UserRow[]>([])
  const [calendar, setCalendar] = useState<Calendar>('[기본] 공유일정캘린더')
  const [otherOwner, setOtherOwner] = useState('')
  const [rows, setRows] = useState<ScheduleEvent[]>([])
  const [error, setError] = useState('')
  /** 입력 창. editId 가 있으면 고치는 중. */
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  /** '일정조회' 창에 띄운 일정. */
  const [viewing, setViewing] = useState<ScheduleEvent | null>(null)
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 일정관리(기본 양식) 조건 차례: 기준일자 · 참석자 · 제목 · 장소 · 일정구분 · 라벨 · 기타 · 본문.
   */
  const [kindCond, setKindCond] = useState('')
  const [bodyCond, setBodyCond] = useState('')
  const [titleCond, setTitleCond] = useState('')
  const [placeCond, setPlaceCond] = useState('')
  const [labelCond, setLabelCond] = useState('')
  /** 캘린더에서 고른 날. 빈 문자열이면 고른 날 없음 = 전체 보기. */
  const [pickedDate, setPickedDate] = useState('')
  /** 원본 [기준일자] 구간. 비워 두고 시작한다. */
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  /** 원본 하단 [선택삭제] 는 고른 행을 한꺼번에 지운다. 고르는 방식은 회색 행번호 칸 클릭 — 다른 목록과 같다. */
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const emptyForm = (date = ymd(new Date())): Form => ({
    eventDate: date, ...defaultTimes(), title: '', category: '회의', owner: '',
    location: '', labelText: '', attendees: user?.name ?? '', remark: '',
  })
  const [form, setForm] = useState<Form>(() => emptyForm())
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function load() {
    try { setRows((await api.get<ScheduleEvent[]>('/schedule-events')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { api.get<UserRow[]>('/users').then((r) => setUsers(r.data)).catch(() => {}) }, [])

  function openNew(date?: string) {
    setEditId(null)
    setForm(emptyForm(date))
    setError('')
    setShowForm(true)
  }

  /** '일정조회' 의 [수정] — 같은 입력 창을 그 일정으로 채워 띄운다. */
  function openEdit(r: ScheduleEvent) {
    setViewing(null)
    setEditId(r.id)
    setForm({
      eventDate: r.eventDate, startTime: r.startTime ?? '', endTime: r.endTime ?? '', title: r.title,
      category: r.category ?? '', owner: r.owner ?? '', location: r.location ?? '',
      labelText: r.labelText ?? '', attendees: r.attendees ?? '', remark: r.remark ?? '',
    })
    setError('')
    setShowForm(true)
  }

  useShortcut('F2', () => openNew(), !showForm && !viewing)
  useShortcut('F8', () => void submit(), showForm)

  async function submit() {
    setError('')
    if (!form.title.trim()) return setError('일정 제목을 입력하세요.')
    if (form.startTime && form.endTime && form.endTime < form.startTime) return setError('종료시간이 시작시간보다 빠릅니다.')
    try {
      if (editId != null) {
        // PATCH 는 null 을 '그대로 둠' 으로 읽는다 — 지운 칸은 빈 글자로 보내야 비워진다.
        await api.patch(`/schedule-events/${editId}`, form)
      } else {
        await api.post<ScheduleEvent>('/schedule-events', {
          ...form,
          startTime: form.startTime || undefined, endTime: form.endTime || undefined,
          owner: form.owner || undefined, location: form.location || undefined,
          attendees: form.attendees || undefined, labelText: form.labelText || undefined,
          remark: form.remark || undefined,
        })
      }
      setShowForm(false)
      setEditId(null)
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  /** 원본 '일정조회' 의 [삭제] 문구 그대로. */
  const DELETE_ASK = '선택한 일정이 삭제 됩니다.\n한번 지워진 자료는 복구 될 수 없습니다.\n\n계속 진행 하겠습니까?'

  async function removeOne(id: number) {
    if (!confirm(DELETE_ASK)) return
    try {
      await api.delete(`/schedule-events/${id}`)
      setViewing(null)
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function removeSelected() {
    const targets = shown.filter((r) => selected.has(r.id))
    if (targets.length === 0) return alert('지울 일정을 고르세요. (왼쪽 회색 번호 칸을 누릅니다)')
    if (!confirm(DELETE_ASK)) return
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

  /** 캘린더 고르기와 검색창 — 두 양식이 같이 쓴다. */
  const inCalendar = rows
    .filter((r) => calendar === '[기본] 공유일정캘린더'
      || (calendar === '내 캘린더' ? isMine(r) : !otherOwner || (r.createdBy ?? '') === otherOwner))
    .filter((r) => !keyword
      || r.title.includes(keyword)
      || (r.owner ?? '').includes(keyword)
      || (r.attendees ?? '').includes(keyword)
      || (r.location ?? '').includes(keyword))

  const shown = inCalendar
    .filter((r) => !from || r.eventDate >= from)
    .filter((r) => !to || r.eventDate <= to)
    .filter((r) => !pickedDate || r.eventDate === pickedDate)
    .filter((r) => !titleCond || r.title.includes(titleCond))
    .filter((r) => !placeCond || (r.location ?? '').includes(placeCond))
    .filter((r) => !kindCond || (r.category ?? '') === kindCond)
    .filter((r) => !labelCond || (r.labelText ?? '') === labelCond)
    .filter((r) => !bodyCond || (r.remark ?? '').includes(bodyCond))

  const timeText = (r: ScheduleEvent) =>
    `${r.eventDate.replace(/-/g, '/')} ${r.startTime ?? ''}${r.endTime ? ` ~ ${r.endTime}` : ''}`.trim()

  function printOne(r: ScheduleEvent) {
    const win = openPrintWindow()
    if (!win) return
    const line = (k: string, v: string | null) => `<tr><th>${k}</th><td>${escapeHtml(v ?? '')}</td></tr>`
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>일정조회</title>
<style>body{font-family:sans-serif;font-size:12px;padding:24px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid;padding:4px 6px;text-align:left}th{width:90px}</style></head><body><h1>일정조회</h1><table>
${line('제목', r.title)}${line('일정구분', r.category)}${line('장소', r.location)}${line('라벨', r.labelText)}
${line('날짜/시간', timeText(r))}${line('참석자', r.attendees)}${line('본문', r.remark)}</table></body></html>`)
  }

  /** 월간 양식의 칸 — 그 달 1일이 든 주의 일요일부터 6주(마지막 주가 다음 달뿐이면 뺀다). */
  const weeks: Date[][] = (() => {
    const start = new Date(month); start.setDate(1 - month.getDay())
    const out: Date[][] = []
    for (let w = 0; w < 6; w++) {
      const week = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i))
      if (w > 0 && week[0].getMonth() !== month.getMonth()) break
      out.push(week)
    }
    return out
  })()
  const todayStr = ymd(new Date())
  /** 월간 칸은 주 수(5·6)가 달마다 변한다 — 런타임에 머리·본문 칸 수를 맞춰 본다. */
  const monthRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(monthRef, '일정관리 월간', [view, month.getTime(), inCalendar.length])
  const userRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(userRef, '일정관리 사용자별', [view, day, users.length, inCalendar.length])

  const dayEvents = inCalendar
    .filter((r) => r.eventDate === day)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  /**
   * 일간의 줄 — 원본은 맨 위 'AM 00:00' 줄과 AM 08:00 ~ PM 06:00 이다. 일정은 <b>시작 시각의 줄</b>에만 놓인다
   * (10:00 ~ 11:00 일정이 AM 10:00 줄에만 보였다). 8시 전 · 시간 없는 일정은 맨 위 줄, 6시 뒤는 PM 06:00 줄.
   */
  const dayRow = (r: ScheduleEvent) => { const h = startHour(r); return h == null || h < 8 ? 0 : Math.min(h, 18) }
  /** 사용자별의 칸 — 맨 위 줄이 없어서 8시 전 일정은 AM 08:00 칸에 둔다. */
  const userCol = (r: ScheduleEvent) => Math.min(Math.max(startHour(r) ?? 8, 8), 18)
  const attends = (r: ScheduleEvent, name: string) =>
    (r.attendees ?? '').split(',').map((a) => a.trim()).includes(name)

  /** 일간 · 사용자별 칸 하나 — 칩(일정구분) + 줄 글, 누르면 '일정조회'. */
  const eventLine = (r: ScheduleEvent) => (
    <button key={r.id} type="button" title={lineText(r)} onClick={() => setViewing(r)}
            className="no-ec flex items-center gap-[4px] w-full bg-transparent border-0 p-0 cursor-pointer text-left text-ec-ink">
      {r.category && <span className="ec-label-chip">{r.category}</span>}
      <span className="truncate">{lineText(r)}</span>
    </button>
  )

  const viewPicker = (
    <div className="flex justify-end mb-[6px]">
      <select className="ec-input w-[140px]" aria-label="양식" value={view} onChange={(e) => setView(e.target.value as View)}>
        {VIEWS.map((v) => <option key={v}>{v}</option>)}
      </select>
    </div>
  )

  const calendarPicker = (
    <div className="flex flex-col gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
      <span className="text-[12px] text-ec-navy">▾ 캘린더</span>
      {CALENDARS.map((c) => (
        <label key={c} className="inline-flex items-center gap-[6px] text-[12px] cursor-pointer">
          <input type="radio" name="calendar" checked={calendar === c} onChange={() => setCalendar(c)} />
          {c}
        </label>
      ))}
      {calendar === '다른 캘린더' && (
        <select className="ec-input" value={otherOwner} onChange={(e) => setOtherOwner(e.target.value)}>
          <option value="">전체</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      <span className="text-[11px] text-ec-hint">내 캘린더는 내가 만들었거나 담당·참석자에 내가 있는 일정입니다.</span>
    </div>
  )

  /** 일간 · 사용자별 왼쪽 — 원본은 작은 달력(날 고르기) + 캘린더 고르기다. */
  const dayPicker = (
    <div className="shrink-0">
      <EcMonthCalendar value={day} onPick={(d) => d && setDay(d)}
                       marks={new Set(inCalendar.map((r) => r.eventDate))} />
      {calendarPicker}
    </div>
  )

  return (
    <EcListShell
      title="일정관리"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={() => openNew()}
      actions={view === '월간' || view === '사용자별'
        // 원본 월간 · 사용자별 양식 하단은 [신규(F2)][인쇄] 뿐이다. 일간은 [Excel] 이 더 있다.
        ? [{ label: '인쇄' }]
        : view === '일간'
        ? [{ label: '인쇄' }, { label: 'Excel' }]
        : [
          { label: '미리보기' },
          { label: '인쇄' },
          { label: '선택삭제', onClick: removeSelected, disabled: selected.size === 0 },
          { label: 'Excel' },
        ]}
    >
      {/* 원본 '일정관리등록' 창 */}
      <Modal error={error} open={showForm} title="일정관리등록" onClose={() => setShowForm(false)} width={780}>
        <ul className="ec-form mb-[10px]">
          <li className="wide">
            <div className="title">제목</div>
            <div className="form"><input className="ec-input w-full" placeholder="제목" value={form.title}
                                         onChange={(e) => set('title', e.target.value)} /></div>
          </li>
          <li>
            <div className="title">일정구분</div>
            <div className="form">
              <select className="ec-input w-full" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {[...new Set([...CATEGORIES, form.category].filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </li>
          <li>
            <div className="title">담당</div>
            <div className="form"><input className="ec-input w-full" value={form.owner} onChange={(e) => set('owner', e.target.value)} /></div>
          </li>
          <li>
            <div className="title">장소</div>
            <div className="form"><input className="ec-input w-full" placeholder="장소" value={form.location}
                                         onChange={(e) => set('location', e.target.value)} /></div>
          </li>
          <li>
            <div className="title">라벨</div>
            <div className="form"><input className="ec-input w-full" placeholder="라벨" value={form.labelText}
                                         onChange={(e) => set('labelText', e.target.value)} /></div>
          </li>
          <li className="wide">
            <div className="title">날짜/시간</div>
            <div className="form">
              <input type="date" className="ec-input w-[150px]" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
              <input type="time" className="ec-input w-[110px]" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
              <span className="text-ec-label">~</span>
              <input type="time" className="ec-input w-[110px]" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </div>
          </li>
          <li className="wide">
            <div className="title">참석자</div>
            <div className="form"><input className="ec-input w-full" placeholder="참석자 (콤마로 구분)" value={form.attendees}
                                         onChange={(e) => set('attendees', e.target.value)} /></div>
          </li>
        </ul>
        <textarea className="ec-input w-full h-[140px] py-[8px] resize-y" aria-label="본문" value={form.remark}
                  onChange={(e) => set('remark', e.target.value)} />
        <div className="flex gap-[6px] mt-[10px]">
          <button className="ec-btn ec-btn-primary" onClick={() => void submit()}>저장(F8)</button>
          <button className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
        </div>
      </Modal>

      {/* 원본 '일정조회' 창 */}
      <Modal error={error} open={!!viewing} title="일정조회" onClose={() => setViewing(null)} width={780}>
        {viewing && (
          <>
            <table className="w-full text-left mb-[10px]">
              <tbody>
                <tr><th className="w-[120px] bg-ec-page">제목</th><td colSpan={3}>{viewing.title}</td></tr>
                <tr>
                  <th className="bg-ec-page">일정구분</th><td>{viewing.category ?? ''}</td>
                  <th className="w-[120px] bg-ec-page">담당</th><td>{viewing.owner ?? ''}</td>
                </tr>
                <tr>
                  <th className="bg-ec-page">장소</th><td>{viewing.location ?? ''}</td>
                  <th className="bg-ec-page">라벨</th><td>{viewing.labelText ?? ''}</td>
                </tr>
                <tr><th className="bg-ec-page">날짜/시간</th><td colSpan={3}>{timeText(viewing)}</td></tr>
                <tr><th className="bg-ec-page">참석자</th><td colSpan={3}>{viewing.attendees ?? ''}</td></tr>
              </tbody>
            </table>
            <div className="whitespace-pre-wrap text-[12px] text-ec-ink min-h-[120px] p-[10px] border border-ec-line border-solid rounded-ec">
              {viewing.remark ?? ''}
            </div>
            <div className="flex gap-[6px] mt-[10px]">
              <button className="ec-btn ec-btn-primary" onClick={() => openEdit(viewing)}>수정</button>
              <button className="ec-btn" onClick={() => printOne(viewing)}>인쇄</button>
              <button className="ec-btn" onClick={() => setViewing(null)}>닫기</button>
              <button className="ec-btn" onClick={() => void removeOne(viewing.id)}>삭제</button>
            </div>
          </>
        )}
      </Modal>

      {error && !showForm && !viewing && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {viewPicker}

      {view === '월간' ? (
        <div className="flex gap-[10px] items-start">
          {/* 원본 왼쪽: 연도 넘기기 + 1~12월 + [오늘], 그 아래 캘린더 고르기 */}
          <div className="w-[200px] shrink-0 bg-ec-panel rounded-ec-panel p-[9px] mobile:w-full">
            <div className="flex items-center justify-between mb-[6px]">
              <button className="ec-btn ec-btn-sm" aria-label="앞 해" onClick={() => setMonth(new Date(month.getFullYear() - 1, month.getMonth(), 1))}>‹</button>
              <span className="text-[12px] font-bold">{month.getFullYear()}</span>
              <button className="ec-btn ec-btn-sm" aria-label="다음 해" onClick={() => setMonth(new Date(month.getFullYear() + 1, month.getMonth(), 1))}>›</button>
            </div>
            <div className="grid grid-cols-4 gap-[4px]">
              {Array.from({ length: 12 }, (_, m) => (
                <button key={m} type="button"
                        className={`ec-pill no-ec justify-center${month.getMonth() === m ? ' active' : ''}`}
                        onClick={() => setMonth(new Date(month.getFullYear(), m, 1))}>
                  {m + 1}월
                </button>
              ))}
            </div>
            <button type="button" className="ec-btn ec-btn-sm mt-[6px]"
                    onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>오늘</button>
            {calendarPicker}
          </div>

          <div className="flex-1 min-w-0" id="schedule-month">
            <table ref={monthRef} className="w-full table-fixed">
              <thead>
                <tr>{DOW.map((d) => <th key={d} className="text-center">{d}</th>)}</tr>
              </thead>
              <tbody>
                {weeks.map((week, wi) => (
                  <tr key={wi}>
                    {week.map((d) => {
                      const key = ymd(d)
                      const inMonth = d.getMonth() === month.getMonth()
                      const evs = inMonth ? inCalendar.filter((r) => r.eventDate === key) : []
                      return (
                        <td key={key} onDoubleClick={() => inMonth && openNew(key)}
                            className={`h-[76px] align-top p-[2.7px] ${!inMonth ? 'bg-ec-disabled' : key === todayStr ? 'bg-ec-blue-wash' : ''}`}>
                          {inMonth && (
                            <>
                              <div className={`text-right ${key === todayStr ? 'font-bold' : ''}`}>{d.getDate()}</div>
                              {evs.map((r) => (
                                <button key={r.id} type="button" title={r.title} onClick={() => setViewing(r)}
                                        className="no-ec flex items-center gap-[4px] w-full bg-transparent border-0 p-0 mb-[2px] cursor-pointer text-left text-ec-ink">
                                  {r.category && <span className="ec-label-chip">{r.category}</span>}
                                  <b className="truncate">{r.title}</b>
                                </button>
                              ))}
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : view === '일간' ? (
        <div className="flex gap-[10px] items-start">
          {dayPicker}
          <div className="flex-1 min-w-0">
            <table className="w-full table-fixed">
              <thead><tr><th className="w-[120px] text-center">시간</th><th className="text-center">{dayHead(day)}</th></tr></thead>
              <tbody>
                {[0, ...HOURS].map((h) => {
                  const evs = dayEvents.filter((r) => dayRow(r) === h)
                  return (
                    <tr key={h} className={evs.length ? 'bg-ec-calendar' : ''}>
                      <td className="text-center">{hourText(h)}</td>
                      <td>{evs.map(eventLine)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : view === '사용자별' ? (
        <div className="flex gap-[10px] items-start">
          {dayPicker}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <table ref={userRef} className="w-full table-fixed">
              <thead>
                <tr>
                  <th rowSpan={2} className="w-[115px] text-center">참석자</th>
                  <th colSpan={HOURS.length} className="text-center">{dayHead(day)}</th>
                </tr>
                <tr>{HOURS.map((h) => <th key={h} className="text-center">{hourText(h)}</th>)}</tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="bg-ec-disabled">{u.name}</td>
                    {HOURS.map((h) => {
                      const evs = dayEvents.filter((r) => userCol(r) === h && attends(r, u.name))
                      return <td key={h} className={evs.length ? 'bg-ec-calendar' : ''}>{evs.map(eventLine)}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex gap-[10px] items-start">
          <div className="shrink-0">
            <EcMonthCalendar
              value={pickedDate}
              onPick={setPickedDate}
              marks={new Set(rows.map((r) => r.eventDate))}
            />
            {calendarPicker}
          </div>
          <div className="flex-1 min-w-0">
            {/* 원본은 목록 위에 조회 기간을 적는다. 우리는 캘린더에서 고른 날(없으면 전체)이 그 자리다. */}
            <div className="mb-[4px] text-[12px] text-ec-ink">
              {pickedDate
                ? `${pickedDate.replace(/-/g, '/')} (${DOW[new Date(pickedDate).getDay()]})`
                : (from || to)
                  ? `${(from || '처음').replace(/-/g, '/')} ~ ${(to || '끝').replace(/-/g, '/')}`
                : '전체 기간'}
            </div>
            <ul className="ec-cond mb-[6px]">
              {/* 원본 조건 첫째 [기준일자] — 구간이다. 달력의 하루 고르기는 이 안에서 더 좁힌다. */}
              <EcCond label="기준일자">
                <input type="date" className="ec-input w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="my-0 mx-[4px] text-ec-label">~</span>
                <input type="date" className="ec-input w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
              </EcCond>
              <EcCond label="제목">
                <input className="ec-input w-[160px]" value={titleCond} placeholder="제목" onChange={(e) => setTitleCond(e.target.value)} />
              </EcCond>
              <EcCond label="장소">
                <input className="ec-input w-[140px]" value={placeCond} placeholder="장소" onChange={(e) => setPlaceCond(e.target.value)} />
              </EcCond>
              <EcCond label="일정구분">
                <select className="ec-input w-[120px]" value={kindCond} onChange={(e) => setKindCond(e.target.value)}>
                  <option value="">전체</option>
                  {[...new Set(rows.map((r) => r.category).filter(Boolean))].map((c) => <option key={c as string}>{c}</option>)}
                </select>
              </EcCond>
              <EcCond label="라벨">
                <select className="ec-input w-[120px]" value={labelCond} onChange={(e) => setLabelCond(e.target.value)}>
                  <option value="">전체</option>
                  {[...new Set(rows.map((r) => r.labelText).filter(Boolean))].map((l) => <option key={l as string}>{l}</option>)}
                </select>
              </EcCond>
              <EcCond label="본문">
                <input className="ec-input w-[150px]" value={bodyCond} placeholder="본문" onChange={(e) => setBodyCond(e.target.value)} />
              </EcCond>
            </ul>
            <table className="w-full text-left table-fixed">
              <thead>
                <tr>
                  <th className="w-[2.9%]"></th>
                  <th className="w-[11.6%] text-center">일자(요일)</th>
                  <th className="w-[6.4%] text-center">시작시간</th>
                  <th className="w-[6.4%] text-center">종료시간</th>
                  <th className="w-[18.5%]">참석자성명</th>
                  <th className="w-[34.7%]">제목</th>
                  <th className="w-[19.7%]">장소</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
                ) : shown.map((r, i) => (
                  <tr key={r.id}>
                    <td onClick={() => toggle(r.id)} title="눌러서 선택 (하단 [선택삭제])"
                        className={`text-center cursor-pointer ${selected.has(r.id)
                          ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'bg-ec-stripe text-ec-hint'}`}>
                      {i + 1}
                    </td>
                    <td className="text-center">
                      {r.eventDate.replace(/-/g, '/')}({DOW[new Date(r.eventDate).getDay()]})
                    </td>
                    <td className="text-center">{r.startTime ?? ''}</td>
                    <td className="text-center">{r.endTime ?? ''}</td>
                    <td>{r.attendees ?? ''}</td>
                    <td>
                      <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-left text-ec-navy"
                              onClick={() => setViewing(r)}>{r.title}</button>
                    </td>
                    <td>{r.location ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </EcListShell>
  )
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import EcListShell from '../../../components/EcListShell'
import EcPeriodPicks, { INQUIRY_PICKS, ymd } from '../../../components/EcPeriodPicks'
import { EcReportHead, EcReportFoot, reportPeriod, reportDate } from '../../../components/EcReportFrame'
import { api, extractErrorMessage } from '../../../api/client'
import type { Attendance } from '../../../types/api'
import { useShortcut } from '../../../utils/useShortcut'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'

/**
 * 그룹웨어 › 업무관리 › 출/퇴근 의 (ID) 현황 넷 — 출/퇴근현황(ID) E070306 · 지각현황(ID) E070307 · 일별근무시간(ID) E070309 ·
 * 출퇴근/근태/일정현황(ID) E070315 (2026-10-14 loginaa 실측 — plans/그룹웨어/E070305.md '현황 넷').
 *
 * <p>네 화면이 같은 꼴이다: 조건 판(탭 '기본', [검색(F8)] 빠른선택 · [다시 작성]) → 출력물(가운데 제목 · 기간, 날마다 한 줄, 하단 [인쇄][Excel]).
 * 사원별 <b>집계</b>가 아니다 — 관리 › 근태관리 의 근태현황(/hr/attendance-status) · 지각현황 · 일별근무시간 · 통합현황은 다른 화면이라 그대로 둔다.
 *
 * <p>지각 = 09:00 보다 늦은 출근(☐오전반차설정 을 켠 날은 빼고 — 서버 AttendanceResponse.late). 표준근무시간 = 8시간(09:00 ~ 18:00 − 점심 1시간).
 * 원본은 이 둘을 관리 › 근태관리 '출/퇴근반영기준' · 근무시간설정에서 가져온다 — 원본에 출퇴근 기록을 못 남겨(지울 길이 없다) 숫자는 못 쟀다.
 */
export type AttendanceIdKind = 'status' | 'late' | 'daily' | 'integrated'

const TITLES: Record<AttendanceIdKind, string> = {
  status: '출/퇴근현황(ID)',
  late: '지각현황(ID)',
  daily: '일별근무시간(ID)',
  integrated: '출퇴근/근태/일정현황(ID)',
}
const HEADS: Record<AttendanceIdKind, string[]> = {
  status: ['일자', '사원명', '출근시간', '퇴근시간', '근무시간(시간단위)'],
  late: ['일자', '사원명', '출근시간', '입력시간', '적요'],
  daily: ['일자', '사원명', '근무시간(시간단위)', '근무시간(분단위)', '표준근무시간(시간단위)', '표준근무시간(분단위)', '차이(시간단위)', '차이(분단위)'],
  integrated: ['일자', '사원명', '출근시간', '퇴근시간', '근무시간(분단위)', '근태내역', '적요', '일정'],
}
/** 출퇴근/근태/일정현황(ID) 만 빠른선택 끝에 금년 · 전년이 더 있다. */
const PICKS: Record<AttendanceIdKind, readonly string[]> = {
  status: INQUIRY_PICKS, late: INQUIRY_PICKS, daily: INQUIRY_PICKS, integrated: [...INQUIRY_PICKS, '금년', '전년'],
}
/** 표준근무시간(분) — 09:00 ~ 18:00 에서 점심 한 시간을 뺀 것. */
export const STANDARD_MINUTES = 480
const EARLY_LEAVE = '18:00'
const ATT_KINDS = ['전체', '정상근무', '지각', '조기퇴근', '결근'] as const
const STATES = ['전체', '결재중', 'UserPay', '확인'] as const

const hours = (m: number) => (m / 60).toFixed(2)
const hm = (t: string | null) => (t ? t.slice(0, 5) : '')
const monthStart = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)) }
/** 기간의 날짜들 — 모든날짜검색 · 통합현황이 날마다 한 줄을 그린다. */
function daysOf(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00`)
  for (let i = 0; i < 400 && ymd(d) <= to; i++) { out.push(ymd(d)); d.setDate(d.getDate() + 1) }
  return out
}

interface UserOpt { id: number; username: string; name: string; department: string | null; enabled?: boolean }
interface VacationRow { empName: string; type: string; startDate: string; endDate: string; statusName?: string | null }
interface ScheduleEvent { eventDate: string; title: string; owner: string | null; projectName: string | null }

/** 한 줄 — 기록이 없는 날(모든날짜검색 · 통합현황)은 att 가 null. */
interface Line { key: string; date: string; name: string; att: Attendance | null; leave: string; events: string }

export default function AttendanceIdReport({ kind }: { kind: AttendanceIdKind }) {
  const title = TITLES[kind]
  const [view, setView] = useState<'cond' | 'result'>('cond')
  const [error, setError] = useState('')
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(() => ymd(new Date()))
  const [empName, setEmpName] = useState('')
  const [dept, setDept] = useState('')
  /* 원본(2026-10-20 실측) 처음 값: 출/퇴근현황(ID) 내/외근구분 ◉내근, 통합현황 ◉전체 · 근태구분 ☑ 다섯 · 근무구분 ◉업무일 · 상태 ☑ 넷 */
  const inOutInit = kind === 'status' ? '내근' : '전체'
  const [inOut, setInOut] = useState(inOutInit)
  const [allDates, setAllDates] = useState(false)
  const [attKinds, setAttKinds] = useState<Set<string>>(() => new Set(ATT_KINDS))
  const [dayKind, setDayKind] = useState('업무일')
  const [project, setProject] = useState('')
  const [attItem, setAttItem] = useState('')
  const [leaveItem, setLeaveItem] = useState('')
  const [attGroup, setAttGroup] = useState('')
  const [remark, setRemark] = useState('')
  const [states, setStates] = useState<Set<string>>(() => new Set(STATES))
  const [lines, setLines] = useState<Line[]>([])
  const [shown, setShown] = useState({ from, to })

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [lines, view])

  const [users, setUsers] = useState<UserOpt[]>([])
  useEffect(() => { api.get<UserOpt[]>('/users').then((r) => setUsers(r.data)).catch(() => {}) }, [])

  function reset() {
    setFrom(monthStart()); setTo(ymd(new Date())); setEmpName(''); setDept(''); setInOut(inOutInit); setAllDates(false)
    setAttKinds(new Set(ATT_KINDS)); setDayKind('업무일'); setProject(''); setAttItem(''); setLeaveItem(''); setAttGroup(''); setRemark('')
    setStates(new Set(STATES))
  }

  const has = (v: string | null | undefined, q: string) => !q.trim() || (v ?? '').includes(q.trim())

  async function search() {
    setError('')
    if (!from || !to || from > to) { setError('기간을 확인하세요.'); return }
    try {
      const att = (await api.get<Attendance[]>('/attendances', { params: { from, to } })).data
        .filter((a) => has(a.userName, empName) && has(a.department, dept))
        .filter((a) => inOut === '전체' || (inOut === '내근' ? !a.outsideWork : inOut === '외근' ? a.outsideWork : false))
        .sort((a, b) => (a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : a.userName.localeCompare(b.userName)))
      let out: Line[]
      if (kind === 'integrated') {
        /* 원본: 기록이 없어도 날마다 × 사용자마다 한 줄(금월 491줄). 근태내역 = 그날 걸린 근태(휴가), 일정 = 그날 그 사람 일정. */
        const [vac, ev] = await Promise.all([
          api.get<VacationRow[]>('/hr/vacations', { params: { from, to } }).then((r) => r.data).catch(() => [] as VacationRow[]),
          api.get<ScheduleEvent[]>('/schedule-events').then((r) => r.data).catch(() => [] as ScheduleEvent[]),
        ])
        const people = users.filter((u) => u.enabled !== false && has(u.name, empName) && has(u.department, dept))
          .sort((a, b) => a.username.localeCompare(b.username))
        const byKey = new Map(att.map((a) => [`${a.workDate}|${a.username}`, a]))
        out = []
        for (const d of daysOf(from, to)) {
          const dow = new Date(`${d}T00:00:00`).getDay()
          const holiday = dow === 0 || dow === 6
          if (dayKind === '업무일' && holiday) continue
          if (dayKind === '휴일' && !holiday) continue
          for (const u of people) {
            const a = byKey.get(`${d}|${u.username}`) ?? null
            if (inOut !== '전체' && !a) continue
            const leave = vac.filter((v) => v.empName === u.name && v.startDate <= d && v.endDate >= d).map((v) => v.type).join(', ')
            const evs = ev.filter((e) => e.eventDate === d && e.owner === u.name && has(e.projectName, project))
            if (project.trim() && evs.length === 0) continue
            const state = !a?.clockIn ? (holiday ? '' : '결근') : a.late ? '지각' : a.clockOut && hm(a.clockOut) < EARLY_LEAVE ? '조기퇴근' : '정상근무'
            if (!attKinds.has('전체') && !attKinds.has(state)) continue
            if (attItem.trim() && !leave.includes(attItem.trim())) continue
            if (leaveItem.trim() && !leave.includes(leaveItem.trim())) continue
            if (remark.trim() && !has(a?.note, remark)) continue
            out.push({ key: `${d}|${u.username}`, date: d, name: u.name, att: a, leave, events: evs.map((e) => e.title).join(', ') })
          }
        }
      } else {
        const picked = att.filter((a) => (kind === 'late' ? a.late : kind === 'daily' ? a.clockIn != null : true))
        out = picked.map((a) => ({ key: String(a.id), date: a.workDate, name: a.userName, att: a, leave: '', events: '' }))
        if (kind === 'status' && allDates) {
          /* [모든날짜검색] — 기록이 없는 날도 일자만 한 줄('2026/10/01' · 빈칸 …), 날짜 차례로 섞는다. */
          const haveDays = new Set(out.map((l) => l.date))
          const blanks = daysOf(from, to).filter((d) => !haveDays.has(d)).map((d) => ({ key: `blank-${d}`, date: d, name: '', att: null, leave: '', events: '' }))
          out = [...out, ...blanks].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        }
      }
      setLines(out)
      setShown({ from, to })
      setView('result')
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useShortcut('F8', () => void search(), view === 'cond')

  const cells = (l: Line): ReactNode[] => {
    const a = l.att
    const wm = a?.workMinutes ?? null
    switch (kind) {
      case 'status': return [hm(a?.clockIn ?? null), hm(a?.clockOut ?? null), wm != null ? hours(wm) : '']
      case 'late': return [hm(a?.clockIn ?? null), a?.enteredAt ? `${reportDate(a.enteredAt)} ${a.enteredAt.slice(11, 19)}` : '', a?.note ?? '']
      case 'daily': {
        const w = wm ?? 0
        return [hours(w), String(w), hours(STANDARD_MINUTES), String(STANDARD_MINUTES), hours(w - STANDARD_MINUTES), String(w - STANDARD_MINUTES)]
      }
      case 'integrated': return [hm(a?.clockIn ?? null), hm(a?.clockOut ?? null), wm != null ? String(wm) : '', l.leave, a?.note ?? '', l.events]
    }
  }
  const numericFrom = kind === 'daily' ? 2 : kind === 'status' ? 4 : kind === 'integrated' ? 4 : 99
  const numericTo = kind === 'integrated' ? 4 : 99

  /** 원본 라디오 줄(◉전체 ◯내근 ◯외근) */
  const radios = (label: string, value: string, set: (v: string) => void, opts: string[]) => (
    <li key={label}>
      <div className="title">{label}</div>
      <div className="form flex-wrap gap-x-[12px]" role="radiogroup" aria-label={label}>
        {opts.map((o) => (
          <label key={o} className="inline-flex items-center gap-[4px] cursor-pointer">
            <input type="radio" name={`${kind}-${label}`} checked={value === o} onChange={() => set(o)} />{o}
          </label>
        ))}
      </div>
    </li>
  )
  /** 원본 체크칸 줄 — 처음엔 모두 켜짐, [전체] 는 나머지를 같이 켜고 끈다. */
  const checks = (label: string, value: Set<string>, set: (v: Set<string>) => void, opts: readonly string[]) => (
    <li key={label}>
      <div className="title">{label}</div>
      <div className="form flex-wrap gap-x-[12px]" aria-label={label}>
        {opts.map((o) => (
          <label key={o} className="inline-flex items-center gap-[4px] cursor-pointer">
            <input type="checkbox" checked={value.has(o)} onChange={(e) => {
              const n = new Set(value)
              if (o === '전체') { if (e.target.checked) opts.forEach((x) => n.add(x)); else n.clear() }
              else { if (e.target.checked) n.add(o); else { n.delete(o); n.delete('전체') } }
              if (opts.slice(1).every((x) => n.has(x))) n.add('전체')
              set(n)
            }} />{o}
          </label>
        ))}
      </div>
    </li>
  )
  const text = (label: string, value: string, set: (v: string) => void) => (
    <li key={label}>
      <div className="title">{label}</div>
      <div className="form"><input className="ec-input flex-1" aria-label={label} value={value} onChange={(e) => set(e.target.value)} /></div>
    </li>
  )

  const conds = useMemo(() => {
    const list: ReactNode[] = [
      <li key="기간" className="wide">
        <div className="title">기간</div>
        <div className="form">
          <input type="date" className="ec-input w-[140px]" aria-label="기간 부터" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-ec-label">~</span>
          <input type="date" className="ec-input w-[140px]" aria-label="기간 까지" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </li>,
      text('사원명', empName, setEmpName),
      text('부서', dept, setDept),
    ]
    if (kind === 'status') {
      list.push(radios('내/외근구분', inOut, setInOut, ['전체', '내근', '외근']))
      list.push(
        <li key="기타">
          <div className="title">기타</div>
          <div className="form">
            <label className="inline-flex items-center gap-[4px] cursor-pointer">
              <input type="checkbox" aria-label="모든날짜검색" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} />모든날짜검색
            </label>
          </div>
        </li>)
    }
    if (kind === 'integrated') {
      list.push(radios('내/외근구분', inOut, setInOut, ['전체', '내근', '외근']))
      list.push(checks('근태구분', attKinds, setAttKinds, ATT_KINDS))
      list.push(radios('근무구분', dayKind, setDayKind, ['전체', '업무일', '휴일']))
      list.push(text('프로젝트', project, setProject))
      list.push(text('근태항목', attItem, setAttItem))
      list.push(text('휴가항목', leaveItem, setLeaveItem))
      // 근태그룹 · 상태(결재중 · UserPay · 확인)는 원본 칸 그대로 두되, 우리 출퇴근 기록에는 그 값이 없어 거르지 않는다.
      list.push(text('근태그룹', attGroup, setAttGroup))
      list.push(text('적요', remark, setRemark))
      list.push(checks('상태', states, setStates, STATES))
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, from, to, empName, dept, inOut, allDates, attKinds, dayKind, project, attItem, leaveItem, attGroup, remark, states])

  const heads = HEADS[kind]
  return (
    <EcListShell title={title} searchable={view === 'result'} onSearch={() => setView('cond')}
                 actions={view === 'result' ? [{ label: '인쇄' }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {view === 'cond' ? (
        <div>
          <ul className="flex list-none m-0 p-0 mb-[6px] border-0 border-b border-solid border-ec-line" aria-label="조건 탭">
            <li className="border-0 border-b-[1.5px] border-solid border-ec-blue">
              <span className="inline-block text-[12px] py-[9.9px] px-[11.7px] text-ec-blue font-bold">기본</span>
            </li>
          </ul>
          <ul className="ec-form">{conds}</ul>
          <div className="flex flex-wrap items-center gap-[6px] mt-[8px]">
            <button type="button" className="ec-btn" aria-label="양식">기본(수정불가)</button>
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
            <EcPeriodPicks labels={PICKS[kind]} currentFrom={from} onPick={(r) => { if (r.from) setFrom(r.from); setTo(r.to) }} />
            <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
          </div>
        </div>
      ) : (
        <>
          <EcReportHead title={title} period={reportPeriod(shown.from, shown.to)} />
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>{heads.map((h, i) => <th key={h} className={i >= numericFrom && i <= numericTo ? 'text-right' : ''}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={heads.length} className="text-center">등록된 데이터가 없습니다.</td></tr>
              ) : lines.map((l) => (
                <tr key={l.key}>
                  <td>{reportDate(l.date)}</td>
                  <td>{l.name}</td>
                  {cells(l).map((c, i) => <td key={i} className={i + 2 >= numericFrom && i + 2 <= numericTo ? 'text-right' : ''}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <EcReportFoot />
        </>
      )}
    </EcListShell>
  )
}

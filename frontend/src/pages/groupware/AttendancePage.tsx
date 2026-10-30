import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { ymd } from '../../components/EcPeriodPicks'
import type { Attendance } from '../../types/api'
import { useAuth } from '../../features/auth/AuthContext'
import AttendanceRecordModal, { type AttendanceRecordBody } from '../../features/attendance/components/AttendanceRecordModal'
import EcIcon from '../../components/ui/EcIcon'

const TITLE = '출/퇴근기록부(ID)'
const DOW = ['일', '월', '화', '수', '목', '금', '토']

const fmtMin = (m: number | null) => {
  if (m == null) return ''
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}
const hm = (t: string | null) => (t ? t.slice(0, 5) : '--:--')

/**
 * 그룹웨어 > 업무관리 > 출/퇴근 > 출/퇴근기록부(ID) (이카운트 E070305)
 *
 * <p>원본(2026-10-14 실측 — plans/그룹웨어/E070305.md): 제목줄 [Option][도움말], 알약 [사용자][전체](사용자 켜짐), 연 ▾ · 월 ▾,
 * 일 ~ 토 월 달력. <b>하단 버튼줄도 '오늘 근무' 판도 없다</b> — 출퇴근은 <b>날짜 칸을 눌러</b> 뜨는 '출/퇴근기록부' 창
 * (장소 · ☐외근 · 시간 · ☐오전반차설정 · 사유 · [출근][닫기])에서 찍는다. 지난날 칸도 같은 창이 뜬다.
 * 예전 우리 화면은 '오늘 근무' 판(출근하기 · 퇴근하기 — 지금 시각만)과 하단 [Excel][인쇄] 가 더 있었다.
 */
export default function AttendancePage() {
  const [rows, setRows] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(() => new Date())
  const { user } = useAuth()
  /** 원본 위쪽 알약 [사용자][전체] — <b>사용자(나)</b>가 기본이다. */
  const [scope, setScope] = useState<'사용자' | '전체'>('사용자')
  const [helpOpen, setHelpOpen] = useState(false)
  /** 누른 날 — 기록 창이 열린다. */
  const [picked, setPicked] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setRows((await api.get<Attendance[]>('/attendances')).data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  /** 창의 [출근] · [퇴근] — 누른 날 · 고른 시각으로 넣고 달력을 다시 읽는다. 실패하면 창이 오류를 띄운다. */
  async function record(body: AttendanceRecordBody) {
    await api.post('/attendances/record', body)
    setPicked(null)
    void load()
  }

  const mine = (r: Attendance) => r.username === user?.username
  const shown = rows.filter((r) => scope === '전체' || mine(r))

  /** 날짜 → 그날 기록. 달력 칸마다 훑지 않도록 한 번만 묶는다. */
  const byDate = new Map<string, Attendance[]>()
  shown.forEach((r) => {
    const list = byDate.get(r.workDate)
    if (list) list.push(r); else byDate.set(r.workDate, [r])
  })

  /** 그 달을 감싸는 일요일 시작 6주 격자 — 원본 달력도 일~토다. */
  const weeks = (() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first)
    start.setDate(1 - first.getDay())
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const x = new Date(start)
        x.setDate(start.getDate() + w * 7 + d)
        return x
      }))
  })()
  const todayKey = ymd(new Date())

  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '출퇴근', [])

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star mr-[4px]"><EcIcon name="star-outline" size={13} glyph="☆" /></span>
        <span className="text-[15px] font-extrabold text-ec-text">출/퇴근기록부(ID)</span>
        <div className="ml-auto flex items-center gap-[4px]">
          {/* 원본 제목 줄에는 [Option][도움말] 뿐이다. Option 판(설정 화면)은 받쳐 줄 설정이 없어 모양만 둔다. */}
          <button className="ec-btn">Option</button>
          <button className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/* 원본: 알약 [사용자][전체], 그 아래 연 · 월 고르기 — 달력 바로 위 */}
      <div className="ec-pills mb-[6px]">
        {(['사용자', '전체'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${scope === t ? ' active' : ''}`} onClick={() => setScope(t)}>{t}</button>
        ))}
      </div>
      <div className="flex items-center gap-[6px] mb-[6px]">
        <select className="ec-input w-[80px]" aria-label="연" value={cursor.getFullYear()}
                onChange={(e) => setCursor(new Date(Number(e.target.value), cursor.getMonth(), 1))}>
          {Array.from({ length: 11 }, (_, k) => new Date().getFullYear() - 5 + k).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="ec-input w-[64px]" aria-label="월" value={cursor.getMonth() + 1}
                onChange={(e) => setCursor(new Date(cursor.getFullYear(), Number(e.target.value) - 1, 1))}>
          {Array.from({ length: 12 }, (_, k) => k + 1).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="flex-1 min-h-0">
        <table ref={tableRef} className="w-full text-left">
          <colgroup>{DOW.map((d) => <col key={d} className="w-[14.28%]" />)}</colgroup>
          <thead>
            <tr>
              {DOW.map((d) => (
                <th key={d} className="text-center">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day) => {
                  const key = ymd(day)
                  const otherMonth = day.getMonth() !== cursor.getMonth()
                  const list = byDate.get(key) ?? []
                  return (
                    // 원본: 그 달 밖의 칸은 숫자 없이 회색, 오늘 칸은 옅은 파랑. 그 달 칸(td calItem cursor-pointer)을 누르면 기록 창.
                    <td key={key} data-date={otherMonth ? undefined : key}
                        className={`align-top h-[62px] p-[2.7px] ${otherMonth ? 'bg-ec-disabled' : `cursor-pointer ${key === todayKey ? 'bg-ec-blue-wash' : ''}`}`}
                        onClick={otherMonth ? undefined : () => setPicked(key)}>
                      {!otherMonth && <div className="text-[12px] mb-[3px] text-ec-ink">{day.getDate()}</div>}
                      {!otherMonth && list.map((r) => (
                        <div key={r.id} className="text-[11.5px] leading-[1.5] whitespace-nowrap overflow-hidden text-ellipsis">
                          <span className="text-ec-label">{r.userName}</span>{' '}
                          <span className={r.late ? 'text-ec-danger' : undefined}>{hm(r.clockIn)}</span>
                          <span className="text-ec-off">~</span>
                          <span>{hm(r.clockOut)}</span>
                          {r.workMinutes != null && (
                            <span className="text-ec-label"> ({fmtMin(r.workMinutes)})</span>
                          )}
                        </div>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="text-center text-ec-ink p-[10px]">불러오는 중…</p>}
      </div>

      <AttendanceRecordModal date={picked} userName={user?.name ?? ''}
                             record={picked ? rows.find((r) => r.workDate === picked && mine(r)) ?? null : null}
                             onClose={() => setPicked(null)}
                             onSubmit={record} />

      {helpOpen && (
        <div className="ec-modal-back" onClick={() => setHelpOpen(false)}>
          <div role="dialog" aria-label={`${TITLE} · 도움말`} className="ec-modal w-[420px]" onClick={(e) => e.stopPropagation()}>
            <div className="ec-modal-bar">
              <span className="name">{TITLE} · 도움말</span>
              <button className="close" aria-label="닫기" onClick={() => setHelpOpen(false)}><EcIcon name="close" size={12} glyph="✕" /></button>
            </div>
            <ul className="pl-[16px] m-0 text-[12px] leading-[1.7]">
              <li>날짜 칸을 누르면 <b>출/퇴근기록부</b> 창이 뜹니다. 장소 · 시간 · 사유를 넣고 [출근] — 같은 날을 다시 누르면 [퇴근] 입니다.</li>
              <li>지난날도 같은 창에서 넣을 수 있습니다.</li>
              <li>정시(09:00)보다 늦게 출근하면 지각으로 칩니다(☐오전반차설정을 켠 날은 빼고).</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

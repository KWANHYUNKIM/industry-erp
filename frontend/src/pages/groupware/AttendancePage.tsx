import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import { ymd } from '../../components/EcPeriodPicks'
import type { Attendance } from '../../types/api'
import { useAuth } from '../../features/auth/AuthContext'

const TITLE = '출/퇴근기록부(ID)'
const DOW = ['일', '월', '화', '수', '목', '금', '토']

const fmtMin = (m: number | null) => {
  if (m == null) return ''
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}시간 ${mm}분`
}

/**
 * 그룹웨어 > 업무관리 > 출/퇴근 > 출/퇴근기록부(ID) (이카운트 E070305)
 *
 * 원본은 표가 아니라 <b>화면을 가득 채우는 월 달력</b>이다. 위에 [사용자] 필터와 연/월 선택이
 * 있고, 날짜 칸마다 그날의 출퇴근 기록이 들어간다(실측: 요일 칸 324px x 7 = 2268).
 * 우리는 일자·사용자·출근·퇴근·근무시간·지각 6컬럼 표였다 — 한 달을 한눈에 볼 수가 없었다.
 *
 * '오늘 근무' 카드(출근하기·퇴근하기)는 원본 이 화면에 없지만 남겨 둔다.
 * 우리 앱에서 출퇴근을 찍는 유일한 자리라, 없애면 기록을 만들 방법이 사라진다.
 */
export default function AttendancePage() {
  const [rows, setRows] = useState<Attendance[]>([])
  const [today, setToday] = useState<Attendance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(() => new Date())
  const { user } = useAuth()
  /**
   * 원본 위쪽 알약 [사용자][전체] — <b>사용자(나)</b>가 기본이다(2026-10-03 실측). 예전에는 사용자 드롭다운에
   * '전체' 가 기본이라 남의 기록까지 한 달력에 섞여 나왔다.
   */
  const [scope, setScope] = useState<'사용자' | '전체'>('사용자')

  // 표 내보내기/인쇄/검색 직접 배선
  const bodyRef = useRef<HTMLDivElement>(null)
  const [, setSearch] = useState('')
  const [optionOpen, setOptionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notice, setNotice] = useState('')


  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 2500)
  }

  // 렌더된 tbody 행을 텍스트 부분일치로 숨기는 클라이언트 필터
  const filterRows = (q: string) => {
    const table = findDataTable(bodyRef.current)
    if (!table) return
    const needle = q.trim().toLowerCase()
    let hit = 0
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const row = tr as HTMLTableRowElement
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) return
      const match = !needle || (row.textContent ?? '').toLowerCase().includes(needle)
      row.style.display = match ? '' : 'none'
      if (match) hit += 1
    })
    if (needle) flash(`'${q.trim()}' 검색결과 ${hit}건`)
  }

  async function doExcel() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 내보낼 표가 없습니다.')
    if (!(await exportTableToXlsx(table, TITLE))) flash('내보낼 자료가 없습니다.')
  }

  function doPrint() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 인쇄할 표가 없습니다.')
    if (!printTable(table, TITLE)) flash('인쇄할 자료가 없습니다.')
  }

  async function load() {
    setLoading(true)
    try {
      const [list, t] = await Promise.all([
        api.get<Attendance[]>('/attendances'),
        api.get<Attendance | ''>('/attendances/today'),
      ])
      setRows(list.data)
      setToday(t.data || null)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])


  /** 화면에 보이는 사용자 목록 — 조회된 기록에서 뽑는다(별도 요청 없음). */

  const shown = rows.filter((r) => scope === '전체' || r.userName === user?.name)

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

  async function punch(kind: 'clock-in' | 'clock-out') {
    setError('')
    try {
      await api.post(`/attendances/${kind}`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '출퇴근', [])

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">출/퇴근기록부(ID)</span>
        <div className="ml-auto flex items-center gap-[4px] relative">
          {/* 원본 제목 줄에는 [Option][도움말] 뿐이다 — 검색창·[새로고침]은 우리만 있던 것이라 뺐다. */}
          <button className="ec-btn" onClick={() => setOptionOpen((v) => !v)}>Option</button>
          <button className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>

          {optionOpen && (
            <>
              <div onClick={() => setOptionOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41, background: '#fff', border: '1px solid var(--ec-line)', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150, padding: 4 }}>
                {[
                  { label: 'Excel 내려받기', run: () => { void doExcel() } },
                  { label: '인쇄', run: () => doPrint() },
                  { label: '검색조건 초기화', run: () => { setSearch(''); filterRows('') } },
                ].map((m) => (
                  <button key={m.label} onClick={() => { setOptionOpen(false); m.run() }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, background: 'none', border: 0, cursor: 'pointer' }}>{m.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {/* 오늘 출퇴근 카드 */}
      <div className="flex items-center gap-[20px] border border-ec-line border-solid bg-white py-[14px] px-[18px] mb-[10px] flex-wrap">
        <div className="text-[13px] font-extrabold text-ec-navy">오늘 근무</div>
        <div className="flex gap-[24px] text-[13px]">
          <div><span className="text-ec-hint">출근</span> <b className="ml-[6px]">{today?.clockIn ?? '--:--'}</b></div>
          <div><span className="text-ec-hint">퇴근</span> <b className="ml-[6px]">{today?.clockOut ?? '--:--'}</b></div>
          <div><span className="text-ec-hint">근무시간</span> <b className="ml-[6px]">{fmtMin(today?.workMinutes ?? null) || '-'}</b></div>
          {today?.late && <span className="text-ec-danger font-bold">지각</span>}
        </div>
        <div className="ml-auto flex gap-[6px]">
          <button className="ec-btn ec-btn-primary" onClick={() => punch('clock-in')} disabled={!!today?.clockIn}>출근하기</button>
          <button className="ec-btn" onClick={() => punch('clock-out')} disabled={!today?.clockIn || !!today?.clockOut}>퇴근하기</button>
        </div>
      </div>

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

      <div ref={bodyRef} className="flex-1 min-h-0">
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
                    // 원본: 그 달 밖의 칸은 숫자 없이 회색, 오늘 칸은 옅은 파랑, 주말 색은 따로 없다(2026-10-03 실측).
                    <td key={key} className={`align-top h-[62px] p-[2.7px] ${otherMonth ? 'bg-ec-disabled' : key === todayKey ? 'bg-ec-blue-wash' : ''}`}>
                      {!otherMonth && <div className="text-[12px] mb-[3px] text-ec-ink">{day.getDate()}</div>}
                      {!otherMonth && list.map((r) => (
                        <div key={r.id} className="text-[11.5px] leading-[1.5] whitespace-nowrap overflow-hidden text-ellipsis">
                          <span className="text-ec-label">{r.userName}</span>{' '}
                          <span style={{ color: r.late ? 'var(--ec-danger)' : undefined }}>{r.clockIn ?? '--:--'}</span>
                          <span className="text-ec-off">~</span>
                          <span>{r.clockOut ?? '--:--'}</span>
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

      <div className="flex gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
        <button className="ec-btn" onClick={() => { void doExcel() }}>Excel</button>
        <button className="ec-btn" onClick={() => doPrint()}>인쇄</button>
      </div>

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 420, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
              <span>{TITLE} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div className="p-[14px] text-[12.5px] leading-[1.7] text-ec-text">
              <ul className="pl-[16px] m-0">
                <li>상단 <b>출근하기·퇴근하기</b> 버튼으로 오늘 근무를 기록합니다.</li>
                <li><b>Search(F3)</b> — 일자·사용자 등 입력한 낱말이 포함된 행만 추립니다.</li>
                <li><b>Excel/인쇄</b> — 지금 화면의 출퇴근 기록표를 파일로 내려받거나 인쇄합니다.</li>
                <li>정시보다 늦게 출근하면 <b>지각</b>으로 표시됩니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

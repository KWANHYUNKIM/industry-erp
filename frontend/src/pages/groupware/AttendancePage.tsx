import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import { ymd } from '../../components/EcPeriodPicks'
import type { Attendance } from '../../api/types'

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
  /** 사용자 필터. 빈 값이면 전체 — 원본 [사용자] 조건의 기본값이 '전체'다. */
  const [userFilter, setUserFilter] = useState('')

  // 표 내보내기/인쇄/검색 직접 배선
  const bodyRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
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

  const moveMonth = (d: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + d, 1))

  /** 화면에 보이는 사용자 목록 — 조회된 기록에서 뽑는다(별도 요청 없음). */
  const userNames = [...new Set(rows.map((r) => r.userName))].sort()

  const shown = rows.filter((r) => !userFilter || r.userName === userFilter)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>출/퇴근기록부(ID)</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
          <button className="ec-btn" onClick={load}>새로고침</button>
          <input
            className="ec-input"
            placeholder="입력 후 [Enter]"
            value={search}
            onChange={(e) => { setSearch(e.target.value); filterRows(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') filterRows(search) }}
            style={{ width: 150 }}
          />
          <button className="ec-btn ec-btn-primary" onClick={() => filterRows(search)}>Search(F3)</button>
          <button className="ec-btn" onClick={() => setOptionOpen((v) => !v)}>Option</button>
          <button className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>

          {optionOpen && (
            <>
              <div onClick={() => setOptionOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41, background: '#fff', border: '1px solid #c9d1da', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150, padding: 4 }}>
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

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {/* 오늘 출퇴근 카드 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, border: '1px solid var(--ec-border)', background: '#fff', padding: '14px 18px', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)' }}>오늘 근무</div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
          <div><span style={{ color: '#8a929c' }}>출근</span> <b style={{ marginLeft: 6 }}>{today?.clockIn ?? '--:--'}</b></div>
          <div><span style={{ color: '#8a929c' }}>퇴근</span> <b style={{ marginLeft: 6 }}>{today?.clockOut ?? '--:--'}</b></div>
          <div><span style={{ color: '#8a929c' }}>근무시간</span> <b style={{ marginLeft: 6 }}>{fmtMin(today?.workMinutes ?? null) || '-'}</b></div>
          {today?.late && <span style={{ color: '#c60a2e', fontWeight: 700 }}>지각</span>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="ec-btn ec-btn-primary" onClick={() => punch('clock-in')} disabled={!!today?.clockIn}>출근하기</button>
          <button className="ec-btn" onClick={() => punch('clock-out')} disabled={!today?.clockIn || !!today?.clockOut}>퇴근하기</button>
        </div>
      </div>

      {/* 조회 조건 — 원본은 [사용자] 와 연/월이 달력 위에 있다 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--ec-label)' }}>사용자</span>
        <select className="ec-input" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={{ width: 150 }}>
          <option value="">전체</option>
          {userNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span style={{ marginLeft: 12 }}>
          <button className="ec-btn ec-btn-sm" onClick={() => moveMonth(-1)} aria-label="이전 달">‹</button>
          <span style={{ margin: '0 10px', fontSize: 12 }}>
            {cursor.getFullYear()} / {String(cursor.getMonth() + 1).padStart(2, '0')}
          </span>
          <button className="ec-btn ec-btn-sm" onClick={() => moveMonth(1)} aria-label="다음 달">›</button>
          <button className="ec-btn ec-btn-sm" style={{ marginLeft: 6 }} onClick={() => setCursor(new Date())}>이번 달</button>
        </span>
      </div>

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0 }}>
        <table className="w-full text-left">
          <colgroup>{DOW.map((d) => <col key={d} style={{ width: '14.28%' }} />)}</colgroup>
          <thead>
            <tr>
              {DOW.map((d, i) => (
                <th key={d} style={{ textAlign: 'center', color: i === 0 ? '#c60a2e' : i === 6 ? 'var(--ec-blue)' : undefined }}>{d}</th>
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
                    <td key={key} style={{ verticalAlign: 'top', height: 92, padding: 4, background: otherMonth ? '#fafbfc' : undefined }}>
                      <div style={{
                        fontSize: 12, marginBottom: 3,
                        color: otherMonth ? '#c8ced6'
                          : day.getDay() === 0 ? '#c60a2e'
                          : day.getDay() === 6 ? 'var(--ec-blue)' : 'var(--ec-text-grid)',
                        fontWeight: key === todayKey ? 700 : 400,
                      }}>
                        {day.getDate()}
                      </div>
                      {list.map((r) => (
                        <div key={r.id} style={{ fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ color: 'var(--ec-label)' }}>{r.userName}</span>{' '}
                          <span style={{ color: r.late ? '#c60a2e' : undefined }}>{r.clockIn ?? '--:--'}</span>
                          <span style={{ color: '#c8ced6' }}>~</span>
                          <span>{r.clockOut ?? '--:--'}</span>
                          {r.workMinutes != null && (
                            <span style={{ color: 'var(--ec-label)' }}> ({fmtMin(r.workMinutes)})</span>
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
        {loading && <p style={{ textAlign: 'center', color: 'var(--ec-text-grid)', padding: 10 }}>불러오는 중…</p>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        <button className="ec-btn" onClick={() => { void doExcel() }}>Excel</button>
        <button className="ec-btn" onClick={() => doPrint()}>인쇄</button>
      </div>

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 420, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>{TITLE} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <ul style={{ paddingLeft: 16, margin: 0 }}>
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

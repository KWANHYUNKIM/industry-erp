import { useRef, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useDeptGroups } from '../../utils/deptGroups'

/**
 * 관리 > 일별근무시간 (이카운트 E070309 일별근무시간(ID))
 * 한 달치 근태를 사원 행 × 일자 열의 타임시트 매트릭스로 펼친다. 셀 = 그날 근무시간.
 * 근태조회(AttendanceListPage)가 전표 한 줄씩 나열하는 데 반해, 이 화면은 월 단위 근무시간을 한눈에 본다.
 * 백엔드 무변경 — `/api/hr/attendance?from&to` 가 이미 서버에서 계산한 workHours·status 를 반환한다.
 */
interface AttendanceRow {
  id: number; date: string; empName: string; department: string | null
  clockIn: string | null; clockOut: string | null; workHours: number; status: string; note: string | null
}

const monthNow = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
/** 근무시간 표시: 정수면 그대로, 소수면 1자리 */
const hh = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
/** 상태별 셀 색 — 지각/조퇴/결근을 시각적으로 구분 */
function cellColor(status: string): string | undefined {
  if (status === '지각' || status === '조퇴') return 'var(--ec-warn)'
  if (status === '결근') return 'var(--ec-danger)'
  return undefined
}

export default function DailyWorkHoursPage() {
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [month, setMonth] = useState(monthNow())
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 조건은 <b>[사원명]과 [부서]가 따로</b>다. 우리는 한 칸으로 둘을 함께 훑어서
   * "김" 을 치면 <b>김씨 사원과 김포지점이 같이</b> 걸렸다 — 부서로만 좁힐 수가 없었다.
   */
  const [deptCond, setDeptCond] = useState('')
  /**
   * 원본 [부서계층그룹] — [부서]가 그 부서 하나라면 이쪽은 <b>그 부서와 그 아래 전부</b>다.
   * 예외에 '부서를 계층으로 묶지 않는다 — 평면이다' 라고 적혀 있었으나 사실이 아니었다.
   */
  const { groups: deptGroups, inGroup } = useDeptGroups()
  const [deptGroup, setDeptGroup] = useState('')
  /*
   * 원본 조건 <b>[정렬/소계기준]</b> — 줄을 무엇으로 묶을지 고른다(사본 실측).
   * 표는 사람마다 한 줄이라, 부서가 그 달에 <b>몇 시간을 썼나</b> 는 눈으로 더해야 했다.
   * 부서로 묶으면 한 칸에 여러 사람이 겹치므로 그때는 <b>시간 합만</b> 찍는다 —
   * 지각·결근 색은 사람의 것이지 부서의 것이 아니다.
   */
  const SUBTOTALS = ['사원', '부서'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('사원')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [year, mon] = month.split('-').map(Number)
  const daysInMonth = new Date(year, mon, 0).getDate()
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])

  async function load() {
    setLoading(true); setError('')
    try {
      const from = `${month}-01`
      const to = `${month}-${String(daysInMonth).padStart(2, '0')}`
      const res = await api.get<AttendanceRow[]>('/hr/attendance', { params: { from, to } })
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [month])

  /**
   * 고른 축별 { 일 → 그날 } 로 인덱싱.
   *
   * <p>한 칸에 <b>여러 줄이 겹칠 수 있다</b>(부서로 묶을 때). 그래서 시간은 <code>hours</code>
   * 로 더해 두고, 원본 줄은 <b>한 줄일 때만</b> 들고 있는다 — 지각·결근 색과 출퇴근 시각은
   * 그 사람 것이라 여럿을 겹쳐 놓으면 아무 뜻이 없다.
   */
  const matrix = useMemo(() => {
    interface Cell { hours: number; only: AttendanceRow | null; n: number }
    const 묶음 = new Map<string, { empName: string; department: string | null; byDay: Map<number, Cell>; total: number; workDays: number }>()
    const 걸린것 = rows
      .filter((r) => !keyword || r.empName.includes(keyword))
      .filter((r) => !deptCond || (r.department ?? '').includes(deptCond))
      .filter((r) => inGroup(r.department, deptGroup))
    for (const r of 걸린것) {
      const day = Number(r.date.slice(8, 10))
      /* 부서가 안 적힌 줄을 빈 이름으로 묶으면 누구 것인지 모르는 덩어리가 된다. */
      const key = subtotal === '부서' ? (r.department ?? '(미지정)') : r.empName
      const cur = 묶음.get(key)
        ?? { empName: key, department: subtotal === '부서' ? null : r.department, byDay: new Map<number, Cell>(), total: 0, workDays: 0 }
      const cell = cur.byDay.get(day) ?? { hours: 0, only: null, n: 0 }
      cell.hours += r.workHours
      cell.n += 1
      cell.only = cell.n === 1 ? r : null
      cur.byDay.set(day, cell)
      cur.total += r.workHours
      if (r.status !== '결근') cur.workDays += 1
      묶음.set(key, cur)
    }
    return [...묶음.values()].sort((a, b) => a.empName.localeCompare(b.empName, 'ko'))
  }, [rows, keyword, deptCond, deptGroup, inGroup, subtotal])

  /** 일자별 총 근무시간(하단 합계행) */
  const dayTotals = useMemo(() => {
    const t = new Map<number, number>()
    for (const e of matrix) for (const [day, c] of e.byDay) t.set(day, (t.get(day) ?? 0) + c.hours)
    return t
  }, [matrix])
  const grandTotal = useMemo(() => matrix.reduce((s, e) => s + e.total, 0), [matrix])

  const thBase: React.CSSProperties = { position: 'sticky', top: 0, background: 'var(--ec-bg-page)', zIndex: 1, whiteSpace: 'nowrap' }
  const nameCol: React.CSSProperties = { position: 'sticky', left: 0, background: '#fff', zIndex: 1, whiteSpace: 'nowrap', minWidth: 90 }

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일별근무시간', [month, days.length, rows.length])

  return (
    <EcListShell title="일별근무시간(ID)" search={keyword} onSearchChange={setKeyword} onSearch={load}
      onNew={undefined} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px] text-ec-label">
        {/* 원본은 이 줄을 <b>[기간]</b> 이라 부른다(사본 실측) — 달로 고르는 것은 우리 방식이다. */}
        <span>기간</span>
        <input type="month" className="ec-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 160 }} />
        {/* 원본 차례: 기간 · <b>사원명 · 부서</b> (사본 실측) */}
        <span className="ml-[8px]">사원명</span>
        <input className="ec-input" placeholder="사원명 일부" value={keyword}
               onChange={(e) => setKeyword(e.target.value)} style={{ width: 120 }} />
        <span className="ml-[8px]">부서</span>
        <input className="ec-input" placeholder="부서 일부" value={deptCond}
               onChange={(e) => setDeptCond(e.target.value)} style={{ width: 120 }} />
        {/* 원본 차례: [부서] 바로 다음이다(사본 실측). */}
        <span className="ml-[8px]">부서계층그룹</span>
        <select className="ec-input" value={deptGroup} style={{ width: 130 }}
                onChange={(e) => setDeptGroup(e.target.value)}>
          <option value="">전체</option>
          {deptGroups.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        {/* 원본 차례: 조건 판 <b>맨 끝</b>이다(사본 실측). */}
        <span className="ml-[8px]">정렬/소계기준</span>
        <div className="ec-pills">
          {SUBTOTALS.map((v) => (
            <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                    onClick={() => setSubtotal(v)}>{v}</button>
          ))}
        </div>
        <span className="ml-[8px] text-ec-hint">셀 = 그날 근무시간(h) · <span className="text-ec-warn">지각/조퇴</span> · <span className="text-ec-danger">결근</span></span>
        <span className="ml-auto text-[12.5px]">
          {subtotal} <b className="text-ec-text">{matrix.length}</b>{subtotal === '부서' ? '개' : '명'}
          <span className="my-0 mx-[6px] text-ec-off">|</span>
          총 근무시간 <b className="text-ec-blue text-[14px]">{hh(grandTotal)}</b>h
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="overflow-x-auto border border-ec-line border-solid">
        <table ref={tableRef} className="w-full text-left border-collapse text-[12px]">
          <thead>
            <tr>
              <th style={{ ...thBase, ...nameCol, left: 0 }}>{subtotal}</th>
              <th style={{ ...thBase, position: 'sticky', left: 90, background: 'var(--ec-bg-page)', whiteSpace: 'nowrap' }}>부서</th>
              {days.map((d) => {
                const dow = new Date(year, mon - 1, d).getDay()
                const wk = dow === 0 ? 'var(--ec-danger)' : dow === 6 ? '#1c6fb5' : 'var(--ec-text-hint)'
                return <th key={d} style={{ ...thBase, textAlign: 'center', width: 30, color: wk }}>{d}</th>
              })}
              <th style={{ ...thBase, textAlign: 'right', color: 'var(--ec-blue)' }}>합계</th>
              <th style={{ ...thBase, textAlign: 'right' }}>근무일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={days.length + 4} className="ec-empty">불러오는 중…</td></tr>
            ) : matrix.length === 0 ? (
              <tr><td colSpan={days.length + 4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : matrix.map((e) => (
              <tr key={e.empName}>
                <td style={{ ...nameCol, fontWeight: 600 }}>{e.empName}</td>
                <td className="whitespace-nowrap text-ec-label">{e.department ?? ''}</td>
                {days.map((d) => {
                  const c = e.byDay.get(d)
                  const r = c?.only ?? null
                  return (
                    <td key={d} title={r ? `${r.clockIn ?? ''}~${r.clockOut ?? ''} (${r.status})` : c ? `${c.n}명` : ''}
                      style={{ textAlign: 'center', color: c ? (r ? cellColor(r.status) : 'var(--ec-label)') : '#dfe3e8', fontWeight: r && cellColor(r.status) ? 700 : 400 }}>
                      {c ? (r && r.status === '결근' ? '결' : hh(c.hours)) : '·'}
                    </td>
                  )
                })}
                <td className="text-right font-bold text-ec-blue">{hh(e.total)}</td>
                <td className="text-right">{e.workDays}</td>
              </tr>
            ))}
          </tbody>
          {matrix.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-ec-page">
                <td style={{ ...nameCol, background: 'var(--ec-bg-page)' }}>일계</td>
                <td></td>
                {days.map((d) => <td key={d} className="text-center text-ec-label">{dayTotals.has(d) ? hh(dayTotals.get(d)!) : ''}</td>)}
                <td className="text-right text-ec-blue">{hh(grandTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}

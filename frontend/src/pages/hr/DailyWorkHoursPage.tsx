import { useRef, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

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
  if (status === '지각' || status === '조퇴') return '#c07a00'
  if (status === '결근') return '#c60a2e'
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

  /** 사원별 { 일 → row } 로 인덱싱 */
  const matrix = useMemo(() => {
    const byEmp = new Map<string, { empName: string; department: string | null; byDay: Map<number, AttendanceRow>; total: number; workDays: number }>()
    for (const r of rows) {
      const day = Number(r.date.slice(8, 10))
      const cur = byEmp.get(r.empName) ?? { empName: r.empName, department: r.department, byDay: new Map(), total: 0, workDays: 0 }
      cur.byDay.set(day, r)
      cur.total += r.workHours
      if (r.status !== '결근') cur.workDays += 1
      byEmp.set(r.empName, cur)
    }
    return [...byEmp.values()]
      .filter((e) => !keyword || e.empName.includes(keyword))
      .filter((e) => !deptCond || (e.department ?? '').includes(deptCond))
      .sort((a, b) => a.empName.localeCompare(b.empName, 'ko'))
  }, [rows, keyword, deptCond])

  /** 일자별 총 근무시간(하단 합계행) */
  const dayTotals = useMemo(() => {
    const t = new Map<number, number>()
    for (const e of matrix) for (const [day, r] of e.byDay) t.set(day, (t.get(day) ?? 0) + r.workHours)
    return t
  }, [matrix])
  const grandTotal = useMemo(() => matrix.reduce((s, e) => s + e.total, 0), [matrix])

  const thBase: React.CSSProperties = { position: 'sticky', top: 0, background: '#f5f7fa', zIndex: 1, whiteSpace: 'nowrap' }
  const nameCol: React.CSSProperties = { position: 'sticky', left: 0, background: '#fff', zIndex: 1, whiteSpace: 'nowrap', minWidth: 90 }

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일별근무시간', [month, days.length, rows.length])

  return (
    <EcListShell title="일별근무시간(ID)" search={keyword} onSearchChange={setKeyword} onSearch={load}
      onNew={undefined} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        {/* 원본은 이 줄을 <b>[기간]</b> 이라 부른다(사본 실측) — 달로 고르는 것은 우리 방식이다. */}
        <span>기간</span>
        <input type="month" className="ec-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 160 }} />
        {/* 원본 차례: 기간 · <b>사원명 · 부서</b> (사본 실측) */}
        <span style={{ marginLeft: 8 }}>사원명</span>
        <input className="ec-input" placeholder="사원명 일부" value={keyword}
               onChange={(e) => setKeyword(e.target.value)} style={{ width: 120 }} />
        <span style={{ marginLeft: 8 }}>부서</span>
        <input className="ec-input" placeholder="부서 일부" value={deptCond}
               onChange={(e) => setDeptCond(e.target.value)} style={{ width: 120 }} />
        <span style={{ marginLeft: 8, color: '#9aa1ab' }}>셀 = 그날 근무시간(h) · <span style={{ color: '#c07a00' }}>지각/조퇴</span> · <span style={{ color: '#c60a2e' }}>결근</span></span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5 }}>
          사원 <b style={{ color: '#3c4553' }}>{matrix.length}</b>명
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          총 근무시간 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{hh(grandTotal)}</b>h
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ overflowX: 'auto', border: '1px solid var(--ec-border)' }}>
        <table ref={tableRef} className="w-full text-left" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...thBase, ...nameCol, left: 0 }}>사원</th>
              <th style={{ ...thBase, position: 'sticky', left: 90, background: '#f5f7fa', whiteSpace: 'nowrap' }}>부서</th>
              {days.map((d) => {
                const dow = new Date(year, mon - 1, d).getDay()
                const wk = dow === 0 ? '#c60a2e' : dow === 6 ? '#1c6fb5' : '#8a929c'
                return <th key={d} style={{ ...thBase, textAlign: 'center', width: 30, color: wk }}>{d}</th>
              })}
              <th style={{ ...thBase, textAlign: 'right', color: 'var(--ec-blue)' }}>합계</th>
              <th style={{ ...thBase, textAlign: 'right' }}>근무일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={days.length + 4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : matrix.length === 0 ? (
              <tr><td colSpan={days.length + 4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : matrix.map((e) => (
              <tr key={e.empName}>
                <td style={{ ...nameCol, fontWeight: 600 }}>{e.empName}</td>
                <td style={{ whiteSpace: 'nowrap', color: '#5a626e' }}>{e.department ?? ''}</td>
                {days.map((d) => {
                  const r = e.byDay.get(d)
                  return (
                    <td key={d} title={r ? `${r.clockIn ?? ''}~${r.clockOut ?? ''} (${r.status})` : ''}
                      style={{ textAlign: 'center', color: r ? cellColor(r.status) : '#dfe3e8', fontWeight: r && cellColor(r.status) ? 700 : 400 }}>
                      {r ? (r.status === '결근' ? '결' : hh(r.workHours)) : '·'}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ec-blue)' }}>{hh(e.total)}</td>
                <td style={{ textAlign: 'right' }}>{e.workDays}</td>
              </tr>
            ))}
          </tbody>
          {matrix.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td style={{ ...nameCol, background: '#f7f9fb' }}>일계</td>
                <td></td>
                {days.map((d) => <td key={d} style={{ textAlign: 'center', color: '#5a626e' }}>{dayTotals.has(d) ? hh(dayTotals.get(d)!) : ''}</td>)}
                <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{hh(grandTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}

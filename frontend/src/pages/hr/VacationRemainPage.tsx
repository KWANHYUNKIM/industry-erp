import { useEffect, useMemo, useState } from 'react'
import { subtotalBy } from '../../utils/subtotalBy'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'

/**
 * 관리 > 휴가잔여일수현황 — 사원별 부여·사용 일수 및 잔여 연차 (/api/hr/vacations/summary).
 *
 * <p>원본 열 실측(사본): <b>휴가명</b> · 부서명 · 성명 · 휴가일수 · 휴가사용일수 · 휴가잔여일수.
 * 줄 값이 '연차(2026년)' 이다.
 *
 * <p>이 화면은 원래부터 <b>연도별</b>로 센다 — 서버가 그 해에 시작한 휴가만 사용일수에 넣는다.
 * 그런데 화면이 연도를 보내지도 보여 주지도 않아서, <b>지금 보는 숫자가 몇 년치인지
 * 알 방법이 없었다.</b> 원본의 [휴가명] 열이 바로 그 값이라 함께 붙인다.
 */
interface Row {
  /** 휴가명 — '연차(2026년)'. 계산에 쓴 연도를 서버가 적어 보낸다. */
  leaveName: string
  empName: string
  department: string | null
  /** 재직 여부. 원본의 [재직구분] 조건이 이 값을 본다. */
  active: boolean
  totalDays: number
  usedDays: number
  remainingDays: number
}

/** 원본 [재직구분]. 값은 서버가 그대로 받는다. */
const EMPLOYMENTS = [['ACTIVE', '재직자'], ['RESIGNED', '퇴사자'], ['ALL', '전체']] as const

export default function VacationRemainPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emp, setEmp] = useState('')
  const [dept, setDept] = useState('')
  /**
   * 표시 자릿수. 원본은 15.000 · 9.375 처럼 <b>소수 3자리</b>로 보여 준다.
   * 시간 단위 휴가가 0.125일(1시간)씩 쌓이므로 1자리로 줄이면 합이 안 맞는다 —
   * 실제로 서버가 1자리로 반올림하던 시절 사용 0.1 · 잔여 14.9 로 나와 더해도 15가 아니었다.
   */
  const [decimals, setDecimals] = useState(3)
  const [employment, setEmployment] = useState<'ACTIVE' | 'RESIGNED' | 'ALL'>('ACTIVE')
  /** 기준연도. 서버는 진작 받고 있었는데 화면이 안 보내서 늘 올해로만 보였다. */
  const [year, setYear] = useState(new Date().getFullYear())

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Row[]>('/hr/vacations/summary', { params: { employment, year } })
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [employment, year])

  /*
   * 원본 조건 판 실측(사본): 휴가코드 · 사원 · 부서 · 프로젝트 · 적요 · 상태 · 재직구분 ·
   * [기타] 사용중단휴가코드포함 · 정렬/소계기준 · 소수점
   * 잔여일수 응답은 사원·부서·일수만 주므로 거를 수 있는 것이 사원·부서뿐이다.
   * '소수점'은 반차 때문에 .5 가 나오는 자리라 원본에도 따로 있다 — 끄면 반올림해 보여 준다.
   */
  /*
   * 원본 [정렬/소계기준]. 줄은 사원마다 하나라, 사람이 많은 회사에서는
   * <b>부서별로 얼마가 남았는지</b>를 눈으로 더해야 했다. 연차 소진 독려는
   * 대개 부서 단위로 한다.
   */
  const SUBTOTALS = ['부서', '휴가명'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('부서')

  const shown = rows.filter((r) => {
    if (emp && !r.empName.includes(emp)) return false
    if (dept && !(r.department ?? '').includes(dept)) return false
    return true
  })
  const days = (n: number) => n.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })
  const groups = useMemo(() => subtotalBy(shown,
    (r) => (subtotal === '휴가명' ? r.leaveName : r.department),
    { total: (r) => r.totalDays, used: (r) => r.usedDays, remain: (r) => r.remainingDays }),
  [shown, subtotal])

  const totals = shown.reduce(
    (a, r) => ({ total: a.total + r.totalDays, used: a.used + r.usedDays, remain: a.remain + r.remainingDays }),
    { total: 0, used: 0, remain: 0 },
  )

  return (
    <EcListShell
      title="휴가잔여일수현황"
      searchable={false}
      onNew={undefined}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => {
          setEmp(''); setDept(''); setDecimals(3); setEmployment('ACTIVE')
          setYear(new Date().getFullYear())
        } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준연도">
          <select className="ec-input" style={{ width: 110 }} value={year}
                  onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </EcCond>
        <EcCond label="사원" pick>
          <input className="ec-input" placeholder="사원명 일부" value={emp}
                 onChange={(e) => setEmp(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="부서" pick>
          <input className="ec-input" placeholder="부서명 일부" value={dept}
                 onChange={(e) => setDept(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="재직구분">
          <div className="ec-pills">
            {EMPLOYMENTS.map(([v, label]) => (
              <button key={v} type="button" className={`ec-pill no-ec${employment === v ? ' active' : ''}`}
                      onClick={() => setEmployment(v)}>{label}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="소수점">
          <select className="ec-input" style={{ width: 90 }} value={decimals}
                  onChange={(e) => setDecimals(Number(e.target.value))}>
            <option value={0}>0자리</option>
            <option value={1}>1자리</option>
            <option value={2}>2자리</option>
            <option value={3}>3자리</option>
          </select>
        </EcCond>
        {/* 원본 [정렬/소계기준]. 조건 판의 아래쪽 줄이다(사본 실측). */}
        <EcCond label="정렬/소계기준">
          <div className="ec-pills">
            {SUBTOTALS.map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                      onClick={() => setSubtotal(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
      </ul>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        사원 <b style={{ color: '#3c4553' }}>{shown.length}</b>명
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        잔여 합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{days(totals.remain)}</b>일
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 140 }}>휴가명</th>
            <th>부서명</th>
            <th>성명</th>
            <th style={{ textAlign: 'right' }}>휴가일수</th>
            <th style={{ textAlign: 'right' }}>휴가사용일수</th>
            <th style={{ textAlign: 'right' }}>휴가잔여일수</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.empName + i}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.leaveName}</td>
              <td>{r.department ?? ''}</td>
              <td>{r.empName}{r.active ? '' : ' (퇴사)'}</td>
              <td style={{ textAlign: 'right' }}>{days(r.totalDays)}</td>
              <td style={{ textAlign: 'right' }}>{days(r.usedDays)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.remainingDays <= 0 ? '#c60a2e' : undefined }}>{days(r.remainingDays)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
            <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({shown.length}명)</td>
            <td style={{ textAlign: 'right' }}>{days(totals.total)}</td>
            <td style={{ textAlign: 'right' }}>{days(totals.used)}</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{days(totals.remain)}</td>
          </tr>
        </tfoot>
      </table>

      {shown.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
          <table className="w-full text-left">
            <thead><tr>
              <th>{subtotal}</th>
              <th style={{ width: 90, textAlign: 'right' }}>사원수</th>
              <th style={{ width: 120, textAlign: 'right' }}>휴가일수</th>
              <th style={{ width: 120, textAlign: 'right' }}>휴가사용일수</th>
              <th style={{ width: 120, textAlign: 'right' }}>휴가잔여일수</th>
            </tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.label}>
                  <td style={{ fontWeight: 600 }}>{g.label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{days(g.sums.total)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{days(g.sums.used)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
                    {days(g.sums.remain)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </EcListShell>
  )
}

import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'

/** 관리 > 휴가잔여일수현황 — 사원별 부여·사용 일수 및 잔여 연차 현황 (백엔드 /api/hr/vacations/summary 연동) */
interface Row {
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

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Row[]>('/hr/vacations/summary', { params: { employment } })
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [employment])

  /*
   * 원본 조건 판 실측(사본): 휴가코드 · 사원 · 부서 · 프로젝트 · 적요 · 상태 · 재직구분 ·
   * [기타] 사용중단휴가코드포함 · 정렬/소계기준 · 소수점
   * 잔여일수 응답은 사원·부서·일수만 주므로 거를 수 있는 것이 사원·부서뿐이다.
   * '소수점'은 반차 때문에 .5 가 나오는 자리라 원본에도 따로 있다 — 끄면 반올림해 보여 준다.
   */
  const shown = rows.filter((r) => {
    if (emp && !r.empName.includes(emp)) return false
    if (dept && !(r.department ?? '').includes(dept)) return false
    return true
  })
  const days = (n: number) => n.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })
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
        { label: '다시 작성', onClick: () => { setEmp(''); setDept(''); setDecimals(3); setEmployment('ACTIVE') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
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
            <th>부서명</th>
            <th>성명</th>
            <th style={{ textAlign: 'right' }}>휴가일수</th>
            <th style={{ textAlign: 'right' }}>휴가사용일수</th>
            <th style={{ textAlign: 'right' }}>휴가잔여일수</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.empName + i}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
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
            <td colSpan={3} style={{ textAlign: 'right' }}>합계 ({shown.length}명)</td>
            <td style={{ textAlign: 'right' }}>{days(totals.total)}</td>
            <td style={{ textAlign: 'right' }}>{days(totals.used)}</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{days(totals.remain)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}

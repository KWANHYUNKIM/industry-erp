import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'

/** 관리 > 휴가잔여일수현황 — 사원별 부여·사용 일수 및 잔여 연차 현황 (백엔드 /api/hr/vacations/summary 연동) */
interface Row {
  empName: string
  department: string | null
  totalDays: number
  usedDays: number
  remainingDays: number
}

export default function VacationRemainPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emp, setEmp] = useState('')
  const [dept, setDept] = useState('')
  const [decimals, setDecimals] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Row[]>('/hr/vacations/summary')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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
  const days = (n: number) => (decimals ? n : Math.round(n)).toLocaleString('ko-KR')
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
        { label: '다시 작성', onClick: () => { setEmp(''); setDept(''); setDecimals(true) } },
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
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={decimals} onChange={(e) => setDecimals(e.target.checked)} />
            소수점
          </label>
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
            <th>사원명</th>
            <th>부서</th>
            <th style={{ textAlign: 'right' }}>부여일수</th>
            <th style={{ textAlign: 'right' }}>사용일수</th>
            <th style={{ textAlign: 'right' }}>잔여일수</th>
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
              <td>{r.empName}</td>
              <td>{r.department ?? ''}</td>
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

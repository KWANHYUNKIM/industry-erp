import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 관리 > 근태현황 — 사원별 근무일수·지각·조퇴·결근·총근무시간 집계 (백엔드 /api/hr/attendance/summary 연동) */
interface Row {
  empName: string
  department: string | null
  workDays: number
  normalDays: number
  lateDays: number
  earlyLeaveDays: number
  absentDays: number
  totalWorkHours: number
}

export default function AttendanceStatusPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Row[]>('/hr/attendance/summary')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => !keyword || r.empName.includes(keyword))
  const totalWorkDays = useMemo(() => shown.reduce((s, r) => s + r.workDays, 0), [shown])

  return (
    <EcListShell
      title="근태현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={undefined}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 6, fontSize: 12, color: '#4b5563' }}>
        총 근무일수 합계: <b>{totalWorkDays.toLocaleString()}</b>일
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>사원명</th>
            <th>부서</th>
            <th style={{ textAlign: 'right' }}>근무일수</th>
            <th style={{ textAlign: 'right' }}>지각</th>
            <th style={{ textAlign: 'right' }}>조퇴</th>
            <th style={{ textAlign: 'right' }}>결근</th>
            <th style={{ textAlign: 'right' }}>총근무시간</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.empName + i}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.empName}</td>
              <td>{r.department ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.workDays.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.lateDays.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.earlyLeaveDays.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.absentDays.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.totalWorkHours.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

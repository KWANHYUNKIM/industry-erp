import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

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
  const [keyword, setKeyword] = useState('')

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

  const shown = rows.filter((r) => !keyword || r.empName.includes(keyword))

  return (
    <EcListShell
      title="휴가잔여일수현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={undefined}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
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
              <td style={{ textAlign: 'right' }}>{r.totalDays.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.usedDays.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.remainingDays <= 0 ? '#c60a2e' : undefined }}>{r.remainingDays.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

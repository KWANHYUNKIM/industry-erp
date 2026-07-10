import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 관리 > 근태조회 — 기간별 사원 출퇴근 및 근태 상태 조회 (백엔드 /api/hr/attendance 연동) */
interface Row {
  id: number
  date: string
  empName: string
  department: string | null
  clockIn: string | null
  clockOut: string | null
  workHours: number
  status: string
  note: string | null
}

const mono = { fontFamily: 'monospace' as const }
function statusColor(s: string) {
  if (s === '정상') return '#1c7c3c'
  if (s === '결근') return '#c60a2e'
  return '#c07a00'
}

export default function AttendanceListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Row[]>('/hr/attendance')
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
      title="근태조회"
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
            <th>일자</th>
            <th>사원명</th>
            <th>부서</th>
            <th>출근</th>
            <th>퇴근</th>
            <th>상태</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={mono}>{r.date}</td>
              <td>{r.empName}</td>
              <td>{r.department ?? ''}</td>
              <td style={mono}>{r.clockIn ?? '-'}</td>
              <td style={mono}>{r.clockOut ?? '-'}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: statusColor(r.status) }}>{r.status}</td>
              <td>{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

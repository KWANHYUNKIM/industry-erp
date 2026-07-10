import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 관리 > 휴가사용실적현황 — 사원별 휴가 종류·기간·사용일수 실적 조회 (백엔드 /api/hr/vacations 연동) */
interface Row {
  id: number
  empName: string
  department: string | null
  type: string
  startDate: string
  endDate: string
  days: number
  reason: string | null
  status: string
}

const mono = { fontFamily: 'monospace' as const }
function statusColor(s: string) {
  if (s === '승인') return '#1c7c3c'
  if (s === '반려') return '#c60a2e'
  return '#c07a00'
}

export default function VacationUsePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Row[]>('/hr/vacations')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function changeStatus(r: Row, status: string) {
    try {
      await api.put(`/hr/vacations/${r.id}/status`, { status })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.empName.includes(keyword))

  return (
    <EcListShell
      title="휴가사용실적현황"
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
            <th>휴가종류</th>
            <th>시작일</th>
            <th>종료일</th>
            <th style={{ textAlign: 'right' }}>사용일수</th>
            <th>사유</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ width: 90, textAlign: 'center' }}>결재</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.empName}</td>
              <td>{r.department ?? ''}</td>
              <td style={{ textAlign: 'center' }}>{r.type}</td>
              <td style={mono}>{r.startDate}</td>
              <td style={mono}>{r.endDate}</td>
              <td style={{ textAlign: 'right' }}>{r.days.toLocaleString()}</td>
              <td>{r.reason ?? ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: statusColor(r.status) }}>{r.status}</td>
              <td style={{ textAlign: 'center' }}>
                {r.status === '대기' ? (
                  <>
                    <button onClick={() => changeStatus(r, '승인')} style={{ color: '#1c7c3c', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>승인</button>
                    <button onClick={() => changeStatus(r, '반려')} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>반려</button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 회계 > 비용내역현황 — 계정과목별 비용 지출 내역 조회 (실제 연동: /api/expenses) */
interface Expense {
  id: number
  expenseDate: string
  accountName: string
  content: string | null
  partnerName: string | null
  amount: number
  paymentMethod: string | null
  department: string | null
}

export default function ExpenseDetailPage() {
  const [rows, setRows] = useState<Expense[]>([])
  const [keyword, setKeyword] = useState('')
  const [accountFilter, setAccountFilter] = useState('전체')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Expense[]>('/expenses')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const accountNames = useMemo(() => Array.from(new Set(rows.map((r) => r.accountName))), [rows])
  const shown = rows
    .filter((r) => accountFilter === '전체' || r.accountName === accountFilter)
    .filter((r) => !keyword || r.accountName.includes(keyword) || (r.content ?? '').includes(keyword) || (r.department ?? '').includes(keyword))
  const total = useMemo(() => shown.reduce((s, r) => s + r.amount, 0), [shown])

  return (
    <EcListShell title="비용내역현황" search={keyword} onSearchChange={setKeyword}
      newLabel="새로고침" onNew={load} actions={[{ label: 'Excel' }]}>
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>계정</span>
        <select className="ec-input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{ width: 160 }}>
          <option>전체</option>
          {accountNames.map((a) => <option key={a}>{a}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b> 원
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>일자</th>
            <th style={{ width: 120 }}>계정과목</th>
            <th style={{ width: 90 }}>부서</th>
            <th>적요</th>
            <th style={{ width: 120 }}>거래처</th>
            <th style={{ width: 110, textAlign: 'right' }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.expenseDate}</td>
              <td>{r.accountName}</td>
              <td>{r.department ?? ''}</td>
              <td>{r.content ?? ''}</td>
              <td>{r.partnerName ?? ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.amount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ background: '#f5f7fa', fontWeight: 700 }}>
              <td colSpan={6} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{total.toLocaleString()}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

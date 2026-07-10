import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 회계 > 월별이익현황 (실제 연동: /api/profit/monthly) */
interface Row {
  month: string
  revenue: number
  cost: number
  profit: number
  marginRate: number
}

const nowYear = () => new Date().getFullYear()

export default function MonthlyProfitPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [year, setYear] = useState(nowYear())
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Row[]>('/profit/monthly', { params: { year } })
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [year])

  const shown = rows.filter((r) => !keyword || r.month.includes(keyword))
  const total = useMemo(() => shown.reduce((s, r) => s + r.profit, 0), [shown])
  const years = [nowYear(), nowYear() - 1, nowYear() - 2]

  return (
    <EcListShell title="월별이익현황" search={keyword} onSearchChange={setKeyword}
      newLabel="새로고침" onNew={load} actions={[{ label: 'Excel' }]}>
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>연도</span>
        <select className="ec-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          이익합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b>
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>월</th>
            <th style={{ textAlign: 'right' }}>매출액</th>
            <th style={{ textAlign: 'right' }}>매입액</th>
            <th style={{ textAlign: 'right' }}>이익</th>
            <th style={{ textAlign: 'right' }}>이익률(%)</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const color = r.profit > 0 ? '#1c7c3c' : r.profit < 0 ? '#c60a2e' : undefined
            return (
              <tr key={r.month}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.month}</td>
                <td style={{ textAlign: 'right' }}>{r.revenue.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.cost.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color }}>{r.profit.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color }}>{r.marginRate}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}

import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { IncomeStatement, StatementRow } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const firstOfYear = () => `${new Date().getFullYear()}-01-01`
const today = () => new Date().toISOString().slice(0, 10)

/** 손익계산서 — 기간 내 수익 − 비용 = 당기순이익. */
export default function IncomeStatementPage() {
  const [from, setFrom] = useState(firstOfYear())
  const [to, setTo] = useState(today())
  const [data, setData] = useState<IncomeStatement | null>(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    api.get<IncomeStatement>('/journals/income-statement', { params: { from, to } })
      .then((r) => setData(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Section = ({ title, rows, total, color }: { title: string; rows: StatementRow[]; total: number; color: string }) => (
    <table className="w-full text-left" style={{ marginBottom: 12, maxWidth: 620 }}>
      <thead><tr><th colSpan={2} style={{ color, fontSize: 13 }}>{title}</th></tr></thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={2} style={{ color: '#9aa1ab', padding: 8 }}>계정 없음</td></tr>
        ) : rows.map((r) => (
          <tr key={r.accountCode}>
            <td><span style={{ fontFamily: 'monospace', color: '#8a929c', marginRight: 6 }}>{r.accountCode}</span>{r.accountName}</td>
            <td style={{ textAlign: 'right' }}>{won(r.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
          <td style={{ textAlign: 'right' }}>{title} 합계</td>
          <td style={{ textAlign: 'right', color }}>{won(total)}</td>
        </tr>
      </tfoot>
    </table>
  )

  return (
    <EcListShell title="손익계산서" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>기간</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회(F8)</button>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {data && (
        <>
          <Section title="매출·수익" rows={data.revenues} total={data.totalRevenue} color="#1a4d8f" />
          <Section title="비용" rows={data.expenses} total={data.totalExpense} color="#a5561b" />
          <div style={{ maxWidth: 620, padding: '14px 18px', border: '1px solid var(--ec-border)', background: data.netIncome >= 0 ? '#f4faf5' : '#fdecec', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, color: data.netIncome >= 0 ? '#1c6b32' : '#c60a2e' }}>
              당기순이익 (수익 {won(data.totalRevenue)} − 비용 {won(data.totalExpense)})
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: data.netIncome >= 0 ? '#2f8401' : '#c60a2e' }}>
              {won(data.netIncome)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span>
            </span>
          </div>
        </>
      )}
    </EcListShell>
  )
}

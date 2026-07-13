import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { BalanceSheet, StatementRow } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)

/** 재무상태표 — 특정 시점의 자산 = 부채 + 자본 + 당기순이익. */
export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(today())
  const [data, setData] = useState<BalanceSheet | null>(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    api.get<BalanceSheet>('/journals/balance-sheet', { params: { asOf } })
      .then((r) => setData(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Section = ({ title, rows, total, color }: { title: string; rows: StatementRow[]; total: number; color: string }) => (
    <table className="w-full text-left" style={{ marginBottom: 12 }}>
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
    <EcListShell title="재무상태표" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>기준일</span>
        <input type="date" className="ec-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 150 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회(F8)</button>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {data && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 360px', minWidth: 320 }}>
            <Section title="자산" rows={data.assets} total={data.totalAssets} color="#1a4d8f" />
          </div>
          <div style={{ flex: '1 1 360px', minWidth: 320 }}>
            <Section title="부채" rows={data.liabilities} total={data.totalLiabilities} color="#a5561b" />
            <Section title="자본" rows={data.equity} total={data.totalEquity} color="#1c7c3c" />
            <table className="w-full text-left">
              <tbody>
                <tr style={{ fontWeight: 700 }}>
                  <td style={{ textAlign: 'right' }}>당기순이익</td>
                  <td style={{ textAlign: 'right', color: data.netIncome >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(data.netIncome)}</td>
                </tr>
                <tr style={{ fontWeight: 800, background: '#eef5ff' }}>
                  <td style={{ textAlign: 'right' }}>부채 + 자본 + 순이익</td>
                  <td style={{ textAlign: 'right' }}>{won(data.totalLiabilities + data.totalEquity + data.netIncome)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ flexBasis: '100%', padding: '8px 12px', fontSize: 12.5, borderRadius: 3, background: data.balanced ? '#f4faf5' : '#fdecec', color: data.balanced ? '#1c6b32' : '#c60a2e' }}>
            {data.balanced
              ? `대차평형 ✓  자산 ${won(data.totalAssets)} = 부채+자본+순이익 ${won(data.totalLiabilities + data.totalEquity + data.netIncome)}`
              : `대차불일치 ✗  자산 ${won(data.totalAssets)} ≠ 부채+자본+순이익 ${won(data.totalLiabilities + data.totalEquity + data.netIncome)}`}
          </div>
        </div>
      )}
    </EcListShell>
  )
}

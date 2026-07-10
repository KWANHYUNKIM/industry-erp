import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { ProfitSummary } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')

export default function ProfitSummaryPage() {
  const [data, setData] = useState<ProfitSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<ProfitSummary>('/accounting/profit-summary')
      .then((res) => setData(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  if (error) return <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>
  if (!data) return <p style={{ color: '#9aa1ab', padding: 12 }}>불러오는 중…</p>

  const cards = [
    { label: '총매출액 (공급가)', value: data.totalSales, bg: '#f7f9ff', fg: 'var(--ec-blue)' },
    { label: '총매출원가', value: data.totalCost, bg: '#fdf5ef', fg: '#a5561b' },
    { label: '매출총이익', value: data.grossProfit, bg: '#f4faf5', fg: '#2f8401' },
  ]

  return (
    <EcListShell title="손익요약" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <p style={{ marginBottom: 8, fontSize: 11.5, color: '#8a929c' }}>매출총이익 = 총매출액 − 총매출원가 (원가는 매입평균/BOM 제조원가 기준)</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {cards.map((c) => (
          <div key={c.label} style={{ flex: 1, minWidth: 180, border: '1px solid var(--ec-border)', background: c.bg, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: '#5a626e' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.fg }}>{won(c.value)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span></div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, maxWidth: 720, border: '1px solid var(--ec-border)', background: '#fff', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <span style={{ color: '#5a626e', fontSize: 13 }}>매출총이익률</span>
          <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--ec-blue)' }}>{data.marginRate}%</span>
        </div>
        <div style={{ marginTop: 10, height: 12, width: '100%', overflow: 'hidden', borderRadius: 6, background: '#eef1f5' }}>
          <div style={{ height: '100%', borderRadius: 6, background: 'var(--ec-blue)', width: `${Math.max(0, Math.min(100, data.marginRate))}%` }} />
        </div>
      </div>
    </EcListShell>
  )
}

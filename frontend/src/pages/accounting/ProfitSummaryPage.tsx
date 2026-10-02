import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { ProfitSummary } from '../../types/api'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import { periodOf } from '../../utils/periods'

/* 금액은 원 단위로 — 평균 원가 × 수량이라 소수가 붙어 '28,695,516.08 원' 처럼 찍혔다(24회차). */
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

export default function ProfitSummaryPage() {
  const [data, setData] = useState<ProfitSummary | null>(null)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState(() => periodOf('금월(~오늘)')!)

  useEffect(() => {
    api
      .get<ProfitSummary>('/accounting/profit-summary', { params: period })
      .then((res) => setData(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [period])

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
      {/*
        기간. 예전엔 창업 이래 전부를 더해 보여 줘 "이번 달 이익" 을 볼 수 없었다(48회차). 열면 금월(~오늘).
      */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
        <span style={{ color: '#5a626e' }}>기간</span>
        <input type="date" className="ec-input" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} style={{ width: 140 }} />
        ~
        <input type="date" className="ec-input" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} style={{ width: 140 }} />
        <EcPeriodPicks onPick={(r) => setPeriod(r)} currentFrom={period.from} />
      </div>

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

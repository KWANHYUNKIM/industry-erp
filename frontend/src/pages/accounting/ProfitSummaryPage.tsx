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

  if (error) return <p className="ec-alert ec-alert-danger">{error}</p>
  if (!data) return <p className="text-ec-hint p-[12px]">불러오는 중…</p>

  const cards = [
    { label: '총매출액 (공급가)', value: data.totalSales, bg: 'var(--ec-blue-wash)', fg: 'var(--ec-blue)' },
    { label: '총매출원가', value: data.totalCost, bg: '#fdf5ef', fg: '#a5561b' },
    { label: '매출총이익', value: data.grossProfit, bg: 'var(--ec-success-bg)', fg: '#2f8401' },
  ]

  return (
    <EcListShell title="손익요약" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <p className="mb-[8px] text-[11.5px] text-ec-hint">매출총이익 = 총매출액 − 총매출원가 (원가는 매입평균/BOM 제조원가 기준)</p>
      {/*
        기간. 예전엔 창업 이래 전부를 더해 보여 줘 "이번 달 이익" 을 볼 수 없었다(48회차). 열면 금월(~오늘).
      */}
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px] flex-wrap">
        <span className="text-ec-label">기간</span>
        <input type="date" className="ec-input" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} style={{ width: 140 }} />
        ~
        <input type="date" className="ec-input" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} style={{ width: 140 }} />
        <EcPeriodPicks onPick={(r) => setPeriod(r)} currentFrom={period.from} />
      </div>

      <div className="flex gap-[10px] flex-wrap">
        {cards.map((c) => (
          <div key={c.label} style={{ flex: 1, minWidth: 180, border: '1px solid var(--ec-border)', background: c.bg, padding: '12px 16px' }}>
            <div className="text-[12px] text-ec-label">{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.fg }}>{won(c.value)} <span className="text-[13px] font-normal">원</span></div>
          </div>
        ))}
      </div>

      <div className="mt-[12px] max-w-[720px] border border-ec-line border-solid bg-white p-[18px]">
        <div className="flex items-end justify-between">
          <span className="text-ec-label text-[13px]">매출총이익률</span>
          <span className="text-[28px] font-extrabold text-ec-blue">{data.marginRate}%</span>
        </div>
        <div className="mt-[10px] h-[12px] w-full overflow-hidden rounded-[6px] bg-ec-line-soft">
          <div style={{ height: '100%', borderRadius: 6, background: 'var(--ec-blue)', width: `${Math.max(0, Math.min(100, data.marginRate))}%` }} />
        </div>
      </div>
    </EcListShell>
  )
}

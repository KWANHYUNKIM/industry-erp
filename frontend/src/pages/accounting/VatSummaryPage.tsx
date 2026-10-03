import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { VatSummary } from '../../types/api'

const won = (n: number) => n.toLocaleString('ko-KR')

/**
 * 지금이 속한 과세기간 — 1기 1/1~6/30, 2기 7/1~12/31. 부가세는 이 단위로 신고한다.
 * 예전엔 기간 없이 창업 이래 전부를 더해 보여 줘서 신고 기초자료로 쓸 수 없었다(47회차).
 */
function currentTaxPeriod(): { from: string; to: string } {
  const now = new Date(Date.now() + 9 * 3600e3)
  const y = now.getUTCFullYear()
  return now.getUTCMonth() < 6 ? { from: `${y}-01-01`, to: `${y}-06-30` } : { from: `${y}-07-01`, to: `${y}-12-31` }
}

export default function VatSummaryPage() {
  const [d, setD] = useState<VatSummary | null>(null)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState(currentTaxPeriod)

  useEffect(() => {
    setD(null)
    api
      .get<VatSummary>('/accounting/vat-summary', { params: period })
      .then((res) => setD(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [period])

  if (error) return <p className="ec-alert ec-alert-danger">{error}</p>
  if (!d) return <p className="text-ec-hint p-[12px]">불러오는 중…</p>

  const Row = ({ label, supply, vat, total }: { label: string; supply: number; vat: number; total: number }) => (
    <tr>
      <td className="font-semibold">{label}</td>
      <td className="text-right">{won(supply)}</td>
      <td className="text-right">{won(vat)}</td>
      <td className="text-right font-bold">{won(total)}</td>
    </tr>
  )

  const refund = d.vatPayable < 0

  return (
    <EcListShell title="매입매출·부가세" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <p className="mb-[8px] text-[11.5px] text-ec-hint">부가가치세 신고 기초자료 · 매출세액 − 매입세액(구매 + 비용 + 카드) = 납부(환급)세액</p>
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px]">
        <span className="text-ec-label">과세기간</span>
        <input type="date" className="ec-input" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} style={{ width: 140 }} />
        ~
        <input type="date" className="ec-input" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} style={{ width: 140 }} />
      </div>

      <table className="w-full text-left max-w-[720px]">
        <thead>
          <tr>
            <th>구분</th>
            <th className="text-right">공급가액</th>
            <th className="text-right">부가세(세액)</th>
            <th className="text-right">합계</th>
          </tr>
        </thead>
        <tbody>
          <Row label="매출 (매출세액)" supply={d.salesSupply} vat={d.salesVat} total={d.salesTotal} />
          <Row label="매입 (매입세액)" supply={d.purchaseSupply} vat={d.purchaseVat} total={d.purchaseTotal} />
          {/* 지출(비용)에 붙은 부가세 — 세금계산서 받은 비용의 매입세액도 공제한다(46·47회차). 공급가액은 비용관리에서 본다. */}
          <tr>
            <td className="font-semibold">비용 (매입세액)</td>
            <td className="text-right text-ec-hint">—</td>
            <td className="text-right">{won(d.expenseVat ?? 0)}</td>
            <td className="text-right text-ec-hint">—</td>
          </tr>
          {/* 카드 사용에 붙은 부가세 — 분개가 부가세대급금으로 잡는 매입세액이다. */}
          <tr>
            <td className="font-semibold">카드 (매입세액)</td>
            <td className="text-right text-ec-hint">—</td>
            <td className="text-right">{won(d.cardVat ?? 0)}</td>
            <td className="text-right text-ec-hint">—</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 12, maxWidth: 720, border: '1px solid var(--ec-border)', background: refund ? 'var(--ec-success-bg)' : '#fdf7ec', padding: '14px 18px' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 12.5, color: refund ? '#1c6b32' : '#8a6a1e' }}>
            {refund ? '환급 예상세액 (매입세액 > 매출세액)' : '납부 예상세액 (매출세액 − 매입세액)'}
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: refund ? '#2f8401' : '#b6791b' }}>
            {won(Math.abs(d.vatPayable))} <span className="text-[13px] font-normal">원</span>
          </span>
        </div>
      </div>
    </EcListShell>
  )
}

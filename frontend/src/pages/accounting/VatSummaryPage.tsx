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

  if (error) return <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>
  if (!d) return <p style={{ color: '#9aa1ab', padding: 12 }}>불러오는 중…</p>

  const Row = ({ label, supply, vat, total }: { label: string; supply: number; vat: number; total: number }) => (
    <tr>
      <td style={{ fontWeight: 600 }}>{label}</td>
      <td style={{ textAlign: 'right' }}>{won(supply)}</td>
      <td style={{ textAlign: 'right' }}>{won(vat)}</td>
      <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(total)}</td>
    </tr>
  )

  const refund = d.vatPayable < 0

  return (
    <EcListShell title="매입매출·부가세" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <p style={{ marginBottom: 8, fontSize: 11.5, color: '#8a929c' }}>부가가치세 신고 기초자료 · 매출세액 − 매입세액(구매 + 비용) = 납부(환급)세액</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5 }}>
        <span style={{ color: '#5a626e' }}>과세기간</span>
        <input type="date" className="ec-input" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} style={{ width: 140 }} />
        ~
        <input type="date" className="ec-input" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} style={{ width: 140 }} />
      </div>

      <table className="w-full text-left" style={{ maxWidth: 720 }}>
        <thead>
          <tr>
            <th>구분</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세(세액)</th>
            <th style={{ textAlign: 'right' }}>합계</th>
          </tr>
        </thead>
        <tbody>
          <Row label="매출 (매출세액)" supply={d.salesSupply} vat={d.salesVat} total={d.salesTotal} />
          <Row label="매입 (매입세액)" supply={d.purchaseSupply} vat={d.purchaseVat} total={d.purchaseTotal} />
          {/* 지출(비용)에 붙은 부가세 — 세금계산서 받은 비용의 매입세액도 공제한다(46·47회차). 공급가액은 비용관리에서 본다. */}
          <tr>
            <td style={{ fontWeight: 600 }}>비용 (매입세액)</td>
            <td style={{ textAlign: 'right', color: '#9aa1ab' }}>—</td>
            <td style={{ textAlign: 'right' }}>{won(d.expenseVat ?? 0)}</td>
            <td style={{ textAlign: 'right', color: '#9aa1ab' }}>—</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 12, maxWidth: 720, border: '1px solid var(--ec-border)', background: refund ? '#f4faf5' : '#fdf7ec', padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.5, color: refund ? '#1c6b32' : '#8a6a1e' }}>
            {refund ? '환급 예상세액 (매입세액 > 매출세액)' : '납부 예상세액 (매출세액 − 매입세액)'}
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: refund ? '#2f8401' : '#b6791b' }}>
            {won(Math.abs(d.vatPayable))} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span>
          </span>
        </div>
      </div>
    </EcListShell>
  )
}

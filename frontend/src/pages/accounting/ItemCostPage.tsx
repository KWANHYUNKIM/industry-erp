import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { ItemProfit } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')

const basisColor = (b: string) =>
  b === '제조원가' ? { bg: '#f3eefb', fg: '#6b3fb0' }
    : b === '매입평균' ? { bg: '#eefaf0', fg: '#2f8401' }
      : { bg: '#f0f2f5', fg: '#5a626e' }

export default function ItemCostPage() {
  const [rows, setRows] = useState<ItemProfit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<ItemProfit[]>('/accounting/item-profit')
      .then((res) => setRows(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <EcListShell title="품목별 원가·이익" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <p style={{ marginBottom: 8, fontSize: 11.5, color: '#8a929c' }}>
        품목별 매출·원가·이익 · 원가단가는 매입평균, 제조품은 BOM 소요자재 원가(제조원가)로 산정
      </p>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목코드 ▼</th>
            <th>품명 ▼</th>
            <th style={{ textAlign: 'center' }}>원가기준</th>
            <th style={{ textAlign: 'right' }}>판매수량</th>
            <th style={{ textAlign: 'right' }}>매출액</th>
            <th style={{ textAlign: 'right' }}>원가단가</th>
            <th style={{ textAlign: 'right' }}>매출원가</th>
            <th style={{ textAlign: 'right' }}>매출이익</th>
            <th style={{ textAlign: 'right' }}>이익률</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>판매 실적이 없습니다.</td></tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={r.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
                <td>{r.name}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: basisColor(r.costBasis).bg, color: basisColor(r.costBasis).fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{r.costBasis}</span>
                </td>
                <td style={{ textAlign: 'right' }}>{won(r.soldQty)}</td>
                <td style={{ textAlign: 'right' }}>{won(r.salesAmount)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.unitCost)}</td>
                <td style={{ textAlign: 'right' }}>{won(r.costAmount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.profit >= 0 ? 'var(--ec-blue)' : '#c60a2e' }}>{won(r.profit)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: r.profit >= 0 ? 'var(--ec-blue)' : '#c60a2e' }}>{r.marginRate}%</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

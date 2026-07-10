import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { StockRow } from '../../api/types'
import EcListShell from '../../components/EcListShell'

export default function CurrentStockPage() {
  const [rows, setRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlyBelow, setOnlyBelow] = useState(false)

  useEffect(() => {
    api
      .get<StockRow[]>('/stock')
      .then((res) => setRows(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const shown = onlyBelow ? rows.filter((r) => r.belowSafety) : rows
  const belowCount = rows.filter((r) => r.belowSafety).length

  return (
    <EcListShell title="재고현황" actions={[{ label: 'Excel' }]}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 12, color: '#5a6472' }}>
        <span>품목 × 창고 현재고 · 총 {rows.length}건</span>
        {belowCount > 0 && (
          <span style={{ marginLeft: 8, color: '#c60a2e', fontWeight: 700 }}>안전재고 미달 {belowCount}건</span>
        )}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={onlyBelow} onChange={(e) => setOnlyBelow(e.target.checked)} />
          안전재고 미달만 보기
        </label>
      </div>

      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>품목코드 ▼</th>
              <th>품목명 ▼</th>
              <th>규격정보</th>
              <th>창고 ▼</th>
              <th style={{ textAlign: 'right' }}>현재고</th>
              <th style={{ textAlign: 'right' }}>안전재고</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>표시할 재고가 없습니다.</td></tr>
            ) : (
              shown.map((r, idx) => (
                <tr key={`${r.itemId}-${r.warehouseId}`} style={r.belowSafety ? { background: '#fdf1f3' } : undefined}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                  <td>{r.itemName}</td>
                  <td>{r.spec ?? ''}</td>
                  <td>{r.warehouseName}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: r.belowSafety ? '#c60a2e' : undefined }}>
                    {r.quantity.toLocaleString()} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.unit}</span>
                  </td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.safetyStock.toLocaleString()}</td>
                  <td>{r.belowSafety ? <span style={{ color: '#c60a2e', fontWeight: 700 }}>부족</span> : <span style={{ color: '#2f8401' }}>정상</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}

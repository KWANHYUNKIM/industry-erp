import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Lot, StockRow } from '../../api/types'

/**
 * 재고 II > 시리얼/로트No. > 품목vs시리얼재고수량비교 (이카운트 E041018)
 * 품목 단위 재고(창고 합계)와 그 품목의 로트재고 합계를 대조해 **불일치(차이)** 를 드러낸다.
 * 로트 추적 품목인데 차이가 있으면 로트 미부여 입출고가 있었다는 뜻 → 재고 신뢰도 점검용.
 * 데이터는 GET /api/stock + GET /api/lots 그대로(백엔드 무변경).
 */
interface Row {
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  itemStock: number   // 품목재고(창고 합계)
  lotStock: number    // 로트재고 합계
  lotCount: number    // 재고 있는 로트 수
  diff: number        // itemStock - lotStock
}

const num = (n: number) => n.toLocaleString('ko-KR')

export default function LotStockComparePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [diffOnly, setDiffOnly] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, l] = await Promise.all([
        api.get<StockRow[]>('/stock'),
        api.get<Lot[]>('/lots'),
      ])
      // 품목별 집계
      const map = new Map<number, Row>()
      const ensure = (itemId: number, code: string, name: string, unit: string): Row => {
        let r = map.get(itemId)
        if (!r) { r = { itemId, itemCode: code, itemName: name, unit, itemStock: 0, lotStock: 0, lotCount: 0, diff: 0 }; map.set(itemId, r) }
        return r
      }
      // 로트가 있는 품목만 대상(로트 추적 품목)
      for (const lot of l.data) {
        const r = ensure(lot.itemId, lot.itemCode, lot.itemName, lot.unit)
        r.lotStock += lot.stockQty
        if (lot.stockQty > 0) r.lotCount += 1
      }
      // 품목재고(창고 합계)를 로트 추적 품목에만 더한다
      for (const st of s.data) {
        const r = map.get(st.itemId)
        if (r) r.itemStock += st.quantity
      }
      const out = [...map.values()].map((r) => ({ ...r, diff: r.itemStock - r.lotStock }))
      out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.itemName.localeCompare(b.itemName))
      setRows(out)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows.filter((r) => {
      if (kw && !r.itemName.includes(kw) && !r.itemCode.includes(kw)) return false
      if (diffOnly && r.diff === 0) return false
      return true
    })
  }, [rows, keyword, diffOnly])

  const stats = useMemo(() => ({
    items: shown.length,
    mismatched: shown.filter((r) => r.diff !== 0).length,
  }), [shown])

  return (
    <EcListShell
      title="품목vs시리얼재고수량비교"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} />
          차이있는 품목만
        </label>
        <span style={{ fontSize: 11.5, color: '#9aa1ab' }}>로트 추적 품목 기준. 차이 = 품목재고 − 로트재고합</span>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          대상품목 <b style={{ color: '#3c4553' }}>{stats.items}</b>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          차이발생 <b style={{ color: stats.mismatched > 0 ? '#c60a2e' : '#1c6b32', fontSize: 14 }}>{stats.mismatched}</b>
        </div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th style={{ textAlign: 'center' }}>단위</th>
            <th style={{ textAlign: 'right' }}>품목재고</th>
            <th style={{ textAlign: 'right' }}>로트재고합</th>
            <th style={{ textAlign: 'right' }}>차이</th>
            <th style={{ textAlign: 'right' }}>로트수</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '로트 추적 품목이 없습니다.' : '조건에 맞는 품목이 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.itemId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
              <td style={{ textAlign: 'right' }}>{num(r.itemStock)}</td>
              <td style={{ textAlign: 'right' }}>{num(r.lotStock)}</td>
              <td style={{ textAlign: 'right', fontWeight: r.diff !== 0 ? 700 : 400, color: r.diff === 0 ? '#8a929c' : r.diff > 0 ? '#c07a00' : '#c60a2e' }}>
                {r.diff === 0 ? '0' : r.diff > 0 ? `+${num(r.diff)}` : num(r.diff)}
              </td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{r.lotCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

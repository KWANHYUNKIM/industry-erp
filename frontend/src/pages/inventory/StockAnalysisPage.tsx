import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockRow, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'

/**
 * 재고 > 재고잔량분석표 (이카운트 E040727)
 * 현재고를 품목별로 집계해 안전재고 대비 과부족·상태와 재고금액(수량×단가)을 분석한다.
 * 데이터는 GET /api/stock(현재고) + GET /api/items(단가) 를 조인(백엔드 무변경).
 * 재고금액은 품목 표준단가(Item.unitPrice) 기준 — 실제 입고단가 평가가 아닌 참고 평가액이다.
 */

interface AnalysisRow {
  itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
  quantity: number; safetyStock: number; unitPrice: number; value: number
  whCount: number
}

const won = (n: number) => n.toLocaleString('ko-KR')

export default function StockAnalysisPage() {
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [warehouseId, setWarehouseId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [shortageOnly, setShortageOnly] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, i, w] = await Promise.all([
        api.get<StockRow[]>('/stock'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
      ])
      setStocks(s.data); setItems(i.data); setWarehouses(w.data)
    } catch (err) { setError(extractErrorMessage(err)); setStocks([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const priceById = useMemo(() => new Map(items.map((it) => [it.id, it.unitPrice])), [items])

  const rows = useMemo(() => {
    const wid = warehouseId ? Number(warehouseId) : null
    const m = new Map<number, AnalysisRow>()
    for (const s of stocks) {
      if (wid != null && s.warehouseId !== wid) continue
      let a = m.get(s.itemId)
      if (!a) {
        a = { itemId: s.itemId, itemCode: s.itemCode, itemName: s.itemName, spec: s.spec, unit: s.unit,
          quantity: 0, safetyStock: s.safetyStock, unitPrice: priceById.get(s.itemId) ?? 0, value: 0, whCount: 0 }
        m.set(s.itemId, a)
      }
      a.quantity += s.quantity
      if (s.quantity > 0) a.whCount += 1
    }
    const kw = keyword.trim()
    const out = [...m.values()]
    for (const a of out) a.value = a.quantity * a.unitPrice
    return out
      .filter((a) => !kw || a.itemName.includes(kw) || a.itemCode.includes(kw))
      .filter((a) => !shortageOnly || a.quantity < a.safetyStock)
      .sort((a, b) => b.value - a.value)
  }, [stocks, priceById, warehouseId, keyword, shortageOnly])

  const totals = useMemo(() => ({
    count: rows.length,
    value: rows.reduce((s, r) => s + r.value, 0),
    shortage: rows.filter((r) => r.quantity < r.safetyStock).length,
  }), [rows])

  const label: React.CSSProperties = { width: 56, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }

  return (
    <EcListShell
      title="재고잔량분석표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">품목별 현재고를 안전재고와 대비 + 재고금액(수량×표준단가) 분석. 창고 미지정 시 전 창고 합산.</p>

      <div style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>창고</span>
          <CodePickerField label="창고" hideLabel width={170} value={warehouseId} onChange={setWarehouseId}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))} />
        </div>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={shortageOnly} onChange={(e) => setShortageOnly(e.target.checked)} />
          안전재고 미달만
        </label>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          품목 <b style={{ color: '#3c4553', fontSize: 14 }}>{won(totals.count)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          미달 <b style={{ color: '#c60a2e', fontSize: 14 }}>{won(totals.shortage)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          재고금액 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.value)}</b>
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th>규격</th>
            <th style={{ textAlign: 'center', width: 46 }}>단위</th>
            <th style={{ textAlign: 'right' }}>현재고</th>
            <th style={{ textAlign: 'right' }}>안전재고</th>
            <th style={{ textAlign: 'right' }}>과부족</th>
            <th style={{ textAlign: 'center', width: 60 }}>상태</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>재고금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {stocks.length === 0 ? '재고 자료가 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : rows.map((r, i) => {
            const diff = r.quantity - r.safetyStock
            const short = r.quantity < r.safetyStock
            return (
              <tr key={r.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td style={{ color: '#8a929c' }}>{r.spec ?? '-'}</td>
                <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(r.quantity)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.safetyStock)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: diff < 0 ? '#c60a2e' : '#1c7c3c' }}>{diff > 0 ? '+' : ''}{won(diff)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: short ? '#fdecec' : '#eaf6ec', color: short ? '#c60a2e' : '#1c7c3c', padding: '1px 7px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{short ? '부족' : '적정'}</span>
                </td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.unitPrice)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.value)}</td>
              </tr>
            )
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={10} style={{ textAlign: 'right' }}>재고금액 합계</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.value)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

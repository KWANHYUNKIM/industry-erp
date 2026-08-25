import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 재고 > 재고변동표 (이카운트 E040719)
 * 품목별 기간 기초·입고·출고·기말을 한 줄로 요약(재고수불부의 집계판).
 * 데이터는 GET /api/stock/movement (StockMovementRow[]) — 백엔드가 기초(before from)와
 * 기간 입출고를 집계해준다. 기말 = 기초 + 입고 − 출고.
 */

interface MovementRow {
  itemId: number; itemCode: string; itemName: string; unit: string
  opening: number; inQty: number; outQty: number; closing: number
}

const num = (n: number) => n.toLocaleString('ko-KR')
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const today = () => ymd(new Date())

export default function StockMovementPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [rows, setRows] = useState<MovementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [warehouseId, setWarehouseId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [hideZero, setHideZero] = useState(false)

  async function loadRefs() {
    const w = await api.get<Warehouse[]>('/warehouses')
    setWarehouses(w.data)
  }
  async function load() {
    setLoading(true); setError('')
    try {
      const params: Record<string, string> = {}
      if (from) params.from = from
      if (to) params.to = to
      if (warehouseId) params.warehouseId = warehouseId
      const res = await api.get<MovementRow[]>('/stock/movement', { params })
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadRefs(); load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows.filter((r) => {
      if (kw && !r.itemName.includes(kw) && !r.itemCode.includes(kw)) return false
      if (hideZero && r.inQty === 0 && r.outQty === 0) return false
      return true
    })
  }, [rows, keyword, hideZero])

  const totals = useMemo(() => shown.reduce((s, r) => ({
    opening: s.opening + r.opening, inQty: s.inQty + r.inQty, outQty: s.outQty + r.outQty, closing: s.closing + r.closing,
  }), { opening: 0, inQty: 0, outQty: 0, closing: 0 }), [shown])

  const label: React.CSSProperties = { width: 56, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }

  return (
    <EcListShell
      title="재고변동표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '조회', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">품목별 기간 기초·입고·출고·기말 요약. 기말 = 기초 + 입고 − 출고. 창고 미지정 시 전 창고 합산.</p>

      <div
        onKeyDown={(e) => { if (e.key === 'Enter') load() }}
        style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>기간</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>창고</span>
          <CodePickerField label="창고" hideLabel width={170} value={warehouseId} onChange={setWarehouseId}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))} />
        </div>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          변동있는 품목만
        </label>
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        품목 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        입고계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(totals.inQty)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        출고계 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totals.outQty)}</b>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th style={{ textAlign: 'center', width: 50 }}>단위</th>
            <th style={{ textAlign: 'right' }}>기초</th>
            <th style={{ textAlign: 'right' }}>입고</th>
            <th style={{ textAlign: 'right' }}>출고</th>
            <th style={{ textAlign: 'right' }}>기말</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '해당 기간의 재고 변동이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.itemId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(r.opening)}</td>
              <td style={{ textAlign: 'right', color: r.inQty ? 'var(--ec-blue)' : '#c5cbd3', fontWeight: r.inQty ? 600 : 400 }}>{r.inQty ? num(r.inQty) : '-'}</td>
              <td style={{ textAlign: 'right', color: r.outQty ? '#a5561b' : '#c5cbd3', fontWeight: r.outQty ? 600 : 400 }}>{r.outQty ? num(r.outQty) : '-'}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{num(r.closing)}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right' }}>{num(totals.opening)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{num(totals.inQty)}</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totals.outQty)}</td>
              <td style={{ textAlign: 'right' }}>{num(totals.closing)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

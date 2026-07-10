import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 재고 II > WMS — 창고/로케이션별 현재고 배치 현황 (/api/stock + /api/warehouses + /api/lots 연동) */
interface StockRes {
  itemId: number
  itemCode: string
  itemName: string
  spec: string | null
  unit: string
  warehouseId: number
  warehouseName: string
  quantity: number
  safetyStock: number
  belowSafety: boolean
}
interface WarehouseRes { id: number; code: string; name: string; location: string | null; active: boolean }
interface LotRes { id: number; lotNo: string; itemId: number; warehouseId: number | null; stockQty: number; held: boolean }

interface Row {
  key: string
  zone: string // 창고코드
  warehouseName: string
  location: string
  itemName: string
  itemCode: string
  lotNo: string
  qty: number
  unit: string
  usage: number // 창고 내 수량 비중 %
}

const usageColor = (u: number) => (u >= 90 ? '#c60a2e' : u >= 70 ? '#c07a00' : '#1c7c3c')

export default function WmsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [zone, setZone] = useState('전체')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [stockRes, whRes] = await Promise.all([
        api.get<StockRes[]>('/stock'),
        api.get<WarehouseRes[]>('/warehouses'),
      ])
      // 로트는 부가정보 — 실패해도 화면은 유지
      let lots: LotRes[] = []
      try {
        lots = (await api.get<LotRes[]>('/lots')).data
      } catch {
        lots = []
      }
      const whById = new Map(whRes.data.map((w) => [w.id, w]))
      // 창고별 총 수량 (적재 비중 계산용)
      const totalByWh = new Map<number, number>()
      for (const s of stockRes.data) {
        totalByWh.set(s.warehouseId, (totalByWh.get(s.warehouseId) ?? 0) + Number(s.quantity))
      }
      const mapped: Row[] = stockRes.data.map((s) => {
        const wh = whById.get(s.warehouseId)
        const total = totalByWh.get(s.warehouseId) ?? 0
        const lot = lots.find((l) => l.itemId === s.itemId && l.warehouseId === s.warehouseId && l.stockQty > 0)
        return {
          key: `${s.itemId}-${s.warehouseId}`,
          zone: wh?.code ?? s.warehouseName,
          warehouseName: s.warehouseName,
          location: wh?.location || '-',
          itemName: s.itemName,
          itemCode: s.itemCode,
          lotNo: lot?.lotNo ?? '-',
          qty: Number(s.quantity),
          unit: s.unit,
          usage: total > 0 ? Math.round((Number(s.quantity) / total) * 100) : 0,
        }
      })
      mapped.sort((a, b) => (a.zone === b.zone ? a.itemCode.localeCompare(b.itemCode) : a.zone.localeCompare(b.zone)))
      setRows(mapped)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows
    .filter((r) => zone === '전체' || r.zone === zone)
    .filter((r) => !keyword || r.itemName.includes(keyword) || r.itemCode.includes(keyword) || r.location.includes(keyword) || r.lotNo.includes(keyword))
  const zones = Array.from(new Set(rows.map((r) => r.zone)))

  return (
    <EcListShell
      title="WMS 로케이션 재고"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: '입고배치(Putaway)' }, { label: '피킹지시' }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>창고(Zone)</span>
        <select className="ec-input" value={zone} onChange={(e) => setZone(e.target.value)} style={{ width: 120 }}>
          <option>전체</option>
          {zones.map((z) => <option key={z}>{z}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          배치 <b style={{ color: 'var(--ec-blue-dark)' }}>{shown.length}</b>건
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 80, textAlign: 'center' }}>Zone ▼</th>
            <th style={{ width: 150 }}>로케이션 ▼</th>
            <th>품목명 ▼</th>
            <th style={{ width: 150 }}>로트No.</th>
            <th style={{ width: 110, textAlign: 'right' }}>수량</th>
            <th style={{ width: 160 }}>창고 내 비중</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>배치된 재고가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontWeight: 700 }} title={r.warehouseName}>{r.zone}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.location}</td>
              <td>{r.itemName} <span style={{ color: '#9aa1ab', fontSize: 11.5 }}>({r.itemCode})</span></td>
              <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{r.lotNo}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.qty.toLocaleString()} <span style={{ color: '#9aa1ab', fontWeight: 400, fontSize: 11.5 }}>{r.unit}</span></td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 8, background: '#eef1f5', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${r.usage}%`, height: '100%', background: usageColor(r.usage) }} />
                  </div>
                  <span style={{ width: 34, textAlign: 'right', fontSize: 11.5, color: usageColor(r.usage) }}>{r.usage}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

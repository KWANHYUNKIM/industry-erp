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
  const [putawayOpen, setPutawayOpen] = useState(false)  // 입고배치(Putaway) 모달
  const [pickOpen, setPickOpen] = useState(false)        // 피킹지시 모달
  const [placements, setPlacements] = useState<Record<string, string>>({})  // 임시 배치 로케이션(미연동)

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
  // 로케이션이 지정되지 않은(창고에 location이 없는) 재고 = 입고배치 대상 후보
  const putawayTargets = rows.filter((r) => r.location === '-')

  // 피킹지시서를 인쇄용 창으로 띄운다 (print.ts의 서식 패턴을 페이지 내부에서 재구성)
  function printPickSheet() {
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
    const win = window.open('', '_blank', 'width=1024,height=768')
    if (!win) { alert('팝업이 차단되어 인쇄창을 열 수 없습니다.'); return }
    const body = shown.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.zone)}</td><td>${esc(r.location)}</td><td>${esc(r.itemName)} (${esc(r.itemCode)})</td><td>${esc(r.lotNo)}</td><td class="num">${r.qty.toLocaleString()} ${esc(r.unit)}</td><td style="width:80px"></td></tr>`).join('')
    win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>피킹지시서</title><style>
      body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;margin:24px;color:#1f2733}
      h1{font-size:18px;margin:0 0 4px}.meta{font-size:11px;color:#6b7480;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #c9d1da;padding:4px 6px;text-align:left}
      th{background:#eff3f8;font-weight:700;text-align:center}td.num{text-align:right}@page{size:A4 landscape;margin:12mm}
    </style></head><body>
      <h1>피킹지시서 (Picking List)</h1>
      <div class="meta">출력일시 ${esc(new Date().toLocaleString('ko-KR'))} · 대상 ${shown.length}건${zone !== '전체' ? ` · 창고 ${esc(zone)}` : ''}</div>
      <table><thead><tr><th>No</th><th>Zone</th><th>로케이션</th><th>품목</th><th>로트No.</th><th>지시수량</th><th>피킹확인</th></tr></thead><tbody>${body}</tbody></table>
    </body></html>`)
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }

  return (
    <EcListShell
      title="WMS 로케이션 재고"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: '입고배치(Putaway)', onClick: () => setPutawayOpen(true) }, { label: '피킹지시', onClick: () => setPickOpen(true) }, { label: 'Excel' }]}
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

      {putawayOpen && (
        <div onClick={() => setPutawayOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 620, maxWidth: '94vw', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>입고배치 (Putaway)</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setPutawayOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, color: '#3c4553' }}>
              <p style={{ margin: '0 0 8px', color: '#5a626e' }}>로케이션이 지정되지 않은 재고를 창고 내 특정 위치로 배치하는 작업입니다. 대상 <b style={{ color: 'var(--ec-blue-dark)' }}>{putawayTargets.length}</b>건.</p>
              {putawayTargets.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#9aa1ab', border: '1px dashed var(--ec-border)', borderRadius: 3 }}>모든 재고에 로케이션(창고 위치)이 지정되어 있어 배치 대상이 없습니다.</div>
              ) : (
                <table className="w-full text-left">
                  <thead><tr><th style={{ width: 70 }}>Zone</th><th>품목</th><th style={{ width: 90, textAlign: 'right' }}>수량</th><th style={{ width: 150 }}>배치 로케이션</th></tr></thead>
                  <tbody>
                    {putawayTargets.map((r) => (
                      <tr key={r.key}>
                        <td style={{ fontWeight: 700, textAlign: 'center' }}>{r.zone}</td>
                        <td>{r.itemName} <span style={{ color: '#9aa1ab', fontSize: 11.5 }}>({r.itemCode})</span></td>
                        <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()} {r.unit}</td>
                        <td><input className="ec-input" placeholder="예: A-01-03" value={placements[r.key] ?? ''} onChange={(e) => setPlacements((p) => ({ ...p, [r.key]: e.target.value }))} style={{ width: '100%' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="ec-btn" disabled title="로케이션 배치 저장 API 미구현" style={{ opacity: .55, cursor: 'default' }}>배치 확정 (백엔드 미연동)</button>
                <span style={{ fontSize: 11.5, color: '#c07a00' }}>* 로케이션 마스터/배치 저장 API가 없어 입력값은 서버에 반영되지 않습니다.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {pickOpen && (
        <div onClick={() => setPickOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 640, maxWidth: '94vw', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>피킹지시</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button className="ec-btn ec-btn-primary" onClick={printPickSheet}>🖨 피킹지시서 인쇄</button>
                <button className="ec-btn" onClick={() => setPickOpen(false)}>닫기</button>
              </div>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, color: '#3c4553' }}>
              <p style={{ margin: '0 0 8px', color: '#5a626e' }}>현재 조회된 재고 <b style={{ color: 'var(--ec-blue-dark)' }}>{shown.length}</b>건을 기준으로 피킹 대상 목록을 만들었습니다{zone !== '전체' ? ` (창고 ${zone})` : ''}. 인쇄하여 현장 지시서로 사용할 수 있습니다.</p>
              <table className="w-full text-left">
                <thead><tr><th style={{ width: 34 }}>No</th><th style={{ width: 70 }}>Zone</th><th style={{ width: 130 }}>로케이션</th><th>품목</th><th style={{ width: 100, textAlign: 'right' }}>지시수량</th></tr></thead>
                <tbody>
                  {shown.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>피킹 대상이 없습니다.</td></tr>
                  ) : shown.map((r, i) => (
                    <tr key={r.key}>
                      <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.zone}</td>
                      <td style={{ fontFamily: 'monospace' }}>{r.location}</td>
                      <td>{r.itemName} <span style={{ color: '#9aa1ab', fontSize: 11.5 }}>({r.itemCode})</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.qty.toLocaleString()} {r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#c07a00' }}>* 피킹지시 전표 생성/출고 반영은 백엔드 미연동입니다. 현재는 지시서 조회·인쇄만 제공합니다.</p>
            </div>
          </div>
        </div>
      )}
    </EcListShell>
  )
}

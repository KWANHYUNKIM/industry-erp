import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { QualityInspection, StockAdjustment } from '../../api/types'
import EcListShell from '../../components/EcListShell'

/**
 * 재고 II > 품질관리 — 불량률파악보고서 (이카운트 E040512)
 * 품질검사(검사수량·불량)와 기타이동의 불량처리·폐기 수량을 품목별로 모아 불량률을 파악한다.
 * 검사 목록 화면(QualityStatusPage)과 달리 품목 중심 종합 뷰다.
 * 데이터는 GET /api/quality-inspections + /api/stock-adjustments (백엔드 무변경).
 */

interface Row {
  itemId: number; itemCode: string; itemName: string; unit: string
  inspectedQty: number; inspectDefect: number; defectRate: number
  defectHandled: number; disposed: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
const rateColor = (r: number) => (r >= 5 ? '#c60a2e' : r >= 1 ? '#c07a00' : '#1c7c3c')

export default function DefectReportPage() {
  const [inspections, setInspections] = useState<QualityInspection[]>([])
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [q, a] = await Promise.all([
        api.get<QualityInspection[]>('/quality-inspections'),
        api.get<StockAdjustment[]>('/stock-adjustments'),
      ])
      setInspections(q.data); setAdjustments(a.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const rows = useMemo<Row[]>(() => {
    const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to)
    const map = new Map<number, Row>()
    const get = (itemId: number, code: string, name: string, unit: string): Row => {
      let r = map.get(itemId)
      if (!r) { r = { itemId, itemCode: code, itemName: name, unit, inspectedQty: 0, inspectDefect: 0, defectRate: 0, defectHandled: 0, disposed: 0 }; map.set(itemId, r) }
      return r
    }
    for (const q of inspections) {
      if (!inPeriod(q.inspectionDate)) continue
      const r = get(q.itemId, q.itemCode, q.itemName, q.unit)
      r.inspectedQty += q.inspectedQty; r.inspectDefect += q.defectQty
    }
    for (const a of adjustments) {
      if (!inPeriod(a.adjustDate)) continue
      if (a.type !== 'DEFECT' && a.type !== 'DISPOSAL') continue
      const r = get(a.itemId, a.itemCode, a.itemName, a.unit)
      const qty = Math.abs(a.quantityChange)
      if (a.type === 'DEFECT') r.defectHandled += qty
      else r.disposed += qty
    }
    const kw = keyword.trim()
    const out = [...map.values()]
    for (const r of out) r.defectRate = r.inspectedQty > 0 ? (r.inspectDefect / r.inspectedQty) * 100 : 0
    return out
      .filter((r) => !kw || r.itemName.includes(kw) || r.itemCode.includes(kw))
      .sort((a, b) => b.defectRate - a.defectRate || (b.inspectDefect + b.defectHandled + b.disposed) - (a.inspectDefect + a.defectHandled + a.disposed))
  }, [inspections, adjustments, from, to, keyword])

  const totals = useMemo(() => rows.reduce((s, r) => ({
    inspected: s.inspected + r.inspectedQty, defect: s.defect + r.inspectDefect,
    handled: s.handled + r.defectHandled, disposed: s.disposed + r.disposed,
  }), { inspected: 0, defect: 0, handled: 0, disposed: 0 }), [rows])
  const overallRate = totals.inspected > 0 ? (totals.defect / totals.inspected) * 100 : 0
  const label: React.CSSProperties = { width: 44, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }

  return (
    <EcListShell
      title="불량률파악보고서"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">품목별 검사 불량률 + 불량처리·폐기 수량 종합. 불량률 = 검사불량 ÷ 검사수량. 불량률 높은 순.</p>

      <div style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>기간</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          전체 불량률 <b style={{ color: rateColor(overallRate), fontSize: 15 }}>{overallRate.toFixed(2)}%</b>
          <span style={{ margin: '0 8px', color: '#c9ced6' }}>|</span>
          폐기계 <b style={{ color: '#6b3fb0', fontSize: 14 }}>{won(totals.disposed)}</b>
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th style={{ textAlign: 'center', width: 46 }}>단위</th>
            <th style={{ textAlign: 'right' }}>검사수량</th>
            <th style={{ textAlign: 'right' }}>검사불량</th>
            <th style={{ textAlign: 'right' }}>불량률</th>
            <th style={{ textAlign: 'right' }}>불량처리</th>
            <th style={{ textAlign: 'right' }}>폐기</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>검사·불량 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.itemId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
              <td style={{ textAlign: 'right' }}>{won(r.inspectedQty)}</td>
              <td style={{ textAlign: 'right', color: r.inspectDefect ? '#c60a2e' : '#c5cbd3' }}>{r.inspectDefect ? won(r.inspectDefect) : '-'}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: rateColor(r.defectRate) }}>{r.inspectedQty > 0 ? `${r.defectRate.toFixed(2)}%` : '-'}</td>
              <td style={{ textAlign: 'right', color: r.defectHandled ? '#a5561b' : '#c5cbd3' }}>{r.defectHandled ? won(r.defectHandled) : '-'}</td>
              <td style={{ textAlign: 'right', color: r.disposed ? '#6b3fb0' : '#c5cbd3' }}>{r.disposed ? won(r.disposed) : '-'}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(totals.inspected)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{won(totals.defect)}</td>
              <td style={{ textAlign: 'right', color: rateColor(overallRate) }}>{overallRate.toFixed(2)}%</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(totals.handled)}</td>
              <td style={{ textAlign: 'right', color: '#6b3fb0' }}>{won(totals.disposed)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

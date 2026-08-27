import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { QualityInspection, StockAdjustment } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_FULL_PICKS } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

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
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
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
  const reset = () => { setFrom(''); setTo(''); setKeyword('') }

  return (
    <EcListShell
      title="불량률파악보고서"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_FULL_PICKS}
        dateLabel="기간"
      >
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={keyword} onChange={(v) => setKeyword(v)}
                           items={pickers.items} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        전체 불량률 <b style={{ color: rateColor(overallRate), fontSize: 15 }}>{overallRate.toFixed(2)}%</b>
        <span style={{ margin: '0 8px', color: '#c9ced6' }}>|</span>
        폐기계 <b style={{ color: '#6b3fb0', fontSize: 14 }}>{won(totals.disposed)}</b>
      </div>

      <p className="mb-2 text-xs text-slate-500">품목별 검사 불량률 + 불량처리·폐기 수량 종합. 불량률 = 검사불량 ÷ 검사수량. 불량률 높은 순.</p>

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
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
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

import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { SalesDoc, PurchaseDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 재고 > 일보 (이카운트 E040708 일보)
 * 하루(기준일자)의 영업·구매·입출고를 한 화면에 모은 '일일 운영 다이제스트'.
 * 기간 집계 화면들(재고변동표·판매구매집계표·현황누계표)과 달리 단일 일자에 그날 무슨 일이 있었는지 —
 * 매출/매입 전표와 입고/출고 수량을 전표 단위로 본다. **프론트 전용**(`/sales`+`/purchases`+`/stock/movement` 조합).
 */
interface MovementRow { inQty: number; outQty: number }
const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())

export default function DailyReportPage() {
  const [date, setDate] = useState(today())
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [movement, setMovement] = useState<MovementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, p, m] = await Promise.all([
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<MovementRow[]>('/stock/movement', { params: { from: date, to: date } }),
      ])
      setSales(s.data); setPurchases(p.data); setMovement(m.data)
    } catch (err) { setError(extractErrorMessage(err)); setSales([]); setPurchases([]); setMovement([]) }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [date])

  const daySales = useMemo(() => sales.filter((d) => d.saleDate === date), [sales, date])
  const dayPurch = useMemo(() => purchases.filter((d) => d.purchaseDate === date), [purchases, date])

  const salesSum = daySales.reduce((a, d) => ({ supply: a.supply + d.supplyAmount, total: a.total + d.totalAmount }), { supply: 0, total: 0 })
  const purchSum = dayPurch.reduce((a, d) => ({ supply: a.supply + d.supplyAmount, total: a.total + d.totalAmount }), { supply: 0, total: 0 })
  const moveSum = movement.reduce((a, r) => ({ inQty: a.inQty + Number(r.inQty), outQty: a.outQty + Number(r.outQty) }), { inQty: 0, outQty: 0 })

  const kpis = [
    { label: '매출', sub: `${daySales.length}건`, value: salesSum.total, color: 'var(--ec-blue)' },
    { label: '매입', sub: `${dayPurch.length}건`, value: purchSum.total, color: '#a5561b' },
    { label: '입고수량', sub: '당일', value: moveSum.inQty, color: '#1c7c3c' },
    { label: '출고수량', sub: '당일', value: moveSum.outQty, color: '#c07a00' },
  ]

  const shiftDay = (delta: number) => {
    const d = new Date(date); d.setDate(d.getDate() + delta)
    setDate(ymd(d))
  }

  return (
    <EcListShell title="일보" actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 12.5, color: '#5a626e' }}>
        <span>기준일자</span>
        <button className="ec-btn" onClick={() => shiftDay(-1)}>◀ 전일</button>
        <input type="date" className="ec-input" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
        <button className="ec-btn" onClick={() => shiftDay(1)}>익일 ▶</button>
        <button className="ec-btn" onClick={() => setDate(today())}>금일</button>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* KPI 카드 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ flex: '1 1 0', minWidth: 150, border: '1px solid #e2e6eb', borderRadius: 6, padding: '10px 14px', background: '#fbfcfe' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: k.color }}>{k.label}<span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}> · {k.sub}</span></div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#3c4553', lineHeight: 1.2, marginTop: 4 }}>{won(k.value)}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* 매출 전표 */}
          <div style={{ flex: '1 1 340px', minWidth: 320 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ec-blue)', margin: '0 0 6px' }}>매출 전표 ({daySales.length})</div>
            <table className="w-full text-left">
              <thead>
                <tr><th style={{ width: 34 }}></th><th>전표번호</th><th>매출처</th><th style={{ textAlign: 'right' }}>공급가</th><th style={{ textAlign: 'right' }}>합계</th></tr>
              </thead>
              <tbody>
                {daySales.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>당일 매출 없음</td></tr>
                ) : daySales.map((d, i) => (
                  <tr key={d.id}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace' }}>{d.docNo}</td>
                    <td>{d.partnerName}</td>
                    <td style={{ textAlign: 'right' }}>{won(d.supplyAmount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(d.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              {daySales.length > 0 && (
                <tfoot><tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                  <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
                  <td style={{ textAlign: 'right' }}>{won(salesSum.supply)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(salesSum.total)}</td>
                </tr></tfoot>
              )}
            </table>
          </div>

          {/* 매입 전표 */}
          <div style={{ flex: '1 1 340px', minWidth: 320 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a5561b', margin: '0 0 6px' }}>매입 전표 ({dayPurch.length})</div>
            <table className="w-full text-left">
              <thead>
                <tr><th style={{ width: 34 }}></th><th>전표번호</th><th>매입처</th><th style={{ textAlign: 'right' }}>공급가</th><th style={{ textAlign: 'right' }}>합계</th></tr>
              </thead>
              <tbody>
                {dayPurch.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>당일 매입 없음</td></tr>
                ) : dayPurch.map((d, i) => (
                  <tr key={d.id}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace' }}>{d.docNo}</td>
                    <td>{d.partnerName}</td>
                    <td style={{ textAlign: 'right' }}>{won(d.supplyAmount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{won(d.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              {dayPurch.length > 0 && (
                <tfoot><tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                  <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
                  <td style={{ textAlign: 'right' }}>{won(purchSum.supply)}</td>
                  <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(purchSum.total)}</td>
                </tr></tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </EcListShell>
  )
}

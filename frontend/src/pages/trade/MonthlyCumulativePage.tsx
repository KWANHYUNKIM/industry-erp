import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 영업관리 > 현황누계표 (이카운트 E040709)
 * 연도별 12개월의 당월/누계 매출·매입·이익(추정)을 시계열로 본다.
 * 데이터는 GET /api/sales + /purchases 집계(백엔드 무변경). 이익 = 매출−매입(추정, 원가매칭 아님).
 */

interface MonthRow {
  month: number
  sale: number; saleCum: number
  buy: number; buyCum: number
  profit: number; profitCum: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
const thisYear = () => Number(ymd(new Date()).slice(0, 4))

export default function MonthlyCumulativePage() {
  const [year, setYear] = useState<number>(thisYear())
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 원본 현황누계표의 조건 차례는 <b>창고 · 거래처 · 품목 · 프로젝트</b> 다(사본 실측).
   * 해가 전부였다 — 판매·구매 응답이 셋을 다 보내고 있는데 걸 자리가 없었다.
   */
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  const [project, setProject] = useState('')
  const pickers = useCondPickers(['warehouses', 'partners', 'projects'])

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, b] = await Promise.all([api.get<SalesDoc[]>('/sales'), api.get<PurchaseDoc[]>('/purchases')])
      setSales(s.data); setPurchases(b.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const rows = useMemo<MonthRow[]>(() => {
    const saleByM = new Array(13).fill(0)
    const buyByM = new Array(13).fill(0)
    const keep = (wh: string, pt: string, pj: string | null) =>
      (!warehouse || wh.includes(warehouse))
      && (!partner || pt.includes(partner))
      && (!project || (pj ?? '').includes(project))
    for (const d of sales) {
      if (d.saleDate.slice(0, 4) !== String(year)) continue
      if (!keep(d.warehouseName, d.partnerName, d.projectName)) continue
      saleByM[Number(d.saleDate.slice(5, 7))] += d.supplyAmount
    }
    for (const d of purchases) {
      if (d.purchaseDate.slice(0, 4) !== String(year)) continue
      if (!keep(d.warehouseName, d.partnerName, d.projectName)) continue
      buyByM[Number(d.purchaseDate.slice(5, 7))] += d.supplyAmount
    }
    const out: MonthRow[] = []
    let saleCum = 0, buyCum = 0, profitCum = 0
    for (let m = 1; m <= 12; m++) {
      const sale = saleByM[m], buy = buyByM[m], profit = sale - buy
      saleCum += sale; buyCum += buy; profitCum += profit
      out.push({ month: m, sale, saleCum, buy, buyCum, profit, profitCum })
    }
    return out
  }, [sales, purchases, year, warehouse, partner, project])

  const years = [thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2]
  const yTotal = rows.length ? rows[rows.length - 1] : null

  return (
    <EcListShell
      title="현황누계표"
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">월별 당월·누계 매출·매입·이익(추정). 이익 = 매출공급가 − 매입공급가(원가매칭 아님).</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>연도</span>
        <select className="ec-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        {/* 원본 조건 차례: 창고 · 거래처 · 품목 · 프로젝트 */}
        <CodePickerField label="창고" width={150} emptyLabel="전체"
                         value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        <CodePickerField label="거래처" width={150} emptyLabel="전체"
                         value={partner} onChange={setPartner} items={pickers.partners} />
        <CodePickerField label="프로젝트" width={150} emptyLabel="전체"
                         value={project} onChange={setProject} items={pickers.projects} />
        {yTotal && (
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
            연매출 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(yTotal.saleCum)}</b>
            <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
            연이익 <b style={{ color: yTotal.profitCum >= 0 ? '#1c7c3c' : '#c60a2e', fontSize: 14 }}>{won(yTotal.profitCum)}</b>
          </span>
        )}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 60 }}>월</th>
            <th style={{ textAlign: 'right' }}>당월매출</th>
            <th style={{ textAlign: 'right' }}>누계매출</th>
            <th style={{ textAlign: 'right' }}>당월매입</th>
            <th style={{ textAlign: 'right' }}>누계매입</th>
            <th style={{ textAlign: 'right' }}>당월이익</th>
            <th style={{ textAlign: 'right' }}>누계이익</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.map((r) => (
            <tr key={r.month}>
              <td style={{ fontWeight: 600 }}>{r.month}월</td>
              <td style={{ textAlign: 'right', color: r.sale ? undefined : '#c5cbd3' }}>{r.sale ? won(r.sale) : '-'}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.saleCum)}</td>
              <td style={{ textAlign: 'right', color: r.buy ? undefined : '#c5cbd3' }}>{r.buy ? won(r.buy) : '-'}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{won(r.buyCum)}</td>
              <td style={{ textAlign: 'right', color: r.profit === 0 ? '#c5cbd3' : r.profit > 0 ? '#1c7c3c' : '#c60a2e' }}>{r.profit ? won(r.profit) : '-'}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.profitCum >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(r.profitCum)}</td>
            </tr>
          ))}
        </tbody>
        {yTotal && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td>연간</td>
              <td style={{ textAlign: 'right' }}>{won(yTotal.saleCum)}</td>
              <td></td>
              <td style={{ textAlign: 'right' }}>{won(yTotal.buyCum)}</td>
              <td></td>
              <td style={{ textAlign: 'right', color: yTotal.profitCum >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(yTotal.profitCum)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

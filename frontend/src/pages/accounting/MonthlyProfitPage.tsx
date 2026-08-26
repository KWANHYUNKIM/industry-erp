import { useRef, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { costOf, type CostBasis } from '../../utils/costBasis'
import { ymd } from '../../components/EcPeriodPicks'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

/**
 * 이익관리 > 월별이익현황
 *
 * 일별이익현황과 <b>같은 결함</b>이 있었다 — `/api/profit/monthly` 는 그 달의 <b>매입액</b>을
 * 원가로 놓는다. 자재를 몰아 사들인 달은 잘 팔았어도 적자로 찍힌다.
 * 이익은 판 물건의 원가로 재야 한다: 이익 = 판매액 − (판매수량 × 원가단가).
 *
 * 원가 기준은 일별이익현황(C000140)에서 <b>실측한</b> 것을 그대로 쓴다.
 *
 * <p>조건 판은 한동안 실측을 못 해 미뤄 뒀는데, 원본 화면 사본으로 대조했다.
 * 원본 [구분]은 <b>품목별 | 거래처별 | 품목별거래처별 | 거래처별품목별</b> 넷이고,
 * 우리에겐 뒤 둘이 없었다. '월별'은 원본에 없는 우리 것이라 맨 뒤에 남긴다 —
 * 월별이익현황이니 달을 접어 보는 쪽도 쓸모가 있다.
 */
type Mode = '품목별' | '거래처별' | '품목별거래처별' | '거래처별품목별' | '월별'
const MODES = ['품목별', '거래처별', '품목별거래처별', '거래처별품목별', '월별'] as const
/**
 * 원가 기준.
 *
 * <p>원본 실측: [원가] 선입선출(판매) | 월별원가 | <b>입고단가(품목)</b> | 입고단가(품목) - VAT 제외
 *
 * <p>우리 '품목단가' 가 원본의 '입고단가(품목)' 에 해당하는데, 품목 단가가 하나뿐이던 시절
 * <b>판매단가</b>를 읽고 있었다. 원가에 판매가를 넣으면 이익이 0 근처로 나오는데
 * 숫자가 그럴듯해서 눈으로는 안 걸린다. 이제 품목의 구매단가를 읽는다.
 * 구매단가를 안 정한 품목(0)은 기준이 없는 것이므로 원가·이익을 '—' 로 둔다.
 *
 * <p>선입선출은 아직 없다 — 로트별 입고원가를 따라가야 해서 자료가 더 필요하다.
 */
type Basis = CostBasis

interface CostRow { itemId: number; period: string; standardTotal: number }
interface PurchaseLite { purchaseDate: string; lines: { itemId: number; unitPrice: number }[] }

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const num = (n: number) => n.toLocaleString()
const rate = (profit: number, revenue: number) => (revenue === 0 ? 0 : Math.round((profit / revenue) * 1000) / 10)
const nowYear = () => Number(ymd(new Date()).slice(0, 4))

export default function MonthlyProfitPage() {
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseLite[]>([])
  /** 품목별 <b>구매단가</b>. 원가 기준 '입고단가(품목)' 이 쓴다. 0 이면 기준 없음. */
  const [unitPrices, setUnitPrices] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [year, setYear] = useState(nowYear())
  const [mode, setMode] = useState<Mode>('품목별')
  const [basis, setBasis] = useState<Basis>('입고단가(품목)')
  const [withVat, setWithVat] = useState(false)

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<SalesDoc[]>('/sales'),
      api.get<CostRow[]>('/costs'),
      api.get<PurchaseLite[]>('/purchases'),
      // 원가 기준 '입고단가(품목)' 은 구매단가다. 판매단가(unitPrice)가 아니다.
      api.get<{ id: number; purchasePrice: number }[]>('/items'),
    ])
      .then(([s, c, p, i]) => {
        setSales(s.data); setCosts(c.data); setPurchases(p.data)
        setUnitPrices(new Map(i.data.map((it) => [it.id, it.purchasePrice])))
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const costByItemPeriod = useMemo(
    () => new Map(costs.map((c) => [`${c.itemId}:${c.period}`, c.standardTotal])), [costs])

  const lastPurchasePrice = useMemo(() => {
    const m = new Map<number, { date: string; price: number }>()
    purchases.forEach((d) => d.lines.forEach((l) => {
      const cur = m.get(l.itemId)
      if (!cur || d.purchaseDate >= cur.date) m.set(l.itemId, { date: d.purchaseDate, price: l.unitPrice })
    }))
    return m
  }, [purchases])

  /** 원가단가. 규칙은 utils/costBasis 에 있다 — 거기서 못 박아 두고 여기서는 잇기만 한다. */
  const costPrice = (itemId: number, saleDate: string): number | null => costOf(basis, {
    monthlyCost: costByItemPeriod.get(`${itemId}:${saleDate.slice(0, 7)}`) ?? null,
    lastPurchasePrice: lastPurchasePrice.get(itemId)?.price ?? null,
    itemPurchasePrice: unitPrices.get(itemId) ?? null,
  })

  const lines = useMemo(() => sales
    .filter((d) => d.saleDate.slice(0, 4) === String(year))
    .flatMap((d) => d.lines.map((l) => {
      const revenue = withVat ? l.supplyAmount + l.vatAmount : l.supplyAmount
      const price = costPrice(l.itemId, d.saleDate)
      const cost = price === null ? null : price * l.quantity
      return {
        month: d.saleDate.slice(0, 7),
        partnerId: d.partnerId, partnerName: d.partnerName,
        itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName,
        quantity: l.quantity, revenue, cost,
        profit: cost === null ? null : revenue - cost,
      }
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sales, year, withVat, basis, costByItemPeriod, lastPurchasePrice, unitPrices])

  const rows = useMemo(() => {
    const keyOf = (l: typeof lines[number]) =>
      mode === '월별' ? l.month
        : mode === '품목별' ? String(l.itemId)
          : mode === '거래처별' ? String(l.partnerId)
            : mode === '거래처별품목별' ? `${l.partnerId}:${l.itemId}`
              : `${l.itemId}:${l.partnerId}`
    const labelOf = (l: typeof lines[number]) =>
      mode === '월별' ? [`${Number(l.month.slice(5))}월`, '', '']
        : mode === '품목별' ? [l.itemCode, l.itemName, '']
          : mode === '거래처별' ? [l.partnerName, '', '']
            : mode === '거래처별품목별' ? [l.partnerName, l.itemCode, l.itemName]
              : [l.itemCode, l.itemName, l.partnerName]

    const m = new Map<string, { key: string; label: string[]; qty: number; revenue: number; cost: number | null; profit: number | null; count: number }>()
    lines.forEach((l) => {
      const k = keyOf(l)
      const g = m.get(k) ?? { key: k, label: labelOf(l), qty: 0, revenue: 0, cost: 0, profit: 0, count: 0 }
      g.qty += l.quantity
      g.revenue += l.revenue
      // 한 줄이라도 원가를 모르면 그 묶음의 원가·이익은 알 수 없다.
      if (l.cost === null || g.cost === null) { g.cost = null; g.profit = null }
      else { g.cost += l.cost; g.profit = (g.profit ?? 0) + (l.profit ?? 0) }
      g.count += 1
      m.set(k, g)
    })
    return [...m.values()].sort((a, b) => (mode === '월별' ? (a.key < b.key ? -1 : 1) : b.revenue - a.revenue))
  }, [lines, mode])

  const known = lines.filter((l) => l.cost !== null)
  const totals = {
    revenue: lines.reduce((n, l) => n + l.revenue, 0),
    knownRevenue: known.reduce((n, l) => n + l.revenue, 0),
    cost: known.reduce((n, l) => n + (l.cost ?? 0), 0),
    profit: known.reduce((n, l) => n + (l.profit ?? 0), 0),
    qty: lines.reduce((n, l) => n + l.quantity, 0),
  }
  const unknownCost = lines.length - known.length
  const allUnknown = lines.length > 0 && known.length === 0

  const years = [nowYear(), nowYear() - 1, nowYear() - 2]
  /** 구분마다 앞쪽 라벨 열이 다르다. 열 수가 바뀌므로 한 곳에서 정한다. */
  const HEADS: Record<Mode, string[]> = {
    품목별: ['품목코드', '품목명'],
    거래처별: ['거래처'],
    품목별거래처별: ['품목코드', '품목명', '거래처'],
    거래처별품목별: ['거래처', '품목코드', '품목명'],
    월별: ['월'],
  }
  const heads = HEADS[mode]
  const colCount = 1 + heads.length + 1 + 4

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '월별이익현황', [mode, basis, withVat, rows.length])

  return (
    <EcListShell
      title="월별이익현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>연도</span>
        <select className="ec-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)', marginLeft: 8 }}>구분</span>
        <div className="ec-pills">
          {MODES.map((m) => (
            <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                    onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)', marginLeft: 8 }}>판매액</span>
        <div className="ec-pills">
          {([['공급가액', false], ['공급가액+VAT', true]] as const).map(([label, v]) => (
            <button key={label} type="button" className={`ec-pill no-ec${withVat === v ? ' active' : ''}`}
                    onClick={() => setWithVat(v)}>{label}</button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)', marginLeft: 8 }}>원가</span>
        <div className="ec-pills">
          {(['월별원가', '최종구매가', '입고단가(품목)'] as const).map((b) => (
            <button key={b} type="button" className={`ec-pill no-ec${basis === b ? ' active' : ''}`}
                    onClick={() => setBasis(b)}>{b}</button>
          ))}
        </div>
      </div>

      {unknownCost > 0 && (
        <p style={{ marginBottom: 8, background: '#fff7e6', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          <b>{num(unknownCost)}</b>개 라인의 {basis} 를 찾지 못했습니다. 그 줄의 원가·이익은 <b>'—'</b> 로 두고
          합계에서도 뺐습니다 — 0 으로 채우면 이익이 매출 전액으로 부풀어 오릅니다.
        </p>
      )}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        판매액 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.revenue)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        원가 <b style={{ color: allUnknown ? '#c9ced6' : '#a5561b', fontSize: 14 }}>{allUnknown ? '—' : won(totals.cost)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        이익 <b style={{ color: allUnknown ? '#c9ced6' : totals.profit < 0 ? '#c60a2e' : '#1c7c3c', fontSize: 14 }}>
          {allUnknown ? '—' : won(totals.profit)}
        </b>
        {!allUnknown && <span style={{ color: '#9aa1ab' }}> ({rate(totals.profit, totals.knownRevenue)}%)</span>}
      </div>

      <div ref={tableRef} className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              {heads.map((h) => <th key={h}>{h}</th>)}
              <th style={{ textAlign: 'right', width: 70 }}>건수</th>
              <th style={{ textAlign: 'right', width: 90 }}>수량</th>
              <th style={{ textAlign: 'right', width: 130 }}>판매액</th>
              <th style={{ textAlign: 'right', width: 130 }}>원가</th>
              <th style={{ textAlign: 'right', width: 140 }}>이익 (이익률)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r, i) => {
              const color = r.profit === null ? '#c9ced6' : r.profit > 0 ? '#1c7c3c' : r.profit < 0 ? '#c60a2e' : undefined
              return (
                <tr key={r.key}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  {heads.map((h, hi) => (
                    <td key={h} style={hi === 0 && mode === '품목별' ? { fontFamily: 'monospace' } : undefined}>
                      {r.label[hi]}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(r.count)}</td>
                  <td style={{ textAlign: 'right' }}>{num(r.qty)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(r.revenue)}</td>
                  <td style={{ textAlign: 'right', color: r.cost === null ? '#c9ced6' : '#a5561b' }}>
                    {r.cost === null ? '—' : won(r.cost)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color }}>
                    {r.profit === null ? '—' : (
                      <>
                        {won(r.profit)}
                        <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}> ({rate(r.profit, r.revenue)}%)</span>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={colCount - 4} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.qty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{won(totals.revenue)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: allUnknown ? '#c9ced6' : '#a5561b' }}>
                  {allUnknown ? '—' : won(totals.cost)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: allUnknown ? '#c9ced6' : totals.profit < 0 ? '#c60a2e' : '#1c7c3c' }}>
                  {allUnknown ? '—' : (
                    <>
                      {won(totals.profit)}
                      <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}> ({rate(totals.profit, totals.knownRevenue)}%)</span>
                    </>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}

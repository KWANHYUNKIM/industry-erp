import { useRef, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { SalesDoc, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { costOf, sumExtraCost, type CostBasis } from '../../utils/costBasis'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

/**
 * 이익관리 > 일별이익현황 (이카운트 C000140)
 *
 * <b>이 화면의 이익 계산이 틀려 있었다.</b> `/api/profit/daily` 는 <b>그날의 매입액</b>을 원가로
 * 놓는다. 그러면 자재를 왕창 사들인 날은 이익이 크게 마이너스로 찍힌다 — 그날 잘 팔았어도.
 * 이익은 <b>판 물건의 원가</b>로 재야 한다. 원본이 하는 것도 그것이고, [원가] 조건이 있는 이유다.
 *
 * 그래서 판매 라인에서 직접 계산한다: 이익 = 판매액 − (판매수량 × 원가단가).
 * 매출과 매입을 나란히 보는 것 자체는 뜻이 있지만 그건 일보·판매구매집계표가 하는 일이고,
 * 그 값에 '이익'이라는 이름을 붙이면 안 된다.
 *
 * 원본 조건: 구분(라인별·품목별·거래처별·품목별거래처별·거래처별품목별·사용자지정집계) ·
 * 기준일자 · 창고 · 프로젝트 · 거래처 · 품목 · 판매액(공급가액 / 공급가액+VAT) ·
 * 원가(선입선출(판매) / 월별원가 / 입고단가(품목) / 입고단가(품목)-VAT제외) ·
 * 기타(결재방표시 / 수량관리제외품목포함) · 거래구분(전체 / 반품만 / 반품제외).
 *
 * 우리에게 없는 것과 이유:
 *   선입선출 — 입고 레이어를 남기지 않아 계산할 수 없다(일별재고현황과 같다)
 *   사용자지정집계 — 집계축을 사용자가 정의하는 기능이 없다
 *   거래구분 — 우리 판매전표에 반품 개념이 없다(수량이 항상 양수다)
 *   결재방표시·수량관리제외품목 — 대응 개념이 없다
 * 대신 원본에 없는 <b>일자별</b>을 구분에 넣었다 — 화면 이름이 '일별'이라 하루 단위 줄이 있어야 한다.
 *
 * <p><b>원본 결과 열 실측(사본)</b>: 품목코드 · 품목명[규격] · 판매(수량·단가·금액) ·
 * 원가 · 이익 · 이익율 · <b>이익금액(부대비용포함)</b> · <b>판매부대비용</b>.
 * 뒤 두 열이 우리에게 없었다. 부대비용은 전표 합계에 더하지 않는다 — 거래처에 청구한
 * 돈이 아니라 우리가 쓴 돈이다. 그래서 판매액에는 안 들어가는데 <b>이익에서도 안 빠지고</b>
 * 있었다. 운반비를 쓸수록 이익이 좋아 보인다는 뜻이다.
 */
/**
 * [구분]. 원본 일별이익현황 사본 실측:
 *   라인별 | 품목별 | 거래처별 | 품목별거래처별 | 거래처별품목별 | 사용자지정집계
 * 우리에겐 거래처별품목별이 없었다 — 품목별거래처별과 <b>묶는 순서가 반대</b>다.
 * 같은 거래처의 품목을 나란히 보려면 이쪽이라야 한다.
 *
 * <p>'일자별' 은 원본에 없는 우리 것이다. 일별이익현황이니 하루 단위로 접어 보는 쪽이
 * 쓸모가 있어 맨 뒤에 남겼다. '사용자지정집계'(저장해 둔 집계 조합)는 아직 없다.
 */
type Mode = '라인별' | '품목별' | '거래처별' | '품목별거래처별' | '거래처별품목별' | '일자별'
const MODES = ['라인별', '품목별', '거래처별', '품목별거래처별', '거래처별품목별', '일자별'] as const
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
interface PurchaseLite {
  purchaseDate: string
  lines: { itemId: number; unitPrice: number }[]
}

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const num = (n: number) => n.toLocaleString()
const rate = (profit: number, revenue: number) => (revenue === 0 ? 0 : Math.round((profit / revenue) * 1000) / 10)

export default function DailyProfitPage() {
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseLite[]>([])
  /** 품목별 <b>구매단가</b>. 원가 기준 '입고단가(품목)' 이 쓴다. 0 이면 기준 없음. */
  const [unitPrices, setUnitPrices] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [mode, setMode] = useState<Mode>('라인별')
  const [basis, setBasis] = useState<Basis>('입고단가(품목)')
  const [withVat, setWithVat] = useState(false)
  // 원본 기본값이 금월(~오늘)이다.
  const init = periodOf('금월(~오늘)', new Date()) ?? { from: ymd(new Date()), to: ymd(new Date()) }
  const [cond, setCond] = useState({ from: init.from, to: init.to, warehouseId: '', project: '', partner: '', item: '' })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<SalesDoc[]>('/sales'),
      api.get<Warehouse[]>('/warehouses'),
      api.get<CostRow[]>('/costs'),
      api.get<PurchaseLite[]>('/purchases'),
      // 원가 기준 '입고단가(품목)' 은 <b>구매단가</b>다. 판매단가(unitPrice)가 아니다.
      api.get<{ id: number; purchasePrice: number }[]>('/items'),
    ])
      .then(([s, w, c, p, i]) => {
        setSales(s.data); setWarehouses(w.data); setCosts(c.data); setPurchases(p.data)
        setUnitPrices(new Map(i.data.map((it) => [it.id, it.purchasePrice])))
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  /** 월별원가는 판매한 <b>그 달</b>의 표준원가를 쓴다 — 기간이 여러 달에 걸쳐도 맞게. */
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

  /** 조건을 통과한 판매 라인 하나하나. 모든 구분이 여기서 갈라져 나간다. */
  const lines = useMemo(() => sales
    .filter((d) => !cond.from || d.saleDate >= cond.from)
    .filter((d) => !cond.to || d.saleDate <= cond.to)
    .filter((d) => !cond.warehouseId || String(d.warehouseId) === cond.warehouseId)
    .filter((d) => !cond.project || (d.projectName ?? '').includes(cond.project))
    .filter((d) => !cond.partner || d.partnerName.includes(cond.partner))
    .flatMap((d) => d.lines
      .filter((l) => !cond.item || l.itemName.includes(cond.item) || l.itemCode.includes(cond.item))
      .map((l) => {
        const revenue = withVat ? l.supplyAmount + l.vatAmount : l.supplyAmount
        const price = costPrice(l.itemId, d.saleDate)
        const cost = price === null ? null : price * l.quantity
        return {
          key: `${d.id}-${l.itemId}-${l.lotNo ?? ''}`,
          date: d.saleDate, docNo: d.docNo,
          partnerId: d.partnerId, partnerName: d.partnerName,
          itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
          quantity: l.quantity, revenue, cost,
          profit: cost === null ? null : revenue - cost,
          /** 판매부대비용. 원본 [판매부대비용] 열. 안 적었으면 0 이다. */
          extraCost: Number(l.extraCost ?? 0),
        }
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sales, cond, withVat, basis, costByItemPeriod, lastPurchasePrice, unitPrices])

  /** 구분에 따라 묶는다. 라인별은 안 묶고, 나머지는 키를 만들어 합친다. */
  const rows = useMemo(() => {
    if (mode === '라인별') {
      return lines.map((l) => ({
        key: l.key, c1: l.date.replace(/-/g, '/'), c2: l.docNo, c3: l.partnerName, c4: l.itemName,
        qty: l.quantity, revenue: l.revenue, cost: l.cost, profit: l.profit, count: 1,
        extra: l.extraCost,
      }))
    }
    const keyOf = (l: typeof lines[number]) =>
      mode === '일자별' ? l.date
        : mode === '품목별' ? String(l.itemId)
          : mode === '거래처별' ? String(l.partnerId)
            : mode === '거래처별품목별' ? `${l.partnerId}:${l.itemId}`
              : `${l.itemId}:${l.partnerId}`
    const labelOf = (l: typeof lines[number]) =>
      mode === '일자별' ? [l.date.replace(/-/g, '/'), '', '', '']
        : mode === '품목별' ? [l.itemCode, l.itemName, '', '']
          : mode === '거래처별' ? [l.partnerName, '', '', '']
            : mode === '거래처별품목별' ? [l.partnerName, l.itemCode, l.itemName, '']
              : [l.itemCode, l.itemName, l.partnerName, '']

    const m = new Map<string, { key: string; label: string[]; qty: number; revenue: number; cost: number | null; profit: number | null; count: number; extra: number }>()
    lines.forEach((l) => {
      const k = keyOf(l)
      const g = m.get(k) ?? { key: k, label: labelOf(l), qty: 0, revenue: 0, cost: 0, profit: 0, count: 0, extra: 0 }
      g.qty += l.quantity
      g.revenue += l.revenue
      // 부대비용은 원가를 알든 모르든 다 더한다 — 실제로 쓴 돈이라 빼면 거짓이 된다.
      g.extra += l.extraCost
      // 한 줄이라도 원가를 모르면 그 묶음의 원가·이익은 알 수 없다 — 아는 것만 더해 놓고 맞다고 하면 안 된다.
      if (l.cost === null || g.cost === null) { g.cost = null; g.profit = null }
      else { g.cost += l.cost; g.profit = (g.profit ?? 0) + (l.profit ?? 0) }
      g.count += 1
      m.set(k, g)
    })
    return [...m.values()]
      .sort((a, b) => (mode === '일자별' ? (a.key < b.key ? -1 : 1) : b.revenue - a.revenue))
      .map((g) => ({ key: g.key, c1: g.label[0], c2: g.label[1], c3: g.label[2], c4: g.label[3], qty: g.qty, revenue: g.revenue, cost: g.cost, profit: g.profit, count: g.count, extra: g.extra }))
  }, [lines, mode])

  /**
   * 판매액은 모든 라인이 알 수 있지만 원가·이익은 <b>원가를 아는 라인만</b> 더한다.
   * 이익률까지 전체 판매액으로 나누면 원가를 모르는 만큼 이익률이 좋아 보인다 —
   * 그래서 비율은 아는 라인의 판매액(knownRevenue)으로 낸다.
   */
  const known = lines.filter((l) => l.cost !== null)
  const totals = {
    revenue: lines.reduce((n, l) => n + l.revenue, 0),
    knownRevenue: known.reduce((n, l) => n + l.revenue, 0),
    cost: known.reduce((n, l) => n + (l.cost ?? 0), 0),
    profit: known.reduce((n, l) => n + (l.profit ?? 0), 0),
  }
  /** 판매부대비용과 그것을 뺀 이익. 규칙은 utils/costBasis 에 못 박아 뒀다. */
  const extraTotals = sumExtraCost(lines.map((l) => ({ profit: l.profit, extraCost: l.extraCost })))

  const unknownCost = lines.length - known.length
  const allUnknown = lines.length > 0 && known.length === 0

  const reset = () => {
    setMode('라인별'); setBasis('입고단가(품목)'); setWithVat(false)
    setCond({ from: init.from, to: init.to, warehouseId: '', project: '', partner: '', item: '' })
  }

  /** 구분마다 앞쪽 라벨 열이 다르다. 열 수가 바뀌므로 한 곳에서 정한다. */
  const HEADS: Record<Mode, string[]> = {
    일자별: ['일자'],
    라인별: ['일자', '전표번호', '거래처', '품목'],
    품목별: ['품목코드', '품목명'],
    거래처별: ['거래처'],
    품목별거래처별: ['품목코드', '품목명', '거래처'],
    거래처별품목별: ['거래처', '품목코드', '품목명'],
  }
  const heads = HEADS[mode]
  const colCount = 1 + heads.length + (mode === '일자별' || mode === '거래처별' ? 1 : 0) + 6

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '일별이익현황', [mode, basis, withVat, rows.length])

  return (
    <EcListShell
      title="일별이익현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {MODES.map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <select className="ec-input" value={cond.warehouseId}
                  onChange={(e) => setC({ warehouseId: e.target.value })} style={{ width: 220 }}>
            <option value="">전체</option>
            {warehouses.map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="프로젝트" pick>
          <input className="ec-input" placeholder="프로젝트명 일부" value={cond.project}
                 onChange={(e) => setC({ project: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <input className="ec-input" placeholder="거래처명 일부" value={cond.partner}
                 onChange={(e) => setC({ partner: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="품목" pick>
          <input className="ec-input" placeholder="품목명·코드 일부" value={cond.item}
                 onChange={(e) => setC({ item: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="판매액">
          <div className="ec-pills">
            {([['공급가액', false], ['공급가액+VAT', true]] as const).map(([label, v]) => (
              <button key={label} type="button" className={`ec-pill no-ec${withVat === v ? ' active' : ''}`}
                      onClick={() => setWithVat(v)}>
                {label}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="원가">
          <div className="ec-pills">
            {(['월별원가', '최종구매가', '입고단가(품목)'] as const).map((b) => (
              <button key={b} type="button" className={`ec-pill no-ec${basis === b ? ' active' : ''}`}
                      onClick={() => setBasis(b)}>
                {b}
              </button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {unknownCost > 0 && (
        <p style={{ marginBottom: 8, background: '#fff7e6', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          <b>{num(unknownCost)}</b>개 라인의 {basis} 를 찾지 못했습니다. 그 줄의 원가·이익은 <b>'—'</b> 로 두고
          합계에서도 뺐습니다 — 0 으로 채우면 이익이 매출 전액으로 부풀어 오릅니다.
        </p>
      )}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {mode === '라인별' ? '라인' : '줄'} <b style={{ color: '#3c4553' }}>{num(rows.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
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
              {(mode === '일자별' || mode === '거래처별') && <th style={{ textAlign: 'right', width: 70 }}>건수</th>}
              <th style={{ textAlign: 'right', width: 90 }}>수량</th>
              <th style={{ textAlign: 'right', width: 120 }}>판매액</th>
              <th style={{ textAlign: 'right', width: 120 }}>원가</th>
              <th style={{ textAlign: 'right', width: 130 }}>이익 (이익률)</th>
              <th style={{ textAlign: 'right', width: 120 }}>판매부대비용</th>
              <th style={{ textAlign: 'right', width: 140 }}>이익금액(부대비용포함)</th>
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
                    <td key={h} style={hi === 0 && (mode === '품목별' || mode === '품목별거래처별') ? { fontFamily: 'monospace' } : undefined}>
                      {[r.c1, r.c2, r.c3, r.c4][hi]}
                    </td>
                  ))}
                  {(mode === '일자별' || mode === '거래처별') && (
                    <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(r.count)}</td>
                  )}
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
                  <td style={{ textAlign: 'right', color: r.extra === 0 ? '#c9ced6' : '#a5561b' }}>
                    {r.extra === 0 ? '—' : won(r.extra)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: r.profit === null ? '#c9ced6' : (r.profit - r.extra) < 0 ? '#c60a2e' : '#1c7c3c' }}>
                    {r.profit === null ? '—' : won(r.profit - r.extra)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={colCount - 6} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>
                  {num(rows.reduce((n, r) => n + r.qty, 0))}
                </td>
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
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: extraTotals.extra === 0 ? '#c9ced6' : '#a5561b' }}>
                  {extraTotals.extra === 0 ? '—' : won(extraTotals.extra)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: allUnknown ? '#c9ced6' : extraTotals.profitWithExtra < 0 ? '#c60a2e' : '#1c7c3c' }}>
                  {allUnknown ? '—' : won(extraTotals.profitWithExtra)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}

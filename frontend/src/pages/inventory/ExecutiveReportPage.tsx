import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, PartnerBalance, PurchaseDoc, SalesDoc, StockRow } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { stockCostMapFromLast, sumStockValue } from '../../utils/stockValue'
import { INQUIRY_FULL_PICKS, periodOf } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'

/**
 * 재고 > 경영자보고서 (이카운트 E040704)
 * 기간 매출·매입·이익과 재고자산·채권/채무를 한 화면에 종합하는 요약 리포트.
 * 데이터는 GET /api/sales, /purchases, /stock, /items, /ledger/partner-balances 를 조합(백엔드 무변경).
 *
 * 매출총이익은 (기간 매출공급가 − 기간 매입공급가)로 낸 <b>추정치</b>다. 원가 매칭이 아닌
 * 기간 매입 기준이라 실제 매출원가와 다를 수 있어 '추정'으로 표기한다. 정밀 손익은 이익관리 화면 참조.
 */

const won = (n: number) => n.toLocaleString('ko-KR')
/*
 * 원본 경영자보고서의 [기준일자] 기본값은 <b>금월(~오늘)</b> 이다(2026-09-08 실측).
 *
 * <p><b>2026-09-09 에 다시 열어 대조했다 — 그대로 맞다.</b> 조건은 [기준일자]와 [기타]
 * 둘뿐이고 [기타] 안에는 <b>[결재방표시]</b> 체크박스 하나가 <b>꺼진 채</b>로 있다.
 * (그 체크박스의 <code>data-ecpath</code> 가 <code>ESZ005R_…∫cbRptConfirm∫EtcChk</code> 라,
 * 예전에 화면코드로 잘못 박아 두었던 ESZ005R 이 <b>양식의 내부 id</b> 였음도 다시 확인된다.
 * 메뉴가 여는 코드는 <b>E040704</b> 다.)
 * 기본값을 <code>ecount-checkbox-default.json</code> 에 적어 못 박았다.
 * 값은 여태 쓰던 것과 같지만, 검사가 읽을 수 있게 <code>periodOf</code> 로 적는다 —
 * 손으로 만든 날짜 문자열은 '어느 빠른선택인지' 를 아무 데도 말해 주지 않는다.
 */
const firstOfMonth = () => periodOf('금월(~오늘)')!.from
/** 원본은 날짜를 <b>2026/09/09</b> 꼴로 적는다. */
const dot = (d: string) => d.replace(/-/g, '/')

interface NameAmt { key: string; name: string; amount: number }

/**
  * <b>기준일에서 1년 뒤로.</b> 원본 격자에서 이 구간을 쓰는 줄은 <b>넷</b>이다 —
  * [미판매금액] · [미입고금액] · [미청구액 (판매)] · [미청구액 (구매)].
  * 넷 다 칸에 <code>2025/09/09 ~ 2026/09/09</code> 가 적힌다(2026-09-09 실측).
  * 남아 있는 주문·발주는 그 달에 낸 것만 세면 뜻이 없어서다 — 반 년 전에 받고
  * 아직 못 판 주문이 진짜 미판매다.
  */
const yearBefore = (d: string) => {
  const t = new Date(d)
  t.setFullYear(t.getFullYear() - 1)
  return t.toISOString().slice(0, 10)
}

/** 미판매 한 줄. 미판매현황이 보는 것과 같은 자리다. */
interface UnsoldLine { orderDate: string; unsoldAmount: number }
/** 입고로 안 넘어간 발주. 미입고현황과 같은 규칙으로 거른다. */
type OpenPoStatus = 'REQUESTED' | 'PLANNED' | 'PRICED' | 'ORDERED'
const OPEN_PO: string[] = ['REQUESTED', 'PLANNED', 'PRICED', 'ORDERED']
interface PurchaseOrderRow {
  orderDate: string; status: OpenPoStatus | string
  lines: { supplyAmount: number }[]
}
/** 할인 한 줄. /sales/discounts · /purchases/discounts 가 이미 내주고 있었다. */
interface DiscountRow { date: string; discountAmount: number }
/** 재고조정·자가사용 한 줄. 금액이 없어 수량 × 취득원가로 낸다. */
interface AdjustRow { adjustDate: string; type: string; itemId: number; quantityChange: number }

export default function ExecutiveReportPage() {
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  /* 평가단가 지도만 쓰는 자리 — 전표는 위 purchases 가 따로 든다(기간 매입액). */
  const [lastPrices, setLastPrices] = useState<{ itemId: number; unitPrice: number }[]>([])
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [balances, setBalances] = useState<PartnerBalance[]>([])
  const [unsold, setUnsold] = useState<UnsoldLine[]>([])
  const [openPo, setOpenPo] = useState<PurchaseOrderRow[]>([])
  const [saleDisc, setSaleDisc] = useState<DiscountRow[]>([])
  const [buyDisc, setBuyDisc] = useState<DiscountRow[]>([])
  const [adjusts, setAdjusts] = useState<AdjustRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(periodOf('금월(~오늘)')!.to)

  async function load() {
    setLoading(true); setError('')
    try {
      const y = yearBefore(to)
      const [s, b, lp, st, it, bal, un, po, sd, bd, adj] = await Promise.all([
        /*
         * <b>판매는 기간을 서버에 넘긴다.</b> 여태 전 기간을 받아 아래 salesP 에서 걸렀다 —
         * 이 화면 하나가 판매 전표 <b>전부</b>를 실어 오고 있었다(개발 자료에서도 1,900줄·1.7MB).
         * 화면이 판매로 하는 일은 기간 매출을 세는 것뿐이라 좁혀도 숫자가 달라지지 않는다.
         *
         * <p><b>구매도 이제 좁힌다.</b> 예전에는 "구매는 못 좁힌다 — 평가단가를 지난 입고
         * 이력 전부로 내야 한다" 고 적혀 있었다. 그 지도를 <code>/purchases/item-prices</code>
         * 로 옮긴 뒤로는(2026-09-10) 이 전표가 하는 일이 <b>기간 매입액을 세는 것뿐</b>이라,
         * 아래 buyP 가 보는 창을 서버에도 그대로 준다.
         */
        api.get<SalesDoc[]>('/sales', { params: { from, to } }),
        api.get<PurchaseDoc[]>('/purchases', { params: { from, to } }),
        api.get<{ itemId: number; unitPrice: number }[]>('/purchases/item-prices'),
        api.get<StockRow[]>('/stock'),
        api.get<Item[]>('/items'),
        /*
         * <b>기준일자 끝 시점</b>의 잔액을 받는다. 여태 시점을 안 넘겨 늘 '지금' 잔액이
         * 나왔다 — 지난달을 조회해도 이번 달 수금까지 반영된 숫자가 카드에 떴다.
         */
        api.get<PartnerBalance[]>('/ledger/partner-balances', { params: { asOf: to } }),
        /*
         * 아래 다섯은 <b>다른 화면이 이미 보고 있던 자리</b>다 —
         * 미판매현황 · 미입고현황 · 판매할인현황 · 구매할인현황 · 재고조정/자가사용현황.
         * 경영자보고서가 그 값을 안 불러와서 원본 격자의 여섯 줄이 통째로 비어 있었다.
         */
        api.get<UnsoldLine[]>('/sales-orders/unsold', { params: { from: y, to } }),
        /*
         * <b>이 줄이 보는 기간을 서버에도 보낸다.</b> 여기 "미입고 발주는 기간과 무관한
         * 지금 상태다" 라고 적혀 있었는데 <b>사실이 아니었다</b> — 아래 unreceivedAmt 가
         * <code>orderDate &gt;= yearBefore(to) &amp;&amp; &lt;= to</code> 로 <b>이미 자르고 있고</b>,
         * 표에도 그 창이 [2025/09/10 ~ 2026/09/10] 로 찍힌다. 그런데 서버에는 아무것도 안 보내
         * 발주를 통째로 받아 브라우저에서 걸렀다(2026-09-10 실측 2,298KB · 화면 합계 4,589KB).
         * 미판매(/sales-orders/unsold)는 진작 같은 창을 보내고 있었다 — 이 줄만 빠져 있었다.
         */
        api.get<PurchaseOrderRow[]>('/purchase-orders', { params: { from: y, to } }),
        api.get<DiscountRow[]>('/sales/discounts', { params: { from, to } }),
        api.get<DiscountRow[]>('/purchases/discounts', { params: { from, to } }),
        api.get<{ rows: AdjustRow[] }>('/stock-adjustments', { params: { from, to, all: true } }),
      ])
      setSales(s.data); setPurchases(b.data); setLastPrices(lp.data)
      setStocks(st.data); setItems(it.data); setBalances(bal.data)
      setUnsold(un.data); setOpenPo(po.data)
      setSaleDisc(sd.data); setBuyDisc(bd.data); setAdjusts(adj.data.rows)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  /*
   * 기준일자가 바뀌면 다시 받는다 — 채권·채무는 <b>그 시점 잔액</b>이고,
   * 할인·재고조정·미판매는 서버가 <b>기간을 받아</b> 걸러 주기 때문이다.
   */
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to])

  const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to)

  const report = useMemo(() => {
    const salesP = sales.filter((d) => inPeriod(d.saleDate))
    const buyP = purchases.filter((d) => inPeriod(d.purchaseDate))
    const saleAmt = salesP.reduce((a, d) => a + d.supplyAmount, 0)
    const buyAmt = buyP.reduce((a, d) => a + d.supplyAmount, 0)

    /*
     * 재고 평가는 <b>취득원가</b>로 한다 — 실제 입고단가가 있으면 그것, 없으면 품목 구매단가.
     * 예전에는 판매단가로 평가해서 아직 팔지도 않은 이익이 재고에 얹혔다
     * (개발 자료에서 1억 8,457만 vs 3,490만, 5배). 기준이 없는 칸은 합계에서 뺀다.
     * 기간을 자르지 않은 <b>전체</b> 구매전표를 본다 — 이번 달에 안 샀다고 평가단가가
     * 사라지면 안 되기 때문이다.
     */
    const costById = stockCostMapFromLast(items, lastPrices)
    const stockEval = sumStockValue(stocks.map((s) => ({
      quantity: s.quantity, unitCost: costById.get(s.itemId) ?? null,
    })))
    const stockValue = stockEval.value
    const receivable = balances.reduce((a, b) => a + b.receivable, 0)
    const payable = balances.reduce((a, b) => a + b.payable, 0)

    const top = (byKey: Map<string, NameAmt>): NameAmt[] =>
      [...byKey.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)

    const saleByPartner = new Map<string, NameAmt>()
    for (const d of salesP) {
      const k = `P${d.partnerId}`
      const e = saleByPartner.get(k) ?? { key: k, name: d.partnerName, amount: 0 }
      e.amount += d.supplyAmount; saleByPartner.set(k, e)
    }
    const buyByPartner = new Map<string, NameAmt>()
    for (const d of buyP) {
      const k = `P${d.partnerId}`
      const e = buyByPartner.get(k) ?? { key: k, name: d.partnerName, amount: 0 }
      e.amount += d.supplyAmount; buyByPartner.set(k, e)
    }
    /*
     * <b>원본 격자의 재고 줄들</b> — 품목구분마다 한 줄, 그리고 [합계].
     * 평가 기준은 위 <code>costById</code> 그대로다(취득원가) — 카드에 쓰는 값과
     * 같은 규칙이어야 카드와 표의 숫자가 갈리지 않는다.
     */
    const catOf = new Map(items.map((it) => [it.id, it.categoryName]))
    const stockByCat = new Map<string, number>()
    for (const s of stocks) {
      const cost = costById.get(s.itemId)
      if (cost == null) continue          // 평가단가를 모르는 칸은 합계에서 뺀다(위와 같은 규칙)
      const name = catOf.get(s.itemId) || '(미지정)'
      stockByCat.set(name, (stockByCat.get(name) ?? 0) + s.quantity * cost)
    }
    const stockByItem = new Map<string, NameAmt>()
    for (const s of stocks) {
      const k = `I${s.itemId}`
      const e = stockByItem.get(k) ?? { key: k, name: s.itemName, amount: 0 }
      e.amount += s.quantity * (costById.get(s.itemId) ?? 0); stockByItem.set(k, e)
    }

    /*
     * <b>원본 격자에 남아 있던 여섯 줄.</b> 값을 새로 지어낸 것은 없고, 다른 화면이
     * 이미 보던 자리를 여기서도 불러와 더한 것뿐이다.
     *
     * <p>재고조정액·자가사용액은 <b>금액 칸이 없다</b> — 조정은 수량만 남는다.
     * 그래서 위 재고 평가와 <b>같은 취득원가</b>로 곱한다. 다른 기준을 쓰면
     * 같은 화면 안에서 재고자산과 조정액이 서로 다른 단가로 매겨진다.
     * 평가단가를 모르는 품목은 재고 합계와 마찬가지로 뺀다.
     */
    const unsoldAmt = unsold.reduce((a, l) => a + l.unsoldAmount, 0)
    const unreceivedAmt = openPo
      .filter((o) => OPEN_PO.includes(o.status) && o.orderDate >= yearBefore(to) && o.orderDate <= to)
      .reduce((a, o) => a + o.lines.reduce((x, l) => x + l.supplyAmount, 0), 0)
    const saleDiscAmt = saleDisc.reduce((a, r) => a + r.discountAmount, 0)
    const buyDiscAmt = buyDisc.reduce((a, r) => a + r.discountAmount, 0)
    const adjAmt = (kinds: string[]) => adjusts
      .filter((r) => kinds.includes(r.type))
      .reduce((a, r) => a + r.quantityChange * (costById.get(r.itemId) ?? 0), 0)
    /* 자가사용은 따로 한 줄이라 조정액에서 뺀다 — 원본도 두 줄로 나눠 적는다. */
    const adjustAmt = adjAmt(['ADJUST', 'DEFECT', 'SUBSTITUTE', 'DISPOSAL'])
    const selfUseAmt = adjAmt(['SELF_USE'])

    return {
      saleAmt, buyAmt, grossProfit: saleAmt - buyAmt, stockValue, stockUnknown: stockEval.unknown, receivable, payable,
      unsoldAmt, unreceivedAmt, saleDiscAmt, buyDiscAmt, adjustAmt, selfUseAmt,
      stockByCat: [...stockByCat.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko')),
      saleCount: salesP.length, buyCount: buyP.length,
      topSale: top(saleByPartner), topBuy: top(buyByPartner), topStock: top(stockByItem),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, purchases, stocks, items, balances, unsold, openPo, saleDisc, buyDisc, adjusts, from, to])

  const margin = report.saleAmt > 0 ? (report.grossProfit / report.saleAmt) * 100 : 0

  /*
   * 2026-09-08 에 원본(<b>E040704</b>)을 열어 재니 조건은 <b>둘</b>이다 —
   * [기준일자](금월)과 [기타](결재방표시, 꺼짐). 대조표의 조건 수는 맞았는데
   * <b>이름과 [기타]가 어긋나 있었다</b>: 우리는 기간 칸을 [기간]이라 부르고
   * [기타]는 아예 없었다. 화면코드도 사본에서 주워 온 ESZ005R 이 박혀 있었다.
   */
  const [signBox, setSignBox] = useState(false)
  const reset = () => { setFrom(firstOfMonth()); setTo(periodOf('금월(~오늘)')!.to); setSignBox(false) }

  return (
    <EcListShell
      title="경영자보고서"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
      signLine={signBox}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_FULL_PICKS}
        dateLabel="기준일자"
      >
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            결재방표시
          </label>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        매출 <b style={{ color: '#3c4553' }}>{report.saleCount}</b>건
        <span style={{ margin: '0 8px', color: '#c9ced6' }}>|</span>
        매입 <b style={{ color: '#3c4553' }}>{report.buyCount}</b>건
      </div>

      {/*
        매출총이익을 (기간 매출 − 기간 매입)으로 잡는다. 일별·월별이익현황에서 이 계산을
        고쳤지만 여기는 그대로 뒀다 — 화면이 '추정치'라고 말하고 있고, 경영자보고서는
        기간 현금흐름에 가까운 요약이라서다. 정확한 이익은 일별이익현황(원가 기준 선택)을 본다.
      */}
      <p className="mb-2 text-xs text-slate-500">
        기간 매출·매입·이익과 재고자산·채권/채무 종합. 매출총이익은 (기간 매출−기간 매입) 추정치.
        재고자산은 <b>취득원가</b>(실제 입고단가 → 없으면 품목 구매단가)로 평가합니다.
        {report.stockUnknown > 0 && (
          <span style={{ color: '#c60a2e' }}>
            {' '}※ 평가단가를 못 찾은 재고 <b>{report.stockUnknown}</b>칸은 재고자산에서 빠져 있습니다
            (품목등록의 구매단가를 정하거나 입고 이력이 있어야 합니다).
          </span>
        )}
      </p>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {loading ? (
        <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 30 }}>불러오는 중…</p>
      ) : (
        <>
          {/* KPI 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
            <Kpi label="매출액 (기간)" value={won(report.saleAmt)} color="var(--ec-blue)" />
            <Kpi label="매입액 (기간)" value={won(report.buyAmt)} color="#a5561b" />
            <Kpi label="매출총이익 (추정)" value={won(report.grossProfit)} sub={`이익률 ${margin.toFixed(1)}%`} color={report.grossProfit >= 0 ? '#1c7c3c' : '#c60a2e'} />
            <Kpi label="재고자산 (현재)" value={won(report.stockValue)} color="#3c4553" />
            <Kpi label="총 채권 (받을 돈)" value={won(report.receivable)} color="#1c6b32" />
            <Kpi label="총 채무 (줄 돈)" value={won(report.payable)} color="#c60a2e" />
          </div>

          {/*
            <b>경영자보고서(E040704) 2026-09-09 원본 격자 실측</b>(자료 19줄) —
            열은 <b>[구분 · 기준일자 · 금액]</b> 셋뿐이고, 줄이 열아홉이다:
            품목구분 여섯(상품·원재료·부재료·제품·반제품·무형상품) · 합계 ·
            판매액 · 구매액 · 미판매금액 · 미입고금액 · 채권 · 채무 ·
            판매 할인액 · 구매 할인액 · 재고조정액 · 자가사용액 ·
            미청구액 (판매) · 미청구액 (구매).
            [기준일자] 칸에는 그 줄이 <b>어느 구간을 센 것인지</b>가 적힌다 —
            재고 줄은 시점 하나(2026/09/09), 판매·구매는 조회기간,
            미판매·미청구는 <b>1년 구간</b>(기준일−1년 ~ 기준일)이다.

            <p>우리는 이 표가 통째로 없었고 KPI 카드와 TOP5 만 있었다(둘 다 우리 것이다).
            <b>뜻이 정확히 같은 줄만</b> 만든다 — 품목구분별 재고와 합계, 판매액, 구매액.
            나머지 열둘은 아직 안 만든다:
            <p><b>[채권]·[채무]가 무엇인지 2026-09-09 에 가렸다</b> — 기간을 금월에서 전월로
            바꿔 두 판을 견줬다. 판매액·구매액은 그 달 것으로 <b>바뀌는데</b>(126,400 → 10,117,738)
            채권은 <b>그대로</b>고 채무만 <b>정확히 금월 구매액만큼</b> 줄었다
            (131,375,569 → 131,249,169, 차이 126,400). 발생액이라면 전월 채무가 그 달
            구매액이어야 하는데 1억이 넘는다 — 즉 <b>기간 끝 시점의 잔액</b>이다.
            칸에 기간이 적히는 것은 <b>어느 시점까지 센 것인지</b>를 보이려는 것이다.
            그래서 이제 만든다 — 우리 값도 같은 뜻이다.
            <b>미판매·미입고·할인액·재고조정액·자가사용액·미청구액</b>은 이 화면이 그 자료를
            안 받는다. 보드에 그대로 적어 두었다.
          */}
          <table className="w-full text-left" style={{ marginBottom: 16 }}>
            <thead><tr>
              <th style={{ width: 200 }}>구분</th>
              <th style={{ width: 220 }}>기준일자</th>
              <th style={{ textAlign: 'right' }}>금액</th>
            </tr></thead>
            <tbody>
              {report.stockByCat.map(([name, amt]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(to)}</td>
                  <td style={{ textAlign: 'right' }}>{won(amt)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td>합계</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.stockValue)}</td>
              </tr>
              <tr>
                <td>판매액</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(from)} ~ {dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.saleAmt)}</td>
              </tr>
              <tr>
                <td>구매액</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(from)} ~ {dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.buyAmt)}</td>
              </tr>
              {/*
                <b>[미판매금액]·[미입고금액]</b> — 아직 안 판 주문, 아직 안 들어온 발주.
                둘 다 기간이 <b>1년</b>이다. [미입고금액]은 앞 바퀴에 실측 기록이 없어
                미판매와 같게 맞춰 두고 확인 과제로 남겼는데, <b>2026-09-09 에 원본을 열어
                그 칸의 글자를 읽었다 — 2025/09/09 ~ 2026/09/09 로 미판매와 같았다.</b>
              */}
              <tr>
                <td>미판매금액</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(yearBefore(to))} ~ {dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.unsoldAmt)}</td>
              </tr>
              <tr>
                <td>미입고금액</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(yearBefore(to))} ~ {dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.unreceivedAmt)}</td>
              </tr>
              {/* 값은 기간 끝 시점의 잔액이다(위 실측). 칸에 적히는 글자는 원본대로 기간이다. */}
              <tr>
                <td>채권</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(from)} ~ {dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.receivable)}</td>
              </tr>
              <tr>
                <td>채무</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(from)} ~ {dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.payable)}</td>
              </tr>
              <tr>
                <td>판매 할인액</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(from)} ~ {dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.saleDiscAmt)}</td>
              </tr>
              <tr>
                <td>구매 할인액</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(from)} ~ {dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.buyDiscAmt)}</td>
              </tr>
              <tr>
                <td>재고조정액</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(from)} ~ {dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.adjustAmt)}</td>
              </tr>
              <tr>
                <td>자가사용액</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{dot(from)} ~ {dot(to)}</td>
                <td style={{ textAlign: 'right' }}>{won(report.selfUseAmt)}</td>
              </tr>
              {/*
                <b>[미청구액 (판매)]·[미청구액 (구매)] 두 줄은 아직 못 만든다.</b>
                채권현황(거래처별채권)에 같은 이름의 칸이 있는데 <b>거기도 비어 있다</b> —
                수금이 <b>어느 청구를 갚은 것인지</b>가 우리 자료에 없어서 잔액을
                청구분·미청구분으로 가를 수가 없다. 이유는 그 화면 머리말에 적어 두었다.
                지어내지 않고 줄을 안 그린다.
              */}
            </tbody>
          </table>

          {/* TOP5 3열 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <TopTable title="매출 상위 거래처" rows={report.topSale} color="var(--ec-blue)" />
            <TopTable title="매입 상위 거래처" rows={report.topBuy} color="#a5561b" />
            <TopTable title="재고금액 상위 품목" rows={report.topStock} color="#3c4553" />
          </div>
        </>
      )}
    </EcListShell>
  )
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ border: '1px solid var(--ec-border)', borderRadius: 4, background: '#fff', padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: '#8a929c', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: '#8a929c', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function TopTable({ title, rows, color }: { title: string; rows: { key: string; name: string; amount: number }[]; color: string }) {
  const max = rows.length ? rows[0].amount : 0
  return (
    <div style={{ border: '1px solid var(--ec-border)', borderRadius: 4, background: '#fff', padding: '10px 12px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#3c4553', marginBottom: 8 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: '#9aa1ab', padding: '10px 0', textAlign: 'center' }}>자료 없음</div>
      ) : rows.map((r, i) => (
        <div key={r.key} style={{ marginBottom: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
            <span style={{ color: '#3c4553' }}><b style={{ color: '#9aa1ab', marginRight: 5 }}>{i + 1}</b>{r.name}</span>
            <b style={{ color }}>{won(r.amount)}</b>
          </div>
          <div style={{ height: 4, background: '#eef1f5', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${max > 0 ? (r.amount / max) * 100 : 0}%`, background: color, borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

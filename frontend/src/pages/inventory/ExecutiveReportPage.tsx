import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, PartnerBalance, PurchaseDoc, SalesDoc, StockRow } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { stockCostMap, sumStockValue } from '../../utils/stockValue'
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

interface NameAmt { key: string; name: string; amount: number }

export default function ExecutiveReportPage() {
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [balances, setBalances] = useState<PartnerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(periodOf('금월(~오늘)')!.to)

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, b, st, it, bal] = await Promise.all([
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<StockRow[]>('/stock'),
        api.get<Item[]>('/items'),
        api.get<PartnerBalance[]>('/ledger/partner-balances'),
      ])
      setSales(s.data); setPurchases(b.data); setStocks(st.data); setItems(it.data); setBalances(bal.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

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
    const costById = stockCostMap(items, purchases)
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
    const stockByItem = new Map<string, NameAmt>()
    for (const s of stocks) {
      const k = `I${s.itemId}`
      const e = stockByItem.get(k) ?? { key: k, name: s.itemName, amount: 0 }
      e.amount += s.quantity * (costById.get(s.itemId) ?? 0); stockByItem.set(k, e)
    }

    return {
      saleAmt, buyAmt, grossProfit: saleAmt - buyAmt, stockValue, stockUnknown: stockEval.unknown, receivable, payable,
      saleCount: salesP.length, buyCount: buyP.length,
      topSale: top(saleByPartner), topBuy: top(buyByPartner), topStock: top(stockByItem),
    }
  }, [sales, purchases, stocks, items, balances, from, to])

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

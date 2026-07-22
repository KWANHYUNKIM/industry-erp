import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, PartnerBalance, PurchaseDoc, SalesDoc, StockRow } from '../../api/types'
import EcListShell from '../../components/EcListShell'

/**
 * 재고 > 경영자보고서 (이카운트 E040704)
 * 기간 매출·매입·이익과 재고자산·채권/채무를 한 화면에 종합하는 요약 리포트.
 * 데이터는 GET /api/sales, /purchases, /stock, /items, /ledger/partner-balances 를 조합(백엔드 무변경).
 *
 * 매출총이익은 (기간 매출공급가 − 기간 매입공급가)로 낸 <b>추정치</b>다. 원가 매칭이 아닌
 * 기간 매입 기준이라 실제 매출원가와 다를 수 있어 '추정'으로 표기한다. 정밀 손익은 이익관리 화면 참조.
 */

const won = (n: number) => n.toLocaleString('ko-KR')
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const today = () => new Date().toISOString().slice(0, 10)

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
  const [to, setTo] = useState(today())

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

    const priceById = new Map(items.map((i) => [i.id, i.unitPrice]))
    const stockValue = stocks.reduce((a, s) => a + s.quantity * (priceById.get(s.itemId) ?? 0), 0)
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
      e.amount += s.quantity * (priceById.get(s.itemId) ?? 0); stockByItem.set(k, e)
    }

    return {
      saleAmt, buyAmt, grossProfit: saleAmt - buyAmt, stockValue, receivable, payable,
      saleCount: salesP.length, buyCount: buyP.length,
      topSale: top(saleByPartner), topBuy: top(buyByPartner), topStock: top(stockByItem),
    }
  }, [sales, purchases, stocks, items, balances, from, to])

  const margin = report.saleAmt > 0 ? (report.grossProfit / report.saleAmt) * 100 : 0

  return (
    <EcListShell
      title="경영자보고서"
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">기간 매출·매입·이익과 재고자산·채권/채무 종합. 매출총이익은 (기간 매출−기간 매입) 추정치.</p>

      <div style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 40, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>기간</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        <span style={{ marginLeft: 12, fontSize: 12, color: '#8a929c' }}>매출 {report.saleCount}건 · 매입 {report.buyCount}건</span>
      </div>

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

import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'

/**
 * 영업관리 > 판매구매집계표 (이카운트 E040725)
 * 기간 내 판매·매입을 거래처별 또는 품목별로 집계해 매출·매입·순액을 한 표로 본다.
 * 데이터는 GET /api/sales + GET /api/purchases 를 그대로 집계(백엔드 무변경).
 *
 * 거래처별: 전표 합계 기준. 품목별: 라인 합계 기준(수량·공급가액).
 */

type GroupBy = 'partner' | 'item'

interface Agg {
  key: string
  name: string
  saleCount: number   // 거래처별=전표수, 품목별=라인수
  saleQty: number
  saleSupply: number
  buyCount: number
  buyQty: number
  buySupply: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
const emptyAgg = (key: string, name: string): Agg => ({ key, name, saleCount: 0, saleQty: 0, saleSupply: 0, buyCount: 0, buyQty: 0, buySupply: 0 })

export default function SalesPurchaseSummaryPage() {
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('partner')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, b] = await Promise.all([api.get<SalesDoc[]>('/sales'), api.get<PurchaseDoc[]>('/purchases')])
      setSales(s.data); setPurchases(b.data)
    } catch (err) { setError(extractErrorMessage(err)); setSales([]); setPurchases([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to)

  const rows = useMemo(() => {
    const m = new Map<string, Agg>()
    const bump = (key: string, name: string): Agg => {
      let a = m.get(key)
      if (!a) { a = emptyAgg(key, name); m.set(key, a) }
      return a
    }
    if (groupBy === 'partner') {
      for (const d of sales) {
        if (!inPeriod(d.saleDate)) continue
        const a = bump(`P${d.partnerId}`, d.partnerName)
        a.saleCount += 1; a.saleSupply += d.supplyAmount
        a.saleQty += d.lines.reduce((x, l) => x + l.quantity, 0)
      }
      for (const d of purchases) {
        if (!inPeriod(d.purchaseDate)) continue
        const a = bump(`P${d.partnerId}`, d.partnerName)
        a.buyCount += 1; a.buySupply += d.supplyAmount
        a.buyQty += d.lines.reduce((x, l) => x + l.quantity, 0)
      }
    } else {
      for (const d of sales) {
        if (!inPeriod(d.saleDate)) continue
        for (const l of d.lines) {
          const a = bump(`I${l.itemId}`, l.itemName)
          a.saleCount += 1; a.saleQty += l.quantity; a.saleSupply += l.supplyAmount
        }
      }
      for (const d of purchases) {
        if (!inPeriod(d.purchaseDate)) continue
        for (const l of d.lines) {
          const a = bump(`I${l.itemId}`, l.itemName)
          a.buyCount += 1; a.buyQty += l.quantity; a.buySupply += l.supplyAmount
        }
      }
    }
    const kw = keyword.trim()
    return [...m.values()]
      .filter((a) => !kw || a.name.includes(kw))
      .sort((a, b) => (b.saleSupply + b.buySupply) - (a.saleSupply + a.buySupply))
  }, [sales, purchases, groupBy, from, to, keyword])

  const totals = useMemo(() => rows.reduce((s, r) => ({
    saleSupply: s.saleSupply + r.saleSupply, buySupply: s.buySupply + r.buySupply,
  }), { saleSupply: 0, buySupply: 0 }), [rows])

  const label: React.CSSProperties = { width: 56, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }

  return (
    <EcListShell
      title="판매구매집계표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">기간 내 판매·매입을 거래처별 또는 품목별로 집계. 순액 = 매출공급가 − 매입공급가.</p>

      <div style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>기간</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>집계기준</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['partner', 'item'] as const).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)} className="no-ec" style={{
                padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
                background: groupBy === g ? 'var(--ec-blue)' : '#fff', color: groupBy === g ? '#fff' : '#3a4453', fontWeight: groupBy === g ? 700 : 400,
              }}>{g === 'partner' ? '거래처별' : '품목별'}</button>
            ))}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          매출계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.saleSupply)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          매입계 <b style={{ color: '#a5561b', fontSize: 14 }}>{won(totals.buySupply)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          순액 <b style={{ color: (totals.saleSupply - totals.buySupply) >= 0 ? '#1c7c3c' : '#c60a2e', fontSize: 14 }}>{won(totals.saleSupply - totals.buySupply)}</b>
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>{groupBy === 'partner' ? '거래처' : '품목'}</th>
            <th style={{ textAlign: 'right' }}>매출{groupBy === 'partner' ? '건수' : '수량'}</th>
            <th style={{ textAlign: 'right' }}>매출공급가</th>
            <th style={{ textAlign: 'right' }}>매입{groupBy === 'partner' ? '건수' : '수량'}</th>
            <th style={{ textAlign: 'right' }}>매입공급가</th>
            <th style={{ textAlign: 'right' }}>순액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => {
            const net = r.saleSupply - r.buySupply
            return (
              <tr key={r.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{r.name}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{groupBy === 'partner' ? won(r.saleCount) : won(r.saleQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.saleSupply)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{groupBy === 'partner' ? won(r.buyCount) : won(r.buyQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{won(r.buySupply)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: net >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(net)}</td>
              </tr>
            )
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.saleSupply)}</td>
              <td></td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(totals.buySupply)}</td>
              <td style={{ textAlign: 'right', color: (totals.saleSupply - totals.buySupply) >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(totals.saleSupply - totals.buySupply)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 구매 > 구매할인현황 — 품목 기준단가 대비 실매입가 할인 내역 (GET /api/purchases/discounts 연동) */
interface DiscountRow {
  date: string
  docNo: string
  partnerName: string
  itemName: string
  qty: number
  basePrice: number
  buyPrice: number
  discountPerUnit: number
  discountAmount: number
  discountRate: number
}

export default function PurchaseDiscountPage() {
  const [rows, setRows] = useState<DiscountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<DiscountRow[]>('/purchases/discounts', {
        params: { from: from || undefined, to: to || undefined },
      })
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => !keyword || r.partnerName.includes(keyword) || r.itemName.includes(keyword))
  const totalDiscount = useMemo(
    () => shown.reduce((s, r) => s + r.discountAmount, 0),
    [shown],
  )

  return (
    <EcListShell
      title="구매할인현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#5a626e' }}>기간</span>
        <input type="date" className="ec-input" style={{ width: 140 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" style={{ width: 140 }} value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          할인액 합계 <b style={{ color: '#c60a2e', fontSize: 14 }}>{totalDiscount.toLocaleString()}</b>
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th><th>전표번호</th><th>매입처</th><th>품목명</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>기준단가</th><th style={{ textAlign: 'right' }}>매입가</th>
            <th style={{ textAlign: 'right' }}>할인액</th><th style={{ textAlign: 'right' }}>할인율(%)</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>구매 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={`${r.docNo}-${i}`}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
              <td>{r.partnerName}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.basePrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.buyPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: r.discountAmount > 0 ? '#c60a2e' : '#9aa1ab' }}>{r.discountAmount.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.discountRate.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

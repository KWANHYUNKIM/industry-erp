import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 재고 I > 쇼핑몰관리 — 판매 전표 품목라인을 쇼핑몰(자사몰) 주문 관점으로 조회 (/api/sales 연동)
 *  외부몰 연동 스키마가 없어 자사몰 직접판매(판매전표)를 주문 목록으로 표시하고,
 *  처리상태는 주문일 경과에 따라 신규주문→상품준비중→배송중→배송완료로 표시한다. */
type Status = '신규주문' | '상품준비중' | '배송중' | '배송완료'

interface SalesLine { itemName: string; quantity: number; supplyAmount: number; vatAmount: number }
interface SalesDoc {
  id: number
  docNo: string
  partnerName: string
  saleDate: string
  lines: SalesLine[]
}

interface Row {
  key: string
  mall: string
  orderNo: string
  date: string
  product: string
  qty: number
  amount: number
  buyer: string
  status: Status
}

const MALLS = ['자사몰']
const statusColor = (s: Status) => ({ 신규주문: '#c60a2e', 상품준비중: '#c07a00', 배송중: 'var(--ec-blue)', 배송완료: '#1c7c3c' }[s])

function deriveStatus(date: string): Status {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days <= 0) return '신규주문'
  if (days <= 2) return '상품준비중'
  if (days <= 5) return '배송중'
  return '배송완료'
}

export default function MallPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [mall, setMall] = useState('전체')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SalesDoc[]>('/sales')
      const flat: Row[] = []
      for (const d of res.data) {
        d.lines.forEach((l, idx) => flat.push({
          key: `${d.id}-${idx}`,
          mall: '자사몰',
          orderNo: d.docNo,
          date: d.saleDate,
          product: l.itemName,
          qty: l.quantity,
          amount: l.supplyAmount + l.vatAmount,
          buyer: d.partnerName,
          status: deriveStatus(d.saleDate),
        }))
      }
      flat.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows
    .filter((r) => mall === '전체' || r.mall === mall)
    .filter((r) => !keyword || r.product.includes(keyword) || r.orderNo.includes(keyword) || r.buyer.includes(keyword))
  const newCount = rows.filter((r) => r.status === '신규주문').length
  const total = useMemo(() => shown.reduce((s, r) => s + r.amount, 0), [shown])

  return (
    <EcListShell
      title="쇼핑몰 주문관리"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '주문수집', primary: true, onClick: load }, { label: '송장출력' }, { label: '판매전표 생성' }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <select className="ec-input" value={mall} onChange={(e) => setMall(e.target.value)} style={{ width: 140 }}>
          <option>전체</option>
          {MALLS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: '#5a626e' }}>신규주문 <b style={{ color: '#c60a2e' }}>{newCount}</b>건</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b> 원</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 110 }}>연동몰 ▼</th>
            <th style={{ width: 140 }}>주문번호 ▼</th>
            <th style={{ width: 100 }}>주문일 ▼</th>
            <th>상품명</th>
            <th style={{ width: 60, textAlign: 'right' }}>수량</th>
            <th style={{ width: 100, textAlign: 'right' }}>금액</th>
            <th style={{ width: 100 }}>주문자</th>
            <th style={{ width: 100, textAlign: 'center' }}>상태 ▼</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>수집된 주문이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.mall}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
              <td>{r.date}</td>
              <td>{r.product}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.amount.toLocaleString()}</td>
              <td>{r.buyer}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

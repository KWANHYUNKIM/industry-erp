import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 영업 > 미출하현황 — 접수·진행중 주문의 라인별 미출하 잔량 (백엔드 /sales-orders/unshipped 연동) */
interface UnshippedLine {
  orderId: number
  orderNo: string
  partnerId: number
  partnerName: string
  orderDate: string
  dueDate: string | null
  status: 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
  statusName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  orderQty: number
  shippedQty: number
  unshippedQty: number
}

const statusColor = (s: UnshippedLine['status']) => (s === 'IN_PROGRESS' ? '#b6791b' : '#1c6fb5')

export default function UnshippedPage() {
  const [rows, setRows] = useState<UnshippedLine[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<UnshippedLine[]>('/sales-orders/unshipped')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const shown = rows.filter(
    (r) => !keyword || r.partnerName.includes(keyword) || r.orderNo.includes(keyword) || r.itemName.includes(keyword),
  )
  const totalUnshipped = useMemo(() => shown.reduce((s, r) => s + r.unshippedQty, 0), [shown])

  return (
    <EcListShell
      title="미출하현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={undefined}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        미출하 라인 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        미출하수량 합계 <b style={{ color: '#c60a2e', fontSize: 14 }}>{totalUnshipped.toLocaleString()}</b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 150 }}>주문번호 ▼</th>
            <th>거래처 ▼</th>
            <th style={{ width: 100 }}>납기일 ▼</th>
            <th>품목 ▼</th>
            <th style={{ width: 90, textAlign: 'right' }}>주문수량</th>
            <th style={{ width: 90, textAlign: 'right' }}>출하수량</th>
            <th style={{ width: 90, textAlign: 'right' }}>미출하수량</th>
            <th style={{ width: 80, textAlign: 'center' }}>상태 ▼</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>미출하 주문이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={`${r.orderId}-${r.itemId}-${i}`}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
              <td>{r.partnerName}</td>
              <td style={{ fontFamily: 'monospace', color: r.dueDate ? 'var(--ec-text)' : '#9aa1ab' }}>{r.dueDate ?? '-'}</td>
              <td>[{r.itemCode}] {r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.orderQty.toLocaleString()} {r.unit}</td>
              <td style={{ textAlign: 'right' }}>{r.shippedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.unshippedQty > 0 ? '#c60a2e' : '#8a929c' }}>{r.unshippedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.statusName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

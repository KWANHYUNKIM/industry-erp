import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 영업 > 미출하현황 — 접수·진행중 주문의 라인별 미출하 잔량 (백엔드 /sales-orders/unshipped 연동) */
interface UnshippedLine {
  orderId: number
  orderNo: string
  orderLineId: number
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
  const navigate = useNavigate()
  const [rows, setRows] = useState<UnshippedLine[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 라인별 출하지시 수량 입력값 (기본값: 미출하 잔량) */
  const [shipQty, setShipQty] = useState<Record<number, string>>({})
  const [busyLine, setBusyLine] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<UnshippedLine[]>('/sales-orders/unshipped')
      setRows(res.data)
      setShipQty({})
    } catch (err) {
      setError(extractErrorMessage(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  /** 주문 라인에서 출하지시를 생성한다. 출하완료 처리는 출하 화면에서. */
  async function ship(r: UnshippedLine) {
    const raw = shipQty[r.orderLineId] ?? String(r.unshippedQty)
    const qty = Number(raw)
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('출하수량을 0보다 크게 입력하세요.')
      return
    }
    if (qty > r.unshippedQty) {
      setError(`출하수량이 미출하 잔량(${r.unshippedQty.toLocaleString()})을 초과합니다.`)
      return
    }

    setBusyLine(r.orderLineId)
    setError('')
    setNotice('')
    try {
      const res = await api.post<{ shipNo: string }>(`/sales-orders/${r.orderId}/ship`, {
        lines: [{ orderLineId: r.orderLineId, qty }],
      })
      setNotice(`출하지시 ${res.data.shipNo} 생성됨 · 출하지시서에서 출하완료 처리하면 미출하수량이 줄어듭니다.`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusyLine(null)
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
      {notice && (
        <p style={{ background: '#eef5ff', color: '#2b5b91', border: '1px solid #cfe0f5', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8, display: 'flex', alignItems: 'center' }}>
          {notice}
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => navigate('/sales/shipment-order')}>출하지시서로 이동</button>
        </p>
      )}

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
            <th style={{ width: 150, textAlign: 'center' }}>출하지시</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>미출하 주문이 없습니다.</td></tr>
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
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                <input
                  className="ec-input"
                  type="number"
                  min={0}
                  max={r.unshippedQty}
                  style={{ width: 66, textAlign: 'right' }}
                  value={shipQty[r.orderLineId] ?? String(r.unshippedQty)}
                  onChange={(e) => setShipQty((p) => ({ ...p, [r.orderLineId]: e.target.value }))}
                />
                <button
                  className="ec-btn ec-btn-primary"
                  style={{ marginLeft: 4 }}
                  disabled={busyLine === r.orderLineId || r.unshippedQty <= 0}
                  onClick={() => ship(r)}
                >
                  {busyLine === r.orderLineId ? '처리중…' : '출하지시'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

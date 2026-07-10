import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 영업 > 출하현황 — 전체 출하 실적 조회 (백엔드 /shipments 연동) */
type ShipStatus = 'READY' | 'SHIPPED' | 'CANCELED'
const STATUS_COLOR: Record<ShipStatus, string> = { READY: '#b6791b', SHIPPED: '#1c7c3c', CANCELED: '#8a929c' }

interface ShipLine { itemName: string; quantity: number; amount: number }
interface Shipment {
  id: number; shipNo: string; partnerName: string; shipDate: string
  status: ShipStatus; statusName: string; totalQuantity: number; totalAmount: number
  createdBy: string | null; lines: ShipLine[]
}

const won = (n: number) => n.toLocaleString('ko-KR')

export default function ShipmentPage() {
  const [rows, setRows] = useState<Shipment[]>([])
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | ShipStatus>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get<Shipment[]>('/shipments')
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const shown = rows
    .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.shipNo.includes(keyword))
  const totals = useMemo(() => shown.reduce((a, r) => ({ qty: a.qty + r.totalQuantity, amount: a.amount + r.totalAmount }), { qty: 0, amount: 0 }), [shown])

  return (
    <EcListShell title="출하현황" search={keyword} onSearchChange={setKeyword} onSearch={load} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['ALL', 'READY', 'SHIPPED', 'CANCELED'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: statusFilter === s ? 'var(--ec-blue)' : '#fff', color: statusFilter === s ? '#fff' : '#3a4453', fontWeight: statusFilter === s ? 700 : 400,
            }}>{s === 'ALL' ? '전체' : s === 'READY' ? '출하지시' : s === 'SHIPPED' ? '출하완료' : '취소'} ({s === 'ALL' ? rows.length : rows.filter((r) => r.status === s).length})</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          출하수량 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{won(totals.qty)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          출하금액 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.amount)}</b>
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>출하번호 ▼</th><th>출하일 ▼</th><th>거래처 ▼</th><th>품목</th>
            <th style={{ textAlign: 'right' }}>출하수량</th><th style={{ textAlign: 'right' }}>출하금액</th>
            <th style={{ textAlign: 'center' }}>상태</th><th>담당</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>출하 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.shipNo}</td>
              <td>{r.shipDate}</td>
              <td>{r.partnerName}</td>
              <td>{r.lines[0]?.itemName}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
              <td style={{ textAlign: 'right' }}>{won(r.totalQuantity)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.totalAmount)}</td>
              <td style={{ textAlign: 'center', color: STATUS_COLOR[r.status], fontWeight: 700 }}>{r.statusName}</td>
              <td>{r.createdBy ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

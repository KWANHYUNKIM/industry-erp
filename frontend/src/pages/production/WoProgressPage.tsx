import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 생산관리 > 작업지시서별진행현황 — 작업지시별 완료 진행률 현황 (/api/work-orders 연동) */
type WoStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'

const STATUS_COLOR: Record<WoStatus, string> = {
  PLANNED: '#8a929c',
  IN_PROGRESS: '#c07a00',
  COMPLETED: '#1c7c3c',
}

interface Row {
  id: number
  orderNo: string
  productCode: string
  productName: string
  productUnit: string
  plannedQty: number
  producedQty: number
  remainingQty: number
  status: WoStatus
  statusName: string
  orderDate: string
  dueDate: string | null
}

export default function WoProgressPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Row[]>('/work-orders')
      setRows([...res.data].sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.id - a.id)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => !keyword || r.orderNo.includes(keyword) || r.productName.includes(keyword))

  return (
    <EcListShell
      title="작업지시서별진행현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>작업지시번호</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>지시수량</th>
            <th style={{ textAlign: 'right' }}>완료수량</th>
            <th style={{ textAlign: 'right' }}>잔여수량</th>
            <th style={{ width: 160 }}>진행률</th>
            <th style={{ textAlign: 'right' }}>진행률(%)</th>
            <th style={{ textAlign: 'center' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const pct = r.plannedQty ? Math.min(100, Math.round((r.producedQty / r.plannedQty) * 100)) : 0
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
                <td>[{r.productCode}] {r.productName}</td>
                <td style={{ textAlign: 'right' }}>{r.plannedQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.producedQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: r.remainingQty > 0 ? '#c60a2e' : '#8a929c' }}>{r.remainingQty.toLocaleString()}</td>
                <td>
                  <div style={{ background: '#eef1f5', height: 12, width: '100%', position: 'relative' }}>
                    <div style={{ background: pct >= 100 ? '#1c7c3c' : '#3579f6', height: '100%', width: `${pct}%` }} />
                  </div>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{pct}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}

import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 생산관리 > 생산계획(MRP)리스트 — 주차별 소요량 대비 계획수량 (/api/production-plans 연동) */
type PlanStatus = 'REVIEW' | 'CONFIRMED' | 'ORDERED'

const STATUS_COLOR: Record<PlanStatus, string> = {
  REVIEW: '#c07a00',
  CONFIRMED: '#1c7c3c',
  ORDERED: 'var(--ec-blue-dark)',
}

interface Row {
  id: number
  productId: number
  productCode: string
  productName: string
  productUnit: string
  planWeek: string
  demandQty: number
  currentStock: number
  planQty: number
  shortage: number
  status: PlanStatus
  statusName: string
  workOrderNo: string | null
  remark: string | null
}

export default function MrpPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Row[]>('/production-plans')
      setRows([...res.data].sort((a, b) => (a.planWeek < b.planWeek ? 1 : a.planWeek > b.planWeek ? -1 : b.id - a.id)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => !keyword || r.productName.includes(keyword) || r.planWeek.includes(keyword))

  return (
    <EcListShell
      title="생산계획(MRP)리스트"
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
            <th>계획주차</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>총소요량</th>
            <th style={{ textAlign: 'right' }}>현재고</th>
            <th style={{ textAlign: 'right' }}>순소요량(부족)</th>
            <th style={{ textAlign: 'right' }}>계획수량</th>
            <th>작업지시번호</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.planWeek}</td>
              <td>[{r.productCode}] {r.productName}</td>
              <td style={{ textAlign: 'right' }}>{r.demandQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.currentStock.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: r.shortage > 0 ? 700 : 400, color: r.shortage > 0 ? '#c60a2e' : '#8a929c' }}>{r.shortage.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.planQty.toLocaleString()}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo ?? '-'}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
              <td style={{ color: '#8a929c' }}>{r.remark ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

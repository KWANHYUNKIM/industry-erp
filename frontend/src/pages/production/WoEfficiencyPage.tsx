import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 생산관리 > 작업지시서효율현황 — 계획(지시수량) 대비 실적 효율 분석 (/api/work-orders + /api/productions 연동) */
type WoStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'

interface WorkOrderRow {
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

interface ProductionRow {
  id: number
  prodNo: string
  workOrderId: number
  workOrderNo: string
  producedQty: number
  productionDate: string
}

export default function WoEfficiencyPage() {
  const [orders, setOrders] = useState<WorkOrderRow[]>([])
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [woRes, prodRes] = await Promise.all([
        api.get<WorkOrderRow[]>('/work-orders'),
        api.get<ProductionRow[]>('/productions'),
      ])
      setOrders([...woRes.data].sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.id - a.id)))
      setProductions(prodRes.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // 작업지시별 실적 집계(실적건수, 마지막 실적일)
  const prodByWo = useMemo(() => {
    const map = new Map<number, { count: number; lastDate: string }>()
    for (const p of productions) {
      const cur = map.get(p.workOrderId)
      if (!cur) map.set(p.workOrderId, { count: 1, lastDate: p.productionDate })
      else map.set(p.workOrderId, { count: cur.count + 1, lastDate: cur.lastDate < p.productionDate ? p.productionDate : cur.lastDate })
    }
    return map
  }, [productions])

  const shown = orders.filter((r) => !keyword || r.orderNo.includes(keyword) || r.productName.includes(keyword))
  const avgEff = useMemo(() => {
    const withPlan = shown.filter((r) => r.plannedQty > 0)
    if (withPlan.length === 0) return 0
    return Math.round(withPlan.reduce((s, r) => s + (r.producedQty / r.plannedQty) * 100, 0) / withPlan.length)
  }, [shown])

  return (
    <EcListShell
      title="작업지시서효율현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        평균 달성효율 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{avgEff}%</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>작업지시번호</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>지시수량</th>
            <th style={{ textAlign: 'right' }}>생산수량</th>
            <th style={{ textAlign: 'right' }}>잔여수량</th>
            <th style={{ textAlign: 'right' }}>실적건수</th>
            <th>최근실적일</th>
            <th style={{ textAlign: 'right' }}>효율(%)</th>
            <th style={{ textAlign: 'center' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const eff = r.plannedQty ? Math.round((r.producedQty / r.plannedQty) * 100) : 0
            const agg = prodByWo.get(r.id)
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
                <td>[{r.productCode}] {r.productName}</td>
                <td style={{ textAlign: 'right' }}>{r.plannedQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.producedQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: r.remainingQty > 0 ? '#c60a2e' : '#8a929c' }}>{r.remainingQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{agg ? agg.count.toLocaleString() : 0}</td>
                <td style={{ fontFamily: 'monospace' }}>{agg ? agg.lastDate : '-'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: eff >= 100 ? '#1c7c3c' : '#c60a2e' }}>{eff}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: r.status === 'COMPLETED' ? '#1c7c3c' : r.status === 'IN_PROGRESS' ? '#c07a00' : '#8a929c' }}>{r.statusName}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}

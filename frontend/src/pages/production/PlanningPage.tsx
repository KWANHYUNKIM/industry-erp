import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item } from '../../api/types'
import EcListShell from '../../components/EcListShell'

type PlanStatus = 'REVIEW' | 'CONFIRMED' | 'ORDERED'
const COLOR: Record<PlanStatus, string> = { REVIEW: '#c07a00', CONFIRMED: 'var(--ec-blue)', ORDERED: '#1c7c3c' }

interface Plan {
  id: number; productId: number; productCode: string; productName: string; productUnit: string
  planWeek: string; demandQty: number; currentStock: number; planQty: number; shortage: number
  status: PlanStatus; statusName: string; workOrderNo: string | null; remark: string | null
}

const thisWeek = () => {
  const d = new Date()
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export default function PlanningPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')

  const [productId, setProductId] = useState('')
  const [planWeek, setPlanWeek] = useState(thisWeek())
  const [demandQty, setDemandQty] = useState('')
  const [planQty, setPlanQty] = useState('')

  async function load() {
    try {
      const [p, i] = await Promise.all([api.get<Plan[]>('/production-plans'), api.get<Item[]>('/items')])
      setPlans(p.data); setItems(i.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!productId) return setError('제품을 선택하세요.')
    try {
      const res = await api.post<Plan>('/production-plans', {
        productId: Number(productId), planWeek, demandQty: Number(demandQty) || 0, planQty: Number(planQty) || 0,
      })
      setOk(`${res.data.planWeek} ${res.data.productName} 계획 등록 (현재고 ${res.data.currentStock.toLocaleString()})`)
      setDemandQty(''); setPlanQty('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function confirmPlan(p: Plan) {
    try { await api.patch(`/production-plans/${p.id}/status`, { status: 'CONFIRMED' }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }
  async function makeWorkOrder(p: Plan) {
    if (!window.confirm(`${p.productName} ${p.planQty} 작업지시를 생성할까요?`)) return
    try { const res = await api.post<Plan>(`/production-plans/${p.id}/work-order`); setOk(`작업지시 ${res.data.workOrderNo} 생성 완료`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = plans.filter((p) => !keyword || p.productName.includes(keyword) || p.planWeek.includes(keyword))
  const totalPlan = shown.reduce((s, p) => s + p.planQty, 0)

  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }

  return (
    <EcListShell
      title="생산계획 (MPS)"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '계획등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">제품별 주차 수요 대비 생산 계획 · 확정 후 작업지시 자동생성 · 현재고 실시간 반영</p>

      {showForm && (
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 760 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>제품 *</th>
                <td>
                  <select className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)} style={{ minWidth: 220 }}>
                    <option value="">선택하세요</option>
                    {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
                  </select>
                </td>
                <th style={th}>계획주차</th>
                <td><input className={inputCls} value={planWeek} onChange={(e) => setPlanWeek(e.target.value)} style={{ width: 130 }} placeholder="2026-W28" /></td>
              </tr>
              <tr>
                <th style={th}>수요량</th>
                <td><input type="number" className={`${inputCls} text-right`} value={demandQty} onChange={(e) => setDemandQty(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>계획수량</th>
                <td><input type="number" className={`${inputCls} text-right`} value={planQty} onChange={(e) => setPlanQty(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button></div>
        </form>
      )}

      {ok && !showForm && <p className="mb-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        계획수량 합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{totalPlan.toLocaleString()}</b>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>계획주차 ▼</th><th>제품</th>
            <th style={{ textAlign: 'right' }}>수요량</th>
            <th style={{ textAlign: 'right' }}>현재고</th>
            <th style={{ textAlign: 'right' }}>부족량</th>
            <th style={{ textAlign: 'right' }}>계획수량</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>작업지시</th>
            <th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>생산계획이 없습니다.</td></tr>
          ) : shown.map((p, i) => (
            <tr key={p.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{p.planWeek}</td>
              <td>{p.productName}</td>
              <td style={{ textAlign: 'right' }}>{p.demandQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{p.currentStock.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: p.shortage > 0 ? '#c60a2e' : '#bbb', fontWeight: p.shortage > 0 ? 700 : 400 }}>{p.shortage.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{p.planQty.toLocaleString()} {p.productUnit}</td>
              <td style={{ textAlign: 'center', color: COLOR[p.status], fontWeight: 700 }}>{p.statusName}</td>
              <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{p.workOrderNo ?? ''}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                {p.status === 'REVIEW' && <button className="no-ec" onClick={() => confirmPlan(p)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12 }}>확정</button>}
                {p.status === 'CONFIRMED' && <button className="no-ec" onClick={() => makeWorkOrder(p)} style={{ border: 'none', background: 'none', color: '#1c7c3c', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>작업지시 생성</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

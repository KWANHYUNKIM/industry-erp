import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'

type PlanStatus = 'REVIEW' | 'CONFIRMED' | 'ORDERED'
const COLOR: Record<PlanStatus, string> = { REVIEW: 'var(--ec-warn)', CONFIRMED: 'var(--ec-blue)', ORDERED: 'var(--ec-success)' }

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
  const th: React.CSSProperties = { background: 'var(--ec-bg-page)', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    계획주차: (p) => p.planWeek,
  })

  return (
    <EcListShell
      title="생산계획 (MPS)"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '계획등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-ec-hint">제품별 주차 수요 대비 생산 계획 · 확정 후 작업지시 자동생성 · 현재고 실시간 반영</p>

      <Modal open={showForm} title="생산계획 (MPS) 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 760 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>제품 *</th>
                <td>
                  {/* 긴 드롭다운이었다(QA 21회차) — 품목이 늘면 못 찾는다. */}
                  <CodePickerField label="제품" hideLabel width={240} placeholder="제품" emptyLabel="선택 해제"
                                   value={productId} onChange={setProductId}
                                   items={items.filter((it) => it.active !== false).map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))} />
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
          {error && <p className="mt-2 rounded bg-ec-danger-bg px-3 py-2 text-sm text-ec-danger">{error}</p>}
          {ok && <p className="mt-2 rounded bg-ec-success-bg px-3 py-2 text-sm text-ec-success">{ok}</p>}
          <div className="mt-[10px]"><button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button></div>
        </form>
      )}</Modal>

      {ok && !showForm && <p className="mb-2 rounded bg-ec-success-bg px-3 py-2 text-sm text-ec-success">{ok}</p>}

      <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        계획수량 합계 <b className="text-ec-navy text-[14px]">{totalPlan.toLocaleString()}</b>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="cursor-pointer" onClick={() => sort.toggle('계획주차')}>계획주차 {sort.mark('계획주차')}</th><th>제품</th>
            <th className="text-right">수요량</th>
            <th className="text-right">현재고</th>
            <th className="text-right">부족량</th>
            <th className="text-right">계획수량</th>
            <th className="text-center">상태</th>
            <th>작업지시</th>
            <th className="text-center">처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((p, i) => (
            <tr key={p.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{p.planWeek}</td>
              <td>{p.productName}</td>
              <td className="text-right">{p.demandQty.toLocaleString()}</td>
              <td className="text-right">{p.currentStock.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: p.shortage > 0 ? 'var(--ec-danger)' : '#bbb', fontWeight: p.shortage > 0 ? 700 : 400 }}>{p.shortage.toLocaleString()}</td>
              <td className="text-right font-semibold text-ec-blue">{p.planQty.toLocaleString()} {p.productUnit}</td>
              <td style={{ textAlign: 'center', color: COLOR[p.status], fontWeight: 700 }}>{p.statusName}</td>
              <td className="text-ec-label">{p.workOrderNo ?? ''}</td>
              <td className="text-center whitespace-nowrap">
                {p.status === 'REVIEW' && <button className="no-ec" onClick={() => confirmPlan(p)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12 }}>확정</button>}
                {p.status === 'CONFIRMED' && <button className="no-ec" onClick={() => makeWorkOrder(p)} style={{ border: 'none', background: 'none', color: 'var(--ec-success)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>작업지시 생성</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

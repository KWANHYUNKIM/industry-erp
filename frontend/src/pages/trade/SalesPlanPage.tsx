import { useEffect, useMemo, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Item } from '../../api/types'

/**
 * 재고 II > 계획관리 > 매출계획 / 매출계획비교표 (이카운트 E040624·E040625·E040626·E040640)
 * 품목별 월 매출 목표(계획)를 등록하고, 판매 실적과 대조해 달성률을 본다.
 * 백엔드 신규: sales_plans 테이블 + GET/POST/DELETE /api/sales-plans, GET /api/sales-plans/comparison?year=
 * 실적은 저장하지 않고 판매(Sales) 집계로 계산한다.
 */
interface ComparisonRow {
  id: number
  planYear: number
  planMonth: number
  itemId: number
  itemName: string
  unit: string
  planQty: number
  planAmount: number
  actualQty: number
  actualAmount: number
  achieveRate: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
const rateColor = (r: number) => (r >= 100 ? '#1c7c3c' : r >= 80 ? '#c07a00' : '#c60a2e')
const thisYear = () => Number(new Date().toISOString().slice(0, 4))
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function SalesPlanPage() {
  const [year, setYear] = useState<number>(thisYear())
  const [rows, setRows] = useState<ComparisonRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const [c, i] = await Promise.all([
        api.get<ComparisonRow[]>('/sales-plans/comparison', { params: { year } }),
        api.get<Item[]>('/items'),
      ])
      setRows(c.data)
      setItems(i.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [year])

  async function remove(id: number) {
    setError(''); setOk('')
    try {
      await api.delete(`/sales-plans/${id}`)
      setOk('매출계획 1건 삭제')
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const totals = useMemo(() => {
    const t = rows.reduce((s, r) => ({ plan: s.plan + r.planAmount, actual: s.actual + r.actualAmount }), { plan: 0, actual: 0 })
    const rate = t.plan > 0 ? (t.actual / t.plan) * 100 : 0
    return { ...t, rate }
  }, [rows])

  return (
    <EcListShell
      title="매출계획 / 비교표"
      newLabel={showForm ? '입력닫기' : '매출계획 등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eafaef', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>계획연도</span>
        <button className="ec-btn" onClick={() => setYear((y) => y - 1)}>◀</button>
        <b style={{ fontSize: 15, color: '#3c4553', minWidth: 54, textAlign: 'center' }}>{year}년</b>
        <button className="ec-btn" onClick={() => setYear((y) => y + 1)}>▶</button>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          계획 <b style={{ color: '#3c4553', fontSize: 14 }}>{won(totals.plan)}</b>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          실적 <b style={{ color: '#1c6b32', fontSize: 14 }}>{won(totals.actual)}</b>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          달성률 <b style={{ color: rateColor(totals.rate), fontSize: 14 }}>{totals.rate.toFixed(1)}%</b>
        </div>
      </div>

      <Modal open={showForm} title="매출계획 등록" onClose={() => setShowForm(false)}>
        <PlanForm year={year} items={items} onError={setError} onSaved={() => { setShowForm(false); setOk('매출계획 등록 완료'); load() }} />
      </Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ textAlign: 'center' }}>연월</th>
            <th>품목</th>
            <th style={{ textAlign: 'right' }}>계획수량</th>
            <th style={{ textAlign: 'right' }}>계획금액</th>
            <th style={{ textAlign: 'right' }}>실적수량</th>
            <th style={{ textAlign: 'right' }}>실적금액</th>
            <th style={{ textAlign: 'right' }}>달성률</th>
            <th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>{year}년 매출계획이 없습니다. 「매출계획 등록」으로 추가하세요.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{r.planYear}-{String(r.planMonth).padStart(2, '0')}</td>
              <td>{r.itemName} <span style={{ color: '#9aa1ab', fontSize: 11 }}>{r.unit}</span></td>
              <td style={{ textAlign: 'right' }}>{won(r.planQty)}</td>
              <td style={{ textAlign: 'right' }}>{won(r.planAmount)}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.actualQty)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>{won(r.actualAmount)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: rateColor(r.achieveRate) }}>{r.achieveRate.toFixed(1)}%</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(r.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

function PlanForm({
  year, items, onError, onSaved,
}: {
  year: number
  items: Item[]
  onError: (m: string) => void
  onSaved: () => void
}) {
  const [itemId, setItemId] = useState('')
  const [month, setMonth] = useState('1')
  const [planQty, setPlanQty] = useState('')
  const [planAmount, setPlanAmount] = useState('')
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!itemId) { onError('품목을 선택하세요.'); return }
    setSaving(true); onError('')
    try {
      await api.post('/sales-plans', {
        itemId: Number(itemId),
        planYear: year,
        planMonth: Number(month),
        planQty: Number(planQty || 0),
        planAmount: Number(planAmount || 0),
        remark: remark || undefined,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const cls = 'ec-input'
  const lbl: React.CSSProperties = { fontSize: 12.5, color: '#3c4553', fontWeight: 600, display: 'block', marginBottom: 4 }
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 360 }}>
      <div style={{ fontSize: 12, color: '#8a929c' }}>계획연도 <b style={{ color: '#3c4553' }}>{year}년</b></div>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 2 }}><span style={lbl}>품목 *</span>
          <select className={cls} value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ width: '100%' }}>
            <option value="">품목 선택</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </select>
        </label>
        <label style={{ flex: 1 }}><span style={lbl}>월 *</span>
          <select className={cls} value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: '100%' }}>
            {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1 }}><span style={lbl}>계획수량</span>
          <input className={cls} type="number" step="any" value={planQty} onChange={(e) => setPlanQty(e.target.value)} style={{ width: '100%', textAlign: 'right' }} /></label>
        <label style={{ flex: 1 }}><span style={lbl}>계획금액</span>
          <input className={cls} type="number" step="any" value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} style={{ width: '100%', textAlign: 'right' }} /></label>
      </div>
      <label><span style={lbl}>적요</span>
        <input className={cls} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} placeholder="선택" /></label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
        <button type="submit" className="ec-btn ec-btn-primary" disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
      </div>
    </form>
  )
}

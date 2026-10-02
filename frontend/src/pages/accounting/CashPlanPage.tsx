import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { CashFlowType, CashPlanStatus } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => n.toLocaleString('ko-KR')
const thisMonth = () => ymd(new Date()).slice(0, 7)
const signed = (n: number) => (n > 0 ? `+${won(n)}` : won(n))

/** 자금계획 — 월별 수입·지출 계획 대비 실적(그 달의 계좌 입출금 집계). */
export default function CashPlanPage() {
  const [period, setPeriod] = useState(thisMonth())
  const [status, setStatus] = useState<CashPlanStatus | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<CashPlanStatus>('/cash-plans', { params: { period } })
      .then((r) => setStatus(r.data))
      .catch((e) => { setStatus(null); setError(extractErrorMessage(e)) })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function remove(id: number, category: string) {
    if (!window.confirm(`'${category}' 계획을 삭제할까요?`)) return
    try { await api.delete(`/cash-plans/${id}`); flash('계획을 삭제했습니다.'); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const plans = status?.plans ?? []
  const inflows = plans.filter((p) => p.type === 'INFLOW')
  const outflows = plans.filter((p) => p.type === 'OUTFLOW')

  return (
    <EcListShell title="자금계획" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5 }}>귀속월</span>
        <input type="month" className="ec-input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 150 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        <button className="ec-btn" onClick={() => setShowForm(true)}>+ 계획추가</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ec-text-hint)' }}>
          실적은 그 달의 계좌 입출금을 집계합니다(현금 시재는 제외).
        </span>
      </div>

      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: 'var(--ec-blue-wash)', border: '1px solid var(--ec-info-line)', color: 'var(--ec-navy)' }}>{notice}</div>}

      {status && (
        <table className="w-full text-left" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>자금수지</th>
              <th style={{ textAlign: 'right' }}>계획</th>
              <th style={{ textAlign: 'right' }}>실적(계좌)</th>
              <th style={{ textAlign: 'right' }}>차이</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>수입</td>
              <td style={{ textAlign: 'right' }}>{won(status.plannedInflow)}</td>
              <td style={{ textAlign: 'right' }}>{won(status.actualInflow)}</td>
              <td style={{ textAlign: 'right', color: status.inflowDiff < 0 ? 'var(--ec-danger)' : 'var(--ec-success)' }}>{signed(status.inflowDiff)}</td>
            </tr>
            <tr>
              <td>지출</td>
              <td style={{ textAlign: 'right' }}>{won(status.plannedOutflow)}</td>
              <td style={{ textAlign: 'right' }}>{won(status.actualOutflow)}</td>
              <td style={{ textAlign: 'right', color: status.outflowDiff > 0 ? 'var(--ec-danger)' : 'var(--ec-success)' }}>{signed(status.outflowDiff)}</td>
            </tr>
            <tr style={{ fontWeight: 700, background: 'var(--ec-bg-page)' }}>
              <td>수지(수입 − 지출)</td>
              <td style={{ textAlign: 'right' }}>{won(status.plannedNet)}</td>
              <td style={{ textAlign: 'right', color: status.actualNet < 0 ? 'var(--ec-danger)' : 'var(--ec-blue-dark)' }}>{won(status.actualNet)}</td>
              <td style={{ textAlign: 'right' }}>{signed(status.actualNet - status.plannedNet)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <PlanTable title="수입 계획" rows={inflows} onRemove={remove} />
        <PlanTable title="지출 계획" rows={outflows} onRemove={remove} />
      </div>

      <Modal error={error} open={showForm} title="자금계획 등록" onClose={() => setShowForm(false)}>{(
        <CashPlanForm
          period={period}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('자금계획을 추가했습니다.'); load() }}
        />
      )}</Modal>
    </EcListShell>
  )
}

function PlanTable({ title, rows, onRemove }: {
  title: string
  rows: CashPlanStatus['plans']
  onRemove: (id: number, category: string) => void
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4, color: 'var(--ec-blue-dark)' }}>{title}</div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th><th>항목</th>
            <th style={{ textAlign: 'right' }}>금액</th><th>비고</th>
            <th style={{ width: 50, textAlign: 'center' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 16 }}>등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: 'var(--ec-text-hint)' }}>{i + 1}</td>
              <td>{r.category}</td>
              <td style={{ textAlign: 'right' }}>{won(r.amount)}</td>
              <td style={{ fontSize: 12, color: 'var(--ec-text-hint)' }}>{r.remark ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 6px', color: 'var(--ec-danger)' }} onClick={() => onRemove(r.id, r.category)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'var(--ec-bg-page)' }}>
            <td colSpan={2} style={{ textAlign: 'right' }}>합계</td>
            <td style={{ textAlign: 'right' }}>{won(total)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function CashPlanForm({ period, onClose, onSaved }: { period: string; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<CashFlowType>('INFLOW')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!category.trim()) return setError('자금 항목을 입력하세요.')
    if (!(Number(amount) > 0)) return setError('금액을 입력하세요.')
    setSaving(true)
    try {
      await api.post('/cash-plans', { period, type, category, amount: Number(amount), remark: remark || undefined })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 520, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: 'var(--ec-bg-page)' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>자금계획 추가 — {period}</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: 'var(--ec-text-hint)' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 90, background: 'var(--ec-bg-page)' }}>구분<span style={{ color: 'var(--ec-danger)' }}>*</span></th>
                <td>
                  <select className="ec-input" value={type} onChange={(e) => setType(e.target.value as CashFlowType)} style={{ width: 140 }}>
                    <option value="INFLOW">수입</option>
                    <option value="OUTFLOW">지출</option>
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>항목<span style={{ color: 'var(--ec-danger)' }}>*</span></th>
                <td>
                  <input className="ec-input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: '100%' }}
                    placeholder={type === 'INFLOW' ? '예: 매출대금 회수, 어음 만기결제' : '예: 급여 지급, 임차료, 원자재 대금'} />
                </td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>금액<span style={{ color: 'var(--ec-danger)' }}>*</span></th>
                <td><input type="number" className="ec-input" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 180, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th style={{ background: 'var(--ec-bg-page)' }}>비고</th>
                <td><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

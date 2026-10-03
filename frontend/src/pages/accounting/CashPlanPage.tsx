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
      <div className="flex items-center gap-[6px] mb-[8px]">
        <span className="text-[12.5px]">귀속월</span>
        <input type="month" className="ec-input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 150 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        <button className="ec-btn" onClick={() => setShowForm(true)}>+ 계획추가</button>
        <span className="ml-[8px] text-[12px] text-ec-hint">
          실적은 그 달의 계좌 입출금을 집계합니다(현금 시재는 제외).
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {status && (
        <table className="w-full text-left mb-[12px]">
          <thead>
            <tr>
              <th>자금수지</th>
              <th className="text-right">계획</th>
              <th className="text-right">실적(계좌)</th>
              <th className="text-right">차이</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>수입</td>
              <td className="text-right">{won(status.plannedInflow)}</td>
              <td className="text-right">{won(status.actualInflow)}</td>
              <td style={{ textAlign: 'right', color: status.inflowDiff < 0 ? 'var(--ec-danger)' : 'var(--ec-success)' }}>{signed(status.inflowDiff)}</td>
            </tr>
            <tr>
              <td>지출</td>
              <td className="text-right">{won(status.plannedOutflow)}</td>
              <td className="text-right">{won(status.actualOutflow)}</td>
              <td style={{ textAlign: 'right', color: status.outflowDiff > 0 ? 'var(--ec-danger)' : 'var(--ec-success)' }}>{signed(status.outflowDiff)}</td>
            </tr>
            <tr className="font-bold bg-ec-page">
              <td>수지(수입 − 지출)</td>
              <td className="text-right">{won(status.plannedNet)}</td>
              <td style={{ textAlign: 'right', color: status.actualNet < 0 ? 'var(--ec-danger)' : 'var(--ec-blue-dark)' }}>{won(status.actualNet)}</td>
              <td className="text-right">{signed(status.actualNet - status.plannedNet)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="flex gap-[12px]">
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
    <div className="flex-1">
      <div className="font-bold text-[12.5px] mb-[4px] text-ec-navy">{title}</div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th><th>항목</th>
            <th className="text-right">금액</th><th>비고</th>
            <th className="w-[50px] text-center"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{r.category}</td>
              <td className="text-right">{won(r.amount)}</td>
              <td className="text-[12px] text-ec-hint">{r.remark ?? ''}</td>
              <td className="text-center">
                <button className="ec-btn" style={{ height: 20, padding: '0 6px', color: 'var(--ec-danger)' }} onClick={() => onRemove(r.id, r.category)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={2} className="text-right">합계</td>
            <td className="text-right">{won(total)}</td>
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
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">자금계획 추가 — {period}</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th className="w-[90px] bg-ec-page">구분<span className="text-ec-danger">*</span></th>
                <td>
                  <select className="ec-input" value={type} onChange={(e) => setType(e.target.value as CashFlowType)} style={{ width: 140 }}>
                    <option value="INFLOW">수입</option>
                    <option value="OUTFLOW">지출</option>
                  </select>
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">항목<span className="text-ec-danger">*</span></th>
                <td>
                  <input className="ec-input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: '100%' }}
                    placeholder={type === 'INFLOW' ? '예: 매출대금 회수, 어음 만기결제' : '예: 급여 지급, 임차료, 원자재 대금'} />
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">금액<span className="text-ec-danger">*</span></th>
                <td><input type="number" className="ec-input" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 180, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">비고</th>
                <td><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

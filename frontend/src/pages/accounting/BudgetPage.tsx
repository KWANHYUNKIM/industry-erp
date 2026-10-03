import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Account, BudgetStatus } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => n.toLocaleString('ko-KR')
const thisMonth = () => ymd(new Date()).slice(0, 7)

/** 예산관리 — 계정별 편성액 대비 집행실적(회계전표 집계). 실적은 저장하지 않고 볼 때 계산한다. */
export default function BudgetPage() {
  const [period, setPeriod] = useState(thisMonth())
  const [status, setStatus] = useState<BudgetStatus | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<BudgetStatus>('/budgets', { params: { period } })
      .then((r) => setStatus(r.data))
      .catch((e) => { setStatus(null); setError(extractErrorMessage(e)) })
  }

  useEffect(() => {
    load()
    api.get<Account[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function remove(id: number, name: string) {
    if (!window.confirm(`${name} 예산을 삭제할까요?`)) return
    try { await api.delete(`/budgets/${id}`); flash('예산을 삭제했습니다.'); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function edit(id: number, name: string, current: number) {
    const input = window.prompt(`${name} 예산액`, String(current))
    if (input === null) return
    const amount = Number(input)
    if (!(amount > 0)) return alert('예산액은 0보다 커야 합니다.')
    try {
      await api.put(`/budgets/${id}`, { amount })
      flash('예산을 수정했습니다.')
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  const rows = status?.rows ?? []

  return (
    <EcListShell title="예산관리" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div className="flex items-center gap-[6px] mb-[8px]">
        <span className="text-[12.5px]">귀속월</span>
        <input type="month" className="ec-input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 150 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        <button className="ec-btn" onClick={() => setShowForm(true)}>+ 예산편성</button>
        <span className="ml-[8px] text-[12px] text-ec-hint">
          집행실적은 그 달의 회계전표에서 계산합니다. 전표를 고치면 집행률이 함께 바뀝니다.
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {status && (
        <div className="flex gap-[8px] mb-[10px]">
          <Tile label="편성 합계" value={won(status.totalBudget)} />
          <Tile label="집행 합계" value={won(status.totalActual)} />
          <Tile label="잔여" value={won(status.totalRemaining)} />
          <Tile label="집행률" value={`${status.executionRate}%`} strong />
        </div>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th>계정코드</th><th>계정과목</th>
            <th className="text-right">편성액</th>
            <th className="text-right">집행액</th>
            <th className="text-right">잔여</th>
            <th className="text-right w-[160px]">집행률</th>
            <th>비고</th>
            <th className="text-center">처리</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="text-center text-ec-hint p-[20px]">
              편성된 예산이 없습니다. [+ 예산편성]으로 계정별 예산을 잡으세요.
            </td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{r.accountCode}</td>
              <td>{r.accountName}</td>
              <td className="text-right">{won(r.amount)}</td>
              <td className="text-right">{won(r.actual)}</td>
              <td style={{ textAlign: 'right', color: r.over ? 'var(--ec-danger)' : undefined, fontWeight: r.over ? 700 : undefined }}>
                {won(r.remaining)}
              </td>
              <td>
                <div className="flex items-center gap-[6px]">
                  <div style={{ flex: 1, height: 8, background: '#eef1f4', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(Number(r.executionRate), 100)}%`, height: '100%',
                      background: r.over ? 'var(--ec-danger)' : Number(r.executionRate) >= 80 ? 'var(--ec-warn)' : 'var(--ec-blue)',
                    }} />
                  </div>
                  <span style={{ fontSize: 11.5, width: 48, textAlign: 'right', color: r.over ? 'var(--ec-danger)' : 'var(--ec-label)' }}>
                    {r.executionRate}%
                  </span>
                </div>
              </td>
              <td className="text-[12px] text-ec-hint">{r.over ? '예산 초과' : (r.remark ?? '')}</td>
              <td className="text-center">
                <div className="inline-flex gap-[3px]">
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => edit(r.id, r.accountName, r.amount)}>수정</button>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => remove(r.id, r.accountName)}>삭제</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={error} open={showForm} title="예산 등록" onClose={() => setShowForm(false)}>{(
        <BudgetForm
          period={period}
          accounts={accounts}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('예산을 편성했습니다.'); load() }}
        />
      )}</Modal>
    </EcListShell>
  )
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', borderRadius: 3, padding: '8px 10px', background: strong ? 'var(--ec-blue-wash)' : '#fff' }}>
      <div className="text-[11.5px] text-ec-hint">{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: strong ? 'var(--ec-blue-dark)' : 'var(--ec-text)' }}>{value}</div>
    </div>
  )
}

function BudgetForm({ period, accounts, onClose, onSaved }: {
  period: string; accounts: Account[]; onClose: () => void; onSaved: () => void
}) {
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!accountId) return setError('계정과목을 선택하세요.')
    if (!(Number(amount) > 0)) return setError('예산액을 입력하세요.')
    setSaving(true)
    try {
      await api.post('/budgets', { period, accountId: Number(accountId), amount: Number(amount), remark: remark || undefined })
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
          <span className="font-extrabold text-ec-navy">예산편성 — {period}</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th className="w-[90px] bg-ec-page">계정과목<span className="text-ec-danger">*</span></th>
                <td>
                  <select className="ec-input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ width: '100%' }}>
                    <option value="">계정 선택</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name} ({a.divisionName})</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">예산액<span className="text-ec-danger">*</span></th>
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

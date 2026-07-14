import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Account, BudgetStatus } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const thisMonth = () => new Date().toISOString().slice(0, 7)

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5 }}>귀속월</span>
        <input type="month" className="ec-input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 150 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        <button className="ec-btn" onClick={() => setShowForm(true)}>+ 예산편성</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>
          집행실적은 그 달의 회계전표에서 계산합니다. 전표를 고치면 집행률이 함께 바뀝니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {status && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Tile label="편성 합계" value={won(status.totalBudget)} />
          <Tile label="집행 합계" value={won(status.totalActual)} />
          <Tile label="잔여" value={won(status.totalRemaining)} />
          <Tile label="집행률" value={`${status.executionRate}%`} strong />
        </div>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>계정코드</th><th>계정과목</th>
            <th style={{ textAlign: 'right' }}>편성액</th>
            <th style={{ textAlign: 'right' }}>집행액</th>
            <th style={{ textAlign: 'right' }}>잔여</th>
            <th style={{ width: 160 }}>집행률</th>
            <th>비고</th>
            <th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              편성된 예산이 없습니다. [+ 예산편성]으로 계정별 예산을 잡으세요.
            </td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.accountCode}</td>
              <td>{r.accountName}</td>
              <td style={{ textAlign: 'right' }}>{won(r.amount)}</td>
              <td style={{ textAlign: 'right' }}>{won(r.actual)}</td>
              <td style={{ textAlign: 'right', color: r.over ? '#c60a2e' : undefined, fontWeight: r.over ? 700 : undefined }}>
                {won(r.remaining)}
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 8, background: '#eef1f4', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(Number(r.executionRate), 100)}%`, height: '100%',
                      background: r.over ? '#c60a2e' : Number(r.executionRate) >= 80 ? '#c07a00' : 'var(--ec-blue)',
                    }} />
                  </div>
                  <span style={{ fontSize: 11.5, width: 48, textAlign: 'right', color: r.over ? '#c60a2e' : '#5a626e' }}>
                    {r.executionRate}%
                  </span>
                </div>
              </td>
              <td style={{ fontSize: 12, color: '#8a929c' }}>{r.over ? '예산 초과' : (r.remark ?? '')}</td>
              <td style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', gap: 3 }}>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => edit(r.id, r.accountName, r.amount)}>수정</button>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(r.id, r.accountName)}>삭제</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <BudgetForm
          period={period}
          accounts={accounts}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('예산을 편성했습니다.'); load() }}
        />
      )}
    </EcListShell>
  )
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', borderRadius: 3, padding: '8px 10px', background: strong ? '#eef5ff' : '#fff' }}>
      <div style={{ fontSize: 11.5, color: '#8a929c' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: strong ? 'var(--ec-blue-dark)' : '#2b3440' }}>{value}</div>
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
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>예산편성 — {period}</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>계정과목<span style={{ color: '#c60a2e' }}>*</span></th>
                <td>
                  <select className="ec-input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ width: '100%' }}>
                    <option value="">계정 선택</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name} ({a.divisionName})</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>예산액<span style={{ color: '#c60a2e' }}>*</span></th>
                <td><input type="number" className="ec-input" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 180, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>비고</th>
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

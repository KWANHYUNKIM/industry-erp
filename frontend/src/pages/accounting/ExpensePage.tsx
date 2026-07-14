import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import type { Project } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const PAYMENTS = ['법인카드', '계좌이체', '현금']

interface Account { id: number; code: string; name: string; division: string }
interface Expense {
  id: number
  expenseDate: string
  accountId: number
  accountName: string
  content: string | null
  partnerName: string | null
  amount: number
  paymentMethod: string | null
  department: string | null
  createdBy: string | null
}

/** 회계 > 비용관리 — 판매관리비 지출 내역 (실제 연동, 계정과목 FK) */
export default function ExpensePage() {
  const [rows, setRows] = useState<Expense[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [keyword, setKeyword] = useState('')
  const [accountFilter, setAccountFilter] = useState('전체')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    expenseDate: today(), accountId: '', content: '', partnerName: '', amount: '', paymentMethod: '법인카드', department: '', projectId: '',
  })
  const [projects, setProjects] = useState<Project[]>([])

  async function load() {
    setLoading(true)
    try {
      api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
      const [e, a] = await Promise.all([
        api.get<Expense[]>('/expenses'),
        api.get<Account[]>('/accounts'),
      ])
      setRows(e.data)
      // 비용 계정만(구분 EXPENSE) 노출하되, 없으면 전체 허용
      const expenseAccounts = a.data.filter((x) => x.division === 'EXPENSE')
      setAccounts(expenseAccounts.length > 0 ? expenseAccounts : a.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.accountId) return setError('계정과목을 선택하세요.')
    if (!form.amount || Number(form.amount) <= 0) return setError('금액을 입력하세요.')
    try {
      await api.post('/expenses', {
        accountId: Number(form.accountId),
        expenseDate: form.expenseDate,
        content: form.content || undefined,
        partnerName: form.partnerName || undefined,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod || undefined,
        department: form.department || undefined,
        projectId: form.projectId ? Number(form.projectId) : undefined,
      })
      setForm((f) => ({ ...f, content: '', partnerName: '', amount: '', department: '' }))
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(e: Expense) {
    if (!window.confirm(`[${e.accountName}] ${e.amount.toLocaleString()}원 지출을 삭제할까요?`)) return
    try {
      await api.delete(`/expenses/${e.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const accountNames = useMemo(() => Array.from(new Set(rows.map((r) => r.accountName))), [rows])
  const shown = rows
    .filter((r) => accountFilter === '전체' || r.accountName === accountFilter)
    .filter((r) => !keyword || (r.content ?? '').includes(keyword) || (r.partnerName ?? '').includes(keyword))
  const total = useMemo(() => shown.reduce((s, r) => s + r.amount, 0), [shown])

  return (
    <EcListShell
      title="비용관리 (판매관리비)"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '지출등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      {showForm && (
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>지출 등록</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>지출일</div>
              <input className="ec-input" type="date" value={form.expenseDate} onChange={(e) => set('expenseDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>계정과목 *</div>
              <select className="ec-input" value={form.accountId} onChange={(e) => set('accountId', e.target.value)} style={{ width: 180 }}>
                <option value="">선택하세요</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 180 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>적요</div>
              <input className="ec-input" value={form.content} onChange={(e) => set('content', e.target.value)} style={{ width: '100%' }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>거래처</div>
              <input className="ec-input" value={form.partnerName} onChange={(e) => set('partnerName', e.target.value)} style={{ width: 130 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>금액 *</div>
              <input className="ec-input text-right" type="number" step="any" value={form.amount} onChange={(e) => set('amount', e.target.value)} style={{ width: 120 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>결제수단</div>
              <select className="ec-input" value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} style={{ width: 100 }}>
                {PAYMENTS.map((p) => <option key={p}>{p}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>부서</div>
              <input className="ec-input" value={form.department} onChange={(e) => set('department', e.target.value)} style={{ width: 100 }} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>프로젝트
              <select className="ec-input" value={form.projectId} onChange={(e) => set('projectId', e.target.value)} style={{ width: 160 }}>
                <option value="">(없음)</option>
                {projects.map((pj) => <option key={pj.id} value={pj.id}>{pj.code} {pj.name}</option>)}
              </select></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>계정</span>
        <select className="ec-input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{ width: 160 }}>
          <option>전체</option>
          {accountNames.map((a) => <option key={a}>{a}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b> 원
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>지출일 ▼</th>
            <th style={{ width: 120 }}>계정과목 ▼</th>
            <th>적요</th>
            <th style={{ width: 120 }}>거래처</th>
            <th style={{ width: 110, textAlign: 'right' }}>금액</th>
            <th style={{ width: 90, textAlign: 'center' }}>결제수단</th>
            <th style={{ width: 80 }}>부서</th>
            <th style={{ width: 50, textAlign: 'center' }}></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>지출 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.expenseDate}</td>
              <td>{r.accountName}</td>
              <td>{r.content ?? ''}</td>
              <td>{r.partnerName ?? ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.amount.toLocaleString()}</td>
              <td style={{ textAlign: 'center' }}>{r.paymentMethod ?? ''}</td>
              <td>{r.department ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => remove(r)} title="삭제" style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 13 }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ background: '#f5f7fa', fontWeight: 700 }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{total.toLocaleString()}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

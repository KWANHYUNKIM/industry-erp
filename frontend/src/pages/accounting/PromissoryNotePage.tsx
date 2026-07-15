import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { BankAccountRow, NoteStatus, NoteSummary, Partner, PromissoryNote } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)

const TABS = ['전체', '보유', '결제완료', '할인', '부도'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, NoteStatus> = {
  보유: 'HELD', 결제완료: 'SETTLED', 할인: 'DISCOUNTED', 부도: 'DISHONORED',
}
const statusColor = (s: NoteStatus) =>
  s === 'SETTLED' ? '#1c7c3c' : s === 'DISHONORED' ? '#c60a2e' : s === 'DISCOUNTED' ? '#c07a00' : 'var(--ec-blue)'

/** 어음거래 — 받을어음 수취 / 지급어음 발행 → 만기결제·할인·부도. 모든 단계가 분개를 남긴다. */
export default function PromissoryNotePage() {
  const [summary, setSummary] = useState<NoteSummary | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const [accounts, setAccounts] = useState<BankAccountRow[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<NoteSummary>('/notes').then((r) => setSummary(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => {
    load()
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
    api.get<BankAccountRow[]>('/bank-cards/accounts').then((r) => setAccounts(r.data)).catch(() => {})
  }, [])

  const notes = summary?.notes ?? []
  const shown = useMemo(() => notes.filter((n) => tab === '전체' || n.status === TAB_STATUS[tab]), [notes, tab])
  const tabCount = (t: Tab) => notes.filter((n) => t === '전체' || n.status === TAB_STATUS[t]).length

  function pickAccount(purpose: string): number | null {
    if (accounts.length === 0) { alert('등록된 계좌가 없습니다. 회계 I > 계좌/카드에서 먼저 등록하세요.'); return null }
    const picked = window.prompt(
      `${purpose}할 계좌를 선택하세요.\n${accounts.map((a) => `${a.id}: ${a.bankName} ${a.accountNo} (잔액 ${won(a.balance)})`).join('\n')}`,
      String(accounts[0].id),
    )
    if (picked === null) return null
    const id = Number(picked)
    if (!accounts.some((a) => a.id === id)) { alert('계좌 번호가 올바르지 않습니다.'); return null }
    return id
  }

  async function settle(n: PromissoryNote) {
    const bankAccountId = pickAccount(n.type === 'RECEIVABLE' ? '입금' : '출금')
    if (bankAccountId === null) return
    try {
      await api.post(`/notes/${n.id}/settle`, { bankAccountId, settleDate: today() })
      flash(`${n.noteNo} 만기결제 — 계좌 잔액과 분개 반영`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function discount(n: PromissoryNote) {
    const feeInput = window.prompt(`${n.noteNo} 할인료(원). 어음 금액 ${won(n.amount)}`, '0')
    if (feeInput === null) return
    const discountFee = Number(feeInput)
    if (!Number.isFinite(discountFee) || discountFee < 0) return alert('할인료를 0 이상 숫자로 입력하세요.')
    const bankAccountId = pickAccount('할인 대금을 입금')
    if (bankAccountId === null) return
    try {
      await api.post(`/notes/${n.id}/discount`, { bankAccountId, discountFee, discountDate: today() })
      flash(`${n.noteNo} 할인 — 할인료는 매출채권처분손실로 분개`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function dishonor(n: PromissoryNote) {
    if (!window.confirm(`${n.noteNo}을(를) 부도 처리할까요? 어음채권이 외상매출금으로 환원됩니다.`)) return
    try {
      await api.post(`/notes/${n.id}/dishonor`, { dishonorDate: today() })
      flash(`${n.noteNo} 부도 — 외상매출금으로 환원`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="어음거래" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 어음등록(F2)</button>
        <button className="ec-btn" onClick={load}>새로고침</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>
          수취/발행 → 만기결제 · 할인 · 부도. 결제·할인은 계좌 잔액이 함께 움직입니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {summary && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Tile label="받을어음 보유" value={won(summary.receivableHeld)} />
          <Tile label="30일 내 만기(받을)" value={won(summary.receivableDueSoon)} />
          <Tile label="지급어음 보유" value={won(summary.payableHeld)} />
          <Tile label="30일 내 만기(지급)" value={won(summary.payableDueSoon)} strong />
        </div>
      )}

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({tabCount(t)})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>어음번호</th><th>구분</th><th>거래처</th><th>발행일</th><th>만기일</th>
            <th style={{ textAlign: 'right' }}>금액</th><th style={{ textAlign: 'right' }}>할인료</th>
            <th>발행은행</th><th style={{ textAlign: 'center' }}>상태</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>어음이 없습니다.</td></tr>
          ) : shown.map((n, i) => (
            <tr key={n.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{n.noteNo}</td>
              <td>{n.typeName}</td>
              <td>{n.partnerName}</td>
              <td>{n.issueDate}</td>
              <td style={{ color: n.status === 'HELD' && n.dueDate <= today() ? '#c60a2e' : undefined }}>{n.dueDate}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(n.amount)}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{n.discountFee ? won(n.discountFee) : ''}</td>
              <td>{n.bankName ?? ''}</td>
              <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(n.status) }}>{n.statusName}</span></td>
              <td style={{ textAlign: 'center' }}>
                {n.status === 'HELD' ? (
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => settle(n)}>만기결제</button>
                    {n.type === 'RECEIVABLE' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => discount(n)}>할인</button>}
                    {n.type === 'RECEIVABLE' && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => dishonor(n)}>부도</button>}
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: '#8a929c' }}>{n.closedDate}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && <NoteForm partners={partners} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); flash('어음을 등록했습니다. 분개가 생성되었습니다.'); load() }} />}
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

function NoteForm({ partners, onClose, onSaved }: { partners: Partner[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'RECEIVABLE' | 'PAYABLE'>('RECEIVABLE')
  const [partnerId, setPartnerId] = useState('')
  const [issueDate, setIssueDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState('')
  const [bankName, setBankName] = useState('')
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const candidates = partners.filter((p) => (type === 'RECEIVABLE' ? p.type !== 'SUPPLIER' : p.type !== 'CUSTOMER'))

  async function save() {
    setError('')
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (!dueDate) return setError('만기일을 입력하세요.')
    if (!(Number(amount) > 0)) return setError('어음 금액을 입력하세요.')
    setSaving(true)
    try {
      await api.post('/notes', {
        type, partnerId: Number(partnerId), issueDate, dueDate,
        amount: Number(amount), bankName: bankName || undefined, remark: remark || undefined,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 560, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>어음등록</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>구분<span style={{ color: '#c60a2e' }}>*</span></th>
                <td colSpan={3}>
                  <select className="ec-input" value={type} onChange={(e) => { setType(e.target.value as 'RECEIVABLE' | 'PAYABLE'); setPartnerId('') }} style={{ width: 200 }}>
                    <option value="RECEIVABLE">받을어음 (매출대금 수취)</option>
                    <option value="PAYABLE">지급어음 (매입대금 발행)</option>
                  </select>
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>
                    {type === 'RECEIVABLE' ? '차)받을어음 / 대)외상매출금' : '차)외상매입금 / 대)지급어음'}
                  </span>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>거래처<span style={{ color: '#c60a2e' }}>*</span></th>
                <td colSpan={3}>
                  <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 240 }}>
                    <option value="">거래처 선택</option>
                    {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>발행일</th>
                <td><input type="date" className="ec-input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={{ width: 70, background: '#f5f7fa' }}>만기일<span style={{ color: '#c60a2e' }}>*</span></th>
                <td><input type="date" className="ec-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>금액<span style={{ color: '#c60a2e' }}>*</span></th>
                <td><input type="number" className="ec-input" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 150, textAlign: 'right' }} /></td>
                <th style={{ background: '#f5f7fa' }}>발행은행</th>
                <td><input className="ec-input" value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>비고</th>
                <td colSpan={3}><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} /></td>
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

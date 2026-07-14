import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import type { BankAccountRow, BankCheck, CheckType, Partner } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => n.toLocaleString('ko-KR')

const TABS: { label: string; type: CheckType }[] = [
  { label: '받은수표', type: 'RECEIVED' },
  { label: '발행수표', type: 'ISSUED' },
]

const STATUS_COLOR: Record<BankCheck['status'], string> = {
  HELD: 'var(--ec-blue)',
  DEPOSITED: '#1c7c3c',
  PAID: '#1c7c3c',
  DISHONORED: '#c60a2e',
}

/**
 * 회계 II > 수표관리.
 *   받은수표 — 수취(보유) → 계좌 입금 또는 부도
 *   발행수표 — 당좌계좌에서 발행(그 순간 예금이 빠진다) → 은행 인출 확인
 */
export default function CheckPage() {
  const [type, setType] = useState<CheckType>('RECEIVED')
  const [rows, setRows] = useState<BankCheck[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3000) }

  async function load() {
    setLoading(true)
    try {
      const [c, b, p] = await Promise.all([
        api.get<BankCheck[]>('/checks'),
        api.get<BankAccountRow[]>('/bank-cards/accounts'),
        api.get<Partner[]>('/partners'),
      ])
      setRows(c.data)
      setBanks(b.data)
      setPartners(p.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function deposit(c: BankCheck) {
    const usable = banks.filter((b) => b.active)
    if (usable.length === 0) return setError('입금할 계좌가 없습니다. 계좌를 먼저 등록하세요.')
    const list = usable.map((b, i) => `${i + 1}. ${b.bankName} ${b.accountNo}`).join('\n')
    const pick = window.prompt(`${c.checkNo} (${won(c.amount)}원) 입금할 계좌 번호를 고르세요.\n\n${list}`, '1')
    if (pick === null) return
    const bank = usable[Number(pick) - 1]
    if (!bank) return setError('계좌 선택이 올바르지 않습니다.')
    try {
      await api.post(`/checks/${c.id}/deposit`, { bankAccountId: bank.id, depositDate: today() })
      flash(`${c.checkNo} → ${bank.bankName} 입금 (계좌 잔액 +${won(c.amount)})`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function act(c: BankCheck, path: 'dishonor' | 'settle', message: string) {
    if (!window.confirm(`${c.checkNo} (${won(c.amount)}원) — ${message}할까요?`)) return
    try {
      await api.post(`/checks/${c.id}/${path}`, { settledDate: today() })
      flash(`${c.checkNo} ${message} 처리`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => r.type === type)
  const count = (t: CheckType) => rows.filter((r) => r.type === t).length
  const held = shown.filter((r) => r.status === 'HELD')
  const heldTotal = held.reduce((s, r) => s + r.amount, 0)

  return (
    <EcListShell
      title="수표관리"
      newLabel={showForm ? '입력닫기' : `${type === 'RECEIVED' ? '수표 수취' : '수표 발행'}(F2)`}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t.type} onClick={() => { setType(t.type); setShowForm(false); setError('') }} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: type === t.type ? '#fff' : 'transparent', color: type === t.type ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: type === t.type ? 700 : 400,
            borderBottom: type === t.type ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t.label} ({count(t.type)})</button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: '#5a626e' }}>
          미처리 {held.length}건 · <b style={{ color: 'var(--ec-blue-dark)' }}>{won(heldTotal)}</b>
        </span>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {showForm && (
        <CheckForm
          type={type} banks={banks} partners={partners} onError={setError}
          onSaved={(c) => { setShowForm(false); flash(`${c.checkNo} 등록`); load() }}
        />
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>수표번호</th>
            <th style={{ width: 100 }}>{type === 'RECEIVED' ? '수취일' : '발행일'} ▼</th>
            <th style={{ width: 120, textAlign: 'right' }}>금액</th>
            <th style={{ width: 110 }}>은행</th>
            <th style={{ width: 130 }}>거래처</th>
            <th style={{ width: 170 }}>{type === 'RECEIVED' ? '입금계좌' : '발행계좌'}</th>
            <th style={{ width: 100, textAlign: 'center' }}>상태</th>
            <th style={{ width: 100 }}>처리일</th>
            <th style={{ width: 140, textAlign: 'center' }}>처리</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>수표가 없습니다.</td></tr>
          ) : shown.map((c, i) => (
            <tr key={c.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.checkNo}</td>
              <td>{c.issueDate}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(c.amount)}</td>
              <td>{c.bankName ?? ''}</td>
              <td>{c.partnerName ?? ''}</td>
              <td style={{ color: '#5a626e' }}>{c.bankAccountName ?? '-'}</td>
              <td style={{ textAlign: 'center', color: STATUS_COLOR[c.status], fontWeight: 600 }}>{c.statusName}</td>
              <td>{c.settledDate ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                {c.status === 'HELD' && (
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    {c.type === 'RECEIVED' ? (
                      <>
                        <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => deposit(c)}>입금</button>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => act(c, 'dishonor', '부도')}>부도</button>
                      </>
                    ) : (
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => act(c, 'settle', '결제 확인')}>결제확인</button>
                    )}
                  </div>
                )}
              </td>
              <td style={{ color: '#5a626e' }}>{c.remark ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

function CheckForm({ type, banks, partners, onError, onSaved }: {
  type: CheckType; banks: BankAccountRow[]; partners: Partner[]
  onError: (m: string) => void; onSaved: (c: BankCheck) => void
}) {
  const usable = banks.filter((b) => b.active)
  const [form, setForm] = useState({
    checkNo: '', amount: '', issueDate: today(), bankName: '',
    partnerId: '', bankAccountId: usable[0] ? String(usable[0].id) : '', remark: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const isIssued = type === 'ISSUED'

  async function submit() {
    onError('')
    if (!form.checkNo) return onError('수표번호를 입력하세요.')
    if (!(Number(form.amount) > 0)) return onError('금액을 입력하세요.')
    if (isIssued && !form.bankAccountId) return onError('발행할 당좌계좌를 선택하세요.')
    setSaving(true)
    try {
      const { data } = await api.post<BankCheck>('/checks', {
        type,
        checkNo: form.checkNo,
        amount: Number(form.amount),
        issueDate: form.issueDate,
        bankName: form.bankName || undefined,
        partnerId: form.partnerId ? Number(form.partnerId) : undefined,
        bankAccountId: isIssued ? Number(form.bankAccountId) : undefined,
        remark: form.remark || undefined,
      })
      onSaved(data)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>
        {isIssued ? '수표 발행' : '수표 수취'}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="수표번호 *">
          <input className="ec-input" value={form.checkNo} onChange={(e) => set('checkNo', e.target.value)} style={{ width: 150 }} placeholder="가12345678" />
        </Field>
        <Field label={isIssued ? '발행일' : '수취일'}>
          <input className="ec-input" type="date" value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label="금액 *">
          <input className="ec-input" type="number" step="any" value={form.amount} onChange={(e) => set('amount', e.target.value)} style={{ width: 130, textAlign: 'right' }} />
        </Field>
        <Field label="은행">
          <input className="ec-input" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} style={{ width: 110 }} placeholder="국민은행" />
        </Field>
        <Field label="거래처">
          <select className="ec-input" value={form.partnerId} onChange={(e) => set('partnerId', e.target.value)} style={{ width: 150 }}>
            <option value="">선택 안함</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        {isIssued && (
          <Field label="발행계좌(당좌) *">
            <select className="ec-input" value={form.bankAccountId} onChange={(e) => set('bankAccountId', e.target.value)} style={{ width: 210 }}>
              <option value="">선택하세요</option>
              {usable.map((b) => <option key={b.id} value={b.id}>{b.bankName} {b.accountNo} (잔액 {won(b.balance)})</option>)}
            </select>
          </Field>
        )}
        <Field label="비고">
          <input className="ec-input" value={form.remark} onChange={(e) => set('remark', e.target.value)} style={{ width: 160 }} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
        {isIssued
          ? '※ 차)외상매입금 / 대)발행계좌의 예금계정으로 분개되고, 발행하는 순간 계좌 잔액이 줄어듭니다. 나중에 은행 인출이 확인되면 결제확인만 누르면 됩니다(회계는 이미 반영).'
          : '※ 차)받을수표 / 대)외상매출금으로 분개됩니다. 나중에 계좌에 입금하면 예금이 늘고 받을수표가 없어집니다. 부도가 나면 현금 없이 외상매출금으로 되돌아갑니다.'}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12.5 }}>
      <div style={{ color: '#5a626e', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  )
}

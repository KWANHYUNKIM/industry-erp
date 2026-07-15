import { Fragment, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import type { BankAccountRow, FastVoucher, FastVoucherType, Partner, PaymentMethod } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => n.toLocaleString('ko-KR')

interface AccountOption {
  id: number
  code: string
  name: string
  division: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
}

const TABS: { label: string; type: FastVoucherType }[] = [
  { label: '지출결의서', type: 'EXPENSE_REPORT' },
  { label: '입금보고서', type: 'DEPOSIT_REPORT' },
  { label: '가지급금정산서', type: 'ADVANCE_SETTLEMENT' },
]

/** 각 전표가 어떤 계정을 라인으로 쓰는지 */
const LINE_HINT: Record<FastVoucherType, { title: string; hint: string; divisions: AccountOption['division'][] }> = {
  EXPENSE_REPORT: {
    title: '지출 내역',
    hint: '차)비용계정들 / 대)결제수단(현금·예금·미지급금)으로 분개됩니다.',
    divisions: ['EXPENSE', 'ASSET'],
  },
  DEPOSIT_REPORT: {
    title: '입금 내역',
    hint: '차)입금수단(현금·예금·외상매출금) / 대)수입계정들로 분개됩니다.',
    divisions: ['REVENUE', 'ASSET', 'LIABILITY'],
  },
  ADVANCE_SETTLEMENT: {
    title: '실제 사용 내역',
    hint: '차)사용비용(+반납액) / 대)가지급금(+추가지급액)으로 분개됩니다. 가지급 지급 자체는 먼저 현금·계좌 출금(가지급금 계정)으로 처리하세요.',
    divisions: ['EXPENSE', 'ASSET'],
  },
}

interface LineForm { accountId: string; amount: string; description: string }
const emptyLine = (): LineForm => ({ accountId: '', amount: '', description: '' })

/** 회계 I > FastEntry — 지출결의서 · 입금보고서 · 가지급금정산서 (저장 즉시 복식부기 분개) */
export default function FastVoucherPage() {
  const [type, setType] = useState<FastVoucherType>('EXPENSE_REPORT')
  const [rows, setRows] = useState<FastVoucher[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3000) }

  async function load() {
    setLoading(true)
    try {
      const [v, a, b, p] = await Promise.all([
        api.get<FastVoucher[]>('/vouchers'),
        api.get<AccountOption[]>('/accounts'),
        api.get<BankAccountRow[]>('/bank-cards/accounts'),
        api.get<Partner[]>('/partners'),
      ])
      setRows(v.data)
      setAccounts(a.data)
      setBanks(b.data)
      setPartners(p.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => r.type === type)
  const count = (t: FastVoucherType) => rows.filter((r) => r.type === t).length
  const label = TABS.find((t) => t.type === type)!.label

  return (
    <EcListShell
      title="FastEntry (지출결의서·입금보고서·가지급금정산서)"
      newLabel={showForm ? '입력닫기' : `${label} 작성(F2)`}
      onNew={() => setShowForm(true)}
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
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <Modal open={showForm} title="FastEntry (지출결의서·입금보고서·가지급금정산서) 등록" onClose={() => setShowForm(false)}>{(
        <VoucherForm
          type={type} accounts={accounts} banks={banks} partners={partners}
          onError={setError}
          onSaved={(v) => { setShowForm(false); flash(`${v.voucherNo} 저장 · 회계전표 ${v.journalDocNo} 생성`); load() }}
        />
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>전표번호</th>
            <th style={{ width: 100 }}>일자 ▼</th>
            <th style={{ width: 110, textAlign: 'center' }}>결제수단</th>
            <th style={{ width: 170 }}>계좌</th>
            <th style={{ width: 120 }}>거래처</th>
            {type === 'ADVANCE_SETTLEMENT' && <th style={{ width: 110, textAlign: 'right' }}>가지급금</th>}
            <th style={{ width: 110, textAlign: 'right' }}>{type === 'ADVANCE_SETTLEMENT' ? '사용액' : '금액'}</th>
            {type === 'ADVANCE_SETTLEMENT' && <th style={{ width: 110, textAlign: 'right' }}>반납/추가</th>}
            <th style={{ width: 140 }}>회계전표</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>{label}가 없습니다.</td></tr>
          ) : shown.map((v, i) => (
            <Fragment key={v.id}>
              <tr onClick={() => setOpenId(openId === v.id ? null : v.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>
                  {openId === v.id ? '▾ ' : '▸ '}{v.voucherNo}
                </td>
                <td>{v.voucherDate}</td>
                <td style={{ textAlign: 'center' }}>{v.methodName}</td>
                <td style={{ color: '#5a626e' }}>{v.bankAccountName ?? '-'}</td>
                <td>{v.partnerName ?? ''}</td>
                {type === 'ADVANCE_SETTLEMENT' && (
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(v.advanceAmount ?? 0)}</td>
                )}
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(v.totalAmount)}</td>
                {type === 'ADVANCE_SETTLEMENT' && (
                  <td style={{ textAlign: 'right', fontWeight: 700, color: (v.balance ?? 0) < 0 ? '#c60a2e' : '#1c7c3c' }}>
                    {(v.balance ?? 0) === 0 ? '-' : (v.balance ?? 0) > 0
                      ? `반납 ${won(v.balance ?? 0)}` : `추가 ${won(-(v.balance ?? 0))}`}
                  </td>
                )}
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{v.journalDocNo ?? ''}</td>
                <td style={{ color: '#5a626e' }}>{v.description ?? ''}</td>
              </tr>
              {openId === v.id && (
                <tr className="no-ec">
                  <td colSpan={11} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}></th>
                          <th style={{ width: 140 }}>계정</th>
                          <th style={{ width: 130, textAlign: 'right' }}>금액</th>
                          <th>적요</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.lines.map((l) => (
                          <tr key={l.id}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{l.lineNo}</td>
                            <td>{l.accountCode} {l.accountName}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.amount)}</td>
                            <td style={{ color: '#5a626e' }}>{l.description ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

function VoucherForm({ type, accounts, banks, partners, onError, onSaved }: {
  type: FastVoucherType
  accounts: AccountOption[]; banks: BankAccountRow[]; partners: Partner[]
  onError: (m: string) => void; onSaved: (v: FastVoucher) => void
}) {
  const conf = LINE_HINT[type]
  const usableBanks = banks.filter((b) => b.active)
  const lineAccounts = useMemo(
    () => accounts.filter((a) => conf.divisions.includes(a.division)), [accounts, conf])

  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [bankAccountId, setBankAccountId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [voucherDate, setVoucherDate] = useState(today())
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  const [saving, setSaving] = useState(false)

  const isAdvance = type === 'ADVANCE_SETTLEMENT'
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const balance = isAdvance ? (Number(advanceAmount) || 0) - total : null

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function submit() {
    onError('')
    if (method === 'BANK' && !bankAccountId) return onError('계좌를 선택하세요.')
    if (isAdvance && !(Number(advanceAmount) > 0)) return onError('가지급금 금액을 입력하세요.')
    if (isAdvance && method === 'CREDIT') return onError('가지급금 정산은 현금 또는 계좌로만 처리합니다.')
    const payload = lines
      .filter((l) => l.accountId && Number(l.amount) > 0)
      .map((l) => ({ accountId: Number(l.accountId), amount: Number(l.amount), description: l.description || undefined }))
    if (payload.length === 0) return onError('내역을 1줄 이상 입력하세요.')

    setSaving(true)
    try {
      const { data } = await api.post<FastVoucher>('/vouchers', {
        type,
        voucherDate,
        method,
        bankAccountId: method === 'BANK' ? Number(bankAccountId) : undefined,
        partnerId: partnerId ? Number(partnerId) : undefined,
        advanceAmount: isAdvance ? Number(advanceAmount) : undefined,
        lines: payload,
        description: description || undefined,
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
        {TABS.find((t) => t.type === type)!.label} 작성
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <Field label="일자">
          <input className="ec-input" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label={type === 'DEPOSIT_REPORT' ? '입금수단 *' : '결제수단 *'}>
          <select className="ec-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} style={{ width: 130 }}>
            <option value="CASH">현금</option>
            <option value="BANK">계좌</option>
            {!isAdvance && (
              <option value="CREDIT">{type === 'DEPOSIT_REPORT' ? '외상매출금(미수)' : '미지급금'}</option>
            )}
          </select>
        </Field>
        {method === 'BANK' && (
          <Field label="계좌 *">
            <select className="ec-input" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} style={{ width: 210 }}>
              <option value="">선택하세요</option>
              {usableBanks.map((b) => <option key={b.id} value={b.id}>{b.bankName} {b.accountNo} (잔액 {won(b.balance)})</option>)}
            </select>
          </Field>
        )}
        {isAdvance && (
          <Field label="가지급금 *">
            <input className="ec-input" type="number" step="any" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} style={{ width: 120, textAlign: 'right' }} />
          </Field>
        )}
        <Field label="거래처">
          <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 150 }}>
            <option value="">선택 안함</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="적요">
          <input className="ec-input" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: 200 }} />
        </Field>
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5a626e', marginBottom: 4 }}>{conf.title}</div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 220 }}>계정</th>
            <th style={{ width: 130, textAlign: 'right' }}>금액</th>
            <th>적요</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>
                <select className="ec-input" value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })} style={{ width: '100%' }}>
                  <option value="">계정 선택</option>
                  {lineAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              </td>
              <td>
                <input className="ec-input" type="number" step="any" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} style={{ width: '100%', textAlign: 'right' }} />
              </td>
              <td>
                <input className="ec-input" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} style={{ width: '100%' }} />
              </td>
              <td style={{ textAlign: 'center' }}>
                {lines.length > 1 && (
                  <button className="ec-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={2} style={{ textAlign: 'right' }}>합계</td>
            <td style={{ textAlign: 'right' }}>{won(total)}</td>
            <td colSpan={2} style={{ color: balance === null ? '#8a929c' : balance === 0 ? '#8a929c' : balance > 0 ? '#1c7c3c' : '#c60a2e' }}>
              {balance === null ? '' : balance === 0 ? '가지급금과 사용액이 일치'
                : balance > 0 ? `잔액 ${won(balance)} 반납` : `${won(-balance)} 추가 지급`}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <button className="ec-btn" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ 행 추가</button>
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        <span style={{ fontSize: 11.5, color: '#8a929c', marginLeft: 6 }}>※ {conf.hint} 계좌로 처리하면 계좌 잔액과 입출금 내역도 함께 움직입니다.</span>
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

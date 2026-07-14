import { Fragment, useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import type {
  AccountTransfer, BankAccountRow, CardPayment, CardUsage, CreditCardRow,
} from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => n.toLocaleString('ko-KR')

const TABS = ['계좌간이동', '법인카드 대금결제'] as const
type Tab = (typeof TABS)[number]

/**
 * 회계 I > 현금거래 세분류.
 *   계좌간이동 — 회사 계좌 A → B. 손익에 영향이 없고 예금계정끼리만 움직인다.
 *   카드대금 결제 — 카드사용 때 잡아 둔 미지급금을 결제계좌에서 갚는다.
 */
export default function CashDetailPage() {
  const [tab, setTab] = useState<Tab>('계좌간이동')
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [cards, setCards] = useState<CreditCardRow[]>([])
  const [transfers, setTransfers] = useState<AccountTransfer[]>([])
  const [payments, setPayments] = useState<CardPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3500) }

  async function load() {
    setLoading(true)
    try {
      const [b, c, t, p] = await Promise.all([
        api.get<BankAccountRow[]>('/bank-cards/accounts'),
        api.get<CreditCardRow[]>('/bank-cards/cards'),
        api.get<AccountTransfer[]>('/cash-details/account-transfers'),
        api.get<CardPayment[]>('/cash-details/card-payments'),
      ])
      setBanks(b.data)
      setCards(c.data)
      setTransfers(t.data)
      setPayments(p.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <EcListShell
      title="현금거래 (계좌간이동 · 카드대금결제)"
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setError('') }} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({t === '계좌간이동' ? transfers.length : payments.length})</button>
        ))}
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {loading ? <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
        : tab === '계좌간이동'
          ? <TransferTab banks={banks} rows={transfers} onError={setError}
              onDone={(m) => { flash(m); load() }} />
          : <CardPaymentTab banks={banks} cards={cards} rows={payments} onError={setError}
              onDone={(m) => { flash(m); load() }} />}
    </EcListShell>
  )
}

// ── 계좌간이동 ──────────────────────────────────────────────────────────

function TransferTab({ banks, rows, onError, onDone }: {
  banks: BankAccountRow[]; rows: AccountTransfer[]
  onError: (m: string) => void; onDone: (m: string) => void
}) {
  const usable = banks.filter((b) => b.active)
  const [form, setForm] = useState({
    fromAccountId: usable[0] ? String(usable[0].id) : '',
    toAccountId: usable[1] ? String(usable[1].id) : '',
    amount: '', transferDate: today(), description: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const from = usable.find((b) => String(b.id) === form.fromAccountId)

  async function submit() {
    onError('')
    if (!form.fromAccountId || !form.toAccountId) return onError('계좌를 선택하세요.')
    if (form.fromAccountId === form.toAccountId) return onError('출금 계좌와 입금 계좌가 같을 수 없습니다.')
    if (!(Number(form.amount) > 0)) return onError('이동 금액을 입력하세요.')
    setSaving(true)
    try {
      const { data } = await api.post<AccountTransfer>('/cash-details/account-transfers', {
        fromAccountId: Number(form.fromAccountId),
        toAccountId: Number(form.toAccountId),
        amount: Number(form.amount),
        transferDate: form.transferDate,
        description: form.description || undefined,
      })
      onDone(`${data.transferNo} 이동 완료 — ${won(data.amount)}원 (회계전표 ${data.journalDocNo})`)
      setForm((f) => ({ ...f, amount: '', description: '' }))
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>계좌간이동</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="일자">
            <input className="ec-input" type="date" value={form.transferDate} onChange={(e) => set('transferDate', e.target.value)} style={{ width: 140 }} />
          </Field>
          <Field label="출금 계좌 *">
            <select className="ec-input" value={form.fromAccountId} onChange={(e) => set('fromAccountId', e.target.value)} style={{ width: 230 }}>
              <option value="">선택하세요</option>
              {usable.map((b) => <option key={b.id} value={b.id}>{b.bankName} {b.accountNo} (잔액 {won(b.balance)})</option>)}
            </select>
          </Field>
          <span style={{ fontSize: 16, color: 'var(--ec-blue)', paddingBottom: 4 }}>→</span>
          <Field label="입금 계좌 *">
            <select className="ec-input" value={form.toAccountId} onChange={(e) => set('toAccountId', e.target.value)} style={{ width: 230 }}>
              <option value="">선택하세요</option>
              {usable.map((b) => <option key={b.id} value={b.id}>{b.bankName} {b.accountNo} (잔액 {won(b.balance)})</option>)}
            </select>
          </Field>
          <Field label="금액 *">
            <input className="ec-input" type="number" step="any" value={form.amount} onChange={(e) => set('amount', e.target.value)} style={{ width: 140, textAlign: 'right' }} />
          </Field>
          <Field label="적요">
            <input className="ec-input" value={form.description} onChange={(e) => set('description', e.target.value)} style={{ width: 180 }} />
          </Field>
          <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '처리 중…' : '이동'}</button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
          ※ 차)입금계좌 예금계정 / 대)출금계좌 예금계정으로 분개됩니다. 회사 밖으로 나가는 돈이 아니라 손익에 영향이 없습니다.
          출금 계좌 잔액{from ? ` (현재 ${won(from.balance)}원)` : ''}이 모자라면 거절됩니다.
        </div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>이동번호</th>
            <th style={{ width: 100 }}>일자 ▼</th>
            <th style={{ width: 200 }}>출금 계좌</th>
            <th style={{ width: 200 }}>입금 계좌</th>
            <th style={{ width: 130, textAlign: 'right' }}>금액</th>
            <th style={{ width: 140 }}>회계전표</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>계좌간이동 내역이 없습니다.</td></tr>
          ) : rows.map((t, i) => (
            <tr key={t.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{t.transferNo}</td>
              <td>{t.transferDate}</td>
              <td style={{ color: '#c60a2e' }}>{t.fromAccountName}</td>
              <td style={{ color: '#1c7c3c' }}>{t.toAccountName}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(t.amount)}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{t.journalDocNo ?? ''}</td>
              <td style={{ color: '#5a626e' }}>{t.description ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

// ── 법인카드 대금결제 ───────────────────────────────────────────────────

function CardPaymentTab({ banks, cards, rows, onError, onDone }: {
  banks: BankAccountRow[]; cards: CreditCardRow[]; rows: CardPayment[]
  onError: (m: string) => void; onDone: (m: string) => void
}) {
  const usableCards = cards.filter((c) => c.active)
  const usableBanks = banks.filter((b) => b.active)
  const [cardId, setCardId] = useState(usableCards[0] ? String(usableCards[0].id) : '')
  const [bankAccountId, setBankAccountId] = useState('')
  const [paymentDate, setPaymentDate] = useState(today())
  const [unpaid, setUnpaid] = useState<CardUsage[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const card = usableCards.find((c) => String(c.id) === cardId)

  async function loadUnpaid(id: string) {
    if (!id) { setUnpaid([]); return }
    try {
      const { data } = await api.get<CardUsage[]>('/cash-details/card-payments/unpaid', { params: { cardId: Number(id) } })
      setUnpaid(data)
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  useEffect(() => { loadUnpaid(cardId) }, [cardId])   // eslint-disable-line react-hooks/exhaustive-deps

  const total = unpaid.reduce((s, u) => s + u.totalAmount, 0)

  async function pay() {
    onError('')
    if (!cardId) return onError('카드를 선택하세요.')
    if (unpaid.length === 0) return onError('미결제 사용내역이 없습니다.')
    if (!window.confirm(`${card?.cardName} 미결제 ${unpaid.length}건 · ${won(total)}원을 결제할까요?`)) return
    setSaving(true)
    try {
      const { data } = await api.post<CardPayment>('/cash-details/card-payments', {
        cardId: Number(cardId),
        bankAccountId: bankAccountId ? Number(bankAccountId) : undefined,
        paymentDate,
      })
      onDone(`${data.paymentNo} 결제 완료 — ${won(data.amount)}원 (회계전표 ${data.journalDocNo})`)
      await loadUnpaid(cardId)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="카드 *">
            <select className="ec-input" value={cardId} onChange={(e) => setCardId(e.target.value)} style={{ width: 220 }}>
              <option value="">선택하세요</option>
              {usableCards.map((c) => <option key={c.id} value={c.id}>{c.cardCompany} {c.cardName} ({c.typeName})</option>)}
            </select>
          </Field>
          <Field label="결제계좌">
            <select className="ec-input" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} style={{ width: 240 }}>
              <option value="">
                {card?.settlementAccountName ? `카드 등록계좌 (${card.settlementAccountName})` : '선택하세요'}
              </option>
              {usableBanks.map((b) => <option key={b.id} value={b.id}>{b.bankName} {b.accountNo} (잔액 {won(b.balance)})</option>)}
            </select>
          </Field>
          <Field label="결제일">
            <input className="ec-input" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={{ width: 140 }} />
          </Field>
          <button className="ec-btn ec-btn-primary" onClick={pay} disabled={saving}>{saving ? '결제 중…' : '카드대금 결제'}</button>
          <div style={{ fontSize: 12.5, paddingBottom: 5 }}>
            미결제 <b>{unpaid.length}건</b> · <b style={{ color: 'var(--ec-blue-dark)' }}>{won(total)}</b>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
          ※ 카드사용 때 이미 차)비용·부가세대급금 / 대)미지급금으로 잡았습니다. 결제는 그 미지급금을 갚는 것이라
          차)미지급금 / 대)예금계정으로 분개되고, 결제계좌 잔액이 줄어듭니다. 결제한 사용건은 다시 결제되지 않습니다.
        </div>
      </div>

      {unpaid.length > 0 && (
        <table className="w-full text-left" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 130 }}>전표번호</th>
              <th style={{ width: 100 }}>사용일</th>
              <th>가맹점</th>
              <th style={{ width: 130 }}>비용계정</th>
              <th style={{ width: 130, textAlign: 'right' }}>금액</th>
            </tr>
          </thead>
          <tbody>
            {unpaid.map((u, i) => (
              <tr key={u.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{u.usageNo}</td>
                <td>{u.usageDate}</td>
                <td style={{ fontWeight: 600 }}>{u.merchant}</td>
                <td style={{ color: '#5a626e' }}>{u.expenseAccountName}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(u.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>미결제 합계</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{won(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 6 }}>결제 내역</div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>결제번호</th>
            <th style={{ width: 100 }}>결제일 ▼</th>
            <th style={{ width: 180 }}>카드</th>
            <th style={{ width: 200 }}>결제계좌</th>
            <th style={{ width: 70, textAlign: 'center' }}>건수</th>
            <th style={{ width: 130, textAlign: 'right' }}>결제금액</th>
            <th style={{ width: 140 }}>회계전표</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>결제 내역이 없습니다.</td></tr>
          ) : rows.map((p, i) => (
            <Fragment key={p.id}>
              <tr onClick={() => setOpenId(openId === p.id ? null : p.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>
                  {openId === p.id ? '▾ ' : '▸ '}{p.paymentNo}
                </td>
                <td>{p.paymentDate}</td>
                <td>{p.cardCompany} {p.cardName}</td>
                <td style={{ color: '#5a626e' }}>{p.bankAccountName}</td>
                <td style={{ textAlign: 'center' }}>{p.lines.length}건</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(p.amount)}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{p.journalDocNo ?? ''}</td>
              </tr>
              {openId === p.id && (
                <tr className="no-ec">
                  <td colSpan={8} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}></th>
                          <th style={{ width: 130 }}>전표번호</th>
                          <th style={{ width: 100 }}>사용일</th>
                          <th>가맹점</th>
                          <th style={{ width: 130 }}>비용계정</th>
                          <th style={{ width: 130, textAlign: 'right' }}>금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.lines.map((l, idx) => (
                          <tr key={l.cardUsageId}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.usageNo}</td>
                            <td>{l.usageDate}</td>
                            <td>{l.merchant}</td>
                            <td style={{ color: '#5a626e' }}>{l.expenseAccountName}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.amount)}</td>
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
    </>
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

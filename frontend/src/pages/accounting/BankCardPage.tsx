import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import type { BankAccountRow, BankTxn, CardType, CardUsage, CreditCardRow, Partner } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => n.toLocaleString('ko-KR')

interface AccountOption {
  id: number
  code: string
  name: string
  division: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
}

const TABS = ['계좌등록', '카드등록', '계좌입출금', '카드사용'] as const
type Tab = (typeof TABS)[number]

/**
 * 회계 I > 기초등록 > 계좌/카드.
 * 계좌·카드 마스터를 등록하고, 입출금·카드사용을 넣으면 회계전표가 자동 생성된다.
 *   계좌입금 차)예금 / 대)상대계정 · 계좌출금 차)상대계정 / 대)예금
 *   카드사용 차)비용·부가세대급금 / 대)미지급금
 */
export default function BankCardPage() {
  const [tab, setTab] = useState<Tab>('계좌등록')
  const [accounts, setAccounts] = useState<BankAccountRow[]>([])
  const [cards, setCards] = useState<CreditCardRow[]>([])
  const [txns, setTxns] = useState<BankTxn[]>([])
  const [usages, setUsages] = useState<CardUsage[]>([])
  const [glAccounts, setGlAccounts] = useState<AccountOption[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load() {
    setLoading(true)
    try {
      const [a, c, t, u, gl, p] = await Promise.all([
        api.get<BankAccountRow[]>('/bank-cards/accounts'),
        api.get<CreditCardRow[]>('/bank-cards/cards'),
        api.get<BankTxn[]>('/bank-cards/transactions'),
        api.get<CardUsage[]>('/bank-cards/usages'),
        api.get<AccountOption[]>('/accounts'),
        api.get<Partner[]>('/partners'),
      ])
      setAccounts(a.data)
      setCards(c.data)
      setTxns(t.data)
      setUsages(u.data)
      setGlAccounts(gl.data)
      setPartners(p.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function switchTab(t: Tab) {
    setTab(t)
    setShowForm(false)
    setError('')
  }

  async function saved(message: string) {
    setShowForm(false)
    setError('')
    flash(message)
    await load()
  }

  const count = (t: Tab) =>
    t === '계좌등록' ? accounts.length : t === '카드등록' ? cards.length : t === '계좌입출금' ? txns.length : usages.length

  const totalBalance = accounts.filter((a) => a.active).reduce((s, a) => s + a.balance, 0)

  return (
    <EcListShell
      title="계좌/카드"
      newLabel={showForm ? '입력닫기' : `${tab}(F2)`}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => switchTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({count(t)})</button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: '#5a626e' }}>
          사용중 계좌 잔액 합계 <b style={{ color: 'var(--ec-blue-dark)' }}>{won(totalBalance)}</b>
        </span>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {showForm && tab === '계좌등록' && (
        <BankAccountForm glAccounts={glAccounts} onError={setError} onSaved={() => saved('계좌를 등록했습니다.')} />
      )}
      {showForm && tab === '카드등록' && (
        <CardForm accounts={accounts} onError={setError} onSaved={() => saved('카드를 등록했습니다.')} />
      )}
      {showForm && tab === '계좌입출금' && (
        <BankTxnForm accounts={accounts} glAccounts={glAccounts} partners={partners}
          onError={setError} onSaved={() => saved('입출금을 처리하고 회계전표를 생성했습니다.')} />
      )}
      {showForm && tab === '카드사용' && (
        <CardUsageForm cards={cards} glAccounts={glAccounts}
          onError={setError} onSaved={() => saved('카드사용을 등록하고 회계전표를 생성했습니다.')} />
      )}

      {loading ? <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
        : tab === '계좌등록' ? <BankAccountTable rows={accounts} />
        : tab === '카드등록' ? <CardTable rows={cards} />
        : tab === '계좌입출금' ? <BankTxnTable rows={txns} />
        : <CardUsageTable rows={usages} />}
    </EcListShell>
  )
}

// ── 목록 ────────────────────────────────────────────────────────────────

function BankAccountTable({ rows }: { rows: BankAccountRow[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 120 }}>은행</th>
          <th style={{ width: 180 }}>계좌번호</th>
          <th style={{ width: 100 }}>예금주</th>
          <th style={{ width: 130 }}>예금계정</th>
          <th style={{ width: 130, textAlign: 'right' }}>잔액</th>
          <th style={{ width: 70, textAlign: 'center' }}>사용</th>
          <th>비고</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 계좌가 없습니다.</td></tr>
        ) : rows.map((r, i) => (
          <tr key={r.id}>
            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
            <td>{r.bankName}</td>
            <td style={{ fontFamily: 'monospace' }}>{r.accountNo}</td>
            <td>{r.holder ?? ''}</td>
            <td style={{ color: '#5a626e' }}>{r.glAccountCode} {r.glAccountName}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.balance)}</td>
            <td style={{ textAlign: 'center', color: r.active ? '#1c7c3c' : '#8a929c' }}>{r.active ? '사용' : '중지'}</td>
            <td style={{ color: '#5a626e' }}>{r.remark ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CardTable({ rows }: { rows: CreditCardRow[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 120 }}>카드명</th>
          <th style={{ width: 100 }}>카드사</th>
          <th style={{ width: 180 }}>카드번호</th>
          <th style={{ width: 90, textAlign: 'center' }}>종류</th>
          <th style={{ width: 100 }}>명의자</th>
          <th>결제계좌</th>
          <th style={{ width: 80, textAlign: 'center' }}>결제일</th>
          <th style={{ width: 70, textAlign: 'center' }}>사용</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 카드가 없습니다.</td></tr>
        ) : rows.map((r, i) => (
          <tr key={r.id}>
            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
            <td style={{ fontWeight: 600 }}>{r.cardName}</td>
            <td>{r.cardCompany}</td>
            <td style={{ fontFamily: 'monospace' }}>{r.cardNo}</td>
            <td style={{ textAlign: 'center', color: r.type === 'CORPORATE' ? 'var(--ec-blue)' : '#5a626e' }}>{r.typeName}</td>
            <td>{r.ownerName ?? ''}</td>
            <td style={{ color: '#5a626e' }}>{r.settlementAccountName ?? '-'}</td>
            <td style={{ textAlign: 'center' }}>{r.settlementDay ? `${r.settlementDay}일` : ''}</td>
            <td style={{ textAlign: 'center', color: r.active ? '#1c7c3c' : '#8a929c' }}>{r.active ? '사용' : '중지'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BankTxnTable({ rows }: { rows: BankTxn[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 130 }}>전표번호</th>
          <th style={{ width: 100 }}>일자 ▼</th>
          <th style={{ width: 170 }}>계좌</th>
          <th style={{ width: 60, textAlign: 'center' }}>구분</th>
          <th style={{ width: 110, textAlign: 'right' }}>금액</th>
          <th style={{ width: 120 }}>상대계정</th>
          <th style={{ width: 110 }}>거래처</th>
          <th style={{ width: 120, textAlign: 'right' }}>거래후 잔액</th>
          <th style={{ width: 130 }}>회계전표</th>
          <th>적요</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>입출금 내역이 없습니다.</td></tr>
        ) : rows.map((r, i) => (
          <tr key={r.id}>
            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
            <td style={{ fontFamily: 'monospace' }}>{r.txnNo}</td>
            <td>{r.txnDate}</td>
            <td>{r.bankName} {r.accountNo}</td>
            <td style={{ textAlign: 'center', fontWeight: 700, color: r.deposit ? '#1c7c3c' : '#c60a2e' }}>{r.directionName}</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(r.amount)}</td>
            <td style={{ color: '#5a626e' }}>{r.counterAccountName}</td>
            <td>{r.partnerName ?? ''}</td>
            <td style={{ textAlign: 'right' }}>{won(r.balanceAfter)}</td>
            <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{r.journalDocNo ?? ''}</td>
            <td style={{ color: '#5a626e' }}>{r.description ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CardUsageTable({ rows }: { rows: CardUsage[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 130 }}>전표번호</th>
          <th style={{ width: 100 }}>사용일 ▼</th>
          <th style={{ width: 140 }}>카드</th>
          <th>가맹점</th>
          <th style={{ width: 120 }}>비용계정</th>
          <th style={{ width: 110, textAlign: 'right' }}>공급가액</th>
          <th style={{ width: 100, textAlign: 'right' }}>부가세</th>
          <th style={{ width: 110, textAlign: 'right' }}>합계</th>
          <th style={{ width: 130 }}>회계전표</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>카드사용 내역이 없습니다.</td></tr>
        ) : rows.map((r, i) => (
          <tr key={r.id}>
            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
            <td style={{ fontFamily: 'monospace' }}>{r.usageNo}</td>
            <td>{r.usageDate}</td>
            <td>{r.cardCompany} {r.cardName}</td>
            <td style={{ fontWeight: 600 }}>{r.merchant}</td>
            <td style={{ color: '#5a626e' }}>{r.expenseAccountName}</td>
            <td style={{ textAlign: 'right' }}>{won(r.supplyAmount)}</td>
            <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.vatAmount)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.totalAmount)}</td>
            <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{r.journalDocNo ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── 입력 폼 ─────────────────────────────────────────────────────────────

function Panel({ title, hint, children, onSubmit, submitLabel }: {
  title: string; hint: string; children: React.ReactNode; onSubmit: () => void; submitLabel: string
}) {
  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {children}
        <button className="ec-btn ec-btn-primary" onClick={onSubmit}>{submitLabel}</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>{hint}</div>
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

function BankAccountForm({ glAccounts, onError, onSaved }: {
  glAccounts: AccountOption[]; onError: (m: string) => void; onSaved: () => void
}) {
  const deposits = useMemo(() => glAccounts.filter((a) => a.division === 'ASSET'), [glAccounts])
  const [form, setForm] = useState({
    bankName: '', accountNo: '', holder: '', glAccountId: '', openingBalance: '', remark: '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    onError('')
    if (!form.bankName) return onError('은행명을 입력하세요.')
    if (!form.accountNo) return onError('계좌번호를 입력하세요.')
    try {
      await api.post('/bank-cards/accounts', {
        bankName: form.bankName,
        accountNo: form.accountNo,
        holder: form.holder || undefined,
        glAccountId: form.glAccountId ? Number(form.glAccountId) : undefined,
        openingBalance: form.openingBalance ? Number(form.openingBalance) : 0,
        remark: form.remark || undefined,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <Panel title="계좌등록" submitLabel="등록" onSubmit={submit}
      hint="※ 예금계정을 비우면 보통예금(103)으로 분개됩니다. 기초잔액 이후 잔액은 입출금으로만 움직입니다.">
      <Field label="은행 *">
        <input className="ec-input" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} style={{ width: 130 }} placeholder="국민은행" />
      </Field>
      <Field label="계좌번호 *">
        <input className="ec-input" value={form.accountNo} onChange={(e) => set('accountNo', e.target.value)} style={{ width: 190 }} placeholder="123456-04-567890" />
      </Field>
      <Field label="예금주">
        <input className="ec-input" value={form.holder} onChange={(e) => set('holder', e.target.value)} style={{ width: 110 }} />
      </Field>
      <Field label="예금계정">
        <select className="ec-input" value={form.glAccountId} onChange={(e) => set('glAccountId', e.target.value)} style={{ width: 160 }}>
          <option value="">보통예금(103) 기본</option>
          {deposits.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
      </Field>
      <Field label="기초잔액">
        <input className="ec-input" type="number" step="any" value={form.openingBalance} onChange={(e) => set('openingBalance', e.target.value)} style={{ width: 120, textAlign: 'right' }} />
      </Field>
      <Field label="비고">
        <input className="ec-input" value={form.remark} onChange={(e) => set('remark', e.target.value)} style={{ width: 160 }} />
      </Field>
    </Panel>
  )
}

function CardForm({ accounts, onError, onSaved }: {
  accounts: BankAccountRow[]; onError: (m: string) => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    cardName: '', cardCompany: '', cardNo: '', type: 'CORPORATE' as CardType,
    ownerName: '', settlementAccountId: '', settlementDay: '', remark: '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    onError('')
    if (!form.cardName) return onError('카드명을 입력하세요.')
    if (!form.cardCompany) return onError('카드사를 입력하세요.')
    if (!form.cardNo) return onError('카드번호를 입력하세요.')
    try {
      await api.post('/bank-cards/cards', {
        cardName: form.cardName,
        cardCompany: form.cardCompany,
        cardNo: form.cardNo,
        type: form.type,
        ownerName: form.ownerName || undefined,
        settlementAccountId: form.settlementAccountId ? Number(form.settlementAccountId) : undefined,
        settlementDay: form.settlementDay ? Number(form.settlementDay) : undefined,
        remark: form.remark || undefined,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <Panel title="카드등록" submitLabel="등록" onSubmit={submit}
      hint="※ 카드번호는 마스킹된 형태로 저장하세요(예: 5310-****-****-1234). 결제계좌는 카드대금이 빠져나갈 계좌입니다.">
      <Field label="카드명 *">
        <input className="ec-input" value={form.cardName} onChange={(e) => set('cardName', e.target.value)} style={{ width: 130 }} placeholder="법인 업무용" />
      </Field>
      <Field label="카드사 *">
        <input className="ec-input" value={form.cardCompany} onChange={(e) => set('cardCompany', e.target.value)} style={{ width: 110 }} placeholder="신한카드" />
      </Field>
      <Field label="카드번호 *">
        <input className="ec-input" value={form.cardNo} onChange={(e) => set('cardNo', e.target.value)} style={{ width: 180 }} placeholder="5310-****-****-1234" />
      </Field>
      <Field label="종류 *">
        <select className="ec-input" value={form.type} onChange={(e) => set('type', e.target.value)} style={{ width: 110 }}>
          <option value="CORPORATE">법인카드</option>
          <option value="PERSONAL">개인카드</option>
        </select>
      </Field>
      <Field label="명의자">
        <input className="ec-input" value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} style={{ width: 100 }} />
      </Field>
      <Field label="결제계좌">
        <select className="ec-input" value={form.settlementAccountId} onChange={(e) => set('settlementAccountId', e.target.value)} style={{ width: 190 }}>
          <option value="">선택 안함</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} {a.accountNo}</option>)}
        </select>
      </Field>
      <Field label="결제일">
        <input className="ec-input" type="number" min="1" max="31" value={form.settlementDay} onChange={(e) => set('settlementDay', e.target.value)} style={{ width: 70, textAlign: 'right' }} />
      </Field>
      <Field label="비고">
        <input className="ec-input" value={form.remark} onChange={(e) => set('remark', e.target.value)} style={{ width: 140 }} />
      </Field>
    </Panel>
  )
}

function BankTxnForm({ accounts, glAccounts, partners, onError, onSaved }: {
  accounts: BankAccountRow[]; glAccounts: AccountOption[]; partners: Partner[]
  onError: (m: string) => void; onSaved: () => void
}) {
  const usable = accounts.filter((a) => a.active)
  const [form, setForm] = useState({
    bankAccountId: usable[0] ? String(usable[0].id) : '',
    deposit: 'true', amount: '', counterAccountId: '', partnerId: '',
    txnDate: today(), description: '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const selected = usable.find((a) => String(a.id) === form.bankAccountId)

  async function submit() {
    onError('')
    if (!form.bankAccountId) return onError('계좌를 선택하세요.')
    if (!form.counterAccountId) return onError('상대계정을 선택하세요.')
    if (!form.amount || Number(form.amount) <= 0) return onError('금액을 입력하세요.')
    try {
      await api.post('/bank-cards/transactions', {
        bankAccountId: Number(form.bankAccountId),
        deposit: form.deposit === 'true',
        amount: Number(form.amount),
        counterAccountId: Number(form.counterAccountId),
        partnerId: form.partnerId ? Number(form.partnerId) : undefined,
        txnDate: form.txnDate,
        description: form.description || undefined,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <Panel title="계좌 입출금" submitLabel="처리" onSubmit={submit}
      hint="※ 입금은 차)예금·대)상대계정, 출금은 그 반대로 분개됩니다. 잔액보다 많이 출금하면 거절됩니다.">
      <Field label="일자">
        <input className="ec-input" type="date" value={form.txnDate} onChange={(e) => set('txnDate', e.target.value)} style={{ width: 140 }} />
      </Field>
      <Field label="계좌 *">
        <select className="ec-input" value={form.bankAccountId} onChange={(e) => set('bankAccountId', e.target.value)} style={{ width: 200 }}>
          <option value="">선택하세요</option>
          {usable.map((a) => <option key={a.id} value={a.id}>{a.bankName} {a.accountNo}</option>)}
        </select>
      </Field>
      <Field label="현재 잔액">
        <div className="ec-input" style={{ width: 110, textAlign: 'right', background: '#f5f7fa', color: '#5a626e', lineHeight: '22px' }}>
          {selected ? won(selected.balance) : '-'}
        </div>
      </Field>
      <Field label="구분 *">
        <select className="ec-input" value={form.deposit} onChange={(e) => set('deposit', e.target.value)} style={{ width: 80 }}>
          <option value="true">입금</option>
          <option value="false">출금</option>
        </select>
      </Field>
      <Field label="금액 *">
        <input className="ec-input" type="number" step="any" value={form.amount} onChange={(e) => set('amount', e.target.value)} style={{ width: 120, textAlign: 'right' }} />
      </Field>
      <Field label="상대계정 *">
        <select className="ec-input" value={form.counterAccountId} onChange={(e) => set('counterAccountId', e.target.value)} style={{ width: 180 }}>
          <option value="">선택하세요</option>
          {glAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
      </Field>
      <Field label="거래처">
        <select className="ec-input" value={form.partnerId} onChange={(e) => set('partnerId', e.target.value)} style={{ width: 150 }}>
          <option value="">선택 안함</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="적요">
        <input className="ec-input" value={form.description} onChange={(e) => set('description', e.target.value)} style={{ width: 160 }} />
      </Field>
    </Panel>
  )
}

function CardUsageForm({ cards, glAccounts, onError, onSaved }: {
  cards: CreditCardRow[]; glAccounts: AccountOption[]; onError: (m: string) => void; onSaved: () => void
}) {
  const expenses = useMemo(() => glAccounts.filter((a) => a.division === 'EXPENSE'), [glAccounts])
  const usable = cards.filter((c) => c.active)
  const [form, setForm] = useState({
    cardId: usable[0] ? String(usable[0].id) : '',
    merchant: '', expenseAccountId: '', supplyAmount: '', vatAmount: '',
    usageDate: today(), description: '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const supply = Number(form.supplyAmount) || 0
  const vat = form.vatAmount === '' ? Math.round(supply * 0.1) : Number(form.vatAmount) || 0

  async function submit() {
    onError('')
    if (!form.cardId) return onError('카드를 선택하세요.')
    if (!form.merchant) return onError('가맹점을 입력하세요.')
    if (!form.expenseAccountId) return onError('비용계정을 선택하세요.')
    if (supply <= 0) return onError('공급가액을 입력하세요.')
    try {
      await api.post('/bank-cards/usages', {
        cardId: Number(form.cardId),
        merchant: form.merchant,
        expenseAccountId: Number(form.expenseAccountId),
        supplyAmount: supply,
        vatAmount: form.vatAmount === '' ? undefined : Number(form.vatAmount),
        usageDate: form.usageDate,
        description: form.description || undefined,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <Panel title="카드사용 등록" submitLabel="등록" onSubmit={submit}
      hint="※ 차)비용계정·부가세대급금 / 대)미지급금으로 분개됩니다. 부가세를 비우면 공급가액의 10%로 계산합니다.">
      <Field label="사용일">
        <input className="ec-input" type="date" value={form.usageDate} onChange={(e) => set('usageDate', e.target.value)} style={{ width: 140 }} />
      </Field>
      <Field label="카드 *">
        <select className="ec-input" value={form.cardId} onChange={(e) => set('cardId', e.target.value)} style={{ width: 190 }}>
          <option value="">선택하세요</option>
          {usable.map((c) => <option key={c.id} value={c.id}>{c.cardCompany} {c.cardName} ({c.typeName})</option>)}
        </select>
      </Field>
      <Field label="가맹점 *">
        <input className="ec-input" value={form.merchant} onChange={(e) => set('merchant', e.target.value)} style={{ width: 160 }} placeholder="스타벅스 역삼점" />
      </Field>
      <Field label="비용계정 *">
        <select className="ec-input" value={form.expenseAccountId} onChange={(e) => set('expenseAccountId', e.target.value)} style={{ width: 170 }}>
          <option value="">선택하세요</option>
          {expenses.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
      </Field>
      <Field label="공급가액 *">
        <input className="ec-input" type="number" step="any" value={form.supplyAmount} onChange={(e) => set('supplyAmount', e.target.value)} style={{ width: 110, textAlign: 'right' }} />
      </Field>
      <Field label="부가세">
        <input className="ec-input" type="number" step="any" value={form.vatAmount} onChange={(e) => set('vatAmount', e.target.value)} style={{ width: 100, textAlign: 'right' }} placeholder={String(Math.round(supply * 0.1))} />
      </Field>
      <div style={{ fontSize: 12.5, paddingBottom: 5, color: 'var(--ec-blue-dark)', fontWeight: 700 }}>
        합계 {won(supply + vat)}
      </div>
      <Field label="적요">
        <input className="ec-input" value={form.description} onChange={(e) => set('description', e.target.value)} style={{ width: 150 }} />
      </Field>
    </Panel>
  )
}

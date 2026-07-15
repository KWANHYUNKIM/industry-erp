import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import type { NonCashTxn, NonCashType, Partner } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => n.toLocaleString('ko-KR')

interface AccountOption {
  id: number
  code: string
  name: string
  division: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
}

/** 유형별로 차/대변 중 무엇을 사용자가 고르는지 */
const TYPES: {
  type: NonCashType
  label: string
  formula: string
  debit: 'fixed' | 'expense' | 'any'
  credit: 'fixed' | 'any'
}[] = [
  { type: 'OFFSET', label: '채권채무 상계', formula: '차)외상매입금 / 대)외상매출금', debit: 'fixed', credit: 'fixed' },
  { type: 'BAD_DEBT', label: '대손처리', formula: '차)대손상각비 / 대)외상매출금', debit: 'fixed', credit: 'fixed' },
  { type: 'ACCRUAL', label: '미지급 계상', formula: '차)비용계정 / 대)미지급금', debit: 'expense', credit: 'fixed' },
  { type: 'TRANSFER', label: '계정대체', formula: '차)선택 / 대)선택', debit: 'any', credit: 'any' },
]

/**
 * 회계 I > 비현금거래(대체전표) — 현금·예금이 움직이지 않는 거래.
 * 상계·대손·미지급 계상·계정대체를 유형별 템플릿으로 입력하면 분개가 자동 생성된다.
 */
export default function NonCashPage() {
  const [rows, setRows] = useState<NonCashTxn[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [filter, setFilter] = useState<NonCashType | '전체'>('전체')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3000) }

  async function load() {
    setLoading(true)
    try {
      const [t, a, p] = await Promise.all([
        api.get<NonCashTxn[]>('/non-cash'),
        api.get<AccountOption[]>('/accounts'),
        api.get<Partner[]>('/partners'),
      ])
      setRows(t.data)
      setAccounts(a.data)
      setPartners(p.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => filter === '전체' || r.type === filter)
  const count = (t: NonCashType | '전체') => rows.filter((r) => t === '전체' || r.type === t).length

  return (
    <EcListShell
      title="비현금거래 (대체전표)"
      newLabel={showForm ? '입력닫기' : '대체전표 작성(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {(['전체', ...TYPES.map((t) => t.type)] as const).map((t) => (
          <button key={t} onClick={() => setFilter(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: filter === t ? '#fff' : 'transparent', color: filter === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: filter === t ? 700 : 400,
            borderBottom: filter === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>
            {t === '전체' ? '전체' : TYPES.find((x) => x.type === t)!.label} ({count(t)})
          </button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11.5, color: '#8a929c' }}>
          현금·예금이 움직이는 거래는 현금거래·계좌입출금 화면에서 처리합니다.
        </span>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <Modal open={showForm} title="비현금거래 (대체전표) 등록" onClose={() => setShowForm(false)}>{(
        <NonCashForm
          accounts={accounts} partners={partners} onError={setError}
          onSaved={(t) => { setShowForm(false); flash(`${t.txnNo} 저장 · 회계전표 ${t.journalDocNo} 생성`); load() }}
        />
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>전표번호</th>
            <th style={{ width: 100 }}>일자 ▼</th>
            <th style={{ width: 120 }}>유형</th>
            <th style={{ width: 150 }}>차변</th>
            <th style={{ width: 150 }}>대변</th>
            <th style={{ width: 120, textAlign: 'right' }}>금액</th>
            <th style={{ width: 120 }}>거래처</th>
            <th style={{ width: 140 }}>회계전표</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>대체전표가 없습니다.</td></tr>
          ) : shown.map((t, i) => (
            <tr key={t.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{t.txnNo}</td>
              <td>{t.txnDate}</td>
              <td style={{ color: 'var(--ec-blue)' }}>{t.typeName}</td>
              <td>{t.debitAccountCode} {t.debitAccountName}</td>
              <td style={{ color: '#5a626e' }}>{t.creditAccountCode} {t.creditAccountName}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(t.amount)}</td>
              <td>{t.partnerName ?? ''}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{t.journalDocNo ?? ''}</td>
              <td style={{ color: '#5a626e' }}>{t.description ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

function NonCashForm({ accounts, partners, onError, onSaved }: {
  accounts: AccountOption[]; partners: Partner[]
  onError: (m: string) => void; onSaved: (t: NonCashTxn) => void
}) {
  const [type, setType] = useState<NonCashType>('OFFSET')
  const [txnDate, setTxnDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [debitAccountId, setDebitAccountId] = useState('')
  const [creditAccountId, setCreditAccountId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const conf = TYPES.find((t) => t.type === type)!
  // 현금·당좌예금·보통예금은 비현금거래에 쓸 수 없으므로 목록에서 뺀다(서버도 거절한다).
  const selectable = useMemo(
    () => accounts.filter((a) => !['101', '102', '103'].includes(a.code)), [accounts])
  const expenses = useMemo(() => selectable.filter((a) => a.division === 'EXPENSE'), [selectable])

  async function submit() {
    onError('')
    if (!(Number(amount) > 0)) return onError('금액을 입력하세요.')
    if (conf.debit !== 'fixed' && !debitAccountId) return onError('차변계정을 선택하세요.')
    if (conf.credit === 'any' && !creditAccountId) return onError('대변계정을 선택하세요.')
    setSaving(true)
    try {
      const { data } = await api.post<NonCashTxn>('/non-cash', {
        type,
        txnDate,
        amount: Number(amount),
        debitAccountId: conf.debit !== 'fixed' ? Number(debitAccountId) : undefined,
        creditAccountId: conf.credit === 'any' ? Number(creditAccountId) : undefined,
        partnerId: partnerId ? Number(partnerId) : undefined,
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
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>대체전표 작성</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="유형 *">
          <select className="ec-input" value={type} onChange={(e) => { setType(e.target.value as NonCashType); setDebitAccountId(''); setCreditAccountId('') }} style={{ width: 140 }}>
            {TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="일자">
          <input className="ec-input" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} style={{ width: 140 }} />
        </Field>

        {conf.debit === 'fixed' ? (
          <Field label="차변">
            <div className="ec-input" style={{ width: 160, background: '#f5f7fa', color: '#5a626e', lineHeight: '22px' }}>
              {type === 'OFFSET' ? '251 외상매입금' : '835 대손상각비'}
            </div>
          </Field>
        ) : (
          <Field label={conf.debit === 'expense' ? '비용계정(차변) *' : '차변계정 *'}>
            <select className="ec-input" value={debitAccountId} onChange={(e) => setDebitAccountId(e.target.value)} style={{ width: 180 }}>
              <option value="">선택하세요</option>
              {(conf.debit === 'expense' ? expenses : selectable).map((a) => (
                <option key={a.id} value={a.id}>{a.code} {a.name}</option>
              ))}
            </select>
          </Field>
        )}

        {conf.credit === 'fixed' ? (
          <Field label="대변">
            <div className="ec-input" style={{ width: 160, background: '#f5f7fa', color: '#5a626e', lineHeight: '22px' }}>
              {type === 'ACCRUAL' ? '253 미지급금' : '108 외상매출금'}
            </div>
          </Field>
        ) : (
          <Field label="대변계정 *">
            <select className="ec-input" value={creditAccountId} onChange={(e) => setCreditAccountId(e.target.value)} style={{ width: 180 }}>
              <option value="">선택하세요</option>
              {selectable.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </Field>
        )}

        <Field label="금액 *">
          <input className="ec-input" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 130, textAlign: 'right' }} />
        </Field>
        <Field label="거래처">
          <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 150 }}>
            <option value="">선택 안함</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="적요">
          <input className="ec-input" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: 180 }} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
        ※ {conf.label} → <b>{conf.formula}</b> 로 분개됩니다. 현금·당좌예금·보통예금은 선택할 수 없습니다(현금이 움직이면 비현금거래가 아닙니다).
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

import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Account, BankAccountRow, Income, IncomeExpenseStatus, ReceiptMethod } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())
const monthStart = () => today().slice(0, 8) + '01'

type Tab = '수입등록' | '수입비용현황'

/** 수입비용 (회계 II) — 매출 전표를 거치지 않는 수익을 잡고, 비용과 대조한다. */
export default function IncomePage() {
  const [tab, setTab] = useState<Tab>('수입등록')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState<Income[]>([])
  const [status, setStatus] = useState<IncomeExpenseStatus | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    const params = { from, to }
    api.get<Income[]>('/incomes', { params }).then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
    api.get<IncomeExpenseStatus>('/incomes/status', { params })
      .then((r) => setStatus(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => {
    load()
    api.get<Account[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => {})
    api.get<BankAccountRow[]>('/bank-cards/accounts').then((r) => setBanks(r.data)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function remove(i: Income) {
    if (!window.confirm(`'${i.content}' 수입을 삭제할까요?`)) return
    try { await api.delete(`/incomes/${i.id}`); flash('수입을 삭제했습니다.'); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="수입비용" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div className="flex gap-[2px] mb-[8px] border-b border-b-ec-line border-solid">
        {(['수입등록', '수입비용현황'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : 'var(--ec-label)',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      <div className="flex items-center gap-[6px] mb-[8px]">
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
        <span className="text-ec-hint">~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        {tab === '수입등록' && <button className="ec-btn" onClick={() => setShowForm(true)}>+ 수입등록</button>}
        <span className="ml-[8px] text-[12px] text-ec-hint">
          매출 전표를 거치지 않는 수익(이자·임대료·잡이익)입니다. 등록하면 분개가 함께 생깁니다.
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {tab === '수입등록' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[100px]">수입일</th><th>계정</th><th>내용</th><th>거래처</th>
              <th className="text-right">금액</th>
              <th className="w-[90px]">회수수단</th><th className="w-[120px]">전표번호</th>
              <th className="w-[60px] text-center">처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((i, idx) => (
              <tr key={i.id}>
                <td className="text-center text-ec-hint">{idx + 1}</td>
                <td>{dateText(i.incomeDate)}</td>
                <td>{i.accountCode} {i.accountName}</td>
                <td>{i.content}</td>
                <td>{i.partnerName ?? ''}</td>
                <td className="text-right font-bold">{won(i.amount)}</td>
                <td>{i.receiptMethodName}{i.bankAccountName ? ` (${i.bankAccountName})` : ''}</td>
                <td className="text-ec-blue">{i.journalDocNo ?? ''}</td>
                <td className="text-center">
                  <button className="ec-btn" style={{ height: 20, padding: '0 6px', color: 'var(--ec-danger)' }} onClick={() => remove(i)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          {status && (
            <div className="flex gap-[8px] mb-[10px]">
              <Tile label="수입 합계" value={won(status.totalIncome)} />
              <Tile label="비용 합계" value={won(status.totalExpense)} />
              <Tile label="순수지 (수입 − 비용)" value={won(status.net)} strong negative={status.net < 0} />
            </div>
          )}
          <div className="flex gap-[12px]">
            <SummaryTable title="수입 (계정별)" rows={status?.incomeByAccount ?? []} />
            <SummaryTable title="비용 (계정별)" rows={status?.expenseByAccount ?? []} />
          </div>
        </>
      )}

      <Modal error={error} open={showForm} title="수입비용 등록" onClose={() => setShowForm(false)}>{(
        <IncomeForm
          accounts={accounts.filter((a) => a.division === 'REVENUE')}
          banks={banks}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('수입을 등록했습니다. 분개가 생성되었습니다.'); load() }}
        />
      )}</Modal>
    </EcListShell>
  )
}

function Tile({ label, value, strong, negative }: { label: string; value: string; strong?: boolean; negative?: boolean }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', borderRadius: 3, padding: '8px 10px', background: strong ? 'var(--ec-blue-wash)' : '#fff' }}>
      <div className="text-[11.5px] text-ec-hint">{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: negative ? 'var(--ec-danger)' : strong ? 'var(--ec-blue-dark)' : 'var(--ec-text)' }}>{value}</div>
    </div>
  )
}

function SummaryTable({ title, rows }: { title: string; rows: IncomeExpenseStatus['incomeByAccount'] }) {
  return (
    <div className="flex-1">
      <div className="font-bold text-[12.5px] mb-[4px] text-ec-navy">{title}</div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th><th>계정</th>
            <th className="text-right">금액</th><th className="text-right w-[130px]">구성비</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={4} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.accountId}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{r.accountCode} {r.accountName}</td>
              <td className="text-right">{won(r.amount)}</td>
              <td>
                <div className="flex items-center gap-[6px]">
                  <div style={{ flex: 1, height: 8, background: '#eef1f4', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(r.ratio, 100)}%`, height: '100%', background: 'var(--ec-blue)' }} />
                  </div>
                  <span className="text-[11.5px] w-[42px] text-right text-ec-label">{r.ratio}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IncomeForm({ accounts, banks, onClose, onSaved }: {
  accounts: Account[]
  banks: BankAccountRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [incomeDate, setIncomeDate] = useState(today())
  const [accountId, setAccountId] = useState('')
  const [content, setContent] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [amount, setAmount] = useState('')
  const [receiptMethod, setReceiptMethod] = useState<ReceiptMethod>('CASH')
  const [bankAccountId, setBankAccountId] = useState('')
  const [department, setDepartment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const debitLabel = receiptMethod === 'CASH' ? '현금' : receiptMethod === 'BANK' ? '예금' : '외상매출금'
  const creditLabel = accounts.find((a) => String(a.id) === accountId)?.name ?? '수익계정'

  async function save() {
    setError('')
    if (!accountId) return setError('수익 계정을 선택하세요.')
    if (!content.trim()) return setError('내용을 입력하세요.')
    if (!(Number(amount) > 0)) return setError('금액을 입력하세요.')
    if (receiptMethod === 'BANK' && !bankAccountId) return setError('입금될 계좌를 선택하세요.')
    setSaving(true)
    try {
      await api.post('/incomes', {
        incomeDate, accountId: Number(accountId), content,
        partnerName: partnerName || undefined,
        amount: Number(amount), receiptMethod,
        bankAccountId: receiptMethod === 'BANK' ? Number(bankAccountId) : undefined,
        department: department || undefined,
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
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">수입등록</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th className="w-[90px] bg-ec-page">수입일</th>
                <td><input type="date" className="ec-input" value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} style={{ width: 150 }} /></td>
                <th className="w-[70px] bg-ec-page">부서</th>
                <td><input className="ec-input" value={department} onChange={(e) => setDepartment(e.target.value)} style={{ width: 130 }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">수익계정<span className="text-ec-danger">*</span></th>
                <td colSpan={3}>
                  <select className="ec-input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ width: '100%' }}>
                    <option value="">수익 계정 선택</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">내용<span className="text-ec-danger">*</span></th>
                <td colSpan={3}><input className="ec-input" value={content} onChange={(e) => setContent(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">거래처</th>
                <td><input className="ec-input" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} style={{ width: 150 }} /></td>
                <th className="bg-ec-page">금액<span className="text-ec-danger">*</span></th>
                <td><input type="number" className="ec-input" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 130, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">회수수단<span className="text-ec-danger">*</span></th>
                <td colSpan={3}>
                  <select className="ec-input" value={receiptMethod} onChange={(e) => setReceiptMethod(e.target.value as ReceiptMethod)} style={{ width: 130 }}>
                    <option value="CASH">현금</option>
                    <option value="BANK">계좌입금</option>
                    <option value="CREDIT">외상</option>
                  </select>
                  {receiptMethod === 'BANK' && (
                    <select className="ec-input" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} style={{ marginLeft: 6, width: 260 }}>
                      <option value="">입금 계좌 선택</option>
                      {banks.map((b) => <option key={b.id} value={b.id}>{b.bankName} {b.accountNo}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="mt-[10px] py-[8px] px-[10px] bg-ec-page border border-ec-line border-solid rounded-[3px] text-[12.5px]">
            분개 미리보기: 차){debitLabel} {amount ? won(Number(amount)) : 0} / 대){creditLabel} {amount ? won(Number(amount)) : 0}
            {receiptMethod === 'BANK' && <span className="text-ec-hint"> — 계좌 잔액도 함께 오릅니다.</span>}
          </div>
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

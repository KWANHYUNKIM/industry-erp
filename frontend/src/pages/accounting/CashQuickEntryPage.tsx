import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcSlipShell from '../../components/EcSlipShell'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import Modal from '../../components/Modal'
import CodePickerField, { type CodeItem } from '../../components/CodePickerField'
import { useRequired } from '../../utils/useRequired'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../components/EcPeriodPicks'
import type { BankAccountRow, CreditCardRow } from '../../types/api'
import { cashQuickKind, type CashQuickField, type CashQuickType, type CashQuickVoucher } from '../../features/cashquick/kinds'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'

/**
 * 회계 I › 현금거래의 한 장짜리 입력 열한 종 — 매출처로부터(E010404) · 카드매출대금회수(E010405) · 일시적으로(입금 E010401 ·
 * 출금 E010410) · 은행차입으로(E010406) · 기타입금(E010407) · 매입처로(E010409) · 법인카드대금결제(E010412) ·
 * 계좌간이동(E010411) · 은행으로(E010413) · 기타출금(E010414).
 *
 * 2026-10-12 loginaa 실측: 영수증으로와 같은 한 장짜리 폼(칸만 다르다 — features/cashquick/kinds.ts), 단추
 * [저장(F8)] · [저장/전표(F7)] · [다시 작성] · [리스트]. 저장하면 머리 계좌(입금 · 출금계좌)는 남고 나머지가 비워진다.
 * 기타출금은 머리 계좌가 000 현금인데 수수료를 넣으면 '현금일경우 수수료를 입력할 수 없습니다.'
 * 카드매출대금회수는 카드사를 고르면 수수료율 · 입금계좌가 채워지고, 통장입금액 9,700 · 3% → 수수료 300 · 총금액 10,000(총금액만 막힌 칸,
 * 수수료는 고칠 수 있다 — 2026-10-14 원본에서 400 으로 고치면 총금액 10,100).
 * 회계거래조회에서 전표번호를 누르면 일자가 막힌 같은 폼 + [삭제] '전표를 삭제하겠습니까? - 매출처로부터'.
 *
 * 회계 I › 비현금거래 셋(일반영수증 · 신용카드전표 · 기타, 2026-10-13 실측)도 같은 폼이다 — 머리 계좌 · 수수료가 없고,
 * 저장하면 계정 · 사원 · 카드(기타는 차변 · 대변계정)가 남는다. 삭제 확인 '- 영수증만수령-현재자금의 이동 없이 영수증만 가져온 경우'.
 */

interface AccountOption { id: number; code: string; name: string }
interface PartnerOption { id: number; code: string; name: string }
interface EmployeeOption { id: number; code: string; name: string }
interface IssuerOption { id: number; code: string | null; name: string; feeRate: number; depositAccount: string | null }

function bankLabel(b: BankAccountRow) {
  if (b.name) return b.name
  const digits = (b.accountNo ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `${b.bankName}-${digits.slice(-4)}` : b.bankName
}

/** 통장입금액 → 총금액(수수료를 뗀 뒤 들어온 돈이 통장입금액이다). 원본 9,700 · 3% → 10,000. */
function grossOf(deposit: number, rate: number) {
  if (!(deposit > 0) || !(rate >= 0) || rate >= 100) return deposit > 0 ? deposit : 0
  return Math.round(deposit / (1 - rate / 100))
}

export default function CashQuickEntryPage({ type }: { type: CashQuickType }) {
  const kind = cashQuickKind(type)
  const has = (f: CashQuickField) => kind.fields.some(([k]) => k === f)
  const nonCash = type === 'RECEIPT_ONLY' || type === 'CARD_SLIP' || type === 'NONCASH_OTHER'
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('id')
  const journalId = params.get('journal')

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [cards, setCards] = useState<CreditCardRow[]>([])
  const [issuers, setIssuers] = useState<IssuerOption[]>([])
  const [editing, setEditing] = useState<CashQuickVoucher | null>(null)

  const [date, setDate] = useState(ymd(new Date()))
  const deptProject = useDeptProjectItems()
  const [departmentId, setDepartmentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [main, setMain] = useState('')          // '000' 현금 · 'b<id>' 계좌
  const [counter, setCounter] = useState('')    // 계좌 id
  const [partnerId, setPartnerId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [cardId, setCardId] = useState('')
  const [issuerId, setIssuerId] = useState('')
  const [feeRate, setFeeRate] = useState('')
  const [accountId, setAccountId] = useState('')
  const [creditAccountId, setCreditAccountId] = useState('')
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const req = useRequired()
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const need = (f: CashQuickField) => has(f)
    Promise.all([
      api.get<BankAccountRow[]>('/bank-cards/accounts'),
      need('account') || need('creditAccount') ? api.get<AccountOption[]>('/accounts') : Promise.resolve({ data: [] as AccountOption[] }),
      need('partner') ? api.get<PartnerOption[]>('/partners') : Promise.resolve({ data: [] as PartnerOption[] }),
      need('employee') ? api.get<EmployeeOption[]>('/employees') : Promise.resolve({ data: [] as EmployeeOption[] }),
      need('card') ? api.get<CreditCardRow[]>('/bank-cards/cards') : Promise.resolve({ data: [] as CreditCardRow[] }),
      need('issuer') ? api.get<IssuerOption[]>('/card-issuers') : Promise.resolve({ data: [] as IssuerOption[] }),
    ]).then(([b, a, p, e, c, i]) => {
      setBanks(b.data); setAccounts(a.data); setPartners(p.data); setEmployees(e.data); setCards(c.data); setIssuers(i.data)
    }).catch((err) => setError(extractErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  /** 원본 [다시 작성]: 전부 비운다. 저장 뒤에는 머리 계좌 · 카드사 · 계정이 남는다(keep). */
  function reset(keep = false) {
    if (!keep) { setDate(ymd(new Date())); setMain(''); setIssuerId(''); setFeeRate(''); setAccountId('') }
    /* 비현금거래는 원본처럼 저장 뒤에도 사원 · 카드 · 대변계정이 남는다. */
    if (!keep || !nonCash) { setEmployeeId(''); setCreditAccountId('') }
    /* 원본 2026-10-20: 법인카드대금결제는 저장 뒤 [카드]가, 계좌간이동은 [출금계좌]도 남는다(은행으로 [차입처]는 비워진다). */
    if (!keep || !(nonCash || type === 'CARD_BILL_PAYMENT')) setCardId('')
    if (!keep || type !== 'ACCOUNT_TRANSFER') setCounter('')
    setPartnerId(''); setPayee(''); setAmount(''); setFee(''); setMemo(''); setError(''); req.reset()
    setDepartmentId(''); setProjectId('')
  }

  useEffect(() => {
    if (!editId && !journalId) { setEditing(null); reset(); return }
    const url = editId ? `/vouchers/${editId}` : `/vouchers/by-journal/${journalId}`
    api.get<CashQuickVoucher>(url).then(({ data }) => {
      const l = data.lines[0]
      setEditing(data)
      setDate(data.voucherDate)
      setMain(data.bankAccountId ? `b${data.bankAccountId}` : '000')
      setCounter(data.counterBankAccountId ? String(data.counterBankAccountId) : '')
      setPartnerId(data.partnerId ? String(data.partnerId) : '')
      setEmployeeId(data.employeeId ? String(data.employeeId) : '')
      setCardId(data.creditCardId ? String(data.creditCardId) : '')
      setIssuerId(data.cardIssuerId ? String(data.cardIssuerId) : '')
      setFeeRate(data.feeRate != null ? String(data.feeRate) : '')
      setAccountId(has('account') && l ? String(l.accountId) : '')
      setCreditAccountId(has('creditAccount') && data.lines[1] ? String(data.lines[1].accountId) : '')
      setPayee(has('payee') ? data.payeeName ?? '' : '')
      setAmount(l ? String(l.amount) : '')
      setFee(data.fee ? String(data.fee) : '')
      setMemo(l?.description ?? '')
      setDepartmentId(data.departmentId ? String(data.departmentId) : '')
      setProjectId(data.projectId ? String(data.projectId) : '')
    }).catch((e) => setError(extractErrorMessage(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, journalId])

  const activeBanks = useMemo(() => banks.filter((b) => b.active), [banks])
  const mainItems: CodeItem[] = useMemo(() => [
    ...activeBanks.map((b) => ({ value: `b${b.id}`, code: b.code ?? b.accountNo, name: bankLabel(b) })),
    { value: '000', code: '000', name: '현금' },
  ], [activeBanks])
  const counterItems: CodeItem[] = useMemo(
    () => activeBanks.map((b) => ({ value: String(b.id), code: b.code ?? b.accountNo, name: bankLabel(b) })), [activeBanks])
  const accountItems: CodeItem[] = useMemo(() => accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name })), [accounts])
  const partnerItems: CodeItem[] = useMemo(() => partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name })), [partners])
  const employeeItems: CodeItem[] = useMemo(() => employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name })), [employees])
  const cardItems: CodeItem[] = useMemo(() => cards.filter((c) => c.active).map((c) => ({ value: String(c.id), code: c.code ?? c.cardNo, name: c.cardName })), [cards])
  const issuerItems: CodeItem[] = useMemo(() => issuers.map((i) => ({ value: String(i.id), code: i.code, name: i.name, sub: `${i.feeRate}%` })), [issuers])

  /** 카드사를 고르면 원본처럼 [수수료율] · [입금계좌](카드사등록의 입금계좌)가 채워진다. */
  function pickIssuer(v: string) {
    setIssuerId(v)
    const i = issuers.find((x) => String(x.id) === v)
    if (!i) return
    setFeeRate(Number(i.feeRate ?? 0).toFixed(3))
    if (amount) setCardAmount(amount, Number(i.feeRate ?? 0))
    const dep = (i.depositAccount ?? '').trim()
    if (dep) {
      const b = activeBanks.find((x) => x.code === dep || x.accountNo === dep || bankLabel(x) === dep || x.name === dep)
      if (b) setMain(`b${b.id}`)
    }
  }

  const amountNum = Number(amount) || 0
  const rateNum = Number(feeRate) || 0
  const feeNum = Number(fee) || 0
  /* 원본 카드매출대금회수(2026-10-14 실측): 통장입금액 · 수수료율이 바뀌면 수수료를 다시 매기고(9,700 · 3% → 300),
     수수료는 고칠 수 있으며 총금액 = 통장입금액 + 수수료(400 으로 고치면 10,100). */
  const cardGross = amountNum + feeNum
  function setCardAmount(v: string, rate = rateNum) {
    setAmount(v)
    const d = Number(v) || 0
    setFee(d > 0 ? String(Math.max(grossOf(d, rate) - d, 0)) : '')
  }

  /** 필수칸이 찼나 — 저장 검증과 빨간 테두리가 같이 쓴다. 필수 아닌 칸은 늘 참. */
  function filled(f: CashQuickField): boolean {
    switch (f) {
      case 'main': return !!main
      case 'counter': return !!counter
      case 'partner': return !!partnerId
      case 'employee': return !!employeeId
      case 'card': return !!cardId
      case 'issuer': return !!issuerId
      case 'account': return !!accountId
      case 'creditAccount': return !!creditAccountId
      case 'amount': return amountNum > 0
      default: return true
    }
  }

  async function save() {
    setError('')
    /* 원본 has-error: 빈 필수칸은 글 알림 없이 칸만 빨간 테두리(공용-디자인-정리 A). */
    if (!req.check(Object.fromEntries(kind.fields.map(([f]) => [f, filled(f)])))) return
    if (type === 'OTHER_WITHDRAW' && main === '000' && feeNum > 0) return setError('현금일경우 수수료를 입력할 수 없습니다.')
    const body = {
      type,
      voucherDate: date,
      method: !nonCash && main.startsWith('b') ? 'BANK' : 'CASH',
      bankAccountId: !nonCash && main.startsWith('b') ? Number(main.slice(1)) : undefined,
      counterBankAccountId: counter ? Number(counter) : undefined,
      partnerId: partnerId ? Number(partnerId) : undefined,
      employeeId: employeeId ? Number(employeeId) : undefined,
      payeeName: has('payee') ? payee.trim() || undefined : employeeId ? employees.find((e) => String(e.id) === employeeId)?.name : undefined,
      creditCardId: cardId ? Number(cardId) : undefined,
      cardIssuerId: issuerId ? Number(issuerId) : undefined,
      feeRate: has('feeRate') ? rateNum : undefined,
      fee: has('fee') ? feeNum : 0,
      departmentId: departmentId ? Number(departmentId) : undefined,
      projectId: projectId ? Number(projectId) : undefined,
      lines: [{
        accountId: has('account') ? Number(accountId) : undefined,
        amount: amountNum,
        description: memo.trim() || undefined,
      }, ...(has('creditAccount') ? [{ accountId: Number(creditAccountId), amount: amountNum, description: memo.trim() || undefined }] : [])],
    }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/vouchers/${editing.id}`, body)
        navigate('/accounting/journals')
      } else {
        await api.post('/vouchers', body)
        reset(true)
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function copyAsNew() {
    setEditing(null); setDate(ymd(new Date())); setError('')
    /* 주소의 ?id= · ?journal= 만 지운다 — 라우터로 옮기면 위 effect 가 폼을 비운다. */
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }

  async function remove() {
    if (!editing) return
    setConfirmDelete(false)
    try {
      await api.delete(`/vouchers/${editing.id}`)
      navigate('/accounting/journals')
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  function field(f: CashQuickField, l: string) {
    switch (f) {
      case 'main':
        return <CodePickerField label={l} hideLabel pair fill emptyLabel="(없음)" invalid={req.on(f, filled(f))} value={main} onChange={(v) => setMain(v)} items={mainItems} />
      case 'counter':
        return <CodePickerField label={l} hideLabel pair fill emptyLabel="(없음)" invalid={req.on(f, filled(f))} value={counter} onChange={(v) => setCounter(v)} items={counterItems} />
      case 'partner':
        return <CodePickerField label={l} hideLabel pair fill emptyLabel="(없음)" invalid={req.on(f, filled(f))} value={partnerId} onChange={(v) => setPartnerId(v)} items={partnerItems} />
      case 'employee':
        return <CodePickerField label={l} hideLabel pair fill emptyLabel="(없음)" invalid={req.on(f, filled(f))} value={employeeId} onChange={(v) => setEmployeeId(v)} items={employeeItems} />
      case 'card':
        return <CodePickerField label={l} hideLabel pair fill emptyLabel="(없음)" invalid={req.on(f, filled(f))} value={cardId} onChange={(v) => setCardId(v)} items={cardItems} />
      case 'issuer':
        return <CodePickerField label={l} hideLabel pair fill emptyLabel="(없음)" invalid={req.on(f, filled(f))} value={issuerId} onChange={(v) => pickIssuer(v)} items={issuerItems} />
      case 'account':
        return <CodePickerField label={l} hideLabel pair fill emptyLabel="(없음)" invalid={req.on(f, filled(f))} value={accountId} onChange={(v) => setAccountId(v)} items={accountItems} />
      case 'creditAccount':
        return <CodePickerField label={l} hideLabel pair fill emptyLabel="(없음)" invalid={req.on(f, filled(f))} value={creditAccountId} onChange={(v) => setCreditAccountId(v)} items={accountItems} />
      case 'payee':
        return <input className="ec-input w-full" aria-label={l} placeholder={l} maxLength={100} value={payee} onChange={(e) => setPayee(e.target.value)} />
      case 'feeRate':
        return (
          <span className="inline-flex w-full items-center gap-[6px]">
            {/* 원본은 막힌 칸 — 카드사를 고르면 카드사등록의 수수료율이 들어온다(2026-10-14 실측 readonly 0.000 → 3.000). */}
            <input className="ec-input w-full text-right" aria-label={l} disabled value={feeRate || '0.000'} />
            <span>%</span>
          </span>
        )
      case 'amount':
        return <div className={`w-full ${req.cls(f, filled(f))}`}><EcNumInput className="ec-input w-full text-right" aria-label={l} value={amount}
          onValue={has('issuer') ? (v) => setCardAmount(v) : setAmount} placeholder="0" /></div>
      case 'fee':
        return <EcNumInput className="ec-input w-full text-right" aria-label={l} value={fee} onValue={setFee} placeholder="0" />
      case 'total':
        return <input className="ec-input w-full text-right" aria-label={l} disabled value={cardGross.toLocaleString('ko-KR')} />
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save() }}>
      <EcSlipShell
        title={kind.title}
        /* 원본 2026-10-20(일반영수증 E010501): [저장/전표(F7)]은 [저장(F8)]과 같다 — 저장하고 칸을 비울 뿐, 전표 창은 뜨지 않는다.
           회계거래조회에서 연 수정 창의 단추는 [저장(F8)] · [저장/전표(F7)] · [복사] · [삭제] · [닫기]. */
        actions={editing ? [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '저장/전표(F7)', onClick: () => void save(), disabled: saving },
          /* 원본 [복사]: 같은 값으로 새 전표 입력이 된다 — 일자가 다시 열리고 번호가 없어진다(영수증으로 2026-10-13 실측). */
          { label: '복사', onClick: copyAsNew },
          { label: '삭제', onClick: () => setConfirmDelete(true) },
          { label: '닫기', onClick: () => navigate('/accounting/journals') },
        ] : [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '저장/전표(F7)', onClick: () => void save(), disabled: saving },
          { label: '다시 작성', onClick: () => reset() },
          { label: '리스트', onClick: () => navigate('/accounting/journals') },
        ]}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <ul className="ec-form mb-[8px]">
          <EcCond label="전표일자" span={2}>
            <span className="inline-flex items-center gap-[6px]">
              <EcDateField value={date} onChange={setDate} disabled={!!editing} />
              {editing && <span className="text-ec-label">{editing.voucherNo}</span>}
            </span>
          </EcCond>
          <EcCond label="부서" span={2}>
            <CodePickerField label="부서" hideLabel pair fill emptyLabel="(없음)" value={departmentId} onChange={setDepartmentId} items={deptProject.departments} />
          </EcCond>
          <EcCond label="프로젝트" span={2}>
            <CodePickerField label="프로젝트" hideLabel pair fill emptyLabel="(없음)" value={projectId} onChange={setProjectId} items={deptProject.projects} />
          </EcCond>
          {kind.fields.map(([f, l]) => (
            <EcCond key={f} label={l} span={2}>{field(f, l)}</EcCond>
          ))}
          <EcCond label="적요" span={2}>
            <input className="ec-input w-full" placeholder="적요" maxLength={200} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </EcCond>
          <EcCond label="회계전표No." span={2}>
            <input className="ec-input w-full" placeholder="회계전표No." disabled value={editing?.journalDocNo ?? ''} />
          </EcCond>
        </ul>
      </EcSlipShell>

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- {kind.title}</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </form>
  )
}

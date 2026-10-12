import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcSlipShell from '../../components/EcSlipShell'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import Modal from '../../components/Modal'
import CodePickerField, { type CodeItem } from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../components/EcPeriodPicks'
import type { BankAccountRow, FastVoucher } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'

/**
 * 회계 I › 현금거래 › 현금예금출금 › [영수증으로](E010402).
 *
 * 2026-10-12 loginaa 실측: 한 장짜리 폼 — [전표일자] · [부서] · [프로젝트] · [출금계좌] · [계정] · [거래처명](글자) ·
 * [금액] · [수수료] · [적요] · [회계전표No.], 단추 [저장(F8)] · [저장/전표(F7)] · [다시 작성] · [리스트].
 * 000 현금 · 8109 복리후생비(판) · 'QA회계1-식당' · 5,000 저장 → 회계거래조회 '26/10/12-3 영수증으로 5,000 QA회계1-식당 QA회계1 영수증'.
 * 거기서 열면 일자가 막힌 같은 폼에 [삭제] — '전표를 삭제하겠습니까? - 영수증으로'. 결의서 인쇄는
 * '지출/입금/가지급정산서만 결의서 인쇄가 가능합니다.'
 *
 * 분개: 차) 계정 금액 · 지급수수료 수수료 / 대) 출금계좌 금액+수수료. 계좌면 그 계좌 잔액이 준다.
 */

interface AccountOption { id: number; code: string; name: string }

function bankLabel(b: BankAccountRow) {
  if (b.name) return b.name
  const digits = (b.accountNo ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `${b.bankName}-${digits.slice(-4)}` : b.bankName
}

export default function ReceiptPaymentPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('id')
  const journalId = params.get('journal')

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [editing, setEditing] = useState<FastVoucher | null>(null)
  const [date, setDate] = useState(ymd(new Date()))
  const deptProject = useDeptProjectItems()
  const [departmentId, setDepartmentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [settle, setSettle] = useState('')
  const [accountId, setAccountId] = useState('')
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    Promise.all([api.get<AccountOption[]>('/accounts'), api.get<BankAccountRow[]>('/bank-cards/accounts')])
      .then(([a, b]) => { setAccounts(a.data); setBanks(b.data) })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [])

  function reset() {
    setDate(ymd(new Date())); setSettle(''); setAccountId(''); setPayee(''); setAmount(''); setFee(''); setMemo(''); setError('')
    setDepartmentId(''); setProjectId('')
  }

  useEffect(() => {
    if (!editId && !journalId) { setEditing(null); reset(); return }
    const url = editId ? `/vouchers/${editId}` : `/vouchers/by-journal/${journalId}`
    api.get<FastVoucher & { departmentId: number | null; projectId: number | null }>(url).then(({ data }) => {
      const l = data.lines[0]
      setEditing(data)
      setDate(data.voucherDate)
      setSettle(l?.bankAccountId ? `b${l.bankAccountId}` : '000')
      setAccountId(l ? String(l.accountId) : '')
      setPayee(data.payeeName ?? '')
      setAmount(l ? String(l.amount) : '')
      setFee(data.fee ? String(data.fee) : '')
      setMemo(l?.description ?? '')
      setDepartmentId(data.departmentId ? String(data.departmentId) : '')
      setProjectId(data.projectId ? String(data.projectId) : '')
    }).catch((e) => setError(extractErrorMessage(e)))
  }, [editId, journalId])

  const settleItems: CodeItem[] = useMemo(() => [
    ...banks.filter((b) => b.active).map((b) => ({ value: `b${b.id}`, code: b.code ?? b.accountNo, name: bankLabel(b) })),
    { value: '000', code: '000', name: '현금' },
  ], [banks])
  const accountItems: CodeItem[] = useMemo(
    () => accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name })), [accounts])

  async function save() {
    setError('')
    if (!settle) return setError('출금계좌: 자료를 입력 바랍니다.')
    if (!accountId) return setError('계정: 자료를 입력 바랍니다.')
    if (!(Number(amount) > 0)) return setError('금액: 자료를 입력 바랍니다.')
    const body = {
      type: 'RECEIPT_PAYMENT',
      voucherDate: date,
      method: 'CASH',
      payeeName: payee.trim() || undefined,
      fee: Number(fee) || 0,
      departmentId: departmentId ? Number(departmentId) : undefined,
      projectId: projectId ? Number(projectId) : undefined,
      lines: [{
        accountId: Number(accountId),
        amount: Number(amount),
        description: memo.trim() || undefined,
        cash: settle === '000' || undefined,
        bankAccountId: settle.startsWith('b') ? Number(settle.slice(1)) : undefined,
      }],
    }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/vouchers/${editing.id}`, body)
        navigate('/accounting/journals')
      } else {
        await api.post('/vouchers', body)
        reset()
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
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

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save() }}>
      <EcSlipShell
        title="영수증으로"
        actions={editing ? [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '삭제', onClick: () => setConfirmDelete(true) },
          { label: '리스트', onClick: () => navigate('/accounting/journals') },
        ] : [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '다시 작성', onClick: reset },
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
          <EcCond label="출금계좌" span={2}>
            <CodePickerField label="출금계좌" hideLabel pair fill emptyLabel="(없음)" value={settle}
                             onChange={(v) => setSettle(v)} items={settleItems} />
          </EcCond>
          <EcCond label="계정" span={2}>
            <CodePickerField label="계정" hideLabel pair fill emptyLabel="(없음)" value={accountId}
                             onChange={(v) => setAccountId(v)} items={accountItems} />
          </EcCond>
          <EcCond label="거래처명" span={2}>
            <input className="ec-input w-full" placeholder="거래처명" maxLength={100} value={payee} onChange={(e) => setPayee(e.target.value)} />
          </EcCond>
          <EcCond label="금액" span={2}>
            <EcNumInput className="ec-input w-full text-right" aria-label="금액" value={amount} onValue={setAmount} placeholder="0" />
          </EcCond>
          <EcCond label="수수료" span={2}>
            <EcNumInput className="ec-input w-full text-right" aria-label="수수료" value={fee} onValue={setFee} placeholder="0" />
          </EcCond>
          <EcCond label="적요" span={2}>
            <input className="ec-input w-full" placeholder="적요" maxLength={200} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </EcCond>
          <EcCond label="회계전표No." span={2}>
            <input className="ec-input w-full" placeholder="회계전표No." disabled value={editing?.journalDocNo ?? ''} />
          </EcCond>
        </ul>
      </EcSlipShell>

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- 영수증으로</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </form>
  )
}

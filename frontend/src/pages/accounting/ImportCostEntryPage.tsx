import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcSlipShell from '../../components/EcSlipShell'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import Modal from '../../components/Modal'
import CodePickerField, { type CodeItem } from '../../components/codepicker/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { ymd } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { ecAlert } from '../../components/EcDialog'
import type { BankAccountRow, Partner } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { shortDateNo } from '../../utils/dateNo'
import {
  IMPORT_ENTRY, IMPORT_VOUCHER_LIST,
  type ImportCostItem, type ImportCostKind, type ImportCostVoucher, type ImportLot,
} from '../../features/importcost/api'
import { bankPickLabel } from '../../utils/bankLabel'

const BLOCKED_HEAD = '아래의 경우 처리가 불가능합니다.\n자세한 내용은 아래의 사항을 참고하시기 바랍니다.\n아래 사항을 수정 후 다시 진행하시기 바랍니다.'

interface AccountOption { id: number; code: string; name: string }

/** [부가세유형] ▾ 선택지 — 원본 (세금)계산서수령 2026-10-22 실측 19가지 그 차례 */
const VAT_TYPES = ['세금계산서', '영세율', '계산서', '세금계산서(불공)', '세금계산서(수입)', '현금영수증', '카드매입', '세.계(고정-수입)',
  '세.계(고정자산)', '영세율(수입)', '계산서(수입)', '세.계(고정-불공)', '계산서(고정자산)', '신용카드(고정자산)', '매입자발행세금계산서',
  '현금영수증(고정자산)', '기타수입', '재활용', '기타매입']

/**
 * 회계 II › 수입비용 입력 여섯 — 한 장 폼(원본 2026-10-14 loginaa 실측, plans/회계2/수입비용.md 2.3 ~ 2.5).
 *
 * <table>
 *   <tr><td>서류징수시</td><td>매입대금청구서수령(E060204) · (세금)계산서수령(E060202) · 일반영수증수령(E060203) — 출금계좌 처음 값 외상매입금</td></tr>
 *   <tr><td>자금지급시</td><td>거래대금지급(E060205) · 관세사에지급(E060206 — [거래처] 대신 [관세사])</td></tr>
 *   <tr><td>통관완료시</td><td>본계정대체(E060207) — 구입자산 · 금액(관리번호를 골라도 자동으로 안 채워진다)</td></tr>
 * </table>
 * 하단 [저장(F8)] [저장/전표(F7)] [다시 작성] [리스트]. 저장하면 안내 없이 폼이 비워지고 관리번호 · 출금계좌는 남는다
 * (본계정대체는 구입자산만 남는다). (세금)계산서수령은 공급가액을 넣고 칸을 떠나면 부가세 10% 가 채워진다.
 * 빈 채 저장하면 [관리번호] 칸이 빨개진다(금액 0 은 안 막는다).
 */
export default function ImportCostEntryPage({ kind }: { kind: ImportCostKind }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('id')
  const meta = IMPORT_ENTRY[kind]
  const isDoc = kind === 'BILL_RECEIPT' || kind === 'TAX_INVOICE' || kind === 'GENERAL_RECEIPT'
  const isPay = kind === 'TRADE_PAYMENT' || kind === 'BROKER_PAYMENT'
  const isTransfer = kind === 'TRANSFER'
  const hasItem = kind === 'TAX_INVOICE' || kind === 'GENERAL_RECEIPT'

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [banks, setBanks] = useState<BankAccountRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [lots, setLots] = useState<ImportLot[]>([])
  const [items, setItems] = useState<ImportCostItem[]>([])
  const deptProject = useDeptProjectItems()
  const [editing, setEditing] = useState<ImportCostVoucher | null>(null)

  const [date, setDate] = useState(ymd(new Date()))
  const [departmentId, setDepartmentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [vatType, setVatType] = useState('세금계산서')
  const [costItemId, setCostItemId] = useState('')
  const [lotId, setLotId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [amount, setAmount] = useState('')
  const [vat, setVat] = useState('')
  const [fee, setFee] = useState('')
  const [remark, setRemark] = useState('')
  const [settle, setSettle] = useState('')      // 출금계좌 — 서류징수시 계정 id · 자금지급시 계좌 id · 본계정대체 구입자산 계정 id
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const payableId = useMemo(() => accounts.find((a) => a.code === '2519')?.id, [accounts])

  useEffect(() => {
    Promise.all([
      api.get<AccountOption[]>('/accounts', { params: { slip: true } }), api.get<BankAccountRow[]>('/bank-cards/accounts'), api.get<Partner[]>('/partners'),
      api.get<ImportLot[]>('/import-costs/lots'), api.get<ImportCostItem[]>('/import-costs/items'),
    ]).then(([a, b, p, l, i]) => { setAccounts(a.data); setBanks(b.data); setPartners(p.data); setLots(l.data); setItems(i.data) })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [])

  // 서류징수시 출금계좌 처음 값 — 원본 '2519 외상매입금'(우리 251)
  useEffect(() => {
    if (isDoc && !settle && !editId && payableId) setSettle(String(payableId))
  }, [isDoc, settle, editId, payableId])

  /** keep = 저장 뒤: 관리번호 · 출금계좌(본계정대체는 구입자산)는 남긴다 — 청구서 · 본계정대체는 관리번호도 비운다. */
  function reset(keep = false) {
    if (!keep) {
      setDate(ymd(new Date())); setLotId(''); setSettle(isDoc && payableId ? String(payableId) : '')
      setDepartmentId(''); setProjectId('')
    } else if (isTransfer || kind === 'BILL_RECEIPT') {
      // 원본(2026-10-20 한 번 봄): 본계정대체 · 매입대금청구서수령은 저장 뒤 관리번호까지 비워진다(나머지는 남는다).
      setLotId('')
    }
    setPartnerId(''); setAmount(''); setVat(''); setFee(''); setRemark(''); setCostItemId(''); setVatType('세금계산서')
    setInvalid(false); setError('')
  }

  useEffect(() => {
    if (!editId) { setEditing(null); return }
    api.get<ImportCostVoucher>(`/import-costs/vouchers/${editId}`).then(({ data: v }) => {
      setEditing(v)
      setDate(v.voucherDate)
      setDepartmentId(v.departmentId ? String(v.departmentId) : '')
      setProjectId(v.projectId ? String(v.projectId) : '')
      setVatType(v.vatType ?? '세금계산서')
      setCostItemId(v.costItemId ? String(v.costItemId) : '')
      setLotId(String(v.lotId))
      setPartnerId(v.partnerId ? String(v.partnerId) : '')
      setAmount(v.amount ? String(v.amount) : '')
      setVat(v.vat ? String(v.vat) : '')
      setFee(v.fee ? String(v.fee) : '')
      setRemark(v.remark ?? '')
      setSettle(isPay ? (v.bankAccountId ? String(v.bankAccountId) : '') : (v.accountId ? String(v.accountId) : ''))
    }).catch((e) => setError(extractErrorMessage(e)))
  }, [editId, isPay])

  const lotItems: CodeItem[] = lots.filter((l) => l.active || String(l.id) === lotId)
    .map((l) => ({ value: String(l.id), code: l.code, name: l.name, stopped: !l.active }))
  const partnerItems: CodeItem[] = partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))
  const accountItems: CodeItem[] = accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))
  const bankItems: CodeItem[] = banks.filter((b) => b.active).map((b) => ({ value: String(b.id), code: b.code ?? b.accountNo, name: bankPickLabel(b) }))
  const itemItems: CodeItem[] = items.filter((i) => i.active || String(i.id) === costItemId).map((i) => ({ value: String(i.id), code: i.code, name: i.name }))
  const itemValue = costItemId || itemItems[0]?.value || ''

  // 원본(2026-10-20): 관리번호를 골라도 거래처는 따라오지 않는다
  const pickLot = setLotId

  async function save(withJournal = false) {
    setError('')
    const missing = !lotId || (isPay && !settle) || (isTransfer && !settle)
    if (missing) { setInvalid(true); return }
    // 원본(2026-10-20): 관리번호를 채우고 거래처를 비우면 칸이 아니라 창으로 막는다
    if (!isTransfer && !partnerId) {
      void ecAlert(`${BLOCKED_HEAD}\n\n거래처가 입력되지 않은 자료`)
      return
    }
    const body = {
      voucherDate: date, kind, lotId: Number(lotId),
      partnerId: partnerId ? Number(partnerId) : null,
      costItemId: hasItem && itemValue ? Number(itemValue) : null,
      amount: Number(amount) || 0, vat: Number(vat) || 0, fee: Number(fee) || 0,
      accountId: !isPay && settle ? Number(settle) : null,
      bankAccountId: isPay && settle ? Number(settle) : null,
      departmentId: departmentId ? Number(departmentId) : null,
      projectId: projectId ? Number(projectId) : null,
      vatType: kind === 'TAX_INVOICE' ? vatType : null,
      remark: remark.trim() || null,
    }
    setSaving(true)
    try {
      const { data } = editing
        ? await api.put<ImportCostVoucher>(`/import-costs/vouchers/${editing.id}`, body)
        : await api.post<ImportCostVoucher>('/import-costs/vouchers', body)
      if (withJournal && data.journalEntryId) window.open(`/accounting/vouchers?journal=${data.journalEntryId}`, '_blank')
      if (editing) navigate(IMPORT_VOUCHER_LIST)
      else reset(true)
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
      await api.post('/import-costs/vouchers/delete', { ids: [editing.id] })
      navigate(IMPORT_VOUCHER_LIST)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const red = (bad: boolean) => (invalid && bad ? '[&_.ec-input]:border-ec-danger' : '')
  const amountLabel = kind === 'TAX_INVOICE' ? '공급가액' : '금액'

  const dateField = (
    <EcCond label="전표일자" span={2}>
      <span className="inline-flex items-center gap-[6px]">
        <EcDateField value={date} onChange={setDate} disabled={!!editing} />
        {editing?.journalDocNo && <span className="text-ec-label">- {shortDateNo(editing.voucherDate, editing.journalDocNo).split('-').pop()}</span>}
      </span>
    </EcCond>
  )
  const deptField = (
    <EcCond label="부서" span={2}>
      <CodePickerField label="부서" hideLabel pair fill emptyLabel="(없음)" value={departmentId} onChange={setDepartmentId} items={deptProject.departments} />
    </EcCond>
  )
  const projectField = (
    <EcCond label="프로젝트" span={2}>
      <CodePickerField label="프로젝트" hideLabel pair fill emptyLabel="(없음)" value={projectId} onChange={setProjectId} items={deptProject.projects} />
    </EcCond>
  )
  const lotField = (
    <EcCond label="관리번호" span={2}>
      <div className={`w-full ${red(!lotId)}`}>
        <CodePickerField label="관리번호" hideLabel pair fill emptyLabel="(없음)" popupTitle="관리번호" value={lotId} onChange={pickLot} items={lotItems} />
      </div>
    </EcCond>
  )
  const partnerField = (
    <EcCond label={kind === 'BROKER_PAYMENT' ? '관세사' : '거래처'} span={2}>
      <CodePickerField label={kind === 'BROKER_PAYMENT' ? '관세사' : '거래처'} hideLabel pair fill emptyLabel="(없음)"
                       popupTitle={kind === 'BROKER_PAYMENT' ? '관세사 검색' : '거래처검색'}
                       value={partnerId} onChange={setPartnerId} items={partnerItems} />
    </EcCond>
  )
  const settleField = (
    <EcCond label={isTransfer ? '구입자산' : '출금계좌'} span={2}>
      <div className={`w-full ${red((isPay || isTransfer) && !settle)}`}>
        {isPay ? (
          <CodePickerField label="출금계좌" hideLabel pair fill emptyLabel="(없음)" popupTitle="계좌검색" value={settle} onChange={setSettle} items={bankItems} />
        ) : (
          <CodePickerField label={isTransfer ? '구입자산' : '출금계좌'} hideLabel pair fill emptyLabel="(없음)" popupTitle="계정검색"
                           value={settle} onChange={setSettle} items={accountItems} />
        )}
      </div>
    </EcCond>
  )
  const itemField = (
    <EcCond label="비용항목" span={2}>
      {/* 원본 처음 값 = 목록 첫 항목('비용항목 직접설정가능') */}
      <select className="ec-input w-full" aria-label="비용항목" value={itemValue} onChange={(e) => setCostItemId(e.target.value)}>
        {itemItems.map((i) => <option key={i.value} value={i.value}>{i.name}</option>)}
      </select>
    </EcCond>
  )
  const amountField = (
    <EcCond label={amountLabel} span={2}>
      {/* (세금)계산서수령: 공급가액을 넣으면 부가세 10% 가 따라온다(원본은 칸을 떠날 때 — 부가세는 그 뒤에 고칠 수 있다) */}
      <EcNumInput className="ec-input w-full text-right" aria-label={amountLabel} value={amount} placeholder="0"
                  onValue={(v) => { setAmount(v); if (kind === 'TAX_INVOICE') setVat(String(Math.floor((Number(v) || 0) * 0.1))) }} />
    </EcCond>
  )
  const vatField = (
    <EcCond label="부가세" span={2}>
      <EcNumInput className="ec-input w-full text-right" aria-label="부가세" value={vat} onValue={setVat} placeholder="0" />
    </EcCond>
  )
  const feeField = (
    <EcCond label="수수료" span={2}>
      <EcNumInput className="ec-input w-full text-right" aria-label="수수료" value={fee} onValue={setFee} placeholder="0" />
    </EcCond>
  )
  const remarkField = (
    <EcCond label="적요" span={2}>
      <input className="ec-input w-full" aria-label="적요" placeholder="적요" maxLength={300} value={remark} onChange={(e) => setRemark(e.target.value)} />
    </EcCond>
  )
  const journalField = (
    <EcCond label="회계전표No." span={2}>
      <input className="ec-input w-full" aria-label="회계전표No." placeholder="회계전표No." disabled
             value={editing?.journalDocNo ? shortDateNo(editing.voucherDate, editing.journalDocNo) : ''} />
    </EcCond>
  )

  // 원본 칸 차례(2026-10-14 실측)
  const fields = (() => {
    switch (kind) {
      case 'BILL_RECEIPT': return [dateField,
        <EcCond key="link" label="연결전표" span={2}><span>없음</span></EcCond>,
        deptField, projectField, lotField, partnerField, amountField, feeField, settleField, remarkField]
      case 'TAX_INVOICE': return [dateField, deptField, projectField,
        <EcCond key="vt" label="부가세유형" span={2}>
          <span className="inline-flex items-center gap-[6px] w-full">
            <select className="ec-input w-[140px]" aria-label="부가세유형" value={vatType} onChange={(e) => setVatType(e.target.value)}>
              {VAT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="text-ec-label">전자(세금)계산서-신규 예정누락아님</span>
          </span>
        </EcCond>,
        itemField, lotField, partnerField, amountField, vatField, feeField, remarkField, settleField, journalField]
      case 'GENERAL_RECEIPT': return [dateField, deptField, projectField, itemField, settleField, lotField, partnerField, amountField, feeField, remarkField, journalField]
      case 'TRADE_PAYMENT':
      case 'BROKER_PAYMENT': return [dateField, deptField, projectField, settleField, lotField, partnerField, amountField, feeField, remarkField, journalField]
      case 'TRANSFER': return [dateField, deptField, projectField, settleField, lotField, amountField, remarkField, journalField]
    }
  })()

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save() }}>
      <EcSlipShell
        title={meta.title}
        actions={editing ? [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '저장/전표(F7)', onClick: () => void save(true), disabled: saving },
          { label: '삭제', onClick: () => setConfirmDelete(true) },
          { label: '리스트', onClick: () => navigate(IMPORT_VOUCHER_LIST) },
        ] : [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '저장/전표(F7)', onClick: () => void save(true), disabled: saving },
          { label: '다시 작성', onClick: () => reset() },
          { label: '리스트', onClick: () => navigate(IMPORT_VOUCHER_LIST) },
        ]}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <ul className="ec-form mb-[8px]">
          {fields.map((f, i) => <Fragment key={i}>{f}</Fragment>)}
        </ul>
      </EcSlipShell>

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- {meta.short}</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </form>
  )
}

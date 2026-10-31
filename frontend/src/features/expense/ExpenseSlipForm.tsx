import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import GridCode from '../../components/codepicker/GridCode'
import EcNumInput from '../../components/EcNumInput'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { ecConfirm } from '../../components/EcDialog'
import { ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import type { EmployeeMaster } from '../../types/api'
import type { ExpenseGroup, ExpenseItem } from '../expensemaster/api'
import { bankLabel, type BankAccountOpt } from '../fundplan/types'
import { slipNo, type ExpenseRow } from './types'
import EcSlipShell from '../../components/EcSlipShell'
import EcDateInput from '../../components/ui/EcDateInput'
import { fmtAmount } from '../../utils/format'

/**
 * 회계 II › 비용관리 › 비용내역 › <b>비용내역입력</b>(E060812) 판 — 입력 화면과 비용내역조회의 [전표번호] → '비용내역수정' 창이 같이 쓴다.
 * 2026-10-20 loginaa 실측(plans/회계2/비용관리.md 2장 · 다시 하기 3바퀴):
 * 머리 작성일자 · 비용그룹 · 결제구분(○개인비용 ◉회사비용) · 출금계좌 · 비고, 줄 사용일자 · 비용코드 · 비용명 · 사원(필수) · 거래처코드 · 거래처명 ·
 * 사용금액 · 적요 · 부서 · 프로젝트 · 배부액 · 금액1 · 금액2 · 적요1 · 적요2 · 적요3, 처음 3줄 · 합계줄(사용금액 · 금액1 · 금액2).
 * <b>여러 줄이 전표 한 장</b>이다(두 줄 20,000 + 15,000 → '2026/10/20 -2' 하나). 사원 · 사용일자 빈칸 저장 → 그 칸 빨간 테두리(글 없음).
 * 저장하면 안내 글 없이 판이 비워진다. 비용코드로 넣은 전표는 회계전표를 만들지 않는다(개인비용만 전표별회계반영 E060814 에서).
 * 비용통제(한도 · 사용인원)에 걸리면 '한도금액이 초과되었습니다. 전표를 저장하겠습니까?' → [취소] 면 '비용통제' 창.
 */
interface Line {
  useDate: string
  itemId: string
  employeeId: string
  partnerId: string
  amount: string
  content: string
  department: string
  projectId: string
  allocAmount: string
  amount1: string
  amount2: string
  memo1: string
  memo2: string
  memo3: string
}
const BLANK_LINE: Line = {
  useDate: '', itemId: '', employeeId: '', partnerId: '', amount: '', content: '', department: '', projectId: '',
  allocAmount: '', amount1: '', amount2: '', memo1: '', memo2: '', memo3: '',
}
const blankLines = (n = 3) => Array.from({ length: n }, () => ({ ...BLANK_LINE }))
const str = (v: number | string | null | undefined) => (v == null ? '' : String(v))
const num = (v: string) => (v === '' ? undefined : Number(v))

interface Violation {
  kind: string
  itemCode: string
  itemName: string
  allowedEmployeeIds: number[]
  employeeId: number | null
  limitAmount: number | null
  usedAmount: number | null
  block: boolean
}

const LIMIT_CONFIRM = '한도금액이 초과되었습니다. 전표를 저장하겠습니까?\n[취소] 클릭 시 내역을 확인할 수 있습니다.'

export default function ExpenseSlipForm({ edit, onSaved, onClose, onList }: {
  /** 비용내역수정 — 그 전표의 줄 전부(줄 차례대로) */
  edit?: ExpenseRow[] | null
  onSaved?: () => void
  onClose?: () => void
  onList?: () => void
}) {
  const pickers = useCondPickers(['partners', 'projects'])
  const [items, setItems] = useState<ExpenseItem[]>([])
  const [groups, setGroups] = useState<ExpenseGroup[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [banks, setBanks] = useState<BankAccountOpt[]>([])
  const [date, setDate] = useState(ymd(new Date()))
  const [groupId, setGroupId] = useState('')
  const [payType, setPayType] = useState<'PERSONAL' | 'COMPANY'>('COMPANY')
  const [bankId, setBankId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<Line[]>(blankLines)
  const [bad, setBad] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [violations, setViolations] = useState<Violation[] | null>(null)
  /** 저장/전표(F7) 뒤 '비용전표' 인쇄 창 */
  const [printed, setPrinted] = useState<ExpenseRow[] | null>(null)

  useEffect(() => {
    api.get<ExpenseItem[]>('/expense-items').then((r) => setItems(r.data)).catch(() => undefined)
    api.get<ExpenseGroup[]>('/expense-groups').then((r) => setGroups(r.data)).catch(() => undefined)
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => undefined)
    api.get<BankAccountOpt[]>('/bank-cards/accounts').then((r) => setBanks(r.data)).catch(() => undefined)
  }, [])

  const head = edit?.[0] ?? null
  const settled = !!edit?.some((r) => r.settledJournalId)

  function reset() {
    setError(''); setBad(new Set())
    if (head && edit) {
      setDate(head.expenseDate); setGroupId(head.expenseGroupId ? String(head.expenseGroupId) : '')
      setPayType(head.payType ?? 'COMPANY'); setRemarks(head.remarks ?? ''); setBankId(str(head.bankAccountId))
      const ls = edit.map((r) => ({
        useDate: r.useDate ?? '', itemId: str(r.expenseItemId), employeeId: str(r.employeeId), partnerId: str(r.partnerId),
        amount: str(r.amount), content: r.content ?? '', department: r.department ?? '', projectId: str(r.projectId),
        allocAmount: str(r.allocAmount), amount1: str(r.amount1), amount2: str(r.amount2),
        memo1: r.memo1 ?? '', memo2: r.memo2 ?? '', memo3: r.memo3 ?? '',
      }))
      setLines([...ls, ...blankLines(Math.max(1, 3 - ls.length))])
    } else {
      setDate(ymd(new Date())); setGroupId(''); setPayType('COMPANY'); setRemarks(''); setBankId('')
      setLines(blankLines())
    }
  }
  useEffect(reset, [edit])

  const itemCodes = useMemo(() => items.filter((i) => i.active).map((i) => ({ value: String(i.id), code: i.code, name: i.name })), [items])
  const empCodes = useMemo(() => employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name })), [employees])
  const bankCodes = useMemo(() => banks.filter((b) => b.active).map((b) => ({ value: String(b.id), code: b.code ?? b.accountNo, name: bankLabel(b) })), [banks])
  const empName = (id: number | null | undefined) => employees.find((e) => e.id === id)?.name ?? ''
  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const unbad = (key: string) => setBad((b) => { const n = new Set(b); n.delete(key); return n })
  const sum = (k: 'amount' | 'amount1' | 'amount2') => lines.reduce((s, l) => s + (Number(l[k]) || 0), 0)

  async function save(print = false) {
    setError('')
    const filled = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.itemId || l.amount || l.employeeId)
    if (filled.length === 0) { setError('비용코드를 입력 바랍니다.'); return }
    const missing = new Set<string>()
    for (const { l, i } of filled) {
      if (!l.employeeId) missing.add(`${i}:employee`)
      // 원본: 첫 줄은 비용코드를 넣으면 사용일자가 작성일자로 찬다 — 둘째 줄부터 빈 사용일자는 빨간 테두리(2026-10-20)
      if (!l.useDate && i !== 0) missing.add(`${i}:useDate`)
    }
    setBad(missing)
    if (missing.size > 0) return
    for (const { l } of filled) {
      if (!l.itemId) { setError('비용코드를 입력 바랍니다.'); return }
      if (!(Number(l.amount) > 0)) { setError('사용금액을 입력 바랍니다.'); return }
    }
    const body = {
      expenseDate: date, expenseGroupId: groupId ? Number(groupId) : undefined, payType,
      remarks: remarks || undefined, bankAccountId: bankId && !settled ? Number(bankId) : undefined,
      lines: filled.map(({ l }) => ({
        useDate: l.useDate || date, expenseItemId: Number(l.itemId), employeeId: Number(l.employeeId),
        partnerName: pickers.partners.find((p) => p.value === l.partnerId)?.name, amount: Number(l.amount),
        content: l.content || undefined, department: l.department || undefined, projectId: l.projectId ? Number(l.projectId) : undefined,
        allocAmount: num(l.allocAmount), amount1: num(l.amount1), amount2: num(l.amount2),
        memo1: l.memo1 || undefined, memo2: l.memo2 || undefined, memo3: l.memo3 || undefined,
      })),
      confirmOverLimit: false,
    }
    try {
      const v = (await api.post<Violation[]>('/expenses/slip/control-check', body, { params: head ? { editingId: head.id } : {} })).data
      if (v.length > 0) {
        if (v.some((x) => x.block)) { setError('한도금액이 초과되었습니다.'); setViolations(v); return }
        if (!(await ecConfirm(LIMIT_CONFIRM))) { setViolations(v); return }
        body.confirmOverLimit = true
      }
      const saved = head
        ? (await api.put<ExpenseRow[]>(`/expenses/${head.id}/slip`, body)).data
        : (await api.post<ExpenseRow[]>('/expenses/slip', body)).data
      if (print) setPrinted(saved)
      if (!head) reset()
      onSaved?.()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function remove() {
    if (!head) return
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 비용내역입력'))) return
    try {
      await api.delete(`/expenses/${head.id}`)
      onSaved?.()
      onClose?.()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const body = (
    <div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-form mb-[8px]">
        <li>
          <span className="title">작성일자</span>
          <div className="form">
            <EcDateInput className="ec-input w-[145px]" aria-label="작성일자" value={date} onChange={(e) => setDate(e.target.value)} />
            {head && <span className="ml-[6px]">- {slipNo(head).split(' -').pop()}</span>}
            {settled && <span className="ec-badge ml-[6px]">가지급금정산서</span>}
          </div>
        </li>
        <li>
          <span className="title">비용그룹</span>
          <div className="form">
            <CodePickerField label="비용그룹" hideLabel pair popupTitle="비용그룹검색" emptyLabel="" value={groupId} onChange={setGroupId}
                             items={groups.filter((g) => g.active).map((g) => ({ value: String(g.id), code: g.code, name: g.name }))} />
          </div>
        </li>
        <li>
          <span className="title">결제구분</span>
          <div className="form">
            {([['PERSONAL', '개인비용'], ['COMPANY', '회사비용']] as const).map(([v, l]) => (
              <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
                <input type="radio" name="expense-slip-pay-type" checked={payType === v} onChange={() => setPayType(v)} /> {l}
              </label>
            ))}
          </div>
        </li>
        {/* 원본: 회계반영(가지급금정산서) 뒤 수정 창에는 [출금계좌] 칸이 없다 */}
        {!settled && (
          <li>
            <span className="title">출금계좌</span>
            <div className="form">
              <CodePickerField label="출금계좌" hideLabel pair popupTitle="계좌검색" emptyLabel="" value={bankId} onChange={setBankId} items={bankCodes} />
            </div>
          </li>
        )}
        <li>
          <span className="title">비고</span>
          <div className="form">
            <input className="ec-input w-full" aria-label="비고" maxLength={200} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </li>
      </ul>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1900px]">
          <thead>
            <tr>
              <th className="w-[40px]"></th>
              <th className="w-[130px]">사용일자</th>
              <th className="w-[100px]">비용코드</th>
              <th>비용명</th>
              <th className="w-[110px]">사원</th>
              <th className="w-[100px]">거래처코드</th>
              <th>거래처명</th>
              <th className="w-[110px]">사용금액</th>
              <th>적요</th>
              <th className="w-[100px]">부서</th>
              <th className="w-[120px]">프로젝트</th>
              <th className="w-[100px]">배부액</th>
              <th className="w-[100px]">금액1</th>
              <th className="w-[100px]">금액2</th>
              <th className="w-[120px]">적요1</th>
              <th className="w-[120px]">적요2</th>
              <th className="w-[120px]">적요3</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const item = items.find((x) => String(x.id) === l.itemId)
              const partner = pickers.partners.find((p) => p.value === l.partnerId)
              return (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td className={bad.has(`${i}:useDate`) ? 'outline outline-1 outline-ec-danger' : ''}>
                    <EcDateInput className="ec-input w-full" aria-label="사용일자" value={l.useDate} onChange={(e) => { set(i, 'useDate', e.target.value); unbad(`${i}:useDate`) }} />
                  </td>
                  <td><GridCode title="비용검색" codeHead="비용코드" nameHead="비용명" items={itemCodes} value={l.itemId}
                                onPick={(v) => { set(i, 'itemId', v); if (i === 0 && !l.useDate) set(i, 'useDate', date) }} /></td>
                  <td>{item?.name ?? ''}</td>
                  <td className={bad.has(`${i}:employee`) ? 'outline outline-1 outline-ec-danger' : ''}>
                    <GridCode title="사원검색" codeHead="사원코드" nameHead="사원명" items={empCodes} value={l.employeeId} showName
                              onPick={(v) => { set(i, 'employeeId', v); unbad(`${i}:employee`) }} />
                  </td>
                  <td><GridCode title="거래처검색" codeHead="거래처코드" nameHead="거래처명" items={pickers.partners} value={l.partnerId} onPick={(v) => set(i, 'partnerId', v)} /></td>
                  <td>{partner?.name ?? ''}</td>
                  <td><EcNumInput className="ec-input w-full text-right" aria-label="사용금액" value={l.amount} onValue={(v) => set(i, 'amount', v)} /></td>
                  <td><input className="ec-input w-full" aria-label="적요" maxLength={300} value={l.content} onChange={(e) => set(i, 'content', e.target.value)} /></td>
                  <td><input className="ec-input w-full" aria-label="부서" maxLength={50} value={l.department} onChange={(e) => set(i, 'department', e.target.value)} /></td>
                  <td><GridCode title="프로젝트검색" codeHead="프로젝트코드" nameHead="프로젝트명" items={pickers.projects} value={l.projectId} showName onPick={(v) => set(i, 'projectId', v)} /></td>
                  <td><EcNumInput className="ec-input w-full text-right" aria-label="배부액" value={l.allocAmount} onValue={(v) => set(i, 'allocAmount', v)} /></td>
                  <td><EcNumInput className="ec-input w-full text-right" aria-label="금액1" value={l.amount1} onValue={(v) => set(i, 'amount1', v)} /></td>
                  <td><EcNumInput className="ec-input w-full text-right" aria-label="금액2" value={l.amount2} onValue={(v) => set(i, 'amount2', v)} /></td>
                  <td><input className="ec-input w-full" aria-label="적요1" maxLength={200} value={l.memo1} onChange={(e) => set(i, 'memo1', e.target.value)} /></td>
                  <td><input className="ec-input w-full" aria-label="적요2" maxLength={200} value={l.memo2} onChange={(e) => set(i, 'memo2', e.target.value)} /></td>
                  <td><input className="ec-input w-full" aria-label="적요3" maxLength={200} value={l.memo3} onChange={(e) => set(i, 'memo3', e.target.value)} /></td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}></td>
              <td className="text-right">{fmtAmount(sum('amount'))}</td>
              <td colSpan={4}></td>
              <td className="text-right">{fmtAmount(sum('amount1'))}</td>
              <td className="text-right">{fmtAmount(sum('amount2'))}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" className="ec-btn ec-btn-sm mt-[6px]" onClick={() => setLines((ls) => [...ls, ...blankLines(1)])}>줄 추가</button>

      <Modal open={!!violations} title="비용통제" width={640} onClose={() => setViolations(null)}>{(
        <div>
          <p>한도금액이 초과되었습니다.</p>
          <p className="mb-[8px]">다음 사항을 확인 바랍니다.</p>
          <p className="mb-[4px]">1.비용</p>
          <table className="w-full">
            <thead><tr><th>비용코드</th><th>비용명</th><th>사용인원</th><th>사용자</th></tr></thead>
            <tbody>
              {(violations ?? []).map((v, k) => (
                <tr key={k}>
                  <td>{v.itemCode}</td>
                  <td>{v.itemName}</td>
                  <td>{v.allowedEmployeeIds.map(empName).filter(Boolean).join(', ')}</td>
                  <td>{empName(v.employeeId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-center mt-[10px]"><button type="button" className="ec-btn" onClick={() => setViolations(null)}>닫기</button></div>
        </div>
      )}</Modal>

      <Modal open={!!printed} title="비용전표" width={720} onClose={() => setPrinted(null)}>{(
        <div>
          {printed && printed.length > 0 && (
            <>
              <p className="mb-[6px]">작성자 : {printed[0].createdBy ?? ''} &nbsp; 전표번호 : {slipNo(printed[0])}</p>
              <table className="w-full">
                <thead><tr><th>비용명</th><th>거래처명</th><th className="text-right">사용금액</th><th>적요</th></tr></thead>
                <tbody>
                  {printed.map((r) => (
                    <tr key={r.id}><td>{r.expenseItemName ?? r.accountName}</td><td>{r.partnerName ?? ''}</td>
                      <td className="text-right">{fmtAmount(Number(r.amount))}</td><td>{r.content ?? ''}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={2}>합 계</td><td className="text-right">{fmtAmount(printed.reduce((s, r) => s + Number(r.amount), 0))}</td><td></td></tr></tfoot>
              </table>
              <div className="flex justify-center gap-[6px] mt-[10px]">
                <button type="button" className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
                <button type="button" className="ec-btn" onClick={() => setPrinted(null)}>닫기</button>
              </div>
            </>
          )}
        </div>
      )}</Modal>
    </div>
  )

  if (!head) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); void save() }}>
        <EcSlipShell title="비용내역입력" formTabs={[{ id: 'main', label: '비용내역입력' }]} activeFormTab="main"
                     actions={[
                       { label: '저장(F8)', primary: true, submit: true },
                       { label: '저장/전표(F7)', onClick: () => void save(true) },
                       { label: '다시 작성', onClick: reset },
                       { label: '리스트', onClick: onList },
                     ]}>
          {body}
        </EcSlipShell>
      </form>
    )
  }
  return (
    <div>
      {body}
      <div className="flex gap-[6px] mt-[10px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={() => void save(true)}>저장/전표(F7)</button>
        <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
        <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

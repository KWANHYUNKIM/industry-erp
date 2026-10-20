import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import GridCode from '../../components/GridCode'
import EcNumInput from '../../components/EcNumInput'
import CodePickerField from '../../components/CodePickerField'
import { ecConfirm } from '../../components/EcDialog'
import { ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import type { EmployeeMaster } from '../../types/api'
import type { ExpenseGroup, ExpenseItem } from '../expensemaster/api'
import type { ExpenseRow } from './types'
import EcSlipShell from '../../components/EcSlipShell'

/**
 * 회계 II › 비용관리 › 비용내역 › <b>비용내역입력</b>(E060812) 판 — 입력 화면과 비용내역조회의 [전표번호] → '비용내역수정' 창이 같이 쓴다.
 * 2026-10-20 loginaa 실측(plans/회계2/비용관리.md 2장):
 * 머리 작성일자 · 비용그룹 · 결제구분(○개인비용 ◉회사비용) · 비고, 줄 사용일자 · 비용코드 · 비용명 · 사원(필수) · 거래처코드 · 거래처명 ·
 * 사용금액 · 적요 · 부서 · 프로젝트, 처음 3줄 · 합계줄. 사원 빈칸 저장 → 사원 칸 빨간 테두리(글 없음).
 * 저장하면 안내 글 없이 판이 비워진다. 비용코드로 넣은 전표는 회계전표를 만들지 않는다(개인비용만 전표별회계반영 E060814 에서).
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
}
const BLANK_LINE: Line = { useDate: '', itemId: '', employeeId: '', partnerId: '', amount: '', content: '', department: '', projectId: '' }
const blankLines = () => [BLANK_LINE, BLANK_LINE, BLANK_LINE].map((l) => ({ ...l }))
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

export default function ExpenseSlipForm({ edit, onSaved, onClose, onList }: {
  /** 비용내역수정 — 그 전표 한 줄 */
  edit?: ExpenseRow | null
  onSaved?: () => void
  onClose?: () => void
  onList?: () => void
}) {
  const pickers = useCondPickers(['partners', 'projects'])
  const [items, setItems] = useState<ExpenseItem[]>([])
  const [groups, setGroups] = useState<ExpenseGroup[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [date, setDate] = useState(ymd(new Date()))
  const [groupId, setGroupId] = useState('')
  const [payType, setPayType] = useState<'PERSONAL' | 'COMPANY'>('COMPANY')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<Line[]>(blankLines)
  const [bad, setBad] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<ExpenseItem[]>('/expense-items').then((r) => setItems(r.data)).catch(() => undefined)
    api.get<ExpenseGroup[]>('/expense-groups').then((r) => setGroups(r.data)).catch(() => undefined)
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => undefined)
  }, [])

  function reset() {
    setError(''); setBad(new Set())
    if (edit) {
      setDate(edit.expenseDate); setGroupId(edit.expenseGroupId ? String(edit.expenseGroupId) : '')
      setPayType(edit.payType ?? 'COMPANY'); setRemarks(edit.remarks ?? '')
      setLines([{
        useDate: edit.useDate ?? '', itemId: edit.expenseItemId ? String(edit.expenseItemId) : '',
        employeeId: edit.employeeId ? String(edit.employeeId) : '', partnerId: edit.partnerId ? String(edit.partnerId) : '',
        amount: String(edit.amount ?? ''), content: edit.content ?? '', department: edit.department ?? '',
        projectId: edit.projectId ? String(edit.projectId) : '',
      }])
    } else {
      setDate(ymd(new Date())); setGroupId(''); setPayType('COMPANY'); setRemarks('')
      setLines(blankLines())
    }
  }
  useEffect(reset, [edit])

  const itemCodes = useMemo(() => items.filter((i) => i.active).map((i) => ({ value: String(i.id), code: i.code, name: i.name })), [items])
  const empCodes = useMemo(() => employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name })), [employees])
  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  async function save() {
    setError('')
    const filled = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.itemId || l.amount || l.employeeId)
    if (filled.length === 0) { setError('비용코드를 입력 바랍니다.'); return }
    const missing = new Set(filled.filter(({ l }) => !l.employeeId).map(({ i }) => i))
    setBad(missing)
    if (missing.size > 0) return
    for (const { l } of filled) {
      if (!l.itemId) { setError('비용코드를 입력 바랍니다.'); return }
      if (!(Number(l.amount) > 0)) { setError('사용금액을 입력 바랍니다.'); return }
    }
    try {
      for (const { l } of filled) {
        const partner = pickers.partners.find((p) => p.value === l.partnerId)
        const body = {
          expenseDate: date, useDate: l.useDate || undefined, expenseItemId: Number(l.itemId), employeeId: Number(l.employeeId),
          expenseGroupId: groupId ? Number(groupId) : undefined, payType, remarks: remarks || undefined,
          partnerName: partner?.name, amount: Number(l.amount), content: l.content || undefined,
          department: l.department || undefined, projectId: l.projectId ? Number(l.projectId) : undefined,
        }
        if (edit) await api.put(`/expenses/${edit.id}`, body)
        else await api.post('/expenses', body)
      }
      if (!edit) reset()
      onSaved?.()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function remove() {
    if (!edit) return
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 비용내역입력'))) return
    try {
      await api.delete(`/expenses/${edit.id}`)
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
            <input type="date" className="ec-input w-[145px]" aria-label="작성일자" value={date} onChange={(e) => setDate(e.target.value)} />
            {edit && <span className="ml-[6px]">- {edit.docNo.split('-').pop()?.replace(/^0+/, '')}</span>}
            {edit?.settledJournalId && <span className="ec-badge ml-[6px]">가지급금정산서</span>}
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
        <li>
          <span className="title">비고</span>
          <div className="form">
            <input className="ec-input w-full" aria-label="비고" maxLength={200} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </li>
      </ul>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr>
              <th className="w-[40px]"></th>
              <th className="w-[120px]">사용일자</th>
              <th className="w-[100px]">비용코드</th>
              <th>비용명</th>
              <th className="w-[110px]">사원</th>
              <th className="w-[100px]">거래처코드</th>
              <th>거래처명</th>
              <th className="w-[110px]">사용금액</th>
              <th>적요</th>
              <th className="w-[100px]">부서</th>
              <th className="w-[120px]">프로젝트</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const item = items.find((x) => String(x.id) === l.itemId)
              const partner = pickers.partners.find((p) => p.value === l.partnerId)
              return (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td><input type="date" className="ec-input w-full" aria-label="사용일자" value={l.useDate} onChange={(e) => set(i, 'useDate', e.target.value)} /></td>
                  <td><GridCode title="비용검색" codeHead="비용코드" nameHead="비용명" items={itemCodes} value={l.itemId} onPick={(v) => set(i, 'itemId', v)} /></td>
                  <td>{item?.name ?? ''}</td>
                  <td className={bad.has(i) ? 'outline outline-1 outline-ec-danger' : ''}>
                    <GridCode title="사원검색" codeHead="사원코드" nameHead="사원명" items={empCodes} value={l.employeeId} showName
                              onPick={(v) => { set(i, 'employeeId', v); setBad((b) => { const n = new Set(b); n.delete(i); return n }) }} />
                  </td>
                  <td><GridCode title="거래처검색" codeHead="거래처코드" nameHead="거래처명" items={pickers.partners} value={l.partnerId} onPick={(v) => set(i, 'partnerId', v)} /></td>
                  <td>{partner?.name ?? ''}</td>
                  <td><EcNumInput className="ec-input w-full text-right" aria-label="사용금액" value={l.amount} onValue={(v) => set(i, 'amount', v)} /></td>
                  <td><input className="ec-input w-full" aria-label="적요" maxLength={300} value={l.content} onChange={(e) => set(i, 'content', e.target.value)} /></td>
                  <td><input className="ec-input w-full" aria-label="부서" maxLength={50} value={l.department} onChange={(e) => set(i, 'department', e.target.value)} /></td>
                  <td><GridCode title="프로젝트검색" codeHead="프로젝트코드" nameHead="프로젝트명" items={pickers.projects} value={l.projectId} showName onPick={(v) => set(i, 'projectId', v)} /></td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}></td>
              <td className="text-right">{won(total)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  )

  if (!edit) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); void save() }}>
        <EcSlipShell title="비용내역입력" formTabs={[{ id: 'main', label: '비용내역입력' }]} activeFormTab="main"
                     actions={[
                       { label: '저장(F8)', primary: true, submit: true },
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
        <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
        <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

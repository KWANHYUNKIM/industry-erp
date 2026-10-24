import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import { api, extractErrorMessage } from '../../api/client'
import NumCheck from '../../components/NumCheck'
import ActiveToggleButton from '../../features/expensemaster/ActiveToggleButton'
import EcHistoryButton from '../../components/EcHistory'
import { activeMenuAction, type ExpenseControlType, type ExpenseItem } from '../../features/expensemaster/api'
import type { Account, EmployeeMaster } from '../../types/api'

/**
 * 회계 II › 비용관리 › 기본사항등록 › <b>비용등록</b>(원본 E060809, 제목 '비용리스트') — 2026-10-20 loginaa 실측(plans/회계2/비용관리.md 1.2).
 *
 * <ul>
 *   <li>격자: (번호 체크칸) · 비용코드 · 비용명 · 계정명 · 통제유형명 · 기간 · 인원통제 · 한도구분 · 한도금액 · 사용.
 *       통제유형이 없는 줄은 인원통제 '사용안함' · 한도구분 '총금액' · 한도금액 빈칸.</li>
 *   <li>창 '비용등록': 비용코드 · 비용명(필수) · 계정(코드도움) · 통제유형(코드도움) · 적요.
 *       <b>통제유형을 고르면</b> 통제기간(그 유형의 기간 글) · 사용인원(사원 여럿) · 개인별한도금액(placeholder '총한도금액', 처음 0) 칸이 생긴다.</li>
 * </ul>
 */
interface Form {
  id: number | null
  code: string
  name: string
  accountId: string
  controlTypeId: string
  limitAmount: string
  employeeIds: string[]
  controlFrom: string
  controlTo: string
  alertEmployeeIds: string[]
  remark: string
  active: boolean
}

const BLANK: Form = { id: null, code: '', name: '', accountId: '', controlTypeId: '', limitAmount: '0', employeeIds: [], controlFrom: '', controlTo: '', alertEmployeeIds: [], remark: '', active: true }
const won = (n: number | null) => (n == null ? '' : Number(n).toLocaleString('ko-KR'))

export default function ExpenseItemPage() {
  const [rows, setRows] = useState<ExpenseItem[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [controls, setControls] = useState<ExpenseControlType[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [showStopped, setShowStopped] = useState(false)
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [f, setF] = useState<Form>(BLANK)

  function load() {
    setError('')
    api.get<ExpenseItem[]>('/expense-items').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
    setChecked(new Set())
  }
  useEffect(() => {
    load()
    api.get<Account[]>('/accounts').then((r) => setAccounts(r.data.filter((a) => a.active))).catch(() => undefined)
    api.get<ExpenseControlType[]>('/expense-control-types').then((r) => setControls(r.data)).catch(() => undefined)
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => undefined)
  }, [])

  function openNew() { setF(BLANK); setFormError(''); setInvalid(false); setOpen(true) }
  function openEdit(i: ExpenseItem) {
    setF({
      id: i.id, code: i.code, name: i.name, accountId: i.accountId ? String(i.accountId) : '',
      controlTypeId: i.controlTypeId ? String(i.controlTypeId) : '', limitAmount: i.limitAmount != null ? String(i.limitAmount) : '0',
      employeeIds: i.employeeIds.map(String), controlFrom: i.controlFrom ?? '', controlTo: i.controlTo ?? '',
      alertEmployeeIds: i.alertEmployeeIds.map(String), remark: i.remark ?? '', active: i.active,
    })
    setFormError(''); setInvalid(false); setOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.code.trim() || !f.name.trim()) { setInvalid(true); setFormError(''); return }
    const body = {
      code: f.code.trim(), name: f.name.trim(),
      accountId: f.accountId ? Number(f.accountId) : null,
      controlTypeId: f.controlTypeId ? Number(f.controlTypeId) : null,
      limitAmount: f.controlTypeId ? Number(f.limitAmount || 0) : null,
      employeeIds: f.controlTypeId ? f.employeeIds.map(Number) : [],
      controlFrom: f.controlFrom || null, controlTo: f.controlTo || null,
      alertEmployeeIds: f.controlTypeId ? f.alertEmployeeIds.map(Number) : [],
      remark: f.remark || null,
    }
    try {
      if (f.id) await api.put(`/expense-items/${f.id}`, body)
      else await api.post('/expense-items', body)
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  const control = controls.find((c) => String(c.id) === f.controlTypeId)
  const shown = rows.filter((i) => (showStopped || i.active) && (!quick || i.code.includes(quick) || i.name.includes(quick)))
  const allChecked = shown.length > 0 && shown.every((i) => checked.has(i.id))
  const red = (bad: boolean) => (invalid && bad ? 'border-ec-danger' : '')

  return (
    <EcListShell
      title="비용리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={openNew}
      actions={[
        activeMenuAction('/expense-items', [...checked], () => setShowStopped((v) => !v), load),
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <NumCheck no="" head label="전체선택" on={allChecked} onChange={(v) => setChecked(v ? new Set(shown.map((i) => i.id)) : new Set())} />
            </th>
            <th>비용코드</th>
            <th>비용명</th>
            <th>계정명</th>
            <th>통제유형명</th>
            <th>기간</th>
            <th>인원통제</th>
            <th>한도구분</th>
            <th className="text-right">한도금액</th>
            <th>사용</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((i, n) => (
            <tr key={i.id} className={i.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <NumCheck no={n + 1} label={`${i.code} 선택`} on={checked.has(i.id)}
                          onChange={(v) => setChecked((s) => { const x = new Set(s); if (v) x.add(i.id); else x.delete(i.id); return x })} />
              </td>
              <td><button type="button" className="ec-link" onClick={() => openEdit(i)}>{i.code}</button></td>
              <td>{i.name}</td>
              <td>{i.accountName}</td>
              <td>{i.controlTypeName}</td>
              <td>{i.controlFrom ? `${i.controlFrom.replaceAll('-', '/')} ~${(i.controlTo ?? i.controlFrom).replaceAll('-', '/')}` : i.periodTypeName}</td>
              <td>{i.personControlName}</td>
              <td>{i.limitTypeName}</td>
              <td className="text-right">{won(i.limitAmount)}</td>
              <td>{i.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title={f.id ? '비용수정' : '비용등록'} width={760} onClose={() => setOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">비용코드</span>
              <div className="form">
                {f.id ? <span>{f.code}</span> : (
                  <input className={`ec-input w-[160px] ${red(!f.code.trim())}`} aria-label="비용코드" autoFocus maxLength={20}
                         value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
                )}
              </div>
            </li>
            <li className="wide">
              <span className="title">비용명</span>
              <div className="form">
                <input className={`ec-input w-full ${red(!f.name.trim())}`} aria-label="비용명" maxLength={100}
                       value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">계정</span>
              <div className="form">
                <CodePickerField label="계정" hideLabel pair popupTitle="계정검색" emptyLabel="" value={f.accountId}
                                 onChange={(v) => setF({ ...f, accountId: v })}
                                 items={accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />
              </div>
            </li>
            <li className="wide">
              <span className="title">통제유형</span>
              <div className="form">
                <CodePickerField label="통제유형" hideLabel pair popupTitle="통제유형검색" emptyLabel="" value={f.controlTypeId}
                                 onChange={(v) => {
                                   const t = controls.find((c) => String(c.id) === v)
                                   const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
                                   setF({ ...f, controlTypeId: v, controlFrom: t?.periodType === 'DESIGNATED' ? f.controlFrom || today : '',
                                     controlTo: t?.periodType === 'DESIGNATED' ? f.controlTo || today : '' })
                                 }}
                                 items={controls.filter((c) => c.active || String(c.id) === f.controlTypeId)
                                   .map((c) => ({ value: String(c.id), code: c.code, name: c.name }))} />
              </div>
            </li>
            {control && (
              <>
                <li className="wide">
                  <span className="title">통제기간</span>
                  <div className="form">
                    {control.periodType === 'DESIGNATED' ? (
                      <span className="inline-flex items-center gap-[6px]">
                        <EcDateField value={f.controlFrom} onChange={(v) => setF({ ...f, controlFrom: v })} />
                        <span>~</span>
                        <EcDateField value={f.controlTo} onChange={(v) => setF({ ...f, controlTo: v })} />
                      </span>
                    ) : <span>{control.periodTypeName}</span>}
                  </div>
                </li>
                <li className="wide">
                  <span className="title">사용인원</span>
                  <div className="form">
                    <CodePickerField label="사용인원" hideLabel multiple plain popupTitle="사원검색" emptyLabel="" width={360}
                                     values={f.employeeIds} onChangeMulti={(v) => setF({ ...f, employeeIds: v })}
                                     items={employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))} />
                  </div>
                </li>
                <li className="wide">
                  <span className="title">개인별한도금액</span>
                  <div className="form">
                    <EcNumInput className="ec-input w-[160px] text-right" aria-label="개인별한도금액" placeholder="총한도금액"
                                value={f.limitAmount} onValue={(v) => setF({ ...f, limitAmount: v })} />
                  </div>
                </li>
              </>
            )}
            {control && (
              <li className="wide">
                <span className="title">통제알림대상</span>
                <div className="form">
                  <CodePickerField label="통제알림대상" hideLabel multiple plain popupTitle="대상자선택" emptyLabel="" width={360}
                                   values={f.alertEmployeeIds} onChangeMulti={(v) => setF({ ...f, alertEmployeeIds: v })}
                                   items={employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))} />
                </div>
              </li>
            )}
            <li className="wide">
              <span className="title">적요</span>
              <div className="form">
                <textarea className="ec-input w-full h-[60px]" aria-label="적요" maxLength={500}
                          value={f.remark} onChange={(e) => setF({ ...f, remark: e.target.value })} />
              </div>
            </li>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => {
              const i = rows.find((r) => r.id === f.id)
              if (i) openEdit(i); else openNew()
            }}>다시 작성</button>
            {f.id && <ActiveToggleButton base="/expense-items" id={f.id} active={f.active} onToggled={(a) => { setF({ ...f, active: a }); load() }} onDeleted={() => { setOpen(false); load() }} />}
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
            <EcHistoryButton target="EXPENSE_ITEM" id={f.id} last />
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}

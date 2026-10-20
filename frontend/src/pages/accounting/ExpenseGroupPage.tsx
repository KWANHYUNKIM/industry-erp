import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import NumCheck from '../../features/bankcheck/components/NumCheck'
import { activeMenuAction, type ExpenseControlType, type ExpenseGroup, type ExpenseItem } from '../../features/expensemaster/api'

/**
 * 회계 II › 비용관리 › 기본사항등록 › <b>비용그룹등록</b>(원본 E060810, 제목 '비용그룹리스트') — 2026-10-20 loginaa 실측(plans/회계2/비용관리.md 1.3).
 *
 * <ul>
 *   <li>격자: (번호 체크칸) · 비용그룹코드 · 비용그룹명 · 통제유형명 · 기간 · 인원통제 · 한도구분 · 한도금액 · 사용.</li>
 *   <li>창 '비용그룹등록': 비용그룹코드(<b>다음 번호를 미리 채움</b> — 00001 · 00002 가 있으면 00003, 고칠 수 있음) · 비용그룹명 ·
 *       통제유형명(코드도움) · 비용코드(코드도움, 여럿을 꼬리표로) · 비용항목추가입력여부 ☐추가입력 · 적요.</li>
 * </ul>
 */
interface Form {
  id: number | null
  code: string
  name: string
  controlTypeId: string
  itemIds: string[]
  addInput: boolean
  remark: string
}

const BLANK: Form = { id: null, code: '', name: '', controlTypeId: '', itemIds: [], addInput: false, remark: '' }

export default function ExpenseGroupPage() {
  const [rows, setRows] = useState<ExpenseGroup[]>([])
  const [controls, setControls] = useState<ExpenseControlType[]>([])
  const [items, setItems] = useState<ExpenseItem[]>([])
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
    api.get<ExpenseGroup[]>('/expense-groups').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
    setChecked(new Set())
  }
  useEffect(() => {
    load()
    api.get<ExpenseControlType[]>('/expense-control-types').then((r) => setControls(r.data)).catch(() => undefined)
    api.get<ExpenseItem[]>('/expense-items').then((r) => setItems(r.data)).catch(() => undefined)
  }, [])

  async function openNew() {
    setFormError(''); setInvalid(false)
    let code = ''
    try { code = (await api.get<{ code: string }>('/expense-groups/next-code')).data.code } catch { /* 빈칸으로 연다 */ }
    setF({ ...BLANK, code })
    setOpen(true)
  }
  function openEdit(g: ExpenseGroup) {
    setF({
      id: g.id, code: g.code, name: g.name, controlTypeId: g.controlTypeId ? String(g.controlTypeId) : '',
      itemIds: g.items.map((i) => String(i.id)), addInput: g.addInput, remark: g.remark ?? '',
    })
    setFormError(''); setInvalid(false); setOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.code.trim() || !f.name.trim()) { setInvalid(true); setFormError(''); return }
    const body = {
      code: f.code.trim(), name: f.name.trim(),
      controlTypeId: f.controlTypeId ? Number(f.controlTypeId) : null,
      itemIds: f.itemIds.map(Number), addInput: f.addInput, remark: f.remark || null,
    }
    try {
      if (f.id) await api.put(`/expense-groups/${f.id}`, body)
      else await api.post('/expense-groups', body)
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  const shown = rows.filter((g) => (showStopped || g.active) && (!quick || g.code.includes(quick) || g.name.includes(quick)))
  const allChecked = shown.length > 0 && shown.every((g) => checked.has(g.id))
  const red = (bad: boolean) => (invalid && bad ? 'border-ec-danger' : '')

  return (
    <EcListShell
      title="비용그룹리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={() => void openNew()}
      actions={[
        activeMenuAction('/expense-groups', [...checked], () => setShowStopped((v) => !v), load),
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <NumCheck no="" head label="전체선택" on={allChecked} onChange={(v) => setChecked(v ? new Set(shown.map((g) => g.id)) : new Set())} />
            </th>
            <th>비용그룹코드</th>
            <th>비용그룹명</th>
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
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((g, n) => (
            <tr key={g.id} className={g.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <NumCheck no={n + 1} label={`${g.code} 선택`} on={checked.has(g.id)}
                          onChange={(v) => setChecked((s) => { const x = new Set(s); if (v) x.add(g.id); else x.delete(g.id); return x })} />
              </td>
              <td><button type="button" className="ec-link" onClick={() => openEdit(g)}>{g.code}</button></td>
              <td>{g.name}</td>
              <td>{g.controlTypeName}</td>
              <td>{g.periodTypeName}</td>
              <td>{g.personControlName}</td>
              <td>{g.limitTypeName}</td>
              <td className="text-right" />
              <td>{g.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title={f.id ? '비용그룹수정' : '비용그룹등록'} width={760} onClose={() => setOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">비용그룹코드</span>
              <div className="form">
                {f.id ? <span>{f.code}</span> : (
                  <input className={`ec-input w-[160px] ${red(!f.code.trim())}`} aria-label="비용그룹코드" maxLength={20}
                         value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
                )}
              </div>
            </li>
            <li className="wide">
              <span className="title">비용그룹명</span>
              <div className="form">
                <input className={`ec-input w-full ${red(!f.name.trim())}`} aria-label="비용그룹명" autoFocus maxLength={100}
                       value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">통제유형명</span>
              <div className="form">
                <CodePickerField label="통제유형" hideLabel pair popupTitle="통제유형검색" emptyLabel="" value={f.controlTypeId}
                                 onChange={(v) => setF({ ...f, controlTypeId: v })}
                                 items={controls.filter((c) => c.active || String(c.id) === f.controlTypeId)
                                   .map((c) => ({ value: String(c.id), code: c.code, name: c.name }))} />
              </div>
            </li>
            <li className="wide">
              <span className="title">비용코드</span>
              <div className="form">
                <CodePickerField label="비용" hideLabel multiple popupTitle="비용검색" emptyLabel="" width={360}
                                 values={f.itemIds} onChangeMulti={(v) => setF({ ...f, itemIds: v })}
                                 items={items.filter((i) => i.active || f.itemIds.includes(String(i.id)))
                                   .map((i) => ({ value: String(i.id), code: i.code, name: i.name }))} />
              </div>
            </li>
            <li className="wide">
              <span className="title">비용항목추가입력여부</span>
              <div className="form">
                <label><input type="checkbox" checked={f.addInput} onChange={(e) => setF({ ...f, addInput: e.target.checked })} /> 추가입력</label>
              </div>
            </li>
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
              const g = rows.find((r) => r.id === f.id)
              if (g) openEdit(g); else void openNew()
            }}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}

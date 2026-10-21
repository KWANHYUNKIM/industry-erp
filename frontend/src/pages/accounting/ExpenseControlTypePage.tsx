import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import NumCheck from '../../components/NumCheck'
import ActiveToggleButton from '../../features/expensemaster/ActiveToggleButton'
import EcHistoryButton from '../../components/EcHistory'
import {
  activeMenuAction, LIMIT_TYPES, NOTICE_TYPES, PERIOD_TYPES,
  type ExpenseControlType, type ExpenseLimitType, type ExpenseNoticeType, type ExpensePeriodType,
} from '../../features/expensemaster/api'

/**
 * 회계 II › 비용관리 › 기본사항등록 › <b>통제유형등록</b>(원본 E060808, 제목 '통제유형리스트') — 2026-10-20 loginaa 실측(plans/회계2/비용관리.md 1.1).
 *
 * <ul>
 *   <li>격자: (번호 체크칸) · 통제유형코드 · 통제유형명 · 기간 · 인원통제 · 한도구분 · 통제알림방식 · 사용. 하단 신규(F2) · 사용중단/재사용 ▴ · Excel.</li>
 *   <li>창 '통제유형등록': 코드 · 이름(필수, 비우면 빨간 테두리 — 글 알림 없음) · 기간 ▾(지정기간 기본) · 인원통제(사용) ·
 *       한도구분(개인별(동일금액)) · 통제알림방식(경고 및 알림) · 적요. 수정 창은 '통제유형수정', 코드는 글자로 막힌다.</li>
 * </ul>
 */
interface Form {
  id: number | null
  code: string
  name: string
  periodType: ExpensePeriodType
  personControl: boolean
  limitType: ExpenseLimitType
  noticeType: ExpenseNoticeType
  remark: string
  active: boolean
}

const BLANK: Form = {
  id: null, code: '', name: '', periodType: 'DESIGNATED', personControl: true,
  limitType: 'PERSONAL_SAME', noticeType: 'WARN', remark: '', active: true,
}

export default function ExpenseControlTypePage() {
  const [rows, setRows] = useState<ExpenseControlType[]>([])
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
    api.get<ExpenseControlType[]>('/expense-control-types').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
    setChecked(new Set())
  }
  useEffect(() => { load() }, [])

  function openNew() { setF(BLANK); setFormError(''); setInvalid(false); setOpen(true) }
  function openEdit(t: ExpenseControlType) {
    setF({
      id: t.id, code: t.code, name: t.name, periodType: t.periodType, personControl: t.personControl,
      limitType: t.limitType, noticeType: t.noticeType, remark: t.remark ?? '', active: t.active,
    })
    setFormError(''); setInvalid(false); setOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.code.trim() || !f.name.trim()) { setInvalid(true); setFormError(''); return }
    const body = {
      code: f.code.trim(), name: f.name.trim(), periodType: f.periodType, personControl: f.personControl,
      limitType: f.limitType, noticeType: f.noticeType, remark: f.remark || null, active: f.active,
    }
    try {
      if (f.id) await api.put(`/expense-control-types/${f.id}`, body)
      else await api.post('/expense-control-types', body)
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  const shown = rows.filter((t) => (showStopped || t.active) && (!quick || t.code.includes(quick) || t.name.includes(quick)))
  const allChecked = shown.length > 0 && shown.every((t) => checked.has(t.id))
  const red = (bad: boolean) => (invalid && bad ? 'border-ec-danger' : '')

  return (
    <EcListShell
      title="통제유형리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={openNew}
      actions={[
        activeMenuAction('/expense-control-types', [...checked], () => setShowStopped((v) => !v), load),
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <NumCheck no="" head label="전체선택" on={allChecked} onChange={(v) => setChecked(v ? new Set(shown.map((t) => t.id)) : new Set())} />
            </th>
            <th>통제유형코드</th>
            <th>통제유형명</th>
            <th>기간</th>
            <th>인원통제</th>
            <th>한도구분</th>
            <th>통제알림방식</th>
            <th>사용</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((t, n) => (
            <tr key={t.id} className={t.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <NumCheck no={n + 1} label={`${t.code} 선택`} on={checked.has(t.id)}
                          onChange={(v) => setChecked((s) => { const x = new Set(s); if (v) x.add(t.id); else x.delete(t.id); return x })} />
              </td>
              <td><button type="button" className="ec-link" onClick={() => openEdit(t)}>{t.code}</button></td>
              <td>{t.name}</td>
              <td>{t.periodTypeName}</td>
              <td>{t.personControl ? '사용' : '사용안함'}</td>
              <td>{t.limitTypeName}</td>
              <td>{t.noticeTypeName}</td>
              <td>{t.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title={f.id ? '통제유형수정' : '통제유형등록'} width={760} onClose={() => setOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">통제유형코드</span>
              <div className="form">
                {f.id ? <span>{f.code}</span> : (
                  <input className={`ec-input w-[160px] ${red(!f.code.trim())}`} aria-label="통제유형코드" autoFocus maxLength={20}
                         value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
                )}
              </div>
            </li>
            <li className="wide">
              <span className="title">통제유형명</span>
              <div className="form">
                <input className={`ec-input w-full ${red(!f.name.trim())}`} aria-label="통제유형명" maxLength={100}
                       value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">기간</span>
              <div className="form">
                <select className="ec-input w-[160px]" aria-label="기간" value={f.periodType}
                        onChange={(e) => setF({ ...f, periodType: e.target.value as ExpensePeriodType })}>
                  {PERIOD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </li>
            <li className="wide">
              <span className="title">인원통제</span>
              <div className="form flex gap-[12px]">
                <label><input type="radio" name="personControl" checked={f.personControl} onChange={() => setF({ ...f, personControl: true })} /> 사용</label>
                <label><input type="radio" name="personControl" checked={!f.personControl} onChange={() => setF({ ...f, personControl: false })} /> 사용안함</label>
              </div>
            </li>
            <li className="wide">
              <span className="title">한도구분</span>
              <div className="form flex gap-[12px]">
                {LIMIT_TYPES.map(([v, l]) => (
                  <label key={v}><input type="radio" name="limitType" checked={f.limitType === v} onChange={() => setF({ ...f, limitType: v })} /> {l}</label>
                ))}
              </div>
            </li>
            <li className="wide">
              <span className="title">통제알림방식</span>
              <div className="form flex gap-[12px]">
                {NOTICE_TYPES.map(([v, l]) => (
                  <label key={v}><input type="radio" name="noticeType" checked={f.noticeType === v} onChange={() => setF({ ...f, noticeType: v })} /> {l}</label>
                ))}
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
              const t = rows.find((r) => r.id === f.id)
              if (t) openEdit(t); else openNew()
            }}>다시 작성</button>
            {f.id && <ActiveToggleButton base="/expense-control-types" id={f.id} active={f.active} onToggled={(a) => { setF({ ...f, active: a }); load() }} onDeleted={() => { setOpen(false); load() }} />}
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
            <EcHistoryButton target="EXPENSE_CONTROL_TYPE" id={f.id} />
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}

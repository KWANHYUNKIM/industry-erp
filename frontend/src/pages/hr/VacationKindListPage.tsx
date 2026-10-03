import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'

interface Vacation { id: number; code: string; name: string; periodFrom: string; periodTo: string; carryOver: boolean; carryFromId: number | null; remark: string | null; active: boolean }
interface Form { code: string; name: string; periodFrom: string; periodTo: string; carryOver: boolean; carryFromId: string; remark: string }
const year = new Date().getFullYear()
const blankForm = (): Form => ({ code: '', name: '', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31`, carryOver: false, carryFromId: '', remark: '' })
const slash = (s: string) => s.replace(/-/g, '/')

/**
 * 관리 &gt; 근태관리 &gt; 기본사항등록 &gt; <b>휴가항목등록</b> (원본 E020702).
 *
 * <p>2026-10-03 loginaa 에서 등록 · 삭제해 본 그대로:
 * <ul>
 *   <li>격자 휴가코드 · 휴가명 · 사용기간(2026/01/01 ~ 2026/12/31) · 사용, 사용기간이 늦은 것이 위.
 *       버튼 신규(F2) · 사용중단/재사용 ▲(사용중단 · 삭제 · 재사용) · Excel.</li>
 *   <li>[신규(F2)] '휴가항목등록' 창: 휴가코드(다음 번호 20195 미리 채움) · 휴가명 · 기간(올해 1/1 ~ 12/31) ·
 *       이월 잔여일수 자동계산(사용 · 사용안함 — 기본 사용안함) · 적요. 저장하면 안내 없이 목록 맨 위. 삭제는 '삭제하시겠습니까?'.</li>
 * </ul>
 * 근태항목등록에서 근태유형이 '휴가' 인 항목이 이 휴가코드를 가리킨다(가리키는 휴가항목은 서버가 삭제를 막는다).
 * 이월 잔여일수 자동계산은 값만 담는다 — 휴가잔여일수현황이 아직 이 항목 단위로 셈하지 않는다.
 */
export default function VacationKindListPage() {
  const [rows, setRows] = useState<Vacation[]>([])
  const [error, setError] = useState('')
  const [quick, setQuick] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(blankForm())
  const tableRef = useRef<HTMLTableElement>(null)

  function load() {
    setError('')
    api.get<Vacation[]>('/hr/vacation-kinds').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => (includeInactive || r.active) && (!quick || r.code.includes(quick) || r.name.includes(quick)))
  useTableColumnCheck(tableRef, '휴가항목등록', [shown.length])
  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id))

  async function openNew() {
    setEditId(null); setForm(blankForm()); setFormError(''); setOpen(true)
    try {
      const r = await api.get<{ code: string }>('/hr/vacation-kinds/next-code')
      setForm((f) => (f.code ? f : { ...f, code: r.data.code }))
    } catch { /* 비우면 서버가 매긴다 */ }
  }
  function openEdit(v: Vacation) {
    setEditId(v.id); setFormError('')
    setForm({ code: v.code, name: v.name, periodFrom: v.periodFrom, periodTo: v.periodTo, carryOver: v.carryOver, carryFromId: v.carryFromId ? String(v.carryFromId) : '', remark: v.remark ?? '' })
    setOpen(true)
  }

  async function save() {
    if (!form.name.trim()) { setFormError('휴가명을 입력 바랍니다.'); return }
    const body = { ...form, code: form.code.trim() || null, carryFromId: form.carryOver && form.carryFromId ? Number(form.carryFromId) : null }
    try {
      if (editId) await api.put(`/hr/vacation-kinds/${editId}`, { ...body, active: rows.find((r) => r.id === editId)?.active ?? true })
      else await api.post('/hr/vacation-kinds', body)
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function applyToChecked(op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false)
    if (op === '삭제' && !window.confirm('삭제하시겠습니까?')) return
    try {
      for (const v of rows.filter((x) => checked.has(x.id))) {
        if (op === '삭제') await api.delete(`/hr/vacation-kinds/${v.id}`)
        else await api.put(`/hr/vacation-kinds/${v.id}`, {
          code: v.code, name: v.name, periodFrom: v.periodFrom, periodTo: v.periodTo, carryOver: v.carryOver, carryFromId: v.carryFromId, remark: v.remark, active: op === '재사용',
        })
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  return (
    <EcListShell
      title="휴가항목등록"
      search={quick}
      onSearchChange={setQuick}
      onSearch={load}
      onNew={openNew}
      actions={[
        { label: '사용중단/재사용 ▲', onClick: () => setMenuOpen((v) => !v), disabled: checked.size === 0 },
        { label: includeInactive ? '사용중단제외' : '사용중단포함', onClick: () => setIncludeInactive((v) => !v) },
        { label: 'Excel' },
      ]}
    >
      {menuOpen && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
          <div className="ec-menu fixed top-auto right-auto bottom-[44px] left-[300px] mobile:left-[16px]">
            {(['사용중단', '삭제', '재사용'] as const).map((op) => (
              <button key={op} type="button" onClick={() => applyToChecked(op)}>{op}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
            <th>휴가코드</th>
            <th>휴가명</th>
            <th className="text-center">사용기간</th>
            <th className="text-center">사용</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id} className={r.active ? undefined : 'text-ec-hint'}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)}
                       onChange={() => { const n = new Set(checked); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setChecked(n) }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.name}</a></td>
              <td className="text-center">{slash(r.periodFrom)} ~ {slash(r.periodTo)}</td>
              <td className="text-center">{r.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title="휴가항목등록" width={720} onClose={() => setOpen(false)}>
        <ul className="ec-form">
          <li className="wide">
            <span className="title">휴가코드</span>
            <div className="form">
              {editId ? <span>{form.code}</span> : <input className="ec-input w-full" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />}
            </div>
          </li>
          <li className="wide">
            <span className="title">휴가명</span>
            <div className="form"><input className="ec-input w-full" placeholder="휴가명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </li>
          <li className="wide">
            <span className="title">기간</span>
            <div className="form flex items-center gap-[6px]">
              <input type="date" className="ec-input w-[150px]" value={form.periodFrom} onChange={(e) => setForm({ ...form, periodFrom: e.target.value })} />
              ~
              <input type="date" className="ec-input w-[150px]" value={form.periodTo} onChange={(e) => setForm({ ...form, periodTo: e.target.value })} />
            </div>
          </li>
          <li className="wide">
            <span className="title">이월 잔여일수 자동계산</span>
            <div className="form flex items-center gap-[12px]">
              {([[true, '사용'], [false, '사용안함']] as const).map(([v, l]) => (
                <label key={l} className="inline-flex items-center gap-[4px]">
                  <input type="radio" name="vk-carry" checked={form.carryOver === v} onChange={() => setForm({ ...form, carryOver: v })} /> {l}
                </label>
              ))}
            </div>
          </li>
          {/* 원본(2026-10-04 실측): [사용]을 고르면 아래에 [이월 휴가코드] 코드도움이 나온다 — 사원별휴가일수입력에서 사번을 넣으면
              그 휴가항목의 잔여일수가 이월 잔여일수로 찬다. */}
          {form.carryOver && (
            <li className="wide">
              <span className="title">이월 휴가코드</span>
              <div className="form">
                <CodePickerField label="이월 휴가코드" hideLabel fill placeholder="이월 휴가코드" value={form.carryFromId}
                                 onChange={(v) => setForm({ ...form, carryFromId: v })}
                                 items={rows.filter((r) => r.id !== editId).map((r) => ({ value: String(r.id), code: r.code, name: r.name }))} />
              </div>
            </li>
          )}
          <li className="wide">
            <span className="title">적요</span>
            <div className="form"><textarea className="ec-input w-full h-[48px]" placeholder="적요" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></div>
          </li>
        </ul>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => { const v = rows.find((x) => x.id === editId); if (v) openEdit(v); else setForm({ ...blankForm(), code: form.code }) }}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}

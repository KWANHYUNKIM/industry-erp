import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { useTableSort } from '../../utils/useTableSort'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'

type KindType = 'BASIC' | 'VACATION' | 'COMMUTE'
interface Kind { id: number; code: string; name: string; kindGroup: string | null; type: KindType; typeName: string; vacationKindId: number | null; hourUnit: boolean; remark: string | null; active: boolean }
interface Vacation { id: number; code: string; name: string; active: boolean }
interface Form { code: string; name: string; kindGroup: string; type: KindType; vacationKindId: string; hourUnit: boolean; remark: string }
const blankForm = (): Form => ({ code: '', name: '', kindGroup: '', type: 'BASIC', vacationKindId: '', hourUnit: false, remark: '' })
const TYPES: [KindType, string][] = [['BASIC', '기본'], ['VACATION', '휴가'], ['COMMUTE', '출/퇴근']]

/**
 * 관리 &gt; 근태관리 &gt; 기본사항등록 &gt; <b>근태항목등록</b> (원본 E020701).
 *
 * <p>2026-10-03 loginaa 에서 등록 · 삭제해 본 그대로:
 * <ul>
 *   <li>격자 근태코드 · 근태명칭 · 근태그룹 · 근태유형 · 사용 · 적요(근태코드 차례). 버튼 신규(F2) · 사용중단/재사용 ▲(사용중단 · 삭제 · 재사용) · Excel.</li>
 *   <li>[신규(F2)] '근태항목등록' 창: 근태코드(다음 번호 30013 미리 채움) · 근태명칭 · 근태그룹 · 근태유형(기본 · 휴가 · 출/퇴근) ·
 *       계산단위(일 · 시간) · 적요. 저장하면 안내 없이 목록에 붙는다. 삭제는 '삭제하시겠습니까?'.</li>
 * </ul>
 * 근태입력의 [근태항목]이 이 목록(사용 중인 것)에서 고른다. 근태유형이 '휴가' 면 원본처럼 [휴가코드](휴가항목등록)가 나타나고
 * 비면 '휴가코드를 입력 바랍니다.' 로 막힌다. 연차에서 빼는 것은 여전히 이름이 연차 · 반차인 항목이다. 근태그룹은 글자로 적는다(코드도움 아님).
 */
export default function AttendanceKindListPage() {
  const [rows, setRows] = useState<Kind[]>([])
  const [vacations, setVacations] = useState<Vacation[]>([])
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
    api.get<Kind[]>('/hr/attendance-kinds').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    load()
    api.get<Vacation[]>('/hr/vacation-kinds').then((r) => setVacations(r.data)).catch(() => setVacations([]))
  }, [])

  const filtered = rows.filter((r) => (includeInactive || r.active) && (!quick || r.code.includes(quick) || r.name.includes(quick)))
  const sort = useTableSort(filtered, {
    근태코드: (r) => r.code, 근태명칭: (r) => r.name, 근태그룹: (r) => r.kindGroup ?? '', 근태유형: (r) => r.typeName, 사용: (r) => (r.active ? 'Yes' : 'No'),
  })
  const shown = sort.sorted
  useTableColumnCheck(tableRef, '근태항목등록', [shown.length])
  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id))

  async function openNew() {
    setEditId(null); setForm(blankForm()); setFormError(''); setOpen(true)
    try {
      const r = await api.get<{ code: string }>('/hr/attendance-kinds/next-code')
      setForm((f) => (f.code ? f : { ...f, code: r.data.code }))
    } catch { /* 비우면 서버가 매긴다 */ }
  }
  function openEdit(k: Kind) {
    setEditId(k.id); setFormError('')
    setForm({ code: k.code, name: k.name, kindGroup: k.kindGroup ?? '', type: k.type, vacationKindId: k.vacationKindId ? String(k.vacationKindId) : '', hourUnit: k.hourUnit, remark: k.remark ?? '' })
    setOpen(true)
  }

  async function save() {
    if (!form.name.trim()) { setFormError('근태명칭을 입력 바랍니다.'); return }
    if (form.type === 'VACATION' && !form.vacationKindId) { setFormError('휴가코드를 입력 바랍니다.'); return }
    const body = { ...form, code: form.code.trim() || null, vacationKindId: form.type === 'VACATION' ? Number(form.vacationKindId) : null }
    try {
      if (editId) await api.put(`/hr/attendance-kinds/${editId}`, { ...body, active: rows.find((r) => r.id === editId)?.active ?? true })
      else await api.post('/hr/attendance-kinds', body)
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
      for (const k of rows.filter((x) => checked.has(x.id))) {
        if (op === '삭제') await api.delete(`/hr/attendance-kinds/${k.id}`)
        else await api.put(`/hr/attendance-kinds/${k.id}`, {
          code: k.code, name: k.name, kindGroup: k.kindGroup, type: k.type, vacationKindId: k.vacationKindId, hourUnit: k.hourUnit, remark: k.remark, active: op === '재사용',
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
      title="근태항목등록"
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
            <th className="cursor-pointer" onClick={() => sort.toggle('근태코드')}>근태코드 {sort.mark('근태코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('근태명칭')}>근태명칭 {sort.mark('근태명칭')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('근태그룹')}>근태그룹 {sort.mark('근태그룹')}</th>
            <th className="text-center cursor-pointer" onClick={() => sort.toggle('근태유형')}>근태유형 {sort.mark('근태유형')}</th>
            <th className="text-center cursor-pointer" onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id} className={r.active ? undefined : 'text-ec-hint'}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)}
                       onChange={() => { const n = new Set(checked); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setChecked(n) }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.name}</a></td>
              <td>{r.kindGroup ?? ''}</td>
              <td className="text-center">{r.typeName}</td>
              <td className="text-center">{r.active ? 'Yes' : 'No'}</td>
              <td>{r.remark ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title="근태항목등록" width={720} onClose={() => setOpen(false)}>
        <ul className="ec-form">
          <li className="wide">
            <span className="title">근태코드</span>
            <div className="form">
              {editId ? <span>{form.code}</span> : <input className="ec-input w-full" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />}
            </div>
          </li>
          <li className="wide">
            <span className="title">근태명칭</span>
            <div className="form"><input className="ec-input w-full" placeholder="근태명칭" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </li>
          <li className="wide">
            <span className="title">근태그룹</span>
            <div className="form"><input className="ec-input w-full" placeholder="근태그룹" value={form.kindGroup} onChange={(e) => setForm({ ...form, kindGroup: e.target.value })} /></div>
          </li>
          <li className="wide">
            <span className="title">근태유형</span>
            <div className="form flex items-center gap-[12px]">
              {TYPES.map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-[4px]">
                  <input type="radio" name="ak-type" checked={form.type === v} onChange={() => setForm({ ...form, type: v })} /> {l}
                </label>
              ))}
            </div>
          </li>
          {form.type === 'VACATION' && (
            <li className="wide">
              <span className="title">휴가코드</span>
              <div className="form">
                <CodePickerField label="휴가코드" hideLabel fill placeholder="휴가코드" emptyLabel="선택 해제"
                                 value={form.vacationKindId} onChange={(v) => setForm({ ...form, vacationKindId: v })}
                                 items={vacations.filter((x) => x.active).map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
              </div>
            </li>
          )}
          <li className="wide">
            <span className="title">계산단위</span>
            <div className="form flex items-center gap-[12px]">
              {([[false, '일'], [true, '시간']] as const).map(([v, l]) => (
                <label key={l} className="inline-flex items-center gap-[4px]">
                  <input type="radio" name="ak-unit" checked={form.hourUnit === v} onChange={() => setForm({ ...form, hourUnit: v })} /> {l}
                </label>
              ))}
            </div>
          </li>
          <li className="wide">
            <span className="title">적요</span>
            <div className="form"><textarea className="ec-input w-full h-[48px]" placeholder="적요" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></div>
          </li>
        </ul>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => { const k = rows.find((x) => x.id === editId); if (k) openEdit(k); else setForm({ ...blankForm(), code: form.code }) }}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}

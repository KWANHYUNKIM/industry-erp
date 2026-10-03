import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'

type Method = 'WORK_TIME' | 'LATE' | 'EARLY_LEAVE' | 'FORMULA'
interface Rule {
  id: number; code: string; name: string; hourUnit: boolean; method: Method; methodName: string; directBasis: boolean; basisName: string
  minHours: number | null; minMinutes: number | null
  ex1From: string | null; ex1To: string | null; ex2From: string | null; ex2To: string | null; ex3From: string | null; ex3To: string | null
  remark: string | null; active: boolean
}
type SlotKey = 'ex1From' | 'ex1To' | 'ex2From' | 'ex2To' | 'ex3From' | 'ex3To'
interface Form {
  code: string; name: string; hourUnit: boolean; method: Method; directBasis: boolean; minHours: string; minMinutes: string
  ex1From: string; ex1To: string; ex2From: string; ex2To: string; ex3From: string; ex3To: string; remark: string
}
const blankForm = (): Form => ({
  code: '', name: '', hourUnit: false, method: 'WORK_TIME', directBasis: false, minHours: '', minMinutes: '',
  ex1From: '', ex1To: '', ex2From: '', ex2To: '', ex3From: '', ex3To: '', remark: '',
})
const METHODS: [Method, string][] = [['WORK_TIME', '근무/추가근무시간'], ['LATE', '지각'], ['EARLY_LEAVE', '조퇴'], ['FORMULA', '계산식']]
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
/** 'D|HH:MM' — D 0 당일 · 1 익일 */
const split = (v: string) => { const [d, t] = (v || '0|').split('|'); const [h, m] = (t || '').split(':'); return { d: d || '0', h: h ?? '', m: m ?? '' } }
const join = (d: string, h: string, m: string) => (h === '' ? '' : `${d}|${h}:${m || '00'}`)

/**
 * 관리 &gt; 근태관리 &gt; 출/퇴근(사원) &gt; <b>출/퇴근반영기준</b> (원본 E020725).
 *
 * <p>2026-10-03 loginaa 실측(원본 회사는 등록된 것이 없어 창만 열어 봤다): 격자 반영기준코드 · 반영기준명 · 반영방식 · 적용기준 ·
 * 적요 · 사용, 빈 목록 '등록된 데이터가 없습니다.'. 버튼 신규(F2) · 사용중단/재사용 ▲ · Excel.
 * [신규(F2)] 창: 반영기준코드(빈 칸 — 직접 적는다) · 반영기준명 · 계산단위(일 · 시간) · 반영방식(근무/추가근무시간 · 지각 · 조퇴 · 계산식) ·
 * 적용기준(근무시간설정기준 · 직접설정) · 최소시간(시간 · 분) · 제외시간1~3(당일/익일 시:분 ~ 당일/익일 시:분) · 적요.
 * <b>규칙은 담아 두기만 한다</b> — 출퇴근 기록을 근태로 옮기는 셈은 아직 이 규칙을 읽지 않는다. 계산식 편집도 없다.
 */
export default function CommuteRuleListPage() {
  const [rows, setRows] = useState<Rule[]>([])
  const [error, setError] = useState('')
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
    api.get<Rule[]>('/hr/commute-rules').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => includeInactive || r.active)
  useTableColumnCheck(tableRef, '출/퇴근반영기준', [shown.length])
  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id))
  const str = (v: unknown) => (v == null ? '' : String(v))

  function openEdit(r: Rule) {
    setEditId(r.id); setFormError('')
    setForm({
      code: r.code, name: r.name, hourUnit: r.hourUnit, method: r.method, directBasis: r.directBasis,
      minHours: str(r.minHours), minMinutes: str(r.minMinutes),
      ex1From: str(r.ex1From), ex1To: str(r.ex1To), ex2From: str(r.ex2From), ex2To: str(r.ex2To), ex3From: str(r.ex3From), ex3To: str(r.ex3To),
      remark: str(r.remark),
    })
    setOpen(true)
  }
  const bodyOf = (f: Form, active?: boolean) => ({
    ...f, minHours: f.minHours === '' ? null : Number(f.minHours), minMinutes: f.minMinutes === '' ? null : Number(f.minMinutes), active,
  })

  async function save() {
    if (!form.code.trim()) { setFormError('반영기준코드를 입력 바랍니다.'); return }
    if (!form.name.trim()) { setFormError('반영기준명을 입력 바랍니다.'); return }
    try {
      if (editId) await api.put(`/hr/commute-rules/${editId}`, bodyOf(form, rows.find((r) => r.id === editId)?.active ?? true))
      else await api.post('/hr/commute-rules', bodyOf(form))
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
      for (const r of rows.filter((x) => checked.has(x.id))) {
        if (op === '삭제') await api.delete(`/hr/commute-rules/${r.id}`)
        else await api.put(`/hr/commute-rules/${r.id}`, { ...r, active: op === '재사용' })
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const slot = (fromKey: SlotKey, toKey: SlotKey, label: string) => {
    const part = (key: SlotKey) => {
      const v = split(form[key])
      const upd = (d: string, h: string, m: string) => setForm((f) => ({ ...f, [key]: join(d, h, m) }))
      return (
        <span className="inline-flex items-center gap-[4px]">
          <select className="ec-input w-[70px]" value={v.d} onChange={(e) => upd(e.target.value, v.h, v.m)}>
            <option value="0">당일</option><option value="1">익일</option>
          </select>
          <select className="ec-input w-[70px]" value={v.h} onChange={(e) => upd(v.d, e.target.value, v.m)}>
            <option value="">=====</option>
            {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <select className="ec-input w-[64px]" value={v.m} onChange={(e) => upd(v.d, v.h, e.target.value)}>
            {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </span>
      )
    }
    return (
      <li className="wide">
        <span className="title">{label}</span>
        <div className="form flex flex-wrap items-center gap-[6px]">{part(fromKey)} ~ {part(toKey)}</div>
      </li>
    )
  }

  return (
    <EcListShell
      title="출/퇴근반영기준"
      searchable={false}
      onNew={() => { setEditId(null); setForm(blankForm()); setFormError(''); setOpen(true) }}
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
            <th>반영기준코드</th>
            <th>반영기준명</th>
            <th>반영방식</th>
            <th>적용기준</th>
            <th>적요</th>
            <th className="text-center">사용</th>
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
              <td>{r.methodName}</td>
              <td>{r.basisName}</td>
              <td>{r.remark ?? ''}</td>
              <td className="text-center">{r.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title="출/퇴근반영기준" width={820} onClose={() => setOpen(false)}>
        <ul className="ec-form">
          <li className="wide">
            <span className="title">반영기준코드</span>
            <div className="form">
              {editId ? <span>{form.code}</span> : <input className="ec-input w-full" placeholder="반영기준코드" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />}
            </div>
          </li>
          <li className="wide">
            <span className="title">반영기준명</span>
            <div className="form"><input className="ec-input w-full" placeholder="반영기준명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </li>
          <li className="wide">
            <span className="title">계산단위</span>
            <div className="form flex items-center gap-[12px]">
              {([[false, '일'], [true, '시간']] as const).map(([v, l]) => (
                <label key={l} className="inline-flex items-center gap-[4px]">
                  <input type="radio" name="cr-unit" checked={form.hourUnit === v} onChange={() => setForm({ ...form, hourUnit: v })} /> {l}
                </label>
              ))}
            </div>
          </li>
          <li className="wide">
            <span className="title">반영방식</span>
            <div className="form">
              <div className="flex flex-wrap items-center gap-[12px] mb-[4px]">
                {METHODS.map(([v, l]) => (
                  <label key={v} className="inline-flex items-center gap-[4px]">
                    <input type="radio" name="cr-method" checked={form.method === v} onChange={() => setForm({ ...form, method: v })} /> {l}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-[12px]">
                <span className="text-ec-hint">적용기준</span>
                {([[false, '근무시간설정기준'], [true, '직접설정']] as const).map(([v, l]) => (
                  <label key={l} className="inline-flex items-center gap-[4px]">
                    <input type="radio" name="cr-basis" checked={form.directBasis === v} onChange={() => setForm({ ...form, directBasis: v })} /> {l}
                  </label>
                ))}
              </div>
            </div>
          </li>
          <li className="wide">
            <span className="title">최소시간</span>
            <div className="form flex items-center gap-[6px]">
              <select className="ec-input w-[90px]" value={form.minHours} onChange={(e) => setForm({ ...form, minHours: e.target.value })}>
                <option value="">=====</option>
                {HOURS.map((h) => <option key={h} value={String(Number(h))}>{h}</option>)}
              </select> 시간 ~
              <select className="ec-input w-[90px]" value={form.minMinutes} onChange={(e) => setForm({ ...form, minMinutes: e.target.value })}>
                <option value="">=====</option>
                {MINUTES.map((m) => <option key={m} value={String(Number(m))}>{m}</option>)}
              </select> 분
            </div>
          </li>
          {slot('ex1From', 'ex1To', '제외시간1')}
          {slot('ex2From', 'ex2To', '제외시간2')}
          {slot('ex3From', 'ex3To', '제외시간3')}
          <li className="wide">
            <span className="title">적요</span>
            <div className="form"><textarea className="ec-input w-full h-[48px]" placeholder="적요" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></div>
          </li>
        </ul>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => { const r = rows.find((x) => x.id === editId); if (r) openEdit(r); else setForm(blankForm()) }}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}

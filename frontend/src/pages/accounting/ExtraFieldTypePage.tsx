import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import NumCheck from '../../components/NumCheck'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { ecAlert, NO_SELECTION_MESSAGE } from '../../components/EcDialog'
import { activeMenuAction } from '../../features/expensemaster/api'

/**
 * 회계 I › 기초등록 › <b>추가항목유형등록</b>(원본 E010118, 제목 '추가항목유형리스트') — 2026-10-13 loginaa 실측(plans/회계1/E010118.md).
 *
 * 격자: (번호 체크칸) · 유형코드 · 유형명 · 추가항목설정(줄마다 단추) · 계정설정(줄마다 단추). 하단 신규(F2) · 추가항목등록 · 사용중단/재사용 ▴.
 * 창: 추가항목유형등록(코드 · 이름) · 추가항목설정(항목명 | 사용여부 | 필수항목 | 기본값설정) · 계정설정(계정코드 | 계정명, 추가 · 선택삭제) · 추가항목등록(회사 공용 8칸).
 */
interface TypeRow { id: number; code: string; name: string; active: boolean; updatedAt: string }
interface SlotRow { no: number; name: string; kind: string; enabled: boolean; required: boolean; defaultValue: string | null }
interface AccRow { id: number; accountId: number; accountCode: string; accountName: string }
interface CompanySlot { no: number; name: string; kind: string; setting: string }
interface AccountOpt { id: number; code: string; name: string; active: boolean }

export default function ExtraFieldTypePage() {
  const [rows, setRows] = useState<TypeRow[]>([])
  const [accIds, setAccIds] = useState<Record<string, number[]>>({})
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [showStopped, setShowStopped] = useState(false)
  const [cond, setCond] = useState({ code: '', name: '', account: '', use: 'Y', byDate: false })
  const [applied, setApplied] = useState(cond)

  // 신규 · 수정 창
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [f, setF] = useState<{ id: number | null; code: string; name: string }>({ id: null, code: '', name: '' })
  // 추가항목설정 창
  const [slotType, setSlotType] = useState<TypeRow | null>(null)
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [slotError, setSlotError] = useState('')
  // 계정설정 창
  const [accType, setAccType] = useState<TypeRow | null>(null)
  const [accRows, setAccRows] = useState<AccRow[]>([])
  const [accChecked, setAccChecked] = useState<Set<number>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [addChecked, setAddChecked] = useState<Set<number>>(new Set())
  const [accError, setAccError] = useState('')
  // 추가항목등록 창
  const [companyOpen, setCompanyOpen] = useState(false)
  const [company, setCompany] = useState<CompanySlot[]>([])

  function load() {
    setError('')
    api.get<TypeRow[]>('/extra-field-types').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
    api.get<Record<string, number[]>>('/extra-field-types/account-ids').then((r) => setAccIds(r.data)).catch(() => undefined)
    setChecked(new Set())
  }
  useEffect(() => {
    load()
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => undefined)
  }, [])

  function nextCode() {
    const nums = rows.map((r) => Number(r.code)).filter((n) => Number.isFinite(n))
    return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(5, '0')
  }
  function openNew() { setF({ id: null, code: nextCode(), name: '' }); setFormError(''); setInvalid(false); setOpen(true) }
  function openEdit(t: TypeRow) { setF({ id: t.id, code: t.code, name: t.name }); setFormError(''); setInvalid(false); setOpen(true) }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.code.trim() || !f.name.trim()) { setInvalid(true); setFormError(''); return }
    try {
      const body = { code: f.code.trim(), name: f.name.trim() }
      if (f.id) await api.put(`/extra-field-types/${f.id}`, body)
      else await api.post('/extra-field-types', body)
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function openSlots(t: TypeRow) {
    setSlotType(t); setSlotError('')
    try { setSlots((await api.get<SlotRow[]>(`/extra-field-types/${t.id}/slots`)).data) } catch (e) { setSlotError(extractErrorMessage(e)) }
  }
  async function saveSlots() {
    if (!slotType) return
    try {
      const body = slots.map((s) => ({ no: s.no, enabled: s.enabled, required: s.required, defaultValue: s.defaultValue ?? '' }))
      setSlots((await api.put<SlotRow[]>(`/extra-field-types/${slotType.id}/slots`, body)).data)
      setSlotType(null)
    } catch (e) { setSlotError(extractErrorMessage(e)) }
  }
  const patchSlot = (no: number, p: Partial<SlotRow>) => setSlots((s) => s.map((x) => (x.no === no ? { ...x, ...p } : x)))

  async function openAccounts(t: TypeRow) {
    setAccType(t); setAccError(''); setAccChecked(new Set()); setAddOpen(false)
    try { setAccRows((await api.get<AccRow[]>(`/extra-field-types/${t.id}/accounts`)).data) } catch (e) { setAccError(extractErrorMessage(e)) }
  }
  /** 원본 [추가] → '계정추가' 창(2026-10-21 실측): ☐ · 계정코드 · 계정명 · 추가항목유형, [적용(F8)]이 고른 계정을 단다. */
  async function addAccounts() {
    if (!accType) return
    if (addChecked.size === 0) { await ecAlert(NO_SELECTION_MESSAGE); return }
    try {
      setAccRows((await api.post<AccRow[]>(`/extra-field-types/${accType.id}/accounts`, { accountIds: [...addChecked] })).data)
      setAddOpen(false); setAddChecked(new Set()); load()
    } catch (e) { setAccError(extractErrorMessage(e)) }
  }
  async function removeAccounts() {
    if (!accType) return
    if (accChecked.size === 0) { await ecAlert(NO_SELECTION_MESSAGE); return }
    try {
      setAccRows((await api.post<AccRow[]>(`/extra-field-types/${accType.id}/accounts/remove`, [...accChecked])).data)
      setAccChecked(new Set()); load()
    } catch (e) { setAccError(extractErrorMessage(e)) }
  }

  async function openCompany() {
    setCompanyOpen(true)
    if (company.length === 0) api.get<CompanySlot[]>('/extra-field-types/company-slots').then((r) => setCompany(r.data)).catch(() => undefined)
  }

  const c = applied
  let shown = rows.filter((t) =>
    (showStopped || (c.use === '' ? true : (c.use === 'Y') === t.active)) &&
    (!c.code || t.code.includes(c.code)) && (!c.name || t.name.includes(c.name)) &&
    (!c.account || (accIds[t.id] ?? []).includes(Number(c.account))) &&
    (!quick || t.code.includes(quick) || t.name.includes(quick)))
  if (c.byDate) shown = [...shown].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  const allChecked = shown.length > 0 && shown.every((t) => checked.has(t.id))
  const red = (bad: boolean) => (invalid && bad ? 'border-ec-danger' : '')

  return (
    <EcListShell
      title="추가항목유형리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => setApplied(cond)}
      onReset={() => { const z = { code: '', name: '', account: '', use: 'Y', byDate: false }; setCond(z); setApplied(z) }}
      onNew={openNew}
      actions={[
        { label: '추가항목등록', onClick: () => void openCompany() },
        activeMenuAction('/extra-field-types', [...checked], () => setShowStopped((v) => !v), load),
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="추가항목유형코드"><input className="ec-input w-[140px]" aria-label="추가항목유형코드" value={cond.code} onChange={(e) => setCond({ ...cond, code: e.target.value })} /></EcCond>
        <EcCond label="추가항목유형명"><input className="ec-input w-[140px]" aria-label="추가항목유형명" value={cond.name} onChange={(e) => setCond({ ...cond, name: e.target.value })} /></EcCond>
        <EcCond label="계정" pick>
          <select className="ec-input w-[200px]" aria-label="계정" value={cond.account} onChange={(e) => setCond({ ...cond, account: e.target.value })}>
            <option value="">전체</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="사용구분">
          <select className="ec-input w-[100px]" aria-label="사용구분" value={cond.use} onChange={(e) => setCond({ ...cond, use: e.target.value })}>
            <option value="">전체</option><option value="Y">사용</option><option value="N">사용중단</option>
          </select>
        </EcCond>
        <EcCond label="기타"><label><input type="checkbox" checked={cond.byDate} onChange={(e) => setCond({ ...cond, byDate: e.target.checked })} /> 수정일자순</label></EcCond>
        <EcCond label="양식"><span>적용양식</span> <span className="ec-input inline-block w-[140px]">기본(수정불가)</span></EcCond>
      </ul>
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <NumCheck no="" head label="전체선택" on={allChecked} onChange={(v) => setChecked(v ? new Set(shown.map((t) => t.id)) : new Set())} />
            </th>
            <th>유형코드</th>
            <th>유형명</th>
            <th className="w-[120px]">추가항목설정</th>
            <th className="w-[120px]">계정설정</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((t, n) => (
            <tr key={t.id} className={t.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <NumCheck no={n + 1} label={`${t.code} 선택`} on={checked.has(t.id)}
                          onChange={(v) => setChecked((s) => { const x = new Set(s); if (v) x.add(t.id); else x.delete(t.id); return x })} />
              </td>
              <td><button type="button" className="ec-link" onClick={() => openEdit(t)}>{t.code}</button></td>
              <td>{t.name}</td>
              <td><button type="button" className="ec-btn ec-btn-sm" onClick={() => void openSlots(t)}>추가항목설정</button></td>
              <td><button type="button" className="ec-btn ec-btn-sm" onClick={() => void openAccounts(t)}>계정설정</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title={f.id ? '추가항목유형수정' : '추가항목유형등록'} width={784} onClose={() => setOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide"><span className="title">추가항목유형코드</span>
              <div className="form">{f.id ? <span>{f.code}</span> : (
                <input className={`ec-input w-[160px] ${red(!f.code.trim())}`} aria-label="추가항목유형코드" maxLength={20} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />)}</div></li>
            <li className="wide"><span className="title">추가항목유형명</span>
              <div className="form"><input className={`ec-input w-full ${red(!f.name.trim())}`} aria-label="추가항목유형명" maxLength={100} autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div></li>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setF(f.id ? { ...f, name: rows.find((r) => r.id === f.id)?.name ?? '' } : { id: null, code: nextCode(), name: '' })}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>

      <Modal error={slotError} open={slotType != null} title="추가항목설정" width={790} onClose={() => setSlotType(null)}>{(
        <div>
          <table className="w-full">
            <thead><tr><th>항목명</th><th className="w-[90px] text-center">사용여부</th><th className="w-[90px] text-center">필수항목</th><th className="w-[200px]">기본값설정</th></tr></thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.no}>
                  <td>{s.name}({s.kind})</td>
                  <td className="text-center"><input type="checkbox" aria-label={`${s.name} 사용여부`} checked={s.enabled}
                    onChange={(e) => patchSlot(s.no, { enabled: e.target.checked, required: e.target.checked ? s.required : false })} /></td>
                  <td className="text-center"><input type="checkbox" aria-label={`${s.name} 필수항목`} checked={s.required} disabled={!s.enabled}
                    onChange={(e) => patchSlot(s.no, { required: e.target.checked })} /></td>
                  <td><input className="ec-input w-full" aria-label={`${s.name} 기본값`} maxLength={100} disabled={!s.enabled} value={s.defaultValue ?? ''}
                    onChange={(e) => patchSlot(s.no, { defaultValue: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveSlots()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => slotType && void openSlots(slotType)}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setSlotType(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      <Modal error={accError} open={accType != null} title="계정설정" width={784} onClose={() => setAccType(null)}>{(
        <div>
          <table className="w-full">
            <thead><tr>
              <th className="w-[40px] text-center">
                <NumCheck no="" head label="전체선택" on={accRows.length > 0 && accRows.every((r) => accChecked.has(r.id))}
                          onChange={(v) => setAccChecked(v ? new Set(accRows.map((r) => r.id)) : new Set())} />
              </th>
              <th>계정코드</th><th>계정명</th></tr></thead>
            <tbody>
              {accRows.length === 0 ? <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr> : accRows.map((r, n) => (
                <tr key={r.id}>
                  <td className="text-center"><NumCheck no={n + 1} label={`${r.accountCode} 선택`} on={accChecked.has(r.id)}
                    onChange={(v) => setAccChecked((s) => { const x = new Set(s); if (v) x.add(r.id); else x.delete(r.id); return x })} /></td>
                  <td>{r.accountCode}</td><td>{r.accountName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px] items-center">
            <button type="button" className="ec-btn" onClick={() => { setAddChecked(new Set()); setAddOpen(true) }}>추가</button>
            <button type="button" className="ec-btn" onClick={() => void removeAccounts()}>선택삭제</button>
            <button type="button" className="ec-btn" onClick={() => setAccType(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      <Modal error="" open={addOpen} title="계정추가" width={784} onClose={() => setAddOpen(false)}>{(
        <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void addAccounts() } }}>
          <table className="w-full">
            <thead><tr>
              <th className="w-[40px] text-center" />
              <th>계정코드</th><th>계정명</th><th>추가항목유형</th></tr></thead>
            <tbody>
              {accounts.filter((a) => a.active && !accRows.some((r) => r.accountId === a.id)).map((a, n) => (
                <tr key={a.id}>
                  <td className="text-center"><NumCheck no={n + 1} label={`${a.code} 선택`} on={addChecked.has(a.id)}
                    onChange={(v) => setAddChecked((s) => { const x = new Set(s); if (v) x.add(a.id); else x.delete(a.id); return x })} /></td>
                  <td>{a.code}</td><td>{a.name}</td><td />
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void addAccounts()}>적용(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setAddOpen(false)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      <Modal error="" open={companyOpen} title="추가항목등록" width={784} onClose={() => setCompanyOpen(false)}>{(
        <div>
          <table className="w-full">
            <thead><tr><th>항목명</th><th className="w-[100px]">설정</th></tr></thead>
            <tbody>
              {company.map((s) => (
                <tr key={s.no}><td>{s.name}({s.kind})</td><td>{s.setting ? <button type="button" className="ec-btn ec-btn-sm">{s.setting}</button> : ''}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setCompanyOpen(false)}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setCompanyOpen(false)}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setCompanyOpen(false)}>닫기</button>
          </div>
        </div>
      )}</Modal>
    </EcListShell>
  )
}

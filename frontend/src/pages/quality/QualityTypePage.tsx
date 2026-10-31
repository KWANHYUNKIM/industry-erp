import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { EcHistoryModal } from '../../components/EcHistory'

/**
 * 재고 II › 품질관리 › 품질검사 › <b>품질검사유형등록</b>(E040632 검사유형리스트) — 2026-10-12 loginaa 실측.
 *
 * <p>목록 열 [유형코드 · 유형명 · 검사항목설정 · 품목설정] — 뒤 둘은 줄마다 버튼이고, 설정했으면 파랗고 안 했으면 회색이다.
 * 아래 [신규(F2) · 검사항목등록 · 품목별설정리스트 · 사용중단/재사용 ▲(사용중단 · 삭제 · 재사용)].
 * <ul>
 *   <li>[신규] 창 '품질검사유형등록': 품질검사유형코드 · 품질검사유형명(둘 다 비우면 빨간 테두리) · [저장(F8) · 다시 작성 · 닫기].
 *       저장하면 창이 닫히고 목록에 줄이 생긴다.</li>
 *   <li>[검사항목설정]: 품질검사유형코드 · 명 아래 코드형검사항목1~4 · 숫자형검사항목1~4 · 문자형검사항목1~4 코드도움.</li>
 *   <li>[품목설정]: 품목코드 · 품목명 표 + [추가 · 선택삭제 · 닫기].</li>
 *   <li>[검사항목등록] 창 '검사항목리스트': 검사항목코드 · 검사항목명 · 형식 · 필수항목 · 사용 · 상세항목(코드형식만 [추가]) +
 *       [신규(F2) · Excel · 사용중단/재사용 ▲ · 닫기]. 신규 창은 형식 · 검사항목코드(다음 번호 00001) · 검사항목명 · 필수입력항목(Y).
 *       삭제는 '코드형일 경우 하위 상세항목코드도 같이 삭제됩니다. 삭제하시겠습니까?'.</li>
 *   <li>[상세항목] 창 '상세항목리스트': 상세항목코드 · 상세항목명 · 사용 + [신규(F2) · 사용중단/재사용 ▲ · 닫기].</li>
 *   <li>[품목별설정리스트]: 품목코드 · 품목명 · 규격 · 품질검사요청-구매 · 품질검사요청-생산입고 · 검사방법 · 시료수량% · 검사유형.</li>
 * </ul>
 *
 * <p>2026-10-14 다시 잼(유형 QA2T 를 만들어 창마다 CRUD 하고 지움):
 * <ul>
 *   <li>목록은 [사용구분] 사용(기본) · 사용중단 · 전체 — 사용중단한 유형은 기본 목록에서 빠진다(검색 판에서 사용중단을 골라야 보인다).</li>
 *   <li>수정 창은 '품질검사유형수정' · [저장(F8) · 다시 작성 · 사용중단/재사용 ▲ · 닫기 · H]. ▲ 는 쓰는 중이면 사용중단 · 삭제,
 *       사용중단이면 재사용 · 삭제. 사용중단 · 재사용은 묻지 않고 창을 닫는다. [H] 는 '이력' 한 줄(마지막으로 고친 때 [사람]).</li>
 *   <li>[검사항목설정] 창 단추 저장(F8) · 닫기 · H, 저장하면 목록 단추가 파래진다.</li>
 *   <li>[품목설정] [추가] 는 '품목추가' 창(체크 · 품목코드 · 품목명 · 검사유형, [적용(F8) · 닫기]). 고른 것 없이 [선택삭제] —
 *       '선택된 자료가 없습니다. / 삭제할 자료를 체크한 후 다시 시도 바랍니다.', 지우기 확인 '삭제하겠습니까?'.</li>
 *   <li>검사항목 · 상세항목 등록 창: 이름을 비우고 저장하면 칸만 빨갛다(글자 없음). 수정 창은 '검사항목수정' · '품질검사유형수정'
 *       (상세항목도 이 제목) + 사용중단/재사용 ▲ · H. 둘 다 지우기 확인 '코드형일 경우 하위 상세항목코드도 같이 삭제됩니다. / 삭제하겠습니까?'.
 *       상세항목을 사용중단하면 목록에 남고 [사용] 이 No. 검사항목 [상세항목] 열은 코드형식이면 늘 '추가'.</li>
 * </ul>
 */
type Format = 'CODE' | 'NUMBER' | 'TEXT'
interface QcType { id: number; code: string; name: string; active: boolean; checkSet: boolean; itemSet: boolean }
interface CheckItem { id: number; code: string; name: string; format: Format; formatName: string; required: boolean; active: boolean; detailCount: number }
interface Detail { id: number; code: string; name: string; active: boolean }
interface Slot { format: Format; slot: number; checkItemId: number; code: string; name: string }
interface TypeItem { itemId: number; code: string; name: string; spec: string | null }
interface ItemSetting {
  itemId: number; code: string; name: string; spec: string | null
  qcOnPurchase: boolean; qcOnProduction: boolean; qcMethod: string | null; typeCode: string | null; typeName: string | null
}
interface Item { id: number; code: string; name: string; spec?: string | null; active?: boolean }

const FORMATS: [Format, string][] = [['CODE', '코드형식'], ['NUMBER', '숫자형식'], ['TEXT', '문자형식']]
const SLOT_LABEL: Record<Format, string> = { CODE: '코드형검사항목', NUMBER: '숫자형검사항목', TEXT: '문자형검사항목' }
const SLOTS = [1, 2, 3, 4]
/* 원본 [품목설정] 에서 고른 것 없이 [선택삭제] · [적용] (2026-10-14). */
const NO_PICK = '선택된 자료가 없습니다.\n삭제할 자료를 체크한 후 다시 시도 바랍니다.'

/** 고른 줄 묶음 — 원본 격자 첫 칸의 체크. */
function useChecks() {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const toggle = (id: number) => setChecked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = (ids: number[]) => setChecked((prev) => (ids.length > 0 && ids.every((i) => prev.has(i)) ? new Set() : new Set(ids)))
  return { checked, toggle, toggleAll, clear: () => setChecked(new Set()) }
}

/** 원본 [사용중단/재사용 ▲] — 위로 펴지는 사용중단 · 삭제 · 재사용. */
function StateMenu({ onPick }: { onPick: (what: 'stop' | 'delete' | 'reuse') => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button type="button" className="ec-btn" onClick={() => setOpen((o) => !o)}>사용중단/재사용 ▲</button>
      {open && (
        <div className="ec-menu top-auto bottom-[calc(100%+4px)] left-0 right-auto">
          {([['stop', '사용중단'], ['delete', '삭제'], ['reuse', '재사용']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setOpen(false); onPick(k) }}>{l}</button>
          ))}
        </div>
      )}
    </span>
  )
}

/** 수정 창 [사용중단/재사용 ▲] — 원본은 쓰는 중이면 사용중단 · 삭제, 사용중단이면 재사용 · 삭제(2026-10-14). */
function EditStateMenu({ active, onPick }: { active: boolean; onPick: (what: 'stop' | 'delete' | 'reuse') => void }) {
  const [open, setOpen] = useState(false)
  const picks: ['stop' | 'delete' | 'reuse', string][] = [active ? ['stop', '사용중단'] : ['reuse', '재사용'], ['delete', '삭제']]
  return (
    <span className="relative inline-flex">
      <button type="button" className="ec-btn" onClick={() => setOpen((o) => !o)}>사용중단/재사용 ▲</button>
      {open && (
        <div className="ec-menu top-auto bottom-[calc(100%+4px)] left-0 right-auto">
          {picks.map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setOpen(false); onPick(k) }}>{l}</button>
          ))}
        </div>
      )}
    </span>
  )
}

/** 원본 지우기 확인(검사항목 · 상세항목 같은 글). */
const CHECK_DELETE_CONFIRM = '코드형일 경우 하위 상세항목코드도 같이 삭제됩니다.\n삭제하겠습니까?'

export default function QualityTypePage() {
  const [types, setTypes] = useState<QcType[]>([])
  const [checkItems, setCheckItems] = useState<CheckItem[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /* 원본 검색 판 [사용구분] 전체 · 사용 · 사용중단 — 사용으로 연다. */
  const [useFilter, setUseFilter] = useState<'' | 'Y' | 'N'>('Y')
  const typeChecks = useChecks()
  /* [H] '이력' — 열린 창의 대상. */
  const [history, setHistory] = useState<string | null>(null)

  /* 검사유형 신규 · 수정 창 */
  const [typeForm, setTypeForm] = useState<{ id: number | null; code: string; name: string; active: boolean } | null>(null)
  const [typeInvalid, setTypeInvalid] = useState(false)
  /* 검사항목설정 창 */
  const [slotType, setSlotType] = useState<QcType | null>(null)
  const [slotValues, setSlotValues] = useState<Record<string, string>>({})
  /* 품목설정 창 */
  const [itemType, setItemType] = useState<QcType | null>(null)
  const [typeItems, setTypeItems] = useState<TypeItem[]>([])
  /* 원본 [추가] → '품목추가' 창: 체크 · 품목코드 · 품목명 · 검사유형. */
  const [addOpen, setAddOpen] = useState(false)
  const [itemTypeName, setItemTypeName] = useState<Map<number, string>>(new Map())
  const addChecks = useChecks()
  const typeItemChecks = useChecks()
  /* 품목별설정리스트 */
  const [settings, setSettings] = useState<ItemSetting[] | null>(null)
  /* 검사항목리스트 · 신규 창 */
  const [checkListOpen, setCheckListOpen] = useState(false)
  const checkChecks = useChecks()
  const [checkForm, setCheckForm] = useState<{ id: number | null; format: Format; code: string; name: string; required: boolean; active: boolean } | null>(null)
  const [nameInvalid, setNameInvalid] = useState(false)
  /* 상세항목리스트 · 신규 창 */
  const [detailOf, setDetailOf] = useState<CheckItem | null>(null)
  const [details, setDetails] = useState<Detail[]>([])
  const detailChecks = useChecks()
  const [detailForm, setDetailForm] = useState<{ id: number | null; code: string; name: string; active: boolean } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [t, c] = await Promise.all([api.get<QcType[]>('/quality-types'), api.get<CheckItem[]>('/quality-check-items')])
      setTypes(t.data)
      setCheckItems(c.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const run = async (fn: () => Promise<unknown>) => {
    setError('')
    try { await fn(); return true } catch (err) { setError(extractErrorMessage(err)); return false }
  }

  /* ── 검사유형 ── */
  async function saveType() {
    if (!typeForm) return
    if (!typeForm.code.trim() || !typeForm.name.trim()) { setTypeInvalid(true); return }
    const ok = await run(() => (typeForm.id
      ? api.put(`/quality-types/${typeForm.id}`, { name: typeForm.name })
      : api.post('/quality-types', { code: typeForm.code, name: typeForm.name })))
    if (ok) { setTypeForm(null); void load() }
  }
  async function bulkTypes(what: 'stop' | 'delete' | 'reuse') {
    const ids = [...typeChecks.checked]
    if (ids.length === 0) { setError('선택된 데이터가 없습니다.'); return }
    /* 원본 확인 창 '삭제하겠습니까?'(2026-10-14 E040632 실측). */
    if (what === 'delete' && !(await ecConfirm('삭제하겠습니까?'))) return
    const ok = await run(() => api.post('/quality-types/bulk', { ids, active: what === 'delete' ? null : what === 'reuse' }))
    if (ok) { typeChecks.clear(); void load() }
  }

  /** 수정 창의 ▲ — 그 유형 하나. 사용중단 · 재사용은 묻지 않고 창을 닫는다(원본). */
  async function stateOfType(what: 'stop' | 'delete' | 'reuse') {
    if (!typeForm?.id) return
    if (what === 'delete' && !(await ecConfirm('삭제하겠습니까?'))) return
    const ok = await run(() => api.post('/quality-types/bulk', { ids: [typeForm.id], active: what === 'delete' ? null : what === 'reuse' }))
    if (ok) { setTypeForm(null); void load() }
  }

  /* ── 검사항목설정 ── */
  async function openSlots(t: QcType) {
    setError('')
    const r = await api.get<Slot[]>(`/quality-types/${t.id}/slots`)
    const v: Record<string, string> = {}
    r.data.forEach((s) => { v[`${s.format}-${s.slot}`] = String(s.checkItemId) })
    setSlotValues(v)
    setSlotType(t)
  }
  async function saveSlots() {
    if (!slotType) return
    const slots = Object.entries(slotValues).filter(([, v]) => v).map(([k, v]) => ({ checkItemId: Number(v), slot: Number(k.split('-')[1]) }))
    const ok = await run(() => api.put(`/quality-types/${slotType.id}/slots`, { slots }))
    if (ok) { setSlotType(null); void load() }
  }

  /* ── 품목설정 ── */
  async function openItems(t: QcType) {
    setError(''); typeItemChecks.clear()
    const [r, it] = await Promise.all([api.get<TypeItem[]>(`/quality-types/${t.id}/items`), items.length ? null : api.get<Item[]>('/items')])
    if (it) setItems(it.data)
    setTypeItems(r.data)
    setItemType(t)
  }
  async function openAdd() {
    setError(''); addChecks.clear()
    const r = await api.get<ItemSetting[]>('/quality-types/item-settings')
    setItemTypeName(new Map(r.data.filter((x) => x.typeName).map((x) => [x.itemId, x.typeName as string])))
    setAddOpen(true)
  }
  async function addItems() {
    if (!itemType) return
    const ids = [...addChecks.checked]
    if (ids.length === 0) { await ecAlert(NO_PICK); return }
    const ok = await run(async () => {
      const r = await api.post<TypeItem[]>(`/quality-types/${itemType.id}/items`, { itemIds: ids })
      setTypeItems(r.data); void load()
    })
    if (ok) setAddOpen(false)
  }
  async function removeItems() {
    if (!itemType) return
    const ids = [...typeItemChecks.checked]
    if (ids.length === 0) { await ecAlert(NO_PICK); return }
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    await run(async () => {
      const r = await api.post<TypeItem[]>(`/quality-types/${itemType.id}/items/remove`, { itemIds: ids })
      setTypeItems(r.data); typeItemChecks.clear(); void load()
    })
  }

  async function openSettings() {
    setError('')
    const r = await api.get<ItemSetting[]>('/quality-types/item-settings')
    setSettings(r.data)
  }

  /* ── 검사항목 ── */
  async function newCheckItem() {
    const r = await api.get<{ code: string }>('/quality-check-items/next-code')
    setError('')
    setNameInvalid(false)
    setCheckForm({ id: null, format: 'CODE', code: r.data.code, name: '', required: true, active: true })
  }
  async function saveCheckItem() {
    if (!checkForm) return
    /* 원본은 글자 없이 칸만 빨갛게 한다(2026-10-14). */
    if (!checkForm.name.trim()) { setNameInvalid(true); return }
    const body = { format: checkForm.format, code: checkForm.code, name: checkForm.name, required: checkForm.required }
    const ok = await run(() => (checkForm.id ? api.put(`/quality-check-items/${checkForm.id}`, body) : api.post('/quality-check-items', body)))
    if (ok) { setCheckForm(null); void load() }
  }
  async function bulkCheckItems(what: 'stop' | 'delete' | 'reuse') {
    const ids = [...checkChecks.checked]
    if (ids.length === 0) { setError('선택된 데이터가 없습니다.'); return }
    if (what === 'delete' && !(await ecConfirm(CHECK_DELETE_CONFIRM))) return
    const ok = await run(() => api.post('/quality-check-items/bulk', { ids, active: what === 'delete' ? null : what === 'reuse' }))
    if (ok) { checkChecks.clear(); void load() }
  }
  async function stateOfCheckItem(what: 'stop' | 'delete' | 'reuse') {
    if (!checkForm?.id) return
    if (what === 'delete' && !(await ecConfirm(CHECK_DELETE_CONFIRM))) return
    const ok = await run(() => api.post('/quality-check-items/bulk', { ids: [checkForm.id], active: what === 'delete' ? null : what === 'reuse' }))
    if (ok) { setCheckForm(null); void load() }
  }

  /* ── 상세항목 ── */
  async function openDetails(c: CheckItem) {
    setError(''); detailChecks.clear()
    const r = await api.get<Detail[]>(`/quality-check-items/${c.id}/details`)
    setDetails(r.data); setDetailOf(c)
  }
  async function reloadDetails() {
    if (!detailOf) return
    const r = await api.get<Detail[]>(`/quality-check-items/${detailOf.id}/details`)
    setDetails(r.data); void load()
  }
  async function newDetail() {
    if (!detailOf) return
    const r = await api.get<{ code: string }>(`/quality-check-items/${detailOf.id}/details/next-code`)
    setError('')
    setNameInvalid(false)
    setDetailForm({ id: null, code: r.data.code, name: '', active: true })
  }
  async function saveDetail() {
    if (!detailOf || !detailForm) return
    if (!detailForm.name.trim()) { setNameInvalid(true); return }
    const body = { code: detailForm.code, name: detailForm.name }
    const ok = await run(() => (detailForm.id
      ? api.put(`/quality-check-item-details/${detailForm.id}`, body)
      : api.post(`/quality-check-items/${detailOf.id}/details`, body)))
    if (ok) { setDetailForm(null); void reloadDetails() }
  }
  async function bulkDetails(what: 'stop' | 'delete' | 'reuse') {
    const ids = [...detailChecks.checked]
    if (ids.length === 0) { setError('선택된 데이터가 없습니다.'); return }
    if (what === 'delete' && !(await ecConfirm(CHECK_DELETE_CONFIRM))) return
    const ok = await run(() => api.post('/quality-check-item-details/bulk', { ids, active: what === 'delete' ? null : what === 'reuse' }))
    if (ok) { detailChecks.clear(); void reloadDetails() }
  }
  async function stateOfDetail(what: 'stop' | 'delete' | 'reuse') {
    if (!detailForm?.id) return
    if (what === 'delete' && !(await ecConfirm(CHECK_DELETE_CONFIRM))) return
    const ok = await run(() => api.post('/quality-check-item-details/bulk', { ids: [detailForm.id], active: what === 'delete' ? null : what === 'reuse' }))
    if (ok) { setDetailForm(null); void reloadDetails() }
  }

  const shown = types
    .filter((t) => !useFilter || t.active === (useFilter === 'Y'))
    .filter((t) => !keyword || t.code.includes(keyword) || t.name.includes(keyword))
  const yes = (b: boolean) => (b ? 'Yes' : 'No')
  const anyModal = typeForm || slotType || itemType || settings || checkListOpen
  const hBtn = (target: string, id: number | null) => id != null &&
    <button type="button" className="ec-btn" onClick={() => setHistory(`/change-history?target=${target}&id=${id}`)}>H</button>

  return (
    <EcListShell title="검사유형리스트" search={keyword} onSearchChange={setKeyword} onSearch={() => void load()}>
      {error && !anyModal && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <li><div className="title">사용구분</div><div className="form flex gap-[10px]">
          {([['', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-[3px]">
              <input type="radio" name="qc-type-use" checked={useFilter === v} onChange={() => setUseFilter(v)} />{l}
            </label>
          ))}
        </div></li>
      </ul>
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((t) => typeChecks.checked.has(t.id))}
                     onChange={() => typeChecks.toggleAll(shown.map((t) => t.id))} />
            </th>
            <th>유형코드</th>
            <th>유형명</th>
            <th className="w-[22%]">검사항목설정</th>
            <th className="w-[22%]">품목설정</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((t) => (
            <tr key={t.id}>
              <td className="text-center"><input type="checkbox" aria-label={`${t.code} 선택`} checked={typeChecks.checked.has(t.id)} onChange={() => typeChecks.toggle(t.id)} /></td>
              <td><button type="button" className="ec-link" onClick={() => { setError(''); setTypeInvalid(false); setTypeForm({ id: t.id, code: t.code, name: t.name, active: t.active }) }}>{t.code}</button></td>
              <td>{t.name}</td>
              <td><button type="button" className={`ec-btn w-full ${t.checkSet ? 'ec-btn-primary' : ''}`} onClick={() => void openSlots(t)}>검사항목설정</button></td>
              <td><button type="button" className={`ec-btn w-full ${t.itemSet ? 'ec-btn-primary' : ''}`} onClick={() => void openItems(t)}>품목설정</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => { setError(''); setTypeInvalid(false); setTypeForm({ id: null, code: '', name: '', active: true }) }}>신규(F2)</button>
        <button type="button" className="ec-btn" onClick={() => { setError(''); checkChecks.clear(); setCheckListOpen(true) }}>검사항목등록</button>
        <button type="button" className="ec-btn" onClick={() => void openSettings()}>품목별설정리스트</button>
        <StateMenu onPick={(w) => void bulkTypes(w)} />
      </div>

      {/* 품질검사유형등록 */}
      <Modal error={typeForm ? error : ''} open={typeForm != null} title={typeForm?.id != null ? '품질검사유형수정' : '품질검사유형등록'} width={760} onClose={() => setTypeForm(null)}>{typeForm && (
        <div>
          <div className="ec-form grid grid-cols-[130px_1fr] gap-y-[6px] items-center">
            <span className="text-ec-label">품질검사유형코드</span>
            {/* 수정 창은 코드를 칸 없이 글자로만 적는다(2026-10-14 원본 '품질검사유형수정'). */}
            {typeForm.id != null ? <span>{typeForm.code}</span> : (
            <input className={`ec-input ${typeInvalid && !typeForm.code.trim() ? 'border-ec-danger' : ''}`} aria-label="품질검사유형코드" placeholder="품질검사유형코드"
                   value={typeForm.code} onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })} />)}
            <span className="text-ec-label">품질검사유형명</span>
            <input className={`ec-input ${typeInvalid && !typeForm.name.trim() ? 'border-ec-danger' : ''}`} aria-label="품질검사유형명" placeholder="품질검사유형명"
                   value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} />
          </div>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveType()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setTypeForm({ ...typeForm, code: typeForm.id ? typeForm.code : '', name: '' })}>다시 작성</button>
            {typeForm.id != null && <EditStateMenu active={typeForm.active} onPick={(w) => void stateOfType(w)} />}
            <button type="button" className="ec-btn" onClick={() => setTypeForm(null)}>닫기</button>
            {hBtn('QC_TYPE', typeForm.id)}
          </div>
        </div>
      )}</Modal>

      {/* 검사항목설정 */}
      <Modal error={slotType ? error : ''} open={slotType != null} title="검사항목설정" width={760} onClose={() => setSlotType(null)}>{slotType && (
        <div>
          <div className="ec-form grid grid-cols-[130px_1fr] gap-y-[6px] items-center">
            <span className="text-ec-label">품질검사유형코드</span><span>{slotType.code}</span>
            <span className="text-ec-label">품질검사유형명</span><span>{slotType.name}</span>
            {FORMATS.flatMap(([f]) => SLOTS.map((n) => {
              const key = `${f}-${n}`
              return [
                <span key={`${key}-l`} className="text-ec-label">{SLOT_LABEL[f]}{n}</span>,
                <CodePickerField key={key} label={`${SLOT_LABEL[f]}${n}`} hideLabel fill placeholder={`${SLOT_LABEL[f]}${n}`} emptyLabel="선택 해제"
                                 value={slotValues[key] ?? ''} onChange={(v) => setSlotValues((p) => ({ ...p, [key]: v }))}
                                 items={checkItems.filter((c) => c.format === f && c.active).map((c) => ({ value: String(c.id), code: c.code, name: c.name }))} />,
              ]
            }))}
          </div>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveSlots()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setSlotType(null)}>닫기</button>
            {hBtn('QC_TYPE_SLOT', slotType.id)}
          </div>
        </div>
      )}</Modal>

      {/* 품목설정 */}
      <Modal error={itemType ? error : ''} open={itemType != null} title="품목설정" width={760} onClose={() => setItemType(null)}>{itemType && (
        <div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-[34px] text-center">
                  <input type="checkbox" aria-label="전체 선택" checked={typeItems.length > 0 && typeItems.every((i) => typeItemChecks.checked.has(i.itemId))}
                         onChange={() => typeItemChecks.toggleAll(typeItems.map((i) => i.itemId))} />
                </th>
                <th>품목코드</th>
                <th>품목명</th>
              </tr>
            </thead>
            <tbody>
              {typeItems.length === 0 ? (
                <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : typeItems.map((i) => (
                <tr key={i.itemId}>
                  <td className="text-center"><input type="checkbox" aria-label={`${i.code} 선택`} checked={typeItemChecks.checked.has(i.itemId)} onChange={() => typeItemChecks.toggle(i.itemId)} /></td>
                  <td>{i.code}</td>
                  <td>{i.name}{i.spec ? ` [${i.spec}]` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[4px] mt-[10px] items-center">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void openAdd()}>추가</button>
            <button type="button" className="ec-btn" onClick={() => void removeItems()}>선택삭제</button>
            <button type="button" className="ec-btn" onClick={() => setItemType(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      {/* 품목추가 — 원본 [품목설정] [추가] 창(2026-10-14): 체크 · 품목코드 · 품목명 · 검사유형, [적용(F8) · 닫기]. */}
      <Modal error={addOpen ? error : ''} open={addOpen} title="품목추가" width={760} onClose={() => setAddOpen(false)}>{addOpen && (() => {
        const cand = items.filter((it) => it.active !== false && !typeItems.some((t) => t.itemId === it.id))
        return (
          <div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="w-[34px] text-center">
                    <input type="checkbox" aria-label="전체 선택" checked={cand.length > 0 && cand.every((i) => addChecks.checked.has(i.id))}
                           onChange={() => addChecks.toggleAll(cand.map((i) => i.id))} />
                  </th>
                  <th>품목코드</th><th>품목명</th><th>검사유형</th>
                </tr>
              </thead>
              <tbody>
                {cand.length === 0 ? (
                  <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : cand.map((it) => (
                  <tr key={it.id}>
                    <td className="text-center"><input type="checkbox" aria-label={`${it.code} 선택`} checked={addChecks.checked.has(it.id)} onChange={() => addChecks.toggle(it.id)} /></td>
                    <td>{it.code}</td>
                    <td>{it.name}</td>
                    <td>{itemTypeName.get(it.id) ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-[4px] mt-[10px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void addItems()}>적용(F8)</button>
              <button type="button" className="ec-btn" onClick={() => setAddOpen(false)}>닫기</button>
            </div>
          </div>
        )
      })()}</Modal>

      {/* 품목별설정리스트 — 원본 창 제목은 '품목설정' */}
      <Modal error={settings ? error : ''} open={settings != null} title="품목설정" width={980} onClose={() => setSettings(null)}>{settings && (
        <div>
          <table className="w-full">
            <thead>
              <tr>
                <th>품목코드</th><th>품목명</th><th>규격</th>
                <th>품질검사요청-구매</th><th>품질검사요청-생산입고</th>
                <th>검사방법</th><th>시료수량%</th><th>검사유형</th>
              </tr>
            </thead>
            <tbody>
              {settings.length === 0 ? (
                <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : settings.map((s) => (
                <tr key={s.itemId}>
                  <td>{s.code}</td><td>{s.name}</td><td>{s.spec}</td>
                  <td>{s.qcOnPurchase ? '요청함' : '기본설정'}</td>
                  <td>{s.qcOnProduction ? '요청함' : '기본설정'}</td>
                  <td>{s.qcMethod || '전수검사'}</td>
                  <td />
                  <td>{s.typeName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn" onClick={() => setSettings(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      {/* 검사항목리스트 */}
      <Modal error={checkListOpen && !checkForm && !detailOf ? error : ''} open={checkListOpen && !checkForm && !detailOf} title="검사항목리스트" width={760} onClose={() => setCheckListOpen(false)}>{(
        <div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-[34px] text-center">
                  <input type="checkbox" aria-label="전체 선택" checked={checkItems.length > 0 && checkItems.every((c) => checkChecks.checked.has(c.id))}
                         onChange={() => checkChecks.toggleAll(checkItems.map((c) => c.id))} />
                </th>
                <th>검사항목코드</th><th>검사항목명</th><th className="text-center">형식</th>
                <th className="text-center">필수항목</th><th className="text-center">사용</th><th className="text-center">상세항목</th>
              </tr>
            </thead>
            <tbody>
              {checkItems.length === 0 ? (
                <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : checkItems.map((c) => (
                <tr key={c.id}>
                  <td className="text-center"><input type="checkbox" aria-label={`${c.code} 선택`} checked={checkChecks.checked.has(c.id)} onChange={() => checkChecks.toggle(c.id)} /></td>
                  <td><button type="button" className="ec-link" onClick={() => { setError(''); setNameInvalid(false); setCheckForm({ id: c.id, format: c.format, code: c.code, name: c.name, required: c.required, active: c.active }) }}>{c.code}</button></td>
                  <td>{c.name}</td>
                  <td className="text-center">{c.formatName}</td>
                  <td className="text-center">{yes(c.required)}</td>
                  <td className="text-center">{yes(c.active)}</td>
                  <td className="text-center">{c.format === 'CODE' && <button type="button" className="ec-link" onClick={() => void openDetails(c)}>추가</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void newCheckItem()}>신규(F2)</button>
            <StateMenu onPick={(w) => void bulkCheckItems(w)} />
            <button type="button" className="ec-btn" onClick={() => setCheckListOpen(false)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      {/* 검사항목등록 */}
      <Modal error={checkForm ? error : ''} open={checkForm != null} title={checkForm?.id != null ? '검사항목수정' : '검사항목등록'} width={760} onClose={() => setCheckForm(null)}>{checkForm && (
        <div>
          <div className="ec-form grid grid-cols-[130px_1fr] gap-y-[6px] items-center">
            <span className="text-ec-label">형식</span>
            <select className="ec-input" aria-label="형식" value={checkForm.format} onChange={(e) => setCheckForm({ ...checkForm, format: e.target.value as Format })}>
              {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="text-ec-label">검사항목코드</span>
            <input className="ec-input" aria-label="검사항목코드" value={checkForm.code} onChange={(e) => setCheckForm({ ...checkForm, code: e.target.value })} />
            <span className="text-ec-label">검사항목명</span>
            <input className={`ec-input ${nameInvalid && !checkForm.name.trim() ? 'border-ec-danger' : ''}`} aria-label="검사항목명" placeholder="검사항목명" value={checkForm.name} onChange={(e) => setCheckForm({ ...checkForm, name: e.target.value })} />
            <span className="text-ec-label">필수입력항목</span>
            <select className="ec-input" aria-label="필수입력항목" value={checkForm.required ? 'Y' : 'N'} onChange={(e) => setCheckForm({ ...checkForm, required: e.target.value === 'Y' })}>
              <option value="Y">Y</option><option value="N">N</option>
            </select>
          </div>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveCheckItem()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setCheckForm({ ...checkForm, name: '', required: true })}>다시 작성</button>
            {checkForm.id != null && <EditStateMenu active={checkForm.active} onPick={(w) => void stateOfCheckItem(w)} />}
            <button type="button" className="ec-btn" onClick={() => setCheckForm(null)}>닫기</button>
            {hBtn('QC_CHECK_ITEM', checkForm.id)}
          </div>
        </div>
      )}</Modal>

      {/* 상세항목리스트 */}
      <Modal error={detailOf && !detailForm ? error : ''} open={detailOf != null && !detailForm} title="상세항목리스트" width={760} onClose={() => setDetailOf(null)}>{(
        <div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-[34px] text-center">
                  <input type="checkbox" aria-label="전체 선택" checked={details.length > 0 && details.every((d) => detailChecks.checked.has(d.id))}
                         onChange={() => detailChecks.toggleAll(details.map((d) => d.id))} />
                </th>
                <th>상세항목코드</th><th>상세항목명</th><th className="text-center">사용</th>
              </tr>
            </thead>
            <tbody>
              {details.length === 0 ? (
                <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : details.map((d) => (
                <tr key={d.id}>
                  <td className="text-center"><input type="checkbox" aria-label={`${d.code} 선택`} checked={detailChecks.checked.has(d.id)} onChange={() => detailChecks.toggle(d.id)} /></td>
                  <td><button type="button" className="ec-link" onClick={() => { setError(''); setNameInvalid(false); setDetailForm({ id: d.id, code: d.code, name: d.name, active: d.active }) }}>{d.code}</button></td>
                  <td>{d.name}</td>
                  <td className="text-center">{yes(d.active)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void newDetail()}>신규(F2)</button>
            <StateMenu onPick={(w) => void bulkDetails(w)} />
            <button type="button" className="ec-btn" onClick={() => setDetailOf(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      {/* 상세항목 신규 · 수정 — 원본 창 제목이 '품질검사유형등록' · '품질검사유형수정' 이다(그대로 둔다). */}
      <Modal error={detailForm ? error : ''} open={detailForm != null} title={detailForm?.id != null ? '품질검사유형수정' : '품질검사유형등록'} width={760} onClose={() => setDetailForm(null)}>{detailForm && (
        <div>
          <div className="ec-form grid grid-cols-[130px_1fr] gap-y-[6px] items-center">
            <span className="text-ec-label">상세항목코드</span>
            <input className="ec-input" aria-label="상세항목코드" value={detailForm.code} disabled={detailForm.id != null} onChange={(e) => setDetailForm({ ...detailForm, code: e.target.value })} />
            <span className="text-ec-label">상세항목명</span>
            <input className={`ec-input ${nameInvalid && !detailForm.name.trim() ? 'border-ec-danger' : ''}`} aria-label="상세항목명" placeholder="상세항목명" value={detailForm.name} onChange={(e) => setDetailForm({ ...detailForm, name: e.target.value })} />
          </div>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveDetail()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setDetailForm({ ...detailForm, name: '' })}>다시 작성</button>
            {detailForm.id != null && <EditStateMenu active={detailForm.active} onPick={(w) => void stateOfDetail(w)} />}
            <button type="button" className="ec-btn" onClick={() => setDetailForm(null)}>닫기</button>
            {hBtn('QC_CHECK_ITEM_DETAIL', detailForm.id)}
          </div>
        </div>
      )}</Modal>
      {history && <EcHistoryModal url={history} last onClose={() => setHistory(null)} />}
    </EcListShell>
  )
}

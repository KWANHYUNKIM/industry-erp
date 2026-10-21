import { useEffect, useMemo, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type {
  Item, Partner, SpecialPrice, SpecialPriceApplied, SpecialPriceGroup, SpecialPriceItemGroup, SpecialPriceMember,
} from '../../types/api'
import { partnerCodeItems } from '../../utils/codeItems'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { EcCond } from '../../components/EcStatusPanel'
import NumCheck from '../../components/NumCheck'

/**
 * 재고 I › 기초등록 › 단가관리 › <b>특별단가등록</b> (원본 E040124, 화면 제목 '특별단가리스트').
 *
 * <p>2026-10-14 loginaa 실측(plans/재고1/E040124.md) — 원본 모델 그대로:
 * <ul>
 *   <li>알약 넷: <b>특별단가그룹</b>(코드 · 이름 · 거래처설정 · 창고설정 · 품목설정 · 품목그룹설정 — 뒤 넷은 줄마다 링크,
 *       무언가 붙었으면 주황 알약) · <b>품목별</b>(품목코드 · 품목명[규격] · 품목그룹명 · 특별단가그룹명 · 적용단가 · Vat포함여부) ·
 *       <b>품목그룹별</b>(품목그룹코드 · 품목그룹명 · 특별단가그룹명 · 품목그룹별 조정내역) · <b>적용단가</b>(품목 × 그룹마다 실제로 걸리는 값).</li>
 *   <li>[신규(F2)] 특별단가그룹등록(코드 · 이름, 빈 칸은 글 없이 빨간 테두리) · 품목별특별단가등록(특별단가그룹코드 — 마지막에 쓴 그룹이 차 있다 ·
 *       품목 · 적용단가 · VAT포함, 같은 그룹에 같은 품목 '이미 특별단가그룹에 존재하는 코드입니다.') · 품목그룹추가(특별단가그룹코드 · 품목그룹 ·
 *       단가기준 출고단가(입고단가 · 단가A~J) · 조정_비율(%) · 조정_단위처리 소수6자리미만(… 소수1자리미만 · 원미만 · 십원 · 백원 · 천원미만) · 반올림(절상 · 절사)). 버튼 저장(F8) · 다시 작성 · 닫기.</li>
 *   <li>[거래처설정] 창: 구분 · 거래처코드 · 거래처명, 추가 · 선택삭제 · 닫기. [추가] '거래처추가': 특별단가그룹 · 특별단가그룹명 · 거래처 ·
 *       구분(영업단가그룹 · 구매단가그룹 체크칸). [창고설정] 도 같은 꼴(구분 · 창고코드 · 창고명).</li>
 * </ul>
 * 판매 · 구매입력이 단가를 불러올 때(/special-prices/resolve) 단가적용순서설정의 '사용' 줄 차례로 이 값들을 본다.
 */

type Pill = '특별단가그룹' | '품목별' | '품목그룹별' | '적용단가'
const PILLS: Pill[] = ['특별단가그룹', '품목별', '품목그룹별', '적용단가']
const CHANGE_NO_PICK = '선택된 자료가 없습니다.\n변경할 자료를 체크한 후 다시 시도 바랍니다.'   // 원본 품목그룹별 [변경] 2026-10-22 실측
const NO_PICK = '리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.'
/** 원본 [특별단가그룹] 삭제 확인 글(2026-10-14 실측) — 막지 않고 그 그룹의 줄을 함께 지운다. */
const GROUP_DELETE_CONFIRM = '해당 특별단가그룹으로 등록된\n품목별, 품목그룹별, 적용단가 설정도 모두 삭제됩니다.\n\n계속 진행하시겠습니까?'
const LAST_GROUP_KEY = 'erp.specialPrice.lastGroup'
const won = (n: number | null | undefined) => (n == null ? '' : Number(n).toLocaleString('ko-KR'))
const SET_TAG = 'inline-block rounded-[6px] px-[1.8px] py-[0.9px] text-[12px] leading-[13.2px] bg-[var(--ec-tag-warn)] text-[var(--ec-bg-panel)] no-underline'
const BAD = 'border-[color:var(--ec-text-danger)]'
/** 코드도움 칸이 비어 막혔을 때 — 원본처럼 글 없이 빨간 테두리만 */
const BAD_BOX = 'outline outline-1 outline-[color:var(--ec-text-danger)] rounded-[10px]'

interface Simple { id: number; code: string; name: string; active?: boolean; spec?: string | null; searchKeyword?: string | null }
type Member = { kind: 'partners' | 'warehouses'; group: SpecialPriceGroup }

function readLastGroup(): string {
  try { return localStorage.getItem(LAST_GROUP_KEY) ?? '' } catch { return '' }
}
function writeLastGroup(id: string) {
  try { localStorage.setItem(LAST_GROUP_KEY, id) } catch { /* 저장소가 막혀도 입력은 된다 */ }
}


export default function SpecialPricePage() {
  const [pill, setPill] = useState<Pill>('특별단가그룹')
  const [groups, setGroups] = useState<SpecialPriceGroup[]>([])
  const [prices, setPrices] = useState<SpecialPrice[]>([])
  const [igPrices, setIgPrices] = useState<SpecialPriceItemGroup[]>([])
  const [applied, setApplied] = useState<SpecialPriceApplied[]>([])
  const [items, setItems] = useState<(Item & Simple)[]>([])
  const [itemGroups, setItemGroups] = useState<Simple[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Simple[]>([])
  const [options, setOptions] = useState<{ priceBases: string[]; roundUnits: string[]; roundModes: string[] }>(
    { priceBases: ['출고단가'], roundUnits: ['소수6자리미만'], roundModes: ['반올림'] })
  const [error, setError] = useState('')
  const [quick, setQuick] = useState('')
  /** Search(F3) 조건 — 원본 [사용구분](기본 사용) · [수정일자순(정렬)] */
  const [useCond, setUseCond] = useState<'ALL' | 'Y' | 'N'>('Y')
  const [byUpdated, setByUpdated] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  /** 단가적용순서설정에서 특별단가 줄이 '사용' 인가 — 꺼져 있으면 등록해도 전표에 안 걸린다. */
  const [enabled, setEnabled] = useState<{ SALES: boolean; PURCHASE: boolean } | null>(null)

  async function load() {
    setError('')
    try {
      const [g, p, ig, ap] = await Promise.all([
        api.get<SpecialPriceGroup[]>('/special-prices/groups'),
        api.get<SpecialPrice[]>('/special-prices'),
        api.get<SpecialPriceItemGroup[]>('/special-prices/item-groups'),
        api.get<SpecialPriceApplied[]>('/special-prices/applied'),
      ])
      setGroups(g.data); setPrices(p.data); setIgPrices(ig.data); setApplied(ap.data)
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  useEffect(() => {
    void load()
    Promise.allSettled([
      api.get<(Item & Simple)[]>('/items'), api.get<Simple[]>('/item-groups'), api.get<Partner[]>('/partners'),
      api.get<Simple[]>('/warehouses'), api.get<typeof options>('/special-prices/item-groups/options'),
    ]).then(([it, ig, pt, wh, op]) => {
      if (it.status === 'fulfilled') setItems(it.value.data)
      if (ig.status === 'fulfilled') setItemGroups(ig.value.data)
      if (pt.status === 'fulfilled') setPartners(pt.value.data)
      if (wh.status === 'fulfilled') setWarehouses(wh.value.data)
      if (op.status === 'fulfilled') setOptions(op.value.data)
    })
    Promise.all((['SALES', 'PURCHASE'] as const).map((t) => api.get<boolean>('/special-prices/enabled', { params: { tradeType: t } })))
      .then(([s, p]) => setEnabled({ SALES: s.data, PURCHASE: p.data })).catch(() => setEnabled(null))
  }, [])

  function switchPill(p: Pill) { setPill(p); setChecked(new Set()); setMenuOpen(false) }
  const toggle = (id: number) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // ── 코드도움 목록 ──
  const groupItems = groups.map((g) => ({ value: String(g.id), code: g.code, name: g.name, stopped: !g.active }))
  const itemItems = items.filter((i) => i.active !== false).map((i) => ({ value: String(i.id), code: i.code, name: i.name, sub: i.spec, alias: i.searchKeyword }))
  const itemGroupItems = itemGroups.filter((g) => g.active !== false).map((g) => ({ value: String(g.id), code: g.code, name: g.name }))
  const warehouseItems = warehouses.filter((w) => w.active !== false).map((w) => ({ value: String(w.id), code: w.code, name: w.name }))

  // ── 특별단가그룹 창 ──
  const [dupGroup, setDupGroup] = useState<SpecialPriceGroup | null>(null)
  const [gForm, setGForm] = useState<{ open: boolean; id: number | null; code: string; name: string; bad: boolean; error: string }>(
    { open: false, id: null, code: '', name: '', bad: false, error: '' })
  async function saveGroup(e?: FormEvent) {
    e?.preventDefault()
    if (!gForm.code.trim() || !gForm.name.trim()) { setGForm({ ...gForm, bad: true }); return }
    // 원본: 있는 코드로 신규 저장하면 [공지] '이미 등록된 코드입니다.' 와 그 그룹 한 줄 — 등록 창은 열린 채.
    const same = gForm.id ? undefined : groups.find((g) => g.code === gForm.code.trim())
    if (same) { setDupGroup(same); return }
    try {
      if (gForm.id) await api.put(`/special-prices/groups/${gForm.id}`, { code: gForm.code, name: gForm.name })
      else await api.post('/special-prices/groups', { code: gForm.code, name: gForm.name })
      setGForm({ ...gForm, open: false }); void load()
    } catch (err) { setGForm({ ...gForm, error: extractErrorMessage(err) }) }
  }

  // ── 품목별 창 ──
  const emptyItemForm = { open: false, id: null as number | null, groupId: '', itemId: '', unitPrice: '', vat: false, bad: false, error: '' }
  const [iForm, setIForm] = useState(emptyItemForm)
  function openItemForm(r?: SpecialPrice, copy = false) {
    setIForm(r ? { open: true, id: copy ? null : r.id, groupId: String(r.groupId), itemId: copy ? '' : String(r.itemId),
      unitPrice: String(r.unitPrice ?? ''), vat: r.vatIncluded, bad: false, error: '' }
      : { ...emptyItemForm, open: true, groupId: readLastGroup() })
  }
  async function saveItemPrice(e?: FormEvent) {
    e?.preventDefault()
    if (!iForm.groupId || !iForm.itemId) { setIForm({ ...iForm, bad: true }); return }
    const body = { groupId: Number(iForm.groupId), itemId: Number(iForm.itemId), unitPrice: Number(iForm.unitPrice || 0), vatIncluded: iForm.vat }
    try {
      if (iForm.id) await api.put(`/special-prices/${iForm.id}`, body)
      else await api.post('/special-prices', body)
      writeLastGroup(iForm.groupId)
      setIForm({ ...iForm, open: false }); void load()
    } catch (err) { setIForm({ ...iForm, error: extractErrorMessage(err) }) }
  }

  // ── 품목그룹별 창 ──
  const emptyIgForm = { open: false, id: null as number | null, groupId: '', itemGroupId: '', priceBasis: '출고단가', adjustRate: '',
    roundUnit: '소수6자리미만', roundMode: '반올림', bad: false, error: '' }
  const [gpForm, setGpForm] = useState(emptyIgForm)
  function openIgForm(r?: SpecialPriceItemGroup, copy = false) {
    setGpForm(r ? { open: true, id: copy ? null : r.id, groupId: String(r.groupId), itemGroupId: copy ? '' : String(r.itemGroupId),
      priceBasis: r.priceBasis, adjustRate: String(r.adjustRate ?? ''), roundUnit: r.roundUnit, roundMode: r.roundMode, bad: false, error: '' }
      : { ...emptyIgForm, open: true, groupId: readLastGroup() })
  }
  async function saveIgPrice(e?: FormEvent) {
    e?.preventDefault()
    if (!gpForm.groupId || !gpForm.itemGroupId) { setGpForm({ ...gpForm, bad: true }); return }
    const body = { groupId: Number(gpForm.groupId), itemGroupId: Number(gpForm.itemGroupId), priceBasis: gpForm.priceBasis,
      adjustRate: Number(gpForm.adjustRate || 0), roundUnit: gpForm.roundUnit, roundMode: gpForm.roundMode }
    try {
      if (gpForm.id) await api.put(`/special-prices/item-groups/${gpForm.id}`, body)
      else await api.post('/special-prices/item-groups', body)
      writeLastGroup(gpForm.groupId)
      setGpForm({ ...gpForm, open: false }); void load()
    } catch (err) { setGpForm({ ...gpForm, error: extractErrorMessage(err) }) }
  }

  // ── 거래처설정 · 창고설정 ──
  const [member, setMember] = useState<Member | null>(null)
  const [members, setMembers] = useState<SpecialPriceMember[]>([])
  const [memberChecked, setMemberChecked] = useState<Set<number>>(new Set())
  const [add, setAdd] = useState<{ open: boolean; targetId: string; sales: boolean; purchase: boolean; bad: boolean; error: string }>(
    { open: false, targetId: '', sales: false, purchase: false, bad: false, error: '' })
  async function loadMembers(m: Member) {
    const r = m.kind === 'warehouses'
      ? await api.get<SpecialPriceMember[]>(`/special-prices/groups/${m.group.id}/warehouses`)
      : await api.get<SpecialPriceMember[]>(`/special-prices/groups/${m.group.id}/partners`)
    setMembers(r.data); setMemberChecked(new Set())
  }
  function openMember(m: Member) { setMember(m); setMembers([]); void loadMembers(m).catch((e) => setError(extractErrorMessage(e))) }
  async function saveMember(e?: FormEvent) {
    e?.preventDefault()
    if (!member) return
    if (!add.targetId) { setAdd({ ...add, bad: true }); return }
    try {
      const body = { targetId: Number(add.targetId), sales: add.sales, purchase: add.purchase }
      if (member.kind === 'warehouses') await api.post(`/special-prices/groups/${member.group.id}/warehouses`, body)
      else await api.post(`/special-prices/groups/${member.group.id}/partners`, body)
      setAdd({ ...add, open: false }); await loadMembers(member); void load()
    } catch (err) { setAdd({ ...add, error: extractErrorMessage(err) }) }
  }
  async function removeMembers() {
    if (!member) return
    const picked = members.filter((_, i) => memberChecked.has(i))
    if (picked.length === 0) { void ecAlert('삭제할 항목을 선택 바랍니다.'); return }   // 원본 거래처설정 · 창고설정 [선택삭제]
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const m of picked) {
        if (member.kind === 'partners') await api.delete(`/special-prices/groups/${member.group.id}/partners/${m.targetId}`, { params: { tradeType: m.tradeType } })
        else await api.delete(`/special-prices/warehouse-links/${m.id}`)
      }
      await loadMembers(member); void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  // ── 품목설정 · 품목그룹설정(그 그룹의 품목별 · 품목그룹별 줄) ──
  const [scope, setScope] = useState<{ kind: '품목설정' | '품목그룹설정'; group: SpecialPriceGroup } | null>(null)

  // ── 보이는 줄 ──
  const q = quick.trim().toLowerCase()
  const hit = (...v: (string | null | undefined)[]) => !q || v.some((x) => (x ?? '').toLowerCase().includes(q))
  const use = (active: boolean) => useCond === 'ALL' || (useCond === 'Y') === active
  const recent = <T extends { updatedAt?: string | null }>(rows: T[]) =>
    (byUpdated ? [...rows].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')) : rows)
  const shownGroups = recent(groups.filter((g) => use(g.active) && hit(g.code, g.name)))
  const shownPrices = recent(prices.filter((r) => use(r.active) && hit(r.itemCode, r.itemName, r.groupName)))
  const shownIg = igPrices.filter((r) => use(r.active) && hit(r.itemGroupCode, r.itemGroupName, r.groupName))
  const shownApplied = applied.filter((r) => hit(r.itemCode, r.itemName, r.groupName))
  const rowsNow: { id: number; active: boolean }[] =
    pill === '특별단가그룹' ? shownGroups : pill === '품목별' ? shownPrices : pill === '품목그룹별' ? shownIg : []

  async function apply(op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false)
    const ids = [...checked]
    if (ids.length === 0) { void ecAlert(NO_PICK); return }
    if (op === '삭제' && !(await ecConfirm(pill === '특별단가그룹' ? GROUP_DELETE_CONFIRM : '삭제하겠습니까?'))) return
    const params = { params: { active: op === '재사용' } }
    try {
      for (const id of ids) {
        if (pill === '특별단가그룹') {
          if (op === '삭제') await api.delete(`/special-prices/groups/${id}`)
          else await api.patch(`/special-prices/groups/${id}/active`, null, params)
        } else if (pill === '품목별') {
          if (op === '삭제') await api.delete(`/special-prices/${id}`)
          else await api.patch(`/special-prices/${id}/active`, null, params)
        } else {
          if (op === '삭제') await api.delete(`/special-prices/item-groups/${id}`)
          else await api.patch(`/special-prices/item-groups/${id}/active`, null, params)
        }
      }
    } catch (err) {
      // load() 가 error 를 비우므로 알림 창으로 — 예전엔 409 가 나도 아무 말 없이 목록만 다시 그렸다.
      void ecAlert(extractErrorMessage(err))
    }
    setChecked(new Set()); void load()
  }

  function firstPicked<T extends { id: number }>(rows: T[]): T | null {
    const r = rows.find((x) => checked.has(x.id))
    if (!r) void ecAlert(NO_PICK)
    return r ?? null
  }

  const actions = [
    ...(pill === '특별단가그룹' ? [] : [
      { label: '변경', onClick: () => { if (pill === '품목별') { const r = firstPicked(shownPrices); if (r) openItemForm(r) } else { const r = shownIg.find((x) => checked.has(x.id)); if (r) openIgForm(r); else void ecAlert(CHANGE_NO_PICK) } } },
      { label: '복사', onClick: () => { if (pill === '품목별') { const r = firstPicked(shownPrices); if (r) openItemForm(r, true) } else { const r = firstPicked(shownIg); if (r) openIgForm(r, true) } } },
    ]),
    { label: '사용중단/재사용', onClick: () => setMenuOpen((v) => !v) },
    { label: 'Excel' },
    { label: '웹자료올리기' },
  ].filter((x) => pill !== '적용단가' || x.label === 'Excel')

  const allChecked = rowsNow.length > 0 && rowsNow.every((r) => checked.has(r.id))
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(rowsNow.map((r) => r.id)))
  const link = (on: boolean, label: string, go: () => void) => (
    <a href="#" className={on ? SET_TAG : undefined} onClick={(e) => { e.preventDefault(); go() }}>{label}</a>
  )
  const itemLabel = (r: { itemName: string; spec: string | null }) => (r.spec ? `${r.itemName} [${r.spec}]` : r.itemName)
  const memberTargets = member?.kind === 'warehouses' ? warehouseItems : partnerCodeItems(partners)
  const scopeRows = useMemo(() => {
    if (!scope) return { items: [] as SpecialPrice[], groups: [] as SpecialPriceItemGroup[] }
    return { items: prices.filter((r) => r.groupId === scope.group.id), groups: igPrices.filter((r) => r.groupId === scope.group.id) }
  }, [scope, prices, igPrices])

  const formButtons = (onReset: () => void, onClose: () => void) => (
    <div className="flex gap-[6px] mt-[12px]">
      <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
      <button type="button" className="ec-btn" onClick={onReset}>다시 작성</button>
      <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
    </div>
  )

  return (
    <EcListShell
      title="특별단가리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={pill === '적용단가' ? undefined : () => {
        if (pill === '특별단가그룹') setGForm({ open: true, id: null, code: '', name: '', bad: false, error: '' })
        else if (pill === '품목별') openItemForm()
        else openIgForm()
      }}
      actions={actions}
      collapseConditions
    >
      <ul className="ec-cond">
        <EcCond label="사용구분">
          {([['ALL', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]"><input type="radio" name="sp-use" checked={useCond === v} onChange={() => setUseCond(v)} /> {l}</label>
          ))}
        </EcCond>
        <EcCond label="수정일자순(정렬)">
          <label><input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순</label>
        </EcCond>
      </ul>
      <div className="ec-pills mb-[8px]">
        {PILLS.map((p) => (
          <button key={p} type="button" className={`ec-pill ${pill === p ? 'active' : ''}`} onClick={() => switchPill(p)}>{p}</button>
        ))}
      </div>
      {menuOpen && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
          <div className="ec-menu fixed top-auto right-auto bottom-[44px] left-[300px] mobile:left-[16px]">
            {(['사용중단', '삭제', '재사용'] as const).map((op) => <button key={op} type="button" onClick={() => void apply(op)}>{op}</button>)}
          </div>
        </>
      )}
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {enabled && (!enabled.SALES || !enabled.PURCHASE) && (
        <p className="ec-alert ec-alert-info mb-[8px]">
          단가적용순서설정에서 특별단가(창고별 · 거래처별)가 {!enabled.SALES && !enabled.PURCHASE ? '영업 · 구매 모두' : !enabled.SALES ? '영업관리' : '구매관리'} '사용안함' 입니다 —
          여기 등록한 특별단가가 그쪽 전표에 걸리지 않습니다. <a href="/inventory/price-order" className="text-ec-blue">단가적용순서설정</a>
        </p>
      )}

      {pill === '특별단가그룹' && (
        <table className="w-full text-left">
          <thead><tr>
            <th className="w-[34px] text-center"><NumCheck tone="plain" no="" on={allChecked} onChange={toggleAll} /></th><th>특별단가그룹코드</th><th>특별단가그룹명</th>
            <th className="text-center">거래처설정</th><th className="text-center">창고설정</th>
            <th className="text-center">품목설정</th><th className="text-center">품목그룹설정</th>
          </tr></thead>
          <tbody>
            {shownGroups.length === 0 ? <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              : shownGroups.map((g, i) => (
                <tr key={g.id} className={g.active ? undefined : 'text-ec-hint'}>
                  <td className="text-center"><NumCheck tone="plain" no={i + 1} on={checked.has(g.id)} onChange={() => toggle(g.id)} /></td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); setGForm({ open: true, id: g.id, code: g.code, name: g.name, bad: false, error: '' }) }}>{g.code}</a></td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); setGForm({ open: true, id: g.id, code: g.code, name: g.name, bad: false, error: '' }) }}>{g.name}</a></td>
                  <td className="text-center">{link(g.hasPartners, '거래처설정', () => openMember({ kind: 'partners', group: g }))}</td>
                  <td className="text-center">{link(g.hasWarehouses, '창고설정', () => openMember({ kind: 'warehouses', group: g }))}</td>
                  <td className="text-center">{link(g.hasItems, '품목설정', () => setScope({ kind: '품목설정', group: g }))}</td>
                  <td className="text-center">{link(g.hasItemGroups, '품목그룹설정', () => setScope({ kind: '품목그룹설정', group: g }))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {pill === '품목별' && (
        <table className="w-full text-left">
          <thead><tr>
            <th className="w-[34px] text-center"><NumCheck tone="plain" no="" on={allChecked} onChange={toggleAll} /></th><th>품목코드</th><th>품목명[규격]</th><th>품목그룹명</th><th>특별단가그룹명</th>
            <th className="text-right">적용단가</th><th className="text-center">Vat포함여부</th>
          </tr></thead>
          <tbody>
            {shownPrices.length === 0 ? <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              : shownPrices.map((r, i) => (
                <tr key={r.id} className={r.active ? undefined : 'text-ec-hint'}>
                  <td className="text-center"><NumCheck tone="plain" no={i + 1} on={checked.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); openItemForm(r) }}>{r.itemCode}</a></td>
                  <td>{itemLabel(r)}</td><td>{r.itemGroupName ?? ''}</td><td>{r.groupName}</td>
                  <td className="text-right">{won(r.unitPrice)}</td><td className="text-center">{r.vatIncluded ? '포함' : '미포함'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {pill === '품목그룹별' && (
        <table className="w-full text-left">
          <thead><tr>
            <th className="w-[34px] text-center"><NumCheck tone="plain" no="" on={allChecked} onChange={toggleAll} /></th><th>품목그룹코드</th><th>품목그룹명</th><th>특별단가그룹명</th><th>품목그룹별 조정내역</th>
          </tr></thead>
          <tbody>
            {shownIg.length === 0 ? <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              : shownIg.map((r, i) => (
                <tr key={r.id} className={r.active ? undefined : 'text-ec-hint'}>
                  <td className="text-center"><NumCheck tone="plain" no={i + 1} on={checked.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); openIgForm(r) }}>{r.itemGroupCode}</a></td>
                  <td>{r.itemGroupName}</td><td>{r.groupName}</td><td>{r.adjustText}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {pill === '적용단가' && (
        <table className="w-full text-left">
          <thead><tr>
            <th>품목코드</th><th>품목명[규격]</th><th>품목그룹명</th><th>구분</th><th>특별단가그룹명</th>
            <th>품목그룹별 조정내역</th><th className="text-right">적용단가</th><th className="text-center">Vat포함여부</th>
          </tr></thead>
          <tbody>
            {shownApplied.length === 0 ? <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              : shownApplied.map((r) => (
                <tr key={`${r.itemId}-${r.groupCode}`}>
                  <td>{r.itemCode}</td><td>{itemLabel(r)}</td><td>{r.itemGroupName ?? ''}</td><td>{r.kind}</td>
                  <td>{r.groupName}</td><td>{r.adjustText}</td>
                  <td className="text-right">{won(r.unitPrice)}</td><td className="text-center">{r.vatIncluded ? '포함' : '미포함'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {/* 특별단가그룹등록 · 수정 */}
      <Modal error={gForm.error} open={gForm.open} title={gForm.id ? '특별단가그룹수정' : '특별단가그룹등록'} width={760} onClose={() => setGForm({ ...gForm, open: false })}>{(
        <form onSubmit={saveGroup}>
          <ul className="ec-form">
            <li className="wide"><span className="title">특별단가그룹코드</span><div className="form">
              {gForm.id ? <span>{gForm.code}</span> : (
                <input className={`ec-input w-full ${gForm.bad && !gForm.code.trim() ? BAD : ''}`} placeholder="특별단가그룹코드" autoFocus
                       value={gForm.code} onChange={(e) => setGForm({ ...gForm, code: e.target.value })} />)}
            </div></li>
            <li className="wide"><span className="title">특별단가그룹명</span><div className="form">
              <input className={`ec-input w-full ${gForm.bad && !gForm.name.trim() ? BAD : ''}`} placeholder="특별단가그룹명"
                     value={gForm.name} onChange={(e) => setGForm({ ...gForm, name: e.target.value })} />
            </div></li>
          </ul>
          {formButtons(() => setGForm({ ...gForm, code: gForm.id ? gForm.code : '', name: gForm.id ? (groups.find((g) => g.id === gForm.id)?.name ?? '') : '', bad: false }),
            () => setGForm({ ...gForm, open: false }))}
        </form>
      )}</Modal>

      {/* 원본 [공지] — 있는 특별단가그룹코드로 신규 저장(2026-10-14 실측). 자료 칸은 '특별단가그룹 등록'. */}
      <Modal error={error} open={dupGroup != null} title="공지" width={480} onClose={() => setDupGroup(null)}>{dupGroup && (
        <div className="p-[4px]">
          <p className="mt-0 mb-[8px] text-[12.5px]">이미 등록된 코드입니다.</p>
          <table className="w-full">
            <thead><tr><th>특별단가그룹코드</th><th>특별단가그룹명</th><th>사용구분</th><th>자료</th></tr></thead>
            <tbody><tr className="text-center">
              <td>{dupGroup.code}</td><td>{dupGroup.name}</td><td>{dupGroup.active ? '사용중' : '사용중단'}</td><td>특별단가그룹 등록</td>
            </tr></tbody>
          </table>
          <div className="mt-[12px] flex justify-end"><button type="button" className="ec-btn" onClick={() => setDupGroup(null)}>닫기</button></div>
        </div>
      )}</Modal>

      {/* 품목별특별단가등록 */}
      <Modal error={iForm.error} open={iForm.open} title="품목별특별단가등록" width={959} onClose={() => setIForm({ ...iForm, open: false })}>{(
        <form onSubmit={saveItemPrice}>
          <ul className="ec-form [&>li>.title]:basis-[154px]">
            <li className="wide"><span className="title">특별단가그룹코드</span><div className={`form ${iForm.bad && !iForm.groupId ? BAD_BOX : ''}`}>
              <CodePickerField label="특별단가그룹코드" hideLabel fill placeholder="특별단가그룹코드" disabled={!!iForm.id}
                               value={iForm.groupId} onChange={(v) => setIForm({ ...iForm, groupId: v })} items={groupItems} />
            </div></li>
            <li className="wide"><span className="title">품목</span><div className={`form ${iForm.bad && !iForm.itemId ? BAD_BOX : ''}`}>
              <CodePickerField label="품목" hideLabel fill placeholder="품목" disabled={!!iForm.id}
                               value={iForm.itemId} onChange={(v) => setIForm({ ...iForm, itemId: v })} items={itemItems} />
            </div></li>
            <li className="wide"><span className="title">적용단가</span><div className="form flex items-center gap-[8px]">
              <input className="ec-input text-right flex-1" placeholder="적용단가" inputMode="decimal"
                     value={iForm.unitPrice} onChange={(e) => setIForm({ ...iForm, unitPrice: e.target.value.replace(/[^0-9.]/g, '') })} />
              <label className="whitespace-nowrap"><input type="checkbox" checked={iForm.vat} onChange={(e) => setIForm({ ...iForm, vat: e.target.checked })} /> VAT포함</label>
            </div></li>
          </ul>
          {formButtons(() => setIForm({ ...iForm, itemId: iForm.id ? iForm.itemId : '', unitPrice: '', vat: false, bad: false }), () => setIForm({ ...iForm, open: false }))}
        </form>
      )}</Modal>

      {/* 품목그룹추가 */}
      <Modal error={gpForm.error} open={gpForm.open} title={gpForm.id ? '품목그룹수정' : '품목그룹추가'} width={959} onClose={() => setGpForm({ ...gpForm, open: false })}>{(
        <form onSubmit={saveIgPrice}>
          <ul className="ec-form">
            <li className="wide"><span className="title">특별단가그룹코드</span><div className={`form ${gpForm.bad && !gpForm.groupId ? BAD_BOX : ''}`}>
              <CodePickerField label="특별단가그룹코드" hideLabel fill placeholder="특별단가그룹코드" disabled={!!gpForm.id}
                               value={gpForm.groupId} onChange={(v) => setGpForm({ ...gpForm, groupId: v })} items={groupItems} />
            </div></li>
            <li className="wide"><span className="title">품목그룹</span><div className={`form ${gpForm.bad && !gpForm.itemGroupId ? BAD_BOX : ''}`}>
              <CodePickerField label="품목그룹" hideLabel fill placeholder="품목그룹" disabled={!!gpForm.id}
                               value={gpForm.itemGroupId} onChange={(v) => setGpForm({ ...gpForm, itemGroupId: v })} items={itemGroupItems} />
            </div></li>
            <li className="wide"><span className="title">단가기준</span><div className="form">
              <select className="ec-input w-full" value={gpForm.priceBasis} onChange={(e) => setGpForm({ ...gpForm, priceBasis: e.target.value })}>
                {options.priceBases.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div></li>
            <li className="wide"><span className="title">조정_비율(%)</span><div className="form">
              <input className="ec-input w-full text-right" placeholder="조정_비율(%)" inputMode="decimal"
                     value={gpForm.adjustRate} onChange={(e) => setGpForm({ ...gpForm, adjustRate: e.target.value.replace(/[^0-9.-]/g, '') })} />
            </div></li>
            <li className="wide"><span className="title">조정_단위처리</span><div className="form flex gap-[6px]">
              <select className="ec-input flex-1" value={gpForm.roundUnit} onChange={(e) => setGpForm({ ...gpForm, roundUnit: e.target.value })}>
                {(options.roundUnits.includes(gpForm.roundUnit) ? options.roundUnits : [gpForm.roundUnit, ...options.roundUnits]).map((o) => <option key={o}>{o}</option>)}
              </select>
              <select className="ec-input flex-1" value={gpForm.roundMode} onChange={(e) => setGpForm({ ...gpForm, roundMode: e.target.value })}>
                {options.roundModes.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div></li>
          </ul>
          {formButtons(() => setGpForm({ ...emptyIgForm, open: true, id: gpForm.id, groupId: gpForm.groupId, itemGroupId: gpForm.id ? gpForm.itemGroupId : '' }),
            () => setGpForm({ ...gpForm, open: false }))}
        </form>
      )}</Modal>

      {/* 거래처설정 · 창고설정 */}
      <Modal error={error} open={!!member} title={member?.kind === 'warehouses' ? '창고설정' : '거래처설정'} width={760} onClose={() => setMember(null)}>{(
        <div>
          <table className="w-full text-left">
            <thead><tr>
              <th className="w-[34px]"></th><th>구분</th>
              <th>{member?.kind === 'warehouses' ? '창고코드' : '거래처코드'}</th><th>{member?.kind === 'warehouses' ? '창고명' : '거래처명'}</th>
            </tr></thead>
            <tbody>
              {members.length === 0 ? <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                : members.map((m, i) => (
                  <tr key={`${m.tradeType}-${m.id}`}>
                    <td className="text-center"><NumCheck tone="plain" no={i + 1} on={memberChecked.has(i)}
                      onChange={() => setMemberChecked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })} /></td>
                    <td>{m.tradeTypeName}</td><td>{m.code}</td><td>{m.name}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setAdd({ open: true, targetId: '', sales: false, purchase: false, bad: false, error: '' })}>추가</button>
            <button type="button" className="ec-btn" onClick={() => void removeMembers()}>선택삭제</button>
            <button type="button" className="ec-btn" onClick={() => setMember(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      <Modal error={add.error} open={add.open && !!member} title={member?.kind === 'warehouses' ? '창고추가' : '거래처추가'} width={760} onClose={() => setAdd({ ...add, open: false })}>{(
        <form onSubmit={saveMember}>
          <ul className="ec-form">
            <li className="wide"><span className="title">특별단가그룹</span><div className="form"><span>{member?.group.code}</span></div></li>
            <li className="wide"><span className="title">특별단가그룹명</span><div className="form"><span>{member?.group.name}</span></div></li>
            <li className="wide"><span className="title">{member?.kind === 'warehouses' ? '창고' : '거래처'}</span>
              <div className={`form ${add.bad && !add.targetId ? BAD_BOX : ''}`}>
                <CodePickerField label={member?.kind === 'warehouses' ? '창고' : '거래처'} hideLabel fill
                                 placeholder={member?.kind === 'warehouses' ? '창고' : '거래처'}
                                 value={add.targetId} onChange={(v) => setAdd({ ...add, targetId: v })} items={memberTargets} />
              </div></li>
            <li className="wide"><span className="title">구분</span><div className="form flex gap-[12px]">
              <label><input type="checkbox" checked={add.sales} onChange={(e) => setAdd({ ...add, sales: e.target.checked })} /> 영업단가그룹</label>
              <label><input type="checkbox" checked={add.purchase} onChange={(e) => setAdd({ ...add, purchase: e.target.checked })} /> 구매단가그룹</label>
            </div></li>
          </ul>
          {formButtons(() => setAdd({ ...add, targetId: '', sales: false, purchase: false, bad: false, error: '' }), () => setAdd({ ...add, open: false }))}
        </form>
      )}</Modal>

      {/* 품목설정 · 품목그룹설정 — 그 그룹의 줄 */}
      <Modal error={error} open={!!scope} title={scope?.kind ?? ''} width={959} onClose={() => setScope(null)}>{(
        <div>
          {scope?.kind === '품목설정' ? (
            <table className="w-full text-left">
              <thead><tr><th>품목코드</th><th>품목명[규격]</th><th>품목그룹명</th><th>특별단가그룹명</th><th className="text-right">적용단가</th><th className="text-center">Vat포함여부</th></tr></thead>
              <tbody>
                {scopeRows.items.length === 0 ? <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                  : scopeRows.items.map((r) => (
                    <tr key={r.id}><td>{r.itemCode}</td><td>{itemLabel(r)}</td><td>{r.itemGroupName ?? ''}</td><td>{r.groupName}</td>
                      <td className="text-right">{won(r.unitPrice)}</td><td className="text-center">{r.vatIncluded ? '포함' : '미포함'}</td></tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left">
              <thead><tr><th>품목그룹코드</th><th>품목그룹명</th><th>특별단가그룹명</th><th>품목그룹별 조정내역</th></tr></thead>
              <tbody>
                {scopeRows.groups.length === 0 ? <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                  : scopeRows.groups.map((r) => (
                    <tr key={r.id}><td>{r.itemGroupCode}</td><td>{r.itemGroupName}</td><td>{r.groupName}</td><td>{r.adjustText}</td></tr>
                  ))}
              </tbody>
            </table>
          )}
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => {
              const g = scope?.group; setScope(null)
              if (!g) return
              writeLastGroup(String(g.id))
              if (scope?.kind === '품목설정') openItemForm(); else openIgForm()
            }}>신규(F2)</button>
            <button type="button" className="ec-btn" onClick={() => setScope(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>
    </EcListShell>
  )
}

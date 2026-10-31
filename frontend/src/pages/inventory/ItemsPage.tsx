import { useEffect, useState, type FormEvent } from 'react'
import { GRADE_LABELS } from '../../utils/gradePrices'
import { api, extractErrorMessage } from '../../api/client'
import type { CodeOption, GroupMaster, Item, ManagementItem, Partner } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcFileDrop from '../../components/EcFileDrop'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import GroupMasterModal from '../../components/GroupMasterModal'
import { partnerCodeItems } from '../../utils/codeItems'
import { useTableSort } from '../../utils/useTableSort'
import { useNavigate } from 'react-router-dom'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'
import ItemFormWindow from '../../features/item/components/ItemFormWindow'
import { emptyForm, notHere, procIds, type FormTab, type ItemForm, type QcTypeOption } from '../../features/item/itemForm'
import { clearItemSuggestCache } from '../../features/item/api/itemSuggest'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import NumCheck from '../../components/NumCheck'
import UnusedCodeModal from '../../features/unusedcode/UnusedCodeModal'
import { shrinkImage } from '../../utils/imageResize'
import EcIcon from '../../components/ui/EcIcon'
import { EcDateRange } from '../../components/ui/EcDateInput'

/** 원본 품목구분 차례: 원재료 · 부재료 · 제품 · 반제품 · 상품 · 무형상품(기본 상품). */
const CATEGORY_ORDER = ['RAW_MATERIAL', 'SUB_MATERIAL', 'FINISHED', 'SEMI_FINISHED', 'MERCHANDISE', 'INTANGIBLE']
const CATEGORY_NAME: Record<string, string> = {
  RAW_MATERIAL: '원재료', SUB_MATERIAL: '부재료', FINISHED: '제품', SEMI_FINISHED: '반제품', MERCHANDISE: '상품', INTANGIBLE: '무형상품',
}

const ZERO_GRADES = GRADE_LABELS.map(() => '0')

/** 원본 리스트 버튼이 고른 줄 없이 눌렸을 때의 알림(거래처 · 창고 · 품목 리스트 같은 글, C000029 [바코드] 실측). */
const NO_PICK = '리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.'
/** '삭제불가코드' 창 [사용중단] 을 체크 없이 — 원본은 두 줄 사이에 빈 줄이 있다(2026-10-21 실측). */
const NO_PICK_BLOCKED = '리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.'

/** 서버가 돌려준 지울 수 없는 품목 — 원본 '삭제불가코드' 창의 코드 · 코드명 · 자료. */
type Undeletable = { id: number; code: string; name: string; data: string }

/**
 * 다음 품목코드 — 원본은 <b>마지막으로 만든 코드 + 1</b> 을 채운다(Z00012 를 만들면 다음 신규는 Z00013).
 * 끝의 숫자를 자릿수 그대로 하나 올린다. 숫자로 안 끝나면 빈칸(직접 넣는다).
 */
export function nextItemCode(items: Pick<Item, 'id' | 'code'>[]): string {
  const last = [...items].sort((a, b) => b.id - a.id)[0]
  const m = last?.code.match(/^(.*?)(\d+)$/)
  if (!m) return ''
  return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0')
}

export default function ItemsPage() {
  /** 원본 [재고조정] — 고른 품목으로 조정 화면을 연다. */
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [grades, setGrades] = useState<string[]>(ZERO_GRADES)
  const [categories, setCategories] = useState<CodeOption[]>([])
  const [mgmtItems, setMgmtItems] = useState<ManagementItem[]>([])
  const [itemGroups, setItemGroups] = useState<GroupMaster[]>([])
  const [formTab, setFormTab] = useState<FormTab>('기본')
  /** 구매처 후보. 이름은 서버가 아니라 여기서 붙인다 — inventory 는 거래처를 모른다. */
  const [partners, setPartners] = useState<Partner[]>([])
  const [groupOpen, setGroupOpen] = useState(false)  // 계층그룹 모달
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<ItemForm>({ ...emptyForm })
  /**
   * 마지막 [저장] 이 품목명이 비어 막혔는가. 원본은 글을 띄우지 않고 품목명 칸에 빨간 테두리를 두르고
   * 품목명이 있는 두 탭([기본] · [품목정보]) 오른쪽 위에 빨간 동그라미 '!' 를 단다. 창은 열린 채, 탭은 그대로.
   */
  const [invalid, setInvalid] = useState(false)
  /** 원본 [공지] 창 — 같은 품목코드로 신규 저장하면 '이미 등록된 코드입니다.' 와 그 품목을 보여 준다. */
  const [dup, setDup] = useState<Item | null>(null)
  const [editMenu, setEditMenu] = useState(false)  // 수정 창 [사용중단/재사용 ▴] 펼침
  /** 원본 [이미지]. 파일을 먼저 올리고(POST /api/files) 그 id 를 품목에 붙인다. */
  const [image, setImage] = useState<{ id: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)

  /** 원본 [생산공정] 후보 — 공정등록. inventory 는 production 을 모르므로 이름은 이 목록에서 붙인다. */
  const [processes, setProcesses] = useState<{ id: number; code: string; name: string; active: boolean }[]>([])

  /** 품질검사유형 마스터와 품목 → 유형 연결(유형마다 [품목설정] 을 읽어 만든다). 한 품목은 한 유형에만 붙는다. */
  const [qcTypes, setQcTypes] = useState<QcTypeOption[]>([])
  const [qcTypeOf, setQcTypeOf] = useState<Map<number, number>>(new Map())
  /** 창에서 고른 유형 id('' = 없음). 품목 저장 요청에는 안 싣고 저장 뒤 [품목설정] 으로 옮긴다. */
  const [qcTypeId, setQcTypeId] = useState('')

  async function loadQcTypes() {
    try {
      const t = await api.get<QcTypeOption[]>('/quality-types')
      const lists = await Promise.all(t.data.map((x) => api.get<{ itemId: number }[]>(`/quality-types/${x.id}/items`)))
      const m = new Map<number, number>()
      t.data.forEach((x, k) => lists[k].data.forEach((it) => m.set(it.itemId, x.id)))
      setQcTypes(t.data)
      setQcTypeOf(m)
      return m
    } catch {
      /* 품질 화면 권한이 없거나 실패해도 품목등록은 그대로 쓴다 — 칸만 비어 보인다. */
      return null
    }
  }

  async function load() {
    // 등록·수정·삭제 뒤 load() 를 부른다 — 그때 품목명·규격 자동완성의 옛 후보도 버린다.
    clearItemSuggestCache()
    setLoading(true)
    try {
      const [i, c, m, g, pt, pr] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<CodeOption[]>('/meta/item-categories'),
        api.get<ManagementItem[]>('/management-items'),
        api.get<GroupMaster[]>('/item-groups'),
        api.get<Partner[]>('/partners'),
        api.get<{ id: number; code: string; name: string; active: boolean }[]>('/processes'),
      ])
      setProcesses(pr.data)
      setItems(i.data)
      setCategories(c.data)
      setMgmtItems(m.data)
      setItemGroups(g.data)
      setPartners(pt.data)
      loadQcTypes()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  /** 품목구분 라디오 — 원본 차례, 이름은 서버 목록이 있으면 그것으로. */
  const categoryOptions: [string, string][] = CATEGORY_ORDER
    .filter((c) => categories.length === 0 || categories.some((x) => x.code === c))
    .map((c) => [c, categories.find((x) => x.code === c)?.name ?? CATEGORY_NAME[c]])

  function openCreate() {
    setFormTab('기본')
    setEditId(null)
    setInvalid(false)
    setEditMenu(false)
    setForm({ ...emptyForm, code: nextItemCode(items) })
    setQcTypeId('')
    setGrades(ZERO_GRADES)
    setImage(null)
    setShowForm(true)
  }

  /** 원본 [이미지] — 기안서 첨부·ECDrive 와 같은 흐름(먼저 올리고 id 를 붙인다). */
  async function uploadImage(file: File) {
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', await shrinkImage(file))
      const r = await api.post<{ id: number; name: string }>('/files', fd)
      setImage({ id: r.data.id, name: r.data.name })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  function formOf(item: Item): ItemForm {
    return {
      code: item.code,
      name: item.name,
      spec: item.spec ?? '',
      unit: item.unit ?? '',
      category: item.category,
      unitPrice: String(item.unitPrice),
      purchasePrice: String(item.purchasePrice ?? 0),
      safetyStock: String(item.safetyStock),
      barcode: item.barcode ?? '',
      supplierId: item.supplierId != null ? String(item.supplierId) : '',
      searchKeyword: item.searchKeyword ?? '',
      stockTracked: item.stockTracked === false ? 'N' : 'Y',
      active: item.active ? 'Y' : 'N',
      udiDi: item.udiDi ?? '',
      managementItemId: item.managementItemId != null ? String(item.managementItemId) : '',
      itemGroupId: item.itemGroupId != null ? String(item.itemGroupId) : '',
      productionProcessIds: (item.productionProcessIds ?? []).join(','),
      remark: item.remark ?? '',
      vatRateSales: String(item.vatRateSales ?? 10),
      vatRatePurchase: String(item.vatRatePurchase ?? 10),
      subcontractPrice: String(item.subcontractPrice ?? 0),
      stdLaborHours: String(item.stdLaborHours ?? 1),
      expenseWeight: String(item.expenseWeight ?? 1),
      materialStdCost: item.materialStdCost != null ? String(item.materialStdCost) : '',
      expenseStdCost: String(item.expenseStdCost ?? 0),
      laborStdCost: String(item.laborStdCost ?? 0),
      subcontractStdCost: String(item.subcontractStdCost ?? 0),
      leadTimeDays: String(item.leadTimeDays ?? 0),
      minPurchaseUnit: String(item.minPurchaseUnit ?? 0),
      itemType: item.itemType ?? '',
      parentItemId: item.parentItemId != null ? String(item.parentItemId) : '',
      setItem: item.setItem ? 'Y' : 'N',
      sharedItem: item.sharedItem ? 'Y' : 'N',
      lotManaged: item.lotManaged ? 'Y' : 'N',
      qcType: item.qcType ?? '',
      qcMethod: item.qcMethod ?? '',
      qcOnPurchase: item.qcOnPurchase ? 'Y' : 'N',
      qcOnProduction: item.qcOnProduction ? 'Y' : 'N',
      autoProductionOnSales: item.autoProductionOnSales ? 'Y' : 'N',
      autoProductionOnTransfer: item.autoProductionOnTransfer ? 'Y' : 'N',
    }
  }

  function openEdit(item: Item) {
    /* 고치려고 열 때도 첫 탭부터 — 앞서 보던 탭이 남아 있으면 코드가 안 보인다. */
    setFormTab('기본')
    setEditId(item.id)
    setInvalid(false)
    setEditMenu(false)
    setGrades(GRADE_LABELS.map((_, i) => String(item.gradePrices?.[i] ?? 0)))
    /* 품질검사유형은 마스터 [품목설정] 이 정한다 — 품목의 qcType 글자(옛 고정값 수입 · 공정 · 출하검사)는 따르지 않는다. */
    const qt = qcTypes.find((x) => x.id === qcTypeOf.get(item.id))
    setForm({ ...formOf(item), qcType: (qt?.name ?? '').slice(0, 20) })
    setQcTypeId(qt ? String(qt.id) : '')
    setImage(item.imageFileId != null ? { id: item.imageFileId, name: item.imageFileName ?? '' } : null)
    setShowForm(true)
  }

  /** 수정 창 [복사] — 같은 값으로 새 창을 연다. 코드는 다음 번호. */
  function copyAsNew() {
    setEditId(null)
    setInvalid(false)
    setEditMenu(false)
    setForm((f) => ({ ...f, code: nextItemCode(items), active: 'Y' }))
    setFormTab('기본')
  }

  /** [다시 작성] — 코드만 남기고 새 창의 기본값으로. */
  function resetForm() {
    setInvalid(false)
    setForm((f) => ({ ...emptyForm, code: f.code, active: f.active }))
    setQcTypeId('')
    setGrades(ZERO_GRADES)
    setImage(null)
  }

  function set(field: keyof ItemForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const closeForm = () => { setShowForm(false); setEditId(null); setEditMenu(false) }

  async function submit(e?: FormEvent, again = false) {
    e?.preventDefault()
    setError('')
    if (!form.name.trim()) { setInvalid(true); return }
    setInvalid(false)
    if (editId == null) {
      const same = items.find((x) => x.code === form.code.trim())
      if (same) { setDup(same); return }
    }
    const payload = {
      ...form,
      code: form.code.trim(),
      unitPrice: Number(form.unitPrice) || 0,
      purchasePrice: Number(form.purchasePrice) || 0,
      gradePrices: grades.map((g) => Number(g) || 0),
      safetyStock: Number(form.safetyStock) || 0,
      stockTracked: form.stockTracked === 'Y',
      active: form.active === 'Y',
      managementItemId: form.managementItemId ? Number(form.managementItemId) : null,
      itemGroupId: form.itemGroupId ? Number(form.itemGroupId) : null,
      productionProcessIds: procIds(form.productionProcessIds),
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      imageFileId: image ? image.id : null,
      /* 숫자는 숫자로, 'Y'/'N' 은 참/거짓으로 바꿔 보낸다 — 서버는 문자열을 안 받는다. */
      vatRateSales: Number(form.vatRateSales) || 0,
      vatRatePurchase: Number(form.vatRatePurchase) || 0,
      subcontractPrice: Number(form.subcontractPrice) || 0,
      /* 원가 탭 세 칸은 늘 같이 보낸다 — 재료비표준원가 빈칸은 빈칸(null)으로 저장(원본 새 창 기본). */
      stdLaborHours: form.stdLaborHours.trim() === '' ? 0 : Number(form.stdLaborHours) || 0,
      expenseWeight: form.expenseWeight.trim() === '' ? 0 : Number(form.expenseWeight) || 0,
      materialStdCost: form.materialStdCost.trim() === '' ? null : Number(form.materialStdCost) || 0,
      leadTimeDays: Number(form.leadTimeDays) || 0,
      minPurchaseUnit: Number(form.minPurchaseUnit) || 0,
      parentItemId: form.parentItemId ? Number(form.parentItemId) : null,
      setItem: form.setItem === 'Y',
      sharedItem: form.sharedItem === 'Y',
      lotManaged: form.lotManaged === 'Y',
      qcOnPurchase: form.qcOnPurchase === 'Y',
      qcOnProduction: form.qcOnProduction === 'Y',
      autoProductionOnSales: form.autoProductionOnSales === 'Y',
      autoProductionOnTransfer: form.autoProductionOnTransfer === 'Y',
    }
    let savedId: number | null = editId
    try {
      if (editId) {
        await api.put(`/items/${editId}`, payload)
      } else {
        savedId = (await api.post<{ id: number }>('/items', payload)).data.id
      }
    } catch (err) {
      setError(extractErrorMessage(err))
      return
    }
    try {
      /* 품질검사유형 — 품질검사유형등록 [품목설정] 과 같은 연결. 앞 유형에서 빼고 새 유형에 넣는다. */
      const before = savedId != null ? qcTypeOf.get(savedId) : undefined
      const after = qcTypeId ? Number(qcTypeId) : undefined
      if (savedId != null && before !== after) {
        if (before != null) await api.post(`/quality-types/${before}/items/remove`, { itemIds: [savedId] })
        if (after != null) await api.post(`/quality-types/${after}/items`, { itemIds: [savedId] })
      }
      /* 원본은 저장하면 말 없이 창을 닫고 목록만 다시 그린다(신규 · 수정 둘 다). */
      closeForm()
      await load()
      /* 저장 ▲ [저장/신규] — 닫지 않은 듯 새 품목 창을 다시 연다(코드는 방금 저장한 것 다음). */
      if (again) {
        openCreate()
        setForm({ ...emptyForm, code: nextItemCode([...items, { id: savedId ?? Number.MAX_SAFE_INTEGER, code: payload.code }]) })
      }
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  // 그리드 행 선택(번호 체크 칸)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  function toggle(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  /**
   * 그 품목을 <b>통째로</b> 만든다. 바꿀 칸만 얹고 나머지는 있는 값 그대로 보낸다 —
   * 수정은 통째로 덮으므로 몇 칸만 보내면 검색창내용·바코드·관리항목·품목그룹·이미지가
   * 조용히 지워진다. 값은 그대로 넘긴다(null 을 '' 로 바꾸면 '안 적었다' 와 '비워 두었다' 가 뒤섞인다).
   */
  const wholeItem = (it: Item, patch: Record<string, unknown> = {}) => ({
    code: it.code, name: it.name, spec: it.spec, unit: it.unit, category: it.category,
    unitPrice: it.unitPrice, purchasePrice: it.purchasePrice ?? 0, safetyStock: it.safetyStock,
    barcode: it.barcode, searchKeyword: it.searchKeyword, udiDi: it.udiDi,
    stockTracked: it.stockTracked !== false,
    active: it.active,
    managementItemId: it.managementItemId ?? null,
    itemGroupId: it.itemGroupId ?? null,
    supplierId: it.supplierId ?? null,
    imageFileId: it.imageFileId ?? null,
    ...patch,
  })

  /*
   * 원본 품목등록 리스트의 <b>[변경]</b> — 고른 품목의 한 칸을 한 번에 바꾼다.
   */
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkField, setBulkField] = useState<'itemGroupId' | 'managementItemId' | 'supplierId' | 'stockTracked'>('itemGroupId')
  const [bulkValue, setBulkValue] = useState('')

  async function bulkChange() {
    const targets = shown.filter((it) => selected.has(it.id))
    if (targets.length === 0) { void ecAlert(NO_PICK); return }
    const patch = bulkField === 'stockTracked'
      ? { stockTracked: bulkValue === 'Y' }
      : { [bulkField]: bulkValue ? Number(bulkValue) : null }
    const results = await Promise.allSettled(
      targets.map((it) => api.put(`/items/${it.id}`, wholeItem(it, patch))))
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelected(new Set())
    setBulkOpen(false)
    await load()
    if (failed > 0) void ecAlert(`${targets.length - failed}건 변경, ${failed}건 실패.`)
  }

  async function setActive(targets: Item[], active: boolean) {
    const results = await Promise.allSettled(
      targets.map((it) => api.put(`/items/${it.id}`, wholeItem(it, { active }))))
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelected(new Set())
    await load()
    if (failed > 0) void ecAlert(`${targets.length - failed}건 ${active ? '재사용' : '사용중단'}, ${failed}건 실패.`)
  }

  /** [사용중단/재사용] 본 버튼 — 고른 것이 모두 사용중단이면 되살리고, 하나라도 살아 있으면 중단한다. */
  async function toggleActive() {
    const targets = shown.filter((it) => selected.has(it.id))
    if (targets.length === 0) { void ecAlert(NO_PICK); return }
    const next = targets.every((it) => !it.active)
    if (!next && !(await ecConfirm('선택한 코드를 사용중단 하겠습니까?'))) return   // 원본: 사용중단만 확인 창, 재사용은 바로
    await setActive(targets, next)
  }

  /** 펼침의 [사용중단] · [재사용] — 고른 줄만. */
  async function setActiveChecked(active: boolean) {
    const targets = shown.filter((it) => selected.has(it.id))
    if (targets.length === 0) { void ecAlert(NO_PICK); return }
    if (!active && !(await ecConfirm('선택한 코드를 사용중단 하겠습니까?'))) return
    await setActive(targets, active)
  }

  /**
   * 원본은 줄마다 [삭제] 가 없다 — 체크한 줄을 [사용중단/재사용 ▴] 펼침의 [삭제] 로 지운다.
   * 확인 창 '삭제하겠습니까?', 지운 뒤에는 말 없이 목록만 다시 그린다(C000029 실측).
   * 전표 · 자료가 걸린 품목은 서버가 지우지 않고 돌려준다 → 원본 '삭제불가코드' 창(2026-10-21 실측).
   */
  async function removeSelected() {
    if (selected.size === 0) { void ecAlert(NO_PICK); return }
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    await removeIds(Array.from(selected))
  }

  async function removeIds(ids: number[]) {
    try {
      const { data } = await api.post<{ deleted: number; undeletable: Undeletable[] }>('/items/delete', { ids })
      setSelected(new Set())
      await load()
      if (data.undeletable.length > 0) { setBlockedPick(new Set()); setBlocked(data.undeletable) }
      return data.undeletable.length === 0
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
      return false
    }
  }

  /** '삭제불가코드' 창 [사용중단] — 창 안에서 체크한 줄만. 확인 글 · 알림 원본 그대로. */
  const [blocked, setBlocked] = useState<Undeletable[] | null>(null)
  const [blockedPick, setBlockedPick] = useState<Set<number>>(new Set())
  async function stopBlocked() {
    const targets = items.filter((it) => blockedPick.has(it.id))
    if (targets.length === 0) { void ecAlert(NO_PICK_BLOCKED); return }
    if (!(await ecConfirm('선택한 코드를 사용중단 하겠습니까?'))) return
    setBlocked(null)
    await setActive(targets, false)
  }

  /** 수정 창 [사용중단/재사용] — 열어 둔 품목 하나를 뒤집고 창을 닫는다. */
  async function toggleOne(active?: boolean) {
    const it = items.find((x) => x.id === editId)
    if (!it) return
    closeForm()
    await setActive([it], active ?? !it.active)
  }

  /** 수정 창 펼침 [삭제] — 확인 글도 '삭제하겠습니까?'(C000029 실측). 걸린 자료가 있으면 리스트와 같은 '삭제불가코드' 창. */
  async function removeOne() {
    if (editId == null) return
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    const id = editId
    closeForm()
    await removeIds([id])
  }

  /** 원본 [바코드] — 고른 품목의 '바코드(품목)' 창(수량 · 품목코드 · 품목명 · 규격 · 바코드). */
  const [barcodeOpen, setBarcodeOpen] = useState(false)
  /** 원본 [관계설정] — '품목관계리스트' 창. 우리는 대표품목 연결만 있다. */
  const [relationOpen, setRelationOpen] = useState(false)

  const [webOpen, setWebOpen] = useState(false)  // 웹자료올리기 안내 모달
  const [unusedOpen, setUnusedOpen] = useState(false) // 미사용코드조회 창
  // 업로드 파일 클라이언트 미리보기(행수/헤더). 실제 서버 반영은 백엔드 미연동
  const [webFile, setWebFile] = useState<{ name: string; total: number; head: string[] } | null>(null)
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const text = await f.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    setWebFile({ name: f.name, total: Math.max(0, lines.length - 1), head: (lines[0] ?? '').split(/[,\t]/).slice(0, 8) })
  }
  const [keyword, setKeyword] = useState('')
  /** 원본 머리 오른쪽 [사용중단포함]. 기본은 꺼져 있다 — 기본 화면에는 사용중단 품목이 안 나온다. */
  const [withStopped, setWithStopped] = useState(false)
  /** 조건 판 접힌 줄(⌄) — 펼치면 원본 [기본] 탭에 없는 우리 칸이 나온다. */
  const [moreConds, setMoreConds] = useState(false)

  /*
   * 원본 Search(F3) 조건(C000029 실측 차례): 품목코드 · 품목명 · 규격명 · 단위 · 바코드 · 품목구분(체크 · 모두 켜짐) ·
   * 입고단가 ~ · 출고단가 ~ · 구매처선택 · 품목그룹1선택 · 세트여부 · 품목공유여부 · 사용구분(기본 사용).
   * 문자형추가항목1 · 생산공정 · 품목계층그룹 · 품목유형 · 수정일자순은 우리에게 그 값이 없어 남은 것.
   */
  const [cond, setCond] = useState({
    code: '', name: '', spec: '', unit: '', barcode: '',
    cats: CATEGORY_ORDER as string[],
    inFrom: '', inTo: '', outFrom: '', outTo: '',
    supplier: '', group: '', setItem: 'ALL', shared: false, use: 'Y',
    /* 원본 [기본] 탭 칸(2026-10-31 loginad): 생산공정 · 검색창내용 · 품목계층그룹 · 기타 수정일자순(정렬). */
    process: '', keyword: '', tree: '', byUpdated: false,
    /* 원본 조건 [최초작성일자] · [최종수정일자](사본 조건표). 서버가 BaseTimeEntity 에서 실어 준다. */
    createdFrom: '', createdTo: '', updatedFrom: '', updatedTo: '',
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))
  const inRange = (v: number, from: string, to: string) =>
    (from === '' || v >= Number(from)) && (to === '' || v <= Number(to))

  const shownRows = items
    /* 사용구분 기본 '사용' — [사용중단포함] 을 켜면 사용중단 품목도 같이 보인다. */
    .filter((it) => cond.use === 'ALL' || (cond.use === 'Y' ? it.active || withStopped : !it.active))
    .filter((it) =>
      !keyword || it.code.toLowerCase().includes(keyword.toLowerCase()) || it.name.toLowerCase().includes(keyword.toLowerCase())
      || (it.searchKeyword ?? '').toLowerCase().includes(keyword.toLowerCase()))
    .filter((it) => !cond.code || it.code.includes(cond.code))
    .filter((it) => !cond.name || it.name.includes(cond.name))
    .filter((it) => !cond.spec || (it.spec ?? '').includes(cond.spec))
    .filter((it) => !cond.unit || (it.unit ?? '').includes(cond.unit))
    .filter((it) => !cond.barcode || (it.barcode ?? '').includes(cond.barcode))
    .filter((it) => cond.cats.includes(it.category))
    .filter((it) => inRange(it.purchasePrice ?? 0, cond.inFrom, cond.inTo))
    .filter((it) => inRange(it.unitPrice, cond.outFrom, cond.outTo))
    .filter((it) => !cond.supplier
      || (partners.find((p) => p.id === it.supplierId)?.name ?? '') === cond.supplier)
    .filter((it) => !cond.group || String(it.itemGroupId ?? '') === cond.group)
    .filter((it) => cond.setItem === 'ALL' || (cond.setItem === 'Y') === !!it.setItem)
    .filter((it) => !cond.shared || !!it.sharedItem)
    .filter((it) => !cond.process || (it.productionProcessIds ?? []).includes(Number(cond.process)))
    .filter((it) => !cond.keyword || (it.searchKeyword ?? '').includes(cond.keyword.trim()))
    /* 품목계층그룹 — 우리 하단 [계층그룹] 이 다루는 품목그룹(품목그룹1 과 같은 마스터)이다. */
    .filter((it) => !cond.tree || String(it.itemGroupId ?? '') === cond.tree)
    /* 날짜는 yyyy-MM-dd 문자열이라 그대로 견줘도 차례가 맞는다. */
    .filter((it) => !cond.createdFrom || (it.createdDate ?? '') >= cond.createdFrom)
    .filter((it) => !cond.createdTo || (it.createdDate ?? '') <= cond.createdTo)
    .filter((it) => !cond.updatedFrom || (it.updatedDate ?? '') >= cond.updatedFrom)
    .filter((it) => !cond.updatedTo || (it.updatedDate ?? '') <= cond.updatedTo)

  /* 원본은 머리를 눌러 정렬한다 — 품목코드 · 품목명 · 품목그룹 · 규격 · 바코드 · 입고단가 · 출고단가 · 품목구분. */
  /* 원본 [기타] 수정일자순(정렬) — 켜면 최근에 고친 품목부터. */
  const orderedRows = cond.byUpdated
    ? [...shownRows].sort((a, b) => (b.updatedDate ?? '').localeCompare(a.updatedDate ?? ''))
    : shownRows
  const supplierName = (it: Item) => partners.find((p) => p.id === it.supplierId)?.name ?? ''
  const sort = useTableSort(orderedRows, {
    품목코드: (it) => it.code,
    품목명: (it) => it.name,
    구매처명: supplierName,
    규격정보: (it) => it.spec,
    재고수량관리: (it) => (it.stockTracked ? '사용' : '사용안함'),
    품목그룹1명: (it) => it.itemGroupName,
    검색창내용: (it) => it.searchKeyword,
    사용: (it) => (it.active ? 'YES' : 'NO'),
    바코드: (it) => it.barcode,
    입고단가: (it) => it.purchasePrice ?? 0,
    출고단가: (it) => it.unitPrice,
    품목구분: (it) => it.categoryName,
  })
  const shown = sort.sorted
  const picked = shown.filter((it) => selected.has(it.id))


  return (
    <EcListShell
      headExtra={
        // 원본: 머리 검색칸 왼쪽 [사용중단포함] 단추, 켜지면 주황(btn-warning) — 2026-10-27 품목 · 거래처리스트 실측
        <button type="button" className={`ec-btn${withStopped ? ' bg-ec-btn-warning text-ec-panel' : ''}`} aria-pressed={withStopped}
                onClick={() => setWithStopped(!withStopped)}>사용중단포함</button>
      }
      title="품목등록 리스트"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={() => undefined}
      collapseConditions
      /* 조건 판 아래 줄 맨 앞 [품목이미지 ▾](원본 품목등록 리스트 2026-10-31 loginad — 양식 고르기). */
      formMenu={{ current: '품목이미지' }}
      /* 원본 [Option](2026-10-31 loginad) — 우리에게 없는 설정이라 누르면 안내만 한다. */
      optionMenu={[
        { label: '품목계정추가', onClick: notHere('품목계정추가') },
        { label: '다공정품목설정', onClick: notHere('다공정품목설정') },
        { label: '다규격품목설정', onClick: notHere('다규격품목설정') },
        { label: '양식설정', sub: [
          { label: '품목이미지', active: true, onClick: () => void ecAlert('양식은 하나만 지원합니다.') },
          { label: '신규양식추가', onClick: () => void ecAlert('신규양식추가는 지원하지 않습니다(양식 하나).') },
        ] },
        { label: '조건양식설정', onClick: notHere('조건양식설정') },
        { label: '검색항목설정', onClick: notHere('검색항목설정') },
        { label: '기능설정', onClick: notHere('기능설정') },
      ]}
      onNew={showForm ? closeForm : openCreate}
      // 원본 차례: 신규(F2) · 바코드 · 관계설정 · 계층그룹 · 변경 · 재고조정 · 사용중단/재사용 ▴ · Excel · 웹자료올리기
      actions={[{ label: '바코드', onClick: () => { if (picked.length === 0) { void ecAlert(NO_PICK); return } setBarcodeOpen(true) } },
                { label: '관계설정', onClick: () => setRelationOpen(true) },
                { label: '계층그룹', onClick: () => setGroupOpen(true) },
                { label: '변경', onClick: () => {
                  if (selected.size === 0) { void ecAlert(NO_PICK); return }
                  setBulkValue(''); setBulkOpen(true)
                } },
                // 원본 [재고조정] — 고른 품목을 물고 재고조정 화면을 연다
                { label: '재고조정', onClick: () => {
                  const [first] = [...selected]
                  if (first == null) { void ecAlert(NO_PICK); return }
                  navigate(`/inventory/staged-adjustment?item=${first}`)
                } },
                /* 원본 펼침: 사용중단 · 삭제 · 미사용코드조회 · 재사용. 미사용코드조회 = 기준일자 동안 전표가 없는 품목(GET /items/unused). */
                { label: '사용중단/재사용', onClick: toggleActive, menu: [
                  { label: '사용중단', onClick: () => setActiveChecked(false) },
                  { label: '삭제', onClick: removeSelected },
                  { label: '미사용코드조회', onClick: () => setUnusedOpen(true) },
                  { label: '재사용', onClick: () => setActiveChecked(true) },
                ] },
                { label: 'Excel' },
                { label: '웹자료올리기', onClick: () => setWebOpen(true) }]}
    >
      <UnusedCodeModal open={unusedOpen} title="미사용코드조회" codeLabel="품목코드" nameLabel="품목명" endpoint="/items/unused"
                       rows={items}
                       columns={[
                         { head: '품목코드', cell: (it) => it.code }, { head: '품목명', cell: (it) => it.name },
                         { head: '품목그룹', cell: (it) => it.itemGroupName ?? '' }, { head: '규격', cell: (it) => it.spec ?? '' },
                         { head: '바코드', cell: (it) => it.barcode ?? '' },
                         { head: '입고단가', cell: (it) => (it.purchasePrice ?? 0).toLocaleString('ko-KR') },
                         { head: '출고단가', cell: (it) => it.unitPrice.toLocaleString('ko-KR') },
                         { head: '품목구분', cell: (it) => `[${it.categoryName}]` },
                       ]}
                       onStop={(targets) => setActive(targets, false)}
                       onClose={() => setUnusedOpen(false)} />
      {error && !showForm && <p className="mb-2 rounded bg-ec-danger-bg px-3 py-2 text-sm text-ec-danger">{error}</p>}

      {/*
        원본 조건 판 [기본] 탭(2026-10-31 loginad) 차례: 품목코드 · 품목명 · 규격명 · 단위 · 품목구분 · 구매처 · 생산공정 · 입고단가 ~ ·
        출고단가 ~ · 검색창내용 · 품목계층그룹 · (품목유형) · 기타 수정일자순(정렬) · 사용구분. 품목유형(품목/다중점품목/다규격품목)은 우리에게 그 자료가 없어 칸을 안 둔다.
        바코드 · 품목그룹1 · 세트여부 · 품목공유여부 · 최초/최종 일자는 원본 [기본] 탭에 없는 칸(loginaa 사본 C000029 에는 있었다 — 다른 탭 칸은 원본 미측정)이라
        지우지 않고 접힌 줄(⌄) 안에 둔다.
      */}
      <ul className="ec-cond">
        <EcCond label="품목코드"><input className="ec-input w-full" placeholder="품목코드" value={cond.code} onChange={(e) => setC({ code: e.target.value })} /></EcCond>
        <EcCond label="품목명">
          <ItemSuggestInput field="name" value={cond.name} onChange={(v) => setC({ name: v })} width="100%" />
        </EcCond>
        <EcCond label="규격명">
          <ItemSuggestInput field="spec" value={cond.spec} onChange={(v) => setC({ spec: v })} width="100%" />
        </EcCond>
        <EcCond label="단위"><input className="ec-input w-full" placeholder="단위" value={cond.unit} onChange={(e) => setC({ unit: e.target.value })} /></EcCond>
        <EcCond label="품목구분" span={2}>
          <label className="mr-[10px]">
            <input type="checkbox" checked={cond.cats.length === CATEGORY_ORDER.length}
                   onChange={(e) => setC({ cats: e.target.checked ? CATEGORY_ORDER : [] })} /> 전체
          </label>
          {categoryOptions.map(([c, l]) => (
            <label key={c} className="mr-[10px]">
              <input type="checkbox" checked={cond.cats.includes(c)}
                     onChange={(e) => setC({ cats: e.target.checked ? [...cond.cats, c] : cond.cats.filter((x) => x !== c) })} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="구매처" pick>
          <CodePickerField label="구매처" hideLabel fill emptyLabel="전체"
                           value={cond.supplier} onChange={(v) => setC({ supplier: v })}
                           items={partnerCodeItems(partners)} />
        </EcCond>
        <EcCond label="생산공정" pick>
          <CodePickerField label="생산공정" hideLabel fill emptyLabel="전체"
                           value={cond.process} onChange={(v) => setC({ process: v })}
                           items={processes.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="입고단가">
          <input type="number" className="ec-input w-[100px]" value={cond.inFrom} onChange={(e) => setC({ inFrom: e.target.value })} />
          <span className="text-ec-label">~</span>
          <input type="number" className="ec-input w-[100px]" value={cond.inTo} onChange={(e) => setC({ inTo: e.target.value })} />
        </EcCond>
        <EcCond label="출고단가">
          <input type="number" className="ec-input w-[100px]" value={cond.outFrom} onChange={(e) => setC({ outFrom: e.target.value })} />
          <span className="text-ec-label">~</span>
          <input type="number" className="ec-input w-[100px]" value={cond.outTo} onChange={(e) => setC({ outTo: e.target.value })} />
        </EcCond>
        <EcCond label="검색창내용"><input className="ec-input w-full" placeholder="검색창내용" value={cond.keyword} onChange={(e) => setC({ keyword: e.target.value })} /></EcCond>
        <EcCond label="품목계층그룹" pick>
          <CodePickerField label="품목계층그룹" hideLabel fill emptyLabel="전체"
                           value={cond.tree} onChange={(v) => setC({ tree: v })}
                           items={itemGroups.map((g) => ({ value: String(g.id), code: g.code, name: g.name }))} />
        </EcCond>
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={cond.byUpdated} onChange={(e) => setC({ byUpdated: e.target.checked })} />
            수정일자순(정렬)
          </label>
        </EcCond>
        <EcCond label="사용구분">
          {([['ALL', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]"><input type="radio" name="item-cond-use" checked={cond.use === v} onChange={() => setC({ use: v })} /> {l}</label>
          ))}
        </EcCond>
        {moreConds && <>
          <EcCond label="바코드"><input className="ec-input w-full" placeholder="바코드" value={cond.barcode} onChange={(e) => setC({ barcode: e.target.value })} /></EcCond>
          <EcCond label="품목그룹1" pick>
            <CodePickerField label="품목그룹1" hideLabel fill emptyLabel="전체"
                             value={cond.group} onChange={(v) => setC({ group: v })}
                             items={itemGroups.map((g) => ({ value: String(g.id), code: g.code, name: g.name }))} />
          </EcCond>
          <EcCond label="세트여부">
            {([['ALL', '전체'], ['Y', '사용'], ['N', '사용안함']] as const).map(([v, l]) => (
              <label key={v} className="mr-[10px]"><input type="radio" name="item-cond-set" checked={cond.setItem === v} onChange={() => setC({ setItem: v })} /> {l}</label>
            ))}
          </EcCond>
          <EcCond label="품목공유여부">
            <label><input type="checkbox" checked={cond.shared} onChange={(e) => setC({ shared: e.target.checked })} /> C-Portal공유</label>
          </EcCond>
          <EcCond label="최초작성일자">
            <EcDateRange from={{ className: "ec-input w-[140px]", value: cond.createdFrom, onChange: (e) => setC({ createdFrom: e.target.value }) }} to={{ className: "ec-input w-[140px]", value: cond.createdTo, onChange: (e) => setC({ createdTo: e.target.value }) }} />
          </EcCond>
          <EcCond label="최종수정일자">
            <EcDateRange from={{ className: "ec-input w-[140px]", value: cond.updatedFrom, onChange: (e) => setC({ updatedFrom: e.target.value }) }} to={{ className: "ec-input w-[140px]", value: cond.updatedTo, onChange: (e) => setC({ updatedTo: e.target.value }) }} />
          </EcCond>
        </>}
        <li className="full justify-center">
          <button type="button" className="ec-btn ec-btn-sm" aria-expanded={moreConds}
                  title={moreConds ? '조건 접기' : '조건 더 보기'} aria-label={moreConds ? '조건 접기' : '조건 더 보기'} onClick={() => setMoreConds((v) => !v)}>
            <EcIcon name={moreConds ? 'chevron-up' : 'chevron-down'} size={12} glyph={moreConds ? '▴' : '▾'} />
          </button>
        </li>
      </ul>


      <ItemFormWindow categoryOptions={categoryOptions} closeForm={closeForm} copyAsNew={copyAsNew} editId={editId} editMenu={editMenu} error={error} form={form} formTab={formTab} grades={grades} image={image} invalid={invalid} itemGroups={itemGroups} items={items} mgmtItems={mgmtItems} partners={partners} processes={processes} qcTypeId={qcTypeId} qcTypes={qcTypes} removeOne={removeOne} resetForm={resetForm} set={set} setEditMenu={setEditMenu} setFormTab={setFormTab} setGrades={setGrades} setGroupOpen={setGroupOpen} setImage={setImage} setQcTypeId={setQcTypeId} setWebOpen={setWebOpen} showForm={showForm} submit={submit} toggleOne={toggleOne} uploadImage={uploadImage} uploading={uploading} />

      {/* 원본 '삭제불가코드' — 전표 · 자료가 걸린 품목을 [삭제](C000029, 2026-10-21 실측: 간편재고조정 한 건 → 자료 '재고조정'). */}
      <Modal open={blocked != null} title="삭제불가코드" width={640} onClose={() => setBlocked(null)}>{blocked && (
        <div className="p-[4px]">
          <p className="mt-0 mb-[8px] text-[14px] font-bold">삭제불가코드</p>
          <p className="m-0">선택한 품목코드을(를) 삭제할 수 없습니다.</p>
          <p className="m-0">다음 사항을 확인 바랍니다.</p>
          <p className="m-0">해당 코드의 사용중단을 원하는 경우, 사용중단 버튼을 클릭하시기 바랍니다.</p>
          <p className="mt-0 mb-[4px] font-bold">[삭제가 불가능한 품목코드]</p>
          <table className="w-full">
            <thead><tr>
              <th className="w-[29px] text-center">
                <NumCheck tone="plain" no="" label="전체 선택" on={blocked.every((b) => blockedPick.has(b.id))}
                          onChange={() => setBlockedPick(blocked.every((b) => blockedPick.has(b.id)) ? new Set() : new Set(blocked.map((b) => b.id)))} />
              </th>
              {/* 원본 창 머리 가운데 · 칸 왼쪽(2026-10-21 A001 실측 — th center · td start). 머리 가운데는 전역 thead th 규칙이 준다. */}
              <th>코드</th><th>코드명</th><th>자료</th>
            </tr></thead>
            <tbody>{blocked.map((b, i) => (
              <tr key={b.id}>
                <td className="text-center">
                  <NumCheck tone="plain" no={i + 1} label="선택" on={blockedPick.has(b.id)}
                            onChange={() => setBlockedPick((s) => { const n = new Set(s); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n })} />
                </td>
                <td>{b.code}</td><td>{b.name}</td><td className="text-ec-navy">{b.data}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="mt-[12px] flex gap-[4px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void stopBlocked()}>사용중단</button>
            <button type="button" className="ec-btn" onClick={() => setBlocked(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      {/* 원본 [공지] — 같은 품목코드로 신규 저장(C000029 실측). */}
      <Modal error={error} open={dup != null} title="공지" width={480} onClose={() => setDup(null)}>{dup && (
        <div className="p-[4px]">
          <p className="mt-0 mb-[8px] text-[12.5px]">이미 등록된 코드입니다.</p>
          <table className="w-full">
            <thead><tr><th>품목코드</th><th>품목명</th><th>사용구분</th><th>자료</th></tr></thead>
            <tbody><tr className="text-center">
              <td>{dup.code}</td><td>{dup.name}</td><td>{dup.active ? '사용중' : '사용중단'}</td><td>품목</td>
            </tr></tbody>
          </table>
          <div className="mt-[12px] flex justify-end"><button type="button" className="ec-btn" onClick={() => setDup(null)}>닫기</button></div>
        </div>
      )}</Modal>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {/*
              원본 열(2026-10-31 loginad): 번호체크 · 품목코드 · 품목명 · 이미지 · 구매처명 · 품목구분 · 규격정보 · 재고수량관리 · 품목그룹1명 · 검색창내용 · 사용 · 파일관리.
              바코드 · 입고단가 · 출고단가는 loginad 에 없는 우리 열(loginaa 사본 C000029 에는 있었다) — 지우지 않고 사용 앞에 둔다. 머리 글자 700, 칸은 모두 가운데.
            */}
            <tr>
              <th className="w-[29px] text-center" data-export-skip="true">
                <NumCheck tone="plain" no="" label="전체 선택"
                          on={shown.length > 0 && shown.every((it) => selected.has(it.id))}
                          onChange={() => setSelected(shown.length > 0 && shown.every((it) => selected.has(it.id)) ? new Set() : new Set(shown.map((it) => it.id)))} />
              </th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('품목코드')}>품목코드 {sort.mark('품목코드')}</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('품목명')}>품목명 {sort.mark('품목명')}</th>
              <th className="w-[57px] text-center font-bold">이미지</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('구매처명')}>구매처명 {sort.mark('구매처명')}</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('품목구분')}>품목구분 {sort.mark('품목구분')}</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('규격정보')}>규격정보 {sort.mark('규격정보')}</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('재고수량관리')}>재고수량관리 {sort.mark('재고수량관리')}</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('품목그룹1명')}>품목그룹1명 {sort.mark('품목그룹1명')}</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('검색창내용')}>검색창내용 {sort.mark('검색창내용')}</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('바코드')}>바코드 {sort.mark('바코드')}</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('입고단가')}>입고단가 {sort.mark('입고단가')}</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('출고단가')}>출고단가 {sort.mark('출고단가')}</th>
              <th className="text-center font-bold cursor-pointer" onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
              <th className="text-center font-bold">파일관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={15} className="ec-empty">불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={15} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              shown.map((it, idx) => (
                <tr key={it.id} className={it.active ? undefined : 'text-ec-hint ec-row-stopped'}>
                  <td className="text-center">
                    <NumCheck tone="plain" no={idx + 1} label="선택" on={selected.has(it.id)} onChange={() => toggle(it.id)} />
                  </td>
                  {/* 원본은 코드 · 이름을 눌러 그 건을 연다(두 칸이 링크다). */}
                  <td className="text-center"><button type="button" className="ec-link" onClick={() => openEdit(it)}>{it.code}</button></td>
                  <td className="text-center"><button type="button" className="ec-link" onClick={() => openEdit(it)}>{it.name}</button></td>
                  {/* 원본은 그림을 칸에 그린다. */}
                  <td className="text-center">
                    {it.imageFileId ? (
                      <img src={`/api/files/${it.imageFileId}`} alt={it.imageFileName ?? it.name}
                           title={it.imageFileName ?? ''} className="w-[24px] h-[24px] object-cover align-middle" />
                    ) : null}
                  </td>
                  <td className="text-center">{supplierName(it)}</td>
                  <td className="text-center">[{it.categoryName}]</td>
                  <td className="text-center">{it.spec ?? ''}</td>
                  <td className="text-center">{it.stockTracked ? '사용' : '사용안함'}</td>
                  <td className="text-center">{it.itemGroupName ?? ''}</td>
                  <td className="text-center">{it.searchKeyword ?? ''}</td>
                  <td className="text-center">{it.barcode ?? ''}</td>
                  <td className="text-center">{(it.purchasePrice ?? 0).toLocaleString('ko-KR')}</td>
                  <td className="text-center">{it.unitPrice.toLocaleString('ko-KR')}</td>
                  <td className="text-center">{it.active ? 'YES' : 'NO'}</td>
                  {/* 원본 [파일관리] 링크 — 품목에 파일을 붙이는 창. 우리는 이미지 한 장(품목정보 탭)만 들어 안내만 한다. */}
                  <td className="text-center"><button type="button" className="ec-link" onClick={notHere('파일관리')}>파일관리</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 원본 [변경] — 고른 품목의 한 칸을 한 번에 바꾼다. 비우면 그 칸을 비운다(그룹 미지정 · 구매처 없음). */}
      <Modal error={error} open={bulkOpen} title={`품목 일괄변경 (${selected.size}건)`} onClose={() => setBulkOpen(false)}>{(
        <div className="p-[4px]">
          <div className="flex gap-[10px] items-end flex-wrap">
            <div>
              <label className="mb-1 block text-sm text-ec-label">바꿀 항목</label>
              <select className="ec-input w-[180px]" value={bulkField}
                      onChange={(e) => { setBulkField(e.target.value as typeof bulkField); setBulkValue('') }}>
                <option value="itemGroupId">품목그룹1</option>
                <option value="managementItemId">관리항목</option>
                <option value="supplierId">구매처</option>
                <option value="stockTracked">재고수량관리</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-ec-label">새 값</label>
              <select className="ec-input w-[240px]" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
                {bulkField === 'stockTracked' ? (
                  <>
                    <option value="Y">사용</option>
                    <option value="N">사용안함</option>
                  </>
                ) : (
                  <>
                    <option value="">{bulkField === 'supplierId' ? '(없음)' : '(미지정)'}</option>
                    {bulkField === 'itemGroupId' && itemGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    {bulkField === 'managementItemId' && mgmtItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    {bulkField === 'supplierId' && partners.map((pt) => <option key={pt.id} value={pt.id}>[{pt.code}] {pt.name}</option>)}
                  </>
                )}
              </select>
            </div>
          </div>
          <div className="mt-[12px] flex justify-end gap-[6px]">
            <button type="button" className="ec-btn" onClick={() => setBulkOpen(false)}>닫기</button>
            <button type="button" className="ec-btn ec-btn-primary" onClick={bulkChange}>변경</button>
          </div>
        </div>
      )}</Modal>

      {/* 원본 [바코드] — '바코드(품목)' 창: 수량 · 품목코드 · 품목명 · 규격 · 바코드, 버튼 바코드인쇄 · 닫기. 인쇄는 인쇄 묶음 몫. */}
      <Modal error={error} open={barcodeOpen} title="바코드(품목)" width={640} onClose={() => setBarcodeOpen(false)}>{(
        <div className="p-[4px]">
          <table className="w-full">
            <thead><tr className="text-center"><th>수량</th><th>품목코드</th><th>품목명</th><th>규격</th><th>바코드</th></tr></thead>
            <tbody>
              {picked.map((it) => (
                <tr key={it.id} className="text-center">
                  <td>1</td><td>{it.code}</td><td>{it.name}</td><td>{it.spec ?? ''}</td><td>{it.barcode ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[12px] flex justify-end gap-[4px]">
            <button type="button" className="ec-btn ec-btn-primary" disabled title="바코드인쇄는 아직 없습니다">바코드인쇄</button>
            <button type="button" className="ec-btn" onClick={() => setBarcodeOpen(false)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      {/*
        원본 [관계설정] — '품목관계리스트' 창(대표품목코드 · 대표품목명 · 대표품목단위 · 연결품목코드 · 연결품목명 · 연결품목단위 ·
        연결품목 환산수량 · 대표품목 환산수량 · 수량관리기준). 우리는 품목의 [대표품목] 연결만 있어 그것을 늘어놓는다 —
        환산수량 · 수량관리기준 · 신규/변경/선택삭제는 그 자료가 없어 남은 것.
      */}
      <Modal error={error} open={relationOpen} title="품목관계리스트" width={900} onClose={() => setRelationOpen(false)}>{(
        <div className="p-[4px] overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-center">
              <th>대표품목코드</th><th>대표품목명</th><th>대표품목단위</th><th>연결품목코드</th><th>연결품목명</th><th>연결품목단위</th>
              <th>연결품목 환산수량</th><th>대표품목 환산수량</th><th>수량관리기준</th>
            </tr></thead>
            <tbody>
              {(() => {
                const rel = items.filter((x) => x.parentItemId != null)
                if (rel.length === 0) return <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                return rel.map((x) => {
                  const p = items.find((y) => y.id === x.parentItemId)
                  return (
                    <tr key={x.id} className="text-center">
                      <td>{p?.code ?? ''}</td><td>{p?.name ?? x.parentItemName ?? ''}</td><td>{p?.unit ?? ''}</td>
                      <td>{x.code}</td><td>{x.name}</td><td>{x.unit}</td><td></td><td></td><td></td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
          <div className="mt-[12px] flex justify-end">
            <button type="button" className="ec-btn" onClick={() => setRelationOpen(false)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      {groupOpen && (
        <GroupMasterModal
          title="품목그룹" endpoint="/item-groups"
          members={(() => {
            const m = new Map<string, string[]>()
            for (const it of items) {
              const k = it.itemGroupName ?? '(미지정)'
              if (!m.has(k)) m.set(k, [])
              m.get(k)!.push(`[${it.code}] ${it.name}`)
            }
            return m
          })()}
          onClose={() => setGroupOpen(false)} onChanged={load}
        />
      )}

      <Modal error={error} open={webOpen} title="웹자료올리기 · 품목 대량 등록" width={520} onClose={() => setWebOpen(false)}>{(
        <div className="p-[4px] text-[12.5px] leading-[1.7] text-ec-text">
          <p className="mt-0 mx-0 mb-[8px]">엑셀/CSV 파일로 품목을 한 번에 등록하는 기능입니다. 아래에서 파일을 고르면 형식을 미리 확인할 수 있습니다.</p>
          <EcFileDrop
            hint="여기에 파일 놓기 (엑셀·CSV)"
            onFiles={(fs) => onPickFile({ target: { files: fs } } as unknown as React.ChangeEvent<HTMLInputElement>)}
          />
          {webFile && (
            <div className="mt-[10px] border border-ec-line-soft border-solid rounded-[3px] p-[10px] bg-ec-page">
              <div><b>{webFile.name}</b> · 데이터 <b className="text-ec-navy">{webFile.total.toLocaleString()}</b>행 인식</div>
              {webFile.head.length > 0 && <div className="mt-[4px] text-ec-label">헤더: {webFile.head.join(' · ')}</div>}
            </div>
          )}
          <div className="mt-[12px] flex items-center gap-[8px]">
            <button className="ec-btn" disabled title="서버 업로드 API 미구현">업로드 실행 (백엔드 미연동)</button>
            <span className="text-[11.5px] text-ec-warn">* 서버 일괄등록 API가 없어 미리보기까지만 제공합니다.</span>
          </div>
        </div>
      )}</Modal>
    </EcListShell>
  )
}

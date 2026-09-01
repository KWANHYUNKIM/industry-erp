import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CodeOption, GroupMaster, Item, ManagementItem, Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CustomFieldsPanel from '../../components/CustomFieldsPanel'
import EcFileDrop from '../../components/EcFileDrop'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import GroupMasterModal from '../../components/GroupMasterModal'
import { partnerCodeItems } from '../../utils/codeItems'
import { useTableSort } from '../../utils/useTableSort'
import { useNavigate } from 'react-router-dom'

const inputCls = 'ec-input w-full'

const FORM_TABS = ['품목정보', '수량', '단가', '관리대상'] as const
type FormTab = typeof FORM_TABS[number]

/** 품질검사 유형·방법. 품질 모듈이 쓰는 값과 같다(사본 실측). */
const QC_TYPES = ['수입검사', '공정검사', '출하검사']
const QC_METHODS = ['전수', '샘플링']

const emptyForm = {
  code: '',
  name: '',
  spec: '',
  unit: 'EA',
  category: 'RAW_MATERIAL',
  unitPrice: '0',
  purchasePrice: '0',
  safetyStock: '0',
  barcode: '', searchKeyword: '',
  /*
   * 원본 품목등록 폼의 나머지 칸들. 담을 데가 아예 없어 그리지도 못하던 것이다.
   * 참/거짓은 다른 칸(stockTracked·active)과 같이 'Y'/'N' 으로 든다 — 한 폼에 두 가지
   * 표현이 섞이면 보낼 때 한쪽만 바꿔 놓고 지나친다.
   */
  remark: '',
  vatRateSales: '10', vatRatePurchase: '10',
  subcontractPrice: '0', leadTimeDays: '0', minPurchaseUnit: '0',
  itemType: '', parentItemId: '',
  setItem: 'N', sharedItem: 'N', lotManaged: 'N',
  qcType: '', qcMethod: '', qcOnPurchase: 'N', qcOnProduction: 'N',
  autoProductionOnSales: 'N', autoProductionOnTransfer: 'N',
  /** 원본 품목등록 리스트의 [구매처명]. */
  supplierId: '',
  /** 재고수량관리. 기본은 관리대상 — 모르고 껐다가 재고가 조용히 안 움직이는 것보다 낫다. */
  stockTracked: 'Y',
  /**
   * 사용구분. 예전에는 저장할 때 늘 active:true 를 보냈다 —
   * <b>사용중단한 품목을 고치기만 해도 조용히 되살아났다.</b>
   * 거래처에서 똑같은 버그를 고쳤는데 품목에도 같은 것이 남아 있었다.
   */
  active: 'Y',
  udiDi: '',
  managementItemId: '',
  itemGroupId: '',
}

export default function ItemsPage() {
  /** 원본 [재고조정] — 고른 품목으로 조정 화면을 연다. */
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<CodeOption[]>([])
  const [mgmtItems, setMgmtItems] = useState<ManagementItem[]>([])
  const [itemGroups, setItemGroups] = useState<GroupMaster[]>([])
  /* 원본 품목등록 폼의 탭. 원가·부가정보는 우리에게 그 칸이 없어 만들지 않는다. */
  const [formTab, setFormTab] = useState<FormTab>('품목정보')
  /** 구매처 후보. 이름은 서버가 아니라 여기서 붙인다 — inventory 는 거래처를 모른다. */
  const [partners, setPartners] = useState<Partner[]>([])
  const [groupOpen, setGroupOpen] = useState(false)  // 계층그룹 모달
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  /** 원본 [이미지]. 파일을 먼저 올리고(POST /api/files) 그 id 를 품목에 붙인다. */
  const [image, setImage] = useState<{ id: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [i, c, m, g, pt] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<CodeOption[]>('/meta/item-categories'),
        api.get<ManagementItem[]>('/management-items'),
        api.get<GroupMaster[]>('/item-groups'),
        api.get<Partner[]>('/partners'),
      ])
      setItems(i.data)
      setCategories(c.data)
      setMgmtItems(m.data)
      setItemGroups(g.data)
      setPartners(pt.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setFormTab('품목정보')
    setEditId(null)
    setForm({ ...emptyForm })
    setImage(null)
    setShowForm(true)
  }

  /** 원본 [이미지] — 기안서 첨부·ECDrive 와 같은 흐름(먼저 올리고 id 를 붙인다). */
  async function uploadImage(file: File) {
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post<{ id: number; name: string }>('/files', fd)
      setImage({ id: r.data.id, name: r.data.name })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  function openEdit(item: Item) {
    /* 고치려고 열 때도 첫 탭부터 — 앞서 보던 탭이 남아 있으면 코드가 안 보인다. */
    setFormTab('품목정보')
    setEditId(item.id)
    setForm({
      code: item.code,
      name: item.name,
      spec: item.spec ?? '',
      unit: item.unit,
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
      remark: item.remark ?? '',
      vatRateSales: String(item.vatRateSales ?? 10),
      vatRatePurchase: String(item.vatRatePurchase ?? 10),
      subcontractPrice: String(item.subcontractPrice ?? 0),
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
    })
    setImage(item.imageFileId != null ? { id: item.imageFileId, name: item.imageFileName ?? '' } : null)
    setShowForm(true)
  }

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const payload = {
      ...form,
      unitPrice: Number(form.unitPrice),
      purchasePrice: Number(form.purchasePrice),
      safetyStock: Number(form.safetyStock),
      stockTracked: form.stockTracked === 'Y',
      active: form.active === 'Y',
      managementItemId: form.managementItemId ? Number(form.managementItemId) : null,
      itemGroupId: form.itemGroupId ? Number(form.itemGroupId) : null,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      imageFileId: image ? image.id : null,
      /* 숫자는 숫자로, 'Y'/'N' 은 참/거짓으로 바꿔 보낸다 — 서버는 문자열을 안 받는다. */
      vatRateSales: Number(form.vatRateSales),
      vatRatePurchase: Number(form.vatRatePurchase),
      subcontractPrice: Number(form.subcontractPrice),
      leadTimeDays: Number(form.leadTimeDays),
      minPurchaseUnit: Number(form.minPurchaseUnit),
      parentItemId: form.parentItemId ? Number(form.parentItemId) : null,
      setItem: form.setItem === 'Y',
      sharedItem: form.sharedItem === 'Y',
      lotManaged: form.lotManaged === 'Y',
      qcOnPurchase: form.qcOnPurchase === 'Y',
      qcOnProduction: form.qcOnProduction === 'Y',
      autoProductionOnSales: form.autoProductionOnSales === 'Y',
      autoProductionOnTransfer: form.autoProductionOnTransfer === 'Y',
    }
    try {
      if (editId) {
        await api.put(`/items/${editId}`, payload)
      } else {
        await api.post('/items', payload)
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(item: Item) {
    if (!confirm(`품목 '${item.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/items/${item.id}`)
      setSelected((s) => { const n = new Set(s); n.delete(item.id); return n })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  // 그리드 행 선택(체크박스) 상태 — 하단 '삭제' 일괄삭제에 사용
  const [selected, setSelected] = useState<Set<number>>(new Set())
  function toggle(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // 하단 '삭제': 선택된 행들을 기존 DELETE /items/{id} 로 일괄 삭제
  /**
   * 원본 품목등록 리스트의 [사용중단/재사용]. 고른 품목을 한 번에 세운다.
   *
   * <p>고른 것이 <b>모두 사용중단이면 되살리고</b>, 하나라도 살아 있으면 중단한다 —
   * 거래처·창고와 같은 규칙이다.
   *
   * <p>그 품목을 <b>통째로 다시 보낸다.</b> 수정 요청은 통째로 덮으므로 몇 칸만
   * 골라 보내면 안 보낸 칸(검색창내용·바코드·관리항목·품목그룹·이미지 …)이
   * 사용중단 한 번에 조용히 지워진다. 거래처에서 겪은 것과 같은 함정이다.
   */
  /**
   * 그 품목을 <b>통째로</b> 만든다. 바꿀 칸만 얹고 나머지는 있는 값 그대로 보낸다 —
   * 수정은 통째로 덮으므로 몇 칸만 보내면 검색창내용·바코드·관리항목·품목그룹·이미지가
   * 조용히 지워진다.
   *
   * <p>값은 그대로 넘긴다. 빈 문자열로 바꾸면 '안 적었다(null)' 와 '비워 두었다('')' 가
   * 뒤섞인다 — 실제로 검색창내용이 null 이던 품목이 '' 로 바뀌었다.
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
   * 구매처가 바뀌거나 품목그룹을 다시 나눌 때 품목을 하나씩 열어 고칠 일이 아니다.
   */
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkField, setBulkField] = useState<'itemGroupId' | 'managementItemId' | 'supplierId' | 'stockTracked'>('itemGroupId')
  const [bulkValue, setBulkValue] = useState('')

  async function bulkChange() {
    const targets = shown.filter((it) => selected.has(it.id))
    if (targets.length === 0) { alert('바꿀 품목을 먼저 선택하세요.'); return }
    const patch = bulkField === 'stockTracked'
      ? { stockTracked: bulkValue === 'Y' }
      : { [bulkField]: bulkValue ? Number(bulkValue) : null }
    const results = await Promise.allSettled(
      targets.map((it) => api.put(`/items/${it.id}`, wholeItem(it, patch))))
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelected(new Set())
    setBulkOpen(false)
    await load()
    if (failed > 0) alert(`${targets.length - failed}건 변경, ${failed}건 실패.`)
  }

  async function toggleActive() {
    const targets = shown.filter((it) => selected.has(it.id))
    if (targets.length === 0) { alert('사용중단하거나 되살릴 품목을 먼저 선택하세요.'); return }
    const reviving = targets.every((it) => !it.active)
    const results = await Promise.allSettled(
      targets.map((it) => api.put(`/items/${it.id}`, wholeItem(it, { active: reviving }))))
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelected(new Set())
    await load()
    if (failed > 0) alert(`${targets.length - failed}건 ${reviving ? '재사용' : '사용중단'}, ${failed}건 실패.`)
  }

  async function removeSelected() {
    if (selected.size === 0) { alert('삭제할 품목을 먼저 선택하세요.'); return }
    if (!confirm(`선택한 ${selected.size}개 품목을 삭제할까요?`)) return
    const ids = Array.from(selected)
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/items/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelected(new Set())
    await load()
    if (failed > 0) alert(`${ids.length - failed}건 삭제, ${failed}건 실패(참조 중이거나 삭제 불가한 품목).`)
  }

  const [webOpen, setWebOpen] = useState(false)  // 웹자료올리기 안내 모달
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
  /**
   * 원본 품목등록 리스트의 [사용중단포함] 체크. <b>기본은 꺼져 있다</b> —
   * 즉 기본 화면에는 사용중단 품목이 안 나온다. 우리는 늘 다 보여 줘서,
   * 이미 안 쓰는 품목이 코드도움·목록에 계속 섞여 나왔다.
   */
  const [withStopped, setWithStopped] = useState(false)

  /*
   * <b>원본 품목등록의 조건 판.</b> 우리에게는 검색상자 하나뿐이라, 품목이 쌓이면
   * <b>구매처로도 품목구분으로도 좁힐 수가 없었다</b> — 코드나 이름을 외워 치는 수밖에.
   * 원본 조건은 80칸이지만 대부분 우리에게 없는 값(단가A~J·표준원가)이다.
   * <b>값이 실제로 있는 여섯</b>만 만든다: 품목명 · 규격명 · 품목구분 · 구매처 ·
   * 검색창내용 · 바코드. 차례는 사본 실측을 따른다.
   */
  const [cond, setCond] = useState({
    name: '', spec: '', category: '', supplier: '', keywordCol: '', barcode: '',
    /*
     * 원본 조건 <b>[최초작성일자]·[최종수정일자]</b>. 서버가 BaseTimeEntity 에서 진작
     * 실어 주는데(거래처와 같다) 화면이 받아 두지 않아 거를 수가 없었다.
     * "이번 달에 새로 등록한 품목만" 은 마스터를 훑을 때 늘 묻는 것이다.
     */
    createdFrom: '', createdTo: '', updatedFrom: '', updatedTo: '',
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  const shownRows = items
    .filter((it) => withStopped || it.active)
    .filter((it) =>
      !keyword || it.code.toLowerCase().includes(keyword.toLowerCase()) || it.name.toLowerCase().includes(keyword.toLowerCase()))
    .filter((it) => !cond.name || it.name.includes(cond.name))
    .filter((it) => !cond.spec || (it.spec ?? '').includes(cond.spec))
    /* 품목구분은 서버가 주는 목록(/meta/item-categories)의 code 로 견준다. */
    .filter((it) => !cond.category || it.category === cond.category)
    .filter((it) => !cond.supplier
      || (partners.find((p) => p.id === it.supplierId)?.name ?? '') === cond.supplier)
    .filter((it) => !cond.keywordCol || (it.searchKeyword ?? '').includes(cond.keywordCol))
    .filter((it) => !cond.barcode || (it.barcode ?? '').includes(cond.barcode))
    /* 날짜는 yyyy-MM-dd 문자열이라 그대로 견줘도 차례가 맞는다. */
    .filter((it) => !cond.createdFrom || (it.createdDate ?? '') >= cond.createdFrom)
    .filter((it) => !cond.createdTo || (it.createdDate ?? '') <= cond.createdTo)
    .filter((it) => !cond.updatedFrom || (it.updatedDate ?? '') >= cond.updatedFrom)
    .filter((it) => !cond.updatedTo || (it.updatedDate ?? '') <= cond.updatedTo)

  /*
   * 원본 품목등록 리스트는 머리를 눌러 정렬한다 — 사본에서 정렬 표시가 붙은 아홉 칸을
   * 그대로 옮겼다(품목코드·품목명·구매처명·품목구분·규격정보·재고수량관리·
   * 품목그룹1명·검색창내용·사용). 우리는 그중 다섯 칸에 <b>▼ 만 그려 놓고</b> 정렬은
   * 없었다 — 눌러도 아무 일이 없었다.
   */
  const sort = useTableSort(shownRows, {
    품목코드: (it) => it.code,
    품목명: (it) => it.name,
    구매처명: (it) => partners.find((p) => p.id === it.supplierId)?.name,
    품목구분: (it) => it.categoryName,
    규격정보: (it) => it.spec,
    재고수량관리: (it) => (it.stockTracked === false ? '수량관리제외' : '수량관리대상'),
    품목그룹1명: (it) => it.itemGroupName,
    검색창내용: (it) => it.searchKeyword,
    사용: (it) => (it.active ? '사용' : '사용중단'),
  })
  const shown = sort.sorted

  return (
    <EcListShell
      title="품목등록 리스트"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={showForm ? () => setShowForm(false) : openCreate}
      // 원본 차례: 계층그룹 · 변경 · 재고조정 · 사용중단/재사용 · Excel (사본 실측)
      actions={[{ label: '계층그룹', onClick: () => setGroupOpen(true) },
                { label: `변경${selected.size ? ` (${selected.size})` : ''}`, onClick: () => {
                  if (selected.size === 0) { alert('바꿀 품목을 먼저 선택하세요.'); return }
                  setBulkValue(''); setBulkOpen(true)
                } },
                // 원본 [재고조정] — 고른 품목을 물고 재고조정 화면을 연다
                { label: '재고조정', onClick: () => {
                  const [first] = [...selected]
                  if (first == null) { alert('재고를 조정할 품목을 먼저 선택하세요.'); return }
                  navigate(`/inventory/staged-adjustment?item=${first}`)
                } },
                { label: `사용중단/재사용${selected.size ? ` (${selected.size})` : ''}`, onClick: toggleActive },
                { label: 'Excel' },
                { label: `삭제${selected.size ? ` (${selected.size})` : ''}`, onClick: removeSelected },
                { label: '웹자료올리기', onClick: () => setWebOpen(true) }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* 원본 조건 차례: 품목명 · 규격명 · 단위 · 품목구분 · 구매처 · … · 검색창내용 (사본 실측) */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="품목명">
          <input className="ec-input" value={cond.name}
                 onChange={(e) => setC({ name: e.target.value })} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="규격명">
          <input className="ec-input" value={cond.spec}
                 onChange={(e) => setC({ spec: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="품목구분">
          <select className="ec-input" value={cond.category}
                  onChange={(e) => setC({ category: e.target.value })} style={{ width: 120 }}>
            <option value="">전체</option>
            {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="구매처" pick>
          <CodePickerField label="구매처" hideLabel width={180} emptyLabel="전체"
                           value={cond.supplier} onChange={(v) => setC({ supplier: v })}
                           items={partnerCodeItems(partners)} />
        </EcCond>
        <EcCond label="바코드">
          <input className="ec-input" value={cond.barcode}
                 onChange={(e) => setC({ barcode: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        {/* 원본 차례: … 적요 · 품질검사유형·방법 · 최초작성자·최종수정자 · <b>최초작성일자·최종수정일자</b> */}
        <EcCond label="최초작성일자">
          <input type="date" className="ec-input" value={cond.createdFrom}
                 onChange={(e) => setC({ createdFrom: e.target.value })} style={{ width: 140 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={cond.createdTo}
                 onChange={(e) => setC({ createdTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="최종수정일자">
          <input type="date" className="ec-input" value={cond.updatedFrom}
                 onChange={(e) => setC({ updatedFrom: e.target.value })} style={{ width: 140 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={cond.updatedTo}
                 onChange={(e) => setC({ updatedTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="검색창내용">
          <input className="ec-input" value={cond.keywordCol}
                 onChange={(e) => setC({ keywordCol: e.target.value })} style={{ width: 180 }} />
        </EcCond>
      </ul>

      <label style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <input type="checkbox" checked={withStopped} onChange={(e) => setWithStopped(e.target.checked)} />
        사용중단포함
      </label>

      <Modal open={showForm} title="품목등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>{editId ? '품목 수정' : '새 품목 등록'}</div>
          {/*
            원본 품목등록 폼은 <b>품목정보 · 수량 · 단가 · 원가 · 부가정보 · 관리대상</b>
            여섯 탭이다(사본 실측 — 칸이 어느 탭인지는 ecpath 셋째 조각에 남아 있다).
            우리는 한 화면에 열여섯 칸을 죽 펴 놓아, 단가를 고치려 해도 코드부터 훑어야 했다.
            <b>원가 탭은 만들지 않는다</b> — 표준원가 넷(재료비·노무비·경비·외주비)에 해당하는
            칸이 우리 품목에 없다. 눌러도 빈 탭은 있는 것만 못하다. 부가정보에 해당하는
            추가항목은 아래 <b>사용자정의 패널</b>이 대신한다.
          */}
          {/* 폼 탭은 거래처등록과 같은 모양으로 그린다 — 우리끼리 달라 보이면 안 된다. */}
          <ul className="ec-tabs" style={{ marginBottom: 10 }}>
            {FORM_TABS.map((t) => (
              <li key={t} className={`ec-tab${formTab === t ? ' active' : ''}`}
                  onClick={() => setFormTab(t)} style={{ cursor: 'pointer' }}>{t}</li>
            ))}
          </ul>
          {formTab === '품목정보' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-slate-600">품목코드 *</label>
                <input className={inputCls} value={form.code} disabled={!!editId} onChange={(e) => set('code', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm text-slate-600">품명 *</label>
                <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">규격</label>
                <input className={inputCls} value={form.spec} onChange={(e) => set('spec', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">단위 *</label>
                <input className={inputCls} value={form.unit} onChange={(e) => set('unit', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">품목분류 *</label>
                {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다. */}
                <CodePickerField label="품목분류 *" hideLabel width={200} emptyLabel="선택"
                                 value={form.category} onChange={(v) => set('category', v)}
                                 items={categories.map((c) => ({ value: c.code, code: c.code, name: c.name }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">재고수량관리</label>
                <select className={inputCls} value={form.stockTracked} onChange={(e) => set('stockTracked', e.target.value)}>
                  <option value="Y">수량관리대상</option>
                  <option value="N">수량관리제외</option>
                </select>
                <span style={{ fontSize: 11, color: '#8a929c' }}>
                  제외로 두면 이 품목은 재고를 잡지 않습니다(용역·운반비 등)
                </span>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">사용구분</label>
                <select className={inputCls} value={form.active} onChange={(e) => set('active', e.target.value)}>
                  <option value="Y">사용</option>
                  <option value="N">사용중단</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">바코드</label>
                <input className={inputCls} value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
              </div>
              {/*
                원본 품목등록 리스트의 [구매처명]. 이 품목을 늘 사 오는 곳을 적어 둔다.
                inventory 는 trade 를 참조할 수 없어 서버는 id 만 들고, 이름은 이 화면이 붙인다.
              */}
              <div>
                <CodePickerField
                  label="구매처" placeholder="구매처 선택" emptyLabel="선택 해제"
                  value={form.supplierId} onChange={(v) => set('supplierId', v)}
                  items={partnerCodeItems(partners)}
                />
              </div>
              {/*
                원본 품목등록 리스트의 [이미지] 열. 비슷하게 생긴 부품이 수십 개인데
                코드와 이름만으로 고르게 하고 있었다. 한 장만 붙는다.
              */}
              <div>
                <label className="mb-1 block text-sm text-slate-600">이미지</label>
                {image ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--ec-border)', padding: 6, background: '#f9fbfd' }}>
                    <img src={`/api/files/${image.id}`} alt={image.name}
                         style={{ width: 48, height: 48, objectFit: 'cover', border: '1px solid #e6eaef', background: '#fff' }} />
                    <span style={{ fontSize: 12.5, color: '#5a626e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image.name}</span>
                    <button type="button" className="ec-btn" onClick={() => setImage(null)}>떼기</button>
                  </div>
                ) : (
                  <EcFileDrop hint="여기에 이미지 놓기" busy={uploading} disabled={uploading}
                              onFiles={(fs) => { if (fs[0]) void uploadImage(fs[0]) }} />
                )}
              </div>
              {/*
                원본 품목등록 리스트의 [검색창내용]. 현장에서 부르는 이름(약칭·옛 코드)을
                적어 두고 그걸로 찾는다 — 코드도움이 이 값도 같이 본다.
              */}
              <div>
                <label className="mb-1 block text-sm text-slate-600">검색창내용</label>
                <input className={inputCls} value={form.searchKeyword}
                       onChange={(e) => set('searchKeyword', e.target.value)}
                       placeholder="약칭·옛 코드·영문명 등 (코드도움에서 이 값으로도 찾습니다)" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">UDI-DI (의료기기 표준코드)</label>
                <input className={inputCls} value={form.udiDi} onChange={(e) => set('udiDi', e.target.value)}
                       placeholder="의료기기만 입력 (공급내역보고 대상)" />
              </div>
              {/* 원본 품목등록 A7 탭의 [관리항목]. 전표 라인에는 여기 값이 읽기전용으로 따라 붙는다. */}
              <div>
                <CodePickerField
                  label="품목그룹" placeholder="품목그룹 선택" emptyLabel="선택 해제"
                  value={form.itemGroupId} onChange={(v) => set('itemGroupId', v)}
                  items={itemGroups.map((g) => ({ value: String(g.id), code: g.code, name: g.name }))}
                />
              </div>
              <div>
                {/* 사본에 고를 값 목록이 남아 있지 않아 <b>자유 입력</b>으로 둔다 —
                    지어낸 값을 원본 이름표 아래 늘어놓는 것보다 낫다. */}
                <label className="mb-1 block text-sm text-slate-600">품목유형</label>
                <input className={inputCls} value={form.itemType} onChange={(e) => set('itemType', e.target.value)} />
              </div>
              <div>
                {/* 규격만 다른 형제 품목들의 대표. 자기 자신은 고를 수 없다(서버도 막는다). */}
                <CodePickerField
                  label="대표품목" placeholder="대표품목 선택" emptyLabel="선택 해제"
                  value={form.parentItemId} onChange={(v) => set('parentItemId', v)}
                  items={items.filter((x) => x.id !== editId)
                    .map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">세트여부</label>
                <select className={inputCls} value={form.setItem} onChange={(e) => set('setItem', e.target.value)}>
                  <option value="N">일반</option><option value="Y">세트</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">품목공유여부</label>
                <select className={inputCls} value={form.sharedItem} onChange={(e) => set('sharedItem', e.target.value)}>
                  <option value="N">공유안함</option><option value="Y">공유</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="mb-1 block text-sm text-slate-600">적요</label>
                <input className={inputCls} value={form.remark} onChange={(e) => set('remark', e.target.value)} />
              </div>
            </div>
          )}
          {formTab === '수량' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-slate-600">안전재고</label>
                <input type="number" className={inputCls} value={form.safetyStock} onChange={(e) => set('safetyStock', e.target.value)} />
              </div>
              <div>
                {/* 주문하고 물건이 오기까지 걸리는 날수 — 발주계획이 이 값으로 거꾸로 센다. */}
                <label className="mb-1 block text-sm text-slate-600">조달기간</label>
                <input type="number" className={inputCls} value={form.leadTimeDays}
                       onChange={(e) => set('leadTimeDays', e.target.value)} title="일 단위" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">최소구매단위</label>
                <input type="number" step="any" className={inputCls} value={form.minPurchaseUnit}
                       onChange={(e) => set('minPurchaseUnit', e.target.value)} />
              </div>
              <div>
                {/* 켜면 입출고할 때 로트번호를 받는다. */}
                <label className="mb-1 block text-sm text-slate-600">시리얼/로트No.</label>
                <select className={inputCls} value={form.lotManaged} onChange={(e) => set('lotManaged', e.target.value)}>
                  <option value="N">관리안함</option><option value="Y">관리함</option>
                </select>
              </div>
            </div>
          )}
          {formTab === '단가' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                {/* 원본은 이 둘을 <b>[출고단가]·[입고단가]</b> 라 부른다(사본 실측). 파는 값과
                    사는 값이 아니라 <b>나가는 값과 들어오는 값</b>으로 읽는 것이다. */}
                <label className="mb-1 block text-sm text-slate-600">출고단가</label>
                <input type="number" className={inputCls} value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} />
              </div>
              <div>
                {/* 원본 품목등록도 판매단가와 구매단가를 따로 둔다. 하나로 쓰면 구매할인현황이
                    매입가를 판매가와 견주게 되고, 그러면 화면 이름과 달리 늘 할증만 찍힌다. */}
                <label className="mb-1 block text-sm text-slate-600">입고단가</label>
                <input type="number" className={inputCls} value={form.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)}
                       title="구매할인현황의 기준입니다. 0 이면 기준을 안 정한 것으로 보고 할인을 계산하지 않습니다." />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">외주비단가</label>
                <input type="number" step="any" className={inputCls} value={form.subcontractPrice}
                       onChange={(e) => set('subcontractPrice', e.target.value)} />
              </div>
              {/*
                품목마다 세율이 갈리는 회사가 있다(면세 품목·영세율 수출품). 전표에서 매번
                고르게 하면 사람이 틀리고, 틀린 것이 <b>세금계산서까지</b> 간다.
              */}
              <div>
                <label className="mb-1 block text-sm text-slate-600">부가세율(매출)</label>
                <input type="number" step="any" className={inputCls} value={form.vatRateSales}
                       onChange={(e) => set('vatRateSales', e.target.value)} title="%" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">부가세율(매입)</label>
                <input type="number" step="any" className={inputCls} value={form.vatRatePurchase}
                       onChange={(e) => set('vatRatePurchase', e.target.value)} title="%" />
              </div>
            </div>
          )}
          {formTab === '관리대상' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <CodePickerField
                  label="관리항목" placeholder="관리항목 선택" emptyLabel="선택 해제"
                  value={form.managementItemId} onChange={(v) => set('managementItemId', v)}
                  items={mgmtItems.map((m) => ({ value: String(m.id), code: m.code, name: m.name, sub: m.description }))}
                />
              </div>
              {/* 원본 품목등록 리스트의 '품목그룹1명'. 열 이름은 원본을 그대로 쓰고,
                    우리는 그룹이 하나라 '2명'에 해당하는 열이 없다. */}
              {/*
                품질검사 설정. 값은 품질 모듈이 쓰는 것과 같다 — 유형은 수입·공정·출하검사,
                방법은 전수·샘플링(사본 실측). 켜 두면 그때 검사요청이 자동으로 나간다.
              */}
              <div>
                <label className="mb-1 block text-sm text-slate-600">품질검사유형</label>
                <select className={inputCls} value={form.qcType} onChange={(e) => set('qcType', e.target.value)}>
                  <option value="">선택 안 함</option>
                  {QC_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">품질검사방법</label>
                <select className={inputCls} value={form.qcMethod} onChange={(e) => set('qcMethod', e.target.value)}>
                  <option value="">선택 안 함</option>
                  {QC_METHODS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">품질검사요청-구매</label>
                <select className={inputCls} value={form.qcOnPurchase} onChange={(e) => set('qcOnPurchase', e.target.value)}>
                  <option value="N">요청안함</option><option value="Y">요청함</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">품질검사요청-생산입고</label>
                <select className={inputCls} value={form.qcOnProduction} onChange={(e) => set('qcOnProduction', e.target.value)}>
                  <option value="N">요청안함</option><option value="Y">요청함</option>
                </select>
              </div>
              {/* 팔거나 옮길 때 생산전표를 자동으로 만든다 — 만들면서 파는 품목에 쓴다. */}
              <div>
                <label className="mb-1 block text-sm text-slate-600">생산전표생성-판매</label>
                <select className={inputCls} value={form.autoProductionOnSales} onChange={(e) => set('autoProductionOnSales', e.target.value)}>
                  <option value="N">생성안함</option><option value="Y">생성함</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">생산전표생성-창고이동</label>
                <select className={inputCls} value={form.autoProductionOnTransfer} onChange={(e) => set('autoProductionOnTransfer', e.target.value)}>
                  <option value="N">생성안함</option><option value="Y">생성함</option>
                </select>
              </div>
            </div>
          )}
          {/*
            <b>추가항목(사용자정의).</b> 원본은 이 자리에 [문자형추가항목1~6]·[숫자형추가항목N]
            을 이름째 박아 둔다. 우리는 Self-Customizing &gt; 사용자정의필드에서 <b>이름을 지어</b>
            정의하고, 정의가 있을 때만 여기 뜬다. <b>수정할 때만</b> 보인다 — 값은 그 행에
            붙는 것이라 행이 아직 없으면 붙일 데가 없다.
          */}
          {editId && <CustomFieldsPanel entityType="ITEM" entityId={editId} />}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '등록'}</button>
          </div>
        </form>
      )}</Modal>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 30, textAlign: 'center' }} data-export-skip="true">
                <input
                  type="checkbox"
                  checked={shown.length > 0 && shown.every((it) => selected.has(it.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((it) => it.id)) : new Set())}
                />
              </th>
              <th style={{ width: 34 }}></th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목코드')}>품목코드 {sort.mark('품목코드')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목명')}>품목명 {sort.mark('품목명')}</th>
              {/* 원본 열 순서: 품목코드 · 품목명 · [이미지] · 구매처명 · … */}
              <th style={{ width: 56 }}>이미지</th>
              <th style={{ width: 130, cursor: 'pointer' }} onClick={() => sort.toggle('구매처명')}>구매처명 {sort.mark('구매처명')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목구분')}>품목구분 {sort.mark('품목구분')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('규격정보')}>규격정보 {sort.mark('규격정보')}</th>
              <th>단위</th>
              <th style={{ textAlign: 'right' }}>판매단가</th>
              <th style={{ textAlign: 'right' }}>구매단가</th>
              <th style={{ textAlign: 'right' }}>안전재고</th>
              <th style={{ width: 110, cursor: 'pointer' }} onClick={() => sort.toggle('재고수량관리')}>재고수량관리 {sort.mark('재고수량관리')}</th>
              <th>관리항목</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목그룹1명')}>품목그룹1명 {sort.mark('품목그룹1명')}</th>
              <th style={{ width: 140, cursor: 'pointer' }} onClick={() => sort.toggle('검색창내용')}>검색창내용 {sort.mark('검색창내용')}</th>
              <th style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
              {/* 원본 마지막 열 [파일관리] — 그 품목의 이미지를 붙이거나 떼는 자리. */}
              <th style={{ width: 80, textAlign: 'center' }}>파일관리</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={19} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={19} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : (
              shown.map((it, idx) => (
                <tr key={it.id} style={selected.has(it.id) ? { background: '#f5f8ff' } : undefined}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
                  </td>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  {/* 원본은 코드·이름을 눌러 그 건을 연다(사본 실측: 두 칸이 링크다). */}
                  <td style={{ fontFamily: 'monospace' }}>
                    <button type="button" onClick={() => openEdit(it)}
                            style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12.5 }}>
                      {it.code}
                    </button>
                  </td>
                  <td>
                    <button type="button" onClick={() => openEdit(it)}
                            style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, textAlign: 'left' }}>
                      {it.name}
                    </button>
                  </td>
                  <td>
                    {it.imageFileId ? (
                      <img src={`/api/files/${it.imageFileId}`} alt={it.imageFileName ?? it.name}
                           title={it.imageFileName ?? ''}
                           style={{ width: 32, height: 32, objectFit: 'cover', border: '1px solid #e6eaef', verticalAlign: 'middle' }} />
                    ) : <span style={{ color: '#c9ced6' }}>-</span>}
                  </td>
                  <td>{partners.find((p) => p.id === it.supplierId)?.name ?? ''}</td>
                  <td>[{it.categoryName}]</td>
                  <td>{it.spec ?? ''}</td>
                  <td>{it.unit}</td>
                  <td style={{ textAlign: 'right' }}>{it.unitPrice.toLocaleString('ko-KR')}</td>
                  <td style={{ textAlign: 'right', color: (it.purchasePrice ?? 0) > 0 ? undefined : '#c9ced6' }}>
                    {(it.purchasePrice ?? 0).toLocaleString('ko-KR')}
                  </td>
                  <td style={{ textAlign: 'right' }}>{it.safetyStock.toLocaleString('ko-KR')}</td>
                  <td style={{ color: it.stockTracked === false ? '#c07a00' : undefined }}>
                    {it.stockTracked === false ? '수량관리제외' : '수량관리대상'}
                  </td>
                  <td>{it.managementItemName ?? ''}</td>
                  <td>{it.itemGroupName ?? ''}</td>
                  <td style={{ color: '#6b7280' }}>{it.searchKeyword ?? ''}</td>
                  <td style={{ textAlign: 'center', color: it.active ? '#1c7c3c' : '#c60a2e' }}>{it.active ? '사용' : '사용중단'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => openEdit(it)}
                            style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                      파일관리
                    </button>
                  </td>
                  <td>
                    <button onClick={() => openEdit(it)} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                    <button onClick={() => remove(it)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/*
        원본 [변경] — 고른 품목의 한 칸을 한 번에 바꾼다. 어떤 칸을 바꿀지 고르고
        새 값을 정한다. 비우면 그 칸을 비운다(그룹 미지정 · 구매처 없음).
      */}
      <Modal open={bulkOpen} title={`품목 일괄변경 (${selected.size}건)`} onClose={() => setBulkOpen(false)}>{(
        <div style={{ padding: 4 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="mb-1 block text-sm text-slate-600">바꿀 항목</label>
              <select className={inputCls} value={bulkField} style={{ width: 180 }}
                      onChange={(e) => { setBulkField(e.target.value as typeof bulkField); setBulkValue('') }}>
                <option value="itemGroupId">품목그룹1</option>
                <option value="managementItemId">관리항목</option>
                <option value="supplierId">구매처</option>
                <option value="stockTracked">재고수량관리</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">새 값</label>
              <select className={inputCls} value={bulkValue} style={{ width: 240 }}
                      onChange={(e) => setBulkValue(e.target.value)}>
                {bulkField === 'stockTracked' ? (
                  <>
                    <option value="Y">수량관리대상</option>
                    <option value="N">수량관리제외</option>
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
          <p style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
            고른 품목의 그 칸만 바꿉니다. 나머지 값은 그대로 둡니다.
          </p>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button type="button" className="ec-btn" onClick={() => setBulkOpen(false)}>닫기</button>
            <button type="button" className="ec-btn ec-btn-primary" onClick={bulkChange}>변경</button>
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

      {webOpen && (
        <div onClick={() => setWebOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 520, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>웹자료올리기 · 품목 대량 등록</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setWebOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <p style={{ margin: '0 0 8px' }}>엑셀/CSV 파일로 품목을 한 번에 등록하는 기능입니다. 아래에서 파일을 고르면 형식을 미리 확인할 수 있습니다.</p>
              {/* 원본 [웹자료올리기] 도 끌어다 놓을 수 있다. 파일 선택 버튼은 그대로 둔다. */}
              <EcFileDrop
                hint="여기에 파일 놓기 (엑셀·CSV)"
                onFiles={(fs) => onPickFile({ target: { files: fs } } as unknown as React.ChangeEvent<HTMLInputElement>)}
              />
              {webFile && (
                <div style={{ marginTop: 10, border: '1px solid #e6eaef', borderRadius: 3, padding: 10, background: '#f9fbfd' }}>
                  <div><b>{webFile.name}</b> · 데이터 <b style={{ color: 'var(--ec-blue-dark)' }}>{webFile.total.toLocaleString()}</b>행 인식</div>
                  {webFile.head.length > 0 && <div style={{ marginTop: 4, color: '#5a626e' }}>헤더: {webFile.head.join(' · ')}</div>}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="ec-btn" disabled title="서버 업로드 API 미구현" style={{ opacity: .55, cursor: 'default' }}>업로드 실행 (백엔드 미연동)</button>
                <span style={{ fontSize: 11.5, color: '#c07a00' }}>* 서버 일괄등록 API가 없어 미리보기까지만 제공합니다.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </EcListShell>
  )
}

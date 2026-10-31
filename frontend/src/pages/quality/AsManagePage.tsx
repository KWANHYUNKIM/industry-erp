import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/codepicker/CodePickerField'
import type { Item, Partner, Warehouse } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { loadSupplierParty, printDocuments } from '../../utils/printDocument'
import { Link } from 'react-router-dom'
import { dateText } from '../../utils/dateText'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { useShortcut } from '../../utils/useShortcut'
import AsReceiptScreen from '../../features/as/AsReceiptForm'
import { useRequired } from '../../utils/useRequired'
import { AS_STAGES as STAGES, AS_STAGE_LABEL as LABEL, asReceiptBody, asReceiptCheck, blankAsDraft, emptyAsLine, emptyAsLines,
  type AsFormLine, type AsReceiptDraft, type AsStatus } from '../../features/as/AsReceiptForm'
import { ecConfirm } from '../../components/EcDialog'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { todayYmd } from '../../utils/periods'
import { fmtNumber } from '../../utils/format'

/**
 * 재고 II › A/S관리 › A/S접수조회(E040602) · A/S접수입력(E040601) · A/S접수수정
 *
 * <p>2026-10-03 원본(loginaa)에서 직접 접수 → 수정 → 진행상태 변경 → 삭제를 해 보고 맞췄다.
 * <ul>
 *   <li>접수는 <b>품목을 격자로 여러 줄</b> 받는다(품목코드 · 품목명 · 수량, 합계줄). 우리는 품목 하나였다.</li>
 *   <li><b>[창고]가 없으면 저장하지 않는다</b>(빨간 테두리). 접수는 재고를 움직이지 않는다.</li>
 *   <li>수정 창은 <b>일자만 잠그고</b> 나머지는 다 고친다. 우리는 상태·담당·제목·예정일만 고쳤다.</li>
 *   <li>목록 알약은 진행단계(접수 – 수리중 – 완료)이고 <b>[접수]로 연다</b>. 수리중으로 바꾸면 그 줄은 접수 알약에서 빠진다.</li>
 *   <li>[선택삭제] · 수정 창 [삭제] — "선택한 전표를 삭제 하겠습니까?". 우리는 지울 수가 없었다.</li>
 * </ul>
 * 부품 · 수리비는 원본처럼 A/S수리조회 [생성한 전표](판매연결전표)에서 판매로 잡는다 — 접수에는 소모부품이 없다.
 */

/* 접수진행상태 · 입력 칸은 features/as/AsReceiptForm 에 있다(메뉴의 A/S접수입력 화면과 같이 쓴다). */

interface AsLine { id: number; lineNo: number; itemId: number; itemCode: string; itemName: string; itemSpec: string | null; quantity: number; note: string | null }
interface AsRow {
  /** 원본은 [거래처] 없이도 접수를 받는다 — partnerId 가 비고 partnerName 은 '' 다. */
  id: number; asNo: string; partnerId: number | null; partnerName: string; itemId: number; itemName: string
  receiptDate: string; title: string | null; scheduledDate: string | null
  warehouseId: number | null; warehouseName: string | null
  projectId: number | null; projectName: string | null
  symptom: string | null; charge: string | null
  status: AsStatus; statusName: string; doneDate: string | null; repairNote: string | null
  /** 원본 조건 [품목구분]. 품목 마스터의 값이라 서버가 실어 준다. */
  itemCategoryName: string | null
  /** 원본 조건 [최초작성자]·[최초작성일자]·[최종작업일자], [기타]의 수정일자순(정렬). */
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
  /** 원본 A/S접수 품목 격자와 [수량] 합계. */
  lines: AsLine[]
  totalQuantity: number
  /** 원본 머리 [새로운 항목 추가]. */
  extraNote: string | null
}


/** 원본 [접수증] — 접수한 품목 줄을 찍는다(금액 없는 양식). */
/** 목록 [접수증인쇄]는 고른 접수를 한 번에 찍는다. */
async function printAsReceipts(rs: AsRow[], title = 'A/S 접수증') {
  const ours = await loadSupplierParty('수리처')
  await printDocuments(rs.map((r) => ({
    title,
    docNo: r.asNo,
    docDate: r.receiptDate,
    supplier: ours ?? { label: '수리처', name: '(회사정보 미등록)' },
    customer: { label: '의뢰처', name: r.partnerName },
    extra: [
      { label: '제목', value: r.title },
      { label: '접수내용', value: r.symptom },
      { label: '수리예정일자', value: r.scheduledDate },
      { label: '접수담당자', value: r.charge },
      { label: '접수진행상태', value: r.statusName },
    ],
    remark: r.repairNote,
    hideAmounts: true,
    lines: r.lines.map((l) => ({
      itemName: l.itemName, spec: l.itemSpec ?? undefined, unit: '',
      quantity: l.quantity, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
    })),
  })))
}
const printAsReceipt = (r: AsRow, title?: string) => printAsReceipts([r], title)


export default function AsManagePage() {
  const [rows, setRows] = useState<AsRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /* 원본 알약은 [접수]로 연다(2026-10-03 실측). */
  /*
   * 원본 알약(2026-10-04): 전체 · 확인 · 접수 · 수리중 · 완료. [확인]은 진행단계가 아니라 전표상태다 —
   * 결재를 거치지 않는 회사라 모든 접수가 확인이다(A/S수리조회와 같음). 그래서 [확인] = 전체.
   */
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CONFIRMED' | AsStatus>('RECEIVED')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [openDetail, setOpenDetail] = useState<number | null>(null)
  /*
   * 원본 A/S접수의 조건에 <b>[담당자]</b> 가 있다(사본 실측). 담당자는 이미 목록에
   * 찍히는 값이다(AsResponse.charge) — 누가 맡았는지 보이면서도 그것으로 모아 볼 수 없었다.
   */
  const [chargeCond, setChargeCond] = useState('')
  /*
   * 원본 A/S접수조회 조건 차례(사본 실측): <b>수리예정일자</b> · 창고 · 거래처 · 품목 ·
   * 프로젝트 · 담당자 · <b>제목</b> · 최종수정자 · 기타 · 발송여부 · 적용양식.
   *
   * <p>제목·수리예정일자를 <b>찍기만 하고 거를 수는 없으면</b> 값이 있으나 마나다 —
   * 이 저장소에서 되풀이한 실수라 만들 때 조건까지 같이 단다.
   * <p>[창고]도 같은 실수였다 — A/S 전표는 창고를 <b>들고 있고</b> 목록에 찍기까지 하는데
   * 그것으로 거를 수가 없었다(검사가 잡았다). [발송여부]·[최종수정자]는 그 값이 없다.
   */
  const [schedFrom, setSchedFrom] = useState('')
  const [schedTo, setSchedTo] = useState('')
  const [titleCond, setTitleCond] = useState('')
  /** 원본 A/S접수조회 조건의 [창고]. 전표가 든 값이라 그대로 거른다. */
  const [whCond, setWhCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [projCond, setProjCond] = useState('')
  /*
   * 2026-09-08 에 원본(E040602)을 열어 조건을 <b>전부</b> 쟀다 — <b>서른하나</b>다.
   * 사본에는 열하나뿐이었고 <b>맨 앞의 [기준일자]</b>가 빠져 있었다(발주서조회·
   * 창고이동조회·결제내역조회에 이어 네 번째로 첫 줄을 건너뛴 사본이다).
   * [수리예정일자]는 둘째 줄이다. 기본 기간은 [최근30일(+1개월)] 이다.
   */
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [partnerGroupCond, setPartnerGroupCond] = useState('')
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [symptomCond, setSymptomCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [madeFrom, setMadeFrom] = useState('')
  const [madeTo, setMadeTo] = useState('')
  const [editedFrom, setEditedFrom] = useState('')
  const [editedTo, setEditedTo] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const mgmt = useItemMgmt()
  const pgroups = usePartnerGroups()

  async function load() {
    try {
      const period: Record<string, string> = {}
      if (from) period.from = from
      if (to) period.to = to
      const [a, p, i, w, pj] = await Promise.all([
        api.get<AsRow[]>('/as-requests', { params: period }),
        api.get<Partner[]>('/partners'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ id: number; code: string; name: string }[]>('/projects'),
      ])
      setRows(a.data); setPartners(p.data); setItems(i.data); setWarehouses(w.data); setProjects(pj.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  /* 기간을 바꾸면 그 기간으로 다시 받는다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])


  /* ── A/S접수입력 · A/S접수수정 ─────────────────────────────── */
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AsRow | null>(null)
  const [f, setF] = useState<AsReceiptDraft>(blankAsDraft())
  const [lines, setLines] = useState<AsFormLine[]>(emptyAsLines())
  const [formError, setFormError] = useState('')
  const req = useRequired()
  const [saving, setSaving] = useState(false)

  function openNew() {
    setEditing(null); setFormError(''); req.reset(); setLines(emptyAsLines())
    /* 원본은 저장 뒤 새 창에 [창고]를 그대로 남긴다 — 같은 창고로 잇달아 받는다. */
    setF((x) => blankAsDraft(x.warehouseId))
    setOpen(true)
  }
  async function openEdit(r: AsRow) {
    setEditing(r); setFormError(''); req.reset()
    setF({ receiptDate: r.receiptDate, partnerId: r.partnerId ? String(r.partnerId) : '', charge: r.charge ?? '',
      warehouseId: r.warehouseId ? String(r.warehouseId) : '', status: r.status,
      scheduledDate: r.scheduledDate ?? '', projectId: r.projectId ? String(r.projectId) : '',
      title: r.title ?? '', symptom: r.symptom ?? '', extraNote: r.extraNote ?? '' })
    setLines([...r.lines.map((l) => ({ itemId: String(l.itemId), quantity: String(l.quantity), note: l.note ?? '' })), emptyAsLine()])
    setOpen(true)
  }
  /* 원본 수정 창 [복사] — 같은 내용으로 새 접수 창을 연다(일자는 오늘, 진행상태는 접수). */
  function copyEditing() {
    setEditing(null); setFormError('')
    setF((x) => ({ ...x, receiptDate: todayYmd(), status: 'RECEIVED' }))
    setLines((ls) => ls.map((l) => ({ ...l })))
  }

  async function save() {
    if (saving) return
    if (!req.check(asReceiptCheck(f, lines))) return
    const built = asReceiptBody(f, lines)
    if ('error' in built) return setFormError(built.error)
    setSaving(true); setFormError('')
    try {
      if (editing) {
        await api.patch(`/as-requests/${editing.id}`, built.body)
        setOpen(false)
      } else {
        await api.post('/as-requests', { ...built.body, receiptDate: f.receiptDate })
        openNew()   /* 원본은 저장하면 빈 입력 창으로 돌아간다. */
      }
      load()
    } catch (err) { setFormError(extractErrorMessage(err)) } finally { setSaving(false) }
  }
  useShortcut('F8', save, open)

  async function removeOne() {
    if (!editing || !(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
    try { await api.delete(`/as-requests/${editing.id}`); setOpen(false); load() }
    catch (err) { setFormError(extractErrorMessage(err)) }
  }
  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0 || !(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/as-requests/${id}`)))
    const failed = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]
    setPicked(new Set())
    setError(failed.length ? failed.map((x) => extractErrorMessage(x.reason)).join(' / ') : '')
    load()
  }

  /* 원본 [진행상태변경] — 고른 접수의 단계를 한 번에 바꾼다. */
  const [stageOpen, setStageOpen] = useState(false)
  const [stageTo, setStageTo] = useState<AsStatus>('IN_PROGRESS')
  async function changeStage() {
    const ids = [...picked]
    const results = await Promise.allSettled(ids.map((id) => api.patch(`/as-requests/${id}`, { status: stageTo })))
    const failed = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]
    setStageOpen(false); setPicked(new Set())
    setError(failed.length ? failed.map((x) => extractErrorMessage(x.reason)).join(' / ') : '')
    load()
  }

  /* 원본 [접수일자-번호] '26/10/03-1' */
  const dateNo = (r: AsRow) => {
    const seq = r.asNo.split('-').pop() ?? ''
    return `${r.receiptDate.slice(2).replace(/-/g, '/')}-${Number(seq) || seq}`
  }

  const shownRows = rows
    .filter((r) => statusFilter === 'ALL' || statusFilter === 'CONFIRMED' || r.status === statusFilter)
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.itemName.includes(keyword) || r.asNo.includes(keyword))
    .filter((r) => !schedFrom || (r.scheduledDate ?? '') >= schedFrom)
    .filter((r) => !schedTo || (r.scheduledDate != null && r.scheduledDate <= schedTo))
    .filter((r) => !chargeCond || (r.charge ?? '').includes(chargeCond))
    .filter((r) => !itemCond || r.itemName.includes(itemCond))
    /* 이름은 겹칠 수 있다 — id 로 거른다(QA 9회차). */
    .filter((r) => !whCond || String(r.warehouseId) === whCond)
    .filter((r) => !projCond || String(r.projectId) === projCond)
    .filter((r) => !titleCond || (r.title ?? '').includes(titleCond))
    /* 원본 첫 줄 [기준일자] — 접수한 날이다. 둘째 줄 [수리예정일자]와 다르다. */
    .filter((r) => !from || r.receiptDate >= from)
    .filter((r) => !to || r.receiptDate <= to)
    .filter((r) => !partnerCond || String(r.partnerId) === partnerCond)
    .filter((r) => !partnerGroupCond || pgroups.groupOfName(r.partnerName) === partnerGroupCond)
    .filter((r) => !categoryCond || (r.itemCategoryName ?? '') === categoryCond)
    .filter((r) => !itemGroupCond || mgmt.groupOf(r.itemId) === itemGroupCond)
    .filter((r) => !symptomCond || (r.symptom ?? '').includes(symptomCond))
    .filter((r) => !remarkCond || (r.repairNote ?? '').includes(remarkCond))
    .filter((r) => !authorCond || (r.createdBy ?? '') === authorCond)
    .filter((r) => !madeFrom || (r.createdAt ?? '').slice(0, 10) >= madeFrom)
    .filter((r) => !madeTo || ((r.createdAt ?? '') !== '' && r.createdAt!.slice(0, 10) <= madeTo))
    .filter((r) => !editedFrom || (r.updatedAt ?? '').slice(0, 10) >= editedFrom)
    .filter((r) => !editedTo || ((r.updatedAt ?? '') !== '' && r.updatedAt!.slice(0, 10) <= editedTo))
    /* 원본 [기타]의 수정일자순(정렬). */
    .sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') : 0))

  const sort = useTableSort(shownRows, {
    '접수일자-번호': (r) => `${r.receiptDate} ${r.asNo}`,
    거래처: (r) => r.partnerName,
  })
  const shown = sort.sorted
  const pickable = shown.map((r) => r.id)
  /* 수정 창의 [이전] · [다음] 은 목록에 보이는 차례로 옮겨 간다. */
  const editIdx = editing ? shown.findIndex((r) => r.id === editing.id) : -1
  const allPicked = pickable.length > 0 && pickable.every((id) => picked.has(id))

  return (
    <EcListShell
      title="A/S접수조회"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={openNew}
      actions={[
        { label: '진행상태변경', onClick: () => setStageOpen(true), selected: picked.size },
        /* 원본 버튼줄: 신규(F2) · Email · 진행상태변경 · 보내기 · 접수증인쇄 · 바코드(품목) · 다른전표생성 · 선택삭제 · Excel · 이력조회. */
        { label: '접수증인쇄', onClick: () => void printAsReceipts(rows.filter((r) => picked.has(r.id))), disabled: picked.size === 0 },
        { label: '선택삭제', onClick: removeChecked, selected: picked.size },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="ec-search-conds flex flex-wrap items-center gap-[6px] mb-[8px] text-[12.5px] text-ec-label">
        {/* 원본 첫 줄은 <b>[기준일자]</b>(접수한 날)고 [수리예정일자]는 둘째 줄이다(2026-09-08 실측). */}
        <span>기준일자</span>
        <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
        <span className="ml-[8px]">수리예정일자</span>
        <EcDateRange from={{ className: "ec-input", value: schedFrom, onChange: (e) => setSchedFrom(e.target.value) }} to={{ className: "ec-input", value: schedTo, onChange: (e) => setSchedTo(e.target.value) }} />
        {/* 원본 차례: 수리예정일자 · <b>창고</b> · 거래처 · 품목 · 프로젝트 · 담당자 · 제목. */}
        <span className="ml-[8px]">창고</span>
        <CodePickerField label="창고" hideLabel width={140} emptyLabel="전체"
                         value={whCond} onChange={setWhCond}
                         items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        {/* 원본 차례: 창고 · (창고계층그룹) · <b>거래처 · 거래처그룹1</b> · 품목 · 품목구분 · 품목그룹1 · 프로젝트 … */}
        <span className="ml-[8px]">거래처</span>
        <CodePickerField label="거래처" hideLabel width={150} emptyLabel="전체"
                         value={partnerCond} onChange={setPartnerCond}
                         items={[...new Map(rows.filter((r) => r.partnerId != null).map((r) => [r.partnerId, r.partnerName])).entries()]
                           .sort((a, b) => a[1].localeCompare(b[1], 'ko')).map(([id, n]) => ({ value: String(id), name: n }))} />
        <span className="ml-[8px]">거래처그룹1</span>
        <CodePickerField label="거래처그룹1" hideLabel width={140} emptyLabel="전체"
                         value={partnerGroupCond} onChange={setPartnerGroupCond}
                         items={pgroups.groupOptions.map((n) => ({ value: n, name: n }))} />
        <span className="ml-[8px]">프로젝트</span>
        <CodePickerField label="프로젝트" hideLabel width={150} emptyLabel="전체"
                         value={projCond} onChange={setProjCond}
                         items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        <span className="ml-[8px]">품목</span>
        <input className="ec-input" value={itemCond} onChange={(e) => setItemCond(e.target.value)}
               placeholder="품목" style={{ width: 150 }} />
        <span className="ml-[8px]">품목구분</span>
        <CodePickerField label="품목구분" hideLabel width={130} emptyLabel="전체"
                         value={categoryCond} onChange={setCategoryCond}
                         items={[...new Set(rows.map((r) => r.itemCategoryName).filter(Boolean) as string[])].sort()
                           .map((n) => ({ value: n, name: n }))} />
        <span className="ml-[8px]">품목그룹1</span>
        <CodePickerField label="품목그룹1" hideLabel width={130} emptyLabel="전체"
                         value={itemGroupCond} onChange={setItemGroupCond}
                         items={mgmt.groupOptions.map((n) => ({ value: n, name: n }))} />
        <span className="ml-[8px]">담당자</span>
        <input className="ec-input" value={chargeCond} onChange={(e) => setChargeCond(e.target.value)}
               placeholder="담당자" style={{ width: 150 }} />
        <span className="ml-[8px]">제목</span>
        <input className="ec-input" value={titleCond} onChange={(e) => setTitleCond(e.target.value)}
               placeholder="제목" style={{ width: 170 }} />
        {/* 원본 차례: 제목 · (최종수정자) · 기타 · (발송여부) · 접수내용 · 적요 · 최초작성자 · 최초작성일자 · 최종작업일자 … */}
        <span className="ml-[8px]">기타</span>
        <label className="text-[12.5px] inline-flex items-center gap-[4px]">
          <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
          수정일자순(정렬)
        </label>
        <span className="ml-[8px]">접수내용</span>
        <input className="ec-input" value={symptomCond} onChange={(e) => setSymptomCond(e.target.value)}
               placeholder="접수내용" style={{ width: 150 }} />
        <span className="ml-[8px]">적요</span>
        <input className="ec-input" value={remarkCond} onChange={(e) => setRemarkCond(e.target.value)}
               placeholder="적요" style={{ width: 150 }} />
        <span className="ml-[8px]">최초작성자</span>
        <CodePickerField label="최초작성자" hideLabel width={130} emptyLabel="전체"
                         value={authorCond} onChange={setAuthorCond}
                         items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                           .map((n) => ({ value: n, name: n }))} />
        <span className="ml-[8px]">최초작성일자</span>
        <EcDateRange from={{ className: "ec-input", value: madeFrom, onChange: (e) => setMadeFrom(e.target.value) }} to={{ className: "ec-input", value: madeTo, onChange: (e) => setMadeTo(e.target.value) }} />
        <span className="ml-[8px]">최종작업일자</span>
        <EcDateRange from={{ className: "ec-input", value: editedFrom, onChange: (e) => setEditedFrom(e.target.value) }} to={{ className: "ec-input", value: editedTo, onChange: (e) => setEditedTo(e.target.value) }} />
      </div>

      {/* 원본 알약: 전체 · 확인 · 접수 – 수리중 – 완료. [접수]로 연다. */}
      <div className="flex items-center justify-between mb-[6px]">
        <div className="ec-pills">
          {(['ALL', 'CONFIRMED', ...STAGES] as const).map((s) => (
            <button key={s} type="button" className={`ec-pill no-ec${statusFilter === s ? ' active' : ''}`}
                    onClick={() => setStatusFilter(s)}>{s === 'ALL' ? '전체' : s === 'CONFIRMED' ? '확인' : LABEL[s]}</button>
          ))}
        </div>
        {from && to && <span className="text-ec-label">{dateText(from)} ~ {dateText(to)}</span>}
      </div>

      <table className="w-full ec-head700">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <input type="checkbox" checked={allPicked} disabled={pickable.length === 0}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(pickable))} />
            </th>
            <th className="w-[110px] text-center cursor-pointer" onClick={() => sort.toggle('접수일자-번호')}>접수일자-번호 {sort.mark('접수일자-번호')}</th>
            <th className="w-[100px]">접수담당자</th>
            <th>제목</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('거래처')}>거래처 {sort.mark('거래처')}</th>
            <th>접수내용</th>
            <th className="w-[100px] text-center">수리예정일자</th>
            <th className="w-[70px] text-center">상세내역</th>
            <th className="w-[70px] text-center">접수증</th>
            <th className="w-[90px] text-center">접수단계</th>
            <th className="w-[84px] text-center">생성한 전표</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => [
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((s) => {
                  const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n
                })} />
              </td>
              <td className="text-center"><a className="ec-link cursor-pointer" onClick={() => openEdit(r)}>{dateNo(r)}</a></td>
              <td>{r.charge ?? ''}</td>
              <td>
                <button type="button" className="ec-link mr-[4px]" title="품목 줄"
                        onClick={() => setOpenDetail(openDetail === r.id ? null : r.id)}>{openDetail === r.id ? '▾' : '▸'}</button>
                {r.title ?? ''}
              </td>
              <td>{r.partnerName}</td>
              <td>{r.symptom ?? ''}</td>
              <td className="text-center">{r.scheduledDate ? r.scheduledDate.slice(2).replace(/-/g, '/') : ''}</td>
              <td className="text-center">
                {/* 원본 [상세내역]은 인쇄 링크다(2026-10-03 실측) — 품목 줄은 이름 옆 ▸ 로 그 자리에서 편다. */}
                <button type="button" className="ec-link" onClick={() => printAsReceipt(r, 'A/S 상세내역')}>인쇄</button>
              </td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => printAsReceipt(r)}>인쇄</button></td>
              <td className="text-center">{r.statusName}</td>
              <td className="text-center">
                <Link className="ec-link" to={`/inventory/ledger?keyword=${encodeURIComponent(r.asNo)}`}>조회</Link>
              </td>
            </tr>,
            openDetail === r.id ? (
              <tr key={`${r.id}-d`}>
                <td colSpan={11} className="bg-ec-page py-[8px] px-[14px]">
                  <table className="w-full max-w-[640px]">
                    <thead><tr><th className="w-[34px]"></th><th className="w-[120px]">품목코드</th><th>품목명</th><th className="w-[80px] text-right">수량</th><th>새로운 항목 추가</th></tr></thead>
                    <tbody>
                      {r.lines.map((l) => (
                        <tr key={l.id}><td className="text-center">{l.lineNo}</td><td>{l.itemCode}</td><td>{l.itemName}{l.itemSpec ? ` [${l.itemSpec}]` : ''}</td><td className="text-right">{fmtNumber(Number(l.quantity))}</td><td>{l.note ?? ''}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            ) : null,
          ]).flat()}
        </tbody>
      </table>

      <Modal open={stageOpen} title="진행상태변경" error={error} onClose={() => setStageOpen(false)} width={360}>
        <div className="flex flex-col gap-[6px]">
          {STAGES.map((s) => (
            <label key={s} className="flex items-center gap-[4px]">
              <input type="radio" checked={stageTo === s} onChange={() => setStageTo(s)} />{LABEL[s]}
            </label>
          ))}
        </div>
        <div className="flex gap-[4px] mt-[10px]">
          <button className="ec-btn ec-btn-primary" onClick={changeStage}>적용</button>
          <button className="ec-btn" onClick={() => setStageOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={open} width={980} error={formError} onClose={() => setOpen(false)}
             title={editing ? 'A/S접수수정' : 'A/S접수입력'}>
        <AsReceiptScreen f={f} setF={setF} lines={lines} setLines={setLines} editing={!!editing} req={req}
                         partners={partners} warehouses={warehouses} projects={projects} items={items} />

        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
          {/* 원본 수정 창 버튼줄: 저장(F8) · 저장/전표(F7) · 복사 · 이전 · 다음 · 닫기 · 삭제 · 보내기 · H(2026-10-13 실측). */}
          {editing ? <>
            <button className="ec-btn" onClick={copyEditing}>복사</button>
            <button className="ec-btn" disabled={editIdx <= 0} onClick={() => void openEdit(shown[editIdx - 1])}>이전</button>
            <button className="ec-btn" disabled={editIdx < 0 || editIdx >= shown.length - 1} onClick={() => void openEdit(shown[editIdx + 1])}>다음</button>
            <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
            <button className="ec-btn" onClick={removeOne}>삭제</button>
          </> : <>
            <button className="ec-btn" onClick={() => { setLines(emptyAsLines()); setF((x) => blankAsDraft(x.warehouseId)); setFormError('') }}>다시 작성</button>
            <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </>}
        </div>

      </Modal>
    </EcListShell>
  )
}

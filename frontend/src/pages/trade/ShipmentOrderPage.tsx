import { useEffect, useMemo, useState, type FormEvent, useRef} from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { Item, Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerManagers } from '../../utils/partnerManagers'

/** 영업 > 출하지시서 — 출하지시(READY) 등록 → 출하처리(SHIPPED). 백엔드 /shipments 연동 */
type ShipStatus = 'READY' | 'SHIPPED' | 'CANCELED'
const STATUS_COLOR: Record<ShipStatus, string> = { READY: '#b6791b', SHIPPED: '#1c7c3c', CANCELED: '#8a929c' }

/** 원본 조건 [규격]. 서버는 진작 보내는데 이 화면이 안 받아 두고 있었다. */
interface ShipLine { itemId: number; itemCode: string; itemName: string; unit: string; spec: string | null; quantity: number; unitPrice: number; amount: number; remark: string | null }
interface Shipment {
  id: number; shipNo: string; partnerId: number; partnerName: string; shipDate: string
  /** 미출하현황에서 생성한 출하면 근거 주문이 실려온다. 직접 등록한 출하는 null. */
  salesOrderId: number | null; salesOrderNo: string | null
  /** 원본 출하지시서입력의 머리 항목들 — 출하예정일 · 출하창고 · 담당자 · 배송지. */
  dueDate: string | null
  warehouseId: number | null; warehouseName: string | null
  /** 응답에 이미 오던 값. 원본 조건의 [프로젝트]를 걸려면 화면이 받아 둬야 한다. */
  projectName: string | null
  employeeId: number | null; employeeName: string | null
  contact: string | null; postalCode: string | null; address: string | null
  status: ShipStatus; statusName: string; totalQuantity: number; totalAmount: number
  remark: string | null; createdBy: string | null
  /** 원본 [기타]의 <b>수정일자순(정렬)</b>. 이번에 응답에 실었다. */
  createdAt: string | null; updatedAt: string | null
  lines: ShipLine[]
}

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())
/**
 * 원본 출하지시서입력 그리드 실측(사본): 품목 · 품목명 · 규격 · 수량 · <b>적요</b>.
 * 전표 적요만으로는 "이 품목만 왜 따로 보내는지" 를 줄에 적을 자리가 없다.
 */
interface LineInput { itemId: string; quantity: string; unitPrice: string; remark: string }
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', unitPrice: '', remark: '' })

export default function ShipmentOrderPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [condFrom, setCondFrom] = useState('')
  const [condTo, setCondTo] = useState('')
  const [shipNoCond, setShipNoCond] = useState('')
  const [warehouseCond, setWarehouseCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [sendCond, setSendCond] = useState<'' | ShipStatus>('')
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects'])

  const [partnerId, setPartnerId] = useState('')
  const [shipDate, setShipDate] = useState(today())
  /**
   * 원본 출하지시서입력의 머리 항목들 — 출하예정일 · 출하창고 · 담당자 · 연락처 · 우편번호 · 주소.
   *
   * <p>배송지가 없으면 어디로 보낼지 적을 자리가 없어 적요에 손으로 적게 되고,
   * 그러면 아무 화면도 그걸 배송지로 알아보지 못한다. 출하예정일은 미출하현황의 조건이기도
   * 한데, 값이 없어서 그 조건으로는 아무것도 못 걸렀다.
   */
  const [dueDate, setDueDate] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [contact, setContact] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [address, setAddress] = useState('')
  const [warehouses, setWarehouses] = useState<{ id: number; code: string; name: string }[]>([])
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])
  const [remark, setRemark] = useState('')
  /**
   * 귀속 프로젝트. 출하현황의 [프로젝트] 조건이 이 값을 본다 —
   * 조건만 있고 정할 자리가 없으면 그 조건은 늘 빈칸만 거른다.
   */
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])

  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])

  async function load() {
    try {
      const [s, p, i, w, e, pj] = await Promise.all([
        api.get<Shipment[]>('/shipments'),
        api.get<Partner[]>('/partners'),
        api.get<Item[]>('/items'),
        api.get<{ id: number; code: string; name: string }[]>('/warehouses'),
        api.get<{ id: number; name: string }[]>('/employees'),
        api.get<{ id: number; code: string; name: string }[]>('/projects'),
      ])
      setShipments(s.data); setPartners(p.data); setItems(i.data)
      setWarehouses(w.data); setEmployees(e.data); setProjects(pj.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId' && value) {
        const it = itemById.get(value)
        if (it && !next[idx].unitPrice) next[idx] = { ...next[idx], unitPrice: String(it.unitPrice) }
        if (!next[idx].quantity) next[idx] = { ...next[idx], quantity: '1' }
        if (idx === ls.length - 1) next.push(emptyLine())
      }
      return next
    })
  }

  const computed = lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))
  const totals = lines.reduce((a, l, i) => ({ qty: a.qty + (Number(l.quantity) || 0), amount: a.amount + computed[i] }), { qty: 0, amount: 0 })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: l.unitPrice ? Number(l.unitPrice) : undefined, remark: l.remark || null }))
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (validLines.length === 0) return setError('품목·수량을 1줄 이상 입력하세요.')
    try {
      const res = await api.post<Shipment>('/shipments', {
        partnerId: Number(partnerId), shipDate,
        dueDate: dueDate || undefined,
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        employeeId: employeeId ? Number(employeeId) : undefined,
        contact: contact || undefined,
        postalCode: postalCode || undefined,
        address: address || undefined,
        projectId: projectId ? Number(projectId) : null,
        remark: remark || undefined,
        lines: validLines,
      })
      setOk(`${res.data.shipNo} 출하지시 등록 완료 (수량 ${won(res.data.totalQuantity)})`)
      setLines([emptyLine()]); setRemark(''); setProjectId('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  /*
   * 고른 출하지시를 한 번에 넘긴다. <b>출하지시(READY)인 것만</b> 넘어간다 —
   * 이미 나갔거나 취소된 건을 다시 건드리면 서버가 막고, 막힌 줄 때문에 나머지도 멈춘다.
   */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  async function bulkStatus() {
    const targets = shown.filter((s) => checked.has(s.id) && s.status === 'READY')
    if (targets.length === 0) { setError('출하지시 상태인 줄을 고르세요.'); return }
    setError('')
    try {
      for (const t of targets) await api.patch(`/shipments/${t.id}/status`, { status: 'SHIPPED' })
      setChecked(new Set())
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function advance(s: Shipment) {
    try { await api.patch(`/shipments/${s.id}/status`, { status: 'SHIPPED' }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }
  async function cancel(s: Shipment) {
    if (!confirm(`${s.shipNo} 출하지시를 취소할까요?`)) return
    try { await api.patch(`/shipments/${s.id}/status`, { status: 'CANCELED' }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function remove(s: Shipment) {
    if (!confirm(`${s.shipNo} 출하지시를 삭제할까요? 되돌릴 수 없습니다.`)) return
    try { await api.delete(`/shipments/${s.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  /*
   * 원본 출하지시서조회의 조건 실측(사본): <b>기준일자 · 출하지시No. · 창고 · 프로젝트 ·
   * 관리항목 · 거래처 · 품목 · 발송여부</b>.
   * 우리는 <b>조건 판이 아예 없었다</b> — 검색상자 하나로 거래처와 번호만 걸렀다.
   * 출하지시가 쌓이면 "저 창고 것만", "아직 안 나간 것만" 을 물을 방법이 없다.
   *
   * <p>[관리항목]은 품목 마스터에 붙는 값이라 출하 전표 응답에는 실려 오지 않는다.
 * 그래도 만들 수 있다 — 품목 마스터를 받아 <b>줄의 itemId 로 화면에서 잇는다</b>
 * (판매현황이 먼저 그렇게 만들었고, utils/itemMgmtItems 로 나눠 갖는다).
   */
  /** 원본 [관리항목]. 이 화면은 품목 마스터를 진작 통째로 받아 두고 있다. */
  const mgmt = useItemMgmt(items)
  const [mgmtCond, setMgmtCond] = useState('')
  /*
   * 2026-09-07 에 원본(E040221)을 열어 <b>접힌 줄까지 펼쳐</b> 조건을 전부 쟀다(서른셋).
   * 사본에는 열뿐이었다 — 조건 판 아래 '···' 줄을 안 펼친 채로 사본을 떴기 때문이다.
   * 그중 우리 응답이 <b>이미 싣고 있던 여덟</b>을 만든다: 출하예정일 · 규격 · 담당자 ·
   * 거래처관리담당자 · 연락처 · 주소 · 적요 · 작성자.
   * 여덟 다 값이 오는데 거를 자리가 없었다 — 출하지시서입력이 <b>받아서 저장까지 하는</b>
   * 배송지(연락처·주소)를 조회에서 못 물었다.
   */
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  /** 원본 [거래처관리담당자]. 전표 [담당자](맡은 사원)와 <b>다른 사람</b>이다. */
  const pmgr = usePartnerManagers(partners)
  const [pmgrCond, setPmgrCond] = useState('')
  const [contactCond, setContactCond] = useState('')
  const [addressCond, setAddressCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  /*
   * 두 바퀴 전에 [최초작성일자]·[최종작업일자]를 '조건 줄이 이미 아홉이라 출하조회에서
   * 본다' 고 적고 뺐다. <b>그건 이유가 아니라 게으름이었다</b> — 같은 응답이 두 값을
   * 싣고 있고, 원본은 이 화면에서도 둘 다 묻는다. 줄이 길다는 것은 원본도 마찬가지다.
   */
  const [madeFrom, setMadeFrom] = useState('')
  const [madeTo, setMadeTo] = useState('')
  const [editedFrom, setEditedFrom] = useState('')
  const [editedTo, setEditedTo] = useState('')
  /** 원본 [기타]는 이 화면에서 <b>수정일자순(정렬)</b> 하나다(실측). */
  const [byUpdated, setByUpdated] = useState(false)
  const shownRows = shipments
    .filter((s) => !keyword || s.partnerName.includes(keyword) || s.shipNo.includes(keyword))
    .filter((s) => !condFrom || s.shipDate >= condFrom)
    .filter((s) => !condTo || s.shipDate <= condTo)
    .filter((s) => !shipNoCond || s.shipNo.includes(shipNoCond))
    .filter((s) => !warehouseCond || (s.warehouseName ?? '').includes(warehouseCond))
    .filter((s) => !projectCond || (s.projectName ?? '').includes(projectCond))
    .filter((s) => !partnerCond || s.partnerName.includes(partnerCond))
    .filter((s) => !itemCond || s.lines.some((l) => l.itemName.includes(itemCond)))
    .filter((s) => mgmt.hits(s.lines.map((l) => l.itemId), mgmtCond))
    .filter((s) => !sendCond || s.status === sendCond)
    /* 원본 [출하예정일] — 기준일자(출하지시일)와 다른 날이다. */
    .filter((s) => !dueFrom || (s.dueDate ?? '') >= dueFrom)
    .filter((s) => !dueTo || ((s.dueDate ?? '') !== '' && (s.dueDate as string) <= dueTo))
    /* 원본 [규격] — 전표 안의 어느 줄이든 그 규격이면 걸린다(품목과 같은 규칙). */
    .filter((s) => !specCond || s.lines.some((l) => (l.spec ?? '') === specCond))
    .filter((s) => !empCond || (s.employeeName ?? '') === empCond)
    .filter((s) => !pmgrCond || pmgr.managerOfName(s.partnerName) === pmgrCond)
    .filter((s) => !contactCond || (s.contact ?? '').includes(contactCond))
    .filter((s) => !addressCond || (s.address ?? '').includes(addressCond))
    .filter((s) => !remarkCond || (s.remark ?? '').includes(remarkCond))
    .filter((s) => !authorCond || (s.createdBy ?? '') === authorCond)
    /* 만든 때·고친 때는 날짜만 견준다 — 값은 초까지 오지만 조건은 하루 단위다. */
    .filter((s) => !madeFrom || (s.createdAt ?? '').slice(0, 10) >= madeFrom)
    .filter((s) => !madeTo || ((s.createdAt ?? '') !== '' && s.createdAt!.slice(0, 10) <= madeTo))
    .filter((s) => !editedFrom || (s.updatedAt ?? '').slice(0, 10) >= editedFrom)
    .filter((s) => !editedTo || ((s.updatedAt ?? '') !== '' && s.updatedAt!.slice(0, 10) <= editedTo))

  /*
   * 원본 [기타]의 <b>수정일자순(정렬)</b>. 켜면 <b>마지막에 고친 건이 위</b>로 온다 —
   * 오늘 누가 무엇을 손댔는지 보는 차례다. 안 켜면 이제까지의 차례를 그대로 쓴다.
   * 머리를 눌러 정렬하면 그쪽이 이긴다(눌러 고른 차례가 더 세다).
   */
  const orderedRows = byUpdated
    ? [...shownRows].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    : shownRows

  /* 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. */
  const sort = useTableSort(orderedRows, {
    출하번호: (s) => s.shipNo,
    출하일: (s) => s.shipDate,
    거래처: (s) => s.partnerName,
  })
  const shown = sort.sorted
  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '출하지시서', [])

  return (
    <EcListShell
      title="출하지시서"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '출하지시등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[
        /*
         * 원본 [진행상태변경] — <b>고른 줄을 한 번에</b> 바꾼다.
         * '출하지시서는 줄마다 상태를 고친다' 고 적고 뺐는데, 줄마다만 되면 열 건을
         * 출하완료로 넘길 때 <b>열 번 눌러야</b> 한다. 줄 버튼은 그대로 두고 단추줄을 더한다
         * (오더관리진행단계의 [전체단계완료]와 같은 자리·같은 뜻이다).
         */
        { label: `진행상태변경${checked.size ? ` (${checked.size})` : ''}`, onClick: bulkStatus },
        { label: 'Excel' },
        { label: '인쇄' },
      ]}
    >
      <p className="mb-2 text-xs text-slate-500">매출처로 반출할 물품의 출하지시 · 출하지시 → 출하완료. 미출하현황에서 대기건 확인.</p>

      {/* 원본 조건 차례: 기준일자 · 출하지시No. · 창고 · 프로젝트 · 관리항목 · 거래처 · 품목 · 발송여부 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={condFrom} onChange={(e) => setCondFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={condTo} onChange={(e) => setCondTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="출하지시No.">
          <input className="ec-input" value={shipNoCond} onChange={(e) => setShipNoCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseCond} onChange={setWarehouseCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond} items={pickers.projects} />
        </EcCond>
        {/*
          원본 [관리항목] — 차례는 [프로젝트] 다음, [거래처] 앞이다(사본 실측).
          관리항목은 <b>품목 마스터에 붙는 값</b>이라 전표 응답에 실려 오지 않는다.
          그래서 오래도록 '못 만든다' 고 적어 뒀는데, 판매현황이 이미 다른 길로 만들어 두었다 —
          품목 마스터를 받아 <b>줄의 itemId 로 화면에서 잇는다</b>.
        */}
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        {/* 원본 [발송여부] — 우리 출하 상태가 그 자리다(지시 · 출하완료 · 취소). */}
        <EcCond label="발송여부">
          <div className="ec-pills">
            {/* 원본 출하지시서조회의 탭 이름이 [전체]·[진행중]·[완료] 다(사본 실측). */}
            {([['', '전체'], ['READY', '진행중'], ['SHIPPED', '완료'], ['CANCELED', '취소']] as const).map(([v, l]) => (
              <button key={v || 'all'} type="button"
                      className={`ec-pill no-ec${sendCond === v ? ' active' : ''}`}
                      onClick={() => setSendCond(v)}>{l}</button>
            ))}
          </div>
        </EcCond>
        {/*
          원본 차례(2026-09-07 실측, 접힌 줄을 펼쳐 서른셋):
          … 발송여부 · 출하예정일 · (오더관리번호) · 규격 · 담당자 · 거래처관리담당자 ·
          연락처 · 주소 · 적요 · (문자형식1~5 · 장문형식1) · 작성자 · (최종수정자 ·
          최초작성일자 · 최종작업일자 · 입력경로 · 삭제구분 · 제목) · 기타 · 적용양식.
          괄호 안은 아직 못 만든 것이고, 이유는 검사 예외에 화면별로 적어 두었다.
        */}
        <EcCond label="출하예정일">
          <input type="date" className="ec-input" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={dueTo} onChange={(e) => setDueTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="규격" pick>
          <CodePickerField label="규격" hideLabel width={170} emptyLabel="전체"
                           value={specCond} onChange={setSpecCond}
                           items={[...new Set(shipments.flatMap((s) => s.lines.map((l) => l.spec)).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [담당자] — 출하를 맡은 사원. 전표를 친 [작성자]와 다르다. */}
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond}
                           items={employees.map((e) => ({ value: e.name, name: e.name }))} />
        </EcCond>
        {/* 원본 [거래처관리담당자] — 그 거래처를 맡은 영업담당자. 거래처 마스터에 붙어 있다. */}
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={170} emptyLabel="전체"
                           value={pmgrCond} onChange={setPmgrCond}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [연락처]·[주소] — 배송지다. 입력에서 받아 저장까지 하면서 못 묻고 있었다. */}
        <EcCond label="연락처">
          <input className="ec-input" value={contactCond} onChange={(e) => setContactCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="주소">
          <input className="ec-input" value={addressCond} onChange={(e) => setAddressCond(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="작성자" pick>
          <CodePickerField label="작성자" hideLabel width={170} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(shipments.map((s) => s.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [최초작성일자]·[최종작업일자] — 출하조회의 [최종수정일시]와 같은 값이다. */}
        <EcCond label="최초작성일자">
          <input type="date" className="ec-input" value={madeFrom} onChange={(e) => setMadeFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={madeTo} onChange={(e) => setMadeTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="최종작업일자">
          <input type="date" className="ec-input" value={editedFrom} onChange={(e) => setEditedFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={editedTo} onChange={(e) => setEditedTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        {/* 원본 [기타] — 이 화면에서는 체크 하나뿐이다(실측). 없는 것을 지어내지 않는다. */}
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      <Modal open={showForm} title="출하지시서 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10 }}>
          <table className="w-full text-left" style={{ marginBottom: 8, maxWidth: 700 }}>
            <tbody>
              <tr>
                <th style={th}>매출처 *</th>
                <td>
                  <select className={inputCls} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ minWidth: 220 }}>
                    <option value="">선택하세요</option>
                    {customers.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                  </select>
                </td>
                {/*
                  원본 출하입력의 머리 항목은 <b>[일자-No.]</b> 한 칸이다 — 일자와 전표번호를
                  나란히 둔다. 우리는 [출하일자]라고만 적어 두어, 번호가 어디서 나오는지
                  화면에 아무 말이 없었다. 번호는 저장할 때 서버가 매긴다(채번 규칙 하나로 모아 둔다).
                */}
                <th style={th}>일자-No.</th>
                <td>
                  <input type="date" className={inputCls} value={shipDate} onChange={(e) => setShipDate(e.target.value)} style={{ width: 150 }} />
                  <span style={{ marginLeft: 6, fontSize: 11.5, color: '#9aa1ab' }}>번호는 저장할 때 매깁니다</span>
                </td>
              </tr>
              <tr>
                <th style={th}>출하창고</th>
                <td>
                {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다. */}
                <CodePickerField label="출하창고" hideLabel width={220} emptyLabel="선택 안 함"
                                 value={warehouseId} onChange={setWarehouseId}
                                 items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
                <th style={th}>출하예정일</th>
                <td>
                  <input type="date" className={inputCls} value={dueDate}
                         onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} />
                  <span style={{ fontSize: 11, color: '#8a929c', marginLeft: 6 }}>비우면 출하일자</span>
                </td>
              </tr>
              <tr>
                <th style={th}>담당자</th>
                <td>
                {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다. */}
                <CodePickerField label="담당자" hideLabel width={220} emptyLabel="선택 안 함"
                                 value={employeeId} onChange={setEmployeeId}
                                 items={employees.map((x) => ({ value: String(x.id), name: x.name }))} />
                </td>
                <th style={th}>연락처</th>
                <td><input className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>프로젝트</th>
                <td>
                {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다. */}
                <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="선택 안 함"
                                 value={projectId} onChange={setProjectId}
                                 items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
              <tr>
                <th style={th}>우편번호</th>
                <td><input className={inputCls} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} style={{ width: 110 }} /></td>
                {/* 비우면 서버가 거래처 주소를 채운다. 대개 그리로 보내고, 다른 곳이면 여기 적는다. */}
                <th style={th}>주소</th>
                <td><input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)}
                           placeholder="비우면 거래처 주소" /></td>
              </tr>
            </tbody>
          </table>

          <table ref={tableRef} className="w-full text-left" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {/*
                  원본 출하입력 격자 실측(사본): 품목 · <b>품목명 · 규격</b> · 수량 · 적요.
                  우리는 고르는 칸 하나뿐이라, 코드를 고른 뒤 <b>무엇을 골랐는지</b>가
                  드롭다운 안에만 있었다 — 줄이 여럿이면 눈으로 훑을 수가 없다.
                */}
                <th style={{ width: 34 }}></th><th>품목</th>
                <th style={{ width: 150 }}>품목명</th>
                <th style={{ width: 120 }}>규격</th>
                <th style={{ width: 120, textAlign: 'right' }}>수량</th>
                <th style={{ width: 140, textAlign: 'right' }}>단가</th>
                <th style={{ width: 150, textAlign: 'right' }}>금액</th>
                <th style={{ width: 180 }}>적요</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td>
                    <select className={inputCls} style={{ width: '100%' }} value={l.itemId} onChange={(e) => updateLine(idx, 'itemId', e.target.value)}>
                      <option value="">선택</option>
                      {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
                    </select>
                  </td>
                  {/* 고른 품목의 이름·규격 — 읽기만 한다. 품목 마스터가 가진 값이다. */}
                  <td style={{ color: '#5a626e' }}>{itemById.get(l.itemId)?.name ?? ''}</td>
                  <td style={{ color: '#5a626e' }}>{itemById.get(l.itemId)?.spec ?? ''}</td>
                  <td><input type="number" className={`${inputCls} text-right`} style={{ width: '100%' }} value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} /></td>
                  <td><input type="number" className={`${inputCls} text-right`} style={{ width: '100%' }} value={l.unitPrice} onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)} /></td>
                  <td style={{ textAlign: 'right' }}>{won(computed[idx])}</td>
                  <td><input className={inputCls} style={{ width: '100%' }} value={l.remark}
                             onChange={(e) => updateLine(idx, 'remark', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                {/* 머리에 [품목명]·[규격]을 더했으니 여기도 2칸 늘린다 — 안 늘리면 합계가 엉뚱한 열 아래 붙는다. */}
                <td colSpan={4} style={{ textAlign: 'right' }}>합계</td>
                <td style={{ textAlign: 'right' }}>{won(totals.qty)}</td>
                <td></td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.amount)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input className={inputCls} placeholder="비고" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ flex: 1, maxWidth: 400 }} />
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
          </div>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
        </form>
      )}</Modal>

      {!showForm && error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            {/* [진행상태변경]이 고를 자리. */}
            <th style={{ width: 30, textAlign: 'center' }}>
              <input type="checkbox"
                     checked={shown.length > 0 && shown.every((s) => checked.has(s.id))}
                     onChange={() => setChecked(
                       shown.every((s) => checked.has(s.id)) ? new Set() : new Set(shown.map((s) => s.id)))} />
            </th>
            <th style={{ width: 34 }}></th>
            {/*
              <b>출하지시서조회(E040221) 2026-09-09 원본 격자 실측</b> — 열 여섯:
              [일자-No. · <b>창고명</b> · 품목명(요약) · 수량합계 · <b>진행상태</b> · 인쇄].
              바로 앞 바퀴에 잰 <b>출하조회(E040226)와 한 칸만 다르다</b> — 그쪽은
              다섯째가 [거래처명]이고 이쪽은 [진행상태]다. 나머지는 글자까지 같다.
              고친 것: (1) 출하번호와 출하일을 <b>두 칸</b>으로 갈라 두었다 → [일자-No.]
              한 칸, (2) 이름 넷 — [출하창고]→[창고명] · [품목]→[품목명(요약)] ·
              [수량]→[수량합계] · [상태]→[진행상태].
              [인쇄]는 원본이 줄마다 두는 열인데 우리는 화면 위 [인쇄] 하나로 낸다.
              [근거주문]·[출하예정일]·[거래처]·[금액]·[연락처]·[적요]·[처리]는 우리 열이다.
            */}
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('출하번호')}>일자-No. {sort.mark('출하번호')}</th><th style={{ width: 130 }}>근거주문</th>
            <th style={{ width: 100 }}>출하예정일</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처')}>거래처 {sort.mark('거래처')}</th><th style={{ width: 110 }}>창고명</th><th>품목명(요약)</th>
            <th style={{ textAlign: 'right' }}>수량합계</th><th style={{ textAlign: 'right' }}>금액</th>
            <th style={{ width: 110 }}>연락처</th><th style={{ width: 150 }}>적요</th>
            <th style={{ textAlign: 'center' }}>진행상태</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((s, i) => (
            <tr key={s.id}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.has(s.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
                  return next
                })} />
              </td>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              {/* 원본은 일자와 번호를 한 칸에 적는다. */}
              <td style={{ fontFamily: 'monospace' }}>{dateText(s.shipDate)} {s.shipNo}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: s.salesOrderNo ? 'var(--ec-blue-dark)' : '#b6bcc4' }}>
                {s.salesOrderNo ?? '직접등록'}
              </td>
              <td style={{ color: s.dueDate ? undefined : '#c9ced6' }}>{dateText(s.dueDate) || ''}</td>
              <td>{s.partnerName}</td>
              <td style={{ color: s.warehouseName ? undefined : '#c9ced6' }}>{s.warehouseName ?? ''}</td>
              <td>{s.lines[0]?.itemName}{s.lines.length > 1 ? ` 외 ${s.lines.length - 1}건` : ''}</td>
              <td style={{ textAlign: 'right' }}>{won(s.totalQuantity)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(s.totalAmount)}</td>
              <td style={{ color: s.contact ? undefined : '#c9ced6' }}>{s.contact || ''}</td>
              <td style={{ color: '#8a929c' }}>{s.remark ?? ''}</td>
              <td style={{ textAlign: 'center', color: STATUS_COLOR[s.status], fontWeight: 700 }}>{s.statusName}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                {s.status === 'READY' && <button className="no-ec" onClick={() => advance(s)} style={{ border: 'none', background: 'none', color: '#1c7c3c', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>→ 출하완료</button>}
                {s.status === 'READY' && <button className="no-ec" onClick={() => cancel(s)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>취소</button>}
                <button className="no-ec" onClick={() => remove(s)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

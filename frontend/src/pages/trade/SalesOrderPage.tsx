import { resolveSpecialPrice } from '../../features/price/specialPrice'
import { useEffect, useMemo, useState, type FormEvent, useRef} from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { Item, Partner } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { partnerCodeItems } from '../../utils/codeItems'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import EcPeriodPicks, { ORDER_LIST_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { lineSupply, roundWon } from '../../utils/lineSupply'
import EcNumInput from '../../components/EcNumInput'
import { dateText } from '../../utils/dateText'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'

type OrderStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
/**
 * 원본 진행상태는 <b>미확인 / 확인(진행중 · 완료)</b> 두 단계다(2026-10-13 [진행상태변경] 메뉴 실측:
 * '▾미확인 › 미확인', '▾확인 › 진행중 · 완료'). 우리 접수(RECEIVED)가 원본 미확인 자리다. 취소는 원본에 없다(예전 자료만).
 */
const STATUS_LABEL: Record<OrderStatus, string> = { RECEIVED: '미확인', IN_PROGRESS: '진행중', COMPLETED: '완료', CANCELED: '취소' }
/** 위 탭 — 원본 '전체 · 결재중 · C-Portal · 미확인 · 확인 ▸ 진행중 – 완료'. 결재 · C-Portal 은 우리에게 그 경로가 없어 늘 비어 있다. */
type Tab = 'ALL' | 'APPROVAL' | 'CPORTAL' | 'RECEIVED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'
const TAB_MATCH: Record<Tab, (s: OrderStatus) => boolean> = {
  ALL: () => true, APPROVAL: () => false, CPORTAL: () => false, RECEIVED: (s) => s === 'RECEIVED',
  CONFIRMED: (s) => s === 'IN_PROGRESS' || s === 'COMPLETED', IN_PROGRESS: (s) => s === 'IN_PROGRESS', COMPLETED: (s) => s === 'COMPLETED',
}
/** [생성한전표] → '조회' 창 한 줄(서버 GeneratedSlipRow). */
interface GeneratedRow { itemCode: string; itemName: string; spec: string | null; quantity: number; remaining: number; slipType: string | null; slipDate: string | null; slipNo: string | null }

interface OrderLine { itemId: number; itemCode?: string; itemName: string; spec?: string | null; unit: string; quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number }
interface SalesOrder {
  id: number; orderNo: string; partnerId: number; partnerName: string
  orderDate: string; dueDate: string | null; status: OrderStatus; statusName: string
  /** 수주의 [창고]·[프로젝트]·[담당자]. 견적에서 전환하면 그 값이 따라온다. */
  warehouseId?: number | null
  warehouseName: string | null
  projectId?: number | null
  projectName: string | null
  /** 원본 [기타]의 [수정일자순(정렬)] 축. */
  updatedAt?: string | null
  employeeId?: number | null
  employeeName: string | null
  supplyAmount: number; vatAmount: number; totalAmount: number; remark: string | null; lines: OrderLine[]
}

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())
interface LineInput { itemId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', unitPrice: '' })

/**
 * 오더관리(수주) — 원본 영업관리 &gt; 주문서 &gt; <b>주문서조회</b>(E040204) 자리. 2026-10-03 loginaa 실측(자료가 든 판):
 * 기간 기본 <b>최근30일(+1개월)</b>, 열 일자-No. · 거래처명 · 사원(담당)명 · 품목명 · 납기일자 · 주문금액합계 · 진행상태 · 생성한전표 · 인쇄,
 * 위 탭 전체 · 결재중 · C-Portal · 미확인 · 확인 ▸ 진행중 – 완료. 창고 · 프로젝트는 [일자-No.] 수정 창에서 본다.
 */
export default function SalesOrderPage() {
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  /* 원본 조건 [창고] · [프로젝트] · [거래처] · [품목코드] · [기타](수정일자순). */
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  /** 주문수정 — 원본은 [일자-No.] 를 누르면 같은 입력 창이 '주문수정' 으로 뜬다(2026-10-13 실측). */
  const [editId, setEditId] = useState<number | null>(null)
  /** 원본 목록 첫 칸의 체크 — [선택삭제] 가 이것을 지운다. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<Tab>('ALL')
  /** 수정 창의 빈 [출하창고] — 원본은 안내 없이 그 칸만 빨갛게 두르고 저장하지 않는다(2026-10-13 실측). */
  const [whMissing, setWhMissing] = useState(false)
  /** 하단 [진행상태변경 ▴] 메뉴 — 원본처럼 버튼 위로 뜬다. */
  const [statusMenu, setStatusMenu] = useState<{ left: number; bottom: number } | null>(null)
  /** [생성한전표] 의 '조회' 창. */
  const [generated, setGenerated] = useState<{ order: SalesOrder; rows: GeneratedRow[] } | null>(null)
  const [company, setCompany] = useState<DocParty | null>(null)
  useEffect(() => { loadSupplierParty().then(setCompany) }, [])

  const [partnerId, setPartnerId] = useState('')
  const [orderDate, setOrderDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [taxable, setTaxable] = useState(true)
  const [remark, setRemark] = useState('')
  const [fWarehouse, setFWarehouse] = useState('')
  const [fProject, setFProject] = useState('')
  const [fEmployee, setFEmployee] = useState('')
  const pickers = useCondPickers(['warehouses', 'projects', 'employees', 'partners', 'items'])
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])

  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  /** 줄의 품목 코드도움 — 코드·이름·검색어로 찾고 규격을 옆에 보인다. 사용중단 품목은 뺀다. */
  const itemPicks = useMemo(() => items.filter((it) => it.active !== false)
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword })), [items])
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])

  async function load() {
    try {
      const [o, p, i] = await Promise.all([
        api.get<SalesOrder[]>('/sales-orders', { params: { from, to } }),
        api.get<Partner[]>('/partners'),
        api.get<Item[]>('/items'),
      ])
      setOrders(o.data); setPartners(p.data); setItems(i.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId' && value) {
        const it = itemById.get(value)
        if (it && !next[idx].unitPrice) next[idx] = { ...next[idx], unitPrice: String(it.unitPrice) }
        if (!next[idx].quantity) next[idx] = { ...next[idx], quantity: '1' }
        // 거래처의 특별단가가 있으면 덮는다(50회차 — 수주는 특별단가를 몰랐다).
        void resolveSpecialPrice('SALES', value, partnerId).then((p) => {
          if (p != null) setLines((cur) => cur.map((l, i) => (i === idx ? { ...l, unitPrice: String(p) } : l)))
        })
        if (idx === ls.length - 1) next.push(emptyLine())
      }
      return next
    })
  }

  const computed = lines.map((l) => {
    const supply = lineSupply(Number(l.quantity) || 0, Number(l.unitPrice) || 0)
    const vat = taxable ? roundWon(supply * 0.1) : 0
    return { supply, vat, total: supply + vat }
  })
  const totals = computed.reduce((a, c) => ({ supply: a.supply + c.supply, vat: a.vat + c.vat, total: a.total + c.total }), { supply: 0, vat: 0, total: 0 })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }))
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (validLines.length === 0) return setError('품목·수량·단가를 1줄 이상 입력하세요.')
    if (!fWarehouse) { setWhMissing(true); return }
    const body = {
      partnerId: Number(partnerId), dueDate: dueDate || undefined,
      warehouseId: fWarehouse ? Number(fWarehouse) : undefined,
      projectId: fProject ? Number(fProject) : undefined,
      employeeId: fEmployee ? Number(fEmployee) : undefined,
      taxable, remark: remark || undefined, lines: validLines,
    }
    try {
      if (editId != null) {
        /* 원본 주문수정: 저장하면 창이 닫히고 목록이 새 금액으로 다시 읽힌다. */
        await api.put<SalesOrder>(`/sales-orders/${editId}`, body)
        closeForm()
        load()
        return
      }
      const res = await api.post<SalesOrder>('/sales-orders', { ...body, orderDate })
      setOk(`${res.data.orderNo} 수주 등록 완료 (합계 ${won(res.data.totalAmount)}원)`)
      setLines([emptyLine()]); setRemark(''); setDueDate('')
      setFWarehouse(''); setFProject(''); setFEmployee('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  function closeForm() {
    setShowForm(false); setEditId(null); setError(''); setOk(''); setWhMissing(false)
    setPartnerId(''); setOrderDate(today()); setDueDate(''); setTaxable(true); setRemark('')
    setFWarehouse(''); setFProject(''); setFEmployee(''); setLines([emptyLine()])
  }

  function openEdit(o: SalesOrder) {
    setError(''); setOk(''); setWhMissing(false)
    setEditId(o.id)
    setPartnerId(String(o.partnerId)); setOrderDate(o.orderDate); setDueDate(o.dueDate ?? '')
    setTaxable(o.vatAmount > 0 || o.supplyAmount === 0); setRemark(o.remark ?? '')
    setFWarehouse(o.warehouseId ? String(o.warehouseId) : '')
    setFProject(o.projectId ? String(o.projectId) : '')
    setFEmployee(o.employeeId ? String(o.employeeId) : '')
    setLines([...o.lines.map((l) => ({ itemId: String(l.itemId), quantity: String(l.quantity), unitPrice: String(l.unitPrice) })), emptyLine()])
    setShowForm(true)
  }

  /**
   * `?edit=<id>` — 다른 화면(그룹웨어 일정관리의 납기 막대)이 주문 하나를 바로 '주문수정' 창으로 연다.
   * 기간 밖의 주문일 수 있어 목록에서 찾지 않고 한 건을 받아 온다. 연 뒤에는 주소에서 지워 새로고침에 다시 뜨지 않게 한다.
   */
  const [params, setParams] = useSearchParams()
  const editParam = params.get('edit')
  useEffect(() => {
    if (!editParam) return
    api.get<SalesOrder>(`/sales-orders/${editParam}`)
      .then((r) => openEdit(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setParams((p) => { p.delete('edit'); return p }, { replace: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam])

  /** 수정 창의 [삭제] — 원본 확인 문구 '전표를 삭제하겠습니까? - 주문서'. */
  async function removeEditing() {
    if (editId == null) return
    if (!confirm('전표를 삭제하겠습니까?\n- 주문서')) return
    try { await api.delete(`/sales-orders/${editId}`); closeForm(); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  /** [선택삭제] — 고른 주문을 하나씩 지운다. 막힌 것(출하 · 판매가 붙은 것)은 이유를 모아 알린다. */
  async function removeChecked() {
    const ids = [...checked]
    if (ids.length === 0) return alert('선택된 전표가 없습니다.')
    if (!confirm(`전표를 삭제하겠습니까?\n- 주문서 ${ids.length}건`)) return
    const fails: string[] = []
    for (const id of ids) {
      try { await api.delete(`/sales-orders/${id}`) }
      catch (err) { fails.push(extractErrorMessage(err)) }
    }
    setChecked(new Set())
    load()
    if (fails.length) alert(fails.join('\n'))
  }

  /**
   * 하단 [진행상태변경] — 버튼 위에 상태 메뉴를 띄운다. 원본은 안 고르고 누르면 '리스트에 선택된 자료가 없습니다.' 를 띄우지만
   * 우리 셸은 고른 줄이 있어야 도는 버튼을 미리 잠근다(ui-check 1-s13). 문구는 잠금이 풀린 채 불릴 때를 위해 남긴다.
   */
  function openStatusMenu() {
    if (checked.size === 0) return alert('리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.')
    const btn = [...document.querySelectorAll<HTMLButtonElement>('.ec-footer button')].find((b) => b.textContent?.trim() === '진행상태변경')
    const r = btn?.getBoundingClientRect()
    setStatusMenu({ left: r?.left ?? 200, bottom: r ? window.innerHeight - r.top + 4 : 48 })
  }
  async function changeStatus(status: OrderStatus) {
    setStatusMenu(null)
    const fails: string[] = []
    for (const id of checked) {
      try { await api.patch(`/sales-orders/${id}/status`, { status }) }
      catch (err) { fails.push(extractErrorMessage(err)) }
    }
    setChecked(new Set())
    load()
    if (fails.length) alert(fails.join('\n'))
  }

  /**
   * 주문수정 창의 [복사] — 원본은 같은 창이 '주문서입력' 으로 바뀌고 일자 · 납기일자가 오늘, 거래처 · 창고 · 품목 줄은 그대로다
   * (2026-10-13 실측). 저장하면 새 주문서가 된다.
   */
  function copyEditing() {
    setEditId(null); setOrderDate(today()); setDueDate(today()); setWhMissing(false); setError(''); setOk('')
  }
  /**
   * 주문수정 창의 [이전] · [다음] — 원본은 목록 차례로 옮겨 다닌다. [다음]이 목록 위쪽(나중 전표), [이전]이 아래쪽이다
   * (10/28 -1 에서 [다음] → 10/28 -2, [이전] → 10/26 -1). 끝에서 [다음]은 '다음에 표시할 전표가 없습니다.'.
   */
  function step(dir: -1 | 1) {
    const i = shown.findIndex((o) => o.id === editId)
    const target = i < 0 ? undefined : shown[i + dir]
    if (!target) return alert(dir < 0 ? '다음에 표시할 전표가 없습니다.' : '이전에 표시할 전표가 없습니다.')
    openEdit(target)
  }

  async function openGenerated(o: SalesOrder) {
    try { setGenerated({ order: o, rows: (await api.get<GeneratedRow[]>(`/sales-orders/${o.id}/generated`)).data }) }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  /** 줄의 [인쇄] — 원본 '주 문 서' 양식(수신 · 납기일자 · 일련번호 · 담당자 · 금액 한글 · 품목코드 · 품목명[규격] …). */
  async function printOrder(o: SalesOrder) {
    const p = partners.find((x) => x.id === o.partnerId)
    await printDocuments([{
      title: '주 문 서',
      docNo: dateNo(o.orderDate, o.orderNo),
      docDate: o.orderDate,
      supplier: company ?? { label: '공급자', name: '(회사정보 미등록)' },
      customer: {
        label: '수신', name: o.partnerName,
        bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem, tel: p?.phone, address: p?.address,
      },
      extra: [{ label: '납기일자', value: dateText(o.dueDate) }, { label: '담당자', value: o.employeeName }],
      remark: o.remark,
      lines: o.lines.map((l) => ({
        itemCode: l.itemCode, itemName: l.itemName, spec: l.spec, unit: l.unit,
        quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount,
      })),
    }])
  }

  const shownRows = orders
    .filter((o) => TAB_MATCH[tab](o.status))
    .filter((o) => !whCond || String(o.warehouseId) === whCond)
    .filter((o) => !projCond || String(o.projectId) === projCond)
    .filter((o) => !partnerCond || String(o.partnerId) === partnerCond)
    .filter((o) => !itemCond || o.lines.some((l) => String(l.itemId) === itemCond))
    .filter((o) => !keyword || o.partnerName.includes(keyword) || o.orderNo.includes(keyword))

  /* 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. */
  const sort = useTableSort(shownRows, {
    수주일: (o) => o.orderDate,
    거래처: (o) => o.partnerName,
  })
  /* [수정일자순]을 켜면 고친 시각이 늦은 것부터 — 머리 정렬보다 먼저다(원본도 조건 판에서 고른다). */
  const shown = byUpdated ? [...shownRows].sort((a, b) => ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : (a.updatedAt ?? '') > (b.updatedAt ?? '') ? -1 : 0)) : sort.sorted

  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: 'var(--ec-bg-page)', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '주문서조회', [])

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="주문서조회"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel="신규(F2)"
      onNew={() => { closeForm(); setShowForm(true) }}
      /* 원본 차례: 신규(F2) · Email · 진행상태변경 · 보내기 · 인쇄 · 바코드 · 다른전표생성 · 전자결재 · 선택삭제 · Excel · 이력조회 — 바깥 발송 · 결재는 뺀다. */
      actions={[{ label: '진행상태변경', onClick: openStatusMenu, disabled: checked.size === 0 }, { label: '인쇄' },
        { label: '선택삭제', onClick: removeChecked, disabled: checked.size === 0 }, { label: 'Excel' }]}
    >
      {statusMenu && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setStatusMenu(null)} />
          <div className="ec-menu fixed" style={{ left: statusMenu.left, bottom: statusMenu.bottom }} role="menu" aria-label="진행상태변경">
            <div className="px-[10px] pt-[4px] text-ec-label">▾ 미확인</div>
            <button onClick={() => changeStatus('RECEIVED')}>미확인</button>
            <div className="px-[10px] pt-[4px] text-ec-label">▾ 확인</div>
            <button onClick={() => changeStatus('IN_PROGRESS')}>진행중</button>
            <button onClick={() => changeStatus('COMPLETED')}>완료</button>
          </div>
        </>
      )}

      <Modal open={generated != null} title="생성한 전표" width={760} onClose={() => setGenerated(null)}>{generated && (
        <div>
          <p className="mb-[6px]">주문서조회 : {dateNo(generated.order.orderDate, generated.order.orderNo)}</p>
          <table className="w-full text-left">
            <thead><tr>
              <th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th className="text-right">잔량</th>
              <th>생성한 전표</th><th>생성한 전표일자-No.</th>
            </tr></thead>
            <tbody>
              {generated.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.itemCode}</td><td>{r.itemName}</td><td>{r.spec ?? ''}</td>
                  <td className="text-right">{won(r.quantity)}</td><td className="text-right">{won(r.remaining)}</td>
                  <td>{r.slipType ?? ''}</td><td>{r.slipDate && r.slipNo ? dateNo(r.slipDate, r.slipNo) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[8px]"><button type="button" className="ec-btn" onClick={() => setGenerated(null)}>닫기</button></div>
        </div>
      )}</Modal>

      <Modal open={showForm} title={editId != null ? '주문수정' : '주문서입력'} width={900} onClose={closeForm}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10 }}>
          <table className="w-full text-left mb-[8px] max-w-[820px]">
            <tbody>
              <tr>
                <th style={th}>매출처 *</th>
                <td>
                  {/* 긴 드롭다운이었다 — 4회차에 다른 입력 화면 15곳은 코드도움으로 바꿨는데 여기만 남아 있었다(9회차). */}
                  <CodePickerField label="매출처" hideLabel width={240} emptyLabel="선택 안 함" placeholder="매출처 선택"
                                   value={partnerId} onChange={(v) => {
                                     // 거래처를 고르면 담긴 품목의 특별단가를 다시 찾는다(품목을 먼저 담아도 걸리게).
                                     setPartnerId(v)
                                     lines.forEach((l, i) => {
                                       if (l.itemId) void resolveSpecialPrice('SALES', l.itemId, v).then((p) => {
                                         if (p != null) setLines((cur) => cur.map((x, j) => (j === i ? { ...x, unitPrice: String(p) } : x)))
                                       })
                                     })
                                   }}
                                   items={partnerCodeItems(customers)} />
                </td>
                <th style={th}>부가세</th>
                <td>
                  <select className={inputCls} value={taxable ? 'Y' : 'N'} onChange={(e) => setTaxable(e.target.value === 'Y')} style={{ width: 120 }}>
                    <option value="Y">과세 (10%)</option><option value="N">면세</option>
                  </select>
                </td>
              </tr>
              <tr>
                {/*
                  수주의 [창고]·[프로젝트]·[담당자]. 견적에서 전환하면 그 값이 따라오는데,
                  <b>수주를 직접 만들면 정할 데가 없어</b> 미출하현황의 그 조건들이 헛돌았다.
                */}
                <th style={th}>출하창고</th>
                <td>
                  <div className={`inline-block${whMissing ? ' rounded-ec outline outline-1 outline-ec-danger' : ''}`} data-invalid={whMissing || undefined}>
                    <CodePickerField label="출하창고" hideLabel width={170} emptyLabel="선택 안 함" placeholder="출하창고"
                                     value={fWarehouse} onChange={(v) => { setFWarehouse(v); if (v) setWhMissing(false) }}
                                     items={pickers.warehouses} />
                  </div>
                </td>
                <th style={th}>프로젝트</th>
                <td>
                  <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="선택 안 함"
                                   value={fProject} onChange={setFProject}
                                   items={pickers.projects} />
                </td>
              </tr>
              <tr>
                <th style={th}>담당자</th>
                <td>
                  <CodePickerField label="담당자" hideLabel width={170} emptyLabel="선택 안 함"
                                   value={fEmployee} onChange={setFEmployee}
                                   items={pickers.employees.map((x) => ({ ...x, value: String(x.id) }))} />
                </td>
                <td colSpan={2}></td>
              </tr>
              <tr>
                <th style={th}>수주일자</th>
                <td><input type="date" className={inputCls} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} style={{ width: 150 }}
                  /* 주문수정에서는 원본도 일자가 잠긴다 — 번호가 일자에 묶여 있다. */
                  disabled={editId != null} /></td>
                <th style={th}>납기일자</th>
                <td><input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
            </tbody>
          </table>

          <table ref={tableRef} className="w-full text-left table-fixed">
            <thead>
              <tr>
                <th className="w-[34px]"></th><th>품목</th>
                <th className="w-[110px] text-right">수량</th>
                <th className="w-[130px] text-right">단가</th>
                <th className="w-[130px] text-right">공급가액</th>
                <th className="w-[110px] text-right">부가세</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td className="text-center text-ec-hint">{idx + 1}</td>
                  <td>
                    <CodePickerField label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제"
                                     value={String(l.itemId)} onChange={(v) => updateLine(idx, 'itemId', v)}
                                     items={itemPicks} />
                  </td>
                  <td><EcNumInput className={`${inputCls} text-right w-full`} value={l.quantity} onValue={(v) => updateLine(idx, 'quantity', v)} /></td>
                  <td><EcNumInput className={`${inputCls} text-right w-full`} value={l.unitPrice} onValue={(v) => updateLine(idx, 'unitPrice', v)} /></td>
                  <td className="text-right">{won(computed[idx].supply)}</td>
                  <td className="text-right text-ec-hint">{won(computed[idx].vat)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-ec-page">
                <td colSpan={4} className="text-right">합계</td>
                <td className="text-right">{won(totals.supply)}</td>
                {/* 부가세 열 아래에 부가세 포함 합계가 서 있었다(23회차) — 열마다 제 합을, 총액은 따로 한 줄. */}
                <td className="text-right">{won(totals.vat)}</td>
              </tr>
              <tr className="font-bold bg-ec-page">
                <td colSpan={4} className="text-right">합계금액 (부가세 포함)</td>
                <td colSpan={2} className="text-right text-ec-blue">{won(totals.total)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-[8px] flex items-center gap-[8px]">
            <input className={inputCls} placeholder="비고" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ flex: 1, maxWidth: 400 }} />
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            {/* 원본 주문수정 단추줄: 저장(F8) · 저장/전표(F7) · 복사 · 이전 · 다음 · 닫기 · 삭제 · 보내기 · H */}
            {editId != null && <>
              <button type="button" className="ec-btn" onClick={copyEditing}>복사</button>
              <button type="button" className="ec-btn" onClick={() => step(1)}>이전</button>
              <button type="button" className="ec-btn" onClick={() => step(-1)}>다음</button>
            </>}
            <button type="button" className="ec-btn" onClick={closeForm}>닫기</button>
            {editId != null && <button type="button" className="ec-btn" onClick={removeEditing}>삭제</button>}
          </div>
          {error && <p className="mt-2 rounded bg-ec-danger-bg px-3 py-2 text-sm text-ec-danger">{error}</p>}
          {ok && <p className="mt-2 rounded bg-ec-success-bg px-3 py-2 text-sm text-ec-success">{ok}</p>}
        </form>
      )}</Modal>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={ORDER_LIST_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={projCond} onChange={setProjCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      {/* 원본 제목 옆 알약: 전체 · 결재중 · C-Portal · 미확인 · 확인 ▸ 진행중 – 완료 */}
      <div className="ec-pills mb-[8px]">
        {([['ALL', '전체'], ['APPROVAL', '결재중'], ['CPORTAL', 'C-Portal'], ['RECEIVED', '미확인'], ['CONFIRMED', '확인 ▸'], ['IN_PROGRESS', '진행중'], ['COMPLETED', '완료']] as const).map(([k, label]) => (
          <button key={k} type="button" className={`ec-pill no-ec${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((o) => checked.has(o.id))}
                onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((o) => o.id)) : new Set())} />
            </th>
            {/* 원본 주문서조회 차례: 일자-No. · 거래처명 · 사원(담당)명 · 품목명 · 납기일자 · 주문금액합계 · 진행상태 (2026-10-03 실측). */}
            <th className="cursor-pointer" onClick={() => sort.toggle('수주일')}>일자-No. {sort.mark('수주일')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('거래처')}>거래처명 {sort.mark('거래처')}</th>
            <th className="w-[90px]">사원(담당)명</th><th>품목명(요약)</th><th>납기일자</th>
            <th className="text-right">주문금액합계</th>
            <th className="text-center">진행상태</th>
            <th className="text-center">생성한전표</th>
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o, i) => (
            <tr key={o.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-center">
                <input type="checkbox" aria-label="선택" checked={checked.has(o.id)}
                  onChange={(e) => setChecked((cur) => { const n = new Set(cur); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n })} />
              </td>
              {/* 원본은 [일자-No.] 를 누르면 주문수정 창이 뜬다. */}
              <td><a className="cursor-pointer" onClick={() => openEdit(o)}>{dateNo(o.orderDate, o.orderNo)}</a></td>
              <td>{o.partnerName}</td>
              <td>{o.employeeName ?? ''}</td>
              {/* 원본 '코카콜라 [355ml] 외 1건' — 첫 품목에 규격을 대괄호로 붙인다. */}
              <td>{o.lines[0]?.itemName}{o.lines[0]?.spec ? ` [${o.lines[0].spec}]` : ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td>{dateText(o.dueDate) || ''}</td>
              <td className="text-right">{won(o.totalAmount)}</td>
              <td className="text-center text-ec-navy">{STATUS_LABEL[o.status]}</td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => openGenerated(o)}>조회</a></td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => void printOrder(o)}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

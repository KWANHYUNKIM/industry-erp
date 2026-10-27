import { resolveSpecialPrice } from '../../features/price/specialPrice'
import { Fragment, useEffect, useMemo, useState, useRef} from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import type { CustomFieldDef, Currency, EmployeeMaster, Item, Partner, PurchaseOrder, PurchaseOrderStatus, StockRow, Warehouse } from '../../types/api'
import { partnerCodeItems } from '../../utils/codeItems'
import { ymd } from '../../components/EcPeriodPicks'
import { lineSupply, roundWon } from '../../utils/lineSupply'
import EcNumInput from '../../components/EcNumInput'
import { dateText } from '../../utils/dateText'
import { useMyItemsPick, MyItemsNote } from '../../components/MyItemsButton'
import EcPeriodPicks, { ORDER_DOC_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { usePartnerManagers } from '../../utils/partnerManagers'
import CustomFieldsPanel from '../../components/CustomFieldsPanel'
import { ecConfirm } from '../../components/EcDialog'
import { shortDateNo } from '../../utils/dateNo'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())

/**
 * 원본 발주서조회 알약(2026-10-20 실측): 전체 · 결재중 · 미확인 · 확인 · 완료 · 진행중. 우리는 결재 · 확인 단계가 없어 전체 · 완료 · 진행중.
 * 발주요청 · 발주계획 · 단가요청은 <b>다른 전표</b>(2026-10-21 전표 가르기)라 이 화면에 안 뜬다 — 각자 조회 화면이 있다.
 */
const TABS = ['전체', '완료', '진행중'] as const
type Tab = (typeof TABS)[number]
const OTHER_SLIPS: PurchaseOrderStatus[] = ['REQUESTED', 'PLANNED', 'PRICE_REQUESTED']
const isDone = (s: PurchaseOrderStatus) => s === 'RECEIVED' || s === 'CANCELLED'
const inTab = (t: Tab, s: PurchaseOrderStatus) => t === '전체' || (t === '완료') === isDone(s)
const statusColor = (s: PurchaseOrderStatus) =>
  s === 'RECEIVED' ? 'var(--ec-success)' : s === 'CANCELLED' ? 'var(--ec-text-hint)' : s === 'ORDERED' ? 'var(--ec-blue)' : 'var(--ec-label)'

/** GET /purchase-orders/{id}/history 한 줄 — 단계가 언제 누구 손에 바뀌었나. */
interface HistoryRow {
  changedAt: string
  fromStatusName: string | null
  toStatusName: string
  changedBy: string | null
  note: string | null
}

/**
 * 줄 하나. <code>custom</code> 은 <b>줄 추가항목</b>(사용자정의)이다 —
 * 원본 발주서입력 격자는 회사가 추가문자·추가숫자·추가일자·추가코드로 칸을 늘린다.
 * 우리는 반대로 Self-Customizing 에서 <b>이름을 지어</b> 정의하면 그만큼 열이 생긴다.
 * 정의가 없으면 열이 하나도 안 생긴다(안 쓰는 회사의 격자는 그대로다).
 */
interface LineForm { itemId: string; quantity: string; unitPrice: string; partnerId: string; remark: string; custom: Record<string, string> }
const emptyLine = (): LineForm => ({ itemId: '', quantity: '', unitPrice: '', partnerId: '', remark: '', custom: {} })

/** 발주서 — 구매 흐름의 시작점. 발주요청 → 발주계획 → 단가확정 → 발주확정 → 입고전환(구매전표 생성). */
/*
 * 원본 발주서는 <b>기준일자</b>를 들고 [최근30일(+1개월)] 로 열린다(사본 실측 —
 * 달 스핀박스가 06·08 셋이다). 발주는 <b>앞으로 들어올 것</b>이라 미래가 들어간다.
 *
 * <p>우리는 기간 칸이 <b>아예 없어서</b> 발주가 쌓이면 목록만 길어지고, "이번 달에 낸
 * 발주" 를 볼 방법이 없었다. 단추줄 사이에 [말일]이 끼는 것도 원본 그대로다.
 */
const initP = periodOf('최근30일(+1개월)')!

export default function PurchaseOrderPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  /**
   * 발주 <b>진행이력</b> — 서버가 단계가 바뀔 때마다 누가 언제 무엇으로 옮겼는지 남긴다
   * (/purchase-orders/{id}/history). <b>남기기만 하고 보여 주는 자리가 없었다.</b>
   * '이 발주는 왜 아직 입고가 안 됐나' 를 물으면 아무도 답을 못 했다.
   *
   * <p>펼칠 때 한 번만 부르고 그대로 둔다 — 줄을 여닫을 때마다 다시 부르면 목록이 무거워진다.
   */
  const [hist, setHist] = useState<Record<number, HistoryRow[]>>({})

  function toggle(id: number) {
    const next = openId === id ? null : id
    setOpenId(next)
    if (next != null && hist[next] === undefined) {
      api.get<HistoryRow[]>(`/purchase-orders/${next}/history`)
        .then((r) => setHist((p) => ({ ...p, [next]: r.data })))
        .catch(() => setHist((p) => ({ ...p, [next]: [] })))
    }
  }
  const [error, setError] = useState('')
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [orderNoCond, setOrderNoCond] = useState('')
  const [whCond, setWhCond] = useState('')
  /* 원본 발주서 조건 차례: 발주No. · 내.외자구분 · 창고 · <b>프로젝트</b> · 거래처 · 품목. */
  const [projCond, setProjCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const condPickers = useCondPickers(['warehouses', 'partners', 'items'])
  /*
   * 2026-09-07 에 원본(E040302)을 열어 조건을 <b>전부</b> 쟀다 — 서른넷이다.
   * 사본에는 여덟뿐이었고 <b>[기준일자]조차 빠져 있었다</b>(우리는 앞 바퀴에 그걸 만들었다).
   * 판매조회·구매조회·출하조회·출하지시서조회에 이어 다섯 번째 같은 구멍이다.
   *
   * <p>이번에 만드는 열둘은 <b>값이 이미 있는데 거를 자리만 없던 것</b>들이다.
   * 특히 [규격]·[품목구분]·[적요]는 응답 record 에 "원본 조건" 이라고 주석까지 달아 두고
   * 조건 판에는 안 만들어 두었다 — 실어 놓고 쓰지 않았다.
   */
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [partnerGroupCond, setPartnerGroupCond] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [pmgrCond, setPmgrCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [refCond, setRefCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [madeFrom, setMadeFrom] = useState('')
  const [madeTo, setMadeTo] = useState('')
  const [editedFrom, setEditedFrom] = useState('')
  const [editedTo, setEditedTo] = useState('')
  /** 원본 [기타] — 이 화면에서는 <b>수정일자순(정렬)</b> 하나다(실측). */
  const [byUpdated, setByUpdated] = useState(false)
  /** 품목 마스터에 붙는 [품목그룹1]. 이 화면은 /items 를 진작 통째로 받아 두고 있다. */
  const mgmt = useItemMgmt(items)
  const pgroups = usePartnerGroups()
  const pmgr = usePartnerManagers(partners)
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [company, setCompany] = useState<DocParty | null>(null)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    /*
     * <b>고른 기간을 서버에도 보낸다.</b> 여태 발주를 통째로 받아 아래 shown 에서
     * <code>r.orderDate &gt;= from</code> 으로 걸렀다 — 화면은 [기간]을 묻고 서버에는
     * 아무것도 안 보내는 꼴이었다. 탭 수(tabCount)도 이 rows 로 세므로 같은 창이 된다.
     */
    const period: Record<string, string> = {}
    if (from) period.from = from
    if (to) period.to = to
    api.get<PurchaseOrder[]>('/purchase-orders', { params: period })
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  /* 기간을 바꾸면 그 기간으로 다시 받는다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  useEffect(() => {
    load()
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data.filter((p) => p.type !== 'CUSTOMER'))).catch(() => {})
    api.get<Warehouse[]>('/warehouses').then((r) => setWarehouses(r.data)).catch(() => {})
    api.get<{ id: number; code: string; name: string }[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => {})
    api.get<Currency[]>('/currencies').then((r) => setCurrencies(r.data)).catch(() => {})
  }, [])

  /*
   * 원본 발주서조회의 조건은 <b>서른넷</b>이다(2026-09-07 실측). 사본에는 여덟뿐이었고
   * [기준일자]조차 빠져 있었다. 앞 바퀴에 여섯을 만들었고, 이번에 열둘을 더 만든다 —
   * 품목구분 · 품목그룹1 · 거래처그룹1 · 납기일자 · 규격 · 담당자 · 거래처관리담당자 ·
   * 적요 · 참조 · 최초작성자 · 최초작성일자 · 최종작업일자 (+ [기타] 수정일자순(정렬)).
   * 열둘 다 값이 이미 있는데 거를 자리만 없던 것이다.
   *
   * <p>[프로젝트]는 '발주 응답에 그 값이 없다' 고 여기 적혀 있었으나 <b>지금은 있다</b> —
   * 위에서 이미 걸고 있다. [내.외자구분]·[발송여부]만 여전히 우리 전표에 없다.
   */
  const shown = useMemo(() => rows
    .filter((r) => !OTHER_SLIPS.includes(r.status) && inTab(tab, r.status))
    .filter((r) => (!from || r.orderDate >= from) && (!to || r.orderDate <= to))
    .filter((r) => !orderNoCond || r.orderNo.includes(orderNoCond))
    .filter((r) => !whCond || String(r.warehouseId) === whCond)
    .filter((r) => !projCond || String(r.projectId) === projCond)
    .filter((r) => !partnerCond || String(r.partnerId) === partnerCond)
    .filter((r) => !itemCond || r.lines.some((l) => String(l.itemId) === itemCond))
    /* 줄이 여럿이면 <b>한 줄이라도 걸리면</b> 그 발주를 남긴다 — 품목 조건과 같은 규칙이다. */
    .filter((r) => !categoryCond || r.lines.some((l) => (l.itemCategoryName ?? '') === categoryCond))
    .filter((r) => mgmt.groupHits(r.lines.map((l) => l.itemId), itemGroupCond))
    .filter((r) => !partnerGroupCond || pgroups.groupOfName(r.partnerName) === partnerGroupCond)
    .filter((r) => !dueFrom || (r.dueDate ?? '') >= dueFrom)
    .filter((r) => !dueTo || ((r.dueDate ?? '') !== '' && (r.dueDate as string) <= dueTo))
    .filter((r) => !specCond || r.lines.some((l) => (l.spec ?? '') === specCond))
    .filter((r) => !empCond || (r.employeeName ?? '') === empCond)
    .filter((r) => !pmgrCond || pmgr.managerOfName(r.partnerName) === pmgrCond)
    /* 원본 [적요]는 <b>줄</b>에 붙는 메모고, [참조]는 전표 머리에 붙는다 — 다른 칸이다. */
    .filter((r) => !remarkCond || r.lines.some((l) => (l.remark ?? '').includes(remarkCond)))
    .filter((r) => !refCond || (r.remark ?? '').includes(refCond))
    .filter((r) => !authorCond || (r.createdBy ?? '') === authorCond)
    .filter((r) => !madeFrom || (r.createdAt ?? '').slice(0, 10) >= madeFrom)
    .filter((r) => !madeTo || ((r.createdAt ?? '') !== '' && r.createdAt!.slice(0, 10) <= madeTo))
    .filter((r) => !editedFrom || (r.updatedAt ?? '').slice(0, 10) >= editedFrom)
    .filter((r) => !editedTo || ((r.updatedAt ?? '') !== '' && r.updatedAt!.slice(0, 10) <= editedTo))
    /* 원본 [기타]의 수정일자순(정렬) — 켜면 마지막에 고친 발주가 위로 온다. */
    .sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') : 0)),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [rows, tab, from, to, orderNoCond, whCond, projCond, partnerCond, itemCond,
     categoryCond, itemGroupCond, mgmt.groupOptions, partnerGroupCond, pgroups.groupOptions,
     dueFrom, dueTo, specCond, empCond, pmgrCond, pmgr.options, remarkCond, refCond,
     authorCond, madeFrom, madeTo, editedFrom, editedTo, byUpdated])
  const tabCount = (t: Tab) => rows.filter((r) => !OTHER_SLIPS.includes(r.status) && inTab(t, r.status)).length

  useEffect(() => { loadSupplierParty().then(setCompany) }, [])

  /**
   * 발주서 인쇄. 발주서는 우리가 <b>발주자</b>이고 거래처가 물품을 대는 쪽이라,
   * 명세서와 공급자/공급받는자 위치가 반대다.
   */
  async function printOrder(po: PurchaseOrder) {
    const p = partners.find((x) => x.id === po.partnerId)
    await printDocuments([{
      title: '발 주 서',
      docNo: po.orderNo,
      docDate: po.orderDate,
      supplier: {
        label: '수신처(공급자)', name: po.partnerName,
        bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem,
        tel: p?.phone, address: p?.address,
      },
      customer: company ? { ...company, label: '발주자' } : { label: '발주자', name: '(회사정보 미등록)' },
      extra: [
        { label: '납기일', value: po.dueDate },
        /* 납기일과 다른 값이다 — 이건 그 단가가 언제까지 유효하냐다. */
        { label: '단가 유효기간', value: po.priceValidUntil },
        { label: '입고창고', value: po.warehouseName },
        { label: '담당', value: po.employeeName ?? po.createdBy },
        { label: '진행상태', value: po.statusName },
      ],
      remark: po.remark,
      lines: po.lines.map((l) => ({
        itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
        quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount,
      })),
      footNote: '아래와 같이 발주하오니 납기를 준수하여 주시기 바랍니다.',
    }])
  }



  /*
   * 원본 하단 단추줄의 <b>[선택삭제]</b> — 고른 줄을 한 번에 지운다. 줄마다 [삭제]는
   * 진작 있었지만, 잘못 올린 발주서 열 줄을 지우려면 열 번 묻고 열 번 눌러야 했다.
   *
   * <p>지우다 하나가 막히면 <b>거기서 멈추지 않는다</b> — 나머지는 지우고 몇 건이 왜
   * 남았는지 알려 준다. 중간에 멈추면 무엇이 지워졌는지 사람이 알 수 없다.
   */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const pick = (id: number) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  /*
   * 원본 하단 단추줄의 <b>[진행상태변경]</b> — 고른 줄을 한 번에 다음 단계로 넘긴다.
   *
   * <p>발주는 요청 → 계획 → 단가확정 → <b>발주확정</b> → 입고 로 간다. 그중 <b>[발주확정]</b>
   * 하나만 한꺼번에 한다 — 단가확정은 값을 받아야 하고 입고전환은 창고를 물어야 해서,
   * 고른 열 줄에 대해 열 번 묻는 꼴이 된다. 단가까지 정해 둔 줄만 한 번에 확정한다.
   *
   * <p><b>넘어간 줄과 건너뛴 줄을 함께 말한다.</b> 열 줄을 골랐는데 셋만 움직였을 때
   * 아무 말이 없으면 나머지 일곱이 왜 그대로인지 알 수 없다.
   */
  async function bulkStatus() {
    const targets = shown.filter((po) => picked.has(po.id) && po.status === 'PRICED')
    const skipped = picked.size - targets.length
    if (targets.length === 0) { setError('단가확정까지 끝난 발주서를 고르세요 — 그 줄만 한 번에 확정합니다.'); return }
    const results = await Promise.allSettled(
      targets.map((po) => api.post(`/purchase-orders/${po.id}/confirm`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError([
      failed ? `${failed}건은 확정하지 못했습니다.` : '',
      skipped ? `${skipped}건은 단가확정 전이라 건너뛰었습니다.` : '',
    ].filter(Boolean).join(' '))
    load()
  }

  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) { setError('삭제할 발주서를 고르세요.'); return }
    /* 이 파일의 confirm 은 발주 확정이다 — 브라우저 것을 쓰려면 window 를 붙여야 한다. */
    if (!(await ecConfirm(`고른 ${ids.length}건을 삭제할까요?`))) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/purchase-orders/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError(failed ? `${failed}건은 삭제하지 못했습니다(이미 입고로 넘어간 발주서일 수 있습니다).` : '')
    load()
  }

  return (
    <EcListShell
      title="발주서조회"
      /*
       * 원본 [신규(F2)] 는 <b>아래 단추줄 맨 앞</b>이다. 우리 것은 표 위에 따로 떠 있고
       * 이름도 [+ 발주요청(F2)] 이었다 — 화면마다 새로 만드는 단추가 다른 자리에 있으면
       * 손이 매번 다시 찾는다. 셸에 맡겨 다른 화면과 같은 자리에 세운다.
       */
      /* 2026-10-21: 발주요청은 다른 전표다 — [신규(F2)] 는 발주서입력 화면(바로 발주서)으로 간다. */
      newLabel="신규(F2)"
      onNew={() => navigate('/sales/purchase-order-input')}
      actions={[
      /* 원본 차례: 신규(F2) · 진행상태변경 · 인쇄 · 선택삭제 · Excel (사본 실측) */
      { label: `진행상태변경${picked.size ? ` (${picked.size})` : ''}`, onClick: bulkStatus },
      { label: '인쇄' },
      { label: `선택삭제${picked.size ? ` (${picked.size})` : ''}`, onClick: removeChecked },
      { label: 'Excel' },
    ]}>
      <div className="flex items-center gap-[6px] mb-[8px]">
        <button className="ec-btn" onClick={load}>새로고침</button>
        <span className="ml-[8px] text-[12px] text-ec-hint">
          발주요청 → 발주계획 → 단가확정 → 발주확정 → 입고전환. 재고는 입고전환 시에만 증가합니다.
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {/* 상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다. */}
      {/* 원본 조건 차례: 발주No. · … · 창고 · … · 거래처 · 품목 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 조건 첫째 <b>[기준일자]</b> — 단추줄에 [말일]이 낀다(사본 실측). */}
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from}
                 onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span className="my-0 mx-[4px] text-ec-hint">~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={ORDER_DOC_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="발주No.">
          <input className="ec-input" value={orderNoCond}
                 onChange={(e) => setOrderNoCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond} items={condPickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projCond} onChange={setProjCond}
                           items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={condPickers.partners} />
        </EcCond>
        {/* 원본 [거래처그룹1] — 거래처 마스터에 붙는 값이라 마스터를 받아 이름으로 잇는다. */}
        <EcCond label="거래처그룹1" pick>
          <CodePickerField label="거래처그룹1" hideLabel width={170} emptyLabel="전체"
                           value={partnerGroupCond} onChange={setPartnerGroupCond}
                           items={pgroups.groupOptions.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={condPickers.items} />
        </EcCond>
        {/*
          원본 차례(2026-09-07 실측, 서른넷):
          … 품목 · 품목구분 · 품목그룹1 · (품목그룹2·3 · 품목계층그룹) · (발송여부) ·
          납기일자 · (오더관리번호) · 규격 · 담당자 · 거래처관리담당자 · 적요 · 참조 ·
          최초작성자 · (최종수정자) · 최초작성일자 · 최종작업일자 · (입력경로 · 삭제구분) ·
          기타 · (양식 · 적용양식). 괄호 안은 못 만든 것이고 이유는 검사 예외에 적었다.
          [거래처그룹1]은 원본에서 [거래처] 바로 다음이라 그 자리에 두었다.
        */}
        <EcCond label="품목구분" pick>
          <CodePickerField label="품목구분" hideLabel width={170} emptyLabel="전체"
                           value={categoryCond} onChange={setCategoryCond}
                           items={[...new Set(rows.flatMap((r) => r.lines.map((l) => l.itemCategoryName)).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={170} emptyLabel="전체"
                           value={itemGroupCond} onChange={setItemGroupCond}
                           items={mgmt.groupOptions.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="납기일자">
          <input type="date" className="ec-input" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} style={{ width: 140 }} />
          <span className="my-0 mx-[4px] text-ec-hint">~</span>
          <input type="date" className="ec-input" value={dueTo} onChange={(e) => setDueTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="규격" pick>
          <CodePickerField label="규격" hideLabel width={170} emptyLabel="전체"
                           value={specCond} onChange={setSpecCond}
                           items={[...new Set(rows.flatMap((r) => r.lines.map((l) => l.spec)).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [담당자] — 발주를 맡은 사원. 전표를 친 [최초작성자]와 다르다. */}
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond}
                           items={employees.map((e) => ({ value: e.name, name: e.name }))} />
        </EcCond>
        {/* 원본 [거래처관리담당자] — 그 거래처를 맡은 사람. 거래처 마스터에 붙어 있다. */}
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={170} emptyLabel="전체"
                           value={pmgrCond} onChange={setPmgrCond}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [적요]는 <b>줄</b>의 메모, [참조]는 전표 머리다 — 다른 칸이다. */}
        <EcCond label="적요">
          <input className="ec-input" placeholder="줄 적요 일부" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="참조">
          <input className="ec-input" placeholder="참조 일부" value={refCond}
                 onChange={(e) => setRefCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="최초작성일자">
          <input type="date" className="ec-input" value={madeFrom} onChange={(e) => setMadeFrom(e.target.value)} style={{ width: 140 }} />
          <span className="my-0 mx-[4px] text-ec-hint">~</span>
          <input type="date" className="ec-input" value={madeTo} onChange={(e) => setMadeTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="최종작업일자">
          <input type="date" className="ec-input" value={editedFrom} onChange={(e) => setEditedFrom(e.target.value)} style={{ width: 140 }} />
          <span className="my-0 mx-[4px] text-ec-hint">~</span>
          <input type="date" className="ec-input" value={editedTo} onChange={(e) => setEditedTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t} ({tabCount(t)})
          </button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[28px] text-center"></th>
            <th className="w-[34px]"></th>
            {/* 원본 발주서조회 열(2026-10-20 실측): 발주번호 · 거래처명 · 담당자 · 품목 · 납기일자 · 금액 · 종결여부 · 진행상태(조회) · 인쇄 · 프로젝트명. */}
            <th className="w-[150px] text-center">발주번호</th>
            <th>거래처명</th>
            <th className="w-[90px]">담당자</th>
            <th>품목</th>
            <th className="w-[100px] text-center">납기일자</th>
            <th className="text-right">금액</th>
            <th className="text-center">종결여부</th>
            <th className="text-center">진행상태</th>
            <th className="text-center">인쇄</th>
            <th>프로젝트명</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((po, i) => (
            <Fragment key={po.id}>
              <tr onClick={() => toggle(po.id)} className="cursor-pointer">
                <td className="text-center">
                  <input type="checkbox" checked={picked.has(po.id)} onChange={() => pick(po.id)} />
                </td>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td className="text-center text-ec-blue font-semibold">
                  {shortDateNo(po.orderDate, po.orderNo)}
                </td>
                <td>{po.partnerName}</td>
                <td style={{ color: po.employeeName ? undefined : 'var(--ec-text-off)' }}>{po.employeeName ?? ''}</td>
                {/* 여러 줄이면 첫 줄에 '외 N건' 을 붙인다 — 원본도 한 칸에 대표 품목을 적는다. */}
                <td>
                  {po.lines[0]
                    // 열 이름이 품목명[규격명] 인데 규격을 안 찍었다(45회차 screen-check) — 같은 이름 다른 규격을 못 가른다.
                    ? po.lines[0].itemName + (po.lines[0].spec ? ` [${po.lines[0].spec}]` : '')
                      + (po.lines.length > 1 ? ` 외 ${po.lines.length - 1}건` : '')
                    : ''}
                </td>
                <td className="text-center">{dateText(po.dueDate) || ''}</td>
                <td className="text-right font-bold">{won(po.totalAmount)}</td>
                <td className="text-center"><span style={{ color: statusColor(po.status) }}>{isDone(po.status) ? '완료' : '진행중'}</span></td>
                {/* 원본 [진행상태] '조회' — 이 발주서에서 이어진 전표. 우리는 줄을 펼쳐 이력 · 구매를 본다. */}
                <td className="text-center">
                  <a className="cursor-pointer" title={po.statusName}>조회</a>
                </td>
                <td className="text-center" onClick={(e) => e.stopPropagation()}>
                  {/* 원본 [인쇄] 열은 '인쇄' 한 칸뿐(2026-10-21 실측). 옛 단추(발주계획 · 단가확정 · 발주확정 · 입고전환 · 취소 · 삭제)는
                      원본 자리로 갔다 — 단가는 단가요청진행단계, 입고는 구매입력 [발주], 지우기는 [선택삭제]. */}
                  <a className="cursor-pointer" onClick={() => void printOrder(po)}>인쇄</a>
                </td>
                <td>{po.projectName ?? ''}</td>
              </tr>
              {openId === po.id && (
                <tr className="no-ec">
                  <td colSpan={12} className="p-0 bg-ec-page">
                    <table className="w-full text-left my-[4px] mx-0">
                      <thead><tr><th className="w-[34px]"></th><th>품목코드</th><th>품목명</th><th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th><th className="text-right">부가세</th></tr></thead>
                      <tbody>
                        {po.lines.map((l) => (
                          <tr key={l.id}>
                            <td className="text-center text-ec-hint">{l.lineNo}</td>
                            <td>{l.itemCode}</td>
                            <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''}</td>
                            <td className="text-right">{won(l.quantity)} {l.unit}</td>
                            <td className="text-right">{won(l.unitPrice)}</td>
                            <td className="text-right">{won(l.supplyAmount)}</td>
                            <td className="text-right text-ec-hint">{won(l.vatAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* 진행이력 — 단계가 바뀐 자취. 아직 안 왔거나 하나도 없으면 그 사실을 적는다. */}
                    <div className="pt-[2px] px-[6px] pb-[8px]">
                      <div className="text-[12px] font-bold text-ec-label mt-[2px] mx-0 mb-[4px]">진행이력</div>
                      {hist[po.id] === undefined ? (
                        <span className="text-[12px] text-ec-hint">불러오는 중…</span>
                      ) : hist[po.id].length === 0 ? (
                        <span className="text-[12px] text-ec-hint">기록된 단계 변경이 없습니다.</span>
                      ) : (
                        <table className="w-full text-left max-w-[720px]">
                          <thead><tr>
                            <th className="w-[150px]">일시</th>
                            <th className="w-[180px]">단계</th>
                            <th className="w-[120px]">처리자</th>
                            <th>메모</th>
                          </tr></thead>
                          <tbody>
                            {hist[po.id].map((h, k) => (
                              <tr key={k}>
                                <td>{h.changedAt.replace('T', ' ').slice(0, 16)}</td>
                                <td>
                                  {h.fromStatusName ? `${h.fromStatusName} → ` : ''}
                                  <b>{h.toStatusName}</b>
                                </td>
                                <td>{h.changedBy ?? ''}</td>
                                <td style={{ color: h.note ? undefined : 'var(--ec-text-off)' }}>{h.note ?? ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    {/*
                      <b>추가항목(사용자정의).</b> 열 예외에 "우리 추가항목은 판매·구매 전표까지고
                      <b>발주서 화면이 아직 안 읽는다</b>" 고 적어 두었다 — 이유가 아니라 할 일이었다.
                      Self-Customizing > 사용자정의필드에서 [발주서]로 정의하면 여기 뜬다.
                      정의가 없으면 아무것도 안 그린다(안 쓰는 회사의 화면은 그대로다).

                      <p>줄(격자 열)은 아직이다. 원본은 격자에 추가문자·추가숫자·추가일자·추가코드
                      스물다섯 칸을 여는데, 그건 입력 격자를 손봐야 하는 별개의 일이라 여기서
                      반만 만들어 두지 않는다 — 열 예외에 그렇게 적어 두었다.
                    */}
                    <div className="pt-0 px-[6px] pb-[8px]">
                      <CustomFieldsPanel entityType="PURCHASE_ORDER" entityId={po.id} />
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {showForm && <PurchaseOrderForm items={items} partners={partners} employees={employees} warehouses={warehouses} projects={projects} currencies={currencies} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); flash('발주요청을 등록했습니다.'); load() }} />}
    </EcListShell>
  )
}


function PurchaseOrderForm({ items, partners, employees, warehouses, projects, currencies, onClose, onSaved }: {
  items: Item[]; partners: Partner[]; employees: EmployeeMaster[]; warehouses: Warehouse[]
  projects: { id: number; code: string; name: string }[]; currencies: Currency[]
  onClose: () => void; onSaved: () => void
}) {
  const [partnerId, setPartnerId] = useState('')
  const [orderDate, setOrderDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [employeeId, setEmployeeId] = useState('')   // 담당자
  const [warehouseId, setWarehouseId] = useState('') // 입고창고
  /* 원본 발주서입력의 [프로젝트]. 발주 단계가 빠져 프로젝트별 손익에 안 잡혔다. */
  const [projectId, setProjectId] = useState('')
  const [currency, setCurrency] = useState('KRW')    // 통화
  const [taxable, setTaxable] = useState(true)   // 거래유형: 부가세율 적용 / 면세
  const [remark, setRemark] = useState('')       // 참조
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  /**
   * 원본 격자 툴바의 [My품목]. <b>단가는 My품목이 들고 온 값을 쓰지 않는다</b> —
   * 그 값은 품목의 판매단가다. 발주는 사는 쪽이라 구매단가를 채워야 한다
   * (아래 pickItem 과 같은 규칙). 판매가를 채우면 그게 발주단가로 굳는다.
   */
  const myItems = useMyItemsPick((picked) => setLines((ls) => {
    const kept = ls.filter((l) => l.itemId)
    const added = picked.map((m) => {
      const pp = items.find((x) => x.id === m.itemId)?.purchasePrice ?? 0
      return { ...emptyLine(), itemId: String(m.itemId), quantity: String(m.defaultQty), unitPrice: pp > 0 ? String(pp) : '' }
    })
    return [...kept, ...added, emptyLine()]
  }))
  /**
   * 줄 추가항목의 <b>정의</b>. 열 예외에 "발주서 화면이 아직 안 읽는다" 고 적혀 있던
   * 그 나머지 반쪽이다(머리는 앞 커밋에 이었다). 판매·구매 입력이 쓰는 것과 같은 길이다 —
   * <code>/custom-fields/defs?entityType=PURCHASE_ORDER_LINE</code>.
   */
  const [lineDefs, setLineDefs] = useState<CustomFieldDef[]>([])
  useEffect(() => {
    api.get<CustomFieldDef[]>('/custom-fields/defs', { params: { entityType: 'PURCHASE_ORDER_LINE' } })
      .then((r) => setLineDefs(r.data.filter((d) => d.active !== false)))
      /* 추가항목은 곁가지다 — 못 불러와도 입력을 막지 않는다. */
      .catch(() => setLineDefs([]))
  }, [])
  /** 줄 추가항목 한 칸을 고친다. */
  const setLineCustom = (idx: number, key: string, value: string) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, custom: { ...l.custom, [key]: value } } : l)))

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const specOf = (itemId: string) => items.find((x) => String(x.id) === itemId)?.spec ?? ''
  /* 원본 격자의 [단위] — 품목이 들고 있는 값이라 고르면 바로 따라 붙는다. */
  const unitOf = (itemId: string) => items.find((x) => String(x.id) === itemId)?.unit ?? ''

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function pickItem(i: number, itemId: string) {
    const it = items.find((x) => String(x.id) === itemId)
    // 발주는 사는 쪽이다 — 판매단가가 아니라 <b>구매단가</b>를 채운다.
    // 구매단가를 안 정한 품목(0)은 비워 둔다. 판매가를 채우면 그게 발주단가로 굳는다.
    const pp = it?.purchasePrice ?? 0
    setLine(i, { itemId, unitPrice: pp > 0 ? String(pp) : '' })
    // 매입처의 특별단가(구매)가 있으면 덮는다(50회차 — 발주서는 특별단가를 몰랐다).
    void resolveSpecialPrice('PURCHASE', itemId, partnerId).then((p) => { if (p != null) setLine(i, { unitPrice: String(p) }) })
  }
  /** 매입처를 고르면 담긴 품목의 특별단가를 다시 찾는다 — 품목을 먼저 담아도 걸리게. */
  function choosePartner(v: string) {
    setPartnerId(v)
    lines.forEach((l, i) => {
      if (l.itemId) void resolveSpecialPrice('PURCHASE', l.itemId, v).then((p) => { if (p != null) setLine(i, { unitPrice: String(p) }) })
    })
  }

  const calc = lines.map((l) => lineSupply(Number(l.quantity) || 0, Number(l.unitPrice) || 0))
  const supply = calc.reduce((a, b) => a + b, 0)
  // 서버처럼 줄마다 반올림한 부가세를 더한다(전표 합계에 한 번 반올림하면 1원씩 어긋난다).
  const vat = taxable ? calc.reduce((a, s) => a + roundWon(s * 0.1), 0) : 0

  async function save() {
    setError('')
    if (!partnerId) return setError('매입처를 선택하세요.')
    const payload = lines
      .filter((l) => l.itemId && Number(l.quantity) > 0)
      .map((l) => ({
        itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0,
        partnerId: l.partnerId ? Number(l.partnerId) : undefined,
        remark: l.remark || undefined,
      }))
    if (payload.length === 0) return setError('품목을 1개 이상 입력하세요.')
    /* 보낸 줄과 <b>같은 차례로</b> 돌아온다 — 추가항목을 새 줄 id 에 붙일 때 이 짝을 쓴다. */
    const kept = lines.filter((l) => l.itemId && Number(l.quantity) > 0)
    setSaving(true)
    try {
      const res = await api.post<PurchaseOrder>('/purchase-orders', {
        partnerId: Number(partnerId), orderDate, dueDate: dueDate || undefined,
        employeeId: employeeId ? Number(employeeId) : undefined,
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        projectId: projectId ? Number(projectId) : undefined,
        currency,
        taxable, remark: remark || undefined, lines: payload,
      })
      /*
       * 줄 추가항목은 <b>줄 id 가 생긴 뒤에야</b> 붙일 수 있어서 저장을 두 번 한다.
       * 값을 하나도 안 채운 줄은 부르지 않는다 — 안 쓰는 회사에 헛요청이 줄 수만큼 나간다.
       * 여기서 실패해도 발주는 이미 저장됐으므로 <b>그 사실을 알리고</b> 닫는다.
       */
      if (lineDefs.length > 0) {
        const newLines = res.data.lines ?? []
        const puts = kept.map((l, i) => {
          const id = newLines[i]?.id
          if (id == null || !Object.values(l.custom ?? {}).some((v) => v?.trim())) return null
          return api.put('/custom-fields/values', { values: l.custom },
            { params: { entityType: 'PURCHASE_ORDER_LINE', entityId: id } })
        }).filter(Boolean) as Promise<unknown>[]
        if (puts.length > 0) {
          try { await Promise.all(puts) }
          catch { setError('발주는 저장했지만 줄 추가항목 저장에 실패했습니다.') }
        }
      }
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '발주서 품목 격자', [lineDefs.length])

  /**
   * 원본 격자 툴바의 <b>[재고불러오기]</b>와 그것이 채우는 두 칸.
   *
   * <p>발주는 <b>모자라는 것을 채우는 일</b>이다. 얼마를 시킬지는 <b>지금 얼마 있나</b>를
   * 봐야 정하는데, 우리 격자에는 그 칸이 없어 재고현황을 따로 열어 보고 와야 했다.
   * 원본 발주서입력 격자에는 <b>[전체수량]·[창고수량]</b> 두 칸이 있고
   * (<code>qa/fixtures/ecount-column-width.json</code> 의 발주서입력 — 각 67),
   * 이 단추가 그것을 채운다.
   *
   * <p>화면을 열 때마다 전 품목 재고를 끌어오지 않는다 — <b>누를 때만</b> 부른다
   * (생산불출입력·판매/구매입력과 같다). 부르기 전에는 <b>'-'</b> 로 둔다.
   * 0 으로 채우면 "재고가 없다" 로 읽힌다.
   */
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [stockLoaded, setStockLoaded] = useState(false)
  const [stockBusy, setStockBusy] = useState(false)
  async function loadStocks() {
    setStockBusy(true)
    try {
      setStocks((await api.get<StockRow[]>('/stock')).data)
      setStockLoaded(true)
    } catch (err) { setError(extractErrorMessage(err)) } finally { setStockBusy(false) }
  }
  /** 그 품목의 전 창고 합계. 아직 안 불러왔으면 null 이다(0 이 아니다). */
  const stockAllOf = (itemId: string): number | null => {
    if (!stockLoaded || !itemId) return null
    return stocks.filter((s) => String(s.itemId) === itemId).reduce((a, s) => a + s.quantity, 0)
  }
  /** 머리에서 고른 <b>입고창고</b>의 수량. 창고를 안 골랐으면 잴 것이 없어 null 이다. */
  const stockAtOf = (itemId: string): number | null => {
    if (!stockLoaded || !itemId || !warehouseId) return null
    const hit = stocks.find((s) => String(s.itemId) === itemId && String(s.warehouseId) === warehouseId)
    return hit ? hit.quantity : 0
  }
  const stockCell = (n: number | null) => (n === null ? '-' : n.toLocaleString())

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 880, maxWidth: '96vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">발주요청</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <table className="w-full text-left mb-[12px]">
            <tbody>
              <tr>
                <th className="w-[90px] bg-ec-page">매입처<span className="text-ec-danger">*</span></th>
                <td>
                  <CodePickerField label="매입처" hideLabel width={240} emptyLabel="선택 안 함" placeholder="매입처 선택"
                                   value={partnerId} onChange={choosePartner}
                                   items={partnerCodeItems(partners.filter((p) => p.type !== 'CUSTOMER'), true)} />
                </td>
                {/* 원본 발주서입력의 이름은 [발주일]이 아니라 <b>[일자]</b> 다(사본 실측). */}
                <th className="w-[70px] bg-ec-page">일자</th>
                <td><input type="date" className="ec-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                {/* 원본 발주서입력의 이름은 [납기요청일]이 아니라 <b>[납기일자]</b> 다(사본 실측).
                    목록 열도 이미 [납기일자]라 <b>우리끼리도 어긋나</b> 있었다. */}
                <th className="bg-ec-page">납기일자</th>
                <td><input type="date" className="ec-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} /></td>
{/* 원본 차례: 담당자 · 거래유형 · 통화 · 참조 — 담당자가 거래유형보다 앞이다. */}
                {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다 —
                    사원·창고가 몇십 개만 돼도 드롭다운으로는 코드로 못 찾는다. */}
                <th className="bg-ec-page">담당자</th>
                <td>
                  <CodePickerField label="담당자" hideLabel width={150} emptyLabel="담당자 선택"
                                   value={employeeId} onChange={setEmployeeId}
                                   items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">거래유형</th>
                <td>
                  <select className="ec-input" value={taxable ? 'VAT' : 'FREE'} onChange={(e) => setTaxable(e.target.value === 'VAT')} style={{ width: 150 }}>
                    <option value="VAT">부가세율 적용</option>
                    <option value="FREE">면세</option>
                  </select>
                </td>
                {/* 원본 발주서입력의 이름은 [창고]가 아니라 <b>[입고창고]</b> 다 — 목록 상세도 그렇게 적는다. */}
                <th className="bg-ec-page">입고창고</th>
                <td>
                  <CodePickerField label="입고창고" hideLabel width={150} emptyLabel="창고 선택"
                                   value={warehouseId} onChange={setWarehouseId}
                                   items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name, stopped: x.active === false }))} />
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">통화</th>
                <td>
                  <select className="ec-input" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 150 }}>
                    <option value="KRW">내자(KRW)</option>
                    {currencies.filter((c) => c.code !== 'KRW').map((c) => <option key={c.id} value={c.code}>{c.code} {c.name}</option>)}
                  </select>
                </td>
                <th className="bg-ec-page">참조</th>
                <td><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="참조/비고" style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                {/* 원본 발주서입력 차례의 <b>맨 뒤</b>가 [프로젝트]다(사본 실측). */}
                <th className="bg-ec-page">프로젝트</th>
                <td colSpan={3}>
                  <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="선택 안 함"
                                   value={projectId} onChange={setProjectId}
                                   items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
            </tbody>
          </table>

          <table ref={tableRef} className="w-full text-left">
            {/*
              원본 발주서입력 격자에는 <b>[No.]·[단위]·[단가(vat포함)]</b> 도 있다(사본 실측).
              줄 번호는 <b>첫 칸에 찍고도 이름이 없어</b> 무엇인지 몰랐고, 단위는 품목이 들고 있는데
              안 보여 "3" 이 세 개인지 세 박스인지 알 수 없었다. 부가세 포함 단가는 <b>매입처가 부르는 값</b>이라
              머릿속으로 곱해 보고 있었다.
            */}
            <thead><tr><th className="w-[30px]"></th><th>품목</th><th className="w-[100px]">규격</th><th className="w-[130px]">거래처</th><th className="w-[67px] text-right">전체수량</th><th className="w-[67px] text-right">창고수량</th><th className="w-[70px] text-right">수량</th><th className="w-[90px] text-right">예상단가</th><th className="text-right">공급가액</th><th className="w-[110px]">적요</th>{/* 줄 추가항목. 정의한 것만 열이 생긴다 — 안 쓰는 회사는 격자가 그대로다. */}{lineDefs.map((d) => (<th key={d.fieldKey} className="w-[120px]">{d.label}</th>))}<th className="w-[40px]">No.</th><th className="w-[46px]">단위</th><th className="w-[100px] text-right">단가(vat포함)</th><th className="w-[34px]"></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>
                    <CodePickerField label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제"
                                     value={l.itemId} onChange={(v) => pickItem(i, v)}
                                     items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec, stopped: it.active === false }))} />
                  </td>
                  <td className="text-ec-muted">{specOf(l.itemId)}</td>
                  <td>
                    <CodePickerField label="매입처" hideLabel fill emptyLabel="(헤더 매입처)" placeholder="(헤더 매입처)"
                                     value={l.partnerId} onChange={(v) => setLine(i, { partnerId: v })}
                                     items={partnerCodeItems(partners.filter((p) => p.type !== 'CUSTOMER'), true)} />
                  </td>
                  {/* [재고불러오기]가 채우는 두 칸. 누르기 전에는 '-' 다. */}
                  <td className="text-right text-ec-label">{stockCell(stockAllOf(l.itemId))}</td>
                  <td className="text-right text-ec-label">{stockCell(stockAtOf(l.itemId))}</td>
                  <td><EcNumInput className="ec-input w-full text-right" value={l.quantity} onValue={(v) => setLine(i, { quantity: v })} /></td>
                  <td><EcNumInput className="ec-input w-full text-right" value={l.unitPrice} onValue={(v) => setLine(i, { unitPrice: v })} /></td>
                  <td className="text-right">{won(calc[i])}</td>
                  <td><input className="ec-input" value={l.remark} onChange={(e) => setLine(i, { remark: e.target.value })} style={{ width: '100%' }} /></td>
                  {/*
                    머리의 추가항목과 <b>같은 잣대로</b> 그린다 — [코드] 형식이면 고르는 칸,
                    나머지는 치는 칸이다. 판매·구매 격자가 예전에 이 둘을 다르게 그려
                    같은 필드가 위아래에서 다르게 굴었던 적이 있다.
                  */}
                  {lineDefs.map((d) => (
                    <td key={d.fieldKey}>
                      {d.fieldType === 'CODE' ? (
                        <select className="ec-input" value={l.custom[d.fieldKey] ?? ''} disabled={!l.itemId}
                                onChange={(e) => setLineCustom(i, d.fieldKey, e.target.value)} style={{ width: '100%' }}>
                          <option value=""></option>
                          {(d.options ?? '').split(',').map((o) => o.trim()).filter(Boolean)
                            .map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input className="ec-input" disabled={!l.itemId}
                               type={d.fieldType === 'DATE' ? 'date' : d.fieldType === 'NUMBER' ? 'number' : 'text'}
                               value={l.custom[d.fieldKey] ?? ''}
                               onChange={(e) => setLineCustom(i, d.fieldKey, e.target.value)} style={{ width: '100%' }} />
                      )}
                    </td>
                  ))}
                  <td className="text-ec-muted">{i + 1}</td>
                  <td className="text-ec-muted">{unitOf(l.itemId)}</td>
                  <td className="text-right text-ec-muted">{won(Math.round(Number(l.unitPrice || 0) * (taxable ? 1.1 : 1)))}</td>
                  <td className="text-center">{lines.length > 1 && <button className="ec-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-ec-page">
                <td colSpan={8} className="text-right">공급가액 / 부가세 / 합계</td>
                {/* 추가항목 열이 늘어난 만큼 여기도 늘어야 한다 — 안 그러면 합계가 엉뚱한 열 아래 붙는다. */}
                <td className="text-right" colSpan={6 + lineDefs.length}>{won(supply)} / {won(vat)} / <span className="text-ec-navy">{won(supply + vat)}</span></td>
              </tr>
            </tfoot>
          </table>
          <div className="flex items-center gap-[6px] mt-[8px]">
            <button className="ec-btn" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ 행 추가</button>
            {/* 단추는 화면이 <b>글자로</b> 그린다 — 자식 컴포넌트에 넣으면 버튼 검사가 못 본다. */}
            <button type="button" className="ec-btn" disabled={myItems.busy} onClick={myItems.pick}>My품목</button>
            <button type="button" className="ec-btn" disabled={stockBusy} onClick={loadStocks}>재고불러오기</button>
            <MyItemsNote note={myItems.note} />
            {stockLoaded && (
              <span className="text-[12px] text-ec-label">
                재고를 불러왔습니다{warehouseId ? '' : ' — [입고창고]를 고르면 창고수량도 찹니다'}.
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

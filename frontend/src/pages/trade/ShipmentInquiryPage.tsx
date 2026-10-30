import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'
import { useNavigate } from 'react-router-dom'
import { dateNo } from '../../utils/dateNo'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerManagers } from '../../utils/partnerManagers'
import Modal from '../../components/Modal'
import { ecAlert, ecConfirm, requireSelection } from '../../components/EcDialog'
import { SlipMenuHistoryModal, EMAIL_NOT_HERE, BARCODE_NOT_HERE } from '../../features/sliphistory/SlipMenuHistoryModal'
import { SlipHistoryModal, slipHeadLabel } from '../../features/sliphistory/SlipHistoryModal'
import { useShipmentEntry, type ShipmentRes } from '../../features/shipment/useShipmentEntry'
import { EcDateRange } from '../../components/ui/EcDateInput'

/**
 * 영업 > 출하조회 (E040226) — 전표(출하) 단위 조회. 행 클릭 시 품목 상세 펼침.
 *
 * <p><b>화면코드를 두 번 고쳤다. 지금 적힌 E040226 이 맞다.</b>
 * 앞 바퀴에 <code>C000138</code> 이라 고쳐 적었는데 그것이 틀렸다 — 2026-09-08 에
 * 영업관리 &gt; 출하 &gt; 출하조회의 메뉴 링크를 읽고 화면을 눈으로 확인하니
 * <code>prgId=E040226</code> 이고 제목도 [출하조회]다.
 * <b>C000138 은 그 위의 [출하] 그룹이다</b> — 그룹을 누르면 첫 화면이 열리는데
 * 주소창에는 그룹 코드가 남아, 화면을 제대로 열어 놓고도 코드는 그룹 것을 읽게 된다.
 * 화면 코드는 E 로 시작한다.
 * 판매조회/구매조회(TradeInquiryPage)의 출하판. 출하현황(ShipmentPage)이 상태 집계 뷰라면
 * 이 화면은 기준일자 범위·발송여부 검색폼 + 라인 상세를 가진 전표 조회다.
 * 백엔드 무변경 — `/shipments` 가 이미 라인까지 반환한다.
 *
 * <p><b>여기 적혀 있던 말이 틀렸다.</b> "창고·프로젝트는 Shipment 엔티티에 필드가 없어
 * 의도적 제외" 라고 적어 두고 있었는데, 엔티티에도 응답에도 <b>둘 다 있다</b>
 * (<code>warehouse</code>·<code>project</code>, <code>warehouseName</code>·<code>projectName</code>).
 * 값이 오는데 화면이 받아 두지 않아 못 거르고 있었을 뿐이다. 조건으로 걸었다.
 * [관리항목]만 여전히 없다 — 그건 품목 마스터에 붙는 값이라 출하 전표에는 없다.
 */
type Shipment = ShipmentRes

/*
 * 원본 출하조회 탭(2026-10-20 실측): 전체 · 결재중 · 미확인 · 확인. 2026-10-22 원본 실측 — 출하 아홉 건이 모두 [확인] 탭에 있고 결재중 · 미확인은 빈다
 * (이 회사는 전표상태관리유형이 꺼져 있어 [진행상태변경] ▴ › 미확인 · 확인 을 눌러도 '전표상태관리유형 설정으로 인해 전표상태를 변경할 수 없습니다.' 알림만 뜬다).
 * 우리 출하도 같다: 전체 · 확인에 다 있고 결재중 · 미확인은 늘 빈다. 예전 [발송여부] 알약(미발송 · 발송 · 취소)은 원본에 없어 뺐다.
 */
const TABS = ['전체', '결재중', '미확인', '확인'] as const
type Tab = (typeof TABS)[number]

/** 원본 수량합계는 소수 둘('3.00'). */
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * 원본 격자의 마지막 열 <b>[인쇄]</b> — 그 한 건을 종이로 찍는다.
 *
 * <p><b>금액 칸(단가·공급가액·부가세)은 안 그린다.</b> 출하 전표에는 <b>부가세가 없다</b> —
 * 부가세는 판매 전표가 매긴다. 0 으로 채워 그리면 "부가세 0원" 이 되어, 과세 거래인데
 * 면세처럼 읽히는 종이가 나간다. 대신 우리가 <b>아는 값</b>인 출하금액 합계는 머리 항목에
 * 적는다 — 없는 값을 지어내지 않으면서 아는 값은 버리지 않는다.
 */
async function printShipment(r: Shipment, company: DocParty | null) {
  await printDocuments([{
    title: '출 하 증',
    docNo: r.shipNo,
    docDate: r.shipDate,
    hideAmounts: true,
    supplier: company ? { ...company, label: '공급자' } : { label: '공급자', name: '(회사정보 미등록)' },
    customer: { label: '공급받는자', name: r.partnerName },
    extra: [
      { label: '출하창고', value: r.warehouseName },
      { label: '근거주문', value: r.salesOrderNo },
      { label: '담당', value: r.employeeName ?? r.createdBy },
      { label: '연락처', value: r.contact },
      { label: '배송지', value: r.address },
      { label: '발송여부', value: r.statusName },
      { label: '출하금액', value: r.totalAmount.toLocaleString('ko-KR') },
    ],
    remark: r.remark,
    lines: r.lines.map((l) => ({
      itemCode: l.itemCode, itemName: l.itemName, spec: l.spec, unit: l.unit,
      quantity: l.quantity, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
    })),
    footNote: '위 물품을 틀림없이 인수하였음을 확인합니다.',
  }])
}

export default function ShipmentInquiryPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Shipment[]>([])
  const [keyword, setKeyword] = useState('')
  /*
   * <b>기간 기본값이 비어 있었다</b> — 화면을 열면 전 기간이 내려왔다(2026-09-10 실측 1,075KB).
   * 원본 기본은 한 달 전 ~ 한 달 뒤 전날(2026/10/23 에 2026/09/23 ~ 2026/11/22) — 출하지시서조회와 같다. 예전 자료는 기간을 넓히면 보인다.
   */
  const [period0] = useState<[string, string]>(() => {
    const d = new Date()
    return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())), ymd(new Date(d.getFullYear(), d.getMonth() + 1, d.getDate() - 1))]
  })
  const [from, setFrom] = useState(period0[0])
  const [to, setTo] = useState(period0[1])
  const [tab, setTab] = useState<Tab>('전체')
  const [shipNoCond, setShipNoCond] = useState('')
  const [warehouseCond, setWarehouseCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects'])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  /* 출하입력(수정) 창 — 원본 일자-No. 링크. */
  const [editing, setEditing] = useState<Shipment | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const entry = useShipmentEntry(editing)
  /* 인쇄물 머리의 공급자 칸. 회사정보를 한 번만 받아 둔다. */
  const [company, setCompany] = useState<DocParty | null>(null)
  useEffect(() => { loadSupplierParty().then(setCompany) }, [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true); setError('')
    api.get<Shipment[]>('/shipments', { params: { from: from || undefined, to: to || undefined } })
      .then((res) => setRows(res.data))
      .catch((err) => { setError(extractErrorMessage(err)); setRows([]) })
      .finally(() => setLoading(false))
  }
  /*
   * <b>기간을 서버에 보낸다.</b> 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내
   * 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() }, [from, to])

  /*
   * 원본 출하조회의 조건은 <b>기준일자·출하No.·창고·프로젝트·거래처·품목·발송여부</b> 다(사본 실측).
   * 우리는 기준일자와 발송여부(알약)뿐이라, 나머지 다섯은 <b>검색상자 하나</b>로 뭉뚱그렸다.
   * 출하가 쌓이면 "저 창고에서 나간 것만" 을 물을 방법이 없다 — 창고·프로젝트는
   * <b>응답에 이미 오고 있었는데</b> 화면이 받아 두지도 않고 있었다.
   */
  /**
   * 원본 [관리항목]. 품목 마스터에 붙는 값이라 출하 응답에는 없다 — 품목 마스터를 받아
   * 잇는다. 이 화면의 ShipLine 은 <b>itemId 를 안 받아 두어</b> 품목코드로 잇는다
   * (서버는 itemId 도 보낸다 — 지역 타입을 넓히는 것이 더 깨끗하나 여기서는 손대지 않는다).
   */
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')

  /*
   * 2026-09-07 에 원본(E040226)을 열어 <b>접힌 줄까지 펼쳐</b> 조건을 전부 쟀다(스물넷).
   * 사본에는 열뿐이었다. 그중 우리 응답이 진작 싣고 있던 넷을 만든다 —
   * 규격 · 담당자 · 적요 · 작성자. 넷 다 값이 오는데 거를 자리가 없었다.
   */
  /**
   * 원본 <b>[오더관리번호]</b>. 판매조회에서 그 칸이 <b>코드도움</b>임을 확인하고 만들었다
   * (2026-09-08 실측 — btn-code-search + form-control-code). 고르는 값은 근거 수주의
   * 전표번호고, 우리 <code>salesOrderNo</code> 가 그것이다. 목록의 [수주번호] 열에
   * 진작 찍고 있었는데 거를 자리만 없었다.
   */
  const [orderNoCond, setOrderNoCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  /*
   * 여기 남아 있던 예외 셋이 <b>사실이 아니었다</b>. [연락처]·[주소]는 '[보내기]에 딸린
   * 칸이라 전표를 내보내는 기능이 없다' 고 적혀 있었으나, 둘 다 <b>배송지</b>고
   * 출하지시서입력이 받아 저장하며 응답에도 실려 온다. [거래처관리담당자]는 '거래처
   * 마스터를 따로 받아 이어야 한다' 고 적혀 있었는데 — 그건 <b>이유가 아니라 할 일</b>이었다
   * (관리항목·품목그룹1을 이미 그렇게 이어 놓고 있다).
   * [최초작성일자]·[최종수정일시]는 응답이 안 실었던 것이 맞아서, 이번에 실었다.
   */
  const pmgr = usePartnerManagers()
  const [pmgrCond, setPmgrCond] = useState('')
  const [contactCond, setContactCond] = useState('')
  const [addressCond, setAddressCond] = useState('')
  const [madeFrom, setMadeFrom] = useState('')
  const [madeTo, setMadeTo] = useState('')
  const [editedFrom, setEditedFrom] = useState('')
  const [editedTo, setEditedTo] = useState('')
  /** 원본 [기타] — 이 화면에서는 <b>수정일자순(정렬)</b> 하나다. */
  const [byUpdated, setByUpdated] = useState(false)
  /** 하단 [진행상태변경 ▴] 메뉴(▾ 미확인 › 미확인 / ▾ 확인 › 확인) · 누르면 나오는 '알림' 표(구분 · 메뉴 · 사유). */
  const [statusMenu, setStatusMenu] = useState<{ left: number; bottom: number } | null>(null)
  const [menuHistory, setMenuHistory] = useState(false)
  const [blockedRows, setBlockedRows] = useState<string[][] | null>(null)
  const openStatusMenu = () => {
    const btn = [...document.querySelectorAll<HTMLButtonElement>('.ec-footer button')].find((b) => b.textContent?.trim() === '진행상태변경')
    const r = btn?.getBoundingClientRect()
    setStatusMenu({ left: r?.left ?? 200, bottom: r ? window.innerHeight - r.top + 4 : 48 })
  }
  const blockStatusChange = () => {
    setStatusMenu(null)
    /* 원본은 고른 줄이 없어도 메뉴를 먼저 띄운다 — 알림은 고를 때(2026-10-30 클릭 대조). */
    if (!requireSelection(checked.size)) return
    setBlockedRows(rows.filter((x) => checked.has(x.id)).map((x) => [
      `${x.shipDate.replace(/-/g, '')}-${Number(x.shipNo.split('-').pop()) || x.shipNo}`, '',
      '전표상태관리유형 설정으로 인해 전표상태를 변경할 수 없습니다.\n※ Self-Customizing > 환경설정 > 기능설정 > [응용] 탭 > 전표상태관리유형']))
  }

  const shownRows = useMemo(() => rows
    .filter(() => tab === '전체' || tab === '확인')
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.shipNo.includes(keyword) || r.lines.some((l) => l.itemName.includes(keyword)))
    .filter((r) => !from || r.shipDate >= from)
    .filter((r) => !to || r.shipDate <= to)
    .filter((r) => !shipNoCond || r.shipNo.includes(shipNoCond))
    .filter((r) => !warehouseCond || String(r.warehouseId) === warehouseCond)
    .filter((r) => !projectCond || String(r.projectId) === projectCond)
    .filter((r) => !partnerCond || String(r.partnerId) === partnerCond)
    .filter((r) => !itemCond || r.lines.some((l) => String(l.itemId) === itemCond))
    .filter((r) => !mgmtCond || r.lines.some((l) => mgmt.nameOfCode(l.itemCode) === mgmtCond))
    /* 원본 [규격] — 전표 안의 어느 줄이든 그 규격이면 걸린다(품목과 같은 규칙). */
    .filter((r) => !orderNoCond || (r.salesOrderNo ?? '') === orderNoCond)
    .filter((r) => !specCond || r.lines.some((l) => (l.spec ?? '') === specCond))
    /* 원본 [담당자] — 출하를 맡은 사원. 작성자와 다르다. */
    .filter((r) => !empCond || (r.employeeName ?? '') === empCond)
    .filter((r) => !remarkCond || (r.remark ?? '').includes(remarkCond))
    .filter((r) => !authorCond || (r.createdBy ?? '') === authorCond)
    .filter((r) => !pmgrCond || pmgr.managerOfName(r.partnerName) === pmgrCond)
    .filter((r) => !contactCond || (r.contact ?? '').includes(contactCond))
    .filter((r) => !addressCond || (r.address ?? '').includes(addressCond))
    /* 만든 때·고친 때는 날짜만 견준다 — 값은 초까지 오지만 조건은 하루 단위다. */
    .filter((r) => !madeFrom || (r.createdAt ?? '').slice(0, 10) >= madeFrom)
    .filter((r) => !madeTo || ((r.createdAt ?? '') !== '' && r.createdAt!.slice(0, 10) <= madeTo))
    .filter((r) => !editedFrom || (r.updatedAt ?? '').slice(0, 10) >= editedFrom)
    .filter((r) => !editedTo || ((r.updatedAt ?? '') !== '' && r.updatedAt!.slice(0, 10) <= editedTo))
    /*
     * 원본 [기타]의 <b>수정일자순(정렬)</b>. 켜면 마지막에 고친 건이 위로 온다 —
     * 안 켜면 이제까지의 차례(출하일 내림차순)를 그대로 쓴다.
     */
    .sort((a, b) => (byUpdated
      ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      : 0) || b.shipDate.localeCompare(a.shipDate) || b.id - a.id),
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  [rows, keyword, from, to, tab, shipNoCond, warehouseCond, projectCond, partnerCond, itemCond, mgmtCond, mgmt.options,
   orderNoCond, specCond, empCond, remarkCond, authorCond, pmgrCond, pmgr.options, contactCond, addressCond,
   madeFrom, madeTo, editedFrom, editedTo, byUpdated])

  /*
   * 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. 머리를 안 누른 동안은 위의 기본 차례
   * (출하일 내림차순)를 그대로 쓴다 — 열지 마자 최신 건이 위에 서는 것이 이 화면의 기본이다.
   */
  const sort = useTableSort(shownRows, {
    출하번호: (r) => r.shipNo,
    출하일: (r) => r.shipDate,
    거래처: (r) => r.partnerName,
  })
  const shown = sort.sorted

  async function saveEdit() {
    if (await entry.save()) { setEditing(null); load() }   // 원본: 말 없이 닫힌다
  }
  async function remove(ids: number[]) {
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 출하'))) return
    try { for (const id of ids) await api.delete(`/shipments/${id}`); setChecked(new Set()); setEditing(null); load() }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="출하조회" search={keyword} onSearchChange={setKeyword} onSearch={load} /*
        원본 출하조회의 버튼은 신규(F2)·진행상태변경·보내기·인쇄·바코드(품목)·전자결재·
        선택삭제·이력조회다. [신규(F2)] 자리가 비어 있었다 — 조회에서 "하나 더 넣자" 가 되면
        메뉴를 다시 뒤져야 했다. 우리 출하 등록은 출하지시서조회 화면이 겸한다.
      */
      newLabel="신규(F2)"
      onNew={() => navigate('/sales/shipment-entry')}
      actions={[
        /* 2026-10-30 클릭 대조: [Email] · [바코드(품목)] 알림, [진행상태변경] 은 고른 줄 없어도 메뉴, [이력조회] '출하 이력조회' 창. */
        { label: 'Email', onClick: () => void ecAlert(EMAIL_NOT_HERE) },
        { label: '진행상태변경', onClick: openStatusMenu },
        { label: '인쇄', selected: checked.size, onClick: () => { shown.filter((r) => checked.has(r.id)).forEach((r) => void printShipment(r, company)) } },
        { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE), selected: checked.size },
        { label: '선택삭제', selected: checked.size, onClick: () => void remove([...checked]) },
        { label: 'Excel' },
        { label: '이력조회', onClick: () => setMenuHistory(true) },
      ]}>
      {menuHistory && <SlipMenuHistoryModal menu="출하" statusLabel="확인" onClose={() => setMenuHistory(false)} />}

      {/* 원본 조건 차례: 기준일자 · 출하No. · 창고 · 프로젝트 · 거래처 · 품목 · 발송여부 */}
      {/* 기준일자는 조건 판 안 첫 줄이다 — 2회차 #12. 다른 현황 화면과 같이 빠른선택(금일·전월…)도 붙는다. */}
      <EcStatusPanel from={from} to={to} onPeriod={(r) => { setFrom(r.from); setTo(r.to) }} picks={INQUIRY_PICKS}>
        <EcCond label="출하No.">
          <input className="ec-input" value={shipNoCond} onChange={(e) => setShipNoCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        {/* 마스터를 고르는 조건은 직접 입력이 아니라 코드도움이다 — 다른 화면과 같은 규칙. */}
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseCond} onChange={setWarehouseCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond} items={pickers.projects} />
        </EcCond>
        {/* 원본 차례: [프로젝트] 다음, [거래처] 앞이다(사본 실측). */}
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
        {/* 원본 차례(실측): 품목 · 발송여부 · (오더관리번호) · 규격 · 담당자 · (거래처관리담당자
            · 연락처 · 주소) · 적요 · 작성자 · … 괄호 안은 아직 못 만든 것이다. */}
        {/* 원본 차례: 품목 · (발송여부는 탭) · <b>오더관리번호</b> · 규격 · 담당자 … */}
        <EcCond label="오더관리번호" pick>
          <CodePickerField label="오더관리번호" hideLabel width={140} emptyLabel="전체"
                           value={orderNoCond} onChange={setOrderNoCond}
                           items={[...new Set(rows.map((r) => r.salesOrderNo).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="규격" pick>
          <CodePickerField label="규격" hideLabel width={140} emptyLabel="전체"
                           value={specCond} onChange={setSpecCond}
                           items={[...new Set(rows.flatMap((r) => r.lines.map((l) => l.spec)).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={140} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond}
                           items={[...new Set(rows.map((r) => r.employeeName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [거래처관리담당자] — 그 거래처를 맡은 영업담당자. 위의 [담당자]와 다른 사람이다. */}
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={140} emptyLabel="전체"
                           value={pmgrCond} onChange={setPmgrCond}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [연락처]·[주소] — 배송지다. 응답에 오는데 이 화면이 안 받아 두고 있었다. */}
        <EcCond label="연락처">
          <input className="ec-input" value={contactCond} onChange={(e) => setContactCond(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="주소">
          <input className="ec-input" value={addressCond} onChange={(e) => setAddressCond(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="작성자" pick>
          <CodePickerField label="작성자" hideLabel width={140} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [최초작성일자]·[최종수정일시] — 이번에 응답에 실어 물을 수 있게 됐다. */}
        <EcCond label="최초작성일자">
          <EcDateRange from={{ className: "ec-input", value: madeFrom, onChange: (e) => setMadeFrom(e.target.value) }} to={{ className: "ec-input", value: madeTo, onChange: (e) => setMadeTo(e.target.value) }} />
        </EcCond>
        <EcCond label="최종수정일시">
          <EcDateRange from={{ className: "ec-input", value: editedFrom, onChange: (e) => setEditedFrom(e.target.value) }} to={{ className: "ec-input", value: editedTo, onChange: (e) => setEditedTo(e.target.value) }} />
        </EcCond>
        {/* 원본 [기타] — 이 화면에서는 체크 하나뿐이다. 없는 것을 지어내지 않는다. */}
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
      </EcStatusPanel>
      <div className="mb-[8px] text-[12.5px] text-ec-hint text-right">총 {shown.length}건</div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-tabs">
        {TABS.map((t) => <li key={t} className={`ec-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}{t === '전체' ? '*' : ''}</li>)}
      </ul>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[35px] text-center">
              <input type="checkbox" checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={() => setChecked(shown.every((r) => checked.has(r.id)) ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
            {/*
              <b>출하조회(E040226) 2026-09-09 원본 격자 실측</b> — 열 여섯:
              [일자-No. · <b>창고명</b> · 품목명(요약) · 수량합계 · 거래처명 · <b>인쇄</b>].
              (주소창 prgId 도 이 자리에서 다시 확인했다 — <b>E040226</b> 이 맞다.)
              고친 것: (1) 출하번호와 출하일을 <b>두 칸</b>으로 갈라 두었다 → [일자-No.] 한 칸,
              (2) <b>[창고명] 열이 없었다</b> — 응답이 진작 싣고 조건으로도 이미 거르고
              있었는데 표에만 안 찍고 있었다(또 '거를 수는 있는데 볼 수는 없는 열'),
              (3) 이름 셋 — [품목]→[품목명(요약)] · [출하수량]→[수량합계] ·
              [거래처]→[거래처명], 그리고 거래처는 원본 차례대로 수량 뒤로 옮겼다.
              <b>[인쇄]는 줄마다 두는 원본 열이다</b> — 화면 위 [인쇄] 하나로 갈음하고
              있었는데, 그건 "지금 보고 있는 목록" 을 찍는 버튼이라 <b>한 건을 집어
              찍을 수가 없었다.</b> 이번에 줄마다 달았다.
              2026-10-20 다시 잼(재고1 출하 바퀴): 원본 열은 ☐ · 일자-No. 141 · 창고명 127 · 품목명(요약) 380 ·
              수량합계 146('3.00') · 거래처명 127 · 인쇄 112 일곱뿐이고 <b>합계줄이 없다</b> — 우리가 더 두던
              [근거주문]·[출하금액]·[발송여부]·[담당] 열과 합계줄을 뺐다.
            */}
            <th className="cursor-pointer w-[141px] text-center" onClick={() => sort.toggle('출하번호')}>일자-No. {sort.mark('출하번호')}</th>
            <th className="w-[127px]">창고명</th><th className="w-[380px]">품목명(요약)</th>
            <th className="w-[146px] text-right">수량합계</th>
            <th className="cursor-pointer w-[127px]" onClick={() => sort.toggle('거래처')}>거래처명 {sort.mark('거래처')}</th>
            <th className="w-[112px] text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev); if (next.has(r.id)) next.delete(r.id); else next.add(r.id); return next
                })} />
              </td>
              {/* 원본은 일자와 번호를 한 칸에 적고, 누르면 '출하입력(수정)' 창이 뜬다. */}
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setEditing(r) }}>{dateNo(r.shipDate, r.shipNo)}</a></td>
              <td>{r.warehouseName ?? ''}</td>
              <td>{r.lines[0]?.itemName}{r.lines[0]?.spec ? ` [${r.lines[0].spec}]` : ''}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
              <td className="text-right">{qty2(r.totalQuantity)}</td>
              <td>{r.partnerName}</td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); void printShipment(r, company) }}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={editing != null} width={900} title="출하입력(수정)" onClose={() => setEditing(null)} error={error}>
        {entry.form}
        <div className="mt-[8px] flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={entry.busy} onClick={() => void saveEdit()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setEditing(null)}>닫기</button>
          <button type="button" className="ec-btn" onClick={() => editing && void remove([editing.id])}>삭제</button>
          <button type="button" className="ec-btn" onClick={() => setHistoryOpen(true)}>H</button>
        </div>
      </Modal>
      {historyOpen && editing && <SlipHistoryModal target="SHIPMENT" id={editing.id} head={slipHeadLabel(editing.shipDate, editing.shipNo)} onClose={() => setHistoryOpen(false)} />}
      {statusMenu && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setStatusMenu(null)} />
          <div className="ec-menu fixed" style={{ left: statusMenu.left, bottom: statusMenu.bottom }} role="menu" aria-label="진행상태변경">
            <div className="px-[10px] pt-[4px] text-ec-label">▾ 미확인</div>
            <button onClick={blockStatusChange}>미확인</button>
            <div className="px-[10px] pt-[4px] text-ec-label">▾ 확인</div>
            <button onClick={blockStatusChange}>확인</button>
          </div>
        </>
      )}
      <Modal open={blockedRows != null} title="알림" width={630} onClose={() => setBlockedRows(null)}>{blockedRows && (
        <div>
          <p className="m-0 leading-[18px]">아래의 경우 처리가 불가능합니다.<br />자세한 내용은 아래의 사항을 참고하시기 바랍니다.<br />아래 사항을 수정 후 다시 진행하시기 바랍니다.</p>
          <table className="w-full text-left mt-[9px]">
            <thead><tr><th>구분</th><th>메뉴</th><th>사유</th></tr></thead>
            <tbody>
              {blockedRows.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td className="whitespace-pre-line">{r[2]}</td></tr>)}
            </tbody>
          </table>
          <div className="mt-[9px]"><button type="button" className="ec-btn" onClick={() => setBlockedRows(null)}>닫기</button></div>
        </div>
      )}</Modal>
    </EcListShell>
  )
}

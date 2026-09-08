import { useEffect, useMemo, useState, Fragment } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'
import { useNavigate } from 'react-router-dom'
import { dateText } from '../../utils/dateText'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerManagers } from '../../utils/partnerManagers'

/**
 * 영업 > 출하조회 — 전표(출하) 단위 조회. 행 클릭 시 품목 상세 펼침.
 *
 * <p><b>화면코드가 우리끼리 어긋나 있다.</b> 이 줄은 사본을 따라 <b>E040226</b> 이라
 * 적고 있었고, 아래 조건을 실측한 주석은 <b>C000138</b> 이라 적었다. 둘 다 맞을 수는 없다.
 * 어느 쪽이 참인지는 원본을 열어 주소창의 <code>prgId=</code> 를 보면 바로 끝난다 —
 * 그때까지 <b>지우지 않고 둘 다 남겨 둔다.</b> 하나를 지우면 틀린 쪽이 살아남을 수 있다.
 * (같은 자리를 잰 다른 화면들은 C000120 출하지시서조회 · C000077 발주서조회 ·
 *  C000033 창고이동조회 · E040302 구매조회 로, C 와 E 가 섞여 있어 모양으로는 못 가른다.)
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
type ShipStatus = 'READY' | 'SHIPPED' | 'CANCELED'
const STATUS_COLOR: Record<ShipStatus, string> = { READY: '#b6791b', SHIPPED: '#1c7c3c', CANCELED: '#8a929c' }

/** 원본 조건 [규격]. 서버는 진작 보내는데 이 화면이 안 받아 두고 있었다. */
interface ShipLine { itemCode: string; itemName: string; spec: string | null; unit: string; quantity: number; unitPrice: number; amount: number }
interface Shipment {
  id: number; shipNo: string; partnerName: string; shipDate: string
  salesOrderNo: string | null
  /**
   * 창고·프로젝트는 <b>응답에 이미 오고 있었는데</b> 이 화면이 받아 두지 않았다 —
   * 원본 출하조회는 둘 다 조회 조건이다. 값이 오는데 못 거르고 있었던 셈이다.
   */
  warehouseName: string | null
  projectName: string | null
  /**
   * 출하 <b>담당자</b>. 목록의 [담당] 칸이 이제까지 <code>createdBy</code>(전표를 친 계정)를
   * 찍고 있었는데, 그건 <b>다른 사람</b>이다 — 출하지시서에 담당자를 따로 고르게 해 두고
   * 목록에서는 그 값을 안 보여 주고 있었다. 응답에는 실려 오고 있었다.
   */
  employeeName: string | null
  status: ShipStatus; statusName: string; totalQuantity: number; totalAmount: number
  /**
   * 배송지 연락처·주소. 원본 조건 [연락처]·[주소] 다. 여기에 '전표를 내보내는 기능이
   * 없어 못 만든다' 고 적어 두었는데 <b>틀렸다</b> — 출하지시서입력이 받아서 저장하는
   * 배송지고, 응답도 진작 싣고 있었다. 이 화면이 받아 두지 않았을 뿐이다.
   */
  contact: string | null; address: string | null
  remark: string | null; createdBy: string | null
  /** 원본 [최초작성일자]·[최종수정일시]. 이번에 응답에 실었다. */
  createdAt: string | null; updatedAt: string | null
  lines: ShipLine[]
}

// 이카운트 출하조회 '발송여부' 필터 = 우리 상태로 매핑.
const SEND_TABS = ['전체', '미발송', '발송', '취소'] as const
type SendTab = (typeof SEND_TABS)[number]
const TAB_STATUS: Record<Exclude<SendTab, '전체'>, ShipStatus> = { 미발송: 'READY', 발송: 'SHIPPED', 취소: 'CANCELED' }

const won = (n: number) => n.toLocaleString('ko-KR')

export default function ShipmentInquiryPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Shipment[]>([])
  const [keyword, setKeyword] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState<SendTab>('전체')
  const [shipNoCond, setShipNoCond] = useState('')
  const [warehouseCond, setWarehouseCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects'])
  const [openId, setOpenId] = useState<number | null>(null)
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
   * 2026-09-07 에 원본(C000138)을 열어 <b>접힌 줄까지 펼쳐</b> 조건을 전부 쟀다(스물넷).
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

  const shownRows = useMemo(() => rows
    .filter((r) => tab === '전체' || r.status === TAB_STATUS[tab])
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.shipNo.includes(keyword) || r.lines.some((l) => l.itemName.includes(keyword)))
    .filter((r) => !from || r.shipDate >= from)
    .filter((r) => !to || r.shipDate <= to)
    .filter((r) => !shipNoCond || r.shipNo.includes(shipNoCond))
    .filter((r) => !warehouseCond || (r.warehouseName ?? '').includes(warehouseCond))
    .filter((r) => !projectCond || (r.projectName ?? '').includes(projectCond))
    .filter((r) => !partnerCond || r.partnerName.includes(partnerCond))
    .filter((r) => !itemCond || r.lines.some((l) => l.itemName.includes(itemCond) || l.itemCode.includes(itemCond)))
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

  const tabCount = (t: SendTab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length
  const totals = useMemo(() => shown.reduce((a, r) => ({ qty: a.qty + r.totalQuantity, amount: a.amount + r.totalAmount }), { qty: 0, amount: 0 }), [shown])

  return (
    <EcListShell title="출하조회" search={keyword} onSearchChange={setKeyword} onSearch={load} /*
        원본 출하조회의 버튼은 신규(F2)·진행상태변경·보내기·인쇄·바코드(품목)·전자결재·
        선택삭제·이력조회다. [신규(F2)] 자리가 비어 있었다 — 조회에서 "하나 더 넣자" 가 되면
        메뉴를 다시 뒤져야 했다. 우리 출하 등록은 출하지시서조회 화면이 겸한다.
      */
      onNew={() => navigate('/sales/shipment-order')}
      actions={[{ label: '검색(F8)', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>기준일자</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <span style={{ marginLeft: 8, color: '#9aa1ab' }}>총 {shown.length}건 · 행을 클릭하면 품목 상세가 펼쳐집니다.</span>
      </div>

      {/* 원본 조건 차례: 기준일자 · 출하No. · 창고 · 프로젝트 · 거래처 · 품목 · 발송여부 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
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
          <input type="date" className="ec-input" value={madeFrom} onChange={(e) => setMadeFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={madeTo} onChange={(e) => setMadeTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="최종수정일시">
          <input type="date" className="ec-input" value={editedFrom} onChange={(e) => setEditedFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={editedTo} onChange={(e) => setEditedTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        {/* 원본 [기타] — 이 화면에서는 체크 하나뿐이다. 없는 것을 지어내지 않는다. */}
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/*
        상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다.
        원본은 이 줄에 <b>[발송여부]</b> 라는 이름표를 붙인다. 이름이 없으면 무엇을 고르는
        알약인지 화면만 보고는 알 수 없다.
      */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)', minWidth: 62 }}>발송여부</span>
      <div className="ec-pills">
        {SEND_TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t} ({tabCount(t)})
          </button>
        ))}
      </div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('출하번호')}>출하번호 {sort.mark('출하번호')}</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('출하일')}>출하일 {sort.mark('출하일')}</th><th style={{ width: 130 }}>근거주문</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처')}>거래처 {sort.mark('거래처')}</th><th>품목</th>
            <th style={{ textAlign: 'right' }}>출하수량</th><th style={{ textAlign: 'right' }}>출하금액</th>
            <th style={{ textAlign: 'center' }}>발송여부</th><th>담당</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <Fragment key={r.id}>
              <tr onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{openId === r.id ? '▾ ' : '▸ '}{r.shipNo}</td>
                <td>{dateText(r.shipDate)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: r.salesOrderNo ? 'var(--ec-blue-dark)' : '#b6bcc4' }}>{r.salesOrderNo ?? '직접등록'}</td>
                <td>{r.partnerName}</td>
                <td>{r.lines[0]?.itemName}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
                <td style={{ textAlign: 'right' }}>{won(r.totalQuantity)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.totalAmount)}</td>
                <td style={{ textAlign: 'center', color: STATUS_COLOR[r.status], fontWeight: 700 }}>{r.statusName}</td>
                <td>{r.employeeName ?? ''}</td>
              </tr>
              {openId === r.id && (
                <tr className="no-ec">
                  <td colSpan={10} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        <tr><th style={{ width: 34 }}></th><th>품목코드</th><th>품목명</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>금액</th></tr>
                      </thead>
                      <tbody>
                        {r.lines.map((l, li) => (
                          <tr key={li}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{li + 1}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.quantity)} {l.unit}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.unitPrice)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(l.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.remark && <div style={{ padding: '2px 10px 8px', fontSize: 12, color: '#5a626e' }}>비고: {r.remark}</div>}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={6} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
            <td style={{ textAlign: 'right' }}>{won(totals.qty)}</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.amount)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}

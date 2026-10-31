import { useEffect, useState } from 'react'
import { dateNo } from '../../../utils/dateNo'
import EcListShell, { slipListOptionMenu } from '../../../components/EcListShell'
import { api, extractErrorMessage } from '../../../api/client'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { EcCond } from '../../../components/EcStatusPanel'
import { useCondPickers } from '../../../utils/useCondPickers'
import { printDocuments } from '../../../utils/printDocument'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../../components/EcPeriodPicks'
import { useItemMgmt } from '../../../utils/itemMgmtItems'
import { ecAlert, ecConfirm, NO_SELECTION_MESSAGE } from '../../../components/EcDialog'
import { EcDateRange } from '../../../components/ui/EcDateInput'
import EcIcon from '../../../components/ui/EcIcon'
import ProductionResultPage, { TITLES } from './ProductionResultPage'
import SlipWindow from '../../../components/SlipWindow'

/**
 * 생산관리 > 생산입고조회 — 완제품 생산입고 내역 조회 (/api/productions 연동).
 *
 * 원본 열 실측(사본): 일자-No. · <b>생산된공장명</b> · <b>받는창고명</b> · 품목명[규격] ·
 * 수량 · 담당자명. 우리는 [생산된공장]과 [담당자]가 빠져 있어 붙인다 — 자재가 어느 공장에서
 * 빠졌는지 여기서 못 보면 공장별 재고가 왜 줄었는지 되짚을 자리가 없다.
 */
/** 원본 생산입고조회 탭. */
const STATUS_TABS = ['전체', '결재중', '미확인', '확인'] as const
const STATUS_OF: Record<string, string> = { 결재중: 'IN_APPROVAL', 미확인: 'UNCONFIRMED', 확인: 'CONFIRMED' }

/** 원본 [생산입고구분] 체크 — 생산입고 I · II · III 중 어느 화면으로 넣은 전표인가(2026-10-31 loginad). */
const ENTRY_KINDS = ['생산입고I', '생산입고II', '생산입고III'] as const
const KIND_TYPE: Record<string, 'I' | 'II' | 'III'> = { 생산입고I: 'I', 생산입고II: 'II', 생산입고III: 'III' }
/** 원본 조건 판 아래 줄의 기간 빠른선택 — 조회 묶음 끝에 [최근30일(+1개월)]. */
const PICKS = [...INQUIRY_PICKS, '최근30일(+1개월)'] as const

/**
 * 체크 여럿 — 원본 [생산입고구분] 전체 · 생산입고I · II · III.
 * [전체] 를 켜면 모두 켜지고 끄면 모두 꺼진다. 하나라도 꺼지면 [전체] 도 꺼진다.
 */
function CondChecks({ options, value, onChange }: {
  options: readonly string[]
  value: readonly string[]
  onChange: (v: string[]) => void
}) {
  const all = options.every((o) => value.includes(o))
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])
  return (
    <span className="inline-flex flex-wrap items-center gap-x-[10px]">
      <label className="inline-flex items-center gap-[4px]">
        <input type="checkbox" checked={all} onChange={() => onChange(all ? [] : [...options])} />전체
      </label>
      {options.map((o) => (
        <label key={o} className="inline-flex items-center gap-[4px]">
          <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />{o}
        </label>
      ))}
    </span>
  )
}

/** 생산입고를 넣은 화면별 주소. */
const ENTRY_PATH: Record<string, string> = {
  I: '/production/receipt-bom',
  II: '/production/receipt-manual',
  III: '/production/receipt-qr',
}

interface Row {
  id: number
  prodNo: string
  /** 넣은 화면(I·II·III). 번호를 누르면 그 화면으로 전표를 연다. */
  entryType: 'I' | 'II' | 'III'
  /** 진행상태 — 원본 탭 [결재중 · 미확인 · 확인]. */
  confirmStatus: 'UNCONFIRMED' | 'IN_APPROVAL' | 'CONFIRMED'
  /** 원본처럼 작업지시서 없이도 입고한다 — 없으면 null. */
  workOrderNo: string | null
  productCode: string
  productName: string
  productUnit: string
  warehouseId: number
  warehouseName: string
  fromWarehouseId: number | null
  fromWarehouseName: string | null
  /**
   * 만든 자리의 구분 — 창고 · 공장 · <b>외주</b>. 원본 [기타]의 [외주공장만] 이 이 값을 본다.
   * <code>Warehouse.kind</code> 가 진작 들고 있는데 응답이 안 실어 못 만들고 있던 값이다.
   */
  fromWarehouseKind: string | null
  /* 서버는 프로젝트명을 이미 보내고 있었다 — 화면이 안 받아 조건으로 쓸 수 없었다. */
  projectId: number | null
  projectName: string | null
  producedQty: number
  productionDate: string
  createdBy: string | null
  /** 원본 조건 [품목]·[규격]·[품목구분]·[품목그룹1] 이 보는 값. 서버는 진작 보낸다. */
  productId: number
  productSpec: string | null
  productCategoryName: string | null
  /** 원본 조건 [담당자]. id 만 온다 — 이름은 화면이 붙인다(production 은 hr 을 못 참조한다). */
  employeeId: number | null
  /** 원본 조건 [적요]. */
  note: string | null
  /** 원본 조건 [최초작성일자]·[최종작업일자], [기타]의 수정일자순(정렬). */
  createdAt: string | null
  updatedAt: string | null
}

/**
 * 원본 생산입고조회 격자의 마지막 열 <b>[인쇄]</b> — 그 한 건을 생산입고증으로 찍는다.
 * 금액 칸은 안 그린다(생산입고는 사내 이동이라 금액이 없다 — 0 으로 채우면 0원 거래로 읽힌다).
 */
/** 담당자는 전표의 사원이다 — 만든 계정(createdBy)이 아니다. 이름은 부르는 쪽이 붙여 준다. */
async function printOne(r: Row, employeeName: string) {
  await printDocuments([{
    title: '생산입고증',
    docNo: r.prodNo,
    docDate: r.productionDate,
    hideAmounts: true,
    hideParties: true,
    supplier: { label: '', name: '' },
    customer: { label: '', name: '' },
    extra: [
      { label: '생산된공장', value: r.fromWarehouseName ?? r.warehouseName },
      { label: '받는창고', value: r.warehouseName },
      { label: '작업지시서', value: r.workOrderNo ?? '' },
      { label: '담당자', value: employeeName },
    ],
    lines: [{
      itemCode: r.productCode, itemName: r.productName, unit: r.productUnit,
      quantity: r.producedQty, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
    }],
  }])
}

/*
 * 원본 생산입고조회는 <b>[최근30일(+1개월)]</b> 로 열린다(사본 실측 — 달 스핀박스가 06·08 셋).
 * 우리는 기간 칸이 <b>아예 없었다</b> — 입고가 쌓이면 목록만 길어졌다.
 */
const initP = periodOf('최근30일(+1개월)')!

export default function ReceiptInquiryPage() {
  /*
   * 원본은 [생산입고I] · 일자-No. 를 누르면 화면을 옮기지 않고 목록 위에 그 입력 창을 띄운다(2026-10-31 loginad).
   * entry 가 null 이면 창이 닫혀 있다. type 은 그 전표를 넣은 화면(I · II · III).
   */
  const [entry, setEntry] = useState<{ type: 'I' | 'II' | 'III'; editNo: string | null } | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 생산입고조회의 조건 차례는 <b>창고 · 프로젝트 · 품목</b> 이다(사본 실측).
   * 우리는 이름 한 칸뿐이라 창고로 좁힐 길이 없었다.
   */
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [warehouseCond, setWarehouseCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  /*
   * 2026-09-08 에 원본(E040408)을 열어 조건을 <b>전부</b> 쟀다 — <b>서른둘</b>이다.
   * 사본에는 넷뿐이었다(여덟 번째 같은 구멍). 기본 기간은 [최근30일(+1개월)] 이고,
   * [기타] 안에는 <b>수정일자순(정렬)</b>과 <b>외주공장만</b> 둘이 있다.
   */
  const [fromWhCond, setFromWhCond] = useState('')
  const [toWhCond, setToWhCond] = useState('')
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [noteCond, setNoteCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [entryCond, setEntryCond] = useState<string[]>([...ENTRY_KINDS])
  const [madeFrom, setMadeFrom] = useState('')
  const [madeTo, setMadeTo] = useState('')
  const [editedFrom, setEditedFrom] = useState('')
  const [editedTo, setEditedTo] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  /*
   * 원본 [기타]의 <b>[외주공장만]</b> — 기본은 꺼짐이다(2026-09-08 실측).
   * '창고 갈래를 응답이 안 싣는다' 는 이유로 못 만들고 있었는데, 그 갈래를 실었으니
   * 이제 만든다. <b>만든 자리(보내는창고)</b>가 외주인 줄만 남긴다 — 생산입고에서
   * 물건이 만들어진 곳이 보내는창고이고, 외주로 돌린 것을 보려는 체크이기 때문이다.
   */
  const [outsourcedOnly, setOutsourcedOnly] = useState(false)
  /*
   * 원본(loginad) 조건 판의 발송여부 · 오더관리번호 · 채무번호 · 최종수정자 · 입력경로 · 삭제구분은 우리 생산입고에 그 값이 없어
   * 칸을 두지 않는다(거르지 않는 칸은 두지 않는다 — qa/ui-check 1-q · 조건 예외 NO_FIELD_ON 에 이유).
   */
  /** 원본 조건 판의 접힌 줄(▾) — 펼치면 보내는창고 · 받는창고 · 품목구분 · 품목그룹1 이 나온다. */
  const [moreConds, setMoreConds] = useState(false)
  const mgmt = useItemMgmt()
  const pickers = useCondPickers(['warehouses', 'projects', 'items', 'employees'])
  /**
   * 담당자 이름. 서버가 못 붙여서(production 은 hr 을 못 참조) 화면이 붙인다.
   * 사원 후보의 value 는 <b>이름</b>이고 id 는 따로 있다 — value 를 id 와 견주어 [담당자명] 칸이 늘 비고
   * [담당자] 조건을 고르면 목록이 통째로 비었다.
   */
  const empName = (id: number | null) =>
    (id == null ? '' : (pickers.employees.find((e) => e.id === id)?.name ?? ''))

  async function load() {
    setLoading(true)
    setError('')
    try {
      /*
       * <b>고른 기간을 서버에도 보낸다.</b> 이 표는 실적을 <b>그 실적일로</b> 거른다
       * (아래 <code>r.productionDate &gt;= from</code>) — 서버에 같은 창을 주면 된다.
       */
      const period: Record<string, string> = {}
      if (from) period.from = from
      if (to) period.to = to
      const res = await api.get<Row[]>('/productions', { params: period })
      setRows([...res.data].sort((a, b) => (a.productionDate < b.productionDate ? 1 : a.productionDate > b.productionDate ? -1 : b.id - a.id)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /* 기간을 바꾸면 그 기간으로 다시 받는다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  /**
   * 원본은 목록 첫 칸에서 줄을 골라 [선택삭제] 한다(사본 실측: CHK_H 열).
   * 우리는 줄마다 지우거나 아예 못 지웠다 — 잘못 넣은 열 건을 치우려면 열 번 눌러야 했다.
   */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  /** 원본 탭 [전체 · 결재중 · 미확인 · 확인]. */
  const [statusTab, setStatusTab] = useState<(typeof STATUS_TABS)[number]>('전체')

  /**
   * 원본 [진행상태변경] — 고른 줄의 전표를 미확인 ↔ 확인. 확인한 전표는 확인취소를 먼저 해야 고치거나 지울 수 있다.
   * 결재중은 전자결재가 정한다.
   */
  async function changeStatus(status: 'CONFIRMED' | 'UNCONFIRMED') {
    const nos = [...new Set(shown.filter((x) => checked.has(x.id)).map((x) => x.prodNo))]
    if (nos.length === 0) { void ecAlert(NO_SELECTION_MESSAGE); return }
    setError('')
    try {
      const r = await api.post<{ changed: number }>('/productions/slips/status', { prodNos: nos, status })
      setChecked(new Set())
      await load()
      setError(r.data.changed === 0 ? '이미 그 진행상태입니다.' : '')
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function removeChecked() {
    const targets = shown.filter((x) => checked.has(x.id))
    if (targets.length === 0) { setError('지울 줄을 고르세요.'); return }
    if (!(await ecConfirm(`고른 ${targets.length}건을 삭제할까요? 생산으로 늘었던 완제품과 줄었던 자재가 되돌아갑니다.`))) return
    setError('')
    const results = await Promise.allSettled(targets.map((x) => api.delete(`/productions/${x.id}`)))
    const failed = results.filter((x) => x.status === 'rejected').length
    setChecked(new Set())
    await load()
    if (failed > 0) setError(`${targets.length - failed}건 삭제, ${failed}건 실패(참조 중이면 못 지운다).`)
  }

  const shown = rows.filter((r) => (statusTab === '전체' || STATUS_OF[statusTab] === r.confirmStatus)
    && (!keyword
    || r.productName.includes(keyword) || r.prodNo.includes(keyword) || (r.workOrderNo ?? '').includes(keyword))
    && (!warehouseCond || String(r.warehouseId) === warehouseCond
      || String(r.fromWarehouseId) === warehouseCond)
    && (!projectCond || String(r.projectId) === projectCond)
    && (!itemCond || String(r.productId) === itemCond)
    && (!from || r.productionDate >= from) && (!to || r.productionDate <= to)
    /* [보내는창고]·[받는창고] — 위 [창고]와 달리 한쪽만 본다. */
    && (!fromWhCond || String(r.fromWarehouseId) === fromWhCond)
    && (!toWhCond || String(r.warehouseId) === toWhCond)
    && (!categoryCond || (r.productCategoryName ?? '') === categoryCond)
    && (!itemGroupCond || mgmt.groupOf(r.productId) === itemGroupCond)
    && (!empCond || empName(r.employeeId).includes(empCond))
    && (!noteCond || (r.note ?? '').includes(noteCond))
    && (!specCond || (r.productSpec ?? '') === specCond)
    && (!authorCond || (r.createdBy ?? '') === authorCond)
    && (entryCond.length === 0 || entryCond.some((k) => KIND_TYPE[k] === (r.entryType ?? 'I')))
    && (!madeFrom || (r.createdAt ?? '').slice(0, 10) >= madeFrom)
    && (!madeTo || ((r.createdAt ?? '') !== '' && r.createdAt!.slice(0, 10) <= madeTo))
    && (!editedFrom || (r.updatedAt ?? '').slice(0, 10) >= editedFrom)
    && (!editedTo || ((r.updatedAt ?? '') !== '' && r.updatedAt!.slice(0, 10) <= editedTo))
    && (!outsourcedOnly || (r.fromWarehouseKind ?? '') === '외주'))
    /* 원본 [기타]의 수정일자순(정렬). */
    .sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') : 0))

  const allChecked = shown.length > 0 && shown.every((x) => checked.has(x.id))

  return (
    <EcListShell
      title="생산입고조회"
      optionMenu={slipListOptionMenu()}
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      /*
       * 원본 생산입고조회 아래 줄(2026-10-31 loginad): [생산입고I ▲(생산입고II · 생산입고III)] · Email · 진행상태변경▲ · 보내기 · 인쇄 ·
       * 바코드(품목) · 전자결재 · 선택삭제 · Excel · 이력조회. 원본의 신규는 생산입고 I(BOM기준소모) 창을 띄우고 단추 이름도 [생산입고I] 다.
       * [검색(F8)] 은 원본 아래 줄에 없다(조건 판 아래 줄에만 있다).
       */
      newLabel="생산입고I"
      onNew={() => setEntry({ type: 'I', editNo: null })}
      actions={[
        { label: '진행상태변경', menuOnly: true, selected: checked.size, menu: [
          { label: '미확인', onClick: () => void changeStatus('UNCONFIRMED') },
          { label: '확인', onClick: () => void changeStatus('CONFIRMED') },
        ] },
        { label: '인쇄' },
        { label: `선택삭제${checked.size ? ` (${checked.size})` : ''}`, onClick: removeChecked, selected: checked.size },
        { label: 'Excel' }]}
    >
      <div className="ec-pills mb-[8px]">
        {STATUS_TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${statusTab === t ? ' active' : ''}`} onClick={() => setStatusTab(t)}>{t}</button>
        ))}
      </div>
      {/*
        원본 조건 차례(2026-10-31 loginad): 기준일자 · 창고 · 프로젝트 · 품목 · 기타 · 발송여부 · 오더관리번호 · 담당자 · 생산입고구분 · 적요 ·
        규격 · 채무번호 · 최초작성자 · 최종수정자 · 최초작성일자 · 최종작업일자 · 입력경로 · 삭제구분 · 양식.
        보내는창고 · 받는창고 · 품목구분 · 품목그룹1 은 접힌 줄(▾)을 펼치면 나온다(2026-09-08 loginaa 실측 32칸).
      */}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseCond} onChange={setWarehouseCond} items={pickers.warehouses} />
        </EcCond>
        {moreConds && <>
          <EcCond label="보내는창고" pick>
            <CodePickerField label="보내는창고" hideLabel width={170} emptyLabel="전체"
                             value={fromWhCond} onChange={setFromWhCond} items={pickers.warehouses} />
          </EcCond>
          <EcCond label="받는창고" pick>
            <CodePickerField label="받는창고" hideLabel width={170} emptyLabel="전체"
                             value={toWhCond} onChange={setToWhCond} items={pickers.warehouses} />
          </EcCond>
        </>}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        {moreConds && <>
          <EcCond label="품목구분" pick>
            <CodePickerField label="품목구분" hideLabel width={150} emptyLabel="전체"
                             value={categoryCond} onChange={setCategoryCond}
                             items={[...new Set(rows.map((r) => r.productCategoryName).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="품목그룹1" pick>
            <CodePickerField label="품목그룹1" hideLabel width={150} emptyLabel="전체"
                             value={itemGroupCond} onChange={setItemGroupCond}
                             items={mgmt.groupOptions.map((n) => ({ value: n, name: n }))} />
          </EcCond>
        </>}
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
          <label className="text-[12.5px] flex items-center gap-[4px] ml-[10px]">
            <input type="checkbox" checked={outsourcedOnly}
                   onChange={(e) => setOutsourcedOnly(e.target.checked)} />
            외주공장만
          </label>
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond} items={pickers.employees} />
        </EcCond>
        {/* 원본 조건 [생산입고구분] — 생산입고 I·II·III 중 어느 화면으로 넣은 전표인가(체크 여럿). */}
        <EcCond label="생산입고구분">
          <CondChecks options={ENTRY_KINDS} value={entryCond} onChange={setEntryCond} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-[170px]" value={noteCond}
                 onChange={(e) => setNoteCond(e.target.value)} />
        </EcCond>
        <EcCond label="규격" pick>
          <CodePickerField label="규격" hideLabel width={150} emptyLabel="전체"
                           value={specCond} onChange={setSpecCond}
                           items={[...new Set(rows.map((r) => r.productSpec).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={150} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="최초작성일자">
          <EcDateRange from={{ className: "ec-input", value: madeFrom, onChange: (e) => setMadeFrom(e.target.value) }} to={{ className: "ec-input", value: madeTo, onChange: (e) => setMadeTo(e.target.value) }} />
        </EcCond>
        <EcCond label="최종작업일자">
          <EcDateRange from={{ className: "ec-input", value: editedFrom, onChange: (e) => setEditedFrom(e.target.value) }} to={{ className: "ec-input", value: editedTo, onChange: (e) => setEditedTo(e.target.value) }} />
        </EcCond>
        {/* 원본 [양식] — 적용양식 하나(담당자포함)를 보인다. 양식을 고르게 하지 않는다. */}
        <EcCond label="양식">
          <select className="ec-input w-[170px]" aria-label="적용양식" defaultValue="담당자포함">
            <option>담당자포함</option>
          </select>
        </EcCond>
        {/* 원본 접힌 줄(▾) — 펼치면 숨은 조건이 나오고, 다시 누르면 접힌다. */}
        <li className="full justify-center">
          <button type="button" className="ec-btn ec-btn-sm" aria-expanded={moreConds}
                  title={moreConds ? '조건 접기' : '조건 더 보기'} aria-label={moreConds ? '조건 접기' : '조건 더 보기'} onClick={() => setMoreConds((v) => !v)}>
            <EcIcon name={moreConds ? 'chevron-up' : 'chevron-down'} size={12} glyph={moreConds ? '▴' : '▾'} />
          </button>
        </li>
      </ul>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((x) => x.id)))} />
            </th>
            {/*
              원본 격자(2026-09-09 E040408 · 2026-10-31 loginad 실측):
              <b>일자-No. · 생산된공장명 · 받는창고명 · 품목명[규격] · 수량 · 담당자명 · 작업지시서 · 인쇄</b>.
              [단위] 열은 원본에 없다(2026-10-31) — 뺐다.
            */}
            <th className="text-center">일자-No.</th>
            <th>생산된공장명</th>
            <th>받는창고명</th>
            <th>품목명[규격]</th>
            <th className="text-right">수량</th>
            <th>담당자명</th>
            <th>작업지시서</th>
            {/* 원본 생산입고조회의 마지막 열 [인쇄]. */}
            <th className="w-[60px] text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                  return next
                })} />
              </td>
              {/* 원본처럼 번호를 누르면 그 전표를 넣은 화면(I·II·III)의 창을 목록 위에 띄워 고친다. */}
              <td className="text-center">
                <a href={`${ENTRY_PATH[r.entryType] ?? ENTRY_PATH.I}?no=${encodeURIComponent(r.prodNo)}`}
                   className="text-ec-blue cursor-pointer"
                   onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEntry({ type: r.entryType ?? 'I', editNo: r.prodNo }) }}>
                  {dateNo(r.productionDate, r.prodNo)}
                </a>
              </td>
              <td>{r.fromWarehouseName ?? r.warehouseName}</td>
              <td>{r.warehouseName}</td>
              {/* 원본 열 이름이 [품목명[규격]] 이라 규격을 대괄호에 붙인다. */}
              <td>{r.productName}{r.productSpec ? ` [${r.productSpec}]` : ''}</td>
              <td className="text-right font-semibold text-ec-navy">{r.producedQty.toLocaleString()}</td>
              {/* [담당자명] 은 전표의 담당자(사원)다 — 입력한 로그인 사용자가 아니다. */}
              <td>{empName(r.employeeId)}</td>
              <td>{r.workOrderNo ?? ''}</td>
              <td className="text-center">
                <button onClick={() => printOne(r, empName(r.employeeId))} style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entry && (
        <SlipWindow
          title={TITLES[entry.type] + (entry.editNo ? '(수정)' : '')}
          popout={`${ENTRY_PATH[entry.type]}${entry.editNo ? `?no=${encodeURIComponent(entry.editNo)}` : ''}`}
          onClose={() => setEntry(null)}
        >
          <ProductionResultPage type={entry.type} popup={{ editNo: entry.editNo, onClose: (changed) => { setEntry(null); if (changed) void load() } }} />
        </SlipWindow>
      )}
    </EcListShell>
  )
}

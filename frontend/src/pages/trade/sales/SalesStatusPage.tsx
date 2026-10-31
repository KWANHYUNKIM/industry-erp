import { useRef, useEffect, useMemo, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import { useTableSort } from '../../../utils/useTableSort'
import { periodOf, STATUS_PICKS, comparePeriodOf, fetchWindow, type ComparePeriod } from '../../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../../components/EcStatusPanel'
import EcBarChart from '../../../components/EcBarChart'
import { EcReportHead, reportPeriod } from '../../../components/EcReportFrame'
import { api, extractErrorMessage } from '../../../api/client'
import { dateNo } from '../../../utils/dateNo'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { GROUP_KEYS, aggregate, type GroupKey } from '../../../utils/statusAggregate'
import type { Item, Partner, SalesDoc, Warehouse } from '../../../types/api'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { partnerCodeItems } from '../../../utils/codeItems'
import { usePartnerManagers } from '../../../utils/partnerManagers'
import { condStr, type ReportEmbedProps } from '../../../utils/reportEmbed'

/** 영업 > 판매현황 — 판매 전표를 품목라인 단위로 펼친 실제 매출 내역 (/api/sales 연동) */
/*
 * 원본 [구분]은 <b>내역·집계 둘</b>이다(대조표 실측). [라인별]은 우리가 더 둔 갈래였는데,
 * 원본 [내역]이 이미 줄 단위이고 <b>월 소계까지 끼운다</b>(2026-09-09 실측). 우리 [내역]에
 * 그 둘을 다 넣으면 [라인별]과 같은 표가 되므로 갈래를 없앤다 - 여섯 화면째 같은 정리다.
 */
/*
 * 2026-10-20 loginaa 실측: 맨 위 줄은 [메뉴] ◉현황 ○집계 이고, 그 아래 [구분] 줄에 '라인별 ▾'(일별 · 월별 · 라인별 · 전표별 ·
 * 품목별 · 전표별품목별 · 거래처별 · 담당자별)과 비교기간 라디오가 같이 있다. 우리는 '내역' 이라 불렀다.
 */
type Mode = '현황' | '집계'
const MODES = ['현황', '집계'] as const
/** 원본 [구분] 드롭다운(2026-10-20 실측 · plans 재고1:82) — 현황 메뉴에서 줄을 무엇으로 묶어 보일지. */
const LINE_KINDS = ['일별', '월별', '라인별', '전표별', '품목별', '전표별품목별', '거래처별', '담당자별'] as const
type LineKind = (typeof LINE_KINDS)[number]

interface Row {
  key: string
  date: string
  docNo: string
  partner: string
  itemName: string
  qty: number
  unitPrice: number
  supply: number
  vat: number
  // 원본 조건이 거르는 값들. 화면이 이미 받아 온 전표에서 뽑아 둔다(추가 요청 없음).
  partnerId: number
  itemId: number
  warehouseId: number
  warehouseName: string
  projectName: string | null
  lotNo: string | null
  taxable: boolean
  /** 원본 [거래구분] — 일반 · 반품. 반품 전표는 수량·금액이 음수다. */
  returnSlip: boolean
  employeeName: string | null
  confirmStatus: string
  /*
   * 2026-09-08 에 원본(E040207)의 <b>접힌 줄을 펼쳐</b> 조건을 전부 쟀다 — 스물일곱이다
   * (사본은 열넷). 아래 여섯은 그때 드러난 조건이 보는 값이고, 전부 응답에 진작 오던 것이다.
   */
  spec: string | null
  remark: string | null
  extraCost: number | null
  createdBy: string | null
  sourceDocNo: string | null
  /** 판매입력 II 로 만든 전표인가 — 원본 숨은 조건 [판매구분] 판매 · 판매 II. */
  inputII: boolean
}

/** {@code embed} — 기안서 '전표 출력물' 창이 이 화면을 띄울 때(utils/reportEmbed). 메뉴로 열면 없다. */
export default function SalesStatusPage({ embed }: { embed?: ReportEmbedProps } = {}) {
  const c0 = embed?.conditions
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState(() => condStr(c0, 'keyword', ''))
  /*
   * 기준일자. 원본 판매현황의 **핵심 조건**인데 우리는 아예 없어서 전 기간을 통째로 뿌리고 있었다.
   * 전표가 쌓이면 못 쓴다. 기본은 원본과 같이 '금월(~오늘)'.
   */
  /*
   * 원본 판매현황의 기본 기간은 <b>[전월+금월]</b> 이다(사본 조건 판에 그 버튼이 눌려 있다).
   * 우리는 금월(~오늘) 로 열어서, 같은 화면인데 <b>처음 보이는 숫자가 달랐다</b> —
   * 지난달에 판 것이 안 보이니 "왜 이것밖에 안 되지" 가 되고, 원본과 대조할 때마다
   * 기간부터 맞춰야 했다.
   */
  const [from, setFrom] = useState(() => condStr(c0, 'from', periodOf('전월+금월')!.from))
  // 끝은 오늘이다 — 원본 머리 '2026/09/01 ~ 2026/10/22'(2026-10-22 실측, 달 끝 10/31 이 아니다).
  const [to, setTo] = useState(() => condStr(c0, 'to', periodOf('금일')!.to))
  /*
   * 원본 판매현황의 나머지 조건. 우리 데이터로 실제 거를 수 있는 것만 둔다 —
   * 값이 없는 조건칸을 만드는 건 5장 레시피가 금지한다.
   *   거르는 것 : 거래처 · 품목 · 창고 · 프로젝트 · 시리얼/로트 · 관리항목 · 거래유형(과세/면세)
   *   못 거르는 것: 내·외자구분 · 거래구분(일반/반품) — 우리 모델에 그 개념이 없다.
   * 시리얼/로트는 반복 1(V126 계열)에서, 관리항목은 반복 3(V127)에서 만든 것이 여기서 쓰인다.
   */
  const [partnerId, setPartnerId] = useState(() => condStr(c0, 'partnerId', ''))
  const [itemId, setItemId] = useState(() => condStr(c0, 'itemId', ''))
  const [warehouse, setWarehouse] = useState(() => condStr(c0, 'warehouse', ''))
  const [project, setProject] = useState(() => condStr(c0, 'project', ''))
  const [lotNo, setLotNo] = useState(() => condStr(c0, 'lotNo', ''))
  const [taxType, setTaxType] = useState<'전체' | '과세' | '면세'>(() => condStr(c0, 'taxType', '전체') as '전체' | '과세' | '면세')
  /** 원본 판매현황 조건의 [거래구분] — 전체 · 일반 · 반품. */
  const [tradeKind, setTradeKind] = useState<'전체' | '일반' | '반품'>(() => condStr(c0, 'tradeKind', '전체') as '전체' | '일반' | '반품')
  /*
   * 원본 판매현황(E040207)의 <b>접힌 줄</b>을 펼쳐 드러난 조건들. 사본에는 열넷이라
   * 적혀 있었는데 원본은 <b>스물일곱</b>이다 — '현황 화면은 다시 안 재도 된다' 고
   * 적어 두었던 것이 틀렸다(거래처별채권 한 화면만 보고 짐작한 말이었다).
   */
  const [orderNoCond, setOrderNoCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [pmgrCond, setPmgrCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [qtyFrom, setQtyFrom] = useState('')
  const [qtyTo, setQtyTo] = useState('')
  const [priceFrom, setPriceFrom] = useState('')
  const [priceTo, setPriceTo] = useState('')
  const [supplyFrom, setSupplyFrom] = useState('')
  const [supplyTo, setSupplyTo] = useState('')
  const [vatFrom, setVatFrom] = useState('')
  const [vatTo, setVatTo] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const pmgr = usePartnerManagers()
  /*
   * 원본은 상단 [현황|집계] 로 모드를 가르고, 집계 모드에서는 `집계조건1/2` 로 **두 단계 그룹화**를 한다.
   * 우리는 현황(라인 목록)만 있었다.
   */
  /*
   * 원본 판매현황의 [구분] 은 <b>내역 · 집계 · 라인별</b> 세 가지다(원본 사본 실측).
   * 우리는 '현황' 하나뿐이었는데 그게 사실 원본의 '라인별'(전표 라인마다 한 줄)이었다.
   * 없던 것은 '내역' — 전표 하나를 한 줄로 접어 보여 주는 쪽이다. 원본 판매조회 격자가
   * 그 모습을 보여 준다: 일자-No. · 거래처명 · 품목명(요약) · 금액합계 · 창고명.
   */
  const [mode, setMode] = useState<Mode>('현황')
  // 출력물 창([자동갱신])이 넘긴 메뉴 — 처음 값은 위 글자 그대로 둔다(ui-check 가 기본 모드를 읽는다).
  useEffect(() => { if (c0?.mode === '집계') setMode('집계') }, [c0])
  const [lineKind, setLineKind] = useState<LineKind>(() => condStr(c0, 'lineKind', '라인별') as LineKind)
  /** 원본은 [거래구분] 아래 조건을 회색 띠(10.8px) 밑에 접어 둔다 — 띠를 누르면 펼친다(2026-10-20 실측). */
  const [more, setMore] = useState(false)
  /** 원본 숨은 조건 [진행상태] — 전체 · 결재중 · 미확인 · 확인. 판매 confirmStatus(IN_APPROVAL · UNCONFIRMED · CONFIRMED)로 거른다. */
  const [progress, setProgress] = useState<'전체' | '결재중' | '미확인' | '확인'>('전체')
  /** 원본 [내.외자구분] 전체 · 내자 · 외자(2026-10-22 실측). 우리 판매는 통화가 없어 모두 내자다. */
  const [domestic, setDomestic] = useState<'전체' | '내자' | '외자'>('전체')
  /** 원본 숨은 조건 [판매구분] 전체 · 판매 · 판매 II(2026-10-22 실측). */
  const [salesKind, setSalesKind] = useState<'전체' | '판매' | '판매 II'>('전체')
  const [vatPriceFrom, setVatPriceFrom] = useState('')
  const [vatPriceTo, setVatPriceTo] = useState('')
  const [view, setView] = useState<'표' | '그래프'>('표')
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  const [group1, setGroup1] = useState<GroupKey | ''>('품목별')
  const [group2, setGroup2] = useState<GroupKey | ''>('')

  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SalesDoc[]>('/sales', { params: fetchWindow(from, to, compare) })
      const flat: Row[] = []
      for (const d of res.data) {
        d.lines.forEach((l, idx) => flat.push({
          key: `${d.id}-${idx}`,
          date: d.saleDate,
          docNo: d.docNo,
          partner: d.partnerName,
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          supply: l.supplyAmount,
          vat: l.vatAmount,
          partnerId: d.partnerId ?? 0,
          itemId: l.itemId,
          warehouseId: d.warehouseId,
          warehouseName: d.warehouseName,
          projectName: d.projectName,
          lotNo: l.lotNo,
          // 전표가 과세 여부를 들고 있다. 부가세 > 0 으로 되짚으면 반올림으로 0 이 된
          // 과세 전표가 면세로 섞인다.
          taxable: d.taxable,
          returnSlip: d.returnSlip,
          employeeName: d.employeeName,
          confirmStatus: d.confirmStatus,
          spec: l.spec,
          remark: d.remark,
          extraCost: l.extraCost,
          createdBy: d.createdBy,
          sourceDocNo: l.sourceDocNo,
          inputII: !!d.inputII || Number(d.discountSupply ?? 0) + Number(d.discountVat ?? 0) !== 0,
        }))
      }
      // 최신 일자 우선
      flat.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /*
   * <b>기간을 서버에 보낸다.</b> 예전에는 조건 판에 [기간]을 물어 놓고 서버에는 아무것도
   * 안 보내, 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() }, [from, to, compare])
  /* 출력물 창 — 조건이 바뀔 때마다 알린다([자동갱신] 이 이 조건을 저장한다). */
  const onConditions = embed?.onConditions
  useEffect(() => {
    onConditions?.({ from, to, partnerId, itemId, warehouse, project, lotNo, taxType, tradeKind, keyword, mode, lineKind })
  }, [onConditions, from, to, partnerId, itemId, warehouse, project, lotNo, taxType, tradeKind, keyword, mode, lineKind])

  useEffect(() => {
    // 조건에 쓸 마스터. 못 받아도 화면은 뜬다 — 조건만 비어 보인다.
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Warehouse[]>('/warehouses').then((r) => setWarehouses(r.data)).catch(() => {})
  }, [])

  /** 품목의 관리항목은 품목 마스터에서 파생한다(전표 라인이 들고 있지 않다 — 원본도 그렇다). */
  const mgmtOf = (id: number) => items.find((i) => i.id === id)?.managementItemName ?? ''
  const projectOptions = [...new Set(rows.map((r) => r.projectName).filter(Boolean))] as string[]

  const shown = rows
    .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
    /* 이름은 겹칠 수 있다 — id 로 거른다(QA 9회차). */
    .filter((r) => !partnerId || String(r.partnerId) === partnerId)
    .filter((r) => !itemId || String(r.itemId) === itemId)
    .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
    .filter((r) => !project || r.projectName === project)
    .filter((r) => !lotNo || (r.lotNo ?? '').includes(lotNo))
    .filter((r) => taxType === '전체' || (taxType === '과세' ? r.taxable : !r.taxable))
    .filter((r) => tradeKind === '전체' || (tradeKind === '반품' ? r.returnSlip : !r.returnSlip))
    .filter((r) => !orderNoCond || (r.sourceDocNo ?? '') === orderNoCond)
    .filter((r) => !empCond || (r.employeeName ?? '') === empCond)
    .filter((r) => !pmgrCond || pmgr.managerOfName(r.partner) === pmgrCond)
    .filter((r) => !specCond || (r.spec ?? '') === specCond)
    .filter((r) => !qtyFrom || r.qty >= Number(qtyFrom))
    .filter((r) => !qtyTo || r.qty <= Number(qtyTo))
    .filter((r) => !priceFrom || r.unitPrice >= Number(priceFrom))
    .filter((r) => !priceTo || r.unitPrice <= Number(priceTo))
    .filter((r) => !supplyFrom || r.supply >= Number(supplyFrom))
    .filter((r) => !supplyTo || r.supply <= Number(supplyTo))
    .filter((r) => !vatFrom || r.vat >= Number(vatFrom))
    .filter((r) => !vatTo || r.vat <= Number(vatTo))
    .filter(() => domestic !== '외자')
    .filter((r) => salesKind === '전체' || (salesKind === '판매 II') === r.inputII)
    // 원본 [단가(vat포함)] — 과세 줄은 단가 × 1.1.
    .filter((r) => !vatPriceFrom || r.unitPrice * (r.taxable ? 1.1 : 1) >= Number(vatPriceFrom))
    .filter((r) => !vatPriceTo || r.unitPrice * (r.taxable ? 1.1 : 1) <= Number(vatPriceTo))
    .filter((r) => progress === '전체' || r.confirmStatus === ({ 결재중: 'IN_APPROVAL', 미확인: 'UNCONFIRMED', 확인: 'CONFIRMED' } as const)[progress])
    .filter((r) => !authorCond || (r.createdBy ?? '') === authorCond)
    .filter((r) => !keyword || r.partner.includes(keyword) || r.itemName.includes(keyword))
  /** 집계는 판매·구매가 같은 규칙을 쓰므로 `utils/statusAggregate` 에 모아 두고 여기서 부른다. */
  const grouped = useMemo(
    () => (mode !== '집계' ? [] : aggregate(
      shown.map((r) => ({ ...r, managementItemName: mgmtOf(r.itemId) || null })),
      group1,
      group2,
    )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, mode, group1, group2, items],
  )

  /*
   * <b>[내역]은 전표가 아니라 줄이다.</b> 2026-09-09 에 원본(E040207)의 격자를 처음 재 보니
   * 같은 [일자-No.] 가 품목 수만큼 되풀이되고, 품목 칸에 <b>규격이 대괄호로</b> 붙어 있었다
   * (AQD 펌프 [PA-75] · 에어벤트 밸브 [1/2"] …). 우리는 전표 하나를 한 줄로 접고
   * 품목을 "첫 품목 외 N건" 으로 줄여 두어, <b>무엇을 팔았는지가 화면에서 사라졌다.</b>
   * 접는 방식은 <b>판매조회(E040206)</b> 의 [품목명(요약)] 칸을 보고 옮긴 것인데,
   * 그건 다른 화면이다 — 여기서는 줄을 그대로 편다(<code>shown</code> 이 이미 줄 단위다).
   */

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ supply: s.supply + r.supply, vat: s.vat + r.vat }),
    { supply: 0, vat: 0 },
  ), [shown])

  /*
   * 원본 [데이터 보기형식] · [그래프로 보기]. 지금 보고 있는 [구분]을 따라 그린다.
   * 금액(공급가액)으로 그린다 — 이 화면에서 크기를 비교하는 값이 그것이다.
   */
  const chartRows = useMemo(() => {
    if (mode === '집계') {
      return grouped.map((g) => ({
        label: g.g2 ? `${g.g1} / ${g.g2}` : g.g1, value: g.supply,
      }))
    }
    return shown.map((r) => ({ label: `${r.itemName}`, value: r.supply }))
  }, [mode, grouped, shown])


  /**
   * [라인별] 을 원본 모양으로 — 줄 사이에 <b>월별 소계</b>를 끼우고 끝에 총합계를 둔다.
   *
   * <p>원본 판매현황의 결과는 일자-No. · 품목명(규격) · 수량 · 단가 · 공급가액 · 부가세 ·
   * <b>합계</b> · 거래처명 이고, 월이 바뀌는 자리마다 '2026/06 계' 가 들어간 뒤
   * 맨 끝에 '총합계' 가 온다. 우리는 [합계] 열도 소계도 없어서 "이번 달 얼마 팔았나" 를
   * 눈으로 세야 했다. 구매현황과 같은 모양이라 같은 방식으로 맞춘다.
   *
   * <p>소계를 화면에서 따로 계산하지 않고 목록을 만들면서 같이 넣는다 —
   * 두 벌로 세면 한쪽만 조건이 바뀌었을 때 소계와 줄이 어긋난다.
   */
  /*
   * [일자] 머리에 ▼ 를 그려 놓고 <b>눌러도 아무 일이 없었다.</b> 이 표는 실은 늘
   * 일자 오름차순으로 세워져 있었다 — 표시가 '고를 수 있다' 고 말하는데 고를 수가 없었다.
   *
   * <p>이 표는 달이 바뀌는 자리에 <b>월 소계 줄을 끼워 넣는다.</b> 그래서 정렬을
   * <b>풀 수는 없다</b> — 날짜로 묶여 있지 않으면 소계가 엉킨다. 오름/내림만 오간다.
   */
  const sort = useTableSort(shown, { 일자: (r) => r.date }, { key: '일자', dir: 'asc' })

  /*
   * 원본 [구분] 여덟 갈래(2026-10-21 loginaa 실측)는 <b>모두 같은 8열</b>(일자-No. · 거래처명 · 품목명(규격) · 수량 ·
   * 단가 · 공급가액 · 부가세 · 합계)에 'YYYY/MM 계' · 총합계를 끼운다 — 묶는 키만 다르다.
   *   일별 = 날짜 · 월별 = 월 · 라인별 = 줄 · 전표별 = 전표 · 품목별 = 월 × 품목 · 전표별품목별 = 전표 × 품목 ·
   *   거래처별 = 월 × 거래처 · 담당자별 = 월 × 담당자.
   * 묶인 줄은 <b>첫 줄</b>의 일자-No. · 거래처명 · 품목명을 찍고(09/16 일별 '-8' = 그날 첫 전표), 수량 · 공급가액 · 부가세는 더하고,
   * 단가는 줄 단가의 <b>평균</b>(09/10 코카 · 사이다 · … 15 → 3,500, 담당자별 30,000 · 88,000 → 59,000)이다.
   * 월 계 · 총합계의 단가는 보이는 줄 단가를 더한다(일별 총합계 8,104,424 ≠ 라인별 24,071,400).
   * 차례는 일자순으로 처음 나온 자리(품목별 09/03 스킨 · 로션 · 09/04 자문료 …).
   */
  const lineRows = useMemo(() => {
    type Line = typeof shown[number]
    type Out =
      | { kind: 'line'; key: string; r: Line }
      | { kind: 'subtotal'; key: string; month: string; qty: number; price: number; supply: number; vat: number }
    const itemOf = (r: Line) => r.itemName + (r.spec ? ` [${r.spec}]` : '')
    const keyOf = (r: Line, ym: string): string => {
      switch (lineKind) {
        case '일별': return r.date
        case '월별': return ym
        case '라인별': return r.key
        case '전표별': return dateNo(r.date, r.docNo)
        case '품목별': return `${ym}|${r.itemId}|${itemOf(r)}`
        case '전표별품목별': return `${dateNo(r.date, r.docNo)}|${r.itemId}|${itemOf(r)}`
        case '거래처별': return `${ym}|${r.partner}`
        default: return `${ym}|${r.employeeName ?? ''}`
      }
    }
    /* 달마다 묶음을 처음 나온 차례로 모은다 — 월 계는 그 달 묶음 뒤에 온다. */
    const months: { month: string; groups: Map<string, { first: Line; n: number; qty: number; price: number; supply: number; vat: number }> }[] = []
    for (const r of sort.sorted) {
      const ym = r.date.slice(0, 7).replace('-', '/')
      let m = months[months.length - 1]
      if (!m || m.month !== ym) { m = { month: ym, groups: new Map() }; months.push(m) }
      const k = keyOf(r, ym)
      const g = m.groups.get(k) ?? { first: r, n: 0, qty: 0, price: 0, supply: 0, vat: 0 }
      g.n += 1; g.qty += r.qty; g.price += r.unitPrice; g.supply += r.supply; g.vat += r.vat
      m.groups.set(k, g)
    }
    const out: Out[] = []
    for (const m of months) {
      let qty = 0, price = 0, supply = 0, vat = 0
      for (const [k, g] of m.groups) {
        const unitPrice = Math.round(g.price / g.n)
        out.push({ kind: 'line', key: `${m.month}|${k}`, r: { ...g.first, qty: g.qty, unitPrice, supply: g.supply, vat: g.vat } })
        /* 원본 소계줄은 <b>단가 칸도 더해 찍는다</b>(2026-09-09 실측) - 우리도 그대로 둔다. */
        qty += g.qty; price += unitPrice; supply += g.supply; vat += g.vat
      }
      out.push({ kind: 'subtotal', key: `sub-${m.month}`, month: m.month, qty, price, supply, vat })
    }
    return out
  }, [sort.sorted, lineKind])

  /**
   * 비교기간 — 같은 조건을 같은 길이의 앞 구간에 걸어 다시 합친다.
   * 기간만 바꾸고 나머지 조건은 그대로여야 견주는 의미가 있다.
   */
  const reset = () => {
    // [다시 작성]은 화면을 열었을 때로 되돌린다 — 다른 기간으로 되돌리면 그건 초기화가 아니다.
    const m = periodOf('전월+금월')!
    setFrom(m.from); setTo(periodOf('금일')!.to)
    setMode('현황'); setCompare('사용안함'); setProgress('전체')
    setPartnerId(''); setItemId(''); setWarehouse(''); setProject('')
    setLotNo(''); setTaxType('전체'); setTradeKind('전체'); setKeyword('')
    /* 접힌 줄을 펼쳐 드러난 조건들도 같이 되돌린다 — 안 되돌리면 걸어 둔 채 남는다. */
    setOrderNoCond(''); setEmpCond(''); setPmgrCond(''); setSpecCond('')
    setQtyFrom(''); setQtyTo(''); setPriceFrom(''); setPriceTo('')
    setSupplyFrom(''); setSupplyTo(''); setVatFrom(''); setVatTo('')
    setAuthorCond(''); setDomestic('전체'); setSalesKind('전체'); setVatPriceFrom(''); setVatPriceTo('')
    // 집계조건도 조건이다. 안 되돌리면 '거래처별'로 바꿔 둔 채 다시 작성해도 그대로 남는다.
    setGroup1('품목별'); setGroup2('')
  }

  const prevRange = comparePeriodOf(from, to, compare)
  const prevTotals = useMemo(() => {
    if (!prevRange) return null
    return rows
      .filter((r) => r.date >= prevRange.from && r.date <= prevRange.to)
      .filter((r) => !partnerId || String(r.partnerId) === partnerId)
      .filter((r) => !itemId || String(r.itemId) === itemId)
      .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
      .filter((r) => !project || r.projectName === project)
      .filter((r) => !lotNo || (r.lotNo ?? '').includes(lotNo))
        .filter((r) => taxType === '전체' || (taxType === '과세' ? r.taxable : !r.taxable))
      .filter((r) => tradeKind === '전체' || (tradeKind === '반품' ? r.returnSlip : !r.returnSlip))
      .filter((r) => !keyword || r.partner.includes(keyword) || r.itemName.includes(keyword))
      .reduce((s2, r) => ({ supply: s2.supply + r.supply, vat: s2.vat + r.vat }), { supply: 0, vat: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, prevRange, partnerId, itemId, warehouse, project, lotNo, taxType, tradeKind, keyword, items])

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '판매현황 집계', [group1, group2, grouped.length])

  return (
    <EcListShell
      title="판매현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel(화면)' },
        // 원본 결과 아래 [Email](2026-10-22) — 메일 보내기는 받쳐 줄 것이 없어 흐리게.
        { label: 'Email', disabled: true },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/*
        조건 판은 현황 화면들이 공통으로 쓰므로 EcStatusPanel 로 뺐다.
        [메뉴 현황|집계] · [비교기간] · [기준일자]+빠른선택이 그 안에 있고, 아래는 이 화면만의 조건이다.
        코드도움으로 고르는 조건은 `pick` 을 준다 — 원본이 그 라벨만 파랗게 쓴다.
      */}
      <EcStatusPanel
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        modeLabel="메뉴" compareLabel="구분" dateLabel="일자"
        view={view} onViewChange={setView}
        compare={compare} onCompareChange={setCompare}
        modeExtra={mode === '현황' ? (
          <label className="inline-flex items-center gap-[6px]">
            <select className="ec-input w-[130px]" aria-label="구분" value={lineKind}
                    onChange={(e) => setLineKind(e.target.value as LineKind)}>
              {LINE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        ) : undefined}
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
      >
        {mode === '집계' && (
          <EcCond label="집계조건">
            <select className="ec-input" value={group1} onChange={(e) => setGroup1(e.target.value as GroupKey)} style={{ width: 150 }}>
              {GROUP_KEYS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="ec-input" value={group2} onChange={(e) => setGroup2(e.target.value as GroupKey | '')} style={{ width: 150 }}>
              <option value="">(2차 없음)</option>
              {GROUP_KEYS.filter((g) => g !== group1).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </EcCond>
        )}
        {/*
          원본 판매현황 조건 차례 실측(사본): 구분 · 기준일자 · <b>거래유형 · 내.외자구분 ·
          창고 · 프로젝트 · 관리항목 · 거래처 · 품목 · 시리얼/로트No. · 거래구분</b>.
          우리는 거래처·품목을 앞에 두고 거래유형을 뒤로 보내 두었다.
        */}
        {/* 원본 [거래유형] 은 코드도움 칸이다(2026-10-20 실측) — 우리 값은 과세 · 면세 둘. 비우면 전체. */}
        <EcCond label="거래유형" pick>
          <CodePickerField label="거래유형" hideLabel width={220} emptyLabel="전체"
                           value={taxType === '전체' ? '' : taxType}
                           onChange={(v) => setTaxType((v || '전체') as '전체' | '과세' | '면세')}
                           items={[{ value: '과세', name: '과세' }, { value: '면세', name: '면세' }]} />
        </EcCond>
        <EcCond label="내.외자구분">
          {(['전체', '내자', '외자'] as const).map((t) => (
            <button key={t} type="button" className={`ec-btn ec-btn-sm${domestic === t ? ' ec-btn-primary' : ''}`}
                    onClick={() => setDomestic(t)}>{t}</button>
          ))}
        </EcCond>
        <EcCond label="출하창고" pick>
          <CodePickerField
            label="창고" hideLabel width={220} emptyLabel="전체"
            value={warehouse} onChange={setWarehouse}
            items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))}
          />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={projectOptions.map((p) => ({ value: p, name: p }))} />
        </EcCond>
        {/*
          <b>[관리항목]은 원본 판매현황에 없다.</b> 2026-09-08 에 접힌 줄까지 펼쳐
          스물일곱을 다 재었는데 그 안에 없었다 — 사본에만 적혀 있었다. 판매조회에서
          겪은 것과 같다(견적서조회·출하조회에는 있고 판매 쪽에는 없다).
          원본에 없는 것을 두지 않는다.
        */}
        <EcCond label="거래처" pick>
          <CodePickerField
            label="거래처" hideLabel width={220} emptyLabel="전체"
            value={partnerId} onChange={setPartnerId}
            items={partnerCodeItems(partners)}
          />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField
            label="품목" hideLabel width={220} emptyLabel="전체"
            value={itemId} onChange={setItemId}
            items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.spec }))}
          />
        </EcCond>
        <EcCond label="시리얼/로트No.">
          <input className="ec-input" value={lotNo} onChange={(e) => setLotNo(e.target.value)}
                 placeholder="부분일치" style={{ width: 220 }} />
        </EcCond>
        <EcCond label="거래구분">
          {(['전체', '일반', '반품'] as const).map((t) => (
            <button
              key={t} type="button"
              className={`ec-btn ec-btn-sm${tradeKind === t ? ' ec-btn-primary' : ''}`}
              onClick={() => setTradeKind(t)}
            >
              {t}
            </button>
          ))}
        </EcCond>
        {/*
          원본 차례(2026-09-08 실측, 접힌 줄을 펼쳐 스물일곱):
          … 거래구분 · <b>오더관리번호 · 담당자 · 거래처관리담당자</b> · (외화종류) ·
          <b>규격 · 수량 · 단가 · 공급가액 · 부가세 · 적요 · 부대비용</b> ·
          (판매구분 · 진행상태 · 채권번호) · <b>작성자</b> · (최종수정자 · 사용자지정).
        */}
        {/*
          원본은 [거래구분] 아래를 회색 띠(높이 10.8 · #e9ecef · 누름) 밑에 접어 둔다(2026-10-20 실측). 펼친 차례:
          오더관리번호 · 담당자 · 거래처관리담당자 · 통화 · 규격 · 추가수량 · 수량 · 단가 · 단가(vat포함) · 공급가액 · 부가세 ·
          판매구분 · 진행상태 · 채권번호 · 작성자 · 최종수정자 · 제목 · 사용자지정. 적요 · 부대비용은 지금 원본에 없다.
          우리 값으로 거를 수 있는 것만 둔다.
        */}
        {more && (<>
          <EcCond label="오더관리번호" pick>
            <CodePickerField label="오더관리번호" hideLabel width={140} emptyLabel="전체"
                             value={orderNoCond} onChange={setOrderNoCond}
                             items={[...new Set(rows.map((r) => r.sourceDocNo).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="담당자" pick>
            <CodePickerField label="담당자" hideLabel width={140} emptyLabel="전체"
                             value={empCond} onChange={setEmpCond}
                             items={[...new Set(rows.map((r) => r.employeeName).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="거래처관리담당자" pick>
            <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                             value={pmgrCond} onChange={setPmgrCond}
                             items={pmgr.options.map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="규격" pick>
            <CodePickerField label="규격" hideLabel width={140} emptyLabel="전체"
                             value={specCond} onChange={setSpecCond}
                             items={[...new Set(rows.map((r) => r.spec).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="수량">
            <input type="number" className="ec-input text-right" placeholder="이상" value={qtyFrom}
                   onChange={(e) => setQtyFrom(e.target.value)} style={{ width: 100 }} />
            <span className="my-0 mx-[4px] text-ec-hint">~</span>
            <input type="number" className="ec-input text-right" placeholder="이하" value={qtyTo}
                   onChange={(e) => setQtyTo(e.target.value)} style={{ width: 100 }} />
          </EcCond>
          <EcCond label="단가">
            <input type="number" className="ec-input text-right" placeholder="이상" value={priceFrom}
                   onChange={(e) => setPriceFrom(e.target.value)} style={{ width: 110 }} />
            <span className="my-0 mx-[4px] text-ec-hint">~</span>
            <input type="number" className="ec-input text-right" placeholder="이하" value={priceTo}
                   onChange={(e) => setPriceTo(e.target.value)} style={{ width: 110 }} />
          </EcCond>
          <EcCond label="단가(vat포함)">
            <input type="number" className="ec-input text-right w-[110px]" placeholder="이상" value={vatPriceFrom}
                   onChange={(e) => setVatPriceFrom(e.target.value)} />
            <span className="my-0 mx-[4px] text-ec-hint">~</span>
            <input type="number" className="ec-input text-right w-[110px]" placeholder="이하" value={vatPriceTo}
                   onChange={(e) => setVatPriceTo(e.target.value)} />
          </EcCond>
          <EcCond label="공급가액">
            <input type="number" className="ec-input text-right" placeholder="이상" value={supplyFrom}
                   onChange={(e) => setSupplyFrom(e.target.value)} style={{ width: 120 }} />
            <span className="my-0 mx-[4px] text-ec-hint">~</span>
            <input type="number" className="ec-input text-right" placeholder="이하" value={supplyTo}
                   onChange={(e) => setSupplyTo(e.target.value)} style={{ width: 120 }} />
          </EcCond>
          <EcCond label="부가세">
            <input type="number" className="ec-input text-right" placeholder="이상" value={vatFrom}
                   onChange={(e) => setVatFrom(e.target.value)} style={{ width: 120 }} />
            <span className="my-0 mx-[4px] text-ec-hint">~</span>
            <input type="number" className="ec-input text-right" placeholder="이하" value={vatTo}
                   onChange={(e) => setVatTo(e.target.value)} style={{ width: 120 }} />
          </EcCond>
          <EcCond label="판매구분">
            {(['전체', '판매', '판매 II'] as const).map((t) => (
              <label key={t} className="mr-[9px]">
                <input type="radio" checked={salesKind === t} onChange={() => setSalesKind(t)} /> {t}
              </label>
            ))}
          </EcCond>
          <EcCond label="진행상태">
            {(['전체', '결재중', '미확인', '확인'] as const).map((t) => (
              <label key={t} className="mr-[9px]">
                <input type="radio" checked={progress === t} onChange={() => setProgress(t)} /> {t}
              </label>
            ))}
          </EcCond>
          <EcCond label="작성자" pick>
            <CodePickerField label="작성자" hideLabel width={140} emptyLabel="전체"
                             value={authorCond} onChange={setAuthorCond}
                             items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
        </>)}
        <li className="full h-[10.8px] !min-h-0 !p-0 bg-ec-disabled cursor-pointer" role="button" aria-label="조건 더보기"
            onClick={() => setMore((v) => !v)} />
      </EcStatusPanel>

      {prevTotals && (
        <div className="mb-[8px] text-[12.5px] text-right text-ec-label">
          <span className="text-ec-label">
            비교기간({prevRange!.from.replace(/-/g, '/')} ~ {prevRange!.to.replace(/-/g, '/')})
          </span>
          <span className="my-0 mx-[8px] text-ec-off">|</span>
          공급가액 {prevTotals.supply.toLocaleString()} → {totals.supply.toLocaleString()}
          {prevTotals.supply > 0 && (
            <span style={{ marginLeft: 4, color: totals.supply >= prevTotals.supply ? 'var(--ec-success)' : 'var(--ec-danger)' }}>
              ({totals.supply >= prevTotals.supply ? '+' : ''}
              {Math.round(((totals.supply - prevTotals.supply) / prevTotals.supply) * 100)}%)
            </span>
          )}
        </div>
      )}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 원" emptyText="조회된 판매가 없습니다." />
      ) : mode === '집계' ? (
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th>{group1 || '집계조건1'}</th>
              {group2 && <th>{group2}</th>}
              <th className="w-[90px] text-right">건수</th>
              <th className="w-[110px] text-right">수량</th>
              <th className="w-[130px] text-right">공급가액</th>
              <th className="w-[130px] text-right">부가세</th>
              <th className="w-[130px] text-right">합계</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr><td colSpan={group2 ? 8 : 7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={`${g.g1}|${g.g2}`}>
                <td className="text-center text-ec-hint bg-ec-stripe">{i + 1}</td>
                <td>{g.g1}</td>
                {group2 && <td>{g.g2}</td>}
                <td className="text-right text-ec-hint">{g.count.toLocaleString()}</td>
                <td className="text-right">{g.qty.toLocaleString()}</td>
                <td className="text-right">{g.supply.toLocaleString()}</td>
                <td className="text-right text-ec-hint">{g.vat.toLocaleString()}</td>
                <td className="text-right font-bold text-ec-navy">
                  {(g.supply + g.vat).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={group2 ? 3 : 2} className="text-right">합계 ({grouped.length}개 그룹)</td>
              <td className="text-right">{grouped.reduce((a, g) => a + g.count, 0).toLocaleString()}</td>
              <td className="text-right">{grouped.reduce((a, g) => a + g.qty, 0).toLocaleString()}</td>
              <td className="text-right">{totals.supply.toLocaleString()}</td>
              <td className="text-right">{totals.vat.toLocaleString()}</td>
              <td className="text-right text-ec-navy">{(totals.supply + totals.vat).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        /*
          2026-10-20 loginaa 실측(라인별, 검색 뒤): 격자는 <b>출력물 모양</b>이다 — 위에 '판매현황' 24px 700 가운데 ·
          '회사명 : …' 왼쪽 · '2026/09/01 ~ 2026/10/20' 오른쪽, 머리 12px <b>400</b> · 6px 3px 3px · 28.1 · 바탕 (247,248,249) ·
          윗선 (155,176,190), 본문 3px · 25.1(다른 출력물 24.1 보다 1px 높다 — 높이를 박는다) · 세로선 1px (222,226,230) · 줄무늬 없음, 꼬리([P.1]) 없음.
          열 차례 일자-No. · <b>거래처명</b> · 품목명(규격) · 수량 · 단가 · 공급가액 · 부가세 · 합계(8열, 창고명 없음) —
          9-09 기록의 '거래처명 맨 뒤' 는 지금 원본과 다르다. 폭 100 · 177 · 217 · 47 · 79 · 97 · 74 · 95(표 887).
          'YYYY/MM 계' · '총합계' 는 세 칸을 합쳐 가운데 · 회색 247 · 굵게, 단가 칸도 더해 찍는다.
        */
        <div className="ec-report-frame">
          <EcReportHead title="판매현황" period={reportPeriod(from, to)} />
          <table className="w-[887px] text-left table-fixed ec-report ec-report-head400 [&_thead_th]:h-[28.14px] [&_tbody_td]:h-[25.14px]">
            <colgroup>
              <col className="w-[100px]" /><col className="w-[177px]" /><col className="w-[217px]" /><col className="w-[47px]" />
              <col className="w-[79px]" /><col className="w-[97px]" /><col className="w-[74px]" /><col className="w-[95px]" />
            </colgroup>
            <thead>
              <tr>
                {/* 머리의 정렬 클래스는 칸 정렬을 적어 두는 것이다(ui-check 가 읽는다) — 보이는 머리는 .ec-report 가 가운데로 덮는다. */}
                <th className="text-center">일자-No.</th>
                <th>거래처명</th>
                <th>품목명(규격)</th>
                <th className="text-right">수량</th>
                <th className="text-right">단가</th>
                <th className="text-right">공급가액</th>
                <th className="text-right">부가세</th>
                <th className="text-right">합계</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center">불러오는 중…</td></tr>
              ) : lineRows.length === 0 ? (
                <tr><td colSpan={8} className="text-center">등록된 데이터가 없습니다.</td></tr>
              ) : lineRows.map((x) => x.kind === 'subtotal' ? (
                <tr key={x.key} className="ec-list-total">
                  <td colSpan={3} className="text-center font-bold">{x.month} 계</td>
                  <td className="text-right font-bold">{x.qty.toLocaleString()}</td>
                  <td className="text-right font-bold">{x.price.toLocaleString()}</td>
                  <td className="text-right font-bold">{x.supply.toLocaleString()}</td>
                  <td className="text-right font-bold">{x.vat.toLocaleString()}</td>
                  <td className="text-right font-bold">{(x.supply + x.vat).toLocaleString()}</td>
                </tr>
              ) : (
                <tr key={x.key}>
                  <td className="text-center">
                    <span className="ec-link">{dateNo(x.r.date, x.r.docNo)}</span>
                  </td>
                  <td>{x.r.partner}</td>
                  {/* 원본은 규격을 품목명 뒤 대괄호에 붙인다 — 없는 품목은 이름만 찍는다. */}
                  <td>{x.r.itemName}{x.r.spec ? ` [${x.r.spec}]` : ''}</td>
                  <td className="text-right">{x.r.qty.toLocaleString()}</td>
                  <td className="text-right">{x.r.unitPrice.toLocaleString()}</td>
                  <td className="text-right">{x.r.supply.toLocaleString()}</td>
                  <td className="text-right">{x.r.vat.toLocaleString()}</td>
                  <td className="text-right">{(x.r.supply + x.r.vat).toLocaleString()}</td>
                </tr>
              ))}
              {!loading && lineRows.length > 0 && (
                <tr className="ec-list-total">
                  <td colSpan={3} className="text-center font-bold">총합계</td>
                  <td className="text-right font-bold">{shown.reduce((a, x) => a + x.qty, 0).toLocaleString()}</td>
                  {/* 원본 [총합계]도 월 계처럼 단가를 더해 찍는다(2026-10-20: 9,964 · 22,381,400 · 1,049,650,000 …). */}
                  <td className="text-right font-bold">{lineRows.reduce((a, x) => a + (x.kind === 'line' ? x.r.unitPrice : 0), 0).toLocaleString()}</td>
                  <td className="text-right font-bold">{totals.supply.toLocaleString()}</td>
                  <td className="text-right font-bold">{totals.vat.toLocaleString()}</td>
                  <td className="text-right font-bold">{(totals.supply + totals.vat).toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </EcListShell>
  )
}

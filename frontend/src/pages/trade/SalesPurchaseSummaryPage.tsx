import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc, SalesDoc } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { usePartnerManagers } from '../../utils/partnerManagers'
import { periodOf } from '../../components/EcPeriodPicks'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { ymd } from '../../utils/periods'
import { fmtNumber } from '../../utils/format'

/**
 * 영업관리 > 판매구매집계표 (이카운트 E040725)
 * 기간 내 판매·매입을 거래처별 또는 품목별로 집계해 매출·매입·순액을 한 표로 본다.
 * 데이터는 GET /api/sales + GET /api/purchases 를 그대로 집계(백엔드 무변경).
 *
 * 거래처별: 전표 합계 기준. 품목별: 라인 합계 기준(수량·공급가액).
 *
 * <p>2026-09-08 에 원본을 열어 조건 판을 재니 <b>스물일곱</b>이다 — 사본에는 열뿐이었다.
 * 화면코드도 바로잡았다: 대조표에 <b>ESZ006R</b> 이라 적혀 있었는데 주소창의 prgId 는
 * <b>E040725</b> 였다(사본에서 주워 온 코드였다).
 *
 * <p>실측 차례: 기준일자 · 집계조건 · 내.외자구분 · 창고 · (창고계층그룹) · 프로젝트 ·
 * (프로젝트그룹1/2) · 담당자 · <b>거래처관리담당자</b> · 관리항목 · 거래처 ·
 * <b>거래처그룹1</b> · (거래처그룹2 · 거래처계층그룹) · 품목코드 · <b>품목구분 ·
 * 품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) · 적요 · 거래구분 · <b>거래유형</b> ·
 * (외화종류) · (양식 · 양식구분).
 *
 * <p>이름 둘도 원본대로 고쳤다 — 기간 칸은 <b>[기준일자]</b>, 우리가 [집계기준]이라 부르던
 * 것은 <b>[집계조건]</b> 이고 원본에서는 <b>기준일자 바로 다음</b>에 선다(맨 뒤가 아니다).
 *
 * <p><b>2026-09-09 격자를 재려다 알게 된 것: 이 화면에는 고정된 격자가 없다.</b>
 * [검색(F8)]을 누르면 표가 아니라 <b>"집계조건은 1개 이상 선택해야 합니다"</b> 가 뜬다.
 * [집계조건]은 하나가 아니라 <b>집계조건1~5 + 집계대상</b> 여섯 자리이고, 처음엔 모두
 * <code>none</code> 이다 — 사람이 고른 <b>그 축들이 그대로 표의 열</b>이 된다.
 * 즉 원본에는 대조표에 적을 <b>정해진 열 차례가 없다.</b> 그래서
 * <code>ecount-column-align.json</code> 에 이 화면을 넣지 않았다 — 축을 하나 골라
 * 나온 표를 적으면 <b>그 선택에만 맞는 열</b>을 원본이라고 적게 된다.
 *
 * <p>우리 표는 축이 <b>거래처별·품목별 둘</b>뿐이고 열은 [매출건수/수량 · 매출공급가 ·
 * 매입건수/수량 · 매입공급가 · 순액] 으로 고정이다. 원본만큼 자유롭지 않지만,
 * <b>고른 축이 곧 열</b>이라는 얼개는 같다. 축을 다섯까지 겹쳐 쌓는 것과
 * [집계대상]·[가로보기]·[비율표시]·[차이표시]는 아직 없다.
 * (조건 판은 눌러서 값을 고르는 <b>선택 팝업</b>이라 열지 않았다 — 저장을 건드릴 수 있다.)
 */

/**
 * 원본 [집계조건1~3] 고르기(2026-10-21 기록: 기준일자 일별~연별 · 창고 · 거래유형 · 관리항목 · 거래처 · 거래처그룹1/2 ·
 * 품목명[규격] · 품목그룹1~3 · 프로젝트 · 프로젝트그룹1/2). 우리 자료로 낼 수 있는 것만 둔다 — 그룹2/3 · 프로젝트그룹은 마스터가 없어 뺀다.
 * 고른 축이 그대로 표의 앞머리 칸이 된다. 전부 사용안함이면 원본 문구를 낸다.
 * [집계대상] · [비교기간] · [가로보기] · [비율표시] · [코드포함] · [차이표시] 는 2026-10-21 실측대로 격자 머리 · 열 · 소계를 바꾼다.
 * 겹침(비율+차이 · 가로보기+비교기간 · 소계 줄 · 집계조건1~4)은 2026-10-22 원본 실측대로(plans/재고1.md).
 */
const AXES = ['사용안함', '기준일자(일별)', '기준일자(주차별)', '기준일자(월별)', '기준일자(분기별)', '기준일자(반기별)', '기준일자(연별)', '담당자', '창고', '거래유형', '관리항목',
  '거래처', '거래처그룹1', '품목명[규격]', '품목그룹1', '프로젝트'] as const
type Axis = typeof AXES[number]
/** 품목에 붙는 축 — 하나라도 있으면 줄(라인) 단위로 더한다. 없으면 전표 합계 기준(거래처별 같은 기존 규칙). */
const LINE_AXES: Axis[] = ['관리항목', '품목명[규격]', '품목그룹1']
/**
 * 원본 [주차별] 값 — '2026/40주차'(2026-10-22 실측: 40주차 = 10/01 ~ 10/03, 41주차 = 10/04(일) ~ 10/10, 42주차 10/11 ~, 43주차 10/18 ~).
 * <b>일요일에 시작</b>하고 1월 1일이 든 주가 1주차다. 분기는 '2026/4분기', 반기는 '2026/상반기' · '2026/하반기'.
 */
const weekLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00`)
  const doy = Math.round((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1
  const jan1 = new Date(d.getFullYear(), 0, 1).getDay()
  return `${d.getFullYear()}/${Math.floor((doy + jan1 - 1) / 7) + 1}주차`
}
const AXIS_HEAD: Record<Axis, string> = {
  '사용안함': '', '기준일자(일별)': '일자', '기준일자(주차별)': '주차별', '기준일자(월별)': '월', '기준일자(분기별)': '분기별', '기준일자(반기별)': '반기별', '기준일자(연별)': '연도', '담당자': '담당자', '창고': '창고', '거래유형': '거래유형',
  '관리항목': '관리항목', '거래처': '거래처명', '거래처그룹1': '거래처그룹1', '품목명[규격]': '품목명[규격]', '품목그룹1': '품목그룹1', '프로젝트': '프로젝트',
}

interface Agg {
  key: string
  names: string[]
  saleCount: number   // 거래처별=전표수, 품목별=라인수
  saleQty: number
  saleSupply: number
  saleVat: number
  buyCount: number
  buyQty: number
  buySupply: number
  buyVat: number
}

/** 원본 판매구매집계표의 수량은 소수 둘째 자리까지 찍힌다('1.00' · 2026-10-20 실측). */
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 원본 축 이름 열은 '품목명[규격]' 이다. */
const itemLabel = (name: string, spec: string | null) => spec ? `${name}[${spec}]` : name
const emptyAgg = (key: string, names: string[]): Agg => ({ key, names, saleCount: 0, saleQty: 0, saleSupply: 0, saleVat: 0, buyCount: 0, buyQty: 0, buySupply: 0, buyVat: 0 })

const initP = periodOf('금월(~오늘)')!

/** 원본 [집계대상] — 안 고르면 넷 다(2026-10-21 실측). */
const TARGETS = ['수량', '공급가액', '부가세', '합계'] as const
type Target = typeof TARGETS[number]
/** 원본 [비교기간] 라디오(사용안함★ 먼저). */
const CMPS = ['사용안함', '전년동일기간', '전월동일기간', '전주동일기간', '전일동일기간'] as const
type Cmp = typeof CMPS[number]
/** 비교기간 — 전월동일기간은 10/01~10/21 → 09/01~09/21(없는 날은 그 달 말일). */
function shiftDate(s: string, cmp: Cmp): string {
  if (!s || cmp === '사용안함') return s
  const [y, m, d] = s.split('-').map(Number)
  if (cmp === '전주동일기간' || cmp === '전일동일기간') return ymd(new Date(y, m - 1, d - (cmp === '전주동일기간' ? 7 : 1)))
  const ty = cmp === '전년동일기간' ? y - 1 : (m === 1 ? y - 1 : y)
  const tm = cmp === '전년동일기간' ? m : (m === 1 ? 12 : m - 1)
  return ymd(new Date(ty, tm - 1, Math.min(d, new Date(ty, tm, 0).getDate())))
}
const slashRange = (f: string, t: string) => `${f.replace(/-/g, '/')} ~ ${t.replace(/-/g, '/')}`
type Side = 'sale' | 'buy' | 'diff'
/** 한 지표의 값 — 차이는 판매 − 구매(음수 그대로). */
function metricOf(a: Agg, side: Side, m: Target): number {
  const v = (s: 'sale' | 'buy') => m === '수량' ? (s === 'sale' ? a.saleQty : a.buyQty)
    : m === '공급가액' ? (s === 'sale' ? a.saleSupply : a.buySupply)
    : m === '부가세' ? (s === 'sale' ? a.saleVat : a.buyVat)
    : (s === 'sale' ? a.saleSupply + a.saleVat : a.buySupply + a.buyVat)
  return side === 'diff' ? v('sale') - v('buy') : v(side)
}
const metricLabel = (side: Side, m: Target) => m === '수량' ? '수량' : m === '부가세' ? '부가세' : m === '합계' ? '합계'
  : side === 'sale' ? '판매금액' : side === 'buy' ? '구매금액' : '차이금액'
const sideLabel = (s: Side) => s === 'sale' ? '판매' : s === 'buy' ? '구매' : '차이'
const fmtMetric = (m: Target, v: number) => m === '수량' ? qty2(v) : fmtNumber(v)
/** 원본 비율표시 — 합계 대비 % 정수 반올림, 0 이면 빈칸. */
const ratioOf = (v: number, tot: number) => { if (tot <= 0) return ''; const r = Math.round(v / tot * 100); return r === 0 ? '' : String(r) }
const sumAgg = (list: Agg[]): Agg => list.reduce((s, a) => ({ ...s,
  saleCount: s.saleCount + a.saleCount, saleQty: s.saleQty + a.saleQty, saleSupply: s.saleSupply + a.saleSupply, saleVat: s.saleVat + a.saleVat,
  buyCount: s.buyCount + a.buyCount, buyQty: s.buyQty + a.buyQty, buySupply: s.buySupply + a.buySupply, buyVat: s.buyVat + a.buyVat }), emptyAgg('', []))
const CODE_HEAD: Partial<Record<Axis, string>> = { '담당자': '담당자코드', '거래처': '거래처코드', '창고': '창고코드', '품목명[규격]': '품목코드', '프로젝트': '프로젝트코드' }

export default function SalesPurchaseSummaryPage() {
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [warehouseCond, setWarehouseCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  /*
   * 원본 판매구매집계표 조건의 <b>[품목코드]</b>·<b>[거래구분]</b>.
   * 품목은 집계 줄의 이름으로만 찾을 수 있었는데, 이름은 겹칠 수 있고 <b>코드로 훑는</b>
   * 일이 안 됐다. [거래구분]은 일반인가 반품인가 — 반품이 섞이면 금액이 상계돼서,
   * 반품만 따로 보고 싶을 때가 실제로 있다. 둘 다 <b>합치기 전에</b> 건다.
   */
  const [itemCond, setItemCond] = useState('')
  const [kindCond, setKindCond] = useState<'전체' | '일반' | '반품'>('전체')
  /*
   * 2026-09-08 실측으로 만든 넷. 값은 이미 다 있다 —
   * 거래처그룹1·거래처관리담당자는 거래처 마스터에서 이름으로 잇고,
   * 품목구분은 라인이 <code>itemCategoryName</code> 으로 진작 싣고 있으며,
   * 거래유형(과세·면세)은 전표의 <code>taxable</code> 이다.
   */
  const [partnerGroupCond, setPartnerGroupCond] = useState('')
  const [partnerMgrCond, setPartnerMgrCond] = useState('')
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [taxTypeCond, setTaxTypeCond] = useState('')
  const pgroup = usePartnerGroups()
  const pmgr = usePartnerManagers()
  const partnerPick = useCondPickers(['partners', 'projects', 'warehouses', 'employees', 'items'])

  /* 원본 판매구매집계표는 <b>금월</b>을 보고 열린다(사본 실측). 우리는 비워 두어 */
  /* 열자마자 몇 해치를 한 표로 더했다 — 이번 달 장사가 어땠는지 알 수 없는 숫자다. */
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [axis1, setAxis1] = useState<Axis>('거래처')
  const [axis2, setAxis2] = useState<Axis>('사용안함')
  const [axis3, setAxis3] = useState<Axis>('사용안함')
  const [axis4, setAxis4] = useState<Axis>('사용안함')
  const axes = [axis1, axis2, axis3, axis4].filter((a) => a !== '사용안함')
  const [targets, setTargets] = useState<Target[]>([])
  const [cmp, setCmp] = useState<Cmp>('사용안함')
  const [horizontal, setHorizontal] = useState(false)
  const [showRatio, setShowRatio] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [prevSales, setPrevSales] = useState<SalesDoc[]>([])
  const [prevPurchases, setPrevPurchases] = useState<PurchaseDoc[]>([])
  /** 안 고르면 넷 다. 가로보기만은 하나라도 골라야 한다(원본 풍선). */
  const metrics: Target[] = targets.length ? TARGETS.filter((t) => targets.includes(t)) : [...TARGETS]
  const useCmp = cmp !== '사용안함'
  const prevFrom = shiftDate(from, cmp)
  const prevTo = shiftDate(to, cmp)
  const needAxis = axes.length === 0
  const tableRef = useRef<HTMLTableElement>(null)
  const lineLevel = axes.some((a) => LINE_AXES.includes(a))
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      /*
       * <b>고른 기간을 서버에도 보낸다.</b> 여태 전표를 통째로 받아 아래 inPeriod 로
       * 걸렀다 — 화면은 [기간]을 묻고 서버에는 아무것도 안 보내는 꼴이었다.
       * 거르는 규칙은 그대로 두고(같은 창을 두 번 보는 것은 해가 없다) 받는 것만 줄인다.
       */
      const period: Record<string, string> = {}
      if (from) period.from = from
      if (to) period.to = to
      const [s, b] = await Promise.all([
        api.get<SalesDoc[]>('/sales', { params: period }),
        api.get<PurchaseDoc[]>('/purchases', { params: period }),
      ])
      setSales(s.data); setPurchases(b.data)
      if (cmp !== '사용안함') {
        const pp: Record<string, string> = {}
        if (from) pp.from = shiftDate(from, cmp)
        if (to) pp.to = shiftDate(to, cmp)
        const [ps, pb] = await Promise.all([
          api.get<SalesDoc[]>('/sales', { params: pp }),
          api.get<PurchaseDoc[]>('/purchases', { params: pp }),
        ])
        setPrevSales(ps.data); setPrevPurchases(pb.data)
      } else { setPrevSales([]); setPrevPurchases([]) }
    } catch (err) { setError(extractErrorMessage(err)); setSales([]); setPurchases([]) }
    finally { setLoading(false) }
  }
  /* 기간을 바꾸면 그 기간으로 다시 받는다 — 안 그러면 서버 창과 화면 창이 어긋난다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to, cmp])

  const inRange = (d: string, f: string, t: string) => (!f || d >= f) && (!t || d <= t)
  /*
   * 원본 판매구매집계표의 조건에 <b>[거래처]</b> 가 있다(사본 실측).
   * 집계 화면이라 <b>합치기 전</b>에 걸러야 한다 — 합쳐 놓은 줄을 이름으로 거르면
   * [품목별] 로 볼 때 아무것도 안 걸린다(그 줄의 이름은 품목명이다).
   */
  /* 거래처·창고·품목 조건은 코드도움의 id 로 견준다 — 이름은 겹칠 수 있다. */
  const keepPartner = (id: number) => !partnerCond || String(id) === partnerCond
  const keepProject = (id: number | null) => !projectCond || String(id) === projectCond
  const keepWarehouse = (id: number | null) => !warehouseCond || String(id) === warehouseCond
  const keepEmp = (name: string | null) => !empCond || (name ?? '').includes(empCond)
  const keepRemark = (t: string | null) => !remarkCond || (t ?? '').includes(remarkCond)
  const keepGroup = (name: string) => !partnerGroupCond || pgroup.groupOfName(name) === partnerGroupCond
  const keepMgr = (name: string) => !partnerMgrCond || pmgr.managerOfName(name) === partnerMgrCond
  /** 원본 [거래유형] — 과세 · 면세. [거래구분](일반·반품)과 다른 축이다. */
  const keepTax = (taxable: boolean) => !taxTypeCond || (taxable ? '과세' : '면세') === taxTypeCond


  /**
   * 원본 [관리항목]. 품목 마스터에 붙는 값이라 전표 응답에는 없다 —
   * 품목 마스터를 받아 줄의 itemId 로 잇는다(판매현황이 먼저 그렇게 했다).
   */
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')
  /**
   * 원본 [품목구분]·[품목그룹1]. <b>[거래처별] 로 볼 때도 걸려야 한다</b> —
   * 그때는 전표 단위로 더하므로 <b>그 조건에 맞는 줄을 하나라도 가진 전표</b>만 센다.
   * 라인 단위로 자르면 [거래처별] 의 전표 합계가 아니게 된다.
   */
  const lineHit = (l: { itemId: number; itemCategoryName: string | null }) =>
    (!categoryCond || (l.itemCategoryName ?? '') === categoryCond)
    && (!itemGroupCond || mgmt.groupOf(l.itemId) === itemGroupCond)
  const docHasItem = (lines: { itemId: number; itemCategoryName: string | null }[]) =>
    (!categoryCond && !itemGroupCond) || lines.some(lineHit)

  const aggregate = (S: SalesDoc[], P: PurchaseDoc[], f: string, t: string): Map<string, Agg> => {
    const m = new Map<string, Agg>()
    type Line = SalesDoc['lines'][number]
    type AnyDoc = { partnerId: number; partnerName: string; projectId: number | null; projectName: string | null
      warehouseId: number; warehouseName: string; employeeName: string | null; remark: string | null
      taxable: boolean; tradeKindName: string; supplyAmount: number; vatAmount: number; lines: Line[] }
    const add = (d: AnyDoc, date: string, side: 'sale' | 'buy') => {
      if (!inRange(date, f, t)) return
      if (!keepPartner(d.partnerId)) return
      if (!keepProject(d.projectId)) return
      if (!keepWarehouse(d.warehouseId)) return
      if (!keepEmp(d.employeeName)) return
      if (!keepRemark(d.remark)) return
      if (!keepGroup(d.partnerName)) return
      if (!keepMgr(d.partnerName)) return
      if (!keepTax(d.taxable)) return
      if (kindCond !== '전체' && d.tradeKindName !== kindCond) return
      /* 축 하나의 값. 줄(라인)에 붙는 축은 line 이 있을 때만 쓴다. */
      const valueOf = (ax: Axis, l?: Line): string => {
        switch (ax) {
          case '기준일자(일별)': return date.replace(/-/g, '/')
          case '기준일자(주차별)': return weekLabel(date)
          case '기준일자(월별)': return date.slice(0, 7).replace('-', '/')
          case '기준일자(분기별)': return `${date.slice(0, 4)}/${Math.ceil(Number(date.slice(5, 7)) / 3)}분기`
          case '기준일자(반기별)': return `${date.slice(0, 4)}/${Number(date.slice(5, 7)) <= 6 ? '상' : '하'}반기`
          case '담당자': return d.employeeName ?? ''
          case '기준일자(연별)': return date.slice(0, 4)
          case '창고': return d.warehouseName
          case '거래유형': return d.taxable ? '과세' : '면세'
          case '거래처': return d.partnerName
          case '거래처그룹1': return pgroup.groupOfName(d.partnerName) || '(미지정)'
          case '프로젝트': return d.projectName ?? ''
          case '관리항목': return l ? (mgmt.nameOf(l.itemId) || '') : ''
          case '품목그룹1': return l ? (mgmt.groupOf(l.itemId) || '(미지정)') : ''
          case '품목명[규격]': return l ? itemLabel(l.itemName, l.spec) : ''
          default: return ''
        }
      }
      const put = (l?: Line) => {
        const names = axes.map((ax) => valueOf(ax, l))
        const key = names.join('\u0001')
        let a = m.get(key)
        if (!a) { a = emptyAgg(key, names); m.set(key, a) }
        if (l) {
          if (side === 'sale') { a.saleCount += 1; a.saleQty += l.quantity; a.saleSupply += l.supplyAmount; a.saleVat += l.vatAmount }
          else { a.buyCount += 1; a.buyQty += l.quantity; a.buySupply += l.supplyAmount; a.buyVat += l.vatAmount }
        } else {
          const q = d.lines.reduce((x, ln) => x + ln.quantity, 0)
          if (side === 'sale') { a.saleCount += 1; a.saleSupply += d.supplyAmount; a.saleVat += d.vatAmount; a.saleQty += q }
          else { a.buyCount += 1; a.buySupply += d.supplyAmount; a.buyVat += d.vatAmount; a.buyQty += q }
        }
      }
      if (lineLevel) {
        for (const l of d.lines) {
          if (itemCond && String(l.itemId) !== itemCond) continue
          if (mgmtCond && mgmt.nameOf(l.itemId) !== mgmtCond) continue
          if (!lineHit(l)) continue
          put(l)
        }
      } else {
        /* 전표 합계 기준 — 품목 조건은 '그 조건에 맞는 줄을 가진 전표'만 센다(옛 [거래처별] 규칙). */
        if (itemCond && !d.lines.some((l) => String(l.itemId) === itemCond)) return
        if (mgmtCond && !d.lines.some((l) => mgmt.nameOf(l.itemId) === mgmtCond)) return
        if (!docHasItem(d.lines)) return
        put()
      }
    }
    if (axes.length > 0) {
      for (const d of S) add(d as unknown as AnyDoc, d.saleDate, 'sale')
      for (const d of P) add(d as unknown as AnyDoc, d.purchaseDate, 'buy')
    }
    return m
  }

  /** 원본 [코드포함] — 축 이름으로 코드를 찾는다(거래처 · 창고 · 품목 · 프로젝트만 마스터에 코드가 있다). */
  const codeOf = useMemo(() => {
    const idx: Partial<Record<Axis, Map<string, string>>> = {
      '담당자': new Map(partnerPick.employees.map((x) => [x.name, x.code ?? ''])),
      '거래처': new Map(partnerPick.partners.map((x) => [x.name, x.code ?? ''])),
      '창고': new Map(partnerPick.warehouses.map((x) => [x.name, x.code ?? ''])),
      '프로젝트': new Map(partnerPick.projects.map((x) => [x.name, x.code ?? ''])),
      '품목명[규격]': new Map(partnerPick.items.map((x) => [itemLabel(x.name, (x as { sub?: string | null }).sub ?? null), x.code ?? ''])),
    }
    return (ax: Axis, name: string) => idx[ax]?.get(name) ?? ''
  }, [partnerPick.partners, partnerPick.warehouses, partnerPick.projects, partnerPick.items, partnerPick.employees])

  /** 기간마다 한 벌 — 비교기간이면 [지금, 비교] 둘, 아니면 하나. 줄은 두 기간의 합집합. */
  const grid = useMemo(() => {
    const periods = [aggregate(sales, purchases, from, to)]
    if (useCmp) periods.push(aggregate(prevSales, prevPurchases, prevFrom, prevTo))
    const keys = new Map<string, string[]>()
    for (const pm of periods) for (const a of pm.values()) keys.set(a.key, a.names)
    const kw = keyword.trim()
    const list = [...keys.entries()]
      .filter(([, names]) => !kw || names.join(' ').includes(kw))
      .sort(([, x], [, y]) => {
        /* 원본 [코드순]: 거래처 · 담당자 · 창고 · 프로젝트 · 품목은 코드 차례(빈 값이 먼저), 나머지는 값 차례(2026-10-22 실측). */
        for (let i = 0; i < x.length; i++) {
          const cx = codeOf(axes[i], x[i])
          const cy = codeOf(axes[i], y[i])
          if (CODE_HEAD[axes[i]] && (cx || cy)) { if (cx !== cy) return cx < cy ? -1 : 1; continue }
          const c = x[i].localeCompare(y[i], 'ko')
          if (c) return c
        }
        return 0
      })
      .map(([key, names]) => ({ key, names, aggs: periods.map((pm) => pm.get(key) ?? emptyAgg(key, names)) }))
    const totals = periods.map((_, pi) => sumAgg(list.map((r) => r.aggs[pi])))
    return { list, totals }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, purchases, prevSales, prevPurchases, axis1, axis2, axis3, axis4, from, to, prevFrom, prevTo, useCmp, keyword, partnerCond, projectCond, warehouseCond, empCond, remarkCond, itemCond, kindCond,
      partnerGroupCond, partnerMgrCond, categoryCond, itemGroupCond, taxTypeCond, mgmtCond, codeOf])
  const rows = grid.list
  useTableColumnCheck(tableRef, '판매구매집계표', [axes.join(','), rows.length, loading, horizontal, cmp, targets.join(), showRatio, showDiff, showCode])

  /* ---- 격자 꼴: 옵션에 따라 머리 줄 · 열 · 소계가 바뀐다(원본 실측 2026-10-21) ---- */
  const sides: Side[] = showDiff ? ['sale', 'buy', 'diff'] : ['sale', 'buy']
  const perMetric = (_side: Side) => showRatio ? 2 : 1
  const sideSpan = (side: Side) => metrics.length * perMetric(side)
  const groupSpan = sides.reduce((n, sd) => n + sideSpan(sd), 0)
  const hMsg = horizontal
    ? (axes.length < 2 ? '가로보기는 집계조건을 2개 이상 선택해야 합니다.'
      : targets.length === 0 ? '집계대상에서 가로보기 대상을 선택바랍니다.' : '')
    : ''

  /** 한 묶음(기간 × 가로보기 열 값 한 칸)의 데이터 칸들. 소계 줄(계)에서는 비율을 비운다(원본 실측 2026-10-22). */
  const cells = (a: Agg, base: Agg, key: string, withRatio = true) => sides.flatMap((sd) => metrics.flatMap((m) => {
    const v = metricOf(a, sd, m)
    const out = [<td key={`${key}${sd}${m}`} className="text-right">{fmtMetric(m, v)}</td>]
    if (showRatio) out.push(<td key={`${key}${sd}${m}r`} className="text-right">{withRatio ? ratioOf(v, metricOf(base, sd, m)) : ''}</td>)
    return out
  }))
  const leadAxes = horizontal ? axes.slice(0, -1) : axes
  const codeLead = showCode ? leadAxes.filter((ax) => CODE_HEAD[ax]) : []
  const leadCols = codeLead.length + leadAxes.length
  /** 머리: 평소 두 줄 / 비교기간 · 가로보기는 맨 윗줄이 더해져 세 줄 / 둘 다면 네 줄(기간 → 열 값 → 판매 · 구매 → 지표). */
  const headRows = (periodLabels: string[] | null, colVals: string[] | null) => {
    const n = 2 + (periodLabels ? 1 : 0) + (colVals ? 1 : 0)
    const lead = [...codeLead.map((ax) => <th key={`c${ax}`} rowSpan={n}>{CODE_HEAD[ax]}</th>),
      ...leadAxes.map((ax) => <th key={ax} rowSpan={n}>{AXIS_HEAD[ax]}</th>)]
    const nCol = colVals ? colVals.length : 1
    const nPer = periodLabels ? periodLabels.length : 1
    const slots = Array.from({ length: nPer * nCol }, (_, i) => i)
    const sideTh = (i: number) => sides.map((sd) => <th key={`${i}${sd}`} colSpan={sideSpan(sd)} className="text-center">{sideLabel(sd)}</th>)
    const metTh = (i: number) => sides.flatMap((sd) => metrics.flatMap((m) => {
      const out = [<th key={`${i}${sd}${m}`} className="text-right">{metricLabel(sd, m)}</th>]
      if (showRatio) out.push(<th key={`${i}${sd}${m}r`} className="text-right">{metricLabel(sd, m)}비율</th>)
      return out
    }))
    return (
      <>
        {periodLabels && <tr>{lead}{periodLabels.map((lb, i) => <th key={i} colSpan={nCol * groupSpan} className="text-center">{lb}</th>)}</tr>}
        {colVals && <tr>{periodLabels ? null : lead}{Array.from({ length: nPer }, (_, p) => colVals.map((c, j) => <th key={`${p}-${j}`} colSpan={groupSpan} className="text-center">{c}</th>))}</tr>}
        <tr>{periodLabels || colVals ? null : lead}{slots.flatMap(sideTh)}</tr>
        <tr>{slots.flatMap(metTh)}</tr>
      </>
    )
  }
  /** spans[j] — 이 줄에서 j번째 앞머리 칸이 아래로 몇 줄을 합치나(0 = 위 칸에 합쳐져 그리지 않음). 같은 값끼리 rowspan 병합(원본). */
  const leadTds = (names: string[], k: string, spans?: number[]) => [
    ...codeLead.map((ax) => {
      const j = leadAxes.indexOf(ax)
      return spans && spans[j] === 0 ? null : <td key={`c${k}${ax}`} rowSpan={spans && spans[j] > 1 ? spans[j] : undefined}>{codeOf(ax, names[j])}</td>
    }),
    ...names.map((n, i) => spans && spans[i] === 0 ? null : <td key={`${k}n${i}`} rowSpan={spans && spans[i] > 1 ? spans[i] : undefined}>{n}</td>),
  ]
  const subRow = (k: string, label: string, aggs: Agg[], bases: Agg[], withRatio = false) => (
    <tr key={k} className="font-bold">
      <td colSpan={leadCols}>{label}</td>
      {aggs.flatMap((ag, pi) => cells(ag, bases[pi], `${k}${pi}`, withRatio))}
    </tr>
  )

  /**
   * 줄 · 칸 모양 — 비교기간 × 가로보기를 한 틀로 만든다(원본 실측 2026-10-22: 둘은 함께 켜진다).
   * 한 줄의 aggs 는 [기간0·열0, 기간0·열1, … 기간1·열0 …] 차례로 납작하게 편다.
   */
  const shape = useMemo(() => {
    const nPer = grid.totals.length
    if (horizontal && axes.length >= 2) {
      const lastVals = [...new Set(rows.map((r) => r.names[r.names.length - 1]))].sort((x, y) => x.localeCompare(y, 'ko'))
      const leads = new Map<string, { key: string; names: string[]; aggs: Agg[] }>()
      for (const r of rows) {
        const names = r.names.slice(0, -1)
        const k = names.join('\u0001')
        let e = leads.get(k)
        if (!e) { e = { key: k, names, aggs: Array.from({ length: nPer * lastVals.length }, () => emptyAgg('', [])) }; leads.set(k, e) }
        const ci = lastVals.indexOf(r.names[r.names.length - 1])
        for (let p = 0; p < nPer; p++) e.aggs[p * lastVals.length + ci] = r.aggs[p]
      }
      const units = [...leads.values()]
      const totals = Array.from({ length: nPer * lastVals.length }, (_, s) => sumAgg(units.map((u) => u.aggs[s])))
      return { units, totals, colVals: lastVals as string[] | null }
    }
    return { units: rows.map((r) => ({ key: r.key, names: r.names, aggs: r.aggs })), totals: grid.totals, colVals: null as string[] | null }
  }, [rows, grid.totals, horizontal, axes.length])

  function bodyRows(): React.ReactNode {
    const { units, totals } = shape
    const out: React.ReactNode[] = []
    /* 소계: 집계조건이 둘 이상이면 1 .. (n-1)번째 축마다 그 값이 끝날 때 '<값> 계' 줄(안쪽 먼저, 칸 전부 합침). 값이 비면 '[] 계'. */
    const levels = Math.max(axes.length - 1, 0)
    const sameHead = (a: string[], b: string[], l: number) => a.slice(0, l).every((v, i) => v === b[i])
    /* 앞머리 칸 병합: 소계 줄이 끼지 않는 연속 줄(첫 축부터 마지막-1 축이 같은 줄들) 안에서 앞 칸까지 같은 값끼리. */
    const inRun = (a: { names: string[] }, b: { names: string[] }) => sameHead(a.names, b.names, levels)
    const spanAt = (i: number, j: number) => {
      const u = units[i]
      const prev = units[i - 1]
      if (prev && inRun(prev, u) && sameHead(prev.names, u.names, j + 1)) return 0
      let n = 1
      while (units[i + n] && inRun(units[i + n], u) && sameHead(units[i + n].names, u.names, j + 1)) n++
      return n
    }
    units.forEach((u, i) => {
      const spans = u.names.map((_, j) => spanAt(i, j))
      out.push(<tr key={`r${u.key}`}>{leadTds(u.names, `r${i}`, spans)}{u.aggs.flatMap((ag, s) => cells(ag, totals[s], `r${i}_${s}`))}</tr>)
      for (let l = levels; l >= 1; l--) {
        const nx = units[i + 1]
        if (nx && sameHead(nx.names, u.names, l)) continue
        let j = i
        while (j > 0 && sameHead(units[j - 1].names, u.names, l)) j--
        const grp = units.slice(j, i + 1)
        out.push(subRow(`s${i}_${l}`, `${u.names[l - 1] || '[]'} 계`, totals.map((_, s) => sumAgg(grp.map((g) => g.aggs[s]))), totals))
      }
    })
    out.push(subRow('tot', '합계', totals, totals, true))
    return out
  }
  const periodLabels: string[] | null = useCmp ? [slashRange(from, to), slashRange(prevFrom, prevTo)] : null
  const totalCols = leadCols + shape.totals.length * groupSpan
  const toggle = <T,>(arr: T[], v: T) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

  const label: React.CSSProperties = { width: 56, fontSize: 12.5, color: 'var(--ec-text)', fontWeight: 600 }

  return (
    <EcListShell
      title="판매구매집계표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div style={{ border: '1px solid var(--ec-line)', borderRadius: 4, background: 'var(--ec-bg-page)', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        {/* 원본 첫째 조건은 [기준일자]다 — 우리는 [기간]이라 적고 있었다(2026-09-08 실측). */}
        <div className="flex items-center">
          <span style={{ ...label, width: 66 }}>기준일자</span>
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
        </div>
        {/*
          원본 [집계조건] — <b>기준일자 바로 다음</b>이다. 우리는 [집계기준]이라 부르며
          맨 뒤에 두고 있었다. 원본은 집계조건1~5 를 겹쳐 고르지만 우리 표는 축이 하나라
          거래처별·품목별 둘로 둔다.
        */}
        {([['집계조건1', axis1, setAxis1], ['집계조건2', axis2, setAxis2], ['집계조건3', axis3, setAxis3], ['집계조건4', axis4, setAxis4]] as const).map(([lb, v, set]) => (
          <div key={lb} className="flex items-center">
            <span style={{ ...label, width: 66 }}>{lb}</span>
            <select className="ec-input" value={v} style={{ width: 130 }}
                    onChange={(e) => set(e.target.value as Axis)}>
              {AXES.map((ax) => <option key={ax} value={ax}>{ax === '사용안함' ? 'none' : ax}</option>)}
            </select>
          </div>
        ))}
        {/* 원본 차례: 창고 · <b>프로젝트</b> · 담당자 · 거래처 … — 프로젝트가 거래처보다 앞이다. */}
        <div className="flex items-center">
          <span style={label}>창고</span>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseCond} onChange={setWarehouseCond} items={partnerPick.warehouses} />
        </div>
        <div className="flex items-center">
          <span style={label}>프로젝트</span>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond} items={partnerPick.projects} />
        </div>
        <div className="flex items-center">
          <span style={label}>담당자</span>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond} items={partnerPick.employees} />
        </div>
        {/* 원본 차례: [담당자] 다음, [관리항목] 앞이다(2026-09-08 실측). */}
        <div className="flex items-center">
          <span style={{ ...label, width: 100 }}>거래처관리담당자</span>
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={partnerMgrCond} onChange={setPartnerMgrCond}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </div>
        {/* 원본 차례: [프로젝트]·[담당자] 다음, [거래처] 앞이다 — 이 화면만 담당자가 끼어든다(사본 실측). */}
        <div className="flex items-center">
          <span style={label}>관리항목</span>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </div>
        <div className="flex items-center">
          <span style={label}>거래처</span>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={partnerPick.partners} />
        </div>
        <div className="flex items-center">
          <span style={{ ...label, width: 76 }}>거래처그룹1</span>
          <CodePickerField label="거래처그룹1" hideLabel width={150} emptyLabel="전체"
                           value={partnerGroupCond} onChange={setPartnerGroupCond}
                           items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        </div>
        {/* 원본 차례: … 거래처 · 품목코드 · <b>적요</b> · 거래구분. 적요는 이미 응답에 온다. */}
        <div className="flex items-center">
          <span style={label}>품목코드</span>
          <CodePickerField label="품목코드" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={partnerPick.items} />
        </div>
        <div className="flex items-center">
          <span style={{ ...label, width: 66 }}>품목구분</span>
          <select className="ec-input" value={categoryCond} style={{ width: 130 }}
                  onChange={(e) => setCategoryCond(e.target.value)}>
            <option value="">전체</option>
            {[...new Set([...sales, ...purchases].flatMap((d) => d.lines.map((l) => l.itemCategoryName))
              .filter(Boolean) as string[])].sort().map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-center">
          <span style={{ ...label, width: 66 }}>품목그룹1</span>
          <select className="ec-input" value={itemGroupCond} style={{ width: 150 }}
                  onChange={(e) => setItemGroupCond(e.target.value)}>
            <option value="">전체</option>
            {mgmt.groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="flex items-center">
          <span style={label}>적요</span>
          <input className="ec-input" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 170 }} />
        </div>
        <div className="flex items-center">
          <span style={label}>거래구분</span>
          <select className="ec-input" value={kindCond} style={{ width: 90 }}
                  onChange={(e) => setKindCond(e.target.value as '전체' | '일반' | '반품')}>
            <option>전체</option><option>일반</option><option>반품</option>
          </select>
        </div>
        {/* 원본 [거래유형] — 과세 · 면세. [거래구분](일반·반품)과 다른 축이다. */}
        <div className="flex items-center">
          <span style={{ ...label, width: 66 }}>거래유형</span>
          <select className="ec-input" value={taxTypeCond} style={{ width: 90 }}
                  onChange={(e) => setTaxTypeCond(e.target.value)}>
            <option value="">전체</option><option>과세</option><option>면세</option>
          </select>
        </div>
        {/* 원본 [집계대상](안 고르면 넷 다) · [비교기간] · 기타 체크(2026-10-21 실측). */}
        <div className="flex items-center gap-[10px]" data-testid="agg-targets">
          <span className="w-[66px] text-[12.5px] font-semibold">집계대상</span>
          {TARGETS.map((t) => (
            <label key={t} className="flex items-center gap-[3px]">
              <input type="checkbox" checked={targets.includes(t)} onChange={() => setTargets(toggle(targets, t))} />{t}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-[10px]" data-testid="agg-cmp">
          <span className="w-[66px] text-[12.5px] font-semibold">비교기간</span>
          {CMPS.map((c) => (
            <label key={c} className="flex items-center gap-[3px]">
              <input type="radio" name="cmpPeriod" checked={cmp === c} onChange={() => setCmp(c)} />{c}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-[10px]" data-testid="agg-flags">
          {([['가로보기', horizontal, setHorizontal], ['비율표시', showRatio, setShowRatio], ['코드포함', showCode, setShowCode], ['차이표시', showDiff, setShowDiff]] as const).map(([lb, v, set]) => (
            <label key={lb} className="flex items-center gap-[3px]">
              <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} />{lb}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/*
        원본 격자(2026-10-20 실측, 집계조건1 = 품목명[규격]): 머리 두 줄 — [축 │ 판매 │ 구매] 아래
        [수량 · 판매금액 · 부가세 · 합계 │ 수량 · 구매금액 · 부가세 · 합계], 끝에 '합계' 줄. 건수 · 순액 열은 없다.
      */}
      <table ref={tableRef} className="w-full text-left">
        <thead>{headRows(periodLabels, shape.colVals)}</thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={totalCols} className="ec-empty">불러오는 중…</td></tr>
          ) : needAxis ? (
            <tr><td colSpan={totalCols} className="ec-empty">집계조건은 1개 이상 선택해야 합니다</td></tr>
          ) : hMsg ? (
            <tr><td colSpan={totalCols} className="ec-empty">{hMsg}</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={totalCols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : bodyRows()}
        </tbody>
      </table>
    </EcListShell>
  )
}

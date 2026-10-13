import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useItemFlags } from '../../utils/useInactiveItems'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { stockCostMapFromLast } from '../../utils/stockValue'
import { costCategorySortKey } from '../../utils/costGroup'
import EcSortSubtotalModal, { withSubtotals, showsItem, type SortSubtotal } from '../../components/EcSortSubtotalModal'
import EcRowCap, { capRows } from '../../components/EcRowCap'
import type { Item } from '../../types/api'
import CodePickerField from '../../components/CodePickerField'
import { useCostPeriods, costPeriodText, inCostPeriod } from '../../utils/costPeriods'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

/**
 * 회계 > 실제원가현황.
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 원가집계표 | 증가내역 | 감소내역 | 수율차이 | 노무비배부액 | 경비배부액
 *   기준월 · 품목 · 생산공정 · [기타] 결재방표시 · 수량관리제외품목포함 · 사용중단품목포함
 *
 * <p>[수량관리제외품목포함]은 품목이 재고수량관리를 들게 되면서 만들 수 있게 됐다.
 * 재고를 잡지 않는 품목(용역·운반비)에 원가를 매기는 것은 뜻이 없어 기본으로 뺀다.
 *
 * <p>원본 <b>원가집계표</b>의 열은 원가생성/수정 사본의 열 id 가 알려 준다 —
 * 품목코드 · 품목명[규격] · 품목구분 · 생산공정명 ·
 * 기초(B_QTY·B_PRICE·B_AMT) · 증가(I_*) · 감소(D_*) · 기말(L_*).
 * 즉 <b>수량·단가·금액의 기초 → 증가 → 감소 → 기말 롤포워드</b>다.
 *
 * <p>우리 화면은 품목별 실제재료비·노무비·경비 네 칸이 전부였다. 그 자료는 원가생성/수정에서
 * 넣고 차이분석에서 견주는 값이라 여기서 한 번 더 보여 줄 이유가 없었고, 정작 이 화면이
 * 답해야 할 <b>"이 달에 무엇이 얼마나 들어오고 나가서 얼마가 남았나"</b>는 없었다.
 *
 * <p><b>2026-09-09 — "배부 자료가 없다" 는 이유가 틀렸다.</b> [노무비배부액]·[경비배부액]을
 * 그 이유로 안 만들고 있었는데, 배부 자료는 <b>진작 있었다</b> —
 * <code>ProcessExpense</code>(노무비/경비등록)가 기준월·공정·창고별 노무비와 경비를 들고,
 * <code>CostService.calcActual</code> 이 그 총액을 <b>표준 작업시간 비율</b>로 품목에
 * 배부해 <code>ItemCost.actualLabor·actualOverhead</code> 로 넣고 있었다.
 * 즉 <b>배부는 이미 하고 있었고 보여 주지만 않았다.</b> 그래서 이번에 만든다.
 *
 * <p>두 갈래는 같은 모양이다 — 위에 <b>배부 전</b>(공정·창고별 총액), 아래에 <b>배부 후</b>
 * (품목별 단가 × 그 달 생산수량). 두 합계를 나란히 두는 이유는, 그 달 생산이 없는 공정의
 * 총액은 <b>어디에도 안 붙기</b> 때문이다(CostService 주석). 위아래가 다르면 그 차이가
 * 곧 "붙일 곳이 없어 빠진 돈" 이고, 화면에서 그것이 보여야 한다.
 *
 * <p>[수율차이]는 그대로 안 만든다 — 공정별 투입·산출을 쌓지 않아 수율을 낼 축이 없다.
 *
 * <p><b>[생산공정명]도 2026-09-09 에 만들었다</b> — "우리 재고는 창고 단위라 공정별 재공이
 * 없다" 고 적어 두었는데, 자료를 읽어 보니 그 칸은 <b>재공을 가르는 축이 아니라</b>
 * 그 품목이 만들어지는 공정이었다(아래 <code>processMapOf</code> 주석에 실측을 적었다).
 */
type Mode = '원가집계표' | '증가내역' | '감소내역' | '노무비배부액' | '경비배부액'
const MODES = ['원가집계표', '증가내역', '감소내역', '노무비배부액', '경비배부액'] as const
/** 배부 두 갈래가 같은 표를 쓴다 — 노무비냐 경비냐만 다르다. */
const ALLOC = new Set<Mode>(['노무비배부액', '경비배부액'])

/** 노무비/경비등록 한 줄 — <b>배부 전</b> 총액. */
interface ProcessExpenseRow {
  id: number; period: string
  processName: string; warehouseName: string | null
  laborCost: number; overheadCost: number
}
/** 품목 원가 한 줄. actualLabor·actualOverhead 가 <b>배부 후 단위당</b> 값이다. */
interface CostRow {
  itemId: number; itemCode: string; itemName: string; period: string
  actualLabor: number; actualOverhead: number
}
/** 그 달 생산실적 — 배부액을 되돌리려면 수량이 있어야 한다(단가 × 수량). */
interface ProductionRow { productId: number; productionDate: string; producedQty: number }

/** BOR(작업소요시간) 한 줄 — 품목이 어느 공정에서 만들어지는가. */
interface BorRow { productId: number; processName: string; seq: number }
/**
 * 품목 → <b>생산공정명</b>. 원본 원가집계표의 넷째 칸이다.
 *
 * <p><b>2026-09-09 자료 125줄을 읽어 뜻을 가렸다.</b> 여태 "우리 재고는 창고 단위라
 * <b>공정별 재공</b>이 없어 넣을 값이 없다" 고 적어 두었는데, 그 칸은 재공을 가르는 축이
 * 아니었다 — 줄은 <b>품목별 하나</b>고(같은 품목코드가 두 번 서는 일이 0건),
 * 값이 채워진 줄은 <b>열다섯</b>뿐이며 전부 <b>만들어지는 품목</b>이다
 * (제품 완제품공정 · 반제품 반제품공정 · 시제품 시제품공정). 사 오는 원재료는 빈칸이다.
 * 즉 <b>그 품목이 어느 공정에서 만들어지는가</b>이고, 그 값은 <b>BOR</b> 이 진작 들고 있다.
 */
const processMapOf = (bors: BorRow[]) => {
  const m = new Map<number, { seq: number; name: string }>()
  for (const b of bors) {
    const cur = m.get(b.productId)
    if (!cur || b.seq < cur.seq) m.set(b.productId, { seq: b.seq, name: b.processName })
  }
  return (id: number) => m.get(id)?.name ?? ''
}

interface MovementRow {
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  opening: number
  inQty: number
  outQty: number
  closing: number
}

interface LedgerRow {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseName: string
  type: 'INBOUND' | 'OUTBOUND'
  typeName: string
  quantityChange: number
  balanceAfter: number
  unitPrice: number | null
  transactionDate: string
  note: string | null
}

const num = (n: number) => n.toLocaleString('ko-KR')
const won = (n: number | null) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'))
/**
 * 묶음별 단가 — 원본 실제원가현황은 [기초|증가|감소|기말] 넷 다 <b>수량·단가·금액</b>을 낸다.
 * 단가는 따로 저장하는 값이 아니라 <b>금액 ÷ 수량</b>이다. 수량이 0이면 빈칸으로 둔다 —
 * 0으로 찍으면 '단가가 0원' 으로 읽힌다.
 */
const unitOf = (amt: number | null, qty: number) =>
  (amt == null || qty === 0 ? '' : Math.round(amt / qty).toLocaleString('ko-KR'))

/** yyyy-MM → 그 달의 첫날·마지막날. */
function monthRange(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` }
}

/*
 * 원가집계표 [정렬/소계기준] [설정] — '정렬/소계/합계 설정' 창(2026-10-13 원본 E040804 실측). 처음 값: 1 품목구분(세트포함) (원가집계표)
 * 소계 표시 · 2 품목코드 (품목) 표시안함 · 3 없음. 합계영역은 ◉표시 로 막혀 있다(맨 아래 '누계' 가 늘 선다).
 * 소계/합계 표시항목 ◉직접설정, [소계] 줄만 — 수량 · 금액 체크, 단가 넷은 빈칸. 소계를 끄면 '… 계' 줄 없이 같은 차례로만 선다.
 * 기준 고르기는 원본이 '항목추가' 창(원가집계표 열 · 품목 마스터 항목)인데, 우리 자료에 있는 것만 둔다.
 */
const SORT_KEYS = ['기초수량 (원가집계표)', '기초단가 (원가집계표)', '기초금액 (원가집계표)', '증가수량 (원가집계표)', '증가단가 (원가집계표)',
  '증가금액 (원가집계표)', '감소수량 (원가집계표)', '감소단가 (원가집계표)', '감소금액 (원가집계표)', '기말수량 (원가집계표)',
  '기말단가 (원가집계표)', '기말금액 (원가집계표)', '품목구분(세트포함) (원가집계표)', '품목코드 (품목)', '품목명 (품목)', '규격 (품목)',
  '품목명[규격] (품목)', '단위 (품목)', '품목구분 (품목)', '생산공정명 (품목)', '품목그룹1명 (품목)']
const ITEM_COLS = ['기초수량', '기초단가', '기초금액', '증가수량', '증가단가', '증가금액', '감소수량', '감소단가', '감소금액', '기말수량', '기말단가', '기말금액']
const SORT_STORE = 'actual-cost-status-sort'
const DEFAULT_SORT: SortSubtotal = {
  lines: [{ key: '품목구분(세트포함) (원가집계표)', desc: false, subtotal: true }, { key: '품목코드 (품목)', desc: false, subtotal: false },
    { key: '', desc: false, subtotal: false }],
  total: true,
  items: { custom: true, sub: { 기초단가: false, 증가단가: false, 감소단가: false, 기말단가: false }, total: {} },
}

export default function ActualCostPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  /* 원본 격자는 [품목명[규격]] 한 칸이다 — 규격은 줄에 없어 품목 마스터에서 잇는다. */
  const specOf = (itemId: number) => items.find((x) => x.id === itemId)?.spec ?? ''
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(사본 실측). 우리는 그 칸을 늘 찍고 있었다.
   */
  const [signBox, setSignBox] = useState(false)
  const [mode, setMode] = useState<Mode>('원가집계표')
  /*
   * 원본 [기준월]은 달 고르기가 아니라 <b>원가 기간 코드도움</b>이다(2026-10-13 실측: '2026/10  ~ 2026/10  (총평균법)',
   * 월별이익현황 · 표준원가현황과 같은 '재고월별원가' 창, 기본 최근 기간). 우리는 type=month 칸이었다.
   * 여러 달 기간이면 수불 · 생산은 기간 전체로 받고, 달마다 서는 원가 · 노무비/경비는 끝 달의 것을 본다.
   */
  const [periodId, setPeriodId] = useState('')
  const { periods: costPeriods, first: firstPeriod } = useCostPeriods((f) => { if (f) setPeriodId(String(f.id)) })
  const cp = costPeriods.find((p) => String(p.id) === periodId) ?? null
  const period = cp?.endMonth ?? ''
  const rangeOf = () => (cp ? { from: monthRange(cp.startMonth).from, to: monthRange(cp.endMonth).to } : monthRange(period))
  const [keyword, setKeyword] = useState('')
  // 품목 코드도움은 id 를 준다 — 검색창(부분일치)과 칸을 나눈다. 이름이 같은 품목이 정상이라서다.
  const [itemCond, setItemCond] = useState('')
  const [withInactive, setWithInactive] = useState(true)
  const [movement, setMovement] = useState<MovementRow[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [lastPrices, setLastPrices] = useState<{ itemId: number; unitPrice: number }[]>([])
  const [expenses, setExpenses] = useState<ProcessExpenseRow[]>([])
  const [bors, setBors] = useState<BorRow[]>([])
  const processOf = useMemo(() => processMapOf(bors), [bors])
  const [costs, setCosts] = useState<CostRow[]>([])
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { inactive, untracked } = useItemFlags()
  /** [품목그룹1] — 품목 마스터에 붙는 값이라 마스터를 받아 itemId 로 잇는다. */
  const mgmt = useItemMgmt()
  /**
   * 원본 조건 판 [기타]의 <b>수량관리제외품목포함</b>. 기본은 꺼져 있다 —
   * 재고를 잡지 않는 품목(용역·운반비)에 표준원가를 매기는 것은 뜻이 없어서,
   * 원본도 체크를 켜야 보여 준다.
   */
  const [withUntracked, setWithUntracked] = useState(false)

  async function load() {
    if (!period) return
    setLoading(true)
    setError('')
    const { from, to } = rangeOf()
    try {
      const [mv, it, pu, ex, cs, pr, br] = await Promise.all([
        api.get<MovementRow[]>('/stock/movement', { params: { from, to } }),
        api.get<Item[]>('/items'),
      /*
       * <b>마지막 입고단가만 받는다.</b> 이 화면이 구매로 하는 일은 품목별 평가단가 지도
       * 하나를 만드는 것뿐인데, 여태 구매 전표를 통째로 받았다(2026-09-10 실측 984KB).
       * /purchases/item-prices 는 품목당 한 줄만 낸다.
       */
        api.get<{ itemId: number; unitPrice: number }[]>('/purchases/item-prices'),
        /*
         * 배부 두 갈래가 보는 자리. 셋 다 <b>이미 있던</b> 자리다 —
         * 노무비/경비등록의 총액, 원가의 배부 후 단가, 그리고 그 달 생산수량.
         */
        api.get<ProcessExpenseRow[]>('/process-expenses', { params: { period } }),
        api.get<CostRow[]>('/costs', { params: { period } }),
        api.get<ProductionRow[]>('/productions', { params: { from, to } }),
        /* 원가집계표 넷째 칸 [생산공정명] — 품목이 어느 공정에서 만들어지는가(위 주석). */
        api.get<BorRow[]>('/bor'),
      ])
      setMovement(mv.data)
      setItems(it.data)
      setLastPrices(pu.data)
      setExpenses(ex.data); setCosts(cs.data); setProductions(pr.data); setBors(br.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [period])

  /**
   * 단가는 재고자산평가와 <b>같은 규칙</b>(마지막 입고단가 → 품목 구매단가 → 모름).
   * 모르면 null 이다 — 0 으로 채우면 재고가 있는데 금액이 0 인 줄이 생겨,
   * 기말금액 합계가 조용히 작아진다.
   */
  const priceOf = useMemo(
    () => stockCostMapFromLast(items, lastPrices),
    [items, lastPrices],
  )

  /**
   * 품목 id → 품목구분 이름. 원본 원가집계표에 [품목구분] 열이 있고, 그 값으로 소계를 낸다.
   * 목록이 아직 안 왔으면 빈 문자열 — costGroup 이 '(미지정)' 으로 모은다(줄을 버리지 않는다).
   */
  const categoryOf = useMemo(
    () => new Map(items.map((i) => [i.id, i.categoryName ?? ''])),
    [items],
  )

  /*
   * 2026-09-08 에 원본(E040804)의 조건 판을 재니 <b>열하나</b>다(사본에는 여섯).
   * 접힌 줄은 없고 [기본]·[전체] 두 탭이 같은 판을 쓴다.
   *
   * <p>여기서 만든 둘: <b>품목구분 · 품목그룹1</b>. 품목 마스터의 값이라 줄의 itemId 로
   * 잇는다 — 품목구분은 이 화면이 <code>categoryOf</code> 로 이미 붙여 그리고 있었는데
   * <b>거를 자리만 없었다</b>(표에는 [품목구분] 열이 있다).
   *
   * <p>[기타]의 체크 셋(결재방표시 꺼짐 · 수량관리제외품목포함 꺼짐 ·
   * <b>사용중단품목포함 켜짐</b>)은 앞서 적어 둔 대조표와 실측이 그대로 맞았다.
   */
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')

  const hit = (code: string, name: string, itemId: number) => {
    if (!withInactive && inactive.has(itemId)) return false
    if (!withUntracked && untracked.has(itemId)) return false
    if (categoryCond && (categoryOf.get(itemId) ?? '') !== categoryCond) return false
    if (itemGroupCond && mgmt.groupOf(itemId) !== itemGroupCond) return false
    if (itemCond && String(itemId) !== itemCond) return false
    if (!keyword) return true
    return code.includes(keyword) || name.includes(keyword)
  }

  const summary = useMemo(() => movement
    .filter((r) => hit(r.itemCode, r.itemName, r.itemId))
    .map((r) => {
      const price = priceOf.get(r.itemId) ?? null
      const amt = (q: number) => (price == null ? null : q * price)
      return {
        ...r, price, categoryName: categoryOf.get(r.itemId) ?? '',
        openAmt: amt(r.opening), inAmt: amt(r.inQty), outAmt: amt(r.outQty), closeAmt: amt(r.closing),
      }
    })
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode)),
  [movement, priceOf, categoryOf, keyword, itemCond, withInactive, inactive, withUntracked, untracked,
    categoryCond, itemGroupCond, mgmt.groupOptions])

  /**
   * 원본 원가집계표의 <b>품목구분별 소계</b>(원재료 계 · 부재료 계 · … · 누계).
   * 순서와 '모르는 구분을 버리지 않는' 규칙은 utils/costGroup 에 있다.
   */
  const [sortOpen, setSortOpen] = useState(false)
  const [sortCfg, setSortCfg] = useState<SortSubtotal>(() => {
    try { const x = localStorage.getItem(SORT_STORE); if (x) return JSON.parse(x) as SortSubtotal } catch { /* 저장소를 못 쓰면 기본값 */ }
    return DEFAULT_SORT
  })
  type SumRow = (typeof summary)[number]
  const sortValue = (r: SumRow, key: string): string | number | null => {
    const it = items.find((x) => x.id === r.itemId)
    const unit = (amt: number | null, qty: number) => (amt == null || qty === 0 ? null : amt / qty)
    switch (key) {
      case '기초수량 (원가집계표)': return r.opening
      case '기초단가 (원가집계표)': return unit(r.openAmt, r.opening)
      case '기초금액 (원가집계표)': return r.openAmt
      case '증가수량 (원가집계표)': return r.inQty
      case '증가단가 (원가집계표)': return unit(r.inAmt, r.inQty)
      case '증가금액 (원가집계표)': return r.inAmt
      case '감소수량 (원가집계표)': return r.outQty
      case '감소단가 (원가집계표)': return unit(r.outAmt, r.outQty)
      case '감소금액 (원가집계표)': return r.outAmt
      case '기말수량 (원가집계표)': return r.closing
      case '기말단가 (원가집계표)': return r.price
      case '기말금액 (원가집계표)': return r.closeAmt
      case '품목구분(세트포함) (원가집계표)': case '품목구분 (품목)': return costCategorySortKey(r.categoryName)
      case '품목코드 (품목)': return r.itemCode
      case '품목명 (품목)': return r.itemName
      case '규격 (품목)': return it?.spec ?? ''
      case '품목명[규격] (품목)': return `${r.itemName}${it?.spec ? ` [${it.spec}]` : ''}`
      case '단위 (품목)': return it?.unit ?? ''
      case '생산공정명 (품목)': return processOf(r.itemId)
      case '품목그룹1명 (품목)': return mgmt.groupOf(r.itemId) ?? ''
      default: return ''
    }
  }
  const groupLabel = (r: SumRow, key: string) => {
    if (key.startsWith('품목구분')) return r.categoryName || '(미지정)'
    const v = sortValue(r, key)
    return typeof v === 'number' ? won(v) : (v ?? '')
  }
  const out = withSubtotals(summary, sortCfg, sortValue, groupLabel)
  /* 소계 줄 칸은 표시항목을 map 으로 찍는다 — 개발 중에는 그린 표의 열 수를 잰다. */
  const gridRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(gridRef, '실제원가현황 원가집계표', [out.length, sortCfg, mode])

  /*
   * <b>수불부 줄은 그 보기를 눌렀을 때 받는다.</b> 다섯 보기 중 [증가내역]·[감소내역]만
   * 이 줄을 쓰는데, 화면을 열자마자 전 기간 줄을 통째로 받고 있었다
   * (2026-09-10 실측 <b>14,190KB</b> · 화면 합계 14,284KB). 기본 보기인 [원가집계표] 는
   * 그 줄을 한 번도 안 쓴다 — /stock/movement 가 낸 합으로 그린다.
   *
   * <p>받을 때는 <b>여전히 all:true</b> 다. 이 표는 줄을 합산해 실제원가를 내므로
   * 앞부분만 받으면 합계가 조용히 틀린다 — 느린 것보다 나쁘다.
   */
  const needLedger = mode === '증가내역' || mode === '감소내역'
  const ledgerFor = useRef('')
  useEffect(() => {
    if (!needLedger || ledgerFor.current === period) return
    const { from, to } = rangeOf()
    ledgerFor.current = period
    api.get<{ opening: number; rows: LedgerRow[] }>('/stock/ledger', { params: { from, to, all: true } })
      .then((r) => setLedger(r.data.rows))
      .catch((err) => { ledgerFor.current = ''; setError(extractErrorMessage(err)) })
  }, [needLedger, period])

  const detail = useMemo(() => ledger
    .filter((r) => (mode === '증가내역' ? r.quantityChange > 0 : r.quantityChange < 0))
    .filter((r) => hit(r.itemCode, r.itemName, r.itemId))
    .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : a.transactionDate > b.transactionDate ? -1 : b.id - a.id)),
  [ledger, mode, keyword, itemCond, withInactive, inactive, withUntracked, untracked,
    categoryCond, itemGroupCond, mgmt.groupOptions])

  /*
   * <b>그리는 줄만 자른다.</b> 아래 합계는 <code>detail</code> 전부를 더하므로 숫자는 안 변한다 —
   * 6만 줄을 한 번에 깔면 탭이 얼어붙기 때문에 표만 줄이는 것이다(2026-09-10 실측
   * 63,486줄에서 렌더러가 멈췄다). 자른 것은 표 위에 적는다.
   */
  const detailShown = useMemo(() => capRows(detail), [detail])

  /**
   * <b>배부 전</b> — 노무비/경비등록의 공정·창고별 총액. 그 달 것만 본다.
   * 서버가 이미 기준월로 걸러 주지만, 화면에서 달을 바꾼 직후 옛 자료가 잠깐 남는 것을
   * 막으려고 한 번 더 건다(다른 표들도 같은 규칙이다).
   */
  const allocBefore = useMemo(
    () => expenses.filter((e) => e.period === period),
    [expenses, period])

  /** 그 달 품목별 생산수량 — 배부 후 단가에 곱할 값이다. */
  const producedByItem = useMemo(() => {
    const m = new Map<number, number>()
    for (const pr of productions) {
      if (cp ? !inCostPeriod(cp, pr.productionDate.slice(0, 7)) : pr.productionDate.slice(0, 7) !== period) continue
      m.set(pr.productId, (m.get(pr.productId) ?? 0) + pr.producedQty)
    }
    return m
  }, [productions, period])

  /**
   * <b>배부 후</b> — 품목별 [단위당 × 생산수량]. 그 달에 만든 적이 없는 품목은 뺀다
   * (원가 줄은 남아 있어도 <b>이 달에 배부된 돈은 없다</b> — 0 줄을 그리면 합계가
   * 안 맞는 까닭을 못 찾는다).
   */
  const allocAfter = useMemo(() => costs
    .filter((c) => c.period === period)
    .map((c) => {
      const qty = producedByItem.get(c.itemId) ?? 0
      const unit = mode === '경비배부액' ? c.actualOverhead : c.actualLabor
      return { ...c, qty, unit, amount: qty * unit }
    })
    .filter((r) => r.qty > 0)
    .sort((a, b) => b.amount - a.amount),
  [costs, period, producedByItem, mode])

  const allocTotals = useMemo(() => ({
    before: allocBefore.reduce((n, e) => n + (mode === '경비배부액' ? e.overheadCost : e.laborCost), 0),
    after: allocAfter.reduce((n, r) => n + r.amount, 0),
  }), [allocBefore, allocAfter, mode])

  /** 묶음의 수량 · 금액 합 — 소계 줄과 누계 줄이 같은 규칙으로 더한다. */
  function sumOf(list: typeof summary) {
    return list.reduce((a, r) => ({
      openQty: a.openQty + r.opening, open: a.open + (r.openAmt ?? 0), inQty: a.inQty + r.inQty, in: a.in + (r.inAmt ?? 0),
      outQty: a.outQty + r.outQty, out: a.out + (r.outAmt ?? 0), closeQty: a.closeQty + r.closing, close: a.close + (r.closeAmt ?? 0),
      unknown: a.unknown + (r.price == null && (r.opening || r.inQty || r.outQty || r.closing) ? 1 : 0),
    }), { openQty: 0, open: 0, inQty: 0, in: 0, outQty: 0, out: 0, closeQty: 0, close: 0, unknown: 0 })
  }
  const totals = sumOf(summary)

  return (
    <EcListShell
      title="실제원가현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        /* 처음 연 판으로 — 사용중단품목포함은 켜짐이 기본이다(위 실측). 예전엔 꺼 버리고 품목구분 · 품목그룹1 · 수량관리제외는 남겼다. */
        { label: '다시 작성', onClick: () => { setPeriodId(firstPeriod ? String(firstPeriod.id) : ''); setKeyword(''); setItemCond(''); setWithInactive(true); setCategoryCond(''); setItemGroupCond(''); setWithUntracked(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
      signLine={signBox}
    >
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          <div className="ec-pills">
            {MODES.map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="기준월" pick>
          <CodePickerField label="기준월" hideLabel width={260} placeholder="기준월"
                           value={periodId} onChange={setPeriodId}
                           items={costPeriods.map((p) => ({ value: String(p.id), name: costPeriodText(p) }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={itemCond} onChange={(v) => setItemCond(v)}
                           items={pickers.items} />
        </EcCond>
        {/*
          원본 차례(2026-09-08 실측, 열하나): 구분 · 기준월 · 품목 ·
          <b>품목구분 · 품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) · 생산공정 ·
          기타 · 정렬/소계기준. 표준원가현황과 같은 모양이다.
        */}
        <EcCond label="품목구분" pick>
          <select className="ec-input" value={categoryCond} style={{ width: 140 }}
                  onChange={(e) => setCategoryCond(e.target.value)}>
            <option value="">전체</option>
            {[...new Set(items.map((i) => i.categoryName).filter(Boolean) as string[])].sort()
              .map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <select className="ec-input" value={itemGroupCond} style={{ width: 160 }}
                  onChange={(e) => setItemGroupCond(e.target.value)}>
            <option value="">전체</option>
            {mgmt.groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </EcCond>
        {/* 원본 [기타] 차례(2026-10-13 실측): 결재방표시 · 수량관리제외품목포함 · 사용중단품목포함. 예전엔 결재방표시가 따로 한 줄이었다. */}
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            결재방표시
          </label>
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={withUntracked} onChange={(e) => setWithUntracked(e.target.checked)} />
            수량관리제외품목포함
          </label>
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
            사용중단품목포함
          </label>
        </EcCond>
        <EcCond label="정렬/소계기준">
          <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy text-[12px]"
                  onClick={() => setSortOpen(true)}>설정</button>
        </EcCond>
      </ul>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {ALLOC.has(mode) ? (
        <div className="overflow-x-auto">
          {/*
            <b>배부 전</b> — 노무비/경비등록에 적힌 그 달 공정·창고별 총액.
            창고를 안 정한 줄은 원본과 같이 <b>전사 공통</b>이다(빈칸으로 둔다).
          */}
          <h3 className="text-[13px] font-bold mt-0 mx-0 mb-[6px]">
            배부 전 — 노무비/경비등록 ({period})
          </h3>
          <table className="ec-grid w-full text-left" style={{ marginBottom: 14 }}>
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th>생산공정명</th>
                <th className="w-[160px]">창고명</th>
                <th className="w-[160px] text-right">{mode === '경비배부액' ? '경비' : '노무비'}</th>
              </tr>
            </thead>
            <tbody>
              {allocBefore.length === 0 ? (
                <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : allocBefore.map((e, i) => (
                <tr key={e.id}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{e.processName}</td>
                  <td style={{ color: e.warehouseName ? undefined : 'var(--ec-text-hint)' }}>{e.warehouseName ?? '(전사 공통)'}</td>
                  <td className="text-right">{won(mode === '경비배부액' ? e.overheadCost : e.laborCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-ec-page">
                <td colSpan={3} className="text-right">누계</td>
                <td className="text-right">{won(allocTotals.before)}</td>
              </tr>
            </tfoot>
          </table>

          {/*
            <b>배부 후</b> — 그 총액을 표준 작업시간 비율로 품목에 나눈 결과다
            (CostService.calcActual 이 그렇게 넣는다). 단위당 값을 그 달 생산수량에
            곱해 되돌린다.
          */}
          <h3 className="text-[13px] font-bold mt-0 mx-0 mb-[6px]">배부 후 — 품목별</h3>
          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th>품목코드</th>
                <th>품목명</th>
                <th className="w-[120px] text-right">생산수량</th>
                <th className="w-[140px] text-right">단위당</th>
                <th className="w-[160px] text-right">배부액</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
              ) : allocAfter.length === 0 ? (
                <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : allocAfter.map((r, i) => (
                <tr key={r.itemId}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{r.itemCode}</td>
                  <td>{r.itemName}</td>
                  <td className="text-right">{num(r.qty)}</td>
                  <td className="text-right">{won(r.unit)}</td>
                  <td className="text-right font-semibold text-ec-navy">{won(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-ec-page">
                <td colSpan={5} className="text-right">누계 ({allocAfter.length}품목)</td>
                <td className="text-right text-ec-navy">{won(allocTotals.after)}</td>
              </tr>
            </tfoot>
          </table>
          {/*
            <b>위아래가 다를 수 있다.</b> 그 달 생산이 없는 공정의 총액은 어디에도 안 붙는다 —
            없는 근거로 아무 품목에나 얹지 않기 때문이다(CostService 주석). 그 차이를 숨기지
            않고 적는다. 숨기면 "왜 노무비가 모자라지" 를 이 화면에서 못 찾는다.
          */}
          {Math.round(allocTotals.before) !== Math.round(allocTotals.after) && (
            <p className="text-[12.5px] text-ec-warn mt-[8px]">
              ※ 배부 전 {won(allocTotals.before)} · 배부 후 {won(allocTotals.after)} —
              차이 <b>{won(allocTotals.before - allocTotals.after)}</b> 는 그 달 생산이 없어
              붙일 품목이 없던 공정의 몫입니다.
            </p>
          )}
        </div>
      ) : mode === '원가집계표' ? (
        <div ref={gridRef} className="overflow-x-auto">
          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                {/* 원본 원가집계표는 줄 번호 칸이 없다(2026-10-13 실측 16칸). */}
                <th>품목코드</th>
                {/* 원본은 규격을 품목명 뒤 대괄호에 붙인다(2026-09-09 실측). */}
                <th>품목명[규격]</th>
                {/* 원본 원가집계표의 [품목구분]. 이 값으로 소계를 낸다. */}
                <th className="w-[80px]">품목구분</th>
                {/* 원본 넷째 칸. BOR 이 없는 품목(사 오는 원재료)은 빈칸이다 — 원본도 그렇다. */}
                <th className="w-[100px]">생산공정명</th>
                {/*
                  2026-09-09 원본 실측(E040804). 원본은 <b>머리가 두 줄</b>이라
                  [기초|증가|감소|기말] 아래에 <b>수량·단가·금액</b> 이 각각 달린다.
                  우리는 네 묶음 중 <b>기말에만 단가</b>를 두고 나머지 셋은 수량·금액만
                  두고 있었다 — 그러면 "기초 단가가 얼마였는데 증가분이 얼마에 들어와
                  기말이 이렇게 됐다" 를 화면에서 읽을 수 없다. 셋을 마저 낸다.
                  [단가]도 <b>[기말단가]</b> 로 고쳐 네 묶음 이름을 나란히 맞췄다.
                */}
                <th className="text-right">기초수량</th>
                <th className="text-right">기초단가</th>
                <th className="text-right">기초금액</th>
                <th className="text-right">증가수량</th>
                <th className="text-right">증가단가</th>
                <th className="text-right">증가금액</th>
                <th className="text-right">감소수량</th>
                <th className="text-right">감소단가</th>
                <th className="text-right">감소금액</th>
                <th className="text-right">기말수량</th>
                <th className="text-right">기말단가</th>
                <th className="text-right">기말금액</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={16} className="ec-empty">불러오는 중…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={16} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : out.map((o) => {
                if (o.kind === 'row') {
                  const r = o.row
                  return (
                <tr key={r.itemId}>
                  <td>{r.itemCode}</td>
                  <td>{r.itemName}{specOf(r.itemId) ? ` [${specOf(r.itemId)}]` : ''}</td>
                  <td>{r.categoryName}</td>
                  <td>{processOf(r.itemId)}</td>
                  <td className="text-right">{num(r.opening)}</td>
                  <td className="text-right">{unitOf(r.openAmt, r.opening)}</td>
                  <td className="text-right">{won(r.openAmt)}</td>
                  <td className="text-right">{num(r.inQty)}</td>
                  <td className="text-right">{unitOf(r.inAmt, r.inQty)}</td>
                  <td className="text-right">{won(r.inAmt)}</td>
                  <td className="text-right">{num(r.outQty)}</td>
                  <td className="text-right">{unitOf(r.outAmt, r.outQty)}</td>
                  <td className="text-right">{won(r.outAmt)}</td>
                  {/* 기말수량이 음수면 그 자체가 문제다. 0으로 감추면 아무도 못 본다. */}
                  <td className={`text-right${r.closing < 0 ? ' text-ec-danger' : ''}`}>{num(r.closing)}</td>
                  <td className={`text-right${r.price == null ? ' text-ec-off' : ''}`}>{won(r.price)}</td>
                  <td className="text-right">{won(r.closeAmt)}</td>
                </tr>
                  )
                }
                /* 원본 소계 줄: '원재료 계' — 이름은 네 칸을 묶어 가운데, 수량 · 금액만(표시항목 직접설정), 회색(#f3f3f3) 굵게. */
                const t = sumOf(o.list)
                const val: Record<string, string> = {
                  기초수량: num(t.openQty), 기초단가: unitOf(t.open, t.openQty), 기초금액: won(t.open),
                  증가수량: num(t.inQty), 증가단가: unitOf(t.in, t.inQty), 증가금액: won(t.in),
                  감소수량: num(t.outQty), 감소단가: unitOf(t.out, t.outQty), 감소금액: won(t.out),
                  기말수량: num(t.closeQty), 기말단가: unitOf(t.close, t.closeQty), 기말금액: won(t.close),
                }
                return (
                  <tr key={o.key} className="font-bold bg-ec-stripe">
                    <td colSpan={4} className="text-center">{o.label} 계</td>
                    {ITEM_COLS.map((c) => <td key={c} className="text-right">{showsItem(sortCfg, 'sub', c) ? val[c] : ''}</td>)}
                  </tr>
                )
              })}
            </tbody>
            {summary.length > 0 && (
              <tfoot>
                {/* 원본은 맨 아래를 '합계' 가 아니라 [누계] 라고 적는다 — 이름 네 칸 가운데, #e9ecef 굵게, 수량 · 금액. */}
                <tr className="font-bold bg-ec-disabled">
                  <td colSpan={4} className="text-center">누계</td>
                  <td className="text-right">{num(totals.openQty)}</td><td />
                  <td className="text-right">{won(totals.open)}</td>
                  <td className="text-right">{num(totals.inQty)}</td><td />
                  <td className="text-right">{won(totals.in)}</td>
                  <td className="text-right">{num(totals.outQty)}</td><td />
                  <td className="text-right">{won(totals.out)}</td>
                  <td className="text-right">{num(totals.closeQty)}</td><td />
                  <td className="text-right">
                    {won(totals.close)}
                    {totals.unknown > 0 && (
                      <span title={`단가를 모르는 품목 ${totals.unknown}건은 금액에서 뺐습니다.`} className="text-ec-warn"> *</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <EcRowCap capped={detailShown.capped} shown={detailShown.rows.length} total={detailShown.total}
                    hint="기준월을 좁히거나 품목으로 찾으세요." />
          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th className="w-[100px]">일자</th>
                <th>품목코드</th>
                <th>품목명</th>
                <th>창고</th>
                <th className="text-right">수량</th>
                <th className="text-right">단가</th>
                <th className="text-right">금액</th>
                <th>적요</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
              ) : detail.length === 0 ? (
                <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : detailShown.rows.map((r, i) => {
                /* 거래에 단가가 남아 있으면 그것이 맞다 — 평가단가는 그 자리를 메우는 값일 뿐이다. */
                const price = r.unitPrice != null && r.unitPrice > 0 ? r.unitPrice : (priceOf.get(r.itemId) ?? null)
                const qty = Math.abs(r.quantityChange)
                return (
                  <tr key={r.id}>
                    <td className="text-center text-ec-hint">{i + 1}</td>
                    <td>{r.transactionDate.replace(/-/g, '/')}</td>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td>{r.warehouseName}</td>
                    <td className="text-right">{num(qty)} <span className="text-[11px] text-ec-hint">{r.unit}</span></td>
                    <td style={{ textAlign: 'right', color: price == null ? 'var(--ec-text-off)' : 'var(--ec-label)' }}>{won(price)}</td>
                    <td className="text-right font-bold">{won(price == null ? null : qty * price)}</td>
                    <td className="text-ec-label">{r.note ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
            {detail.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-ec-page">
                  <td colSpan={5} className="text-right">합계 ({detail.length}건)</td>
                  <td className="text-right">
                    {num(detail.reduce((n, r) => n + Math.abs(r.quantityChange), 0))}
                  </td>
                  <td></td>
                  <td className="text-right text-ec-navy">
                    {won(detail.reduce((n, r) => {
                      const price = r.unitPrice != null && r.unitPrice > 0 ? r.unitPrice : (priceOf.get(r.itemId) ?? null)
                      return n + (price == null ? 0 : Math.abs(r.quantityChange) * price)
                    }, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {sortOpen && (
        <EcSortSubtotalModal keys={SORT_KEYS} itemCols={ITEM_COLS} pageSplit totalLocked width={1067} value={sortCfg}
          onApply={(v) => { setSortCfg(v); setSortOpen(false) }}
          onSave={(v) => { try { localStorage.setItem(SORT_STORE, JSON.stringify(v)) } catch { /* 저장소를 못 쓰면 이번만 */ } }}
          onClose={() => setSortOpen(false)} />
      )}
    </EcListShell>
  )
}

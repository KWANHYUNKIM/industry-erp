import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import { EcCond, EcCondTabs } from '../../../components/EcStatusPanel'
import { ecAlert } from '../../../components/EcDialog'
import { useItemFlags } from '../../../utils/useInactiveItems'
import { useItemMgmt } from '../../../utils/itemMgmtItems'
import type { Item } from '../../../types/api'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { useCondPickers } from '../../../utils/useCondPickers'
import { useCostPeriods, costPeriodText, inCostPeriod } from '../../../utils/costPeriods'

/** 원본 [Option] (이익관리 현황 3화면 2026-10-22 실측) — 검색항목설정 · 양식설정 ▸(✓ 기본(수정불가) · ✓ 현재 양식 · 신규양식추가). 양식 · 검색항목 디자이너는 두지 않는다. */
const OPTION_MENU = [
  { label: '검색항목설정', onClick: () => void ecAlert('검색항목설정은 지원하지 않습니다.') },
  { label: '양식설정', onClick: () => void ecAlert('양식설정은 지원하지 않습니다(양식 하나).') },
]

/**
 * 품목 → <b>생산공정명</b>. 원본 원가 화면 셋이 이 칸을 둔다.
 *
 * <p><b>2026-09-09 실측으로 뜻을 가렸다.</b> 여태 "우리 재고는 창고 단위라 <b>공정별 재공</b>이
 * 없어 그 칸에 넣을 값이 없다" 고 적어 두고 셋 다 안 만들고 있었는데, 원본 실제원가현황
 * (E040804)의 자료 125줄을 읽어 보니 <b>그 칸은 재공을 가르는 축이 아니었다</b> —
 * <ul>
 *   <li>줄은 <b>품목별 하나</b>다(같은 품목코드가 두 번 서는 일이 0건)</li>
 *   <li>[생산공정명]이 채워진 줄은 <b>열다섯</b>뿐이고 전부 <b>만들어지는 품목</b>이다
 *       (제품 완제품공정 · 반제품 반제품공정 · 시제품 시제품공정). 사 오는 원재료는 빈칸이다</li>
 * </ul>
 * 즉 <b>그 품목이 어느 공정에서 만들어지는가</b>이고, 그 값은 <b>BOR</b>(품목이 거치는 작업)이
 * 진작 들고 있다. 작업지시서별진행현황이 이미 같은 자리를 그렇게 쓴다.
 *
 * <p>BOR 이 없는 품목은 <b>빈칸</b>이다 — 원본도 그렇다. 창고 이름을 공정처럼 갖다 쓰지 않는다.
 */
interface BorRow { productId: number; processName: string; seq: number }
/** BOR 의 <b>첫 작업</b>(작업순서가 가장 앞선 줄)이 그 품목의 공정이다. */
function processMapOf(bors: BorRow[]) {
  const m = new Map<number, { seq: number; name: string }>()
  for (const b of bors) {
    const cur = m.get(b.productId)
    if (!cur || b.seq < cur.seq) m.set(b.productId, { seq: b.seq, name: b.processName })
  }
  return (id: number) => m.get(id)?.name ?? ''
}

/**
 * 회계 > 차이분석.
 *
 * <p>2026-09-08 에 원본(<b>E040809</b>)을 열어 조건 판을 재니 <b>열하나</b>다 —
 * 사본에는 여섯뿐이었다. 접힌 줄은 없고 [기본]·[전체] 두 탭이 같은 판을 쓴다.
 * 차례: 구분 · 기준월 · 품목 · <b>품목구분 · 품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) ·
 * 생산공정 · 기타 · 정렬/소계기준. 실제원가현황(E040804)과 같은 판이다.
 *
 * <p>화면코드도 이번에 바로잡았다 — 대조표에 <b>ESS017R</b> 이라 적혀 있었는데
 * 주소창의 <code>prgId</code> 는 <b>E040809</b> 였다.
 *
 * <p>원본 조건 판:
 *   [구분] 원가비교집계표 | 재료비단가차이 | 소모수량차이 | 노무비/경비/외주비차이
 *   기준월 · 품목 · 생산공정 · [기타] 결재방표시 · 수량관리제외품목포함 · 사용중단품목포함 ·
 *
 * <p>[수량관리제외품목포함]은 품목이 재고수량관리를 들게 되면서 만들 수 있게 됐다.
 * 재고를 잡지 않는 품목에 원가차이를 따지는 것은 뜻이 없어 기본으로 뺀다.
 *   정렬/소계기준 · 합계표시
 *
 * <p>우리 화면은 표준·실제 <b>총액</b> 비교 한 갈래뿐이었다(그리고 제목도 원본에 없는
 * '원가차이분석' 이었다). 총액만 보면 차이가 났다는 것만 알 뿐 <b>왜</b>인지를 모른다 —
 * 비싸게 산 것인지, 많이 쓴 것인지가 갈려야 손 쓸 곳이 정해진다.
 *
 * <p>부호는 원본대로 <b>차이 = 표준 − 실제</b>(2026-10-21 실측 — 실제가 비싸거나 많이 쓰면 음수).
 *
 * <p>원본의 '노무비/경비/외주비차이' 에서 <b>외주비는 뺐다.</b> 외주비를 따로 잡는 자료가
 * 우리에겐 없다(외주는 구매전표로 들어온다). 이름에 넣어 두면 늘 0 인 칸이 생겨,
 * 외주비 차이가 없다는 말처럼 보인다.
 */
type Mode = '원가비교집계표' | '재료비단가차이' | '소모수량차이' | '노무비/경비/외주비차이'
const MODES = ['원가비교집계표', '재료비단가차이', '소모수량차이', '노무비/경비/외주비차이'] as const

interface Cost {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  period: string
  materialCost: number
  laborCost: number
  overheadCost: number
  standardTotal: number
  actualMaterial: number
  actualLabor: number
  actualOverhead: number
  actualTotal: number
  variance: number
  varianceRate: number
}

interface BomRow { productId: number; lines: { componentId: number; componentName: string; quantity: number }[] }
interface ProductionRow {
  id: number
  productId: number
  producedQty: number
  productionDate: string
  materials: { componentId: number; componentCode: string; componentName: string; quantity: number }[]
}

/** 원가비교집계표 · 노무비/경비/외주비차이 출력물은 0 · 모름을 찍지 않는다(2026-10-20 원본 실측 — 표준원가가 없는 품목은 단가 · 금액 칸이 빈칸). */
const nz = (n: number | null | undefined) => (n == null || Math.round(n) === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 재료비단가차이 · 소모수량차이는 0.5 를 0 에서 먼 쪽으로 올린다(원본 −1,919.5 → '-1,920', −358,946.5 → '-358,947'). */
const nzr = (n: number | null | undefined) => {
  if (n == null) return ''
  const r = Math.sign(n) * Math.round(Math.abs(n))
  return r === 0 ? '' : r.toLocaleString('ko-KR')
}

/** 원가생성/수정이 만든 원가계산내역 한 줄(GET /cost-periods/{id}/ledger) — 감소 단가가 실제단가다. */
interface CostLedgerRow { itemId: number; decreaseQty: number; decreaseAmount: number }

export default function VariancePage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(사본 실측). 우리는 그 칸을 늘 찍고 있었다.
   */
  const [signBox, setSignBox] = useState(false)
  const [mode, setMode] = useState<Mode>('원가비교집계표')
  const [costs, setCosts] = useState<Cost[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [bors, setBors] = useState<BorRow[]>([])
  const processOf = useMemo(() => processMapOf(bors), [bors])
  /* 원가생성/수정이 만든 그 기간 원가계산내역 — 소모품목 실제단가(감소 단가)가 여기서 나온다. */
  const [ledger, setLedger] = useState<CostLedgerRow[]>([])
  const [boms, setBoms] = useState<BomRow[]>([])
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [keyword, setKeyword] = useState('')
  // 품목 코드도움은 id 를 준다 — 검색창(부분일치)과 칸을 나눈다. 이름이 같은 품목이 정상이라서다.
  const [itemCond, setItemCond] = useState('')
  /*
   * 원본 [기준월] — 원가 기간 코드도움(2026-10-13 실측, 월별이익현황 · 표준원가현황 · 실제원가현황과 같은 '재고월별원가' 창,
   * 기본 최근 기간). 우리는 자료에 있는 달을 모은 '전체' 고름칸이었다. 비우면 전체 달을 본다.
   */
  const [periodId, setPeriodId] = useState('')
  const { periods: costPeriods, first: firstPeriod } = useCostPeriods((f) => { if (f) setPeriodId(String(f.id)) })
  const cp = costPeriods.find((p) => String(p.id) === periodId) ?? null
  const [withInactive, setWithInactive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { inactive, untracked, categoryOf } = useItemFlags()
  /* 원본 격자는 [품목명[규격]] 한 칸이다 — 규격은 줄에 없어 품목 마스터에서 잇는다. */
  const specOf = (itemId: number) => items.find((x) => x.id === itemId)?.spec ?? ''
  /**
   * [품목구분]·[품목그룹1] — 둘 다 품목 마스터에 붙는 값이라 줄의 itemId 로 잇는다.
   * 네 갈래(원가비교집계표·재료비단가차이·소모수량차이·노무비/경비차이) 모두 품목별 줄이라
   * 거르는 자리는 <code>hit()</code> 하나면 된다.
   */
  const mgmt = useItemMgmt()
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  /**
   * 원본 조건 판 [기타]의 <b>수량관리제외품목포함</b>. 기본은 꺼져 있다 —
   * 재고를 잡지 않는 품목(용역·운반비)에 표준원가를 매기는 것은 뜻이 없어서,
   * 원본도 체크를 켜야 보여 준다.
   */
  const [withUntracked, setWithUntracked] = useState(false)
  /** 원본 [생산공정] — 그 품목이 만들어지는 공정(BOR 첫 작업, 위 processMapOf). */
  const [processCond, setProcessCond] = useState('')

  /* 기준월이 정해지기 전(빈 값) 부른 것이 늦게 오면 원가계산내역을 비워 버린다 — 마지막 부른 것만 받는다. */
  const loadSeq = useRef(0)
  /* 세 보기(원가비교집계표 · 재료비단가차이/소모수량차이 · 그 밖)가 표를 갈아 끼우고 머리가 2줄이라 정적 검사가 못 센다 — 그려진 표를 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '차이분석', [mode, loading, costs, ledger, boms, productions])
  async function load() {
    const seq = ++loadSeq.current
    setLoading(true)
    setError('')
    try {
      const [c, i, br, b, pr, lg] = await Promise.all([
        api.get<Cost[]>('/costs'),
        api.get<Item[]>('/items'),
        api.get<BorRow[]>('/bor'),
        api.get<BomRow[]>('/boms'),
        api.get<ProductionRow[]>('/productions'),
        periodId ? api.get<{ rows: CostLedgerRow[] }>(`/cost-periods/${periodId}/ledger`) : Promise.resolve(null),
      ])
      if (seq !== loadSeq.current) return
      setCosts(c.data); setItems(i.data); setBors(br.data)
      setBoms(b.data); setProductions(pr.data); setLedger(lg?.data.rows ?? [])
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }
  useEffect(() => { load() }, [periodId])

  const inPeriod = (yyyymm: string) => !cp || inCostPeriod(cp, yyyymm)
  const catOf = useMemo(() => new Map(items.map((i) => [i.id, i.categoryName])), [items])
  const hit = (itemId: number, code: string, name: string) => {
    if (!withInactive && inactive.has(itemId)) return false
    if (!withUntracked && untracked.has(itemId)) return false
    if (categoryCond && (catOf.get(itemId) ?? '') !== categoryCond) return false
    if (itemGroupCond && mgmt.groupOf(itemId) !== itemGroupCond) return false
    if (itemCond && String(itemId) !== itemCond) return false
    if (!keyword) return true
    return code.includes(keyword) || name.includes(keyword)
  }

  const nameOf = useMemo(() => new Map(items.map((i) => [i.id, { code: i.code, name: i.name }])), [items])

  // ── 원가비교집계표 (기존 표. 원본 이름으로)
  /*
   * 원본 <b>원가비교집계표</b>(2026-09-09 E040809 실측)는 단가만이 아니라
   * <b>생산수량 · 표준금액 · 실제금액 · 차이</b>까지 낸다 — 단가 차이가 작아 보여도
   * 많이 만든 품목이면 금액 차이는 크다. 그 넷을 만든다.
   *
   * <p><b>생산수량은 생산실적에서 그 달치를 더한다.</b> 실적이 없는 품목은 0 이 아니라
   * <b>모른다</b>로 둔다(null) — 0 으로 채우면 금액도 차이도 0 이 되어
   * <b>단가가 어긋난 사실이 화면에서 사라진다</b>.
   */
  const producedOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const pr of productions) {
      const key = pr.productId + '|' + pr.productionDate.slice(0, 7)
      m.set(key, (m.get(key) ?? 0) + pr.producedQty)
    }
    return m
  }, [productions])
  /*
   * <b>2026-10-20 원본 실측: 줄은 그 기간에 생산한 품목뿐이다</b>(2026/10 — A001 · C001 · E001 · G001, 생산수량 360 · 180 …,
   * 표준 · 실제가 비어도 줄은 선다). 우리는 원가 줄(/costs — 재고 기록이 있는 품목 전부)을 다 깔고 생산이 없으면 '—' 였다.
   * 품목구분 차례로 묶어 '<구분> 계' 와 '합계' 줄을 단다(원본 '제품 계' · '합계').
   */
  /*
   * 원본 실제금액 = <b>그 달 생산입고가 소모한 재료비</b>(소모수량 × 원가생성 결과 그 소모품목의 감소 단가),
   * 실제단가 = 실제금액 ÷ 생산수량(2026-10-21 4바퀴 실측 — C001 7개 생산 · 배추 8 · 고추가루 0.7 · 포장재 7:
   * 15,356 + 7,003 + 355 = 22,714, 단가 22,714 ÷ 187 = 121 / 수량만 9 로 고치면 금액은 22,714 그대로 · 단가 120).
   * 우리는 원가 줄(/costs) 의 actualTotal × 수량이라 근거가 달랐다(ITM-0002 12,278).
   * 노무비 · 경비 실제분은 원가 줄의 실제 노무비 · 경비 단가 × 수량을 더한다(원본은 그 달 배부가 0 이라 못 잼).
   */
  const ledgerPriceOf = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of ledger) {
      const q = Number(r.decreaseQty)
      if (q > 0 && Number(r.decreaseAmount) !== 0) m.set(r.itemId, Number(r.decreaseAmount) / q)
    }
    return m
  }, [ledger])
  const materialActualOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const pr of productions) {
      const key = pr.productId + '|' + pr.productionDate.slice(0, 7)
      const amt = (pr.materials ?? []).reduce((n, x) => n + x.quantity * (ledgerPriceOf.get(x.componentId) ?? 0), 0)
      m.set(key, (m.get(key) ?? 0) + amt)
    }
    return m
  }, [productions, ledgerPriceOf])
  const compareRows = costs
    .filter((r) => inPeriod(r.period))
    .filter((r) => hit(r.itemId, r.itemCode, r.itemName))
    .filter((r) => !processCond || processOf(r.itemId) === processCond)
    .map((r) => {
      const qty = producedOf.get(r.itemId + '|' + r.period) ?? 0
      const actAmount = Math.round((materialActualOf.get(r.itemId + '|' + r.period) ?? 0) + (r.actualLabor + r.actualOverhead) * qty)
      const stdAmount = r.standardTotal * qty
      return {
        ...r,
        producedQty: qty,
        stdAmount,
        actUnit: qty > 0 ? actAmount / qty : 0,
        actAmount,
        /* 원본 차이 = 표준 − 실제(2026-10-21 실측 C001 표준 빈칸 · 실제 22,714 → 차이 -22,714). */
        diffAmount: stdAmount - actAmount,
      }
    })
    .filter((r) => r.producedQty > 0)
    .sort((a, b) => (categoryOf(a.itemId) || '').localeCompare(categoryOf(b.itemId) || '') || a.itemCode.localeCompare(b.itemCode))
  /** 품목구분별로 끊는다 — [[구분, 줄들]]. */
  const byCategory = (rows: typeof compareRows) => {
    const m = new Map<string, typeof compareRows>()
    for (const r of rows) {
      const k = categoryOf(r.itemId) || ''
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return [...m.entries()]
  }

  /*
   * ── 재료비단가차이 · 소모수량차이 (2026-10-21 원본 E040809 실측 — 생산입고 II C001 포장김치 7, 소모 배추 8 · 고추가루 0.7 · 포장재 7,
   * 그 달 [표준원가생성] · [생성] 뒤). 줄은 <b>그 기간에 생산한 품목 × 소모품목</b>(BOM 줄 + 실제로 소모한 품목)이고
   * 생산품목마다 '<품목명[규격]> 계', 끝에 '<구분> 계' · '합계'.
   *   표준소모수량 = BOM 소요량 × 그 기간 생산수량(187 = 1 × 187, 고추가루 0.1 × 187 = 18.7 → '19')
   *   실제소모수량 = 그 기간 생산입고의 소모 줄 합(8)
   *   표준단가 = 소모품목의 표준원가(원가 줄 표준 합계), 실제단가 = 원가생성 결과 그 품목 감소 단가(22,714 = 8 × 1,919.5 + …)
   *   재료비단가차이: 차이 = 표준단가 − 실제단가, 차이금액 = 차이 × 표준소모수량(−1,919.5 × 187 = −358,947)
   *   소모수량차이:   차이 = 표준소모수량 − 실제소모수량, 차이금액 = 차이 × 실제단가(179 × 1,919.5 = 343,591)
   * 우리는 매입 가중평균 vs 구매단가 · BOM 소모 vs 실적 자재 합계를 <b>자재별 한 줄</b>로 냈다 → 원본 꼴로 바꿨다.
   */
  const ledgerPrice = ledgerPriceOf
  const stdPriceOf = (itemId: number) => {
    const c = costs.find((r) => r.itemId === itemId && inPeriod(r.period))
    return c && c.standardTotal > 0 ? c.standardTotal : null
  }
  const matGroups = useMemo(() => {
    const bomOf = new Map(boms.map((b) => [b.productId, b.lines]))
    const prods = new Map<number, { qty: number; actual: Map<number, number> }>()
    for (const p of productions) {
      if (!inPeriod(p.productionDate.slice(0, 7))) continue
      const cur = prods.get(p.productId) ?? { qty: 0, actual: new Map<number, number>() }
      cur.qty += p.producedQty
      for (const m of p.materials ?? []) cur.actual.set(m.componentId, (cur.actual.get(m.componentId) ?? 0) + m.quantity)
      prods.set(p.productId, cur)
    }
    return [...prods.entries()]
      .map(([productId, v]) => {
        const info = nameOf.get(productId) ?? { code: String(productId), name: '(삭제된 품목)' }
        const ids = [...new Set([...(bomOf.get(productId) ?? []).map((l) => l.componentId), ...v.actual.keys()])]
        const lines = ids.map((componentId) => {
          const bomQty = (bomOf.get(productId) ?? []).filter((l) => l.componentId === componentId).reduce((n, l) => n + l.quantity, 0)
          const stdQty = bomQty * v.qty
          const actQty = v.actual.get(componentId) ?? 0
          const stdPrice = stdPriceOf(componentId)
          const actPrice = ledgerPrice.get(componentId) ?? null
          const priceDiff = (stdPrice ?? 0) - (actPrice ?? 0)
          const qtyDiff = stdQty - actQty
          return {
            componentId, ...(nameOf.get(componentId) ?? { code: String(componentId), name: '(삭제된 품목)' }),
            stdQty, actQty, stdPrice, actPrice, priceDiff, qtyDiff,
            priceAmount: priceDiff * stdQty,
            qtyAmount: qtyDiff * (actPrice ?? 0),
          }
        })
        return { productId, ...info, producedQty: v.qty, lines }
      })
      .filter((g) => hit(g.productId, g.code, g.name))
      .filter((g) => !processCond || processOf(g.productId) === processCond)
      .sort((a, b) => (categoryOf(a.productId) || '').localeCompare(categoryOf(b.productId) || '') || a.code.localeCompare(b.code))
  }, [productions, boms, costs, ledgerPrice, cp, keyword, itemCond, withInactive, inactive, withUntracked, untracked,
      categoryCond, itemGroupCond, processCond, nameOf])
  const byCategoryGroups = () => {
    const m = new Map<string, typeof matGroups>()
    for (const g of matGroups) {
      const k = categoryOf(g.productId) || ''
      m.set(k, [...(m.get(k) ?? []), g])
    }
    return [...m.entries()]
  }

  /*
   * ── 노무비/경비/외주비차이. 원본(2026-10-20 실측)은 생산 품목마다 [노무비 · 경비 · 외주비] 세 줄 +
   * '<품목명[규격]> 계' 줄, 끝에 '<구분> 계' · '합계'. 열은 [구분 · 표준단가 · 실제단가 · 차이 · 생산수량 · 차이금액].
   * 외주비는 우리 원가 줄에 칸이 없어 단가가 빈칸이다(원본 회사 자료도 빈칸이었다).
   * 차이 = 표준 − 실제, 차이금액 = 차이 × 생산수량(2026-10-21 원본 실측: C001 포장 180 에 노무비 700 · 경비 350 배부 →
   * 노무비 실제단가 4 · 차이 -4 · 차이금액 -700, 경비 2 · -2 · -350, 계 -1,050).
   */
  const laborRows = compareRows.map((r) => ({
    ...r,
    parts: ([
      ['노무비', r.laborCost, r.actualLabor],
      ['경비', r.overheadCost, r.actualOverhead],
      ['외주비', 0, 0],
    ] as const).map(([kind, std, act]) => ({ kind, std, act, diff: std - act, diffAmount: (std - act) * r.producedQty })),
  }))

    return (
    <EcListShell
      title="차이분석"
      formMenu={{ current: mode }}
      optionMenu={OPTION_MENU}
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        {
          /*
           * [다시 작성]은 <b>기본값</b>으로 되돌리는 버튼이다. [사용중단품목포함]의 기본은
           * 켜짐(원본 실측)인데 여기서만 꺼짐으로 되돌리고 있어, 누를 때마다 줄이 줄었다.
           */
          label: '다시 작성',
          onClick: () => {
            setPeriodId(firstPeriod ? String(firstPeriod.id) : ''); setKeyword(''); setItemCond('')
            setWithInactive(true); setWithUntracked(false)
            setCategoryCond(''); setItemGroupCond(''); setProcessCond('')
          },
        },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
      signLine={signBox}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCondTabs />
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
          [품목구분]의 후보는 <b>줄에 실제로 있는 값</b>에서 뽑는다. 원본의 후보가 화면마다
          달라(원가 화면들만 제품세트·상품세트가 더 있다) 목록을 지어내지 않는다.
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
        <EcCond label="생산공정" pick>
          <CodePickerField label="생산공정" hideLabel width={160} emptyLabel="전체"
                           value={processCond} onChange={setProcessCond}
                           items={[...new Set(bors.map((b) => b.processName).filter(Boolean))].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [기타] 한 줄 차례: 결재방표시 · 수량관리제외품목포함 · 사용중단품목포함. */}
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
      </ul>

      {loading ? (
        <p className="ec-empty">불러오는 중…</p>
      ) : mode === '원가비교집계표' ? (
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              {/*
                2026-10-20 원본 실측 열(열 · 순서 그대로): 품목코드 · 품목명[규격] · 품목구분(세트포함) · 생산공정명 ·
                생산수량 · 표준단가 · 표준금액 · 실제단가 · 실제금액 · 차이. 번호 · [기준월] · [차이율(%)] 은 원본에 없어 뺐다.
              */}
              <th className="w-[90px]">품목코드</th>
              <th>품목명[규격]</th>
              <th className="w-[100px]">품목구분(세트포함)</th>
              <th className="w-[100px]">생산공정명</th>
              <th className="text-right">생산수량</th>
              <th className="text-right">표준단가</th>
              <th className="text-right">표준금액</th>
              <th className="text-right">실제단가</th>
              <th className="text-right">실제금액</th>
              <th className="text-right">차이</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.length === 0 ? (
              <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {byCategory(compareRows).map(([cat, rs]) => (
                  <Fragment key={cat}>
                    {rs.map((r) => (
                      <tr key={r.id}>
                        <td>{r.itemCode}</td>
                        <td>{r.itemName}{specOf(r.itemId) ? ` [${specOf(r.itemId)}]` : ''}</td>
                        <td>{categoryOf(r.itemId)}</td>
                        {/* BOR 이 없는 품목은 빈칸이다 — 원본도 그렇다. */}
                        <td>{processOf(r.itemId)}</td>
                        <td className="text-right">{nz(r.producedQty)}</td>
                        <td className="text-right">{nz(r.standardTotal)}</td>
                        <td className="text-right">{nz(r.stdAmount)}</td>
                        <td className="text-right">{nz(r.actUnit)}</td>
                        <td className="text-right">{nz(r.actAmount)}</td>
                        <td className="text-right">{nz(r.diffAmount)}</td>
                      </tr>
                    ))}
                    {/* 원본 '제품 계' — 수량 · 단가는 비우고 금액만 더한다. */}
                    <tr className="font-bold bg-ec-page">
                      <td colSpan={4}>{cat} 계</td>
                      <td></td><td></td>
                      <td className="text-right">{nz(rs.reduce((n, r) => n + r.stdAmount, 0))}</td>
                      <td></td>
                      <td className="text-right">{nz(rs.reduce((n, r) => n + r.actAmount, 0))}</td>
                      <td className="text-right">{nz(rs.reduce((n, r) => n + r.diffAmount, 0))}</td>
                    </tr>
                  </Fragment>
                ))}
                <tr className="font-bold bg-ec-page">
                  <td colSpan={4}>합계</td>
                  <td></td><td></td>
                  <td className="text-right">{nz(compareRows.reduce((n, r) => n + r.stdAmount, 0))}</td>
                  <td></td>
                  <td className="text-right">{nz(compareRows.reduce((n, r) => n + r.actAmount, 0))}</td>
                  <td className="text-right">{nz(compareRows.reduce((n, r) => n + r.diffAmount, 0))}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      ) : mode === '재료비단가차이' || mode === '소모수량차이' ? (
        <table ref={tableRef} className="w-full text-left">
          <thead>
            {/* 2026-10-21 원본 실측: 머리 2줄 — [생산품목 · 소모품목 · 비교] 아래 열. */}
            <tr>
              <th colSpan={5} className="text-center">생산품목</th>
              <th colSpan={2} className="text-center">소모품목</th>
              <th colSpan={5} className="text-center">비교</th>
            </tr>
            <tr>
              <th className="w-[90px]">품목코드</th>
              <th>품목명[규격]</th>
              <th className="w-[80px]">품목구분</th>
              <th className="w-[90px]">생산공정명</th>
              <th className="text-right">생산수량</th>
              <th className="w-[90px]">소모품코드</th>
              <th>소모품명</th>
              {mode === '재료비단가차이' ? (
                <>
                  <th className="text-right">표준단가</th>
                  <th className="text-right">실제단가</th>
                  <th className="text-right">차이</th>
                  <th className="text-right">표준소모수량</th>
                </>
              ) : (
                <>
                  <th className="text-right">표준소모수량</th>
                  <th className="text-right">실제소모수량</th>
                  <th className="text-right">차이</th>
                  <th className="text-right">실제단가</th>
                </>
              )}
              <th className="text-right">차이금액</th>
            </tr>
          </thead>
          <tbody>
            {matGroups.length === 0 ? (
              <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {byCategoryGroups().map(([cat, gs]) => {
                  const amt = (g: (typeof matGroups)[number]) =>
                    g.lines.reduce((n, l) => n + (mode === '재료비단가차이' ? l.priceAmount : l.qtyAmount), 0)
                  return (
                    <Fragment key={cat}>
                      {gs.map((g) => {
                        const label = g.name + (specOf(g.productId) ? ` [${specOf(g.productId)}]` : '')
                        return (
                          <Fragment key={g.productId}>
                            {g.lines.map((l) => (
                              <tr key={l.componentId}>
                                <td>{g.code}</td>
                                <td>{label}</td>
                                <td>{categoryOf(g.productId)}</td>
                                <td>{processOf(g.productId)}</td>
                                <td className="text-right">{nzr(g.producedQty)}</td>
                                <td>{l.code}</td>
                                <td>{l.name}{specOf(l.componentId) ? ` [${specOf(l.componentId)}]` : ''}</td>
                                {mode === '재료비단가차이' ? (
                                  <>
                                    <td className="text-right">{nzr(l.stdPrice)}</td>
                                    <td className="text-right">{nzr(l.actPrice)}</td>
                                    <td className="text-right">{nzr(l.priceDiff)}</td>
                                    <td className="text-right">{nzr(l.stdQty)}</td>
                                    <td className="text-right">{nzr(l.priceAmount)}</td>
                                  </>
                                ) : (
                                  <>
                                    <td className="text-right">{nzr(l.stdQty)}</td>
                                    <td className="text-right">{nzr(l.actQty)}</td>
                                    <td className="text-right">{nzr(l.qtyDiff)}</td>
                                    <td className="text-right">{nzr(l.actPrice)}</td>
                                    <td className="text-right">{nzr(l.qtyAmount)}</td>
                                  </>
                                )}
                              </tr>
                            ))}
                            <tr className="font-bold bg-ec-page">
                              <td colSpan={11}>{label} 계</td>
                              <td className="text-right">{nzr(amt(g))}</td>
                            </tr>
                          </Fragment>
                        )
                      })}
                      <tr className="font-bold bg-ec-page">
                        <td colSpan={11}>{cat} 계</td>
                        <td className="text-right">{nzr(gs.reduce((n, g) => n + amt(g), 0))}</td>
                      </tr>
                    </Fragment>
                  )
                })}
                <tr className="font-bold bg-ec-page">
                  <td colSpan={11}>합계</td>
                  <td className="text-right">{nzr(matGroups.reduce((n, g) => n + g.lines.reduce((m, l) => m + (mode === '재료비단가차이' ? l.priceAmount : l.qtyAmount), 0), 0))}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      ) : (
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              {/* 2026-10-20 원본 실측 열 그대로. */}
              <th className="w-[90px]">품목코드</th>
              <th>품목명[규격]</th>
              <th className="w-[100px]">품목구분(세트포함)</th>
              <th className="w-[100px]">생산공정명</th>
              <th className="w-[70px]">구분</th>
              <th className="text-right">표준단가</th>
              <th className="text-right">실제단가</th>
              <th className="text-right">차이</th>
              <th className="text-right">생산수량</th>
              <th className="text-right">차이금액</th>
            </tr>
          </thead>
          <tbody>
            {laborRows.length === 0 ? (
              <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {byCategory(compareRows).map(([cat, rs]) => {
                  const ids = new Set(rs.map((r) => r.id))
                  const group = laborRows.filter((r) => ids.has(r.id))
                  const sum = (arr: typeof laborRows) => arr.reduce((n, r) => n + r.parts.reduce((m, x) => m + x.diffAmount, 0), 0)
                  return (
                    <Fragment key={cat}>
                      {group.map((r) => {
                        const label = r.itemName + (specOf(r.itemId) ? ` [${specOf(r.itemId)}]` : '')
                        return (
                          <Fragment key={r.id}>
                            {r.parts.map((x) => (
                              <tr key={x.kind}>
                                <td>{r.itemCode}</td>
                                <td>{label}</td>
                                <td>{categoryOf(r.itemId)}</td>
                                <td>{processOf(r.itemId)}</td>
                                <td>{x.kind}</td>
                                <td className="text-right">{nz(x.std)}</td>
                                <td className="text-right">{nz(x.act)}</td>
                                <td className="text-right">{nz(x.diff)}</td>
                                <td className="text-right">{nz(r.producedQty)}</td>
                                <td className="text-right">{nz(x.diffAmount)}</td>
                              </tr>
                            ))}
                            <tr className="font-bold bg-ec-page">
                              <td colSpan={5}>{label} 계</td>
                              <td></td><td></td><td></td><td></td>
                              <td className="text-right">{nz(sum([r]))}</td>
                            </tr>
                          </Fragment>
                        )
                      })}
                      <tr className="font-bold bg-ec-page">
                        <td colSpan={5}>{cat} 계</td>
                        <td></td><td></td><td></td><td></td>
                        <td className="text-right">{nz(sum(group))}</td>
                      </tr>
                    </Fragment>
                  )
                })}
                <tr className="font-bold bg-ec-page">
                  <td colSpan={5}>합계</td>
                  <td></td><td></td><td></td><td></td>
                  <td className="text-right">{nz(laborRows.reduce((n, r) => n + r.parts.reduce((m, x) => m + x.diffAmount, 0), 0))}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      )}
    </EcListShell>
  )
}

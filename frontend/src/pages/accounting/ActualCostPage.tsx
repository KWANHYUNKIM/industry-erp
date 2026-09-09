import { Fragment, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useItemFlags } from '../../utils/useInactiveItems'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { stockCostMap } from '../../utils/stockValue'
import { groupByCategory } from '../../utils/costGroup'
import type { Item, PurchaseDoc } from '../../api/types'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

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

/** 이번 달을 yyyy-MM 으로. 원본 [기준월]의 기본값이다. */
function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** yyyy-MM → 그 달의 첫날·마지막날. */
function monthRange(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` }
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
  const [period, setPeriod] = useState(thisMonth())
  const [keyword, setKeyword] = useState('')
  const [withInactive, setWithInactive] = useState(true)
  const [movement, setMovement] = useState<MovementRow[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
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
    setLoading(true)
    setError('')
    const { from, to } = monthRange(period)
    try {
      const [mv, lg, it, pu, ex, cs, pr, br] = await Promise.all([
        api.get<MovementRow[]>('/stock/movement', { params: { from, to } }),
        /*
         * <b>여기서는 자르면 안 된다.</b> 이 화면은 수불부 줄을 <b>합산해서</b> 실제원가를 낸다
         * (아래 detail.reduce). 앞부분만 받으면 합계가 조용히 틀린다 — 느린 것보다 나쁘다.
         * 재고수불부 화면은 사람이 눈으로 읽는 자리라 앞 5천 줄만 받고 [오천건이상조회] 로
         * 그 위를 가지만, 더하는 자리는 처음부터 전부 받는다.
         */
        api.get<{ opening: number; rows: LedgerRow[] }>('/stock/ledger', { params: { from, to, all: true } }),
        api.get<Item[]>('/items'),
        api.get<PurchaseDoc[]>('/purchases'),
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
      setLedger(lg.data.rows)
      setItems(it.data)
      setPurchases(pu.data)
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
    () => stockCostMap(items, purchases.map((d) => ({
      purchaseDate: d.purchaseDate,
      lines: (d.lines ?? []).map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice })),
    }))),
    [items, purchases],
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
  [movement, priceOf, categoryOf, keyword, withInactive, inactive, withUntracked, untracked])

  /**
   * 원본 원가집계표의 <b>품목구분별 소계</b>(원재료 계 · 부재료 계 · … · 누계).
   * 순서와 '모르는 구분을 버리지 않는' 규칙은 utils/costGroup 에 있다.
   */
  const groups = useMemo(() => groupByCategory(summary, (r) => r.categoryName), [summary])

  const detail = useMemo(() => ledger
    .filter((r) => (mode === '증가내역' ? r.quantityChange > 0 : r.quantityChange < 0))
    .filter((r) => hit(r.itemCode, r.itemName, r.itemId))
    .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : a.transactionDate > b.transactionDate ? -1 : b.id - a.id)),
  [ledger, mode, keyword, withInactive, inactive, withUntracked, untracked])

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
      if (pr.productionDate.slice(0, 7) !== period) continue
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

  const totals = summary.reduce((a, r) => ({
    open: a.open + (r.openAmt ?? 0), in: a.in + (r.inAmt ?? 0),
    out: a.out + (r.outAmt ?? 0), close: a.close + (r.closeAmt ?? 0),
    unknown: a.unknown + (r.price == null && (r.opening || r.inQty || r.outQty || r.closing) ? 1 : 0),
  }), { open: 0, in: 0, out: 0, close: 0, unknown: 0 })

  return (
    <EcListShell
      title="실제원가현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setPeriod(thisMonth()); setKeyword(''); setWithInactive(false) } },
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
          <input className="ec-input" type="month" value={period}
                 onChange={(e) => setPeriod(e.target.value)} style={{ width: 150 }} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={keyword} onChange={(v) => setKeyword(v)}
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
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
            사용중단품목포함
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withUntracked} onChange={(e) => setWithUntracked(e.target.checked)} />
            수량관리제외품목포함
          </label>
        </EcCond>
        <EcCond label="결재방표시">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            인쇄물에 결재란(도장칸)을 찍는다
          </label>
        </EcCond>
      </ul>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {ALLOC.has(mode) ? (
        <div className="overflow-x-auto">
          {/*
            <b>배부 전</b> — 노무비/경비등록에 적힌 그 달 공정·창고별 총액.
            창고를 안 정한 줄은 원본과 같이 <b>전사 공통</b>이다(빈칸으로 둔다).
          */}
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>
            배부 전 — 노무비/경비등록 ({period})
          </h3>
          <table className="ec-grid w-full text-left" style={{ marginBottom: 14 }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>생산공정명</th>
                <th style={{ width: 160 }}>창고명</th>
                <th style={{ width: 160, textAlign: 'right' }}>{mode === '경비배부액' ? '경비' : '노무비'}</th>
              </tr>
            </thead>
            <tbody>
              {allocBefore.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : allocBefore.map((e, i) => (
                <tr key={e.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>{e.processName}</td>
                  <td style={{ color: e.warehouseName ? undefined : '#9aa1ab' }}>{e.warehouseName ?? '(전사 공통)'}</td>
                  <td style={{ textAlign: 'right' }}>{won(mode === '경비배부액' ? e.overheadCost : e.laborCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>누계</td>
                <td style={{ textAlign: 'right' }}>{won(allocTotals.before)}</td>
              </tr>
            </tfoot>
          </table>

          {/*
            <b>배부 후</b> — 그 총액을 표준 작업시간 비율로 품목에 나눈 결과다
            (CostService.calcActual 이 그렇게 넣는다). 단위당 값을 그 달 생산수량에
            곱해 되돌린다.
          */}
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>배부 후 — 품목별</h3>
          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>품목코드</th>
                <th>품목명</th>
                <th style={{ width: 120, textAlign: 'right' }}>생산수량</th>
                <th style={{ width: 140, textAlign: 'right' }}>단위당</th>
                <th style={{ width: 160, textAlign: 'right' }}>배부액</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
              ) : allocAfter.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : allocAfter.map((r, i) => (
                <tr key={r.itemId}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                  <td>{r.itemName}</td>
                  <td style={{ textAlign: 'right' }}>{num(r.qty)}</td>
                  <td style={{ textAlign: 'right' }}>{won(r.unit)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{won(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={5} style={{ textAlign: 'right' }}>누계 ({allocAfter.length}품목)</td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{won(allocTotals.after)}</td>
              </tr>
            </tfoot>
          </table>
          {/*
            <b>위아래가 다를 수 있다.</b> 그 달 생산이 없는 공정의 총액은 어디에도 안 붙는다 —
            없는 근거로 아무 품목에나 얹지 않기 때문이다(CostService 주석). 그 차이를 숨기지
            않고 적는다. 숨기면 "왜 노무비가 모자라지" 를 이 화면에서 못 찾는다.
          */}
          {Math.round(allocTotals.before) !== Math.round(allocTotals.after) && (
            <p style={{ fontSize: 12.5, color: '#c07a00', marginTop: 8 }}>
              ※ 배부 전 {won(allocTotals.before)} · 배부 후 {won(allocTotals.after)} —
              차이 <b>{won(allocTotals.before - allocTotals.after)}</b> 는 그 달 생산이 없어
              붙일 품목이 없던 공정의 몫입니다.
            </p>
          )}
        </div>
      ) : mode === '원가집계표' ? (
        <div className="overflow-x-auto">
          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>품목코드</th>
                {/* 원본은 규격을 품목명 뒤 대괄호에 붙인다(2026-09-09 실측). */}
                <th>품목명[규격]</th>
                {/* 원본 원가집계표의 [품목구분]. 이 값으로 소계를 낸다. */}
                <th style={{ width: 80 }}>품목구분</th>
                {/* 원본 넷째 칸. BOR 이 없는 품목(사 오는 원재료)은 빈칸이다 — 원본도 그렇다. */}
                <th style={{ width: 100 }}>생산공정명</th>
                {/*
                  2026-09-09 원본 실측(E040804). 원본은 <b>머리가 두 줄</b>이라
                  [기초|증가|감소|기말] 아래에 <b>수량·단가·금액</b> 이 각각 달린다.
                  우리는 네 묶음 중 <b>기말에만 단가</b>를 두고 나머지 셋은 수량·금액만
                  두고 있었다 — 그러면 "기초 단가가 얼마였는데 증가분이 얼마에 들어와
                  기말이 이렇게 됐다" 를 화면에서 읽을 수 없다. 셋을 마저 낸다.
                  [단가]도 <b>[기말단가]</b> 로 고쳐 네 묶음 이름을 나란히 맞췄다.
                */}
                <th style={{ textAlign: 'right' }}>기초수량</th>
                <th style={{ textAlign: 'right' }}>기초단가</th>
                <th style={{ textAlign: 'right' }}>기초금액</th>
                <th style={{ textAlign: 'right' }}>증가수량</th>
                <th style={{ textAlign: 'right' }}>증가단가</th>
                <th style={{ textAlign: 'right' }}>증가금액</th>
                <th style={{ textAlign: 'right' }}>감소수량</th>
                <th style={{ textAlign: 'right' }}>감소단가</th>
                <th style={{ textAlign: 'right' }}>감소금액</th>
                <th style={{ textAlign: 'right' }}>기말수량</th>
                <th style={{ textAlign: 'right' }}>기말단가</th>
                <th style={{ textAlign: 'right' }}>기말금액</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={17} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={17} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : groups.map((g) => {
                // 소계는 그 묶음 줄만 더한다 — 화면에 안 보이는 줄이 섞이면 누계와 어긋난다.
                const sub = g.rows.reduce((a, r) => ({
                  open: a.open + (r.openAmt ?? 0), in: a.in + (r.inAmt ?? 0),
                  out: a.out + (r.outAmt ?? 0), close: a.close + (r.closeAmt ?? 0),
                }), { open: 0, in: 0, out: 0, close: 0 })
                return (
                  <Fragment key={g.name}>
                    {g.rows.map((r, i) => (
                <tr key={r.itemId}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                  <td>{r.itemName}{specOf(r.itemId) ? ` [${specOf(r.itemId)}]` : ''}</td>
                  <td style={{ color: '#5a626e' }}>{r.categoryName}</td>
                  <td style={{ color: '#5a626e' }}>{processOf(r.itemId)}</td>
                  <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(r.opening)}</td>
                  <td style={{ textAlign: 'right', color: '#5a626e' }}>{unitOf(r.openAmt, r.opening)}</td>
                  <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.openAmt)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{num(r.inQty)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{unitOf(r.inAmt, r.inQty)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(r.inAmt)}</td>
                  <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(r.outQty)}</td>
                  <td style={{ textAlign: 'right', color: '#a5561b' }}>{unitOf(r.outAmt, r.outQty)}</td>
                  <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(r.outAmt)}</td>
                  {/* 기말수량이 음수면 그 자체가 문제다. 0으로 감추면 아무도 못 본다. */}
                  <td style={{ textAlign: 'right', fontWeight: 700, color: r.closing < 0 ? '#c60a2e' : undefined }}>
                    {num(r.closing)}
                  </td>
                  <td style={{ textAlign: 'right', color: r.price == null ? '#c9ced6' : '#5a626e' }}>{won(r.price)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.closeAmt)}</td>
                </tr>
                    ))}
                    {/* 원본 소계 줄: '원재료 계' · '부재료 계' · … */}
                    <tr style={{ background: '#f2f6fc', fontWeight: 700 }}>
                      <td colSpan={5} style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
                        {g.name} 계 ({g.rows.length}품목)
                      </td>
                      <td colSpan={2}></td>
                      <td style={{ textAlign: 'right' }}>{won(sub.open)}</td>
                      <td colSpan={2}></td>
                      <td style={{ textAlign: 'right' }}>{won(sub.in)}</td>
                      <td colSpan={2}></td>
                      <td style={{ textAlign: 'right' }}>{won(sub.out)}</td>
                      <td colSpan={2}></td>
                      <td style={{ textAlign: 'right' }}>{won(sub.close)}</td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
            {summary.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                  {/* 원본은 맨 아래를 '합계' 가 아니라 [누계] 라고 적는다. */}
                  <td colSpan={7} style={{ textAlign: 'right' }}>누계 ({summary.length}품목)</td>
                  <td style={{ textAlign: 'right' }}>{won(totals.open)}</td>
                  <td colSpan={2}></td>
                  <td style={{ textAlign: 'right' }}>{won(totals.in)}</td>
                  <td colSpan={2}></td>
                  <td style={{ textAlign: 'right' }}>{won(totals.out)}</td>
                  <td colSpan={2}></td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
                    {won(totals.close)}
                    {totals.unknown > 0 && (
                      <span title={`단가를 모르는 품목 ${totals.unknown}건은 금액에서 뺐습니다.`} style={{ color: '#c07a00' }}> *</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th style={{ width: 100 }}>일자</th>
                <th>품목코드</th>
                <th>품목명</th>
                <th>창고</th>
                <th style={{ textAlign: 'right' }}>수량</th>
                <th style={{ textAlign: 'right' }}>단가</th>
                <th style={{ textAlign: 'right' }}>금액</th>
                <th>적요</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
              ) : detail.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : detail.map((r, i) => {
                /* 거래에 단가가 남아 있으면 그것이 맞다 — 평가단가는 그 자리를 메우는 값일 뿐이다. */
                const price = r.unitPrice != null && r.unitPrice > 0 ? r.unitPrice : (priceOf.get(r.itemId) ?? null)
                const qty = Math.abs(r.quantityChange)
                return (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.transactionDate.replace(/-/g, '/')}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td>{r.warehouseName}</td>
                    <td style={{ textAlign: 'right' }}>{num(qty)} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.unit}</span></td>
                    <td style={{ textAlign: 'right', color: price == null ? '#c9ced6' : '#5a626e' }}>{won(price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(price == null ? null : qty * price)}</td>
                    <td style={{ color: '#5a626e' }}>{r.note ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
            {detail.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                  <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({detail.length}건)</td>
                  <td style={{ textAlign: 'right' }}>
                    {num(detail.reduce((n, r) => n + Math.abs(r.quantityChange), 0))}
                  </td>
                  <td></td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
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
    </EcListShell>
  )
}

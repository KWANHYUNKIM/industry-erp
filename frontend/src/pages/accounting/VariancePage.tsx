import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useItemFlags } from '../../utils/useInactiveItems'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { stockCostMapFromLast } from '../../utils/stockValue'
import { materialDiff, type BomLine } from '../../utils/woEfficiency'
import { amountVariance, priceVariance, qtyVariance, weightedAvgPrice } from '../../utils/costVariance'
import type { Item, PurchaseDoc } from '../../api/types'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

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
 * <p>부호 약속은 회계 관례대로 <b>양수 = 불리</b>(원가가 늘었다). 규칙은 utils/costVariance 에
 * 못 박아 뒀다.
 *
 * <p>원본의 '노무비/경비/외주비차이' 에서 <b>외주비는 뺐다.</b> 외주비를 따로 잡는 자료가
 * 우리에겐 없다(외주는 구매전표로 들어온다). 이름에 넣어 두면 늘 0 인 칸이 생겨,
 * 외주비 차이가 없다는 말처럼 보인다.
 */
type Mode = '원가비교집계표' | '재료비단가차이' | '소모수량차이' | '노무비·경비차이'
const MODES = ['원가비교집계표', '재료비단가차이', '소모수량차이', '노무비·경비차이'] as const

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

const num = (n: number) => n.toLocaleString('ko-KR')
const won = (n: number | null) => (n == null ? '기준 없음' : Math.round(n).toLocaleString('ko-KR'))
/** 불리(원가 증가)는 붉게, 유리는 푸르게. 못 재면 회색. */
const varColor = (n: number | null) => (n == null ? '#c9ced6' : n > 0 ? '#c60a2e' : n < 0 ? '#1c7c3c' : '#8a929c')

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
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  /* 평가단가 지도만 쓰는 자리. 전표는 아래 purchases 가 따로 든다(가중평균단가·수량차이). */
  const [lastPrices, setLastPrices] = useState<{ itemId: number; unitPrice: number }[]>([])
  const [boms, setBoms] = useState<BomRow[]>([])
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [keyword, setKeyword] = useState('')
  const [period, setPeriod] = useState('전체')
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

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [c, i, br, p, lp, b, pr] = await Promise.all([
        api.get<Cost[]>('/costs'),
        api.get<Item[]>('/items'),
        api.get<BorRow[]>('/bor'),
        /* 가중평균단가·수량차이 금액이 이 전표들을 줄 단위로 훑는다 — 여기는 못 줄인다. */
        api.get<PurchaseDoc[]>('/purchases'),
        /*
         * <b>평가단가 지도는 마지막 입고단가만 있으면 된다.</b> 여태 위 전표 목록을 그대로
         * 접어 만들었는데, 그 규칙이 <b>목록 차례에 기대고</b> 있었다(같은 날이면 id 가
         * 작은 쪽이 이겼다). 서버가 품목당 한 줄로 내고 규칙도 그 자리에 적혀 있다.
         */
        api.get<{ itemId: number; unitPrice: number }[]>('/purchases/item-prices'),
        api.get<BomRow[]>('/boms'),
        api.get<ProductionRow[]>('/productions'),
      ])
      setCosts(c.data); setItems(i.data); setBors(br.data)
      setPurchases(p.data); setLastPrices(lp.data); setBoms(b.data); setProductions(pr.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const periods = useMemo(() => {
    const fromCosts = costs.map((r) => r.period)
    const fromProds = productions.map((p) => p.productionDate.slice(0, 7))
    const fromBuys = purchases.map((p) => p.purchaseDate.slice(0, 7))
    return [...new Set([...fromCosts, ...fromProds, ...fromBuys])].sort().reverse()
  }, [costs, productions, purchases])

  const inPeriod = (yyyymm: string) => period === '전체' || yyyymm === period
  const catOf = useMemo(() => new Map(items.map((i) => [i.id, i.categoryName])), [items])
  const hit = (itemId: number, code: string, name: string) => {
    if (!withInactive && inactive.has(itemId)) return false
    if (!withUntracked && untracked.has(itemId)) return false
    if (categoryCond && (catOf.get(itemId) ?? '') !== categoryCond) return false
    if (itemGroupCond && mgmt.groupOf(itemId) !== itemGroupCond) return false
    if (!keyword) return true
    return code.includes(keyword) || name.includes(keyword)
  }

  /** 기준단가. 품목의 구매단가다 — 0 이면 "안 정했다" 는 뜻이라 차이를 재지 않는다. */
  const stdPriceOf = useMemo(() => {
    const m = new Map(items.map((i) => [i.id, i.purchasePrice]))
    return (id: number) => {
      const v = m.get(id)
      return v != null && v > 0 ? v : null
    }
  }, [items])

  /** 기준단가가 없을 때 수량차이 금액을 매길 대체 단가 — 재고자산평가와 같은 규칙. */
  const evalPriceOf = useMemo(
    () => stockCostMapFromLast(items, lastPrices),
    [items, purchases],
  )

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
  const compareRows = costs
    .filter((r) => inPeriod(r.period))
    .filter((r) => hit(r.itemId, r.itemCode, r.itemName))
    .map((r) => {
      const qty = producedOf.get(r.itemId + '|' + r.period) ?? null
      return {
        ...r,
        producedQty: qty,
        stdAmount: qty === null ? null : r.standardTotal * qty,
        actAmount: qty === null ? null : r.actualTotal * qty,
        diffAmount: qty === null ? null : r.variance * qty,
      }
    })

  // ── 재료비단가차이: 그 기간 실제 매입 가중평균 vs 품목 기준단가
  const priceRows = useMemo(() => {
    const byItem = new Map<number, { quantity: number; unitPrice: number }[]>()
    for (const d of purchases) {
      if (!inPeriod(d.purchaseDate.slice(0, 7))) continue
      for (const l of d.lines ?? []) {
        const cur = byItem.get(l.itemId) ?? []
        cur.push({ quantity: l.quantity, unitPrice: l.unitPrice })
        byItem.set(l.itemId, cur)
      }
    }
    return [...byItem.entries()]
      .map(([itemId, lines]) => {
        const info = nameOf.get(itemId) ?? { code: String(itemId), name: '(삭제된 품목)' }
        const qty = lines.reduce((n, l) => n + l.quantity, 0)
        const v = priceVariance(stdPriceOf(itemId), weightedAvgPrice(lines), qty)
        return { itemId, ...info, ...v }
      })
      .filter((r) => hit(r.itemId, r.code, r.name))
      .sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0))
  }, [purchases, period, keyword, withInactive, inactive, withUntracked, untracked,
      categoryCond, itemGroupCond, nameOf, stdPriceOf])

  // ── 소모수량차이: BOM 표준소모 vs 실제 투입 (자재별 집계)
  const qtyRows = useMemo(() => {
    const bomOf = new Map<number, BomLine[]>(boms.map((b) => [b.productId, b.lines]))
    const agg = new Map<number, { stdQty: number; actualQty: number }>()
    for (const p of productions) {
      if (!inPeriod(p.productionDate.slice(0, 7))) continue
      const rows = materialDiff(bomOf.get(p.productId) ?? [], p.materials ?? [], p.producedQty, () => 1)
      for (const r of rows) {
        const cur = agg.get(r.componentId) ?? { stdQty: 0, actualQty: 0 }
        cur.stdQty += r.stdQty
        cur.actualQty += r.actualQty
        agg.set(r.componentId, cur)
      }
    }
    return [...agg.entries()]
      .filter(([, v]) => v.stdQty !== 0 || v.actualQty !== 0)
      .map(([itemId, v]) => {
        const info = nameOf.get(itemId) ?? { code: String(itemId), name: '(삭제된 품목)' }
        // 기준단가가 있으면 그것으로, 없으면 평가단가로 금액을 매긴다.
        const price = stdPriceOf(itemId) ?? evalPriceOf.get(itemId) ?? null
        return { itemId, ...info, price, ...qtyVariance(v.stdQty, v.actualQty, price) }
      })
      .filter((r) => hit(r.itemId, r.code, r.name))
      .sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0) || Math.abs(b.diffQty) - Math.abs(a.diffQty))
  }, [productions, boms, period, keyword, withInactive, inactive, withUntracked, untracked,
      categoryCond, itemGroupCond, nameOf, stdPriceOf, evalPriceOf])

  // ── 노무비·경비차이
  const laborRows = compareRows.map((r) => ({
    ...r,
    laborVar: amountVariance(r.laborCost, r.actualLabor),
    overheadVar: amountVariance(r.overheadCost, r.actualOverhead),
  }))

  const totalOf = (arr: (number | null)[]) => arr.reduce<number>((n, v) => n + (v ?? 0), 0)

  return (
    <EcListShell
      title="차이분석"
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
            setPeriod('전체'); setKeyword('')
            setWithInactive(true); setWithUntracked(false)
            setCategoryCond(''); setItemGroupCond('')
          },
        },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
      signLine={signBox}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
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
          <select className="ec-input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 140 }}>
            <option>전체</option>
            {periods.map((p) => <option key={p}>{p}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={keyword} onChange={(v) => setKeyword(v)}
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

      <div style={{ marginBottom: 8, fontSize: 11.5, color: '#8a929c', textAlign: 'right' }}>
        양수는 원가가 늘어난 쪽(불리), 음수는 줄어든 쪽입니다.
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
      ) : mode === '원가비교집계표' ? (
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              {/*
                <b>차이분석(E040809) [구분]=원가비교집계표 2026-09-09 원본 격자 실측</b> —
                [품목코드 · 품목명[규격] · 품목구분(세트포함) · <b>생산공정명</b> ·
                생산수량 · 표준단가 · 표준금액 · 실제단가 · 실제금액 · 차이] 열이다.
                고친 이름 셋: [품목명]→[품목명[규격]] · [표준원가]→<b>[표준단가]</b> ·
                [실제원가]→<b>[실제단가]</b>(같은 값이다 — 원본 이름을 쓴다).
                만든 넷: <b>생산수량 · 표준금액 · 실제금액 · 차이</b>.
                <b>[차이금액]을 [차이]로 바꾼 것이 아니다</b> — 원본 [차이]는 <b>금액</b> 차이라
                단가 차이와 다른 값이다. 단가 차이는 [차이율(%)] 옆에 그대로 둔다.
                <b>[생산공정명]은 2026-09-09 에 만들었다</b> — 그 칸이 공정별 재공이 아니라
                그 품목이 만들어지는 공정임을 원본 자료로 가렸다(위 processMapOf 주석).
                [기준월]·[차이율(%)]은 우리 열이다.
              */}
              <th style={{ width: 90 }}>품목코드</th>
              <th>품목명[규격]</th>
              <th style={{ width: 80 }}>품목구분(세트포함)</th>
              {/* 원본 넷째 칸. 그 품목이 만들어지는 공정 — BOR 이 든다(위 주석). */}
              <th style={{ width: 100 }}>생산공정명</th>
              <th style={{ width: 80 }}>기준월</th>
              <th style={{ textAlign: 'right' }}>생산수량</th>
              <th style={{ textAlign: 'right' }}>표준단가</th>
              <th style={{ textAlign: 'right' }}>표준금액</th>
              <th style={{ textAlign: 'right' }}>실제단가</th>
              <th style={{ textAlign: 'right' }}>실제금액</th>
              <th style={{ textAlign: 'right' }}>차이</th>
              <th style={{ textAlign: 'right' }}>차이율(%)</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.length === 0 ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : compareRows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}{specOf(r.itemId) ? ` [${specOf(r.itemId)}]` : ''}</td>
                <td style={{ color: '#5a626e' }}>{categoryOf(r.itemId)}</td>
                {/* BOR 이 없는 품목(사 오는 원재료)은 빈칸이다 — 원본도 그렇다. */}
                <td style={{ color: '#5a626e' }}>{processOf(r.itemId)}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.period}</td>
                {/* 생산실적이 없으면 0 이 아니라 '—' 다 — 0 으로 채우면 차이가 사라진다. */}
                <td style={{ textAlign: 'right', color: r.producedQty === null ? '#c5cbd3' : undefined }}>
                  {r.producedQty === null ? '—' : num(r.producedQty)}
                </td>
                <td style={{ textAlign: 'right' }}>{num(r.standardTotal)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>
                  {r.stdAmount === null ? '—' : num(r.stdAmount)}
                </td>
                <td style={{ textAlign: 'right' }}>{num(r.actualTotal)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>
                  {r.actAmount === null ? '—' : num(r.actAmount)}
                </td>
                <td style={{ textAlign: 'right', color: varColor(r.variance) }}>
                  {r.diffAmount === null ? '—' : num(r.diffAmount)}
                </td>
                <td style={{ textAlign: 'right', color: varColor(r.variance) }}>{r.varianceRate}</td>
              </tr>
            ))}
          </tbody>
          {compareRows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={6} style={{ textAlign: 'right' }}>합계 ({compareRows.length}품목)</td>
                {/* 생산수량 합 — 모르는 줄(실적 없음)은 빼고 더한다. */}
                <td style={{ textAlign: 'right' }}>{num(compareRows.reduce((n, r) => n + (r.producedQty ?? 0), 0))}</td>
                <td style={{ textAlign: 'right' }}>{num(compareRows.reduce((n, r) => n + r.standardTotal, 0))}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(compareRows.reduce((n, r) => n + (r.stdAmount ?? 0), 0))}</td>
                <td style={{ textAlign: 'right' }}>{num(compareRows.reduce((n, r) => n + r.actualTotal, 0))}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(compareRows.reduce((n, r) => n + (r.actAmount ?? 0), 0))}</td>
                {/* 원본 [차이]는 금액 차이다 — 합계도 금액으로 더한다. */}
                <td style={{ textAlign: 'right', color: varColor(compareRows.reduce((n, r) => n + (r.diffAmount ?? 0), 0)) }}>
                  {num(compareRows.reduce((n, r) => n + (r.diffAmount ?? 0), 0))}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      ) : mode === '재료비단가차이' ? (
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 90 }}>품목코드</th>
              <th>품목명</th>
              <th style={{ textAlign: 'right' }}>기준단가</th>
              <th style={{ textAlign: 'right' }}>실제매입단가</th>
              <th style={{ textAlign: 'right' }}>단가차이</th>
              <th style={{ textAlign: 'right' }}>매입수량</th>
              <th style={{ textAlign: 'right' }}>차이금액</th>
            </tr>
          </thead>
          <tbody>
            {priceRows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : priceRows.map((r, i) => (
              <tr key={r.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
                <td>{r.name}</td>
                <td style={{ textAlign: 'right', color: r.stdPrice == null ? '#c9ced6' : undefined }}>{won(r.stdPrice)}</td>
                <td style={{ textAlign: 'right' }}>{won(r.actualPrice)}</td>
                <td style={{ textAlign: 'right', color: varColor(r.stdPrice == null || r.actualPrice == null ? null : r.actualPrice - r.stdPrice) }}>
                  {r.stdPrice == null || r.actualPrice == null ? '-' : num(Math.round(r.actualPrice - r.stdPrice))}
                </td>
                <td style={{ textAlign: 'right' }}>{num(r.qty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: varColor(r.amount) }}>{won(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          {priceRows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={7} style={{ textAlign: 'right' }}>합계 ({priceRows.length}품목 · 기준 없는 {priceRows.filter((r) => r.amount == null).length}품목 제외)</td>
                <td style={{ textAlign: 'right', color: varColor(totalOf(priceRows.map((r) => r.amount))) }}>
                  {num(Math.round(totalOf(priceRows.map((r) => r.amount))))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      ) : mode === '소모수량차이' ? (
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 90 }}>품목코드</th>
              <th>품목명</th>
              <th style={{ textAlign: 'right' }}>표준소모수량</th>
              <th style={{ textAlign: 'right' }}>실제소모수량</th>
              <th style={{ textAlign: 'right' }}>수량차이</th>
              <th style={{ textAlign: 'right' }}>단가</th>
              <th style={{ textAlign: 'right' }}>차이금액</th>
            </tr>
          </thead>
          <tbody>
            {qtyRows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : qtyRows.map((r, i) => (
              <tr key={r.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
                <td>{r.name}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(r.stdQty)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.actualQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: varColor(r.diffQty) }}>{num(r.diffQty)}</td>
                <td style={{ textAlign: 'right', color: r.price == null ? '#c9ced6' : '#5a626e' }}>{won(r.price)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: varColor(r.amount) }}>{won(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          {qtyRows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({qtyRows.length}품목)</td>
                <td style={{ textAlign: 'right', color: varColor(qtyRows.reduce((n, r) => n + r.diffQty, 0)) }}>
                  {num(Math.round(qtyRows.reduce((n, r) => n + r.diffQty, 0) * 1000) / 1000)}
                </td>
                <td></td>
                <td style={{ textAlign: 'right', color: varColor(totalOf(qtyRows.map((r) => r.amount))) }}>
                  {num(Math.round(totalOf(qtyRows.map((r) => r.amount))))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      ) : (
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 90 }}>품목코드</th>
              <th>품목명</th>
              <th style={{ width: 80 }}>기준월</th>
              <th style={{ textAlign: 'right' }}>표준노무비</th>
              <th style={{ textAlign: 'right' }}>실제노무비</th>
              <th style={{ textAlign: 'right' }}>노무비차이</th>
              <th style={{ textAlign: 'right' }}>표준경비</th>
              <th style={{ textAlign: 'right' }}>실제경비</th>
              <th style={{ textAlign: 'right' }}>경비차이</th>
            </tr>
          </thead>
          <tbody>
            {laborRows.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : laborRows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.period}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(r.laborCost)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.actualLabor)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: varColor(r.laborVar) }}>{won(r.laborVar)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(r.overheadCost)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.actualOverhead)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: varColor(r.overheadVar) }}>{won(r.overheadVar)}</td>
              </tr>
            ))}
          </tbody>
          {laborRows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={6} style={{ textAlign: 'right' }}>합계 ({laborRows.length}품목)</td>
                <td style={{ textAlign: 'right', color: varColor(totalOf(laborRows.map((r) => r.laborVar))) }}>
                  {num(Math.round(totalOf(laborRows.map((r) => r.laborVar))))}
                </td>
                <td colSpan={2}></td>
                <td style={{ textAlign: 'right', color: varColor(totalOf(laborRows.map((r) => r.overheadVar))) }}>
                  {num(Math.round(totalOf(laborRows.map((r) => r.overheadVar))))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </EcListShell>
  )
}

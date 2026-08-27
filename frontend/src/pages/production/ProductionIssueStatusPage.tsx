import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { INQUIRY_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { stockCostMap } from '../../utils/stockValue'
import { materialDiff, type BomLine } from '../../utils/woEfficiency'
import type { Item, PurchaseDoc } from '../../api/types'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 생산 > 생산입고/소모현황 I (이카운트 E040415)
 *
 * 생산/외주현황 그룹에서 우리에게 없던 화면. 생산입고현황(완제품이 몇 개 들어왔나)과
 * 생산불출현황(자재가 얼마나 나갔나)은 따로 있었지만, <b>그 둘을 맞대어</b> 보는 판이 없었다.
 * "이 완제품 100개를 만드는 데 자재가 얼마나 들어갔나"는 두 화면을 번갈아 봐서는 안 나온다.
 *
 * 자료는 GET /api/productions 하나로 충분하다 — 생산실적이 <b>생산품과 소모자재를 같이</b>
 * 들고 있다(Production.materials).
 *
 * 구분:
 *   내역 — 생산 전표마다 입고 한 줄, 그 밑에 소모 자재 줄
 *   품목별 — 품목마다 입고합·소모합. 반제품은 <b>양쪽에 다 뜬다</b>(만들어서 다시 쓰는 것),
 *            그게 이 보기의 쓸모다
 *
 * <b>주의:</b> E040415 자체의 조건 판은 실측하지 못했다(원본 세션 접근 불가).
 * 같은 출력물 묶음에서 실측한 조건 모양(구분 · 일자 구간 기본 금월(~오늘) · 창고 · 품목)을
 * 따랐다. 원본을 다시 열면 대조할 것.
 */
/**
 * 원본 [구분] 실측(사본 · 생산입고/소모현황 I):
 *   거래별 | 생산품목별집계 | 소모품목별집계 | 품목별집계 | 생산품목라인별집계
 * 우리는 [내역 | 품목별] 둘뿐이었다 — 생산품과 소모자재를 갈라 볼 수가 없어
 * "이 자재가 어디에 얼마나 들어갔나" 를 못 봤다.
 *
 * <p>이름도 원본을 따른다. '내역'이 아니라 <b>거래별</b>(전표 한 줄씩)이다.
 * '생산품목라인별집계'는 생산품목 × 소모자재 조합으로, 한 완제품에 어떤 자재가
 * 얼마나 들어갔는지 보는 자리다.
 *
 * <p>원본 [단가표시] 실측: 생산품목단가 | 입고단가 | 입고단가(VAT포함) | 월별원가 | 소모품목단가.
 * 이 중 <b>입고단가·입고단가(VAT포함)</b> 는 우리 생산실적에 단가 칸이 없어 만들 수 없다
 * (원본은 생산입고 전표가 단가를 들고 있다). 나머지 셋은 그대로 둔다.
 * 담당자 조건도 생산실적에 담당자가 없어 못 만든다 — createdBy 는 계정이지 담당 사원이 아니다.
 *
 * <p>원본 결과 열 실측: 일자-No. · 생산품목코드 · 생산품목명 · 소모품목코드 · 소모품목명 ·
 * 생산수량 · <b>표준소모수량</b> · 실제소모수량 · 생산품목단가 · 소모품목단가 · 차이 · 금액
 * (열 id MAKE · B · M · IN_MAN_PRICE · IN_CON_PRICE · GAP · AMT).
 * 우리 [거래별]은 입고 한 줄 밑에 소모를 접어 넣은 나무 모양이었고 <b>수량밖에 없었다</b> —
 * BOM 대로 썼는지(표준 대 실제)와 그 차이가 얼마짜리인지가 이 화면의 핵심인데 그게 없었다.
 */
type Mode = '거래별' | '생산품목별집계' | '소모품목별집계' | '품목별집계' | '생산품목라인별집계'
const MODES = ['거래별', '생산품목별집계', '소모품목별집계', '품목별집계', '생산품목라인별집계'] as const

interface ProductionMaterial {
  componentId: number
  componentCode: string
  componentName: string
  unit: string
  quantity: number
}

interface Production {
  id: number
  prodNo: string
  workOrderId: number
  workOrderNo: string
  productId: number
  productCode: string
  productName: string
  productUnit: string
  warehouseId: number
  warehouseName: string
  producedQty: number
  productionDate: string
  createdBy: string | null
  materials: ProductionMaterial[]
}

const num = (n: number) => n.toLocaleString('ko-KR')
const won = (n: number | null) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'))

/**
 * 원본 [단가표시]. 입고단가·입고단가(VAT포함)는 생산실적에 단가가 없어 뺐다.
 * 없는 값을 이름만 걸어 두면 화면이 거짓말을 한다.
 */
const PRICE_BASES = ['소모품목단가', '생산품목단가', '월별원가'] as const
type PriceBasis = typeof PRICE_BASES[number]

interface BomRow { productId: number; lines: { componentId: number; componentName: string; quantity: number }[] }
interface CostRow { itemId: number; period: string; standardTotal: number }

export default function ProductionIssueStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  const [rows, setRows] = useState<Production[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [mode, setMode] = useState<Mode>('거래별')
  const [view, setView] = useState<'표' | '그래프'>('표')
  const init = periodOf('금월(~오늘)', new Date()) ?? { from: ymd(new Date()), to: ymd(new Date()) }
  const [cond, setCond] = useState({
    from: init.from, to: init.to, warehouseId: '', item: '', orderNo: '',
    /**
     * 원본 조건은 [생산품목]과 [소모품목]이 <b>따로</b>다. 우리 [품목] 하나는 어느 쪽이든
     * 걸려서, "이 완제품을 만들 때 이 자재를 얼마나 썼나" 를 두 조건으로 좁힐 수가 없었다.
     */
    product: '', material: '',
  })
  const [priceBasis, setPriceBasis] = useState<PriceBasis>('소모품목단가')
  const [boms, setBoms] = useState<BomRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<Production[]>('/productions'),
      api.get<Warehouse[]>('/warehouses'),
      api.get<BomRow[]>('/boms'),
      api.get<Item[]>('/items'),
      api.get<PurchaseDoc[]>('/purchases'),
      api.get<CostRow[]>('/costs'),
    ])
      .then(([p, w, b, i, pu, c]) => {
        setRows(p.data); setWarehouses(w.data)
        setBoms(b.data); setItems(i.data); setPurchases(pu.data); setCosts(c.data)
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  /**
   * 품목 조건은 <b>생산품이든 소모자재든</b> 걸리면 잡는다.
   * 한쪽만 보면 "그 자재가 어디에 쓰였나"를 못 찾는다.
   */
  const hitItem = (p: Production) => !cond.item
    || p.productName.includes(cond.item) || p.productCode.includes(cond.item)
    || p.materials.some((m) => m.componentName.includes(cond.item) || m.componentCode.includes(cond.item))

  const shown = rows
    .filter((p) => !cond.from || p.productionDate >= cond.from)
    .filter((p) => !cond.to || p.productionDate <= cond.to)
    .filter((p) => !cond.warehouseId || String(p.warehouseId) === cond.warehouseId)
    .filter((p) => !cond.orderNo || p.workOrderNo.includes(cond.orderNo))
    .filter(hitItem)
    // 원본 조건의 [생산품목]·[소모품목] — 둘을 함께 걸면 그 조합만 남는다.
    .filter((p) => !cond.product
      || p.productName.includes(cond.product) || p.productCode.includes(cond.product))
    .filter((p) => !cond.material
      || p.materials.some((m) => m.componentName.includes(cond.material) || m.componentCode.includes(cond.material)))
    .sort((a, b) => (a.productionDate < b.productionDate ? 1 : -1))

  /**
   * 단가. 평가단가는 재고자산평가와 <b>같은 규칙</b>(마지막 입고단가 → 품목 구매단가 → 모름)이고,
   * 월별원가는 그 <b>생산한 달</b>의 표준원가를 쓴다 — 기간이 여러 달에 걸쳐도 달마다 맞게.
   * 모르면 null 이다. 0 으로 채우면 자재를 두 배 써도 금액 차이가 0으로 보인다.
   */
  const evalPrice = useMemo(
    () => stockCostMap(items, purchases.map((d) => ({
      purchaseDate: d.purchaseDate,
      lines: (d.lines ?? []).map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice })),
    }))),
    [items, purchases],
  )
  const monthlyCost = useMemo(
    () => new Map(costs.map((c) => [`${c.itemId}:${c.period}`, c.standardTotal])), [costs])

  const priceOf = (itemId: number, date: string): number | null => {
    if (priceBasis === '월별원가') return monthlyCost.get(`${itemId}:${date.slice(0, 7)}`) ?? null
    return evalPrice.get(itemId) ?? null
  }

  const bomByProduct = useMemo(
    () => new Map<number, BomLine[]>(boms.map((b) => [b.productId, b.lines])), [boms])

  /**
   * 원본 [거래별] 한 줄 = 생산전표 × 소모품목.
   * 표준소모수량은 BOM 소요량 × 생산수량, 차이는 실제 − 표준, 금액은 차이 × 단가다.
   * 규칙은 utils/woEfficiency 에 있다 — 작업지시서효율현황과 같은 규칙을 쓴다.
   */
  const flatRows = useMemo(() => shown.flatMap((p) => {
    const diffs = materialDiff(
      bomByProduct.get(p.productId) ?? [],
      p.materials.map((m) => ({ componentId: m.componentId, componentName: m.componentName, quantity: m.quantity })),
      p.producedQty,
      () => 1,   // 수량만 필요하다. 금액은 [단가표시]가 정한 단가로 아래에서 따로 센다.
    )
    const codeOf = new Map(p.materials.map((m) => [m.componentId, m.componentCode]))
    const unitOf = new Map(p.materials.map((m) => [m.componentId, m.unit]))
    return diffs
      .filter((d) => d.stdQty !== 0 || d.actualQty !== 0)
      .map((d) => {
        /*
         * 원본 결과 열은 <b>생산품목단가</b>와 <b>소모품목단가</b>가 <b>둘 다</b> 있다.
         * [단가표시]는 그중 <b>어느 것으로 금액을 셀지</b>를 고르는 조건이다 —
         * 하나만 그리면 고른 쪽만 보이고 다른 쪽은 볼 방법이 없다.
         */
        const productPrice = priceOf(p.productId, p.productionDate)
        const materialPrice = priceOf(d.componentId, p.productionDate)
        const price = priceBasis === '생산품목단가' ? productPrice : materialPrice
        const gap = d.actualQty - d.stdQty
        return {
          prod: p,
          componentId: d.componentId,
          componentCode: codeOf.get(d.componentId) ?? '',
          componentName: d.componentName,
          unit: unitOf.get(d.componentId) ?? '',
          stdQty: d.stdQty,
          actualQty: d.actualQty,
          gap,
          productPrice,
          materialPrice,
          price,
          amount: price == null ? null : gap * price,
        }
      })
  }), [shown, bomByProduct, priceBasis, evalPrice, monthlyCost])

  /** 품목별 — 같은 품목이 입고에도 소모에도 나올 수 있다(반제품). 양쪽을 한 줄에 둔다. */
  const byItem = useMemo(() => {
    const m = new Map<number, { itemId: number; code: string; name: string; unit: string; inQty: number; outQty: number; inCount: number; outCount: number }>()
    const at = (id: number, code: string, name: string, unit: string) => {
      const g = m.get(id) ?? { itemId: id, code, name, unit, inQty: 0, outQty: 0, inCount: 0, outCount: 0 }
      m.set(id, g)
      return g
    }
    shown.forEach((p) => {
      const g = at(p.productId, p.productCode, p.productName, p.productUnit)
      g.inQty += p.producedQty; g.inCount += 1
      p.materials.forEach((mt) => {
        const h = at(mt.componentId, mt.componentCode, mt.componentName, mt.unit)
        h.outQty += mt.quantity; h.outCount += 1
      })
    })
    return [...m.values()].sort((a, b) => (b.inQty + b.outQty) - (a.inQty + a.outQty))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cond])

  /** 생산품목별집계 — 완제품 기준 입고수량. */
  const byProduct = useMemo(() => {
    const m = new Map<number, { itemId: number; code: string; name: string; unit: string; qty: number; count: number }>()
    for (const p of shown) {
      const g = m.get(p.productId)
        ?? { itemId: p.productId, code: p.productCode, name: p.productName, unit: p.productUnit, qty: 0, count: 0 }
      g.qty += p.producedQty
      g.count += 1
      m.set(p.productId, g)
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty)
  }, [shown])

  /** 소모품목별집계 — 자재 기준 소모수량. */
  const byMaterial = useMemo(() => {
    const m = new Map<number, { itemId: number; code: string; name: string; unit: string; qty: number; count: number }>()
    for (const p of shown) {
      for (const mt of p.materials) {
        const g = m.get(mt.componentId)
          ?? { itemId: mt.componentId, code: mt.componentCode, name: mt.componentName, unit: mt.unit, qty: 0, count: 0 }
        g.qty += mt.quantity
        g.count += 1
        m.set(mt.componentId, g)
      }
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty)
  }, [shown])

  /** 생산품목라인별집계 — 완제품 × 소모자재. 한 완제품에 무엇이 얼마나 들어갔나. */
  const byProductLine = useMemo(() => {
    const m = new Map<string, {
      key: string; product: string; material: string; unit: string; producedQty: number; usedQty: number; count: number
    }>()
    for (const p of shown) {
      for (const mt of p.materials) {
        const key = `${p.productId}-${mt.componentId}`
        const g = m.get(key) ?? {
          key, product: `[${p.productCode}] ${p.productName}`,
          material: `[${mt.componentCode}] ${mt.componentName}`,
          unit: mt.unit, producedQty: 0, usedQty: 0, count: 0,
        }
        g.producedQty += p.producedQty
        g.usedQty += mt.quantity
        g.count += 1
        m.set(key, g)
      }
    }
    return [...m.values()].sort((a, b) => b.usedQty - a.usedQty)
  }, [shown])

  /* 지금 보고 있는 [구분]이 재는 값을 그린다. */
  const chartRows = useMemo(() => {
    if (mode === '소모품목별집계' || mode === '품목별집계') {
      return byMaterial.map((r) => ({ label: r.name, value: r.qty }))
    }
    if (mode === '생산품목라인별집계') {
      return byProductLine.map((r) => ({ label: `${r.product} / ${r.material}`, value: r.usedQty }))
    }
    return byProduct.map((r) => ({ label: r.name, value: r.qty }))
  }, [mode, byProduct, byMaterial, byProductLine])

  const totals = shown.reduce(
    (a, p) => ({
      inQty: a.inQty + p.producedQty,
      outQty: a.outQty + p.materials.reduce((n, m) => n + m.quantity, 0),
      lines: a.lines + 1 + p.materials.length,
    }),
    { inQty: 0, outQty: 0, lines: 0 },
  )

  const reset = () => {
    setMode('거래별')
    setCond({ from: init.from, to: init.to, warehouseId: '', item: '', orderNo: '', product: '', material: '' })
  }

  return (
    <EcListShell
      title="생산입고/소모현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
        view={view} onViewChange={setView}
        dateLabel="생산일자"
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {MODES.map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
        {mode === '거래별' && (
          <EcCond label="단가표시">
            <div className="ec-pills">
              {PRICE_BASES.map((b) => (
                <button key={b} type="button" className={`ec-pill no-ec${priceBasis === b ? ' active' : ''}`}
                        onClick={() => setPriceBasis(b)}>{b}</button>
              ))}
            </div>
          </EcCond>
        )}
        <EcCond label="창고" pick>
          <select className="ec-input" value={cond.warehouseId}
                  onChange={(e) => setC({ warehouseId: e.target.value })} style={{ width: 220 }}>
            <option value="">전체</option>
            {warehouses.map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        {/* 원본 조건은 [생산품목]과 [소모품목]이 따로다. 위 [품목]은 어느 쪽이든 거는 우리 것이다. */}
        <EcCond label="생산품목" pick>
          <CodePickerField label="생산품목" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={cond.product} onChange={(v) => setC({ product: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="소모품목" pick>
          <CodePickerField label="소모품목" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={cond.material} onChange={(v) => setC({ material: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="작업지시번호">
          <input className="ec-input" placeholder="WO-…" value={cond.orderNo}
                 onChange={(e) => setC({ orderNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {mode === '거래별' ? '생산' : '묶음'}{' '}
        <b style={{ color: '#3c4553' }}>{num(
          mode === '거래별' ? shown.length
            : mode === '생산품목별집계' ? byProduct.length
              : mode === '소모품목별집계' ? byMaterial.length
                : mode === '생산품목라인별집계' ? byProductLine.length
                  : byItem.length,
        )}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        입고 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(totals.inQty)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        소모 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totals.outQty)}</b>
      </div>

      {/*
        원본 [그래프로 보기]. 이 화면은 [구분]이 다섯 가지라 그릴 값도 갈린다 —
        생산품목별은 입고수량, 소모품목별은 소모수량이다. 한 가지로 고정하면
        어떤 구분에서는 늘 0인 막대가 나온다.
      */}
      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="조회된 생산입고가 없습니다." />
      ) : (
      <div className="overflow-x-auto">
        {mode === '거래별' ? (
          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>일자-No.</th>
                <th>생산품목코드</th>
                <th>생산품목명</th>
                <th>소모품목코드</th>
                <th>소모품목명</th>
                <th style={{ textAlign: 'right' }}>생산수량</th>
                <th style={{ textAlign: 'right' }}>표준소모수량</th>
                <th style={{ textAlign: 'right' }}>실제소모수량</th>
                {/* 원본 열 순서: … 실제소모수량 · 생산품목단가 · 소모품목단가 · 차이 · 금액 */}
                <th style={{ textAlign: 'right' }}>생산품목단가</th>
                <th style={{ textAlign: 'right' }}>소모품목단가</th>
                <th style={{ textAlign: 'right' }}>차이</th>
                <th style={{ textAlign: 'right' }} title={`금액은 [${priceBasis}] 로 셉니다`}>금액</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--ec-text-grid)', padding: 20 }}>불러오는 중…</td></tr>
              ) : flatRows.length === 0 ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--ec-text-grid)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : flatRows.map((r, i) => {
                /* 실제가 표준보다 많으면(차이 양수) 그만큼 더 쓴 것이다 — 붉게. */
                const over = r.gap > 0
                return (
                  <tr key={`${r.prod.id}-${r.componentId}`}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {r.prod.productionDate.replace(/-/g, '/')} {r.prod.prodNo}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{r.prod.productCode}</td>
                    <td>{r.prod.productName}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.componentCode}</td>
                    <td>{r.componentName}</td>
                    <td style={{ textAlign: 'right' }}>{num(r.prod.producedQty)}</td>
                    <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(r.stdQty)}</td>
                    <td style={{ textAlign: 'right' }}>{num(r.actualQty)}</td>
                    {/* 금액을 세는 쪽 단가를 굵게 — [단가표시] 가 고른 쪽이 어디인지 표에서 보인다. */}
                    <td style={{ textAlign: 'right', color: r.productPrice == null ? '#c9ced6' : '#5a626e',
                                 fontWeight: priceBasis === '생산품목단가' ? 700 : undefined }}>
                      {won(r.productPrice)}
                    </td>
                    <td style={{ textAlign: 'right', color: r.materialPrice == null ? '#c9ced6' : '#5a626e',
                                 fontWeight: priceBasis === '생산품목단가' ? undefined : 700 }}>
                      {won(r.materialPrice)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: over ? '#c60a2e' : r.gap < 0 ? '#1c7c3c' : '#9aa1ab' }}>
                      {num(r.gap)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.amount == null ? '#c9ced6' : over ? '#c60a2e' : undefined }}>
                      {won(r.amount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {flatRows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: '#f5f7fa' }}>
                  <td colSpan={7} style={{ textAlign: 'right' }}>합계 ({flatRows.length}줄)</td>
                  <td style={{ textAlign: 'right' }}>{num(flatRows.reduce((n, r) => n + r.stdQty, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{num(flatRows.reduce((n, r) => n + r.actualQty, 0))}</td>
                  {/* 생산품목단가 · 소모품목단가 — 단가는 더할 값이 아니라 비워 둔다 */}
                  <td colSpan={2}></td>
                  <td style={{ textAlign: 'right' }}>{num(flatRows.reduce((n, r) => n + r.gap, 0))}</td>
                  {/* 단가를 모르는 줄은 빼고 센다 — 0 으로 채우면 차이가 없는 것처럼 보인다 */}
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
                    {won(flatRows.reduce((n, r) => n + (r.amount ?? 0), 0))}
                    {flatRows.some((r) => r.amount == null) && (
                      <span title="단가를 모르는 줄은 빼고 셌습니다." style={{ color: '#c07a00' }}> *</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : mode === '생산품목별집계' ? (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th style={{ width: 140 }}>품목코드</th>
                <th>생산품목</th>
                <th style={{ width: 100, textAlign: 'right' }}>전표수</th>
                <th style={{ width: 130, textAlign: 'right' }}>입고수량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ec-text-grid)', padding: 20 }}>불러오는 중…</td></tr>
              ) : byProduct.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ec-text-grid)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : byProduct.map((g, i) => (
                <tr key={g.itemId}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.code}</td>
                  <td>{g.name}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{num(g.qty)} {g.unit}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>합계 ({byProduct.length}품목)</td>
                <td style={{ textAlign: 'right' }}>{num(shown.length)}</td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{num(totals.inQty)}</td>
              </tr>
            </tfoot>
          </table>
        ) : mode === '소모품목별집계' ? (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th style={{ width: 140 }}>품목코드</th>
                <th>소모자재</th>
                <th style={{ width: 100, textAlign: 'right' }}>소모건수</th>
                <th style={{ width: 130, textAlign: 'right' }}>소모수량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ec-text-grid)', padding: 20 }}>불러오는 중…</td></tr>
              ) : byMaterial.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ec-text-grid)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : byMaterial.map((g, i) => (
                <tr key={g.itemId}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.code}</td>
                  <td>{g.name}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{num(g.qty)} {g.unit}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({byMaterial.length}자재)</td>
                <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totals.outQty)}</td>
              </tr>
            </tfoot>
          </table>
        ) : mode === '생산품목라인별집계' ? (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>생산품목</th>
                <th>소모자재</th>
                <th style={{ width: 100, textAlign: 'right' }}>전표수</th>
                <th style={{ width: 120, textAlign: 'right' }}>입고수량</th>
                <th style={{ width: 120, textAlign: 'right' }}>소모수량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)', padding: 20 }}>불러오는 중…</td></tr>
              ) : byProductLine.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : byProductLine.map((g, i) => (
                <tr key={g.key}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td>{g.product}</td>
                  <td>{g.material}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{num(g.producedQty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{num(g.usedQty)} {g.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '5%' }} /><col style={{ width: '16%' }} /><col />
              <col style={{ width: '10%' }} /><col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>품목코드</th>
                <th>품목명</th>
                <th style={{ textAlign: 'right' }}>입고건수</th>
                <th style={{ textAlign: 'right' }}>입고수량</th>
                <th style={{ textAlign: 'right' }}>소모건수</th>
                <th style={{ textAlign: 'right' }}>소모수량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : byItem.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : byItem.map((g, i) => (
                // 입고와 소모가 둘 다 있는 품목 = 만들어서 다시 쓰는 반제품. 눈에 띄게 둔다.
                <tr key={g.itemId} style={g.inQty > 0 && g.outQty > 0 ? { background: '#f7f4ff' } : undefined}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.code}</td>
                  <td>
                    {g.name}
                    {g.inQty > 0 && g.outQty > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#6b4bb8' }}>반제품 · 만들어서 다시 씀</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.inCount || ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: g.inQty ? 'var(--ec-blue)' : '#c9ced6' }}>
                    {g.inQty ? num(g.inQty) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.outCount || ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: g.outQty ? '#a5561b' : '#c9ced6' }}>
                    {g.outQty ? num(g.outQty) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {byItem.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{num(totals.inQty)}</td>
                  <td style={{ background: '#f5f7fa' }}></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: '#a5561b' }}>{num(totals.outQty)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
      )}
    </EcListShell>
  )
}

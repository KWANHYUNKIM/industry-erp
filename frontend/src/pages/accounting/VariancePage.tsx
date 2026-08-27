import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useInactiveItems } from '../../utils/useInactiveItems'
import { stockCostMap } from '../../utils/stockValue'
import { materialDiff, type BomLine } from '../../utils/woEfficiency'
import { amountVariance, priceVariance, qtyVariance, weightedAvgPrice } from '../../utils/costVariance'
import type { Item, PurchaseDoc } from '../../api/types'

/**
 * 회계 > 차이분석.
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 원가비교집계표 | 재료비단가차이 | 소모수량차이 | 노무비/경비/외주비차이
 *   기준월 · 품목 · 생산공정 · [기타] 결재방표시 · 수량관리제외품목포함 · 사용중단품목포함 ·
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
  const [mode, setMode] = useState<Mode>('원가비교집계표')
  const [costs, setCosts] = useState<Cost[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [boms, setBoms] = useState<BomRow[]>([])
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [keyword, setKeyword] = useState('')
  const [period, setPeriod] = useState('전체')
  const [withInactive, setWithInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const inactive = useInactiveItems()

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [c, i, p, b, pr] = await Promise.all([
        api.get<Cost[]>('/costs'),
        api.get<Item[]>('/items'),
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<BomRow[]>('/boms'),
        api.get<ProductionRow[]>('/productions'),
      ])
      setCosts(c.data); setItems(i.data); setPurchases(p.data); setBoms(b.data); setProductions(pr.data)
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
  const hit = (itemId: number, code: string, name: string) => {
    if (!withInactive && inactive.has(itemId)) return false
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
    () => stockCostMap(items, purchases.map((d) => ({
      purchaseDate: d.purchaseDate,
      lines: (d.lines ?? []).map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice })),
    }))),
    [items, purchases],
  )

  const nameOf = useMemo(() => new Map(items.map((i) => [i.id, { code: i.code, name: i.name }])), [items])

  // ── 원가비교집계표 (기존 표. 원본 이름으로)
  const compareRows = costs
    .filter((r) => inPeriod(r.period))
    .filter((r) => hit(r.itemId, r.itemCode, r.itemName))

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
  }, [purchases, period, keyword, withInactive, inactive, nameOf, stdPriceOf])

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
  }, [productions, boms, period, keyword, withInactive, inactive, nameOf, stdPriceOf, evalPriceOf])

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
        { label: '다시 작성', onClick: () => { setPeriod('전체'); setKeyword(''); setWithInactive(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
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
          <input className="ec-input" placeholder="품목코드·품명 일부" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
            사용중단품목포함
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
              <th style={{ width: 90 }}>품목코드</th>
              <th>품목명</th>
              <th style={{ width: 80 }}>기준월</th>
              <th style={{ textAlign: 'right' }}>표준원가</th>
              <th style={{ textAlign: 'right' }}>실제원가</th>
              <th style={{ textAlign: 'right' }}>차이금액</th>
              <th style={{ textAlign: 'right' }}>차이율(%)</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : compareRows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.period}</td>
                <td style={{ textAlign: 'right' }}>{num(r.standardTotal)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.actualTotal)}</td>
                <td style={{ textAlign: 'right', color: varColor(r.variance) }}>{num(r.variance)}</td>
                <td style={{ textAlign: 'right', color: varColor(r.variance) }}>{r.varianceRate}</td>
              </tr>
            ))}
          </tbody>
          {compareRows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({compareRows.length}품목)</td>
                <td style={{ textAlign: 'right' }}>{num(compareRows.reduce((n, r) => n + r.standardTotal, 0))}</td>
                <td style={{ textAlign: 'right' }}>{num(compareRows.reduce((n, r) => n + r.actualTotal, 0))}</td>
                <td style={{ textAlign: 'right', color: varColor(compareRows.reduce((n, r) => n + r.variance, 0)) }}>
                  {num(compareRows.reduce((n, r) => n + r.variance, 0))}
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

import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import EcBarChart from '../../components/EcBarChart'
import { api, extractErrorMessage } from '../../api/client'
import { stockCostMap } from '../../utils/stockValue'
import { rollupConsume, CONSUME_GROUPS, type ConsumeGroup, type ConsumeRow } from '../../utils/consumeRollup'
import type { Item, PurchaseDoc } from '../../api/types'

/**
 * 생산관리 > 생산입고/소모현황Ⅰ (/api/productions + /api/boms).
 *
 * <p><b>원본 조건 판 실측(사본 '생산입고_소모현황 I')</b>:
 *   [구분] 거래별 · 생산품목별집계 · 소모품목별집계 · 품목별집계 · 생산품목라인별집계 ·
 *   기준일자 · [단가표시] 생산품목단가 · 입고단가 · 입고단가(VAT포함) · 월별원가 · 소모품목단가 ·
 *   창고 · 생산품목 · 소모품목 · 담당자 · [데이터 보기형식] [그래프로 보기]
 *
 * <p><b>원본 열 실측</b>: 일자-No. · 생산품목코드 · 생산품목명 · 소모품목코드 · 소모품목명 ·
 * 생산수량 · 표준소모수량 · 실제소모수량 · 생산품목단가 · 소모품목단가 · 차이 · 금액.
 *
 * <p>우리 화면은 검색어 한 칸에 일자·입고번호·완제품명·소모자재·예정소모·실제소모·차이가
 * 전부였다 — 기간으로 못 거르고, 금액이 없어 "차이가 얼마짜리인가" 를 알 수 없었다.
 *
 * <p><b>안 만든 것과 그 이유</b>
 * <ul>
 *   <li>[구분]의 <b>품목별집계 · 생산품목라인별집계</b> — 사본에 이름만 있고 줄이 비어 있어
 *       위 셋과 어떻게 다른지를 잴 수가 없다. 이름만 걸어 두면 화면이 거짓말을 한다.</li>
 *   <li>[단가표시]의 <b>입고단가 · 입고단가(VAT포함) · 월별원가</b> — 입고 레이어(입고 건별
 *       단가 이력)가 없다. 생산품목단가·소모품목단가는 재고자산평가와 같은 규칙으로 낸다.</li>
 * </ul>
 */
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
  workOrderNo: string
  productId: number
  productCode: string
  productName: string
  producedQty: number
  productionDate: string
  warehouseId: number | null
  warehouseName: string | null
  materials: ProductionMaterial[]
}

interface BomLine { componentId: number; quantity: number }
interface Bom { id: number; productId: number; lines: BomLine[] }

const num = (n: number) => n.toLocaleString('ko-KR')
const won = (n: number | null) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'))

export default function ConsumeStatusPage() {
  const [productions, setProductions] = useState<Production[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [group, setGroup] = useState<ConsumeGroup>('거래별')
  const [view, setView] = useState<'표' | '그래프'>('표')
  const [product, setProduct] = useState('')
  const [material, setMaterial] = useState('')
  const [warehouse, setWarehouse] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [pr, bm, it, pu] = await Promise.all([
        api.get<Production[]>('/productions'),
        api.get<Bom[]>('/boms'),
        api.get<Item[]>('/items'),
        api.get<PurchaseDoc[]>('/purchases'),
      ])
      setProductions(pr.data)
      setBoms(bm.data)
      setItems(it.data)
      setPurchases(pu.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to); setGroup('거래별')
    setProduct(''); setMaterial(''); setWarehouse('')
  }

  /**
   * 단가는 재고자산평가와 <b>같은 규칙</b>(마지막 입고단가 → 품목 구매단가 → 모름).
   * 모르면 null 이다 — 0 으로 채우면 금액 합계가 조용히 작아진다.
   */
  const priceOf = useMemo(
    () => stockCostMap(items, purchases.map((d) => ({
      purchaseDate: d.purchaseDate,
      lines: (d.lines ?? []).map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice })),
    }))),
    [items, purchases],
  )

  /** 생산품목:소모품목 → 개당 BOM 소요량. */
  const bomPer = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of boms) for (const l of b.lines) m.set(`${b.productId}:${l.componentId}`, l.quantity)
    return m
  }, [boms])

  const flat = useMemo<ConsumeRow[]>(() => {
    const out: ConsumeRow[] = []
    const sorted = [...productions].sort((a, b) => (
      a.productionDate < b.productionDate ? 1 : a.productionDate > b.productionDate ? -1 : b.id - a.id))
    for (const p of sorted) {
      if (from && p.productionDate < from) continue
      if (to && p.productionDate > to) continue
      if (warehouse && !(p.warehouseName ?? '').includes(warehouse)) continue
      if (product && !(p.productCode.includes(product) || p.productName.includes(product))) continue
      for (const m of p.materials) {
        if (material && !(m.componentCode.includes(material) || m.componentName.includes(material))) continue
        const per = bomPer.get(`${p.productId}:${m.componentId}`)
        const mp = priceOf.get(m.componentId) ?? null
        out.push({
          key: `${p.id}-${m.componentId}`,
          date: p.productionDate,
          prodNo: p.prodNo,
          productionId: p.id,
          productId: p.productId, productCode: p.productCode, productName: p.productName,
          materialId: m.componentId, materialCode: m.componentCode, materialName: m.componentName,
          producedQty: p.producedQty,
          stdQty: per !== undefined ? per * p.producedQty : null,
          actualQty: m.quantity,
          // 금액은 실제 소모한 만큼 × 소모품목단가. 단가를 모르면 null 이다.
          amount: mp == null ? null : mp * m.quantity,
        })
      }
    }
    return out
  }, [productions, bomPer, priceOf, from, to, product, material, warehouse])

  // 규칙은 utils/consumeRollup 에 있다 — 단위가 섞인 수량을 더하면 틀린 줄 모르고 읽힌다.
  const shown = useMemo(() => rollupConsume(flat, group), [flat, group])

  const totals = flat.reduce((a, r) => ({
    amount: a.amount + (r.amount ?? 0),
    unknown: a.unknown + (r.amount == null ? 1 : 0),
  }), { amount: 0, unknown: 0 })

  /** 그림은 지금 보고 있는 [구분]을 따라간다. 금액을 모르면 실제소모수량으로 그린다. */
  const chartRows = useMemo(() => shown.map((r) => ({
    label: group === '생산품목별집계' ? r.productName
      : group === '소모품목별집계' ? r.materialName
        : `${r.date} ${r.materialName}`,
    value: r.amount ?? r.actualQty,
  })), [shown, group])

  const COLS = 13

  return (
    <EcListShell
      title="생산입고/소모현황Ⅰ"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        modes={CONSUME_GROUPS} mode={group} onModeChange={(m) => setGroup(m as ConsumeGroup)}
        view={view} onViewChange={setView}
      >
        <EcCond label="생산품목" pick>
          <input className="ec-input" placeholder="생산품목코드·품목명 일부" value={product}
                 onChange={(e) => setProduct(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="소모품목" pick>
          <input className="ec-input" placeholder="소모품목코드·품목명 일부" value={material}
                 onChange={(e) => setMaterial(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <input className="ec-input" placeholder="창고명 일부" value={warehouse}
                 onChange={(e) => setWarehouse(e.target.value)} style={{ width: 160 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {shown.length}줄
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        금액 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{won(totals.amount)}</b>
        {totals.unknown > 0 && (
          <span title={`단가를 모르는 줄 ${totals.unknown}건은 금액에서 뺐습니다.`} style={{ color: '#c07a00' }}> *</span>
        )}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} emptyText="조회된 소모가 없습니다." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th style={{ width: 170 }}>일자-No.</th>
                <th style={{ width: 110 }}>생산품목코드</th>
                <th>생산품목명</th>
                <th style={{ width: 110 }}>소모품목코드</th>
                <th>소모품목명</th>
                <th style={{ width: 100, textAlign: 'right' }}>생산수량</th>
                <th style={{ width: 110, textAlign: 'right' }}>표준소모수량</th>
                <th style={{ width: 110, textAlign: 'right' }}>실제소모수량</th>
                <th style={{ width: 110, textAlign: 'right' }}>생산품목단가</th>
                <th style={{ width: 110, textAlign: 'right' }}>소모품목단가</th>
                <th style={{ width: 100, textAlign: 'right' }}>차이</th>
                <th style={{ width: 120, textAlign: 'right' }}>금액</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLS} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={COLS} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => {
                const diff = r.stdQty != null && !r.qtyMixed ? r.actualQty - r.stdQty : null
                const pp = r.productCode ? priceOf.get(r.productId) ?? null : null
                const mp = r.materialCode ? priceOf.get(r.materialId) ?? null : null
                return (
                  <tr key={r.key}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>
                      {r.date ? `${r.date} ${r.prodNo}` : `(${r.count}건)`}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{r.productCode}</td>
                    <td>{r.productName}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.materialCode}</td>
                    <td>{r.materialName}</td>
                    <td style={{ textAlign: 'right', color: '#5a626e' }}>
                      {r.productCode ? num(r.producedQty) : ''}
                    </td>
                    {/*
                      단위가 섞인 묶음은 비운다 — 'EA 3개 + kg 2' 를 더한 숫자는
                      틀린 줄 모르고 읽힌다.
                    */}
                    <td style={{ textAlign: 'right', color: '#8a929c' }}>
                      {r.qtyMixed ? '' : r.stdQty != null ? num(r.stdQty) : '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.qtyMixed ? '' : num(r.actualQty)}</td>
                    <td style={{ textAlign: 'right', color: pp == null ? '#c9ced6' : '#5a626e' }}>{won(pp)}</td>
                    <td style={{ textAlign: 'right', color: mp == null ? '#c9ced6' : '#5a626e' }}>{won(mp)}</td>
                    <td style={{ textAlign: 'right', color: diff != null && diff !== 0 ? '#c60a2e' : '#9aa1ab' }}>
                      {diff != null ? num(diff) : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                  <td colSpan={12} style={{ textAlign: 'right' }}>합계 ({shown.length}줄)</td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{won(totals.amount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </EcListShell>
  )
}

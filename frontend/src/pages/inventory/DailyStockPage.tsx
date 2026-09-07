import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc, StockRow, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { costOf as pickCost, type CostBasis } from '../../utils/costBasis'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STOCK_PICKS, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { periodOf } from '../../components/EcPeriodPicks'

/**
 * 재고 > 일별재고현황 (이카운트 E040807)
 *
 * 재고현황·재고잔량분석표와 겹쳐 보이지만 이 화면만 하는 일이 있다 — <b>원가 기준을 고른다.</b>
 * 같은 재고라도 무엇으로 평가하느냐에 따라 금액이 달라지고, 결산에서 문제가 되는 건 늘 그 차이다.
 *
 * 원본 원가 기준: 선입선출(판매) · 월별원가 · 입고단가(품목) · 입고단가(품목)-VAT제외 · 최종구매가.
 * 우리가 실제로 계산할 수 있는 셋만 둔다.
 *
 *   월별원가 — GET /api/costs?period=YYYY-MM 의 표준원가(standardTotal). 기준일자의 월을 쓴다
 *   최종구매가 — 그 품목을 마지막으로 산 구매 라인의 단가
 *   입고단가(품목) — 품목의 <b>구매단가</b>. 예전에는 품목 단가가 하나뿐이라 판매단가를 읽었고,
 *              이름을 그대로 쓰면 거짓이 되므로 '품목단가'라고 적어 뒀었다.
 *              이제 구매단가가 따로 있으니 원본 이름을 그대로 쓴다
 *
 * <b>선입선출은 빼놨다</b> — 우리는 입고 레이어를 남기지 않아서 계산할 수가 없다.
 * 있는 척하고 다른 값을 보여 주는 것보다 없는 편이 낫다.
 *
 * 원본 기타 중 '결재방표시'·'수량관리제외품목포함'은 대응 개념이 없다.
 * <p>[기준일자]는 이제 <b>실제로 조회에 쓴다</b>. 예전에는 칸만 두고 무시했다 —
 * 날짜를 바꿔도 늘 현재고가 나왔다. 조건이 있으면 사람은 그 값이 반영된 줄 안다.
 * 서버가 현재고에서 그 뒤의 입출고를 빼서 그 시점 재고를 낸다(GET /stock?asOf=).
 */
type Basis = CostBasis

interface CostRow {
  itemId: number
  period: string
  standardTotal: number
  actualTotal: number
}

const num = (n: number) => n.toLocaleString()
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

export default function DailyStockPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  const [stock, setStock] = useState<StockRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  /** 품목별 <b>구매단가</b>. 원가 기준 '입고단가(품목)' 이 쓴다. 0 이면 기준 없음. */
  const [unitPrices, setUnitPrices] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [costNote, setCostNote] = useState('')

  const today = ymd(new Date())
  const [basis, setBasis] = useState<Basis>('입고단가(품목)')
  /* 원본 일별재고현황의 기준일자 기본값은 [금일] 이다(사본 실측). 검사가 읽을 수 있게 periodOf 로 적는다 — 값은 오늘 그대로다. */
  const [cond, setCond] = useState({ date: periodOf('금일')!.to, warehouseId: '', item: '' })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  async function load() {
    setLoading(true)
    setError('')
    setCostNote('')
    try {
      const period = cond.date.slice(0, 7)
      const [s, w, p, i] = await Promise.all([
        api.get<StockRow[]>('/stock', { params: { asOf: cond.date } }),
        api.get<Warehouse[]>('/warehouses'),
        api.get<PurchaseDoc[]>('/purchases'),
        // 원가 기준 '입고단가(품목)' 은 구매단가다. 판매단가(unitPrice)가 아니다.
        api.get<{ id: number; purchasePrice: number }[]>('/items'),
      ])
      setStock(s.data)
      setWarehouses(w.data)
      setPurchases(p.data)
      setUnitPrices(new Map(i.data.map((it) => [it.id, it.purchasePrice])))

      // 원가는 기간이 없으면 빈 배열이 온다 — 그 사실을 화면에 적는다(0 원으로 뭉개지 않게).
      const c = await api.get<CostRow[]>('/costs', { params: { period } })
      setCosts(c.data)
      if (c.data.length === 0) setCostNote(`${period} 월별원가가 등록돼 있지 않습니다.`)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [cond.date])

  /** 그 품목을 마지막으로 산 구매 라인의 단가. 구매 이력이 없으면 null. */
  const lastPurchasePrice = useMemo(() => {
    const m = new Map<number, { date: string; price: number }>()
    purchases.forEach((d) => d.lines.forEach((l) => {
      const cur = m.get(l.itemId)
      if (!cur || d.purchaseDate >= cur.date) m.set(l.itemId, { date: d.purchaseDate, price: l.unitPrice })
    }))
    return m
  }, [purchases])

  const costOf = useMemo(() => new Map(costs.map((c) => [c.itemId, c.standardTotal])), [costs])

  /** 고른 기준의 단가. 값이 없으면 null — 0 으로 채우면 재고금액이 조용히 틀어진다. */
  const priceOf = (itemId: number): number | null => {
    // 규칙은 utils/costBasis 에 있다 — 이익현황과 같은 규칙을 쓴다.
    return pickCost(basis, {
      monthlyCost: costOf.get(itemId) ?? null,
      lastPurchasePrice: lastPurchasePrice.get(itemId)?.price ?? null,
      itemPurchasePrice: unitPrices.get(itemId) ?? null,
    })
  }

  const shown = stock
    .filter((r) => !cond.warehouseId || String(r.warehouseId) === cond.warehouseId)
    .filter((r) => !cond.item || r.itemName.includes(cond.item) || r.itemCode.includes(cond.item))
    .filter((r) => r.quantity !== 0)
    .map((r) => {
      const price = priceOf(r.itemId)
      return { ...r, price, amount: price === null ? null : price * r.quantity }
    })

  const totalQty = shown.reduce((n, r) => n + r.quantity, 0)
  const totalAmount = shown.reduce((n, r) => n + (r.amount ?? 0), 0)
  const missing = shown.filter((r) => r.price === null).length

  const reset = () => { setBasis('입고단가(품목)'); setCond({ date: periodOf('금일')!.to, warehouseId: '', item: '' }) }

  return (
    <EcListShell
      title="일별재고현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        single
        from={cond.date} to={cond.date}
        onPeriod={(r) => setC({ date: r.from })}
        picks={STOCK_PICKS}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.warehouseId} onChange={(v) => setC({ warehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="원가">
          <div className="ec-pills">
            {(['월별원가', '최종구매가', '입고단가(품목)'] as const).map((b) => (
              <button key={b} type="button" className={`ec-pill no-ec${basis === b ? ' active' : ''}`}
                      onClick={() => setBasis(b)}>
                {b}
              </button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      {cond.date !== today && (
        <p style={{ marginBottom: 8, background: '#fff7e6', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          재고수량은 <b>기준일자 시점</b>입니다. 현재고에서 그 뒤의 입출고를 빼서 냅니다.
          수량은 달라지지 않습니다(월별원가는 기준일자의 월을 따릅니다).
        </p>
      )}

      {basis === '월별원가' && costNote && (
        <p style={{ marginBottom: 8, background: '#fff7e6', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          {costNote} 원가관리 &gt; 표준원가에서 만들거나 다른 기준을 고르세요.
        </p>
      )}

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        건수 <b style={{ color: '#3c4553' }}>{num(shown.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        수량 <b style={{ color: '#3c4553', fontSize: 14 }}>{num(totalQty)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        재고금액({basis}) <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totalAmount)}</b>
        {missing > 0 && (
          <>
            <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
            단가없음 <b style={{ color: '#c60a2e', fontSize: 14 }}>{num(missing)}</b>건
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <colgroup>
            <col style={{ width: '4%' }} /><col style={{ width: '14%' }} /><col />
            <col style={{ width: '15%' }} /><col style={{ width: '15%' }} />
            <col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '13%' }} />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>품목코드</th>
              <th>품목명</th>
              <th>규격정보</th>
              <th>창고</th>
              <th style={{ textAlign: 'right' }}>재고수량</th>
              <th style={{ textAlign: 'right' }}>단가</th>
              <th style={{ textAlign: 'right' }}>재고금액</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={`${r.itemId}-${r.warehouseId}`}>
                <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td>{r.spec ?? ''}</td>
                <td>{r.warehouseName}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {num(r.quantity)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{r.unit}</span>
                </td>
                <td style={{ textAlign: 'right', color: r.price === null ? '#c60a2e' : '#5a626e' }}>
                  {r.price === null ? '단가없음' : won(r.price)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.amount === null ? '#c9ced6' : 'var(--ec-blue)' }}>
                  {r.amount === null ? '—' : won(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totalQty)}</td>
                <td style={{ background: '#f5f7fa' }}></td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{won(totalAmount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}

import { Fragment, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Bom, StockRow, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STOCK_PICKS, ymd } from '../../components/EcPeriodPicks'

/**
 * 재고 > BOM환산재고현황 (이카운트 E040726)
 *
 * 재고현황 그룹의 다섯 번째 화면. 자재 재고를 <b>완제품 몇 개분</b>으로 환산해서 본다.
 * "볼트가 3,000개 있다"가 아니라 "이 자재로 모뎀을 40대까지 만들 수 있다"를 본다 —
 * 생산계획을 세울 때 실제로 필요한 숫자다.
 *
 * 계산: 구성품목마다 <code>floor(현재고 / 소요량)</code>. 모품목의 환산가능수량은 그중
 * <b>가장 작은 값</b>이고, 그 값을 만든 구성품목이 제약(병목)이다. 소요량이 0 이면 제약이 아니다.
 *
 * 원본 조건: 기준일자(한 날짜) · 창고 · 품목코드 · 양식 · 양식구분 · 결재방표시.
 * '양식/양식구분'은 출력 서식 고르기라 우리에게 대응 개념이 없고, '결재방표시'도 없다.
 *
 * 우리 BOM 은 <b>1단계</b>다(구성품목이 다시 BOM 을 가져도 펼치지 않는다). 원본도 이 화면에서는
 * BOM 을 그대로 쓰므로 같지만, 다단 전개가 필요해지면 여기가 아니라 BOM 쪽을 고쳐야 한다.
 *
 * <p>[기준일자]는 이제 <b>실제로 조회에 쓴다</b>. 예전에는 칸만 두고 무시했다 —
 * 날짜를 바꿔도 늘 현재고가 나왔다. 조건이 있으면 사람은 그 값이 반영된 줄 안다.
 * 서버가 현재고에서 그 뒤의 입출고를 빼서 그 시점 재고를 낸다(GET /stock?asOf=).
 */
export default function BomStockPage() {
  const [boms, setBoms] = useState<Bom[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = ymd(new Date())
  const [cond, setCond] = useState({ date: today, warehouseId: '', product: '', shortageOnly: false })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<Bom[]>('/boms'),
      api.get<StockRow[]>('/stock', { params: { asOf: cond.date } }),
      api.get<Warehouse[]>('/warehouses'),
    ])
      .then(([b, s, w]) => { setBoms(b.data); setStock(s.data); setWarehouses(w.data) })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  /** 창고 조건이 걸리면 그 창고 재고만 센다. 전체면 전 창고 합. */
  const stockOf = useMemo(() => {
    const m = new Map<number, number>()
    stock
      .filter((r) => !cond.warehouseId || String(r.warehouseId) === cond.warehouseId)
      .forEach((r) => m.set(r.itemId, (m.get(r.itemId) ?? 0) + r.quantity))
    return m
  }, [stock, cond.warehouseId])

  const rows = useMemo(() => boms
    .filter((b) => b.active)
    .filter((b) => !cond.product || b.productName.includes(cond.product) || b.productCode.includes(cond.product))
    .map((b) => {
      const lines = b.lines.map((l) => {
        const qty = stockOf.get(l.componentId) ?? 0
        // 소요량이 0 이면 몇 개를 만들든 안 쓰이는 자재다 — 제약으로 세지 않는다.
        const buildable = l.quantity > 0 ? Math.floor(qty / l.quantity) : null
        return { ...l, stockQty: qty, buildable }
      })
      const limits = lines.filter((l) => l.buildable !== null)
      const buildable = limits.length ? Math.min(...limits.map((l) => l.buildable as number)) : 0
      const bottleneck = limits.filter((l) => l.buildable === buildable).map((l) => l.componentName)
      return { bom: b, lines, buildable, bottleneck }
    })
    .filter((r) => !cond.shortageOnly || r.buildable === 0),
    [boms, stockOf, cond.product, cond.shortageOnly])

  const num = (n: number) => n.toLocaleString()
  const reset = () => setCond({ date: today, warehouseId: '', product: '', shortageOnly: false })
  const totalBuildable = rows.reduce((n, r) => n + r.buildable, 0)
  const blocked = rows.filter((r) => r.buildable === 0).length

  return (
    <EcListShell
      title="BOM환산재고현황"
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
          <select className="ec-input" value={cond.warehouseId}
                  onChange={(e) => setC({ warehouseId: e.target.value })} style={{ width: 220 }}>
            <option value="">전체</option>
            {warehouses.map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목코드" pick>
          <input className="ec-input" placeholder="모품목명·코드 일부" value={cond.product}
                 onChange={(e) => setC({ product: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={cond.shortageOnly}
                   onChange={(e) => setC({ shortageOnly: e.target.checked })} /> 환산가능수량0만표시
          </label>
        </EcCond>
      </EcStatusPanel>

      {cond.date !== today && (
        <p style={{ marginBottom: 8, background: '#fff7e6', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          지금 보는 것은 <b>기준일자 시점의 재고</b>입니다. 현재고에서 그 뒤의 입출고를 빼서 냅니다.
          숫자가 달라지지 않습니다.
        </p>
      )}

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        모품목 <b style={{ color: '#3c4553' }}>{num(rows.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        환산가능수량 합 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(totalBuildable)}</b>
        {blocked > 0 && (
          <>
            <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
            생산불가 <b style={{ color: '#c60a2e', fontSize: 14 }}>{num(blocked)}</b>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <colgroup>
            <col style={{ width: '4%' }} /><col style={{ width: '14%' }} /><col />
            <col style={{ width: '8%' }} /><col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} /><col style={{ width: '13%' }} />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>품목코드</th>
              <th>품목명</th>
              <th>단위</th>
              <th style={{ textAlign: 'right' }}>소요량</th>
              <th style={{ textAlign: 'right' }}>현재고</th>
              <th style={{ textAlign: 'right' }}>환산가능수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r, i) => (
              <Fragment key={r.bom.id}>
                <tr style={{ background: '#f2f6fc' }}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.bom.productCode}</td>
                  <td style={{ fontWeight: 700 }}>
                    {r.bom.productName}
                    {r.bottleneck.length > 0 && r.lines.length > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: '#a5561b' }}>
                        제약 · {r.bottleneck.join(', ')}
                      </span>
                    )}
                  </td>
                  <td>{r.bom.productUnit}</td>
                  <td style={{ textAlign: 'right', color: '#9aa1ab' }}>{r.lines.length}건</td>
                  <td style={{ textAlign: 'right', color: '#9aa1ab' }}>
                    {num(stockOf.get(r.bom.productId) ?? 0)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: r.buildable === 0 ? '#c60a2e' : 'var(--ec-blue)' }}>
                    {num(r.buildable)}
                  </td>
                </tr>
                {r.lines.map((l) => (
                  <tr key={`c-${r.bom.id}-${l.componentId}`}>
                    <td style={{ textAlign: 'center', background: '#f3f3f3' }}></td>
                    <td style={{ fontFamily: 'monospace', paddingLeft: 18, color: '#5a626e' }}>└ {l.componentCode}</td>
                    <td style={{ color: '#5a626e' }}>{l.componentName}</td>
                    <td style={{ color: '#8a929c' }}>{l.unit}</td>
                    <td style={{ textAlign: 'right' }}>{num(l.quantity)}</td>
                    <td style={{ textAlign: 'right' }}>{num(l.stockQty)}</td>
                    <td style={{ textAlign: 'right', color: l.buildable === r.buildable ? '#a5561b' : '#8a929c', fontWeight: l.buildable === r.buildable ? 700 : 400 }}>
                      {l.buildable === null ? '—' : num(l.buildable)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>
                  환산가능수량 합계 ({rows.length}품목)
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>
                  {num(totalBuildable)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockRow, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STOCK_PICKS, ymd } from '../../components/EcPeriodPicks'

/**
 * 재고 > 창고별재고현황 (이카운트 E040711)
 *
 * 재고현황 그룹의 두 번째 화면인데 우리에게 없었다. 재고현황(E040701)이 품목×창고를
 * 한 줄씩 늘어놓는 것과 달리, 이 화면은 <b>창고를 축으로</b> 본다 —
 * 원본 [구분]이 <b>창고별(종)</b>과 <b>창고별(횡)</b> 둘이다.
 *
 *   종 — 품목마다 창고를 아래로 늘어놓는다. 같은 품목이 이어지면 품목 칸을 비운다.
 *   횡 — 창고를 <b>열</b>로 돌린다. "이 품목이 어느 창고에 얼마나 있나"를 한 줄에서 본다.
 *
 * 원본 조건: 기준일자(한 날짜) · 창고 · 품목 · 기타 7종.
 * 기타 중 '결재방표시'는 우리에게 개념이 없고, '수량관리제외품목포함'도 품목에 그 구분이 없다.
 * '창고별안전재고수량포함'은 우리 안전재고가 <b>품목 단위</b>라서(창고별이 아니다) 뜻이 다르므로
 * 라벨을 '안전재고표시'로 적고 품목 안전재고를 보여 준다.
 *
 * 기준일자는 재고현황과 같은 이유로 조회에 쓰지 않는다 — 백엔드 `/stock` 이 현재고만 준다.
 */
export default function WarehouseStockPage() {
  const [stock, setStock] = useState<StockRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = ymd(new Date())
  const [mode, setMode] = useState<'종' | '횡'>('종')
  const [cond, setCond] = useState({
    date: today,
    warehouseId: '',
    item: '',
    zeroItem: false,
    zeroWarehouse: false,
    inactiveItem: false,
    inactiveWarehouse: false,
    safety: false,
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<StockRow[]>('/stock'),
      api.get<Item[]>('/items'),
      api.get<Warehouse[]>('/warehouses'),
    ])
      .then(([s, i, w]) => { setStock(s.data); setItems(i.data); setWarehouses(w.data) })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  /** 재고가 0 인 칸도 보이려면 품목·창고 목록으로 격자를 만들어야 한다 — /stock 은 있는 것만 준다. */
  const qtyOf = useMemo(() => {
    const m = new Map<string, number>()
    stock.forEach((r) => m.set(`${r.itemId}:${r.warehouseId}`, r.quantity))
    return m
  }, [stock])

  const shownWarehouses = useMemo(() => {
    const used = new Set(stock.filter((r) => r.quantity !== 0).map((r) => r.warehouseId))
    return warehouses
      .filter((w) => cond.inactiveWarehouse || w.active)
      .filter((w) => !cond.warehouseId || String(w.id) === cond.warehouseId)
      .filter((w) => cond.zeroWarehouse || used.has(w.id))
  }, [warehouses, stock, cond.inactiveWarehouse, cond.warehouseId, cond.zeroWarehouse])

  const shownItems = useMemo(() => {
    const wid = new Set(shownWarehouses.map((w) => w.id))
    const total = (id: number) => stock
      .filter((r) => r.itemId === id && wid.has(r.warehouseId))
      .reduce((n, r) => n + r.quantity, 0)
    return items
      .filter((it) => cond.inactiveItem || it.active)
      .filter((it) => !cond.item || it.name.includes(cond.item) || it.code.includes(cond.item))
      .filter((it) => cond.zeroItem || total(it.id) !== 0)
  }, [items, stock, shownWarehouses, cond.inactiveItem, cond.item, cond.zeroItem])

  const itemTotal = (id: number) => shownWarehouses.reduce((n, w) => n + (qtyOf.get(`${id}:${w.id}`) ?? 0), 0)
  const warehouseTotal = (id: number) => shownItems.reduce((n, it) => n + (qtyOf.get(`${it.id}:${id}`) ?? 0), 0)
  const grandTotal = shownItems.reduce((n, it) => n + itemTotal(it.id), 0)

  /** 종 보기 한 줄 = 품목 × 창고. '재고수량0창고포함'을 끄면 0 인 칸은 줄을 만들지 않는다. */
  const flatRows = useMemo(() => shownItems.flatMap((it) => shownWarehouses
    .map((w) => ({ item: it, warehouse: w, qty: qtyOf.get(`${it.id}:${w.id}`) ?? 0 }))
    .filter((r) => cond.zeroWarehouse || r.qty !== 0)),
    [shownItems, shownWarehouses, qtyOf, cond.zeroWarehouse])

  const num = (n: number) => n.toLocaleString()
  const reset = () => {
    setMode('종')
    setCond({ date: today, warehouseId: '', item: '', zeroItem: false, zeroWarehouse: false, inactiveItem: false, inactiveWarehouse: false, safety: false })
  }

  const flatCols = 6 + (cond.safety ? 1 : 0)
  const wideCols = 5 + shownWarehouses.length + 1 + (cond.safety ? 1 : 0)

  return (
    <EcListShell
      title="창고별재고현황"
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
        <EcCond label="구분">
          <div className="ec-pills">
            {(['종', '횡'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                창고별({m})
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <select className="ec-input" value={cond.warehouseId}
                  onChange={(e) => setC({ warehouseId: e.target.value })} style={{ width: 220 }}>
            <option value="">전체</option>
            {warehouses.map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목" pick>
          <input className="ec-input" placeholder="품목명·코드 일부" value={cond.item}
                 onChange={(e) => setC({ item: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="기타">
          {([
            ['zeroItem', '재고수량0품목포함'],
            ['zeroWarehouse', '재고수량0창고포함'],
            ['inactiveItem', '사용중단품목포함'],
            ['inactiveWarehouse', '사용중단창고포함'],
            ['safety', '안전재고표시'],
          ] as const).map(([k, label]) => (
            <label key={k} style={{ fontSize: 12, marginRight: 12 }}>
              <input type="checkbox" checked={cond[k]}
                     onChange={(e) => setC({ [k]: e.target.checked })} /> {label}
            </label>
          ))}
        </EcCond>
      </EcStatusPanel>

      {cond.date !== today && (
        <p style={{ marginBottom: 8, background: '#fff7e6', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          지금 보는 것은 <b>현재고</b>입니다. 과거 시점 재고 계산은 아직 없어서 기준일자를 바꿔도
          숫자가 달라지지 않습니다.
        </p>
      )}

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        품목 <b style={{ color: '#3c4553' }}>{num(shownItems.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        창고 <b style={{ color: '#3c4553' }}>{num(shownWarehouses.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        재고수량 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(grandTotal)}</b>
      </div>

      <div className="overflow-x-auto">
        {mode === '종' ? (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: '4%' }}></th>
                <th style={{ width: '14%' }}>품목코드</th>
                <th>품목명</th>
                <th style={{ width: '16%' }}>규격정보</th>
                <th style={{ width: '18%' }}>창고</th>
                <th style={{ width: '12%', textAlign: 'right' }}>재고수량</th>
                {cond.safety && <th style={{ width: '11%', textAlign: 'right' }}>안전재고</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={flatCols} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : flatRows.length === 0 ? (
                <tr><td colSpan={flatCols} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : flatRows.map((r, i) => {
                // 같은 품목이 이어지면 품목 칸을 비워 창고 축이 눈에 들어오게 한다.
                const first = i === 0 || flatRows[i - 1].item.id !== r.item.id
                return (
                  <tr key={`${r.item.id}-${r.warehouse.id}`}>
                    <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace' }}>{first ? r.item.code : ''}</td>
                    <td>{first ? r.item.name : ''}</td>
                    <td>{first ? (r.item.spec ?? '') : ''}</td>
                    <td>{r.warehouse.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {num(r.qty)} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.item.unit}</span>
                    </td>
                    {cond.safety && <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(r.item.safetyStock)}</td>}
                  </tr>
                )
              })}
            </tbody>
            {flatRows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(grandTotal)}</td>
                  {cond.safety && <td style={{ background: '#f5f7fa' }}></td>}
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th style={{ width: 120 }}>품목코드</th>
                <th style={{ minWidth: 160 }}>품목명</th>
                <th style={{ width: 120 }}>규격정보</th>
                <th style={{ width: 60 }}>단위</th>
                {shownWarehouses.map((w) => (
                  <th key={w.id} style={{ textAlign: 'right', width: 110 }}>{w.name}</th>
                ))}
                <th style={{ textAlign: 'right', width: 110 }}>합계</th>
                {cond.safety && <th style={{ textAlign: 'right', width: 100 }}>안전재고</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={wideCols} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : shownItems.length === 0 ? (
                <tr><td colSpan={wideCols} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shownItems.map((it, i) => (
                <tr key={it.id}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{it.code}</td>
                  <td>{it.name}</td>
                  <td>{it.spec ?? ''}</td>
                  <td>{it.unit}</td>
                  {shownWarehouses.map((w) => {
                    const q = qtyOf.get(`${it.id}:${w.id}`) ?? 0
                    return <td key={w.id} style={{ textAlign: 'right', color: q === 0 ? '#c2c8d0' : undefined }}>{num(q)}</td>
                  })}
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ec-blue)' }}>{num(itemTotal(it.id))}</td>
                  {cond.safety && <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(it.safetyStock)}</td>}
                </tr>
              ))}
            </tbody>
            {shownItems.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  {shownWarehouses.map((w) => (
                    <td key={w.id} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(warehouseTotal(w.id))}</td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{num(grandTotal)}</td>
                  {cond.safety && <td style={{ background: '#f5f7fa' }}></td>}
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </EcListShell>
  )
}

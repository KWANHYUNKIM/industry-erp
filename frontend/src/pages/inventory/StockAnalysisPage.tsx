import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockRow, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { stockCostMap } from '../../utils/stockValue'
import CodePickerField from '../../components/CodePickerField'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STOCK_PICKS, ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 재고 > 재고잔량분석표 (이카운트 E040727)
 * 현재고를 품목별로 집계해 안전재고 대비 과부족·상태와 재고금액(수량×단가)을 분석한다.
 * 데이터는 GET /api/stock(현재고) + GET /api/items(단가) 를 조인(백엔드 무변경).
 * 재고금액은 <b>취득원가</b>로 평가한다 — 실제 입고단가가 있으면 그것, 없으면 품목 구매단가.
 * 예전에는 판매단가(Item.unitPrice)로 평가해서 아직 팔지도 않은 이익이 재고에 얹혔다
 * (개발 자료에서 1억 8,457만 vs 3,490만, 5배 차이). 기준이 없으면 0 이 아니라 평가에서 뺀다.
 *
 * 원본 조건: 기준일자(한 날짜) · 품목 · 기타(재고수량0포함 / 수량관리제외품목포함 /
 * 사용중단품목포함 / 품목별안전재고설정미만표시).
 * 재고현황과 같이 <b>기준일자가 한 날짜</b>다 — 재고는 시점을 보는 것이라서 빠른선택도 금일·전일뿐이다.
 *
 * 원본에는 창고 조건이 없다(품목별로 전 창고를 합쳐 보는 분석표라서). 우리는 창고 조건이
 * 이미 있고 실제로 동작하므로 남긴다 — 원본에 없다고 되는 기능을 빼지는 않는다.
 *
 * <p>[기준일자]는 이제 <b>실제로 조회에 쓴다</b>. 예전에는 칸만 두고 무시했다 —
 * 날짜를 바꿔도 늘 현재고가 나왔다. 조건이 있으면 사람은 그 값이 반영된 줄 안다.
 * 서버가 현재고에서 그 뒤의 입출고를 빼서 그 시점 재고를 낸다(GET /stock?asOf=).
 */

interface AnalysisRow {
  itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
  quantity: number; safetyStock: number; unitPrice: number; value: number
  whCount: number
}

const won = (n: number) => n.toLocaleString('ko-KR')

export default function StockAnalysisPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [warehouseId, setWarehouseId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [shortageOnly, setShortageOnly] = useState(false)
  /** 원본 '재고수량0포함' — 기본은 0 인 품목을 뺀다(분석표에 0 만 잔뜩 뜨면 못 읽는다). */
  const [includeZero, setIncludeZero] = useState(false)
  /** 재고 평가에 쓸 구매전표. 마지막 입고단가를 여기서 뽑는다. */
  const [buys, setBuys] = useState<{ purchaseDate: string; lines: { itemId: number; unitPrice: number }[] }[]>([])
  const [date, setDate] = useState(ymd(new Date()))
  const today = ymd(new Date())

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, i, w, b] = await Promise.all([
        api.get<StockRow[]>('/stock', { params: { asOf: date } }),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ purchaseDate: string; lines: { itemId: number; unitPrice: number }[] }[]>('/purchases'),
      ])
      setStocks(s.data); setItems(i.data); setWarehouses(w.data); setBuys(b.data)
    } catch (err) { setError(extractErrorMessage(err)); setStocks([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const priceById = useMemo(() => stockCostMap(items, buys), [items, buys])

  const rows = useMemo(() => {
    const wid = warehouseId ? Number(warehouseId) : null
    const m = new Map<number, AnalysisRow>()
    for (const s of stocks) {
      if (wid != null && s.warehouseId !== wid) continue
      let a = m.get(s.itemId)
      if (!a) {
        a = { itemId: s.itemId, itemCode: s.itemCode, itemName: s.itemName, spec: s.spec, unit: s.unit,
          quantity: 0, safetyStock: s.safetyStock, unitPrice: priceById.get(s.itemId) ?? 0, value: 0, whCount: 0 }
        m.set(s.itemId, a)
      }
      a.quantity += s.quantity
      if (s.quantity > 0) a.whCount += 1
    }
    const kw = keyword.trim()
    const out = [...m.values()]
    for (const a of out) a.value = a.quantity * a.unitPrice
    return out
      .filter((a) => !kw || a.itemName.includes(kw) || a.itemCode.includes(kw))
      .filter((a) => !shortageOnly || a.quantity < a.safetyStock)
      // 원본 '재고수량0포함' — 끄면 0 인 품목을 뺀다. 0 만 잔뜩 뜨면 분석표를 읽을 수 없다.
      .filter((a) => includeZero || a.quantity !== 0)
      .sort((a, b) => b.value - a.value)
  }, [stocks, priceById, warehouseId, keyword, shortageOnly, includeZero])

  const reset = () => {
    setWarehouseId(''); setKeyword(''); setShortageOnly(false); setIncludeZero(false); setDate(today)
  }

  const totals = useMemo(() => ({
    count: rows.length,
    value: rows.reduce((s, r) => s + r.value, 0),
    shortage: rows.filter((r) => r.quantity < r.safetyStock).length,
  }), [rows])


  return (
    <EcListShell
      title="재고잔량분석표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
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
        from={date} to={date}
        onPeriod={(r) => setDate(r.from)}
        picks={STOCK_PICKS}
      >
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={keyword} onChange={(v) => setKeyword(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={220} value={warehouseId} onChange={setWarehouseId}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={includeZero}
                   onChange={(e) => setIncludeZero(e.target.checked)} /> 재고수량0포함
          </label>
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={shortageOnly}
                   onChange={(e) => setShortageOnly(e.target.checked)} /> 품목별안전재고설정미만표시
          </label>
        </EcCond>
      </EcStatusPanel>

      {date !== today && (
        <p style={{ marginBottom: 8, background: '#fff7e6', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          지금 보는 것은 <b>기준일자 시점의 재고</b>입니다. 현재고에서 그 뒤의 입출고를 빼서 냅니다.
          숫자가 달라지지 않습니다.
        </p>
      )}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        품목 <b style={{ color: '#3c4553', fontSize: 14 }}>{won(totals.count)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        미달 <b style={{ color: '#c60a2e', fontSize: 14 }}>{won(totals.shortage)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        재고금액 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.value)}</b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th>규격</th>
            <th style={{ textAlign: 'center', width: 46 }}>단위</th>
            <th style={{ textAlign: 'right' }}>현재고</th>
            <th style={{ textAlign: 'right' }}>안전재고</th>
            <th style={{ textAlign: 'right' }}>과부족</th>
            <th style={{ textAlign: 'center', width: 60 }}>상태</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>재고금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {stocks.length === 0 ? '재고 자료가 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : rows.map((r, i) => {
            const diff = r.quantity - r.safetyStock
            const short = r.quantity < r.safetyStock
            return (
              <tr key={r.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td style={{ color: '#8a929c' }}>{r.spec ?? ''}</td>
                <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(r.quantity)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.safetyStock)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: diff < 0 ? '#c60a2e' : '#1c7c3c' }}>{diff > 0 ? '+' : ''}{won(diff)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: short ? '#fdecec' : '#eaf6ec', color: short ? '#c60a2e' : '#1c7c3c', padding: '1px 7px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{short ? '부족' : '적정'}</span>
                </td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.unitPrice)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.value)}</td>
              </tr>
            )
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={10} style={{ textAlign: 'right' }}>재고금액 합계</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.value)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

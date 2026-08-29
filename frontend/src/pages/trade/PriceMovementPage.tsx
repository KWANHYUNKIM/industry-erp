import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 영업관리 > 단가변동표 (이카운트 E040819)
 * 판매·매입 전표 라인의 실제 단가를 품목별로 모아 기간 내 최저·최고·평균·최근 단가와 변동폭을 본다.
 * 별도 단가이력 테이블 없이 거래 단가(라인 unitPrice)로 도출한다(백엔드 무변경).
 * 데이터는 GET /api/sales, /purchases, /items(표준단가).
 */

type Mode = 'SALE' | 'PURCHASE'

/**
 * 원본 단가변동표(ESP021R)의 <b>[단가기준]</b> — 체크박스 넷이고 처음엔
 * <b>단순평균단가만</b> 켜져 있다(사본 실측: 전체(0) · 단순평균단가(1, checked) ·
 * 최고단가(2) · 최저단가(3)).
 *
 * <p>[단가구분](판매·매입)과 <b>다른 것</b>이다. 그쪽은 어느 전표의 단가를 볼지이고,
 * 이쪽은 그 단가를 <b>무엇으로 요약해 보여 줄지</b>다. 우리는 셋을 늘 한꺼번에 냈다 —
 * 평균만 보고 싶어도 최고·최저가 늘 따라와 표가 넓었다.
 */
const PRICE_BASES = ['단순평균단가', '최고단가', '최저단가'] as const

interface PriceRow {
  itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
  standard: number; count: number
  min: number; max: number; avg: number; latest: number; latestDate: string
}

const won = (n: number) => n.toLocaleString('ko-KR')

export default function PriceMovementPage() {
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 원본 단가변동표의 조건 차례는 <b>구분 · 기준일자 · 창고 · 거래처 · 품목 …</b> 다(사본 실측).
   * 창고·거래처가 없었다 — 같은 품목도 창고나 거래처가 다르면 단가가 다른데,
   * 그것들을 <b>한 줄로 뭉쳐</b> 평균을 내고 있었다.
   */
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  const pickers = useCondPickers(['warehouses', 'partners'])

  const [mode, setMode] = useState<Mode>('SALE')
  /* 원본 기본값 그대로 — 단순평균단가만 켠다. */
  const [bases, setBases] = useState<string[]>(['단순평균단가'])
  const withAvg = bases.includes('단순평균단가')
  const withMax = bases.includes('최고단가')
  const withMin = bases.includes('최저단가')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 단가변동표 조건 차례: 구분 · 기준일자 · 창고 · 거래처 · <b>품목</b> · <b>단가구분</b> · 단가기준.
   * [품목]은 검색상자로 갈음하고 있었는데, 그 상자는 규격까지 훑는 <b>글자 찾기</b>라
   * 품목 하나를 골라 그 단가 흐름만 보는 일은 못 했다. 코드도움으로 따로 세운다.
   */
  const [itemCond, setItemCond] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, b, i] = await Promise.all([
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<Item[]>('/items'),
      ])
      setSales(s.data); setPurchases(b.data); setItems(i.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const priceById = useMemo(() => new Map(items.map((it) => [it.id, it.unitPrice])), [items])

  const rows = useMemo<PriceRow[]>(() => {
    const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to)
    // (date, itemId, spec, unit, name, price) 포인트 수집
    interface Pt { itemId: number; itemName: string; spec: string | null; unit: string; date: string; price: number }
    const pts: Pt[] = []
    const keep = (wh: string, pt: string) =>
      (!warehouse || wh.includes(warehouse)) && (!partner || pt.includes(partner))
    const docs = mode === 'SALE'
      ? sales.filter((d) => keep(d.warehouseName, d.partnerName)).map((d) => ({ date: d.saleDate, lines: d.lines }))
      : purchases.filter((d) => keep(d.warehouseName, d.partnerName)).map((d) => ({ date: d.purchaseDate, lines: d.lines }))
    for (const d of docs) {
      if (!inPeriod(d.date)) continue
      for (const l of d.lines) {
        if (l.unitPrice == null) continue
        pts.push({ itemId: l.itemId, itemName: l.itemName, spec: l.spec, unit: l.unit, date: d.date, price: l.unitPrice })
      }
    }

    const map = new Map<number, Pt[]>()
    for (const p of pts) { const a = map.get(p.itemId) ?? []; a.push(p); map.set(p.itemId, a) }

    const kw = keyword.trim()
    const pickedItem = itemCond.trim()
    const out: PriceRow[] = []
    for (const [itemId, list] of map) {
      // 최근 = 날짜(동일 날짜면 뒤에 온 것) 기준
      const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      const prices = sorted.map((p) => p.price)
      const sum = prices.reduce((a, x) => a + x, 0)
      const last = sorted[sorted.length - 1]
      const item = items.find((it) => it.id === itemId)
      out.push({
        itemId,
        itemCode: item?.code ?? '',
        itemName: last.itemName,
        spec: last.spec,
        unit: last.unit,
        standard: priceById.get(itemId) ?? 0,
        count: list.length,
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(sum / prices.length),
        latest: last.price,
        latestDate: last.date,
      })
    }
    return out
      .filter((r) => !kw || r.itemName.includes(kw) || r.itemCode.includes(kw))
      .filter((r) => !pickedItem || r.itemName === pickedItem)
      .sort((a, b) => (b.max - b.min) - (a.max - a.min))
  }, [sales, purchases, items, priceById, mode, from, to, keyword, warehouse, partner, itemCond])

  const label: React.CSSProperties = { width: 44, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }

  /*
   * [단가기준]으로 요약 칸이 켜지고 꺼지니 <b>정적으로는 못 세는 표</b>가 됐다.
   * 렌더된 표를 직접 재는 검사를 단다.
   */
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '단가변동표', [withMin, withMax, withAvg, rows.length])

  return (
    <EcListShell
      title="단가변동표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">품목별 실거래 단가의 최저·최고·평균·최근과 변동폭. 단가는 판매/매입 전표 라인에서 집계(변동폭 큰 순).</p>

      <div style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>기간</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        </div>
        {/* 원본 조건 차례: 구분 · 기준일자 · <b>창고 · 거래처</b> · 품목 … */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>창고</span>
          <CodePickerField label="창고" hideLabel width={160} emptyLabel="전체"
                           value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>거래처</span>
          <CodePickerField label="거래처" hideLabel width={160} emptyLabel="전체"
                           value={partner} onChange={setPartner} items={pickers.partners} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>품목</span>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={items.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </div>
        {/*
          원본 단가변동표 조건의 <b>[단가구분]</b>. 이 알약이 그 일을 하는데 <b>이름표가 없어</b>
          무엇을 고르는 줄인지 화면만 보고는 알 수 없었다.
        */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>단가구분</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['SALE', 'PURCHASE'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="no-ec" style={{
              padding: '5px 14px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: mode === m ? 'var(--ec-blue)' : '#fff', color: mode === m ? '#fff' : '#3a4453', fontWeight: mode === m ? 700 : 400,
            }}>{m === 'SALE' ? '판매단가' : '매입단가'}</button>
          ))}
        </div>
        {/*
          원본 [단가기준] — 어느 요약을 낼지. [단가구분](판매·매입)과 다른 줄이다.
          전부 끄면 <b>요약 칸이 하나도 없는 표</b>가 되므로 [전체]로 한 번에 켠다.
        */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>단가기준</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={bases.length === PRICE_BASES.length}
                   onChange={(e) => setBases(e.target.checked ? [...PRICE_BASES] : [])} />전체
          </label>
          {PRICE_BASES.map((k) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
              <input type="checkbox" checked={bases.includes(k)}
                     onChange={(e) => setBases((v) => (e.target.checked ? [...v, k] : v.filter((x) => x !== k)))} />
              {k}
            </label>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>품목수 <b style={{ color: '#3c4553', fontSize: 14 }}>{rows.length}</b></div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div ref={tableRef}>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th>규격</th>
            <th style={{ textAlign: 'center', width: 46 }}>단위</th>
            <th style={{ textAlign: 'right' }}>표준단가</th>
            <th style={{ textAlign: 'right' }}>거래수</th>
            {/* 원본 [단가기준]으로 켜고 끈다 — 처음엔 평균만 보인다. */}
            {withMin && <th style={{ textAlign: 'right' }}>최저</th>}
            {withMax && <th style={{ textAlign: 'right' }}>최고</th>}
            {withAvg && <th style={{ textAlign: 'right' }}>평균</th>}
            <th style={{ textAlign: 'right' }}>최근</th>
            <th style={{ textAlign: 'right' }}>변동폭</th>
            <th style={{ textAlign: 'right' }}>최근vs표준</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10 + (withMin ? 1 : 0) + (withMax ? 1 : 0) + (withAvg ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={10 + (withMin ? 1 : 0) + (withMax ? 1 : 0) + (withAvg ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {(mode === 'SALE' ? sales.length : purchases.length) === 0 ? '거래 내역이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : rows.map((r, i) => {
            const range = r.max - r.min
            const vsStd = r.standard > 0 ? ((r.latest - r.standard) / r.standard) * 100 : 0
            return (
              <tr key={r.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td style={{ color: '#8a929c' }}>{r.spec ?? ''}</td>
                <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.standard)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{r.count}</td>
                {withMin && <td style={{ textAlign: 'right' }}>{won(r.min)}</td>}
                {withMax && <td style={{ textAlign: 'right' }}>{won(r.max)}</td>}
                {withAvg && <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.avg)}</td>}
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.latest)}</td>
                <td style={{ textAlign: 'right', fontWeight: range ? 600 : 400, color: range ? '#c07a00' : '#c5cbd3' }}>{range ? won(range) : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: vsStd > 0 ? '#1c7c3c' : vsStd < 0 ? '#c60a2e' : '#8a929c' }}>
                  {r.standard > 0 ? `${vsStd > 0 ? '+' : ''}${vsStd.toFixed(1)}%` : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </EcListShell>
  )
}

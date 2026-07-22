import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'

/**
 * 영업관리 > 단가변동표 (이카운트 E040819)
 * 판매·매입 전표 라인의 실제 단가를 품목별로 모아 기간 내 최저·최고·평균·최근 단가와 변동폭을 본다.
 * 별도 단가이력 테이블 없이 거래 단가(라인 unitPrice)로 도출한다(백엔드 무변경).
 * 데이터는 GET /api/sales, /purchases, /items(표준단가).
 */

type Mode = 'SALE' | 'PURCHASE'

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

  const [mode, setMode] = useState<Mode>('SALE')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [keyword, setKeyword] = useState('')

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
    const docs = mode === 'SALE'
      ? sales.map((d) => ({ date: d.saleDate, lines: d.lines }))
      : purchases.map((d) => ({ date: d.purchaseDate, lines: d.lines }))
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
      .sort((a, b) => (b.max - b.min) - (a.max - a.min))
  }, [sales, purchases, items, priceById, mode, from, to, keyword])

  const label: React.CSSProperties = { width: 44, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }

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
        <div style={{ display: 'flex', gap: 2 }}>
          {(['SALE', 'PURCHASE'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="no-ec" style={{
              padding: '5px 14px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: mode === m ? 'var(--ec-blue)' : '#fff', color: mode === m ? '#fff' : '#3a4453', fontWeight: mode === m ? 700 : 400,
            }}>{m === 'SALE' ? '판매단가' : '매입단가'}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>기간</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>품목 <b style={{ color: '#3c4553', fontSize: 14 }}>{rows.length}</b></div>
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
            <th style={{ textAlign: 'right' }}>표준단가</th>
            <th style={{ textAlign: 'right' }}>거래수</th>
            <th style={{ textAlign: 'right' }}>최저</th>
            <th style={{ textAlign: 'right' }}>최고</th>
            <th style={{ textAlign: 'right' }}>평균</th>
            <th style={{ textAlign: 'right' }}>최근</th>
            <th style={{ textAlign: 'right' }}>변동폭</th>
            <th style={{ textAlign: 'right' }}>최근vs표준</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
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
                <td style={{ color: '#8a929c' }}>{r.spec ?? '-'}</td>
                <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.standard)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{r.count}</td>
                <td style={{ textAlign: 'right' }}>{won(r.min)}</td>
                <td style={{ textAlign: 'right' }}>{won(r.max)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.avg)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.latest)}</td>
                <td style={{ textAlign: 'right', fontWeight: range ? 600 : 400, color: range ? '#c07a00' : '#c5cbd3' }}>{range ? won(range) : '-'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: vsStd > 0 ? '#1c7c3c' : vsStd < 0 ? '#c60a2e' : '#8a929c' }}>
                  {r.standard > 0 ? `${vsStd > 0 ? '+' : ''}${vsStd.toFixed(1)}%` : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}

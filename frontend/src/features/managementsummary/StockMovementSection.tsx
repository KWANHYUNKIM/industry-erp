import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { Item } from '../../types/api'
import { qty2 } from '../../utils/qtyText'
import { SUB_ROW, SectionHead, useCount, type SectionProps } from './shared'

interface Tx { itemId: number; quantityChange: number; transactionDate: string; note: string | null; type: string }
type Col = 'buy' | 'prodIn' | 'moveIn' | 'etc' | 'sale' | 'prodOut' | 'moveOut' | 'bad' | 'adj' | 'self'
const IN: Col[] = ['buy', 'prodIn', 'moveIn', 'etc']
const OUT: Col[] = ['sale', 'prodOut', 'moveOut', 'bad', 'adj', 'self']

/** 수불 줄 하나가 재고변동표 어느 칸에 드는가 — 적요 머리말('판매 ' · '구매 ' · '생산…' · '창고이동 ')과 유형으로 가른다. */
function colOf(t: Tx): [Col, number] {
  const n = t.note ?? '', q = t.quantityChange
  if (t.type === 'ADJUST') return [n.startsWith('자가') ? 'self' : 'adj', -q]
  if (n.startsWith('창고이동')) return q >= 0 ? ['moveIn', q] : ['moveOut', -q]
  if (n.startsWith('판매')) return ['sale', -q]
  if (n.startsWith('구매')) return ['buy', q]
  if (n.startsWith('생산')) return q >= 0 ? ['prodIn', q] : ['prodOut', -q]
  return q >= 0 ? ['etc', q] : ['adj', -q]
}

const num = (n: number) => (n === 0 ? '' : qty2(n))
type Sum = Record<Col, number> & { open: number }
const zero = (): Sum => ({ open: 0, buy: 0, prodIn: 0, moveIn: 0, etc: 0, sale: 0, prodOut: 0, moveOut: 0, bad: 0, adj: 0, self: 0 })
const inSub = (s: Sum) => IN.reduce((n, c) => n + s[c], 0)
const outSub = (s: Sum) => OUT.reduce((n, c) => n + s[c], 0)

/**
 * 경영요약보고서 › <b>재고변동표</b> — 2026-10-22 loginaa 실측. 머리 두 줄: '품목코드 · 품목명 · 규격 · 단위 · 전일재고 · 증가(구매 · 생산 · 창고이동 · 기타 · 소계) ·
 * 감소(판매 · 생산 · 창고이동 · 불량 · 조정 · 자가 · 소계) · 잔량'. 품목 코드 차례, 전일재고 · 움직임이 있는 품목만, 끝 '합계'(앞 네 칸 묶음).
 * 조정은 감소 칸에 부호를 뒤집어 든다. 수량은 소수 둘째 자리, 0 은 빈칸.
 */
export default function StockMovementSection({ from, to, startNo, onCount }: SectionProps) {
  const [data, setData] = useState<{ tx: Tx[]; items: Item[] } | null>(null)
  useEffect(() => {
    Promise.all([
      api.get<{ rows: Tx[] }>('/stock/ledger', { params: { from: '1900-01-01', to, all: 'true' } }),
      api.get<Item[]>('/items'),
    ]).then(([l, i]) => setData({ tx: l.data.rows, items: i.data })).catch(() => setData({ tx: [], items: [] }))
  }, [to])
  const rows = useMemo(() => {
    if (!data) return []
    const m = new Map<number, Sum>()
    for (const t of data.tx) {
      if (t.transactionDate.slice(0, 10) > to) continue
      const s = m.get(t.itemId) ?? zero()
      m.set(t.itemId, s)
      if (t.transactionDate.slice(0, 10) < from) { s.open += t.quantityChange; continue }
      const [c, q] = colOf(t)
      s[c] += q
    }
    const byId = new Map(data.items.map((i) => [i.id, i]))
    return [...m.entries()].filter(([, s]) => s.open || inSub(s) || outSub(s))
      .map(([id, s]) => ({ id, item: byId.get(id), s }))
      .filter((r) => r.item)
      .sort((a, b) => (a.item!.code < b.item!.code ? -1 : a.item!.code > b.item!.code ? 1 : 0))
  }, [data, from, to])
  useCount(onCount, rows.length > 0 ? 1 : 0, data !== null)
  if (rows.length === 0) return null
  const tot = rows.reduce((t, r) => { const n = zero(); (Object.keys(n) as (keyof Sum)[]).forEach((k) => { n[k] = t[k] + r.s[k] }); return n }, zero())
  const cells = (s: Sum) => [
    num(s.open), ...IN.map((c) => num(s[c])), num(inSub(s)), ...OUT.map((c) => num(s[c])), num(outSub(s)), num(s.open + inSub(s) - outSub(s)),
  ]
  return (
    <>
      <SectionHead no={startNo} title="재고변동표" from={from} to={to} />
      <table className="w-full text-left">
        <thead>
          <tr>
            <th rowSpan={2}>품목코드</th><th rowSpan={2}>품목명</th><th rowSpan={2}>규격</th><th rowSpan={2}>단위</th>
            <th rowSpan={2} className="text-right">전일재고</th><th colSpan={5} className="text-center">증가</th><th colSpan={7} className="text-center">감소</th>
            <th rowSpan={2} className="text-right">잔량</th>
          </tr>
          <tr>
            {['구매', '생산', '창고이동', '기타', '소계', '판매', '생산', '창고이동', '불량', '조정', '자가', '소계'].map((h, i) => <th key={i} className="text-right">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.item!.code}</td><td>{r.item!.name}</td><td>{r.item!.spec ?? ''}</td><td>{r.item!.unit}</td>
              {cells(r.s).map((c, i) => <td key={i} className="text-right">{c}</td>)}
            </tr>
          ))}
          <tr className={SUB_ROW}>
            <td colSpan={4} className="text-center">합계</td>
            {cells(tot).map((c, i) => <td key={i} className="text-right">{c}</td>)}
          </tr>
        </tbody>
      </table>
    </>
  )
}

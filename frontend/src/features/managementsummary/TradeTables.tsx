import { Fragment, useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { Item, PurchaseDoc, SalesDoc, TradeLine } from '../../types/api'
import { qty2 } from '../../utils/qtyText'
import { dateNo, shortDateNo } from '../../utils/dateNo'
import { SUB_ROW, SectionHead, monthEnd, monthStart, plain, slash, useCount, type SectionProps } from './shared'
import { fmtAmountBlank } from '../../utils/format'

const itemText = (l: TradeLine) => (l.spec ? `${l.itemName} [${l.spec}]` : l.itemName)

/**
 * 경영요약보고서 › <b>판매</b>(재고 I 영업관리) — 2026-10-22 loginaa 실측.
 * 머리 '일자 | 품명 및 규격 | 수량 | 단가 | 공급가액 | 부가세 | 합 계 | 판매처이름', 줄마다 한 품목(일자는 'MM/DD-No'),
 * 달마다 'MM 계'(앞 두 칸 묶음, 단가도 더한다) · 끝 '합계'. 일자 순서.
 */
export function SalesSection({ from, to, startNo, onCount }: SectionProps) {
  const [docs, setDocs] = useState<SalesDoc[] | null>(null)
  useEffect(() => {
    api.get<SalesDoc[]>('/sales', { params: { from, to } }).then((r) => setDocs(r.data)).catch(() => setDocs([]))
  }, [from, to])
  const rows = useMemo(() => [...(docs ?? [])]
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.docNo.localeCompare(b.docNo))
    .flatMap((d) => d.lines.map((l) => ({ key: `${d.id}-${l.lineId}`, month: d.saleDate.slice(5, 7), no: shortDateNo(d.saleDate, d.docNo).slice(3), partner: d.partnerName, l }))), [docs])
  useCount(onCount, rows.length > 0 ? 1 : 0, docs !== null)
  if (rows.length === 0) return null
  const sum = (xs: typeof rows) => xs.reduce((s, r) => ({
    q: s.q + r.l.quantity, p: s.p + r.l.unitPrice, s: s.s + r.l.supplyAmount, v: s.v + r.l.vatAmount,
  }), { q: 0, p: 0, s: 0, v: 0 })
  const months = [...new Set(rows.map((r) => r.month))]
  const totalRow = (label: string, t: ReturnType<typeof sum>) => (
    <tr className={SUB_ROW}>
      <td colSpan={2} className="text-center">{label}</td>
      <td className="text-right">{plain(t.q)}</td>
      <td className="text-right">{plain(t.p)}</td>
      <td className="text-right">{plain(t.s)}</td>
      <td className="text-right">{plain(t.v)}</td>
      <td className="text-right">{plain(t.s + t.v)}</td>
      <td></td>
    </tr>
  )
  return (
    <>
      <SectionHead no={startNo} title="판매현황" from={from} to={to} />
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자</th><th>품명 및 규격</th><th className="text-right">수량</th><th className="text-right">단가</th>
            <th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합 계</th><th>판매처이름</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <Fragment key={m}>
              {rows.filter((r) => r.month === m).map((r) => (
                <tr key={r.key}>
                  <td className="text-center">{r.no}</td>
                  <td>{itemText(r.l)}</td>
                  <td className="text-right">{plain(r.l.quantity)}</td>
                  <td className="text-right">{plain(r.l.unitPrice)}</td>
                  <td className="text-right">{plain(r.l.supplyAmount)}</td>
                  <td className="text-right">{plain(r.l.vatAmount)}</td>
                  <td className="text-right">{plain(r.l.supplyAmount + r.l.vatAmount)}</td>
                  <td>{r.partner}</td>
                </tr>
              ))}
              {totalRow(`${m} 계`, sum(rows.filter((r) => r.month === m)))}
            </Fragment>
          ))}
          {totalRow('합계', sum(rows))}
        </tbody>
      </table>
    </>
  )
}

/**
 * 경영요약보고서 › <b>구매</b> — '일자-No. | 거래처명 | 적요 | 품목명[규격] | 수량 | 단가 | 금액'. 늦은 일자부터(일자 · 번호 내림차순), 계 · 합계 줄 없음.
 */
export function PurchaseSection({ from, to, startNo, onCount }: SectionProps) {
  const [docs, setDocs] = useState<PurchaseDoc[] | null>(null)
  useEffect(() => {
    api.get<PurchaseDoc[]>('/purchases', { params: { from, to } }).then((r) => setDocs(r.data)).catch(() => setDocs([]))
  }, [from, to])
  const rows = useMemo(() => [...(docs ?? [])]
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.docNo.localeCompare(a.docNo))
    .flatMap((d) => d.lines.map((l) => ({ key: `${d.id}-${l.lineId}`, no: dateNo(d.purchaseDate, d.docNo), partner: d.partnerName, remark: d.remark ?? '', l }))), [docs])
  useCount(onCount, rows.length > 0 ? 1 : 0, docs !== null)
  if (rows.length === 0) return null
  return (
    <>
      <SectionHead no={startNo} title="구매현황" from={from} to={to} />
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th><th>거래처명</th><th>적요</th><th>품목명[규격]</th>
            <th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="text-center">{r.no}</td>
              <td>{r.partner}</td>
              <td>{r.remark}</td>
              <td>{itemText(r.l)}</td>
              <td className="text-right">{plain(r.l.quantity)}</td>
              <td className="text-right">{plain(r.l.unitPrice)}</td>
              <td className="text-right">{plain(r.l.supplyAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

interface ProductionRow {
  id: number; prodNo: string; productId: number; productionDate: string; warehouseName: string; fromWarehouseName: string | null
  productName: string; producedQty: number; note: string | null
}

/**
 * 경영요약보고서 › <b>생산입고</b> — '일자-No. | 출고창고명 | 입고창고명 | 품목명[규격명] | 수량 | 생산금액 | 적요', 달마다 'YYYY/MM 계'(앞 네 칸 묶음) · 끝 '합계'.
 * 수량은 소수 둘째 자리까지, 생산금액은 비운다(원본도 빈칸).
 */
export function ProductionSection({ from, to, startNo, onCount }: SectionProps) {
  const [list, setList] = useState<ProductionRow[] | null>(null)
  useEffect(() => {
    api.get<ProductionRow[]>('/productions', { params: { from, to } }).then((r) => setList(r.data)).catch(() => setList([]))
  }, [from, to])
  const rows = useMemo(() => [...(list ?? [])].sort((a, b) => a.productionDate.localeCompare(b.productionDate) || a.prodNo.localeCompare(b.prodNo) || a.id - b.id), [list])
  useCount(onCount, rows.length > 0 ? 1 : 0, list !== null)
  if (rows.length === 0) return null
  const months = [...new Set(rows.map((r) => r.productionDate.slice(0, 7)))]
  const subRow = (label: string, q: number) => (
    <tr className={SUB_ROW}>
      <td colSpan={4} className="text-center">{label}</td>
      <td className="text-right">{qty2(q)}</td><td></td><td></td>
    </tr>
  )
  return (
    <>
      <SectionHead no={startNo} title="생산입고현황" from={from} to={to} />
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th><th>출고창고명</th><th>입고창고명</th><th>품목명[규격명]</th>
            <th className="text-right">수량</th><th className="text-right">생산금액</th><th>적요</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const ms = rows.filter((r) => r.productionDate.slice(0, 7) === m)
            return (
              <Fragment key={m}>
                {ms.map((r) => (
                  <tr key={r.id}>
                    <td className="text-center">{dateNo(r.productionDate, r.prodNo)}</td>
                    <td>{r.fromWarehouseName ?? ''}</td>
                    <td>{r.warehouseName}</td>
                    <td>{r.productName}</td>
                    <td className="text-right">{qty2(r.producedQty)}</td>
                    <td></td>
                    <td>{r.note ?? ''}</td>
                  </tr>
                ))}
                {subRow(`${slash(m)} 계`, ms.reduce((s, r) => s + r.producedQty, 0))}
              </Fragment>
            )
          })}
          {subRow('합계', rows.reduce((s, r) => s + r.producedQty, 0))}
        </tbody>
      </table>
    </>
  )
}

/**
 * 경영요약보고서 › <b>현황누계표</b> — '(빈) | 구분 | 기간 | 수량 | 공급가액 | 부가세 | 합계(금액)'. 판매 · 구매 · 생산입고 각각 [기간 누계] · [월 누계] · [년 누계].
 * 월 · 년 누계는 조회 끝날이 든 달 · 해 전체(원본: 조회일을 바꿔도 월 953 · 년 3,204 가 그대로). 생산입고는 금액 칸이 빈칸.
 */
export function CumulativeSection({ from, to, startNo, onCount }: SectionProps) {
  const yearFrom = `${to.slice(0, 4)}-01-01`
  const yearTo = `${to.slice(0, 4)}-12-31`
  const winFrom = [from, yearFrom].sort()[0]
  const winTo = [to, yearTo].sort().reverse()[0]
  const [data, setData] = useState<{ s: SalesDoc[]; p: PurchaseDoc[]; m: ProductionRow[]; i: Item[] } | null>(null)
  useEffect(() => {
    const params = { from: winFrom, to: winTo }
    Promise.all([
      api.get<SalesDoc[]>('/sales', { params }), api.get<PurchaseDoc[]>('/purchases', { params }), api.get<ProductionRow[]>('/productions', { params }), api.get<Item[]>('/items'),
    ]).then(([s, p, m, i]) => setData({ s: s.data, p: p.data, m: m.data, i: i.data })).catch(() => setData({ s: [], p: [], m: [], i: [] }))
  }, [winFrom, winTo])
  const spans = [
    { name: '기간 누계', a: from, b: to, label: `${slash(from)} ~${slash(to)}` },
    { name: '월 누계', a: monthStart(to), b: monthEnd(to), label: slash(to.slice(0, 7)) },
    { name: '년 누계', a: yearFrom, b: yearTo, label: `${to.slice(0, 4)}/` },
  ]
  const kinds = useMemo(() => {
    if (!data) return []
    type D = { date: string; q: number; s: number; v: number; t: number }
    const price = new Map(data.i.map((i) => [i.id, i.purchasePrice ?? 0]))
    const sets: [string, boolean, D[]][] = [
      ['판매현황', true, data.s.map((d) => ({ date: d.saleDate, q: d.lines.reduce((n, l) => n + l.quantity, 0), s: d.supplyAmount, v: d.vatAmount, t: d.supplyAmount + d.vatAmount }))],
      ['구매현황', true, data.p.map((d) => ({ date: d.purchaseDate, q: d.lines.reduce((n, l) => n + l.quantity, 0), s: d.supplyAmount, v: d.vatAmount, t: d.supplyAmount + d.vatAmount }))],
      ['생산입고현황', false, data.m.map((p) => ({ date: p.productionDate, q: p.producedQty, s: 0, v: 0, t: p.producedQty * (price.get(p.productId) ?? 0) }))],
    ]
    return sets.map(([name, amount, docs]) => ({
      name, amount,
      lines: spans.map((sp) => docs.filter((d) => d.date >= sp.a && d.date <= sp.b).reduce((t, d) => ({ q: t.q + d.q, s: t.s + d.s, v: t.v + d.v, t: t.t + d.t }), { q: 0, s: 0, v: 0, t: 0 })),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, from, to])
  const any = kinds.some((k) => k.lines.some((l) => l.q || l.s || l.v || l.t))
  useCount(onCount, any ? 1 : 0, data !== null)
  if (!any) return null
  return (
    <>
      <SectionHead no={startNo} title="현황누계표" from={from} to={to} />
      <table className="w-full text-left">
        <thead>
          <tr><th></th><th>구분</th><th>기간</th><th className="text-right">수량</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계(금액)</th></tr>
        </thead>
        <tbody>
          {kinds.map((k) => k.lines.map((l, i) => (
            <tr key={`${k.name}${i}`}>
              {i === 0 && <td rowSpan={3}>{k.name}</td>}
              <td>{spans[i].name}</td>
              <td>{spans[i].label}</td>
              <td className="text-right">{qty2(l.q)}</td>
              <td className="text-right">{k.amount ? fmtAmountBlank(l.s) : ''}</td>
              <td className="text-right">{k.amount ? fmtAmountBlank(l.v) : ''}</td>
              <td className="text-right">{k.amount ? fmtAmountBlank(l.s + l.v) : fmtAmountBlank(l.t)}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </>
  )
}

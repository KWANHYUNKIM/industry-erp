import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import type { SalesDoc, PurchaseDoc, Quotation, StockTransfer, Production, PurchaseOrder, WorkOrder, StockAdjustment } from '../../../types/api'
import EcListShell from '../../../components/EcListShell'
import { INQUIRY_PICKS } from '../../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../../components/EcReportFrame'
import { periodOf } from '../../../components/EcPeriodPicks'
import { dateNo, shortDateNo } from '../../../utils/dateNo'
import { useCondPickers } from '../../../utils/useCondPickers'
import { useItemMgmt } from '../../../utils/itemMgmtItems'
import { useRequired } from '../../../utils/useRequired'
import { fmtNumberOf } from '../../../utils/format'

/**
 * 재고 > 출력물 > 일보 (이카운트 E040708) — 2026-10-22 원본 실측.
 *
 * 원본 일보는 <b>[종류]를 골라야</b> 그려진다(필수 — 비워 두고 [검색(F8)] 하면 칸이 빨개지고 격자가 안 나온다.
 * 전엔 이 칸을 몰라 "격자가 안 그려진다"고만 적었다). 고른 종류마다 '1. 판매현황' 처럼 번호 붙은 표가
 * 세로로 이어지고, 표마다 열이 다르다:
 * <ul>
 *   <li>견적서 · 구매: 일자-No. · 거래처명 · 적요 · 품목명[규격] · 수량 · 단가 · 금액 (최근 일자 먼저)</li>
 *   <li>판매: 일자 · 품명 및 규격 · 수량 · 단가 · 공급가액 · 부가세 · 합 계 · 판매처이름, 'N 계'(월) · 합계 줄 — 계 줄의 단가 칸은 단가를 그대로 더한다</li>
 *   <li>수금 · 지급: 일자-No. · 거래처명 · 금액 · 적요 + 합계</li>
 *   <li>생산입고: 일자-No. · 출고창고명 · 입고창고명 · 품목명[규격명] · 수량(소수 둘째) · 생산금액 · 적요</li>
 *   <li>창고이동: 일자-No. · 출고창고명 · 입고창고명 · 품목명[규격] · 수량 · 금액(수량*입고단가) · 적요 + 날마다 'YYYY/MM/DD 계'</li>
 * </ul>
 * 2026-10-22 나머지 종류 실측: 주문서(견적서와 같은 7열, 최근 먼저) · 출하지시서 · 출하(일자-No. · 품목명[규격] · 수량(소수 둘) · 창고명 · 거래처명 ·
 * 연락처 · 적요, 'YYYY/MM 계'{colspan 2} · 합계) · 발주서(머리 두 줄 — 전표 줄 일자-No. · 거래처 · 담당자 · 납기일자 · 참조{3} · 진행상태, 품목 줄 품목명[규격]{3} ·
 * 수량 · 단가 · 공급가액 · 부가세 · 품목별납기일자, 월 계 없음) · 작업지시서(일자-No. · 품목명[규격명] · 수량 · 거래처명 · 담당자명 · 납기일자, 월 계 · 합계) ·
 * 자가사용(일자-No. · 거래처명 · 품목명[규격] · 창고명 · 수량 · 금액(수량*입고단가) · 적요, 월 계{colspan 4} · 합계) · 재고조정(일자-No. 'YY/MM/DD-n' · 품목코드 ·
 * 품목명[규격] · 창고명 · 장부수량 · 실사수량 · 조정수량 · 금액 · 적요, 없으면 '등록된 데이터가 없습니다.').
 * 조건: [부서]를 고르면 머리 '회사명 : …' 뒤에 부서명이 붙고(원본 영업팀 — 줄 수는 안 줄었다), [내.외자구분] 외자면 주문서가 빈다(출하지시서 · 출하 · 작업지시 줄은 그대로),
 * [결재방표시]는 머리 오른쪽에 결재란. [기본]/[전체] 탭은 조건이 같다. 기준일자 기본은 금월(~오늘).
 */
type Row = { cells: string[]; bold?: boolean; span?: number }
const qty2 = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortNo = (date: string, no: string) => { const seq = no.split('-').pop() ?? ''; return `${date.slice(5).replace('-', '/')}-${Number(seq) || seq}` }
const itemLabel = (name: string, spec: string | null | undefined) => (spec ? `${name} [${spec}]` : name)

/** 원본 [종류] 창 '검색' 열 차례(재고 I). 우리 자료가 있는 것만. */
const KINDS = ['견적서', '주문서', '판매', '출하지시서', '출하', '수금', '발주서', '구매', '지급', '작업지시서', '생산입고', '창고이동', '자가사용', '재고조정'] as const
type Kind = typeof KINDS[number]
const KIND_GROUP: Record<Kind, string> = {
  견적서: '영업관리', 주문서: '영업관리', 판매: '영업관리', 출하지시서: '영업관리', 출하: '영업관리', 수금: '영업관리',
  발주서: '구매관리', 구매: '구매관리', 지급: '구매관리', 작업지시서: '생산/외주', 생산입고: '생산/외주',
  창고이동: '기타이동', 자가사용: '기타이동', 재고조정: '기타이동',
}
interface OrderRow { id: number; orderNo: string; partnerId: number; partnerName: string; orderDate: string; warehouseId?: number | null; projectId?: number | null
  remark: string | null; lines: { itemId: number; itemName: string; spec?: string | null; quantity: number; unitPrice: number; supplyAmount: number }[] }
interface ShipRow { id: number; shipNo: string; partnerId: number; partnerName: string; shipDate: string; status: string; warehouseId: number | null; warehouseName: string | null
  projectId: number | null; contact: string | null; remark: string | null
  lines: { itemId: number; itemName: string; spec: string | null; quantity: number; remark?: string | null }[] }
const ymd = (d: string) => d.replace(/-/g, '/')

interface SettleRow { id: number; docNo: string; type: 'RECEIPT' | 'PAYMENT'; partnerId: number; partnerName: string; settleDate: string; amount: number; projectId: number | null; note: string | null }
interface Data {
  quotes: Quotation[]; sales: SalesDoc[]; settles: SettleRow[]; purchases: PurchaseDoc[]; productions: Production[]; transfers: StockTransfer[]
  orders: OrderRow[]; ships: ShipRow[]; pos: PurchaseOrder[]; works: WorkOrder[]; adjusts: StockAdjustment[]
}

export default function DailyReportPage() {
  const init = periodOf('금월(~오늘)') ?? { from: '', to: '' }
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [kinds, setKinds] = useState<string[]>([])
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [project, setProject] = useState('')
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')
  const [dept, setDept] = useState('')
  const [depts, setDepts] = useState<{ id: number; code: string; name: string }[]>([])
  const [emps, setEmps] = useState<Record<number, string>>({})
  const [foreign, setForeign] = useState<'' | 'N' | 'F'>('')
  const [signBox, setSignBox] = useState(false)
  useEffect(() => {
    api.get<{ id: number; code: string; name: string }[]>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
    api.get<{ id: number; name: string }[]>('/sales-reps').then((r) => setEmps(Object.fromEntries(r.data.map((e) => [e.id, e.name])))).catch(() => setEmps({}))
  }, [])
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects'])
  const req = useRequired()
  const [data, setData] = useState<Data | null>(null)
  const [shown, setShown] = useState<{ kinds: Kind[]; from: string; to: string; dept: string; foreign: '' | 'N' | 'F' } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    /* 원본: [종류] 필수 — 비면 칸이 빨개지고 조회하지 않는다. */
    if (!req.check({ kinds: kinds.length > 0 })) return
    const picked = KINDS.filter((k) => kinds.includes(k))
    setLoading(true); setError('')
    try {
      const params = { from, to }
      const get = <T,>(on: boolean, url: string, p: Record<string, unknown> = params) =>
        on ? api.get<T[]>(url, { params: p }).then((r) => r.data) : Promise.resolve([] as T[])
      const [quotes, sales, settles, purchases, productions, transfers, orders, ships, pos, works, adjusts] = await Promise.all([
        get<Quotation>(picked.includes('견적서'), '/quotations'),
        get<SalesDoc>(picked.includes('판매'), '/sales'),
        get<SettleRow>(picked.includes('수금') || picked.includes('지급'), '/settlements'),
        get<PurchaseDoc>(picked.includes('구매'), '/purchases'),
        get<Production>(picked.includes('생산입고'), '/productions'),
        get<StockTransfer>(picked.includes('창고이동'), '/stock-transfers'),
        get<OrderRow>(picked.includes('주문서'), '/sales-orders'),
        get<ShipRow>(picked.includes('출하지시서') || picked.includes('출하'), '/shipments'),
        get<PurchaseOrder>(picked.includes('발주서'), '/purchase-orders'),
        get<WorkOrder>(picked.includes('작업지시서'), '/work-orders', {}),
        picked.includes('자가사용') || picked.includes('재고조정')
          ? api.get<{ rows: StockAdjustment[] }>('/stock-adjustments', { params: { from, to, all: true } }).then((r) => r.data.rows)
          : Promise.resolve([] as StockAdjustment[]),
      ])
      setData({ quotes, sales, settles, purchases, productions, transfers, orders, ships, pos, works, adjusts })
      setShown({ kinds: picked, from, to, dept: depts.find((x) => String(x.id) === dept)?.name ?? '', foreign })
    } catch (err) { setError(extractErrorMessage(err)); setData(null); setShown(null) }
    finally { setLoading(false) }
  }

  const reset = () => {
    const p = periodOf('금월(~오늘)') ?? { from: '', to: '' }
    setFrom(p.from); setTo(p.to); setKinds([]); setWarehouse(''); setPartner(''); setItem(''); setProject(''); setMgmtCond(''); setDept(''); setForeign(''); setSignBox(false)
    setData(null); setShown(null); req.reset()
  }

  const inP = (d: string) => (!shown || ((!shown.from || d >= shown.from) && (!shown.to || d <= shown.to)))
  /** 조건(창고 · 거래처 · 품목 · 프로젝트 · 관리항목) — 종류마다 그 전표에 있는 것만 건다. */
  const ok = (o: { partnerId?: number | null; warehouseIds?: (number | null | undefined)[]; projectId?: number | null; itemIds?: number[] }) =>
    (!partner || String(o.partnerId) === partner)
    && (!warehouse || (o.warehouseIds ?? []).some((w) => String(w) === warehouse))
    && (!project || String(o.projectId) === project)
    && (!item || (o.itemIds ?? []).some((i) => String(i) === item))
    && mgmt.hits(o.itemIds ?? [], mgmtCond)

  const sections = useMemo(() => {
    if (!data || !shown) return []
    const d = data
    const byDesc = <T,>(date: (x: T) => string, no: (x: T) => string) => (a: T, b: T) =>
      date(a) !== date(b) ? (date(a) < date(b) ? 1 : -1) : (Number(no(b).split('-').pop()) || 0) - (Number(no(a).split('-').pop()) || 0)
    const byAsc = <T,>(date: (x: T) => string, no: (x: T) => string) => (a: T, b: T) =>
      date(a) !== date(b) ? (date(a) < date(b) ? -1 : 1) : (Number(no(a).split('-').pop()) || 0) - (Number(no(b).split('-').pop()) || 0)
    return shown.kinds.map((k) => {
      if (k === '견적서') {
        const rows = d.quotes.filter((q) => inP(q.quoteDate) && ok({ partnerId: q.partnerId, warehouseIds: [q.warehouseId], projectId: q.projectId, itemIds: q.lines.map((l) => l.itemId) }))
          .sort(byDesc((q) => q.quoteDate, (q) => q.quoteNo))
        return { kind: k, node: <LineTable head={['일자-No.', '거래처명', '적요', '품목명[규격]', '수량', '단가', '금액']} right={[4, 5, 6]}
          rows={rows.flatMap((q) => q.lines.map((l) => [dateNo(q.quoteDate, q.quoteNo), q.partnerName, q.remark ?? '', itemLabel(l.itemName, l.spec), fmtNumberOf(l.quantity), fmtNumberOf(l.unitPrice), fmtNumberOf(l.supplyAmount)]))} /> }
      }
      if (k === '판매') {
        const docs = d.sales.filter((s) => inP(s.saleDate) && ok({ partnerId: s.partnerId, warehouseIds: [s.warehouseId], projectId: s.projectId, itemIds: s.lines.map((l) => l.itemId) }))
          .sort(byAsc((s) => s.saleDate, (s) => s.docNo))
        const months = [...new Set(docs.map((s) => s.saleDate.slice(0, 7)))]
        const sum = (rows: SalesDoc[]) => rows.flatMap((s) => s.lines).reduce((a, l) => ({
          q: a.q + Number(l.quantity), u: a.u + Number(l.unitPrice), s: a.s + Number(l.supplyAmount), v: a.v + Number(l.vatAmount) }), { q: 0, u: 0, s: 0, v: 0 })
        const fmt = (a: { q: number; u: number; s: number; v: number }) => [fmtNumberOf(a.q), fmtNumberOf(a.u), fmtNumberOf(a.s), fmtNumberOf(a.v), fmtNumberOf(a.s + a.v), '']
        const body: { cells: string[]; bold?: boolean }[] = []
        months.forEach((m) => {
          const ms = docs.filter((s) => s.saleDate.startsWith(m))
          ms.forEach((s) => s.lines.forEach((l) => body.push({ cells: [shortNo(s.saleDate, s.docNo), itemLabel(l.itemName, l.spec), fmtNumberOf(l.quantity), fmtNumberOf(l.unitPrice), fmtNumberOf(l.supplyAmount), fmtNumberOf(l.vatAmount), fmtNumberOf(Number(l.supplyAmount) + Number(l.vatAmount)), s.partnerName] })))
          body.push({ cells: [`${Number(m.slice(5))} 계`, '', ...fmt(sum(ms))], bold: true })
        })
        if (docs.length) body.push({ cells: ['합계', '', ...fmt(sum(docs))], bold: true })
        return { kind: k, node: <LineTable head={['일자', '품명 및 규격', '수량', '단가', '공급가액', '부가세', '합 계', '판매처이름']} right={[2, 3, 4, 5, 6]} rows={body} /> }
      }
      if (k === '수금' || k === '지급') {
        const type = k === '수금' ? 'RECEIPT' : 'PAYMENT'
        const rows = d.settles.filter((s) => s.type === type && inP(s.settleDate) && ok({ partnerId: s.partnerId, projectId: s.projectId }))
          .sort(byAsc((s) => s.settleDate, (s) => s.docNo))
        const body = rows.map((s) => ({ cells: [dateNo(s.settleDate, s.docNo), s.partnerName, fmtNumberOf(s.amount), s.note ?? ''] as string[] }))
        if (rows.length) body.push({ cells: ['합계', '', fmtNumberOf(rows.reduce((a, s) => a + Number(s.amount), 0)), ''] })
        return { kind: k, node: <LineTable head={['일자-No.', '거래처명', '금액', '적요']} right={[2]} rows={body} /> }
      }
      if (k === '구매') {
        const rows = d.purchases.filter((p) => inP(p.purchaseDate) && ok({ partnerId: p.partnerId, warehouseIds: [p.warehouseId], projectId: p.projectId, itemIds: p.lines.map((l) => l.itemId) }))
          .sort(byDesc((p) => p.purchaseDate, (p) => p.docNo))
        return { kind: k, node: <LineTable head={['일자-No.', '거래처명', '적요', '품목명[규격]', '수량', '단가', '금액']} right={[4, 5, 6]}
          rows={rows.flatMap((p) => p.lines.map((l) => [dateNo(p.purchaseDate, p.docNo), p.partnerName, p.remark ?? '', itemLabel(l.itemName, l.spec), fmtNumberOf(l.quantity), fmtNumberOf(l.unitPrice), fmtNumberOf(l.supplyAmount)]))} /> }
      }
      if (k === '주문서') {
        const rows = shown.foreign === 'F' ? [] : d.orders.filter((o) => inP(o.orderDate) && ok({ partnerId: o.partnerId, warehouseIds: [o.warehouseId], projectId: o.projectId, itemIds: o.lines.map((l) => l.itemId) }))
          .sort(byDesc((o) => o.orderDate, (o) => o.orderNo))
        return { kind: k, node: <LineTable head={['일자-No.', '거래처명', '적요', '품목명[규격]', '수량', '단가', '금액']} right={[4, 5, 6]}
          rows={rows.flatMap((o) => o.lines.map((l) => [dateNo(o.orderDate, o.orderNo), o.partnerName, o.remark ?? '', itemLabel(l.itemName, l.spec), fmtNumberOf(l.quantity), fmtNumberOf(l.unitPrice), fmtNumberOf(l.supplyAmount)]))} /> }
      }
      if (k === '출하지시서' || k === '출하') {
        const st = k === '출하' ? 'SHIPPED' : 'READY'
        const rows = d.ships.filter((x) => x.status === st && inP(x.shipDate) && ok({ partnerId: x.partnerId, warehouseIds: [x.warehouseId], projectId: x.projectId, itemIds: x.lines.map((l) => l.itemId) }))
          .sort(byAsc((x) => x.shipDate, (x) => x.shipNo))
        const body: Row[] = []
        const sum = (xs: ShipRow[]) => xs.flatMap((x) => x.lines).reduce((a, l) => a + Number(l.quantity), 0)
        const months = [...new Set(rows.map((x) => x.shipDate.slice(0, 7)))]
        months.forEach((m) => {
          const ms = rows.filter((x) => x.shipDate.startsWith(m))
          ms.forEach((x) => x.lines.forEach((l) => body.push({ cells: [dateNo(x.shipDate, x.shipNo), itemLabel(l.itemName, l.spec), qty2(l.quantity), x.warehouseName ?? '', x.partnerName, x.contact ?? '', l.remark ?? x.remark ?? ''] })))
          body.push({ cells: [`${ymd(m)} 계`, qty2(sum(ms)), '', '', '', ''], bold: true, span: 2 })
        })
        if (rows.length) body.push({ cells: ['합계', qty2(sum(rows)), '', '', '', ''], bold: true, span: 2 })
        return { kind: k, node: <LineTable head={['일자-No.', k === '출하' ? '품목명[규격명]' : '품목명[규격]', '수량', '창고명', '거래처명', '연락처', '적요']} right={[2]} rows={body} /> }
      }
      if (k === '발주서') {
        const rows = d.pos.filter((o) => (o.status === 'ORDERED' || o.status === 'RECEIVED') && inP(o.orderDate)
          && ok({ partnerId: o.partnerId, warehouseIds: [o.warehouseId], projectId: o.projectId, itemIds: o.lines.map((l) => l.itemId) }))
          .sort(byAsc((o) => o.orderDate, (o) => o.orderNo))
        const blank = (n: number) => (Number(n) ? fmtNumberOf(n) : '')
        return { kind: k, node: (
          <table className="w-full text-left">
            <thead>
              <tr><th>일자-No.</th><th>거래처</th><th>담당자</th><th>납기일자</th><th colSpan={3}>참조</th><th>진행상태</th></tr>
              <tr><th colSpan={3}>품목명[규격]</th><th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th>품목별납기일자</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={8} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr> : rows.flatMap((o) => [
                <tr key={`h${o.id}`}>
                  <td>{dateNo(o.orderDate, o.orderNo)}</td><td>{o.partnerName}</td><td>{o.employeeName ?? ''}</td><td>{o.dueDate ? ymd(o.dueDate) : ''}</td>
                  <td colSpan={3}></td><td>{o.status === 'ORDERED' ? '진행중' : o.statusName}</td>
                </tr>,
                ...o.lines.map((l) => (
                  <tr key={`l${o.id}-${l.id}`}>
                    <td colSpan={3}>{itemLabel(l.itemName, l.spec)}</td><td className="text-right">{qty2(l.quantity)}</td><td className="text-right">{fmtNumberOf(l.unitPrice)}</td>
                    <td className="text-right">{blank(l.supplyAmount)}</td><td className="text-right">{blank(l.vatAmount)}</td><td>{o.dueDate ? ymd(o.dueDate) : ''}</td>
                  </tr>)),
              ])}
            </tbody>
          </table>) }
      }
      if (k === '작업지시서') {
        const rows = d.works.filter((w) => inP(w.orderDate) && ok({ partnerId: w.partnerId, warehouseIds: [w.warehouseId], projectId: w.projectId, itemIds: [w.productId] }))
          .sort(byAsc((w) => w.orderDate, (w) => w.orderNo))
        const body: Row[] = []
        const months = [...new Set(rows.map((w) => w.orderDate.slice(0, 7)))]
        months.forEach((m) => {
          const ms = rows.filter((w) => w.orderDate.startsWith(m))
          ms.forEach((w) => body.push({ cells: [dateNo(w.orderDate, w.orderNo), itemLabel(w.productName, w.productSpec), qty2(w.plannedQty), w.partnerName ?? '', w.employeeId ? emps[w.employeeId] ?? '' : '', w.dueDate ? ymd(w.dueDate) : ''] }))
          body.push({ cells: [`${ymd(m)} 계`, qty2(ms.reduce((a, w) => a + Number(w.plannedQty), 0)), '', '', ''], bold: true, span: 2 })
        })
        if (rows.length) body.push({ cells: ['합계', qty2(rows.reduce((a, w) => a + Number(w.plannedQty), 0)), '', '', ''], bold: true, span: 2 })
        return { kind: k, node: <LineTable head={['일자-No.', '품목명[규격명]', '수량', '거래처명', '담당자명', '납기일자']} right={[2]} rows={body} /> }
      }
      if (k === '자가사용') {
        const rows = d.adjusts.filter((a) => a.type === 'SELF_USE' && inP(a.adjustDate) && ok({ partnerId: a.partnerId, warehouseIds: [a.warehouseId], projectId: a.projectId, itemIds: [a.itemId] }))
          .sort(byAsc((a) => a.adjustDate, (a) => a.adjustNo))
        const body: Row[] = []
        const qtyOf = (a: StockAdjustment) => Math.abs(Number(a.quantityChange))
        const months = [...new Set(rows.map((a) => a.adjustDate.slice(0, 7)))]
        months.forEach((m) => {
          const ms = rows.filter((a) => a.adjustDate.startsWith(m))
          ms.forEach((a) => body.push({ cells: [dateNo(a.adjustDate, a.adjustNo), a.partnerId ? pickers.partners.find((p) => p.id === a.partnerId)?.name ?? '' : '', itemLabel(a.itemName, a.spec), a.warehouseName, qty2(qtyOf(a)), '', a.reason ?? ''] }))
          body.push({ cells: [`${ymd(m)} 계`, qty2(ms.reduce((s2, a) => s2 + qtyOf(a), 0)), '', ''], bold: true, span: 4 })
        })
        if (rows.length) body.push({ cells: ['합계', qty2(rows.reduce((s2, a) => s2 + qtyOf(a), 0)), '', ''], bold: true, span: 4 })
        return { kind: k, node: <LineTable head={['일자-No.', '거래처명', '품목명[규격]', '창고명', '수량', '금액(수량*입고단가)', '적요']} right={[4, 5]} rows={body} /> }
      }
      if (k === '재고조정') {
        const rows = d.adjusts.filter((a) => a.type === 'ADJUST' && inP(a.adjustDate) && ok({ warehouseIds: [a.warehouseId], projectId: a.projectId, itemIds: [a.itemId] }))
          .sort(byAsc((a) => a.adjustDate, (a) => a.adjustNo))
        return { kind: k, node: <LineTable head={['일자-No.', '품목코드', '품목명[규격]', '창고명', '장부수량', '실사수량', '조정수량', '금액(수량*입고단가)', '적요']} right={[4, 5, 6, 7]}
          rows={rows.map((a) => [shortDateNo(a.adjustDate, a.adjustNo), a.itemCode, itemLabel(a.itemName, a.spec), a.warehouseName, fmtNumberOf(a.beforeQty), fmtNumberOf(a.afterQty), fmtNumberOf(a.quantityChange), '', a.reason ?? ''])} /> }
      }
      if (k === '생산입고') {
        const rows = d.productions.filter((p) => inP(p.productionDate) && ok({ warehouseIds: [p.warehouseId, p.fromWarehouseId], projectId: p.projectId, itemIds: [p.productId] }))
          .sort(byAsc((p) => p.productionDate, (p) => p.prodNo))
        return { kind: k, node: <LineTable head={['일자-No.', '출고창고명', '입고창고명', '품목명[규격명]', '수량', '생산금액', '적요']} right={[4, 5]}
          rows={rows.map((p) => [dateNo(p.productionDate, p.prodNo), p.fromWarehouseName ?? '', p.warehouseName, p.productName, qty2(p.producedQty), '', p.note ?? ''])} /> }
      }
      // 창고이동 — 날마다 'YYYY/MM/DD 계'
      const rows = d.transfers.filter((t) => inP(t.transferDate) && ok({ warehouseIds: [t.fromWarehouseId, t.toWarehouseId], projectId: t.projectId, itemIds: [t.itemId] }))
        .sort(byAsc((t) => t.transferDate, (t) => t.transferNo))
      const body: { cells: string[]; bold?: boolean }[] = []
      const days = [...new Set(rows.map((t) => t.transferDate))]
      days.forEach((day) => {
        const ds = rows.filter((t) => t.transferDate === day)
        ds.forEach((t) => body.push({ cells: [dateNo(t.transferDate, t.transferNo), t.fromWarehouseName, t.toWarehouseName, t.itemName, fmtNumberOf(t.quantity), '', t.reason ?? ''] }))
        body.push({ cells: [`${day.replace(/-/g, '/')} 계`, '', '', '', fmtNumberOf(ds.reduce((a, t) => a + Number(t.quantity), 0)), '', ''], bold: true })
      })
      return { kind: k, node: <LineTable head={['일자-No.', '출고창고명', '입고창고명', '품목명[규격]', '수량', '금액(수량*입고단가)', '적요']} right={[4, 5]} rows={body} /> }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, shown, partner, warehouse, item, project, mgmtCond, emps, pickers.partners])

  return (
    <EcListShell
      title="일보"
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
        picks={INQUIRY_PICKS}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouse} onChange={(v) => setWarehouse(v)}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={partner} onChange={(v) => setPartner(v)}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={200} emptyLabel="전체"
                           value={dept} onChange={setDept}
                           items={depts.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="내.외자구분">
          {([['', '전체'], ['N', '내자'], ['F', '외자']] as const).map(([v, t]) => (
            <label key={v} className="text-[12.5px] flex items-center gap-[4px]">
              <input type="radio" name="foreign" checked={foreign === v} onChange={() => setForeign(v)} />{t}
            </label>
          ))}
        </EcCond>
        <EcCond label="종류" pick>
          <CodePickerField label="종류" hideLabel width={300} multiple popupTitle="종류"
                           values={kinds} onChangeMulti={setKinds}
                           invalid={req.on('kinds', kinds.length > 0)}
                           items={KINDS.map((k) => ({ value: k, name: k, sub: KIND_GROUP[k] }))} />
        </EcCond>
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />결재방표시
          </label>
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {loading && <p className="ec-empty">불러오는 중…</p>}

      {!loading && shown && data && (
        <>
          <EcReportHead title="일보" period={reportPeriod(shown.from, shown.to)} sub={shown.dept || undefined} sign={signBox} />
          {sections.map((s, i) => (
            <div key={s.kind} className="mb-[14px]">
              <div className="font-bold mb-[4px]">{i + 1}. {s.kind}현황</div>
              {s.node}
            </div>
          ))}
          <EcReportFoot />
        </>
      )}
    </EcListShell>
  )
}

/** 종류마다 열만 다른 표 — 줄이 없으면 원본 문구. 줄은 글자 배열 또는 { cells, bold }(계 · 합계 줄). */
function LineTable({ head, right, rows }: { head: string[]; right: number[]; rows: (string[] | Row)[] }) {
  const ref = useRef<HTMLTableElement>(null)
  useTableColumnCheck(ref, '일보', [head.join(), rows.length])
  return (
    <table ref={ref} className="w-full text-left">
      <thead><tr>{head.map((h, i) => <th key={h} className={right.includes(i) ? 'text-right' : undefined}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={head.length} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
        ) : rows.map((r, i) => {
          const cells = Array.isArray(r) ? r : r.cells
          const bold = !Array.isArray(r) && r.bold
          return (
            <tr key={i} className={bold ? 'font-bold' : undefined}>
              {cells.map((c, j) => {
                const span = !Array.isArray(r) && r.span && j === 0 ? r.span : 1
                const col = !Array.isArray(r) && r.span ? (j === 0 ? 0 : j + r.span - 1) : j
                return <td key={j} colSpan={span > 1 ? span : undefined} className={right.includes(col) ? 'text-right' : undefined}>{c}</td>
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}


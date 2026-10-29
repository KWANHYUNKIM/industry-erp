import { api } from '../../../api/client'
import type { Item, JournalEntry, PartnerBalance, PurchaseDoc, SalesDoc, StockRow } from '../../../types/api'
import { bankLabel } from '../../../utils/bankLabel'
import { dateNo } from '../../../utils/dateNo'
import { dateText } from '../../../utils/dateText'
import { ymd } from '../../../utils/periods'
import { bookSerials, vatSlipAmounts } from '../../../utils/vatSlip'
import type { FetchArgs, Row } from './types'

/**
 * 위젯 자료 — 우리 같은 화면이 부르는 API 를 그대로 부른다(백엔드 무변경). 화면이 손으로 짜 맞추는 것은 같은 방법으로 짠다.
 * 열 key 는 catalog.tsx 의 열 정의와 맞춘다.
 */

const nameSpec = (name: string, spec?: string | null) => (spec ? `${name}[${spec}]` : name)
const get = <T>(url: string, params?: Record<string, unknown>) => api.get<T>(url, { params }).then((r) => r.data)

/**
 * 품목 마스터 — 전표 줄에는 품목그룹 · 대표품목이 없어 품목에서 붙인다(재고현황 화면 CurrentStockPage 와 같은 출처).
 * 검색조건 [품목그룹1] 은 품목의 품목그룹(itemGroupName)이다 — 전표 줄의 itemCategoryName 은 품목구분(원재료 · 제품 …)이라 다르다.
 * [품목그룹2] · [품목그룹3] 은 우리 품목에 칸이 없어 걸리지 않는다(catalog FILTER 에 없음).
 */
async function itemMaster(): Promise<{ byId: Map<number, Item>; groupOf: (code: string | null | undefined) => string }> {
  const list = await get<Item[]>('/items').catch(() => [] as Item[])
  const byId = new Map(list.map((i) => [i.id, i]))
  const byCode = new Map(list.map((i) => [i.code, i.itemGroupName ?? '']))
  return { byId, groupOf: (code) => (code ? byCode.get(code) ?? '' : '') }
}

/** 행마다 품목그룹1 을 붙인다(itemCode 열로 찾는다) */
async function withItemGroup(rows: Promise<Row[]>): Promise<Row[]> {
  const [r, m] = await Promise.all([rows, itemMaster()])
  return r.map((x) => ({ ...x, itemGroup: m.groupOf(String(x.itemCode ?? '')) }))
}

/** 입고단가 — 품목별 마지막 구매단가(생산불출현황 · 생산입고현황 화면과 같은 출처) */
async function itemPrices(): Promise<Map<number, number>> {
  const list = await get<{ itemId: number; unitPrice: number }[]>('/purchases/item-prices').catch(() => [])
  return new Map(list.map((p) => [p.itemId, Number(p.unitPrice)]))
}

// ── 재고 ──
/**
 * 재고현황 — 원본 위젯은 품목별: 창고를 합친 총재고. 금액 = 품목마다 수량 × 입고단가.
 * [대표품목으로 합산] 처음 값 '*품목관계기준' 이면 형제 품목을 대표품목(parentItemId) 한 줄로 모은다
 * (재고현황 화면 CurrentStockPage 의 rollUp 과 같은 셈 — 안전재고는 형제 것을 더해 합친 수와 견준다). '개별품목기준' 이면 품목마다.
 */
export async function stockRowsPriced({ to, kind, settings }: FetchArgs): Promise<Row[]> {
  const [list, m, price] = await Promise.all([get<StockRow[]>('/stock', { asOf: to }), itemMaster(), itemPrices()])
  const byRep = settings.extra?.rollup !== '개별품목기준'
  interface G { itemCode: string; item: string; qty: number; amount: number; safety: number; warehouse: string; itemGroup: string; headPrice: number | null; seen: Set<number> }
  const by = new Map<number, G>()
  for (const s of list) {
    const id = byRep ? m.byId.get(s.itemId)?.parentItemId ?? s.itemId : s.itemId
    const h = m.byId.get(id)
    const g: G = by.get(id) ?? {
      itemCode: h?.code ?? s.itemCode, item: h ? nameSpec(h.name, h.spec) : nameSpec(s.itemName, s.spec),
      qty: 0, amount: 0, safety: 0, warehouse: s.warehouseName, itemGroup: h?.itemGroupName ?? '', headPrice: price.get(id) ?? null, seen: new Set<number>(),
    }
    g.qty += s.quantity
    g.amount += s.quantity * (price.get(s.itemId) ?? 0)
    if (!g.seen.has(s.itemId)) { g.seen.add(s.itemId); g.safety += Number(s.safetyStock ?? 0) }
    if (g.warehouse !== s.warehouseName) g.warehouse = ''
    by.set(id, g)
  }
  const rows = [...by.values()].map((g) => ({
    itemCode: g.itemCode, item: g.item, qty: g.qty, safety: g.safety, warehouse: g.warehouse, itemGroup: g.itemGroup,
    amount: Math.round(g.amount),
    // 입고단가 — 대표품목의 단가, 대표품목에 단가가 없으면 금액 ÷ 수량
    price: g.headPrice ?? (g.qty ? Math.round(g.amount / g.qty) : 0),
  }))
  return kind === '안전재고미만품목별' ? rows.filter((r) => r.qty < r.safety) : rows
}

export async function salesRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [docs, m] = await Promise.all([get<SalesDoc[]>('/sales', { from, to }), itemMaster()])
  return docs.flatMap((d) => d.lines.map((l) => ({
    date: dateText(d.saleDate), dateNo: dateNo(d.saleDate, d.docNo), item: nameSpec(l.itemName, l.spec), itemCode: l.itemCode,
    qty: l.quantity, price: l.unitPrice, supply: l.supplyAmount, vat: l.vatAmount, total: l.supplyAmount + l.vatAmount,
    partner: d.partnerName, employee: d.employeeName ?? '', warehouse: d.warehouseName, itemGroup: m.groupOf(l.itemCode), remark: l.remark ?? d.remark ?? '',
  })))
}

export async function purchaseRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [docs, m] = await Promise.all([get<PurchaseDoc[]>('/purchases', { from, to }), itemMaster()])
  return docs.flatMap((d) => d.lines.map((l) => ({
    dateNo: dateNo(d.purchaseDate, d.docNo), date: dateText(d.purchaseDate), partner: d.partnerName, remark: l.remark ?? d.remark ?? '',
    item: nameSpec(l.itemName, l.spec), itemCode: l.itemCode, qty: l.quantity, price: l.unitPrice, amount: l.supplyAmount, vat: l.vatAmount,
    employee: d.employeeName ?? '', warehouse: d.warehouseName, itemGroup: m.groupOf(l.itemCode),
  })))
}

/**
 * 진행상태 — 원본 [설정] 의 전체 · 결재중 · 미확인 · 확인 · 확인-진행중(미판매 · 미구매 · 미출하).
 * 우리 주문서 · 발주서 · 출하지시서에는 결재 · 확인 칸이 따로 없어 API 가 주는 상태 이름(statusName)으로 맞춘다:
 *   결재중      — 결재를 거쳐 저장되는 주문 · 발주 · 출하지시가 아직 없다 → 늘 0건
 *   미확인      — 주문서 '접수' · 발주서 '발주요청 · 발주계획 · 단가요청 · 단가확정'(발주확정 전)
 *   확인        — 주문서 '진행중 · 완료' · 발주서 '발주확정 · 입고전환' · 출하지시서 '진행중 · 완료'
 *   확인-진행중 — 확인 가운데 '완료' 가 아닌 것
 * '취소' 는 전체에서만 보인다.
 */
const UNCONFIRMED = new Set(['접수', '발주요청', '발주계획', '단가요청', '단가확정'])
const CONFIRMED = new Set(['진행중', '완료', '발주확정', '입고전환'])
function byProgress(rows: Row[], progress: string | undefined): Row[] {
  const st = (r: Row) => String(r.status ?? '')
  switch (progress) {
    case '결재중': return []
    case '미확인': return rows.filter((r) => UNCONFIRMED.has(st(r)))
    case '확인': return rows.filter((r) => CONFIRMED.has(st(r)))
    case '확인-진행중': return rows.filter((r) => CONFIRMED.has(st(r)) && st(r) !== '완료')
    default: return rows
  }
}

interface UnsoldLine {
  orderLineId: number; orderNo: string; orderDate: string; dueDate: string | null; partnerName: string; itemName: string; spec: string | null; itemCode: string
  orderQty: number; unsoldQty: number; unitPrice: number; unsoldAmount: number; warehouseName: string; remark: string | null; statusName: string
}
interface SoLine { lineId: number; quantity: number; vatAmount: number }
/** 미판매부가세 — 주문서 줄의 부가세를 미판매수량만큼 나눈다(미구매부가세와 같은 셈). 면세 줄은 주문서 부가세가 0 이라 0 */
export async function unsoldRows({ from, to, settings }: FetchArgs): Promise<Row[]> {
  const [list, orders, m] = await Promise.all([
    get<UnsoldLine[]>('/sales-orders/unsold', { from, to }),
    get<{ lines: SoLine[] }[]>('/sales-orders', { from, to }),
    itemMaster(),
  ])
  const line = new Map(orders.flatMap((o) => o.lines).map((l) => [l.lineId, l]))
  const rows = list.map((l) => {
    const o = line.get(l.orderLineId)
    return {
      dateNo: dateNo(l.orderDate, l.orderNo), item: nameSpec(l.itemName, l.spec), itemCode: l.itemCode, qty: l.orderQty, restQty: l.unsoldQty,
      supply: l.unsoldAmount, partner: l.partnerName, remark: l.remark ?? '', due: dateText(l.dueDate),
      vat: o && Number(o.quantity) ? Math.round((Number(o.vatAmount) * Number(l.unsoldQty)) / Number(o.quantity)) : 0,
      warehouse: l.warehouseName, status: l.statusName, itemGroup: m.groupOf(l.itemCode),
    }
  })
  return byProgress(rows, settings.extra?.progress)
}

interface PoLine { id: number; itemName: string; itemCode: string; spec: string | null; quantity: number; vatAmount: number; remark: string | null }
interface Po { orderNo: string; orderDate: string; dueDate: string | null; partnerName: string; warehouseName: string; remark: string | null; statusName: string; lines: PoLine[] }
export async function unpurchasedRows({ from, to, settings }: FetchArgs): Promise<Row[]> {
  const [pos, rest, m] = await Promise.all([
    get<Po[]>('/purchase-orders', { from, to }),
    get<{ orderLineId: number; restQty: number }[]>('/purchase-orders/unpurchased', { from, to }),
    itemMaster(),
  ])
  const left = new Map(rest.map((r) => [r.orderLineId, Number(r.restQty)]))
  return byProgress(pos.flatMap((o) => o.lines.filter((l) => (left.get(l.id) ?? 0) > 0).map((l) => {
    const q = left.get(l.id)!
    return {
      dateNo: dateNo(o.orderDate, o.orderNo), item: nameSpec(l.itemName, l.spec), itemCode: l.itemCode, qty: l.quantity, restQty: q,
      due: dateText(o.dueDate), partner: o.partnerName, remark: l.remark ?? o.remark ?? '',
      vat: l.quantity ? Math.round((l.vatAmount * q) / l.quantity) : 0, warehouse: o.warehouseName, itemGroup: m.groupOf(l.itemCode), status: o.statusName,
    }
  })), settings.extra?.progress)
}

interface UnshippedLine {
  orderNo: string; orderDate: string; itemName: string; itemCode: string; spec: string | null; quantity: number; unshippedQty: number
  warehouseName: string; partnerName: string; remark: string | null; dueDate: string | null; statusName: string
}
export async function unshippedRows({ from, to, settings }: FetchArgs): Promise<Row[]> {
  const list = await withItemGroup(get<UnshippedLine[]>('/shipment-orders/unshipped', { from, to }).then((x) => x.map((l) => ({
    dateNo: dateNo(l.orderDate, l.orderNo), item: nameSpec(l.itemName, l.spec), itemCode: l.itemCode, qty: l.quantity, restQty: l.unshippedQty,
    warehouse: l.warehouseName, partner: l.partnerName, remark: l.remark ?? '', due: dateText(l.dueDate), status: l.statusName,
  }))))
  return byProgress(list, settings.extra?.progress)
}

interface Issue { issueNo: string; issueDate: string; itemId: number; itemCode: string; itemName: string; itemSpec: string | null; warehouseName: string; toWarehouseName: string | null; qty: number; note: string | null }
export async function issueRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [list, price] = await Promise.all([get<Issue[]>('/material-issues', { from, to }), itemPrices()])
  return withItemGroup(Promise.resolve(list.map((m) => ({
    dateNo: dateNo(m.issueDate, m.issueNo), outWh: m.warehouseName, inWh: m.toWarehouseName ?? '', item: nameSpec(m.itemName, m.itemSpec), itemCode: m.itemCode,
    qty: m.qty, amount: Math.round(Number(m.qty) * (price.get(m.itemId) ?? 0)), remark: m.note ?? '', warehouse: m.warehouseName,
  }))))
}

interface Prod { prodNo: string; productionDate: string; productId: number; productCode: string; productName: string; productSpec: string | null; warehouseName: string; fromWarehouseName: string | null; producedQty: number; note: string | null }
export async function receiptRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [list, price] = await Promise.all([get<Prod[]>('/productions', { from, to }), itemPrices()])
  return withItemGroup(Promise.resolve(list.map((p) => ({
    dateNo: dateNo(p.productionDate, p.prodNo), outWh: p.fromWarehouseName ?? '', inWh: p.warehouseName, item: nameSpec(p.productName, p.productSpec), itemCode: p.productCode,
    qty: p.producedQty, amount: Math.round(Number(p.producedQty) * (price.get(p.productId) ?? 0)), remark: p.note ?? '', warehouse: p.warehouseName,
  }))))
}

interface Movement { partnerId: number; code: string; name: string; manager: string | null; opening: number; stockAmount: number; accountingAmount: number; settledAmount: number; otherDiff: number; closing: number }
interface Settlement { type: 'RECEIPT' | 'PAYMENT'; partnerId: number; amount: number; method: string | null; settleDate: string }
interface SubcontractRow { partnerId: number | null; total: number; journalId: number | null }
/**
 * 거래처별채권 · 채무 — 거래처관리대장(LedgerPage, /sales/ledger-receivable · payable)과 같은 출처 GET /ledger/partner-movements:
 * 기초 · 재고매출(매입) · 회계매출(매입) · 수금(지급)합계 · 기타할인등차액 · 잔액을 서버가 이미 나눠 준다(기타할인등차액은 그 화면과 같은 나머지).
 * 그 위에 원본 열을 더 쪼갠다:
 *   수금(지급)현금 — 기간 안 수금(지급) 전표 가운데 결제수단이 '어음' 이 아닌 것(현금 · 계좌이체 · 카드)
 *   수금(지급)어음 — 합계 − 현금. 정산전표의 '어음' + 회계전표가 외상매출금(매입금)을 직접 줄인 것(받을어음 · 지급어음 · 수표 · 상계)
 *   외주비(채무)   — 외주비일괄회계반영으로 회계전표가 된 외주 생산입고(합계금액). 그 전표가 외상매입금을 올려 회계매입에 들어 있던 몫이라
 *                   회계매입에서 뺀다 — 기초 + 재고매입 + 외주비 + 회계매입 − 지급합계 + 기타 = 잔액은 그대로 맞는다.
 *   담당자코드     — 거래처의 담당자(이름)를 사원(담당) 목록에서 찾아 그 코드
 *   미청구액       — 기간 끝 잔액 API 의 미청구금액
 */
export async function arApRows({ from, to }: FetchArgs, side: 'AR' | 'AP'): Promise<Row[]> {
  const ar = side === 'AR'
  const [moves, close, st, reps, sub] = await Promise.all([
    get<Movement[]>('/ledger/partner-movements', { from, to, side }),
    get<PartnerBalance[]>('/ledger/partner-balances', { asOf: to }),
    get<Settlement[]>('/settlements').catch(() => [] as Settlement[]),
    get<{ code: string; name: string }[]>('/sales-reps/all').catch(() => [] as { code: string; name: string }[]),
    ar ? Promise.resolve([] as SubcontractRow[]) : get<SubcontractRow[]>('/accounting-reflection/subcontract', { from, to }).catch(() => [] as SubcontractRow[]),
  ])
  const unbilled = new Map(close.map((b) => [b.partnerId, ar ? b.unbilledReceivable : b.unbilledPayable]))
  const repCode = new Map(reps.map((r) => [r.name, r.code]))
  const cash = new Map<number, number>()
  for (const x of st) {
    if (x.type !== (ar ? 'RECEIPT' : 'PAYMENT') || x.settleDate < from || x.settleDate > to || (x.method ?? '').includes('어음')) continue
    cash.set(x.partnerId, (cash.get(x.partnerId) ?? 0) + Number(x.amount))
  }
  const outsource = new Map<number, number>()
  for (const x of sub) if (x.partnerId != null && x.journalId != null) outsource.set(x.partnerId, (outsource.get(x.partnerId) ?? 0) + Number(x.total))
  return moves.map((m) => {
    const c = cash.get(m.partnerId) ?? 0
    const o = outsource.get(m.partnerId) ?? 0
    return {
      managerCode: m.manager ? repCode.get(m.manager) ?? '' : '', manager: m.manager ?? '', partnerCode: m.code, partner: m.name,
      open: m.opening, inc: m.stockAmount, outsource: o, acc: Number(m.accountingAmount) - o,
      bill: Number(m.settledAmount) - c, cash: c, settle: m.settledAmount, diff: m.otherDiff, balance: m.closing,
      unbilled: unbilled.get(m.partnerId) ?? 0,
    }
  })
}

interface OrderNo { orderNo: string; name: string; orderTypeId: number | null; orderTypeName: string | null; createdDate: string; completed: boolean }
interface OrderType { id: number; steps: { seq: number; stageName: string }[] }
export async function orderStageRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [list, types] = await Promise.all([get<OrderNo[]>('/order-numbers', { from, to }), get<OrderType[]>('/order-types')])
  // 단계 이름을 '|' 로 이어 둔다 — catalog 의 진행단계 칸이 알약으로 편다
  const steps = new Map(types.map((t) => [t.id, [...t.steps].sort((a, b) => a.seq - b.seq).map((s) => s.stageName).join('|')]))
  return list.map((o) => ({
    orderNo: o.orderNo, name: o.name, typeName: o.orderTypeName ?? '', date: dateText(o.createdDate),
    stages: o.orderTypeId != null ? steps.get(o.orderTypeId) ?? '' : '', completed: o.completed ? 1 : 0, detail: '보기',
  }))
}

interface AsRow { asNo: string; receiptDate: string; statusName: string; warehouseName: string | null; charge: string | null; partnerName: string | null; title: string | null; itemCode: string | null; itemName: string | null; itemSpec: string | null; lines?: { quantity: number }[] }
export async function asRows({ from, to }: FetchArgs): Promise<Row[]> {
  const list = await get<AsRow[]>('/as-requests', { from, to })
  return withItemGroup(Promise.resolve(list.map((a) => ({
    dateNo: dateNo(a.receiptDate, a.asNo), status: a.statusName, warehouse: a.warehouseName ?? '', employee: a.charge ?? '', partner: a.partnerName ?? '',
    title: a.title ?? '', itemCode: a.itemCode ?? '', item: a.itemName ? nameSpec(a.itemName, a.itemSpec) : '',
    qty: (a.lines ?? []).reduce((t, l) => t + Number(l.quantity), 0),
  }))))
}

interface Repair { repairNo: string; repairDate: string; title: string | null; partnerName: string | null; repairTypeName: string | null; charge: string | null; content: string | null; saleAmount: number; lines: { itemName: string; itemCode: string }[] }
export async function repairRows({ from, to }: FetchArgs): Promise<Row[]> {
  const list = await get<Repair[]>('/as-repairs', { from, to })
  return list.map((r) => ({
    dateNo: dateNo(r.repairDate, r.repairNo), title: r.title ?? '', partner: r.partnerName ?? '', repairType: r.repairTypeName ?? '', employee: r.charge ?? '',
    item: r.lines.map((l) => l.itemName).join(', '), itemCode: r.lines[0]?.itemCode ?? '', amount: r.saleAmount, content: r.content ?? '',
  }))
}

// ── 회계 ──
const FUND_CODES = ['1019', '1029', '1039']
interface BankTxn { journalEntryId: number | null; bankAccountId: number; deposit: boolean }
interface BankAccount { id: number; name: string | null; bankName: string | null; accountNo: string | null }
/** 자금일보 1 . 자금 현황 — FundDailyPage 와 같은 셈(현금 · 당좌 · 보통예금, 예금은 통장마다). 외화는 회계전표가 들지 않아 원화만 */
export async function fundRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [r, t, a] = await Promise.all([
    get<{ rows: JournalEntry[] }>('/journals', { from: '1900-01-01', to, all: true }),
    get<{ rows: BankTxn[] }>('/bank-cards/transactions', { all: true, from: '1900-01-01', to }).catch(() => ({ rows: [] as BankTxn[] })),
    get<BankAccount[]>('/bank-cards/accounts').catch(() => [] as BankAccount[]),
  ])
  const acc = new Map(a.map((x) => [x.id, x]))
  const bookOf = new Map(t.rows.filter((x) => x.journalEntryId != null && acc.has(x.bankAccountId))
    .map((x) => [`${x.journalEntryId}:${x.deposit ? 'd' : 'c'}`, bankLabel(acc.get(x.bankAccountId)!)]))
  const out = new Map<string, Row & { carry: number; inc: number; dec: number }>()
  for (const e of r.rows) {
    for (const l of e.lines) {
      if (!FUND_CODES.includes(l.accountCode)) continue
      const cash = l.accountCode === '1019'
      const [x, y] = Number(l.debit) ? ['d', 'c'] : ['c', 'd']
      const book = cash ? '' : bookOf.get(`${e.id}:${x}`) ?? bookOf.get(`${e.id}:${y}`) ?? '[ ]'
      const key = `${l.accountCode}|${book}`
      const g = out.get(key) ?? { code: l.accountCode, account: l.accountName, partner: book, carry: 0, inc: 0, dec: 0 }
      const d = Number(l.debit)
      const c = Number(l.credit)
      if (e.entryDate < from) g.carry += d - c
      else { g.inc += d; g.dec += c }
      out.set(key, g)
    }
  }
  return [...out.values()].filter((g) => g.carry || g.inc || g.dec)
    .sort((p, q) => String(p.code).localeCompare(String(q.code)) || String(p.partner).localeCompare(String(q.partner)))
    .map((g) => ({ ...g, end: g.carry + g.inc - g.dec }))
}

interface TaxVoucher { id: number; side: 'SALES' | 'PURCHASE'; entryDate: string; vatType: string; partnerName: string; supplyAmount: number; vatAmount: number; remark: string | null }
/** 매입매출장 — VatBookPage 와 같은 출처(회계전표의 부가세 줄 + 분개 없는 계산서) */
export async function vatBookRows({ from, to, kind }: FetchArgs): Promise<Row[]> {
  const [r, v] = await Promise.all([
    get<{ rows: JournalEntry[] }>('/journals', { from, to, all: true }),
    get<TaxVoucher[]>('/tax-vouchers', { from, to }),
  ])
  type R = Row & { date: string; ord: number; side: '매출' | '매입' }
  const out: R[] = []
  for (const e of r.rows) {
    const vt = (e as JournalEntry & { vatType?: string | null }).vatType?.trim() || '세금계산서'
    for (const side of ['매출', '매입'] as const) {
      const amt = vatSlipAmounts(e.lines, side)
      if (!amt) continue
      out.push({ date: e.entryDate, ord: e.id, side, typeName: vt, partner: e.partnerName ?? '', text: e.description ?? '',
        buySupply: side === '매입' ? amt.supply : 0, sellSupply: side === '매출' ? amt.supply : 0,
        buyVat: side === '매입' ? amt.vat : 0, sellVat: side === '매출' ? amt.vat : 0 })
    }
  }
  for (const x of v) {
    const side = x.side === 'SALES' ? '매출' : '매입'
    out.push({ date: x.entryDate, ord: 1e12 + x.id, side, typeName: x.vatType, partner: x.partnerName, text: x.remark ?? '',
      buySupply: side === '매입' ? Number(x.supplyAmount) : 0, sellSupply: side === '매출' ? Number(x.supplyAmount) : 0,
      buyVat: side === '매입' ? Number(x.vatAmount) : 0, sellVat: side === '매출' ? Number(x.vatAmount) : 0 })
  }
  const serial = bookSerials(out)
  const keep = kind === '매입' ? '매입' : kind === '매출' ? '매출' : null
  return out.filter((x) => !keep || x.side === keep)
    .sort((p, q) => p.date.localeCompare(q.date) || (serial.get(p) ?? 0) - (serial.get(q) ?? 0))
    .map((x) => ({ ...x, dateNo: `${x.date.replace(/-/g, '/')} -${serial.get(x) ?? ''}` }))
}

interface TaxInvoice { invoiceNo: string; invoiceTypeName: string; statusName: string; issueDate: string; partnerName: string; supplyAmount: number; vatAmount: number; totalAmount: number }
export async function taxInvoiceRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [s, p] = await Promise.all([
    get<TaxInvoice[]>('/tax-invoices', { type: 'SALES', from, to }),
    get<TaxInvoice[]>('/tax-invoices', { type: 'PURCHASE', from, to }),
  ])
  return [...s, ...p].map((t) => ({
    dateNo: dateNo(t.issueDate, t.invoiceNo), partner: t.partnerName, supply: t.supplyAmount, vat: t.vatAmount, total: t.totalAmount,
    kind: t.invoiceTypeName, stage: t.statusName,
  }))
}

// ── 공통 ──
interface Approval { id: number; draftDate: string; title: string; drafterName: string; currentApproverName: string | null; lastActorName: string | null; statusName: string; voucherCount: number; attachmentName: string | null }
/** 원본 메뉴 → 우리 /approvals scope. 공유문서는 우리에 없다 */
export const APPROVAL_SCOPES: Record<string, string> = { '내 기안문서': 'drafted', '내가 결재할 문서': 'pending', '참조문서': 'reference', '공유문서': 'shared' }
export async function approvalRows({ settings }: FetchArgs): Promise<Row[]> {
  const scope = APPROVAL_SCOPES[settings.extra?.menu ?? '내 기안문서']
  if (scope === 'shared') return []
  const list = await get<Approval[]>('/approvals', { scope })
  return list.map((d) => ({
    date: dateText(d.draftDate), title: d.title, drafter: d.drafterName, approver: d.currentApproverName ?? d.lastActorName ?? '', status: d.statusName,
    view: '보기', vouchers: d.voucherCount || '', attach: d.attachmentName ?? '', id: d.id,
  }))
}

interface Post { id: number; postNo: string | number | null; postDate: string; title: string; writerName: string | null; statusName: string | null; viewCount: number; attachmentName: string | null; notice: boolean }
export async function boardRows(board: string, { settings }: FetchArgs): Promise<Row[]> {
  const list = await get<Post[]>('/work-posts', { board })
  const onlyNotice = settings.extra?.mode === '공지글 알림'
  return list.filter((p) => !onlyNotice || p.notice)
    // 공지 글은 위로(원본 '공지' 딱지 · 노란 바탕)
    .sort((a, b) => Number(b.notice) - Number(a.notice) || b.postDate.localeCompare(a.postDate))
    .map((p) => ({
      no: p.postNo ?? '', title: p.title, date: dateText(p.postDate), writer: p.writerName ?? '', status: p.statusName ?? '', views: p.viewCount,
      attach: p.attachmentName ?? '', notice: p.notice ? 1 : 0,
    }))
}

interface Msg { senderName: string | null; content: string; sentAt: string; readAt: string | null }
export async function messageRows(): Promise<Row[]> {
  const t = new Date()
  const list = await get<Msg[]>('/short-messages', { box: 'received', from: ymd(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate())), to: ymd(t) })
  return list.map((m) => ({ sender: m.senderName ?? '', content: m.content, sentAt: m.sentAt?.replace('T', ' ').slice(0, 16) ?? '', read: m.readAt ? '읽음' : '안읽음' }))
}

interface FieldWork { workDate: string; userName: string; vehicleNo: string | null; vehicleName: string | null; departure: string | null; destination: string | null; distance: number | null; purpose: string | null }
export async function fieldWorkRows({ from, to }: FetchArgs): Promise<Row[]> {
  const r = await get<{ rows: FieldWork[] }>('/field-works', { from, to })
  return r.rows.map((f, i) => ({
    dateNo: `${dateText(f.workDate)} -${i + 1}`, user: f.userName, vehicleCode: f.vehicleNo ?? '', vehicleName: f.vehicleName ?? '',
    departure: f.departure ?? '', destination: f.destination ?? '', distance: f.distance ?? '', remark: f.purpose ?? '',
  }))
}

interface Note { content: string; pinned: boolean; updatedAt: string }
export async function noteRows(): Promise<Row[]> {
  const list = await get<Note[]>('/workspace/notes')
  return list.map((n) => ({ note: n.content.split('\n')[0], label: n.pinned ? '고정' : '', date: dateText(n.updatedAt?.slice(0, 10)) }))
}

interface Mail { subject: string; senderName: string | null; fromAddress: string | null; sentAt: string | null }
export async function mailRows(): Promise<Row[]> {
  const list = await get<Mail[]>('/mails/inbox')
  return list.map((m) => ({ subject: m.subject, sender: m.senderName ?? m.fromAddress ?? '', date: m.sentAt?.replace('T', ' ').slice(0, 16) ?? '' }))
}

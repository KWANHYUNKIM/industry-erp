import { api } from '../../../api/client'
import type { JournalEntry, PartnerBalance, PurchaseDoc, SalesDoc, StockRow } from '../../../types/api'
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
const dayBefore = (d: string) => {
  const x = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  x.setDate(x.getDate() - 1)
  return ymd(x)
}

// ── 재고 ──
export async function stockRows({ to, kind }: FetchArgs): Promise<Row[]> {
  const list = await get<StockRow[]>('/stock', { asOf: to })
  // 원본 재고현황 위젯은 품목별 — 창고를 합친 총재고. 안전재고는 품목에 하나라 합친 수와 견준다
  const by = new Map<number, Row>()
  for (const s of list) {
    const r = by.get(s.itemId) ?? { itemCode: s.itemCode, item: nameSpec(s.itemName, s.spec), qty: 0, warehouse: s.warehouseName, safety: s.safetyStock }
    r.qty = Number(r.qty) + s.quantity
    if (r.warehouse !== s.warehouseName) r.warehouse = ''
    by.set(s.itemId, r)
  }
  const rows = [...by.values()]
  return kind === '안전재고미만품목별' ? rows.filter((r) => Number(r.qty) < Number(r.safety ?? 0)) : rows
}

/** 입고단가 — 품목별 마지막 구매단가(생산불출현황 · 생산입고현황 화면과 같은 출처) */
async function itemPrices(): Promise<Map<number, number>> {
  const list = await get<{ itemId: number; unitPrice: number }[]>('/purchases/item-prices').catch(() => [])
  return new Map(list.map((p) => [p.itemId, Number(p.unitPrice)]))
}

export async function stockRowsPriced(a: FetchArgs): Promise<Row[]> {
  const [rows, list, price] = await Promise.all([stockRows(a), get<StockRow[]>('/stock', { asOf: a.to }), itemPrices()])
  const idOf = new Map(list.map((s) => [s.itemCode, s.itemId]))
  return rows.map((r) => {
    const p = price.get(idOf.get(String(r.itemCode)) ?? -1) ?? 0
    return { ...r, price: p, amount: p * Number(r.qty) }
  })
}

export async function salesRows({ from, to }: FetchArgs): Promise<Row[]> {
  const docs = await get<SalesDoc[]>('/sales', { from, to })
  return docs.flatMap((d) => d.lines.map((l) => ({
    date: dateText(d.saleDate), dateNo: dateNo(d.saleDate, d.docNo), item: nameSpec(l.itemName, l.spec), itemCode: l.itemCode,
    qty: l.quantity, price: l.unitPrice, supply: l.supplyAmount, vat: l.vatAmount, total: l.supplyAmount + l.vatAmount,
    partner: d.partnerName, employee: d.employeeName ?? '', warehouse: d.warehouseName, itemGroup: l.itemCategoryName ?? '', remark: l.remark ?? d.remark ?? '',
  })))
}

export async function purchaseRows({ from, to }: FetchArgs): Promise<Row[]> {
  const docs = await get<PurchaseDoc[]>('/purchases', { from, to })
  return docs.flatMap((d) => d.lines.map((l) => ({
    dateNo: dateNo(d.purchaseDate, d.docNo), date: dateText(d.purchaseDate), partner: d.partnerName, remark: l.remark ?? d.remark ?? '',
    item: nameSpec(l.itemName, l.spec), itemCode: l.itemCode, qty: l.quantity, price: l.unitPrice, amount: l.supplyAmount, vat: l.vatAmount,
    employee: d.employeeName ?? '', warehouse: d.warehouseName, itemGroup: l.itemCategoryName ?? '',
  })))
}

interface UnsoldLine {
  orderNo: string; orderDate: string; dueDate: string | null; partnerName: string; itemName: string; spec: string | null; itemCode: string
  orderQty: number; unsoldQty: number; unitPrice: number; unsoldAmount: number; warehouseName: string; remark: string | null; statusName: string
}
export async function unsoldRows({ from, to }: FetchArgs): Promise<Row[]> {
  const list = await get<UnsoldLine[]>('/sales-orders/unsold', { from, to })
  return list.map((l) => ({
    dateNo: dateNo(l.orderDate, l.orderNo), item: nameSpec(l.itemName, l.spec), itemCode: l.itemCode, qty: l.orderQty, restQty: l.unsoldQty,
    supply: l.unsoldAmount, partner: l.partnerName, remark: l.remark ?? '', due: dateText(l.dueDate), vat: Math.round(l.unsoldAmount * 0.1),
    warehouse: l.warehouseName, status: l.statusName,
  }))
}

interface PoLine { id: number; itemName: string; itemCode: string; spec: string | null; quantity: number; vatAmount: number; remark: string | null; itemCategoryName?: string | null }
interface Po { orderNo: string; orderDate: string; dueDate: string | null; partnerName: string; warehouseName: string; remark: string | null; statusName: string; lines: PoLine[] }
export async function unpurchasedRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [pos, rest] = await Promise.all([
    get<Po[]>('/purchase-orders', { from, to }),
    get<{ orderLineId: number; restQty: number }[]>('/purchase-orders/unpurchased', { from, to }),
  ])
  const left = new Map(rest.map((r) => [r.orderLineId, Number(r.restQty)]))
  return pos.flatMap((o) => o.lines.filter((l) => (left.get(l.id) ?? 0) > 0).map((l) => {
    const q = left.get(l.id)!
    return {
      dateNo: dateNo(o.orderDate, o.orderNo), item: nameSpec(l.itemName, l.spec), itemCode: l.itemCode, qty: l.quantity, restQty: q,
      due: dateText(o.dueDate), partner: o.partnerName, remark: l.remark ?? o.remark ?? '',
      vat: l.quantity ? Math.round((l.vatAmount * q) / l.quantity) : 0, warehouse: o.warehouseName, itemGroup: l.itemCategoryName ?? '', status: o.statusName,
    }
  }))
}

interface UnshippedLine {
  orderNo: string; orderDate: string; itemName: string; itemCode: string; spec: string | null; quantity: number; unshippedQty: number
  warehouseName: string; partnerName: string; remark: string | null; dueDate: string | null; statusName: string
}
export async function unshippedRows({ from, to }: FetchArgs): Promise<Row[]> {
  const list = await get<UnshippedLine[]>('/shipment-orders/unshipped', { from, to })
  return list.map((l) => ({
    dateNo: dateNo(l.orderDate, l.orderNo), item: nameSpec(l.itemName, l.spec), itemCode: l.itemCode, qty: l.quantity, restQty: l.unshippedQty,
    warehouse: l.warehouseName, partner: l.partnerName, remark: l.remark ?? '', due: dateText(l.dueDate), status: l.statusName,
  }))
}

interface Issue { issueNo: string; issueDate: string; itemId: number; itemCode: string; itemName: string; itemSpec: string | null; warehouseName: string; toWarehouseName: string | null; qty: number; note: string | null }
export async function issueRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [list, price] = await Promise.all([get<Issue[]>('/material-issues', { from, to }), itemPrices()])
  return list.map((m) => ({
    dateNo: dateNo(m.issueDate, m.issueNo), outWh: m.warehouseName, inWh: m.toWarehouseName ?? '', item: nameSpec(m.itemName, m.itemSpec), itemCode: m.itemCode,
    qty: m.qty, amount: Math.round(Number(m.qty) * (price.get(m.itemId) ?? 0)), remark: m.note ?? '', warehouse: m.warehouseName,
  }))
}

interface Prod { prodNo: string; productionDate: string; productId: number; productCode: string; productName: string; productSpec: string | null; warehouseName: string; fromWarehouseName: string | null; producedQty: number; note: string | null }
export async function receiptRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [list, price] = await Promise.all([get<Prod[]>('/productions', { from, to }), itemPrices()])
  return list.map((p) => ({
    dateNo: dateNo(p.productionDate, p.prodNo), outWh: p.fromWarehouseName ?? '', inWh: p.warehouseName, item: nameSpec(p.productName, p.productSpec), itemCode: p.productCode,
    qty: p.producedQty, amount: Math.round(Number(p.producedQty) * (price.get(p.productId) ?? 0)), remark: p.note ?? '', warehouse: p.warehouseName,
  }))
}

interface Settlement { type: 'RECEIPT' | 'PAYMENT'; partnerId: number; amount: number }
/**
 * 거래처별채권 · 채무 — 채권/채무월별현황 화면(MonthlyArApPage)과 같은 셈: 기초 = 기간 전날 잔액, 증가 = 판매(구매)전표,
 * 감소 = 수금(지급) 정산, 잔액 = 기간 끝 잔액. 기타할인등차액은 그 사이에 설명되지 않는 차이(회계전표 · 어음 등)다.
 */
export async function arApRows({ from, to }: FetchArgs, side: 'AR' | 'AP'): Promise<Row[]> {
  const [open, close, docs, st] = await Promise.all([
    get<PartnerBalance[]>('/ledger/partner-balances', { asOf: dayBefore(from) }),
    get<PartnerBalance[]>('/ledger/partner-balances', { asOf: to }),
    side === 'AR' ? get<SalesDoc[]>('/sales', { from, to }) : get<PurchaseDoc[]>('/purchases', { from, to }),
    get<Settlement[]>('/settlements', { from, to }),
  ])
  const bal = (b: PartnerBalance | undefined) => (b ? (side === 'AR' ? b.receivable : b.payable) : 0)
  const openOf = new Map(open.map((b) => [b.partnerId, bal(b)]))
  const inc = new Map<number, number>()
  for (const d of docs) inc.set(d.partnerId as number, (inc.get(d.partnerId as number) ?? 0) + d.totalAmount)
  const dec = new Map<number, number>()
  for (const s of st) if (s.type === (side === 'AR' ? 'RECEIPT' : 'PAYMENT')) dec.set(s.partnerId, (dec.get(s.partnerId) ?? 0) + Number(s.amount))
  return close.map((b) => {
    const o = openOf.get(b.partnerId) ?? 0
    const i = inc.get(b.partnerId) ?? 0
    const d = dec.get(b.partnerId) ?? 0
    const end = bal(b)
    return {
      manager: b.manager ?? '', partnerCode: b.code, partner: b.name, open: o, inc: i, settle: d, diff: o + i - d - end, balance: end,
      unbilled: side === 'AR' ? b.unbilledReceivable : b.unbilledPayable,
    }
  }).filter((r) => r.open || r.inc || r.settle || r.balance)
}

interface OrderNo { orderNo: string; name: string; orderTypeId: number | null; orderTypeName: string | null; createdDate: string }
interface OrderType { id: number; steps: { seq: number; stageName: string }[] }
export async function orderStageRows({ from, to }: FetchArgs): Promise<Row[]> {
  const [list, types] = await Promise.all([get<OrderNo[]>('/order-numbers', { from, to }), get<OrderType[]>('/order-types')])
  const steps = new Map(types.map((t) => [t.id, [...t.steps].sort((a, b) => a.seq - b.seq).map((s) => s.stageName).join(' › ')]))
  return list.map((o) => ({
    orderNo: o.orderNo, name: o.name, typeName: o.orderTypeName ?? '', date: dateText(o.createdDate),
    stages: o.orderTypeId != null ? steps.get(o.orderTypeId) ?? '' : '', detail: '보기',
  }))
}

interface AsRow { asNo: string; receiptDate: string; statusName: string; warehouseName: string | null; charge: string | null; partnerName: string | null; title: string | null; itemCode: string | null; itemName: string | null; itemSpec: string | null; lines?: { quantity: number }[] }
export async function asRows({ from, to }: FetchArgs): Promise<Row[]> {
  const list = await get<AsRow[]>('/as-requests', { from, to })
  return list.map((a) => ({
    dateNo: dateNo(a.receiptDate, a.asNo), status: a.statusName, warehouse: a.warehouseName ?? '', employee: a.charge ?? '', partner: a.partnerName ?? '',
    title: a.title ?? '', itemCode: a.itemCode ?? '', item: a.itemName ? nameSpec(a.itemName, a.itemSpec) : '',
    qty: (a.lines ?? []).reduce((t, l) => t + Number(l.quantity), 0),
  }))
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

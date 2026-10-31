import { useEffect, useState } from 'react'
import { vatEntrySide, vatSlipAmounts } from '../../utils/vatSlip'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { fillAndPrint, openPrintWindow } from '../../utils/print'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import type { JournalEntry } from '../../types/api'
import EcDateInput from '../../components/ui/EcDateInput'
import { pad2 } from '../../utils/periods'
import { fmtAmount } from '../../utils/format'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
export interface AccountOpt { code: string; detailCategory: string | null }
interface PartnerOpt { id: number; name: string; bizRegNo: string | null }
interface Mark { journalEntryId: number; docKind: string; progress: string }
/** 합계표 한 장의 계산서 한 장 — 거래처 · 전자 여부 · 금액. */
interface Invoice { partnerId: number | null; partner: string; bizNo: string; personal: boolean; electronic: boolean; supply: number; vat: number }
/** [신고서등] 창의 서류 — 서버 vat_return_docs.doc_code. */
type DocCode = 'RETURN' | 'SALES_INVOICE' | 'PURCHASE_INVOICE' | 'CARD_SALES' | 'CARD_RECEIPT'
/** 원본 첨부서류명 목록(35종) 중 우리가 만드는 것 — 번호는 원본 그대로. */
const ATTACHMENTS: [number, DocCode, string][] = [
  [1, 'SALES_INVOICE', '매출세금계산서'], [2, 'PURCHASE_INVOICE', '매입세금계산서'],
  [6, 'CARD_SALES', '신용카드 매출전표 등 발행금액 집계표'], [15, 'CARD_RECEIPT', '신용카드 매입전표 등 수령금액 합계표'],
]
const DOC_TITLE: Record<DocCode, string> = {
  RETURN: '부가가치세신고서', SALES_INVOICE: '매출세금계산서', PURCHASE_INVOICE: '매입세금계산서',
  CARD_SALES: '신용카드 매출전표 등 발행금액 집계표', CARD_RECEIPT: '신용카드 매입전표 등 수령금액 합계표',
}
interface DocSummary { docCode: DocCode; writtenAt: string }
interface DocStored { docCode: DocCode; data: string; writtenAt: string }
/** 목록 [이력] 한 줄 — 서버 vat_return_histories. docCode INFO 는 신고서 정보. */
interface HistoryRow { changedBy: string | null; changedAt: string; docCode: DocCode | 'INFO'; action: string }
/** 원본 '전자파일 첨부서류 확인리스트' 한 줄 — 순번 · 첨부서류명 · 전자파일 생성전 확인사항. */
interface FileCheck { no: number; name: string; note: string }
/** [신고서등] 창을 열 때 찍어 둔 서류 상태 — 만든 때와 자료가 있나. */
interface DocShown { at: string; filled: boolean }

const nz = (a?: Amt) => !!a && (a.supply !== 0 || a.vat !== 0)
/**
 * 서류에 자료가 있나 — 원본 [조회] 주황 꼬리표는 자료가 든 서류에만 붙는다(2026-10-13 loginaa 2기 예정:
 * 카드 전표를 지운 뒤 다시 불러 0 이 된 6 집계표 · 15 수령명세서는 만들어 둔 서류인데도 꼬리표가 없다).
 */
function filledOf(code: DocCode, s: Sheet): boolean {
  const c = s.cards
  switch (code) {
    case 'RETURN': return [s.taxInvoice, s.zeroInvoice, s.purchaseGeneral, s.purchaseFixed, s.cardSales, s.otherPurchase].some(nz)
    case 'SALES_INVOICE': return s.salesInvoices.length > 0
    case 'PURCHASE_INVOICE': return s.purchaseInvoices.length > 0
    case 'CARD_SALES': return !!c && c.saleCard + c.saleCash + c.saleCardFree + c.saleCashFree !== 0
    case 'CARD_RECEIPT': return !!c && c.recvCash.n + c.recvCard.n > 0
  }
}
export interface CompanyInfo {
  name?: string; ceo?: string; bizRegNo?: string; bizType?: string; bizItem?: string
  tel?: string; email?: string; address?: string; addressDetail?: string
}
type Term = 1 | 2
type Kind = '예정' | '확정'
interface Amt { supply: number; vat: number }
/** 건수 · 공급가액 · 세액 — 수령명세서(갑)의 한 칸. */
interface Cnt { n: number; supply: number; vat: number }
/**
 * 카드 · 현금영수증 서류의 숫자 — 2026-10-13 loginaa 실측: 매출전표 I 카드매출 100,000 · 현금영수증 200,000(9/30) →
 * 신용카드 매출전표 등 발행금액 집계표 [새로불러오기] 합계 330,000 = ⑥ 신용·직불·기명식 선불카드 110,000 + ⑦ 현금영수증 220,000,
 * 과세 매출분 같은 숫자(공급대가 — 부가세 포함), 면세 매출분 · 봉사료 · ⑨ · ⑩ 0.
 * 매입전표 I 현금영수증 50,000 · 5,000 → 수령명세서(갑) ⑤ 현금영수증 1 · 50,000 · 5,000, 신고서 (44) 일반매입 50,000 · 5,000.
 */
export interface CardTally {
  saleCard: number; saleCash: number; saleCardFree: number; saleCashFree: number
  /** ⑤ 현금영수증 · ⑦ 사업용 신용카드. 카드매입은 원본이 카드번호를 필수로 받아 넣어 보지 못했다 — 카드번호가 없는 우리는 ⑦ 로 센다. */
  recvCash: Cnt; recvCard: Cnt
  /** 신고서 (44) 일반매입 · (45) 고정자산매입 — 합이 (15) · (52). */
  general: Amt; fixed: Amt
}
const CNT0: Cnt = { n: 0, supply: 0, vat: 0 }
const CARDS0: CardTally = { saleCard: 0, saleCash: 0, saleCardFree: 0, saleCashFree: 0, recvCash: CNT0, recvCard: CNT0,
  general: { supply: 0, vat: 0 }, fixed: { supply: 0, vat: 0 } }
export interface Sheet {
  year: number; term: Term; kind: Kind; first: number; last: number; end: number; from: string; to: string
  taxInvoice: Amt; zeroInvoice: Amt; purchaseGeneral: Amt; purchaseFixed: Amt
  /** (3) 과세 신용카드ㆍ현금영수증발행분 — 부가세유형 카드매출 · 현금영수증(매출). */
  cardSales: Amt
  /** (15) 그 밖의 공제매입세액 — 신용카드매출전표등 수령명세서 제출분(현금영수증 · 카드매입, 고정자산 포함). */
  otherPurchase: Amt
  /** 첨부서류 6 · 15 와 신고서 (44) · (45). 예전에 저장한 신고서에는 없다. */
  cards?: CardTally
  salesInvoices: Invoice[]; purchaseInvoices: Invoice[]
}

/** 원본 [신고기간] 기 고르기 — 1기 예정(1~3) · 1기 확정(4~6) · 2기 예정(7~9) · 2기 확정(10~12). */
const TERM_OPTIONS = [['1PRELIM', '1기 예정(1~3)'], ['1FINAL', '1기 확정(4~6)'], ['2PRELIM', '2기 예정(7~9)'], ['2FINAL', '2기 확정(10~12)']] as const
export interface VatReturnRow {
  id: number; filingType: 'REGULAR' | 'LATE'; returnKind: 'PRELIM' | 'FINAL' | 'MONTHLY'; year: number; monthFrom: number; monthTo: number
  includesOmitted: boolean; periodName: string; reportDate: string; dueDate: string; taxAgent: boolean; closure: boolean
}
interface ReturnForm {
  id?: number; filingType: 'REGULAR' | 'LATE'; returnKind: 'PRELIM' | 'FINAL'; monthly: boolean; year: number; term: Term; month: number
  reportDate: string; dueDate: string; taxAgent: boolean; closure: boolean
}
interface TaxVoucher { side: 'SALES' | 'PURCHASE'; vatType: string; partnerId: number; partnerName: string; supplyAmount: number; vatAmount: number }
/** 원본 기본 신고작성일자 · 납부기한 — 신고기간 끝 달의 다음 달 25일(2기 예정 → 2026/10/25). */
function dueOf(year: number, lastMonth: number) {
  const d = new Date(year, lastMonth, 25)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-25`
}
const add = (a: Amt, b: Amt): Amt => ({ supply: a.supply + b.supply, vat: a.vat + b.vat })
const ZERO: Amt = { supply: 0, vat: 0 }
/** 고정자산 매입 — 부가세 줄 옆 차변이 유형 · 무형자산 계정인 매입. */
const FIXED_CATEGORIES = ['유형자산', '무형자산']
/**
 * 부가세유형으로 칸이 정해지는 전표 — 2026-10-13 loginaa 2기 예정 실측: 매출전표 I 카드매출 100,000 · 현금영수증 200,000 을 넣고
 * 신고서 [새로불러오기] → (3) 300,000 · 30,000(세금계산서발급분 (1) 은 그대로). 매입전표 I 현금영수증 50,000 은 신용카드매출전표등
 * 수령명세서(갑) ⑤현금영수증 1 · 50,000 · 5,000 → 신고서 (15) 그 밖의 공제매입세액 · (44) 일반매입 50,000 · 5,000((10) 은 그대로).
 * 카드매입은 원본이 카드번호를 필수로 받아 넣어 보지 않았다 — 같은 명세서의 [사업용신용카드 · 그 밖의 신용카드] 칸이라 (15) 로 센다.
 */
const CARD_SALES = ['카드매출', '현금영수증']
const CARD_PURCHASES = ['현금영수증', '카드매입', '신용카드(고정자산)', '현금영수증(고정자산)']
/** 집계표의 면세 매출분 — 부가세 줄이 없어 매출 계정 대변이 곧 금액이다. */
const FREE_CARD_SALES = ['카드매출(면세)', '현금영수증(면세)']
type VatTyped = JournalEntry & { vatType?: string | null }
const PRINT_CSS = 'body{font-family:sans-serif;font-size:11px;margin:16px}'
  + 'table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid gray;padding:3px}'
  + '.text-right{text-align:right}.text-center{text-align:center}.ec-report-title{font-size:16px;font-weight:bold;text-align:center}'

/** 신고서 한 장의 숫자 — 그 기간의 회계전표 · (세금)계산서발행/수령에서 센다. 부가세신고서 PDF 다운로드(E030216)도 쓴다. */
export async function loadVatSheet(v: VatReturnRow, accounts: AccountOpt[]): Promise<Sheet> {
  const first = v.monthFrom, last = v.monthTo
  const end = new Date(v.year, last, 0).getDate()
  const from = `${v.year}-${pad2(first)}-01`, to = `${v.year}-${pad2(last)}-${pad2(end)}`
  const [r, pr, mk, tv] = await Promise.all([
    api.get<JournalList>('/journals', { params: { from, to, all: true } }),
    api.get<PartnerOpt[]>('/partners'),
    api.get<Mark[]>('/vat-invoice-marks'),
    api.get<TaxVoucher[]>('/tax-vouchers', { params: { from, to } }),
  ])
  const partnerOf = new Map(pr.data.map((x) => [x.id, x]))
  const markOf = new Map(mk.data.map((x) => [x.journalEntryId, x]))
  const salesInvoices: Invoice[] = []
  const purchaseInvoices: Invoice[] = []
  const bizNoOf = (partnerId: number | null) => (partnerId != null ? partnerOf.get(partnerId)?.bizRegNo : null)?.replace(/-/g, '') ?? ''
  const invoiceOf = (e: JournalEntry, a: Amt): Invoice => {
    const bizNo = bizNoOf(e.partnerId)
    const m = markOf.get(e.id)
    /* 각종구분값변경의 종이(세금)계산서 · 기한후 발행은 '전자세금계산서 외의 발급분'. */
    const electronic = !(m && (m.docKind === 'PAPER' || m.progress === 'LATE'))
    return { partnerId: e.partnerId, partner: e.partnerName ?? '', bizNo, personal: bizNo.length === 13, electronic, supply: a.supply, vat: a.vat }
  }
  const cat = new Map(accounts.map((a) => [a.code, a.detailCategory ?? '']))
  let taxInvoice = ZERO, zeroInvoice = ZERO, purchaseGeneral = ZERO, purchaseFixed = ZERO, cardSales = ZERO, otherPurchase = ZERO
  const cards: CardTally = { ...CARDS0, recvCash: { ...CNT0 }, recvCard: { ...CNT0 } }
  const tallySale = (type: string, a: Amt) => {
    cardSales = add(cardSales, a)
    if (type === '카드매출') cards.saleCard += a.supply + a.vat
    else cards.saleCash += a.supply + a.vat
  }
  const tallyReceipt = (type: string, a: Amt) => {
    otherPurchase = add(otherPurchase, a)
    const k = type.startsWith('현금영수증') ? 'recvCash' : 'recvCard'
    cards[k] = { n: cards[k].n + 1, supply: cards[k].supply + a.supply, vat: cards[k].vat + a.vat }
    if (type.includes('고정자산')) cards.fixed = add(cards.fixed, a)
    else cards.general = add(cards.general, a)
  }
  for (const e of r.data.rows as VatTyped[]) {
    /* 카드 · 현금영수증은 세금계산서가 아니다 — (1) · (10) 과 세금계산서합계표에서 빼고 (3) · (15) 로. */
    const type = e.vatType?.trim()
    const side = type ? vatEntrySide(e) : null
    if (type && side === '매출' && CARD_SALES.includes(type)) {
      const a = vatSlipAmounts(e.lines, '매출')
      if (a) tallySale(type, a)
      continue
    }
    if (type && side === '매출' && FREE_CARD_SALES.includes(type)) {
      /* 지급수수료(831) 차변은 짝이 되는 입금계좌 대변을 지운다(utils/vatSlip withoutFee 와 같은 까닭). */
      const free = e.lines.reduce((t, l) => t + Number(l.credit) - (l.accountCode === '8319' ? Number(l.debit) : 0), 0)
      if (type === '카드매출(면세)') cards.saleCardFree += free
      else cards.saleCashFree += free
      continue
    }
    if (type && side === '매입' && CARD_PURCHASES.includes(type)) {
      const a = vatSlipAmounts(e.lines, '매입')
      if (a) tallyReceipt(type, a)
      continue
    }
    const s = vatSlipAmounts(e.lines, '매출')
    if (s) {
      if (s.vat === 0) zeroInvoice = add(zeroInvoice, s)
      else taxInvoice = add(taxInvoice, s)
      salesInvoices.push(invoiceOf(e, s))
    }
    const b = vatSlipAmounts(e.lines, '매입')
    if (b) {
      const fixed = e.lines.some((l) => Number(l.debit) > 0 && FIXED_CATEGORIES.includes(cat.get(l.accountCode) ?? ''))
      if (fixed) purchaseFixed = add(purchaseFixed, b)
      else purchaseGeneral = add(purchaseGeneral, b)
      purchaseInvoices.push(invoiceOf(e, b))
    }
  }
  /* (세금)계산서발행/수령의 계산서 — 분개는 없지만 원본 매입/매출장에 실린다. 세금계산서 · 영세율 유형만 이 칸들로 센다. */
  for (const t of tv.data) {
    const a: Amt = { supply: Number(t.supplyAmount), vat: Number(t.vatAmount) }
    const bizNo = bizNoOf(t.partnerId)
    const inv: Invoice = { partnerId: t.partnerId, partner: t.partnerName, bizNo, personal: bizNo.length === 13, electronic: true, supply: a.supply, vat: a.vat }
    if (t.side === 'SALES' && CARD_SALES.includes(t.vatType)) { tallySale(t.vatType, a); continue }
    if (t.side === 'SALES' && FREE_CARD_SALES.includes(t.vatType)) {
      if (t.vatType === '카드매출(면세)') cards.saleCardFree += a.supply
      else cards.saleCashFree += a.supply
      continue
    }
    if (t.side === 'PURCHASE' && CARD_PURCHASES.includes(t.vatType)) { tallyReceipt(t.vatType, a); continue }
    if (t.side === 'SALES') {
      if (t.vatType === '세금계산서') { taxInvoice = add(taxInvoice, a); salesInvoices.push(inv) }
      else if (t.vatType === '영세율') { zeroInvoice = add(zeroInvoice, a); salesInvoices.push(inv) }
    } else if (t.vatType === '세금계산서' || t.vatType.startsWith('세.계')) {
      if (t.vatType.includes('고정')) purchaseFixed = add(purchaseFixed, a)
      else purchaseGeneral = add(purchaseGeneral, a)
      purchaseInvoices.push(inv)
    }
  }
  return { year: v.year, term: first <= 6 ? 1 : 2, kind: v.returnKind === 'FINAL' ? '확정' : '예정', first, last, end, from, to,
    taxInvoice, zeroInvoice, purchaseGeneral, purchaseFixed, cardSales, otherPurchase, cards, salesInvoices, purchaseInvoices }
}

/**
 * 세무 › 부가세 › 부가세신고서(일반) › <b>부가가치세신고서(일반)</b>(E200928) — 2026-10-04 loginaa 실측.
 *
 * <p>원본 목록은 [신고기간 · 예정누락포함여부 · 회사명 · 신고서등 · 휴폐업조회 · 영수증서 · 전자파일 · PDF · 이력] 한 줄(2026년 2기 예정(7~9)),
 * [신고서등 › 조회] → 첨부서류 창 → [부가가치세신고서 › 조회] 가 이 서식 — [별지 제21호서식] 일반과세자 부가가치세 신고서.
 * 머리 [상호 · 성명 · 사업자등록번호 · 전화 · 사업장주소 · 전자우편], ① 신고내용 (1)~(30), ④ 과세표준명세 (31)~(35).
 * 원본 2026 2기 예정: (1) 396,450,000 · 39,645,000 / (10) 315,234,000 · 31,523,400 / ㉰ 8,121,600 / (30) 8,121,600.
 *
 * <p>숫자는 회계전표의 부가세 줄로 낸다(utils/vatSlip): (1) 매출 부가세가 있는 것 · (5) 매출 영세율(부가세 0) ·
 * (10) 매입 중 (12) 고정자산(차변이 유형 · 무형자산 계정)이 아닌 것. 부가세유형이 카드매출 · 현금영수증인 매출은 (3),
 * 현금영수증 · 카드매입(고정자산 포함)인 매입은 (15) 그 밖의 공제매입세액(2026-10-13 실측 — CARD_SALES 위 주석).
 * 예정신고누락 · 대손 · 경감공제 · 가산세는 우리 자료에 없어 0 이다.
 *
 * <p>[신고서등 › 조회] 는 원본처럼 '부가세신고서(첨부서류)' 창 — 신고서와 첨부서류 1 · 2 · 6 · 15 를 [조회] · [새로불러오기] 한다.
 * 서류는 처음 [조회] 때 센 숫자를 저장해 두고(vat_return_docs) [새로불러오기] 전까지 그대로 보여 준다. 신고서보다 늦게 만든 첨부서류가
 * 있으면 창 머리에 빨간 '부가세신고서 최종수정일 … 이후로 수정된 서류가 있습니다.', 신고서 [조회] 때 '다시 작성하시겠습니까?'
 * ([취소] 는 저장된 숫자 그대로) — 2026-10-13 loginaa 실측.
 *
 * <p>신고서 목록은 원본처럼 [신규(F2)] 로 만들고 신고기간을 눌러 고치고 [선택삭제] 로 지운다(2026-10-12). 귀속연도는 지난해 ~ 올해,
 * 그보다 앞선 해는 부가세신고서 PDF 다운로드(E030216, VatReturnPdfPage)에 선다.
 *
 * <p>목록 열은 원본 10개(2026-10-20): [이력] 은 '부가세신고서 이력보기'(서버 vat_return_histories), [전자파일 › 생성목록] 은
 * '전자파일 첨부서류 확인리스트'([강제생성 · 재검증 · 닫기] — 파일은 만들지 않는다), [PDF › 생성목록] 은 'PDF를 생성하시겠습니까?' 뒤 인쇄 창.
 * [신규(F2)] 저장은 원본처럼 매출 · 매입세금계산서 · 신고서를 그 자리에서 만든다(이력에 셋 다 '신규').
 *
 * <p>두지 않은 것: 자료비교 · 나머지 첨부서류 31종 · 휴폐업조회(홈택스) · 영수증서(납부서) · Option(세무신고설정 · 부가세제한월) · [부가세전자신고매뉴얼] ·
 * [자료입력](칸 손으로 고치기) · 예정신고누락분 · 그 밖의 공제 · 공제받지 못할 · 가산세 명세(모두 0 으로 그린다).
 */
export default function VatReturnPage() {
  const today = new Date()
  const thisYear = today.getFullYear()
  /* 원본 [신규(F2)] 의 기본 신고기간은 지난 분기 — 10/12 에 2026년 2기 예정(7~9). */
  const lastQuarter = Math.floor(today.getMonth() / 3) - 1
  const initYear = lastQuarter < 0 ? thisYear - 1 : thisYear
  const q = (lastQuarter + 4) % 4
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [returns, setReturns] = useState<VatReturnRow[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [form, setForm] = useState<ReturnForm | null>(null)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** [신고서등 › 조회] 로 연 '부가세신고서(첨부서류)' 창 — 그 신고서와 저장된 서류의 만든 때. */
  const [win, setWin] = useState<VatReturnRow | null>(null)
  const [written, setWritten] = useState<Partial<Record<DocCode, string>>>({})
  /**
   * 창을 연 때의 서류 상태 — 원본은 경고 줄 · 꼬리표를 창을 열 때만 그린다(2026-10-13 실측: 첨부서류를 [새로불러오기] 해도
   * 그 창에서는 경고가 안 뜨고 닫았다 다시 열어야 뜨며, 신고서를 [새로불러오기] 한 뒤에도 그 창에는 경고가 남는다).
   */
  const [shown, setShown] = useState<Partial<Record<DocCode, DocShown>>>({})
  /** 연 서류 한 장. */
  const [view, setView] = useState<{ code: DocCode; sheet: Sheet } | null>(null)
  /** 원본 '알림' 창 — 글줄과 [확인] · [취소]. */
  const [ask, setAsk] = useState<{ lines: string[]; yes: () => void; no?: () => void } | null>(null)
  /** 목록 [이력] 창 — 원본 '부가세신고서 이력보기'. */
  const [history, setHistory] = useState<{ v: VatReturnRow; rows: HistoryRow[] } | null>(null)
  /** 목록 [전자파일 › 생성목록] 창 — 원본 '전자파일 첨부서류 확인리스트'. */
  const [fileCheck, setFileCheck] = useState<{ v: VatReturnRow; rows: FileCheck[] } | null>(null)
  /** [PDF › 생성목록] 으로 인쇄할 신고서 — 그려진 뒤 그 DOM 을 인쇄 창에 옮긴다. */
  const [pdf, setPdf] = useState<{ sheet: Sheet; win: Window } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<CompanyInfo | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  }, [])

  async function load() {
    setError('')
    try {
      /* 원본 머리 '귀속연도 : 2025년도 ~ 2026년도' — 지난해와 올해. */
      const r = await api.get<VatReturnRow[]>('/vat-returns', { params: { fromYear: thisYear - 1, toYear: thisYear } })
      setReturns(r.data)
      setPicked(new Set())
    } catch (e) {
      setReturns([]); setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  async function loadWritten(v: VatReturnRow) {
    const r = await api.get<DocSummary[]>(`/vat-returns/${v.id}/docs`)
    setWritten(Object.fromEntries(r.data.map((d) => [d.docCode, d.writtenAt])))
    return r.data
  }

  async function openWin(v: VatReturnRow) {
    setError('')
    try {
      const list = await loadWritten(v)
      const docs = await Promise.all(list.map((d) => api.get<DocStored | ''>(`/vat-returns/${v.id}/docs/${d.docCode}`)))
      setShown(Object.fromEntries(docs.flatMap((r) => r.data
        ? [[r.data.docCode, { at: r.data.writtenAt, filled: filledOf(r.data.docCode, JSON.parse(r.data.data) as Sheet) }]] : [])))
      setWin(v)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  /** 그 기간의 회계전표 · (세금)계산서에서 다시 세어 그 서류로 저장한다 — 원본 [새로불러오기] · 처음 [조회] · 신고서 '다시 작성'. */
  async function writeDoc(code: DocCode): Promise<Sheet | null> {
    if (!win) return null
    try {
      const sheet = await loadVatSheet(win, accounts)
      await api.put(`/vat-returns/${win.id}/docs/${code}`, { data: JSON.stringify(sheet) })
      await loadWritten(win)
      return sheet
    } catch (e) {
      setError(extractErrorMessage(e))
      return null
    }
  }

  async function showDoc(code: DocCode, rewrite: boolean) {
    if (!win) return
    let sheet: Sheet | null = null
    if (!rewrite) {
      const r = await api.get<DocStored | ''>(`/vat-returns/${win.id}/docs/${code}`)
      if (r.data) sheet = JSON.parse(r.data.data) as Sheet
    }
    if (!sheet) sheet = await writeDoc(code)
    if (sheet) setView({ code, sheet })
  }

  /** 원본: 첨부서류를 신고서보다 늦게 만들었으면 신고서 [조회] 때 '다시 작성하시겠습니까?' — [취소] 는 저장된 숫자 그대로. */
  function openDoc(code: DocCode) {
    if (code === 'RETURN' && stale) {
      setAsk({ lines: ['부가가치세 신고서 최종수정일 이후 수정된 첨부서류가 있습니다.', '부가가치세 신고서를 다시 작성하시겠습니까?'],
        yes: () => void showDoc(code, true).catch((e) => setError(extractErrorMessage(e))),
        no: () => void showDoc(code, false).catch((e) => setError(extractErrorMessage(e))) })
      return
    }
    void showDoc(code, false).catch((e) => setError(extractErrorMessage(e)))
  }

  function reloadDoc(code: DocCode) {
    setAsk({ lines: ['선택한 문서를 새로불러오시겠습니까?'], yes: () => void writeDoc(code) })
  }

  async function openHistory(v: VatReturnRow) {
    try {
      const r = await api.get<HistoryRow[]>(`/vat-returns/${v.id}/history`)
      setHistory({ v, rows: r.data })
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  /**
   * 전자파일 생성 전 확인 — 지금은 신고서보다 늦게 만든 첨부서류만 본다(원본 2026-10-20 '0 · 부가가치세신고서 ·
   * 부가세신고서 최종수정일 2026/10/20 (화) 오후 1:28:27 이후로 수정된 서류가 있습니다').
   */
  async function checkFile(v: VatReturnRow) {
    try {
      const r = await api.get<DocSummary[]>(`/vat-returns/${v.id}/docs`)
      const at: Partial<Record<DocCode, string>> = Object.fromEntries(r.data.map((d) => [d.docCode, d.writtenAt]))
      const ret = at.RETURN
      const rows: FileCheck[] = []
      if (ret && ATTACHMENTS.some(([, c]) => (at[c] ?? '') > ret)) {
        rows.push({ no: 0, name: '부가가치세신고서', note: `부가세신고서 최종수정일 ${stamp(ret)} 이후로 수정된 서류가 있습니다` })
      }
      setFileCheck({ v, rows })
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  /** 목록 [PDF › 생성목록] — 원본 '알림 · PDF를 생성하시겠습니까?'. [확인] 이면 저장된 신고서를 인쇄 창으로(우리 PDF = 브라우저 인쇄). */
  async function makePdf(v: VatReturnRow) {
    if (!(await ecConfirm('PDF를 생성하시겠습니까?'))) return
    const win = openPrintWindow()
    if (!win) return
    try {
      const r = await api.get<DocStored | ''>(`/vat-returns/${v.id}/docs/RETURN`)
      const sheet = r.data ? JSON.parse(r.data.data) as Sheet : await loadVatSheet(v, accounts)
      setPdf({ sheet, win })
    } catch (e) {
      win.close()
      setError(extractErrorMessage(e))
    }
  }

  useEffect(() => {
    if (!pdf) return
    const el = document.getElementById('vat-return-pdf')
    if (el) fillAndPrint(pdf.win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${DOC_TITLE.RETURN}</title><style>${PRINT_CSS}</style></head>`
      + `<body>${el.innerHTML}</body></html>`)
    setPdf(null)
  }, [pdf])

  function print() {
    const el = document.getElementById('vat-return-sheet')
    const w = openPrintWindow()
    if (!w || !el || !view) return
    fillAndPrint(w, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${DOC_TITLE[view.code]}</title><style>${PRINT_CSS}</style></head>`
      + `<body>${el.innerHTML}</body></html>`)
  }

  const returnAt = written.RETURN
  /** 신고서보다 늦게 만든 첨부서류가 있나 — 신고서 [조회] 의 '다시 작성' 물음은 지금 상태로. */
  const stale = !!returnAt && ATTACHMENTS.some(([, c]) => (written[c] ?? '') > returnAt)
  /** 창을 연 때 — 경고 줄 · 꼬리표. 신고서가 뒤처졌으면 신고서 꼬리표도 없다(실측). */
  const shownAt = shown.RETURN?.at
  const shownStale = !!shownAt && ATTACHMENTS.some(([, c]) => (shown[c]?.at ?? '') > shownAt)

  const openNew = () => {
    const due = dueOf(initYear, (q + 1) * 3)
    setFormError(''); setConfirmDelete(false)
    setForm({ filingType: 'REGULAR', returnKind: q % 2 === 0 ? 'PRELIM' : 'FINAL', monthly: false, year: initYear, term: q < 2 ? 1 : 2,
      month: (q + 1) * 3, reportDate: due, dueDate: due, taxAgent: false, closure: false })
  }
  const openRow = (v: VatReturnRow) => {
    setFormError(''); setConfirmDelete(false)
    setForm({ id: v.id, filingType: v.filingType, returnKind: v.returnKind === 'MONTHLY' ? 'PRELIM' : v.returnKind, monthly: v.returnKind === 'MONTHLY',
      year: v.year, term: v.monthFrom <= 6 ? 1 : 2, month: v.monthFrom, reportDate: v.reportDate, dueDate: v.dueDate, taxAgent: v.taxAgent, closure: v.closure })
  }
  const set = (patch: Partial<ReturnForm>) => form && setForm({ ...form, ...patch })

  async function save() {
    if (!form) return
    const body = { filingType: form.filingType, returnKind: form.monthly ? 'MONTHLY' : form.returnKind, year: form.year,
      term: form.monthly ? null : form.term, month: form.monthly ? form.month : null,
      reportDate: form.reportDate, dueDate: form.dueDate, taxAgent: form.taxAgent, closure: form.closure }
    try {
      if (form.id) await api.put(`/vat-returns/${form.id}`, body)
      else {
        const r = await api.post<VatReturnRow>('/vat-returns', body)
        /* 원본: [저장] 하면 매출 · 매입세금계산서와 신고서를 그 자리에서 만든다(2026-10-20 이력 — 저장 1초 안에 셋 다 '신규'). */
        const sheet = await loadVatSheet(r.data, accounts)
        for (const code of ['SALES_INVOICE', 'PURCHASE_INVOICE', 'RETURN'] as const) {
          await api.put(`/vat-returns/${r.data.id}/docs/${code}`, { data: JSON.stringify(sheet) })
        }
      }
      setForm(null)
      await load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function removePicked() {
    try {
      await api.post('/vat-returns/delete', [...picked])
      setConfirmDelete(false)
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const allPicked = returns.length > 0 && returns.every((r) => picked.has(r.id))
  const locked = !!form?.id
  const periodValue = form ? `${form.term}${form.returnKind}` : ''

  return (
    <EcListShell title="부가가치세신고서(일반)" option={false} onNew={openNew}
                 actions={[{ label: '선택삭제', onClick: () => setConfirmDelete(true), selected: picked.size }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {confirmDelete && (
        <div className="ec-alert mb-[8px] flex items-center gap-[6px]">
          삭제한 데이터는 복구되지 않습니다. 삭제하겠습니까?
          <button className="ec-btn ec-btn-primary" onClick={() => void removePicked()}>확인</button>
          <button className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      )}
      <p className="text-right mb-[4px]">귀속연도 : {thisYear - 1}년도 ~ {thisYear}년도</p>

      <table className="w-full mb-[12px]">
        <thead>
          <tr>
            <th className="w-[25px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(returns.map((r) => r.id)))} />
            </th>
            <th className="w-[180px] text-center">신고기간</th>
            <th className="w-[60px] text-center">예정누락<br />포함여부</th>
            <th className="w-[200px] text-center">회사명</th>
            {/* 원본 2026-10-20: 신고서등 · 휴폐업조회 · 영수증서 · 전자파일 · PDF · 이력 — 각 100 */}
            <th className="w-[100px] text-center">신고서등</th>
            <th className="w-[100px] text-center">휴폐업조회</th>
            <th className="w-[100px] text-center">영수증서</th>
            <th className="w-[100px] text-center">전자파일</th>
            <th className="w-[100px] text-center">PDF</th>
            <th className="w-[100px] text-center">이력</th>
          </tr>
        </thead>
        <tbody>
          {returns.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : returns.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center whitespace-nowrap">
                <input type="checkbox" aria-label={`${r.periodName} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td className="text-center"><button className="ec-link" onClick={() => openRow(r)}>{r.periodName}</button></td>
              <td className="text-center">{r.includesOmitted ? 'YES' : 'NO'}</td>
              <td className="text-center">{company?.name ?? ''}</td>
              <td className="text-center"><button className="ec-link" onClick={() => void openWin(r)}>조회</button></td>
              {/* 휴폐업조회 · 영수증서는 원본이 국세청 조회 · 인쇄 창이라 재지 못했다(plans/세무/E200928.md) — 누르면 그렇게 알린다. */}
              <td className="text-center"><button className="ec-link" onClick={() => void ecAlert('휴폐업조회는 국세청 조회가 필요해 이 시스템에서는 할 수 없습니다.')}>조회</button></td>
              <td className="text-center"><button className="ec-link" onClick={() => void ecAlert('영수증서(납부서) 인쇄는 아직 없습니다.')}>인쇄</button></td>
              <td className="text-center"><button className="ec-link" onClick={() => void checkFile(r)}>생성목록</button></td>
              <td className="text-center"><button className="ec-link" onClick={() => void makePdf(r)}>생성목록</button></td>
              <td className="text-center"><button className="ec-link" onClick={() => void openHistory(r)}>이력</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {win && (
        <Modal open error={error} title="부가세신고서(첨부서류)" width={900} onClose={() => { setWin(null); setView(null) }}>
          <table className="w-full mb-[6px]">
            <thead>
              <tr><th className="text-center">신고기간</th><th className="text-center">사업자등록번호</th><th className="text-center">예정누락기간</th>
                <th className="text-center">신고(작성)일자</th><th className="text-center">납부기한</th></tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">{win.periodName}</td><td className="text-center">{company?.bizRegNo ?? ''}</td>
                <td className="text-center">{omittedOf(win)}</td>
                <td className="text-center">{win.reportDate.replace(/-/g, '/')}</td><td className="text-center">{win.dueDate.replace(/-/g, '/')}</td>
              </tr>
            </tbody>
          </table>
          {shownStale && shownAt && (
            <p className="text-[var(--ec-text-danger)] mb-[6px]">부가세신고서 최종수정일 {stamp(shownAt)} 이후로 수정된 서류가 있습니다.</p>
          )}
          <table className="w-full mb-[6px]">
            <thead><tr><th>신고서</th><th className="text-center w-[90px]">조회</th><th className="text-center w-[110px]">새로불러오기</th></tr></thead>
            <tbody>
              <DocRow no={1} name="부가가치세신고서" written={!!shown.RETURN?.filled && !shownStale} onOpen={() => openDoc('RETURN')} onReload={() => reloadDoc('RETURN')} />
            </tbody>
          </table>
          <table className="w-full">
            <thead><tr><th>첨부서류명</th><th className="text-center w-[90px]">조회</th><th className="text-center w-[110px]">새로불러오기</th></tr></thead>
            <tbody>
              {ATTACHMENTS.map(([no, code, name]) => (
                <DocRow key={code} no={no} name={name} written={!!shown[code]?.filled} onOpen={() => openDoc(code)} onReload={() => reloadDoc(code)} />
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn" onClick={() => { setWin(null); setView(null) }}>닫기</button>
          </div>
        </Modal>
      )}

      {view && (
        <Modal open error={error} title={DOC_TITLE[view.code]} width={900} onClose={() => setView(null)}>
          <div id="vat-return-sheet">
            {view.code === 'RETURN' && <ReturnSheet s={view.sheet} c={company} />}
            {view.code === 'SALES_INVOICE' && <InvoiceSummarySheet side="매출" s={view.sheet} c={company} invoices={view.sheet.salesInvoices} />}
            {view.code === 'PURCHASE_INVOICE' && <InvoiceSummarySheet side="매입" s={view.sheet} c={company} invoices={view.sheet.purchaseInvoices} />}
            {view.code === 'CARD_SALES' && <CardSalesSheet s={view.sheet} c={company} />}
            {view.code === 'CARD_RECEIPT' && <CardReceiptSheet s={view.sheet} c={company} />}
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn" onClick={print}>인쇄</button>
            <button className="ec-btn" onClick={() => setView(null)}>닫기</button>
          </div>
        </Modal>
      )}

      {pdf && <div id="vat-return-pdf" className="hidden"><ReturnSheet s={pdf.sheet} c={company} /></div>}

      {history && (
        <Modal open error={error} title="부가세신고서 이력보기" width={673} onClose={() => setHistory(null)}>
          <table className="w-full">
            <thead>
              <tr><th className="w-[31px]" /><th className="w-[82px] text-center">작업자ID</th><th className="w-[204px] text-center">작업일시</th>
                <th className="w-[255px] text-center">신고서종류</th><th className="w-[82px] text-center">행위</th></tr>
            </thead>
            <tbody>
              {history.rows.length === 0 ? (
                <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : history.rows.map((h, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td className="text-center">{h.changedBy ?? ''}</td>
                  <td className="text-center">{stamp(h.changedAt)}</td>
                  <td>{h.docCode === 'INFO' ? `${history.v.periodName}-${company?.name ?? ''}` : DOC_TITLE[h.docCode] ?? h.docCode}</td>
                  <td className="text-center">{h.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn" onClick={() => setHistory(null)}>닫기</button>
          </div>
        </Modal>
      )}

      {fileCheck && (
        <Modal open error={error} title="전자파일 첨부서류 확인리스트" width={673} onClose={() => setFileCheck(null)}>
          <table className="w-full">
            <thead><tr><th className="w-[50px] text-center">순번</th><th className="w-[200px]">부가세신고 첨부서류명</th><th>전자파일 생성전 확인사항</th></tr></thead>
            <tbody>
              {fileCheck.rows.length === 0 ? (
                <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : fileCheck.rows.map((f) => (
                <tr key={f.no}><td className="text-center">{f.no}</td><td>{f.name}</td><td>{f.note}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            {/* 전자파일(국세청 전자신고 파일)은 만들지 않는다 — 과세자료전산매체도 같다. */}
            <button className="ec-btn ec-btn-primary" onClick={() => void ecAlert('전자신고 파일은 이 시스템에서 만들지 않습니다.')}>강제생성</button>
            <button className="ec-btn" onClick={() => void checkFile(fileCheck.v)}>재검증</button>
            <button className="ec-btn" onClick={() => setFileCheck(null)}>닫기</button>
          </div>
        </Modal>
      )}

      {ask && (
        <Modal open error={error} title="알림" width={480} onClose={() => setAsk(null)}>
          {ask.lines.map((l) => <p key={l}>{l}</p>)}
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={() => { const y = ask.yes; setAsk(null); y() }}>확인</button>
            <button className="ec-btn" onClick={() => { const n = ask.no; setAsk(null); n?.() }}>취소</button>
          </div>
        </Modal>
      )}

      {form && (
        <Modal open error={formError} title="부가가치세신고서(일반)" width={780} onClose={() => setForm(null)}>
          <ul className="ec-form [&>li>.title]:basis-[120px]">
            <EcCond label="신고구분" span={2}>
              {([['REGULAR', '정기신고'], ['LATE', '기한후신고']] as const).map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
                  <input type="radio" name="vat-filing" checked={form.filingType === v} onChange={() => set({ filingType: v })} /> {l}
                </label>
              ))}
            </EcCond>
            <EcCond label="세무신고사업장" span={2}>
              <select className="ec-input w-full" disabled><option>{[company?.name, company?.bizRegNo].filter(Boolean).join(' ')}</option></select>
            </EcCond>
            <EcCond label="신고서종류" span={2}>
              <div className="flex flex-col items-start gap-[4px] w-full">
                <div>
                  {([[false, '예정/확정'], [true, '월별신고(조기환급)']] as const).map(([v, l]) => (
                    <label key={l} className="inline-flex items-center gap-[3px] mr-[10px]">
                      <input type="radio" name="vat-kind" disabled={locked} checked={form.monthly === v} onChange={() => set({ monthly: v })} /> {l}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-[6px] w-full">
                  신고기간
                  <select className="ec-input w-[120px]" aria-label="신고연도" disabled={locked} value={form.year} onChange={(e) => set({ year: Number(e.target.value) })}>
                    {[thisYear, thisYear - 1].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  {form.monthly ? (
                    <select className="ec-input flex-1" aria-label="신고월" disabled={locked} value={form.month} onChange={(e) => set({ month: Number(e.target.value) })}>
                      {Array.from({ length: 12 }, (_, k) => k + 1).map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}월</option>)}
                    </select>
                  ) : (
                    <select className="ec-input flex-1" aria-label="신고기" disabled={locked} value={periodValue}
                            onChange={(e) => set({ term: Number(e.target.value[0]) as Term, returnKind: e.target.value.slice(1) as 'PRELIM' | 'FINAL' })}>
                      {TERM_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  )}
                </label>
                <span>예정누락 {!form.monthly && form.returnKind === 'FINAL'
                  ? `${String((form.term - 1) * 6 + 1).padStart(2, '0')}월 ~ ${String((form.term - 1) * 6 + 3).padStart(2, '0')}월` : '=== ~ ==='}</span>
                {/* 원본 2026-10-13: 예정 · 확정 모두 막힌 ◉제출 ○미제출(다른 때 풀리는지는 못 잼). */}
                <span>계산서합계표{' '}
                  <label className="inline-flex items-center gap-[3px] mr-[10px]"><input type="radio" disabled checked readOnly /> 제출</label>
                  <label className="inline-flex items-center gap-[3px]"><input type="radio" disabled checked={false} readOnly /> 미제출</label>
                </span>
              </div>
            </EcCond>
            <EcCond label="신고작성일자" span={2}>
              <EcDateInput className="ec-input w-[150px]" value={form.reportDate} onChange={(e) => set({ reportDate: e.target.value })} />
            </EcCond>
            <EcCond label="납부기한" span={2}>
              <EcDateInput className="ec-input w-[150px]" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
            </EcCond>
            {([['taxAgent', '세무대리인 여부'], ['closure', '폐업신고 여부']] as const).map(([key, l]) => (
              <EcCond key={key} label={l} span={2}>
                {([[true, '여'], [false, '부']] as const).map(([v, t]) => (
                  <label key={t} className="inline-flex items-center gap-[3px] mr-[10px]">
                    <input type="radio" name={`vat-${key}`} checked={form[key] === v} onChange={() => set({ [key]: v })} /> {t}
                  </label>
                ))}
              </EcCond>
            ))}
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
            <button className="ec-btn" onClick={() => setForm(null)}>닫기</button>
          </div>
        </Modal>
      )}
    </EcListShell>
  )
}

/** 원본 [신고서등] 창 한 줄 — 자료가 든 서류는 [조회] 가 주황 꼬리표(2026-10-13 실측 --ec-bg-tag). */
function DocRow({ no, name, written, onOpen, onReload }: { no: number; name: string; written: boolean; onOpen: () => void; onReload: () => void }) {
  return (
    <tr>
      <td>{no} {name}</td>
      <td className="text-center">
        <button className={written ? 'rounded-[6px] px-[4px] bg-[var(--ec-bg-tag)] text-white' : 'ec-link'} onClick={onOpen}>조회</button>
      </td>
      <td className="text-center"><button className="ec-link" onClick={onReload}>새로불러오기</button></td>
    </tr>
  )
}

/** 예정누락기간 — 확정이면 그 기의 예정 석 달. */
function omittedOf(v: VatReturnRow) {
  if (v.returnKind !== 'FINAL') return ''
  const first = v.monthFrom <= 6 ? 1 : 7
  return `${v.year}/${String(first).padStart(2, '0')} ~ ${v.year}/${String(first + 2).padStart(2, '0')}`
}

/** 원본 '2026/10/13 (화) 오후 3:47:15'. */
function stamp(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  const h = d.getHours()
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} (${'일월화수목금토'[d.getDay()]}) ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function ReturnSheet({ s, c }: { s: Sheet; c: CompanyInfo | null }) {
  const p = s
  const sales = add(add(s.taxInvoice, s.cardSales), s.zeroInvoice)
  const purchase = add(add(s.purchaseGeneral, s.purchaseFixed), s.otherPurchase)
  /* 예전에 저장한 신고서는 (44) · (45) 를 안 나눠 들고 있다 — (15) 를 (44) 로. */
  const cards = s.cards ?? { ...CARDS0, general: s.otherPurchase }
  const payable = sales.vat - purchase.vat
  const address = [c?.address, c?.addressDetail].filter(Boolean).join(' ')
  /* 원본 칸 하나 — [구분 · (번호) · 금액 · 세율 · 세액]. 세율이 없는 칸은 비운다. */
  const line = (label: string, no: string, a: Amt | null, rate: string, vatOnly = false, mark = '') => (
    <tr key={no}>
      <td>{label}</td><td className="text-center">{no}</td>
      <td className="text-right">{vatOnly ? '' : fmtAmount(a?.supply ?? 0)}</td>
      <td className="text-center">{rate}</td>
      <td className="text-right">{mark}{fmtAmount(a?.vat ?? 0)}</td>
    </tr>
  )
  return (
    <>
      <p>■ 부가가치세법 시행규칙 [별지 제21호서식]</p>
      <p className="ec-report-title mb-[8px]">일반과세자 부가가치세 [{s.kind === '예정' ? 'v' : ' '}] 예정 [{s.kind === '확정' ? 'v' : ' '}] 확정 신고서</p>
      <table className="w-full ec-report mb-[8px]">
        <tbody>
          <tr><th>신고기간</th><td colSpan={5}>{s.year} 년 제 {s.term} 기 ({pad2(p.first)}월 01일 ~ {pad2(p.last)}월 {pad2(p.end)}일)</td></tr>
          <tr>
            <th>상호(법인명)</th><td>{c?.name ?? ''}</td><th>성명(대표자명)</th><td>{c?.ceo ?? ''}</td>
            <th>사업자등록번호</th><td>{c?.bizRegNo ?? ''}</td>
          </tr>
          <tr>
            <th>전화번호</th><td>{c?.tel ?? ''}</td><th>사업장주소</th><td>{address}</td><th>전자우편주소</th><td>{c?.email ?? ''}</td>
          </tr>
        </tbody>
      </table>

      <p className="mb-[4px]">① 신 고 내 용</p>
      <table className="w-full ec-report mb-[8px]">
        <thead>
          <tr><th>구 분</th><th className="text-center">번호</th><th className="text-right">금 액</th><th className="text-center">세 율</th><th className="text-right">세 액</th></tr>
        </thead>
        <tbody>
          {line('과세 · 세금계산서발급분', '(1)', s.taxInvoice, '10/100')}
          {line('과세 · 매입자발행세금계산서', '(2)', ZERO, '10/100')}
          {line('과세 · 신용카드ㆍ현금영수증발행분', '(3)', s.cardSales, '10/100')}
          {line('과세 · 기타(정규영수증외매출분)', '(4)', ZERO, '')}
          {line('영세율 · 세금계산서발급분', '(5)', s.zeroInvoice, '0/100')}
          {line('영세율 · 기타', '(6)', ZERO, '0/100')}
          {line('예정신고누락분', '(7)', ZERO, '')}
          {line('대손세액가감', '(8)', ZERO, '', true)}
          {line('합계', '(9)', sales, '', false, '㉮ ')}
          {line('세금계산서수취분 · 일반매입', '(10)', s.purchaseGeneral, '')}
          {line('세금계산서수취분 · 수출기업 수입분 납부유예', '(11)', ZERO, '', true)}
          {line('세금계산서수취분 · 고정자산매입', '(12)', s.purchaseFixed, '')}
          {line('예정신고누락분', '(13)', ZERO, '')}
          {line('매입자발행세금계산서', '(14)', ZERO, '')}
          {line('그 밖의 공제매입세액', '(15)', s.otherPurchase, '')}
          {line('합계 ((10)-(11)+(12)+(13)+(14)+(15))', '(16)', purchase, '')}
          {line('공제받지 못할 매입세액', '(17)', ZERO, '')}
          {line('차감계 ((16)-(17))', '(18)', purchase, '', false, '㉯ ')}
          <tr className="ec-total">
            <td colSpan={4} className="font-bold">납부(환급)세액 (매출세액 ㉮ - 매입세액 ㉯)</td>
            <td className="text-right font-bold">㉰ {fmtAmount(payable)}</td>
          </tr>
          {line('경감ㆍ공제세액 · 그 밖의 경감ㆍ공제세액', '(19)', ZERO, '', true)}
          {line('경감ㆍ공제세액 · 신용카드매출전표등 발행공제등', '(20)', ZERO, '')}
          {line('경감ㆍ공제세액 · 합계', '(21)', ZERO, '', true, '㉱ ')}
          {line('소규모 개인사업자 부가가치세 감면세액', '(22)', ZERO, '', true, '㉲ ')}
          {line('예정신고미환급세액', '(23)', ZERO, '', true, '㉳ ')}
          {line('예정고지세액', '(24)', ZERO, '', true, '㉴ ')}
          {line('수시부과세액', '(25)', ZERO, '', true, '㉵ ')}
          {line('사업양수자의 대리납부 기납부세액', '(26)', ZERO, '', true, '㉶ ')}
          {line('매입자 납부특례 기납부세액', '(27)', ZERO, '', true, '㉷ ')}
          {line('신용카드업자의 대리납부 기납부세액', '(28)', ZERO, '', true, '㉸ ')}
          {line('가산세액계', '(29)', ZERO, '', true, '㉹ ')}
          <tr className="ec-total">
            <td className="font-bold">차감ㆍ가감하여 납부할 세액(환급받을 세액)</td><td className="text-center">(30)</td>
            <td colSpan={2} /><td className="text-right font-bold">{fmtAmount(payable)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mb-[4px]">④ 과 세 표 준 명 세</p>
      <table className="w-full ec-report">
        <thead>
          <tr><th className="text-center">번호</th><th>업 태</th><th>종 목</th><th className="text-right">금 액</th></tr>
        </thead>
        <tbody>
          <tr><td className="text-center">(31)</td><td>{c?.bizType ?? ''}</td><td>{c?.bizItem ?? ''}</td><td className="text-right">{fmtAmount(sales.supply)}</td></tr>
          <tr><td className="text-center">(34)</td><td>수입금액제외</td><td></td><td className="text-right"></td></tr>
          <tr className="ec-total"><td className="text-center">(35)</td><td colSpan={2} className="font-bold">합 계</td><td className="text-right font-bold">{fmtAmount(sales.supply)}</td></tr>
        </tbody>
      </table>

      {/* 뒤쪽 — 원본 2026 2기 예정 실측: ⑦ 예정신고누락분 명세 (36)~(43) · (15) 그 밖의 공제매입세액 명세 (44)~(52) ·
          (17) 공제받지 못할 매입세액 명세 (53)~(56). 우리 자료로 차는 것은 (44) · (45) · (52) 뿐이다. */}
      <p className="mt-[8px] mb-[4px]">⑦ 예정신고누락분 명세</p>
      <table className="w-full ec-report mb-[8px]">
        <thead>
          <tr><th>구 분</th><th className="text-center">번호</th><th className="text-right">금 액</th><th className="text-center">세 율</th><th className="text-right">세 액</th></tr>
        </thead>
        <tbody>
          {line('매출 · 과세 · 세금계산서', '(36)', ZERO, '10/100')}
          {line('매출 · 과세 · 기타', '(37)', ZERO, '10/100')}
          {line('매출 · 영세율 · 세금계산서', '(38)', ZERO, '0/100')}
          {line('매출 · 영세율 · 기타', '(39)', ZERO, '0/100')}
          {line('매출 · 합계', '(40)', ZERO, '')}
          {line('매입 · 세금계산서', '(41)', ZERO, '')}
          {line('매입 · 그 밖의 공제매입세액', '(42)', ZERO, '')}
          {line('매입 · 합계', '(43)', ZERO, '')}
        </tbody>
      </table>
      <p className="mb-[4px]">(15) 그 밖의 공제매입세액 명세</p>
      <table className="w-full ec-report mb-[8px]">
        <thead>
          <tr><th>구 분</th><th className="text-center">번호</th><th className="text-right">금 액</th><th className="text-center">세 율</th><th className="text-right">세 액</th></tr>
        </thead>
        <tbody>
          {line('신용카드매출전표등 수령명세서제출분 · 일반매입', '(44)', cards.general, '')}
          {line('신용카드매출전표등 수령명세서제출분 · 고정자산매입', '(45)', cards.fixed, '')}
          {line('의제매입세액', '(46)', ZERO, '뒤쪽참조')}
          {line('재활용폐자원등 매입세액', '(47)', ZERO, '뒤쪽참조')}
          {line('과세사업전환 매입세액', '(48)', ZERO, '', true)}
          {line('재고매입세액', '(49)', ZERO, '', true)}
          {line('변제대손세액', '(50)', ZERO, '', true)}
          {line('외국인 관광객에 대한 환급세액', '(51)', ZERO, '', true)}
          {line('합계', '(52)', add(cards.general, cards.fixed), '')}
        </tbody>
      </table>
      <p className="mb-[4px]">(17) 공제받지 못할 매입세액 명세</p>
      <table className="w-full ec-report">
        <thead>
          <tr><th>구 분</th><th className="text-center">번호</th><th className="text-right">금 액</th><th className="text-center">세 율</th><th className="text-right">세 액</th></tr>
        </thead>
        <tbody>
          {line('공제받지 못할 매입세액', '(53)', ZERO, '')}
          {line('공통매입세액 면세사업분', '(54)', ZERO, '')}
          {line('대손처분받은 세액', '(55)', ZERO, '')}
          {line('합계', '(56)', ZERO, '')}
        </tbody>
      </table>
    </>
  )
}

/** 첨부서류 머리 — 제출자 인적사항 줄. */
function Submitter({ rows }: { rows: [string, string][][] }) {
  return (
    <table className="w-full ec-report mb-[8px]">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map(([k, v], j) => [<th key={`h${j}`}>{k}</th>, <td key={`d${j}`}>{v}</td>])}</tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * 첨부서류 6 — <b>신용카드 매출전표 등 발행금액 집계표</b>([별지 제23호서식]) — 2026-10-13 loginaa 2기 예정 실측(CardTally 주석).
 * 2. 발행금액 현황 [⑤ 합계 · ⑥ 신용·직불·기명식 선불카드 · ⑦ 현금영수증 · ⑧ 직불·기명식 선불전자지급수단] ×
 * [합계 · 과세 매출분 · 면세 매출분 · 봉사료], 3. ⑨ 세금계산서 발급금액 · ⑩ 계산서 발급금액. 빈 칸도 0 을 찍는다.
 */
export function CardSalesSheet({ s, c }: { s: Sheet; c: CompanyInfo | null }) {
  const k = s.cards ?? CARDS0
  const address = [c?.address, c?.addressDetail].filter(Boolean).join(' ')
  const rowOf = (label: string, card: number, cash: number, bold = false) => (
    <tr key={label} className={bold ? 'ec-total' : undefined}>
      <td className="text-center">{label}</td>
      <td className="text-right">{fmtAmount(card + cash)}</td><td className="text-right">{fmtAmount(card)}</td>
      <td className="text-right">{fmtAmount(cash)}</td><td className="text-right">0</td>
    </tr>
  )
  return (
    <>
      <p>■ 부가가치세법 시행규칙 [별지 제23호서식]</p>
      <p className="ec-report-title">신용카드 매출전표 등 발행금액 집계표</p>
      <p className="text-center mb-[8px]">{s.year}년 제 {s.term}기 ({pad2(s.first)}월 01일 ~ {pad2(s.last)}월 {pad2(s.end)}일)</p>
      <p className="mb-[4px]">1. 제출자 인적사항</p>
      <Submitter rows={[[['① 상호(법인명)', c?.name ?? ''], ['② 성명(대표자)', c?.ceo ?? '']],
        [['③ 사업장소재지', address], ['④ 사업자등록번호', c?.bizRegNo ?? '']]]} />
      <p className="mb-[4px]">2. 신용카드매출전표 등 발행금액 현황</p>
      <table className="w-full ec-report mb-[8px]">
        <thead>
          <tr><th className="text-center">구 분</th><th className="text-right">⑤ 합 계</th><th className="text-right">⑥ 신용·직불·기명식 선불카드</th>
            <th className="text-right">⑦ 현금영수증</th><th className="text-right">⑧ 직불·기명식 선불전자지급수단</th></tr>
        </thead>
        <tbody>
          {rowOf('합 계', k.saleCard + k.saleCardFree, k.saleCash + k.saleCashFree, true)}
          {rowOf('과세 매출분', k.saleCard, k.saleCash)}
          {rowOf('면세 매출분', k.saleCardFree, k.saleCashFree)}
          {rowOf('봉 사 료', 0, 0)}
        </tbody>
      </table>
      <p className="mb-[4px]">3. 신용카드매출전표등 발행금액(⑤합계) 중 세금계산서(계산서) 발급명세</p>
      <table className="w-full ec-report">
        <tbody>
          <tr><th>⑨ 세금계산서 발급금액</th><td className="text-right">0</td><th>⑩ 계산서 발급금액</th><td className="text-right">0</td></tr>
        </tbody>
      </table>
    </>
  )
}

/**
 * 첨부서류 15 — <b>신용카드매출전표등 수령명세서(갑)</b>([별지 제16호서식(1)]) — 2026-10-13 loginaa 2기 예정 실측.
 * 2. 매입내역 합계 [거래건수 · 공급가액 · 세액] — ④ 합계(0 도 찍는다) · ⑤ 현금영수증 · ⑥ 화물운전자복지카드 · ⑦ 사업용 신용카드 ·
 * ⑧ 그 밖의 신용카드 등(값이 없으면 칸을 비운다). 3. 그 밖의 신용카드 등 카드회원번호별 명세 — 카드번호를 안 들고 있어 비어 있다.
 */
export function CardReceiptSheet({ s, c }: { s: Sheet; c: CompanyInfo | null }) {
  const k = s.cards ?? CARDS0
  const sum: Cnt = { n: k.recvCash.n + k.recvCard.n, supply: k.recvCash.supply + k.recvCard.supply, vat: k.recvCash.vat + k.recvCard.vat }
  const rowOf = (label: string, x: Cnt | null, always = false) => {
    const show = always || (x != null && x.n > 0)
    return (
      <tr key={label} className={always ? 'ec-total' : undefined}>
        <td>{label}</td>
        <td className="text-right">{show && x ? fmtAmount(x.n) : ''}</td>
        <td className="text-right">{show && x ? fmtAmount(x.supply) : ''}</td>
        <td className="text-right">{show && x ? fmtAmount(x.vat) : ''}</td>
      </tr>
    )
  }
  return (
    <>
      <p>■ 부가가치세법 시행규칙 [별지 제16호서식(1)]</p>
      <p className="ec-report-title">신용카드 매출전표등 수령명세서(갑)</p>
      <p className="text-center mb-[8px]">{s.year}년 제 {s.term}기 ({pad2(s.first)}월 01일 ~ {pad2(s.last)}월 {pad2(s.end)}일)</p>
      <p className="mb-[4px]">1. 제출자 인적사항</p>
      <Submitter rows={[[['① 상 호 (법인명)', c?.name ?? ''], ['② 사업자등록번호', c?.bizRegNo ?? '']],
        [['③ 성 명 (대표자)', c?.ceo ?? ''], ['', '']]]} />
      <p className="mb-[4px]">2. 신용카드 등 매입내역 합계</p>
      <table className="w-full ec-report mb-[8px]">
        <thead><tr><th>구 분</th><th className="text-right">거래건수</th><th className="text-right">공급가액</th><th className="text-right">세 액</th></tr></thead>
        <tbody>
          {rowOf('④ 합 계', sum, true)}
          {rowOf('⑤ 현금영수증', k.recvCash)}
          {rowOf('⑥ 화물운전자복지카드', null)}
          {rowOf('⑦ 사업용 신용카드', k.recvCard)}
          {rowOf('⑧ 그 밖의 신용카드 등', null)}
        </tbody>
      </table>
      <p className="mb-[4px]">3. 그 밖의 신용ㆍ직불카드, 기명식선불카드, 직불전자지급수단 및 기명식선불전자지급수단 매출전표 수령금액 합계</p>
      <table className="w-full ec-report">
        <thead>
          <tr><th className="text-center">일련번호</th><th>⑨ 카드회원번호</th><th>⑩ 공급자(가맹점) 사업자등록번호</th>
            <th className="text-right">거래건수</th><th className="text-right">공급가액</th><th className="text-right">세액</th></tr>
        </thead>
        <tbody>
          <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
        </tbody>
      </table>
    </>
  )
}

/**
 * 첨부서류 1 · 2 — <b>매출처별세금계산서합계표 (갑)</b>([별지 제38호서식(2)]) · 매입처별 — 원본 2026 2기 예정 실측.
 * 1. 제출자 인적사항, 2. 총합계 [매출처수 · 매수 · 공급가액 · 세액] — 합계 / 전자세금계산서 발급분(사업자등록번호 · 주민등록번호 · 소계) /
 * 그 외 발급분(같은 셋), 3. 그 외 발급분의 거래처별 명세. 원본 2기 예정 매출 10곳 · 19매 · 396,450,000 · 39,645,000 이 모두 전자.
 */
export function InvoiceSummarySheet({ side, s, c, invoices, written }: {
  side: '매출' | '매입'; s: Sheet; c: CompanyInfo | null; invoices: Invoice[]
  /** ⑥작성일 — 과세자료전산매체(E030208)는 신고작성일자를 싣는다('2026년 10월 25일'). */
  written?: string
}) {
  const p = s
  const who = side === '매출' ? '매출처' : '매입처'
  const tally = (list: Invoice[]) => ({
    partners: new Set(list.map((i) => i.partnerId ?? i.partner)).size, count: list.length,
    supply: list.reduce((a, i) => a + i.supply, 0), vat: list.reduce((a, i) => a + i.vat, 0),
  })
  const row = (label: string, list: Invoice[], key: string, bold = false) => {
    const t = tally(list)
    const cls = bold ? 'text-right font-bold' : 'text-right'
    return (
      <tr key={key}>
        <td className={bold ? 'font-bold' : undefined}>{label}</td>
        <td className={cls}>{t.partners || ''}</td><td className={cls}>{t.count || ''}</td>
        <td className={cls}>{t.count ? fmtAmount(t.supply) : ''}</td><td className={cls}>{t.count ? fmtAmount(t.vat) : ''}</td>
      </tr>
    )
  }
  const elec = invoices.filter((i) => i.electronic)
  const other = invoices.filter((i) => !i.electronic)
  const byPartner = [...other.reduce((m, i) => {
    const k = String(i.partnerId ?? i.partner)
    const r = m.get(k) ?? { bizNo: i.bizNo, name: i.partner, count: 0, supply: 0, vat: 0 }
    r.count += 1; r.supply += i.supply; r.vat += i.vat
    return m.set(k, r)
  }, new Map<string, { bizNo: string; name: string; count: number; supply: number; vat: number }>()).values()]
  const address = [c?.address, c?.addressDetail].filter(Boolean).join(' ')
  return (
    <>
      <p>■ 부가가치세법 시행규칙 [별지 제38호서식(2)]</p>
      <p className="ec-report-title">{who}별세금계산서합계표 (갑)</p>
      <p className="text-center mb-[8px]">{s.year}년 제 {s.term}기 ({pad2(p.first)}월 01일 ~ {pad2(p.last)}월 {pad2(p.end)}일)</p>
      <p className="mb-[4px]">1. 제출자 인적사항</p>
      <table className="w-full ec-report mb-[8px]">
        <tbody>
          <tr><th>①사업자등록번호</th><td>{c?.bizRegNo ?? ''}</td><th>②상호(법인명)</th><td>{c?.name ?? ''}</td></tr>
          <tr><th>③성명(대표자)</th><td>{c?.ceo ?? ''}</td><th>④사업장소재지</th><td>{address}</td></tr>
          <tr><th>⑤거래기간</th><td>{s.year}년 {pad2(p.first)}월 01일 ~ {s.year}년 {pad2(p.last)}월 {pad2(p.end)}일</td><th>⑥작성일</th><td>{written ?? ''}</td></tr>
        </tbody>
      </table>
      <p className="mb-[4px]">2. {side}세금계산서 총합계</p>
      <table className="w-full ec-report mb-[8px]">
        <thead>
          <tr><th>구 분</th><th className="text-right">⑦ {who}수</th><th className="text-right">⑧ 매수</th><th className="text-right">⑨ 공급가액</th><th className="text-right">⑩ 세액</th></tr>
        </thead>
        <tbody>
          {row('합 계', invoices, 'all', true)}
          {row('전자세금계산서 발급분 · 사업자등록번호 발급분', elec.filter((i) => !i.personal), 'e-biz')}
          {row('전자세금계산서 발급분 · 주민등록번호 발급분', elec.filter((i) => i.personal), 'e-per')}
          {row('전자세금계산서 발급분 · 소 계', elec, 'e-sum', true)}
          {row('위 전자세금계산서 외의 발급분 · 사업자등록번호 발급분', other.filter((i) => !i.personal), 'o-biz')}
          {row('위 전자세금계산서 외의 발급분 · 주민등록번호 발급분', other.filter((i) => i.personal), 'o-per')}
          {row('위 전자세금계산서 외의 발급분 · 소 계', other, 'o-sum', true)}
        </tbody>
      </table>
      <p className="mb-[4px]">3. 전자세금계산서 외 발급분 {who}별 명세(합계금액으로 적음)</p>
      <table className="w-full ec-report">
        <thead>
          <tr><th className="text-center">⑪ 번호</th><th>⑫ 사업자등록번호</th><th>⑬ 상호(법인명)</th><th className="text-right">⑭ 매수</th><th className="text-right">⑮ 공급가액</th><th className="text-right">⑯ 세액</th><th>비고</th></tr>
        </thead>
        <tbody>
          {byPartner.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : byPartner.map((r, i) => (
            <tr key={i}>
              <td className="text-center">{i + 1}</td><td>{r.bizNo}</td><td>{r.name}</td>
              <td className="text-right">{r.count}</td><td className="text-right">{fmtAmount(r.supply)}</td><td className="text-right">{fmtAmount(r.vat)}</td><td></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

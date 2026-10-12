import { useEffect, useState } from 'react'
import { vatSlipAmounts } from '../../utils/vatSlip'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { fillAndPrint, openPrintWindow } from '../../utils/print'
import type { JournalEntry } from '../../types/api'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
export interface AccountOpt { code: string; detailCategory: string | null }
interface PartnerOpt { id: number; name: string; bizRegNo: string | null }
interface Mark { journalEntryId: number; docKind: string; progress: string }
/** 합계표 한 장의 계산서 한 장 — 거래처 · 전자 여부 · 금액. */
interface Invoice { partnerId: number | null; partner: string; bizNo: string; personal: boolean; electronic: boolean; supply: number; vat: number }
type Doc = '부가가치세신고서' | '매출세금계산서' | '매입세금계산서'
const DOCS: Doc[] = ['부가가치세신고서', '매출세금계산서', '매입세금계산서']
export interface CompanyInfo {
  name?: string; ceo?: string; bizRegNo?: string; bizType?: string; bizItem?: string
  tel?: string; email?: string; address?: string; addressDetail?: string
}
type Term = 1 | 2
type Kind = '예정' | '확정'
interface Amt { supply: number; vat: number }
export interface Sheet {
  year: number; term: Term; kind: Kind; first: number; last: number; end: number; from: string; to: string
  taxInvoice: Amt; zeroInvoice: Amt; purchaseGeneral: Amt; purchaseFixed: Amt
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
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const add = (a: Amt, b: Amt): Amt => ({ supply: a.supply + b.supply, vat: a.vat + b.vat })
const ZERO: Amt = { supply: 0, vat: 0 }
/** 고정자산 매입 — 부가세 줄 옆 차변이 유형 · 무형자산 계정인 매입. */
const FIXED_CATEGORIES = ['유형자산', '무형자산']
const PRINT_CSS = 'body{font-family:sans-serif;font-size:11px;margin:16px}'
  + 'table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid gray;padding:3px}'
  + '.text-right{text-align:right}.text-center{text-align:center}.ec-report-title{font-size:16px;font-weight:bold;text-align:center}'

/** 신고서 한 장의 숫자 — 그 기간의 회계전표 · (세금)계산서발행/수령에서 센다. 부가세신고서 PDF 다운로드(E030216)도 쓴다. */
export async function loadVatSheet(v: VatReturnRow, accounts: AccountOpt[]): Promise<Sheet> {
  const first = v.monthFrom, last = v.monthTo
  const end = new Date(v.year, last, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const from = `${v.year}-${pad(first)}-01`, to = `${v.year}-${pad(last)}-${pad(end)}`
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
  let taxInvoice = ZERO, zeroInvoice = ZERO, purchaseGeneral = ZERO, purchaseFixed = ZERO
  for (const e of r.data.rows) {
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
    taxInvoice, zeroInvoice, purchaseGeneral, purchaseFixed, salesInvoices, purchaseInvoices }
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
 * (10) 매입 중 (12) 고정자산(차변이 유형 · 무형자산 계정)이 아닌 것. 신용카드 · 현금영수증 · 예정신고누락 · 대손 · 경감공제 · 가산세는
 * 우리 자료에 없어 0 이다.
 *
 * <p>첨부서류는 위 알약으로 고른다 — 매출 · 매입세금계산서 합계표까지.
 *
 * <p>신고서 목록은 원본처럼 [신규(F2)] 로 만들고 신고기간을 눌러 고치고 [선택삭제] 로 지운다(2026-10-12). 귀속연도는 지난해 ~ 올해,
 * 그보다 앞선 해는 부가세신고서 PDF 다운로드(E030216, VatReturnPdfPage)에 선다.
 *
 * <p>두지 않은 것: 이력 · 나머지 첨부서류 31종 · 휴폐업조회(홈택스) · 영수증서 · 전자파일 · PDF ·
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
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [doc, setDoc] = useState<Doc>('부가가치세신고서')
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

  async function search(v: VatReturnRow) {
    setError('')
    try {
      const s = await loadVatSheet(v, accounts)
      setDoc('부가가치세신고서')
      setSheet(s)
    } catch (e) {
      setSheet(null); setError(extractErrorMessage(e))
    }
  }

  function print() {
    const el = document.getElementById('vat-return-sheet')
    const win = openPrintWindow()
    if (!win || !el) return
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>부가가치세신고서</title><style>${PRINT_CSS}</style></head>`
      + `<body>${el.innerHTML}</body></html>`)
  }

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
      else await api.post('/vat-returns', body)
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
      setSheet(null)
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
                 actions={[{ label: '선택삭제', onClick: () => setConfirmDelete(true), disabled: picked.size === 0 },
                   ...(sheet ? [{ label: '인쇄', onClick: print }] : [])]}>
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
            <th className="w-[34px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(returns.map((r) => r.id)))} />
            </th>
            <th className="text-center">신고기간</th>
            <th className="text-center">예정누락<br />포함여부</th>
            <th className="text-center">회사명</th>
            <th className="text-center">신고서등</th>
          </tr>
        </thead>
        <tbody>
          {returns.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
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
              <td className="text-center"><button className="ec-link" onClick={() => void search(r)}>조회</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {sheet && (
        <>
          <div className="ec-pills mb-[8px]">
            {DOCS.map((d) => <button key={d} className={`ec-pill${doc === d ? ' active' : ''}`} onClick={() => setDoc(d)}>{d}</button>)}
          </div>
          <div id="vat-return-sheet">
            {doc === '부가가치세신고서' && <ReturnSheet s={sheet} c={company} />}
            {doc === '매출세금계산서' && <InvoiceSummarySheet side="매출" s={sheet} c={company} invoices={sheet.salesInvoices} />}
            {doc === '매입세금계산서' && <InvoiceSummarySheet side="매입" s={sheet} c={company} invoices={sheet.purchaseInvoices} />}
          </div>
        </>
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
              </div>
            </EcCond>
            <EcCond label="신고작성일자" span={2}>
              <input type="date" className="ec-input w-[150px]" value={form.reportDate} onChange={(e) => set({ reportDate: e.target.value })} />
            </EcCond>
            <EcCond label="납부기한" span={2}>
              <input type="date" className="ec-input w-[150px]" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
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

export function ReturnSheet({ s, c }: { s: Sheet; c: CompanyInfo | null }) {
  const p = s
  const pad = (n: number) => String(n).padStart(2, '0')
  const sales = add(s.taxInvoice, s.zeroInvoice)
  const purchase = add(s.purchaseGeneral, s.purchaseFixed)
  const payable = s.taxInvoice.vat - purchase.vat
  const address = [c?.address, c?.addressDetail].filter(Boolean).join(' ')
  /* 원본 칸 하나 — [구분 · (번호) · 금액 · 세율 · 세액]. 세율이 없는 칸은 비운다. */
  const line = (label: string, no: string, a: Amt | null, rate: string, vatOnly = false, mark = '') => (
    <tr key={no}>
      <td>{label}</td><td className="text-center">{no}</td>
      <td className="text-right">{vatOnly ? '' : won(a?.supply ?? 0)}</td>
      <td className="text-center">{rate}</td>
      <td className="text-right">{mark}{won(a?.vat ?? 0)}</td>
    </tr>
  )
  return (
    <>
      <p>■ 부가가치세법 시행규칙 [별지 제21호서식]</p>
      <p className="ec-report-title mb-[8px]">일반과세자 부가가치세 [{s.kind === '예정' ? 'v' : ' '}] 예정 [{s.kind === '확정' ? 'v' : ' '}] 확정 신고서</p>
      <table className="w-full ec-report mb-[8px]">
        <tbody>
          <tr><th>신고기간</th><td colSpan={5}>{s.year} 년 제 {s.term} 기 ({pad(p.first)}월 01일 ~ {pad(p.last)}월 {pad(p.end)}일)</td></tr>
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
          {line('과세 · 신용카드ㆍ현금영수증발행분', '(3)', ZERO, '10/100')}
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
          {line('그 밖의 공제매입세액', '(15)', ZERO, '')}
          {line('합계 ((10)-(11)+(12)+(13)+(14)+(15))', '(16)', purchase, '')}
          {line('공제받지 못할 매입세액', '(17)', ZERO, '')}
          {line('차감계 ((16)-(17))', '(18)', purchase, '', false, '㉯ ')}
          <tr className="ec-total">
            <td colSpan={4} className="font-bold">납부(환급)세액 (매출세액 ㉮ - 매입세액 ㉯)</td>
            <td className="text-right font-bold">㉰ {won(payable)}</td>
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
            <td colSpan={2} /><td className="text-right font-bold">{won(payable)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mb-[4px]">④ 과 세 표 준 명 세</p>
      <table className="w-full ec-report">
        <thead>
          <tr><th className="text-center">번호</th><th>업 태</th><th>종 목</th><th className="text-right">금 액</th></tr>
        </thead>
        <tbody>
          <tr><td className="text-center">(31)</td><td>{c?.bizType ?? ''}</td><td>{c?.bizItem ?? ''}</td><td className="text-right">{won(sales.supply)}</td></tr>
          <tr><td className="text-center">(34)</td><td>수입금액제외</td><td></td><td className="text-right"></td></tr>
          <tr className="ec-total"><td className="text-center">(35)</td><td colSpan={2} className="font-bold">합 계</td><td className="text-right font-bold">{won(sales.supply)}</td></tr>
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
function InvoiceSummarySheet({ side, s, c, invoices }: { side: '매출' | '매입'; s: Sheet; c: CompanyInfo | null; invoices: Invoice[] }) {
  const p = s
  const pad = (n: number) => String(n).padStart(2, '0')
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
        <td className={cls}>{t.count ? won(t.supply) : ''}</td><td className={cls}>{t.count ? won(t.vat) : ''}</td>
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
      <p className="text-center mb-[8px]">{s.year}년 제 {s.term}기 ({pad(p.first)}월 01일 ~ {pad(p.last)}월 {pad(p.end)}일)</p>
      <p className="mb-[4px]">1. 제출자 인적사항</p>
      <table className="w-full ec-report mb-[8px]">
        <tbody>
          <tr><th>①사업자등록번호</th><td>{c?.bizRegNo ?? ''}</td><th>②상호(법인명)</th><td>{c?.name ?? ''}</td></tr>
          <tr><th>③성명(대표자)</th><td>{c?.ceo ?? ''}</td><th>④사업장소재지</th><td>{address}</td></tr>
          <tr><th>⑤거래기간</th><td>{s.year}년 {pad(p.first)}월 01일 ~ {s.year}년 {pad(p.last)}월 {pad(p.end)}일</td><th>⑥작성일</th><td></td></tr>
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
              <td className="text-right">{r.count}</td><td className="text-right">{won(r.supply)}</td><td className="text-right">{won(r.vat)}</td><td></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { vatSlipAmounts, type VatSide } from '../../utils/vatSlip'
import { incomeBucketOf } from '../../utils/incomeBuckets'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { EcReportFoot, reportDate } from '../../components/EcReportFrame'
import { useAuth } from '../../features/auth/AuthContext'
import type { IncomeStatement, JournalEntry } from '../../types/api'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface AccountOpt { code: string; detailCategory: string | null; division: string }
interface VoucherRow { id: number; journalEntryId: number | null; type: 'EXPENSE_REPORT' | 'DEPOSIT_REPORT' | 'ADVANCE_SETTLEMENT' }
interface VoucherList { rows: VoucherRow[] }
interface AccRow { code: string; name: string; amount: number; vat: number }
interface SlipRow { key: string; date: string; partner: string; supply: number; vat: number; description: string }
interface BalanceRow { key: string; account: string; partner: string; balance: number }
interface Sheet {
  from: string; to: string; vatSales: number; plSales: number
  expense: AccRow[]; advance: AccRow[]; fromEcount: SlipRow[]; toEcount: SlipRow[]
  negatives: BalanceRow[]; dupSales: SlipRow[]; dupPurchases: SlipRow[]
}

const PICKS = ['금월(~오늘)', '전월', '직전분기', '직전반기', '종료일'] as const
/** 자금현황표(FundStatusPage)와 같은 계정 — 원본 자금관리 계정. */
const FUND_ACCOUNTS = ['현금', '당좌예금', '보통예금', '외상매출금', '미수금', '가지급금', '외상매입금', '미지급금']
const CASH_CODES = ['101', '102', '103']
/** 원본 4. 의 상대 — 이카운트(회사)와 주고받은 세금계산서. */
const ECOUNT = '이카운트'
const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const lastDay = (m: string) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)
  return `${m}-${String(d.getDate()).padStart(2, '0')}`
}
const ymLabel = (m: string) => `${m.slice(0, 4)}년 ${m.slice(5, 7)}월`

/** 부가세 줄이 든 지출결의서 · 가지급금정산서 전표 → 계정별 금액 · 부가세. */
function vatByAccount(entries: JournalEntry[]): AccRow[] {
  const by = new Map<string, AccRow>()
  for (const e of entries) {
    const amt = vatSlipAmounts(e.lines, '매입')
    if (!amt) continue
    let first = true
    for (const l of e.lines) {
      if (l.accountCode === '135' || Number(l.debit) === 0) continue
      const r = by.get(l.accountCode) ?? { code: l.accountCode, name: l.accountName, amount: 0, vat: 0 }
      r.amount += Number(l.debit)
      if (first) { r.vat += amt.vat; first = false }
      by.set(l.accountCode, r)
    }
  }
  return [...by.values()].sort((a, b) => a.code.localeCompare(b.code))
}

function slipRows(entries: JournalEntry[], side: VatSide): SlipRow[] {
  const out: SlipRow[] = []
  for (const e of entries) {
    const amt = vatSlipAmounts(e.lines, side)
    if (amt) out.push({ key: `${side}${e.id}`, date: e.entryDate, partner: e.partnerName ?? '', supply: amt.supply, vat: amt.vat, description: e.description ?? '' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** 같은 날 · 같은 거래처 · 같은 공급가액 · 부가세가 두 장 이상이면 둘 다 낸다. */
function duplicates(rows: SlipRow[]): SlipRow[] {
  const keyOf = (r: SlipRow) => `${r.date}|${r.partner}|${r.supply}|${r.vat}`
  const n = new Map<string, number>()
  rows.forEach((r) => n.set(keyOf(r), (n.get(keyOf(r)) ?? 0) + 1))
  return rows.filter((r) => (n.get(keyOf(r)) ?? 0) > 1)
}

/**
 * 세무 › 부가세 › 신고전검토자료 › <b>부가세Checklist</b>(E030207) — 2026-10-04 loginaa 실측.
 *
 * <p>조건 [조회일자 연/월 ~ 연/월(기본 직전분기 — 10/04 에 2026/07 ~ 2026/09) · 예정누락기간 · 부서 · 프로젝트 · 기타 □번호오류사업자포함],
 * 아래 [검색(F8) · 금월(~오늘) · 전월 · 직전분기 · 직전반기 · 종료일]. 검색하면 한 장에 여섯 칸:
 * 1. 매출액비교 [기간 · 부가세매출액 · 손익계산서매출액](원본 2026/07~09 396,450,000 · 396,450,000),
 * 2. 지출결의서중 부가세가 등록된 상황 · 3. 가지급금정산서중 부가세가 등록된 상황 [계정코드 · 계정명 · 금액 · 수수료 · 부가세],
 * 4. 이카운트 매출 매입과 맞는지 확인 — 이카운트가 우리에게 발행한 것 · 우리가 이카운트로 입력한 것 [일자 · 거래처명 · 금액 · 수수료 · 적요]
 * (원본 2026/09/28 이카운트 4,000,000 · 400,000 — '수수료' 칸에 부가세가 찍힌다),
 * 5. 자금현황표상 마이너스인 계정 [계정명 · 거래처명 · 잔액](자금현황표와 같은 차변 − 대변 잔액, 조회 끝날까지),
 * 6. 중복거래 확인대상 자료 매출 · 매입 [일자 · 거래처명 · 공급가액 · 부가세 · 합계].
 *
 * <p>두지 않은 것: 예정누락분포함 · 부서 · 프로젝트 · 번호오류사업자포함 조건(회계전표에 부서 · 프로젝트가 없다), [설정] · [다시 작성].
 * 우리 지출결의서 · 가지급금정산서는 부가세 칸이 없어 2 · 3 은 늘 빈 칸이다.
 */
export default function VatChecklistPage() {
  const init = periodOf('직전분기')!
  const { companyName } = useAuth()
  const [fromYm, setFromYm] = useState(init.from.slice(0, 7))
  const [toYm, setToYm] = useState(init.to.slice(0, 7))
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  }, [])

  async function search(f = fromYm, t = toYm) {
    setError('')
    const from = `${f}-01`
    const to = lastDay(t)
    try {
      const [period, upTo, pl, vouchers] = await Promise.all([
        api.get<JournalList>('/journals', { params: { from, to, all: true } }),
        api.get<JournalList>('/journals', { params: { from: '2000-01-01', to, all: true } }),
        api.get<IncomeStatement>('/journals/income-statement', { params: { from, to } }),
        api.get<VoucherList>('/vouchers', { params: { from, to, all: true } }),
      ])
      const entries = period.data.rows
      const cat = new Map(accounts.map((a) => [a.code, a]))
      const plSales = pl.data.revenues
        .filter((r) => incomeBucketOf(r.division, cat.get(r.accountCode)?.detailCategory ?? '') === 'SALES')
        .reduce((s, r) => s + Number(r.amount), 0)
      const sales = slipRows(entries, '매출')
      const purchases = slipRows(entries, '매입')
      /* 간편전표가 만든 회계전표 — 전표 쪽 출처 칸보다 간편전표가 든 전표 id 로 잇는다. */
      const typeOf = new Map(vouchers.data.rows.filter((v) => v.journalEntryId != null).map((v) => [v.journalEntryId!, v.type]))
      const voucherOf = (type: VoucherRow['type']) => entries.filter((e) => typeOf.get(e.id) === type)

      const bal = new Map<string, BalanceRow>()
      for (const e of upTo.data.rows) {
        for (const l of e.lines) {
          if (!FUND_ACCOUNTS.includes(l.accountName)) continue
          const partner = CASH_CODES.includes(l.accountCode) ? '[ ]' : e.partnerName ?? '[ ]'
          const key = `${l.accountName}|${partner}`
          const r = bal.get(key) ?? { key, account: l.accountName, partner, balance: 0 }
          r.balance += Number(l.debit) - Number(l.credit)
          bal.set(key, r)
        }
      }
      const negatives = [...bal.values()].filter((r) => r.balance < 0).sort((a, b) =>
        a.account !== b.account ? FUND_ACCOUNTS.indexOf(a.account) - FUND_ACCOUNTS.indexOf(b.account) : a.partner.localeCompare(b.partner))

      setSheet({
        from: f, to: t,
        vatSales: sales.reduce((s, r) => s + r.supply, 0), plSales,
        expense: vatByAccount(voucherOf('EXPENSE_REPORT')),
        advance: vatByAccount(voucherOf('ADVANCE_SETTLEMENT')),
        fromEcount: purchases.filter((r) => r.partner === ECOUNT),
        toEcount: sales.filter((r) => r.partner === ECOUNT),
        negatives,
        dupSales: duplicates(sales), dupPurchases: duplicates(purchases),
      })
    } catch (e) {
      setSheet(null); setError(extractErrorMessage(e))
    }
  }

  const company = companyName ?? ''

  return (
    <EcListShell title="부가세Checklist" onSearch={() => setSheet(null)} option={false}
                 actions={sheet ? [{ label: '인쇄', primary: true }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {!sheet && (
        <ul className="ec-cond mb-[8px]">
          <EcCond label="조회일자">
            <input type="month" className="ec-input w-[150px]" value={fromYm} onChange={(e) => setFromYm(e.target.value)} />
            ~
            <input type="month" className="ec-input w-[150px]" value={toYm} onChange={(e) => setToYm(e.target.value)} />
          </EcCond>
          <li className="full">
            <div className="form">
              <button className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
              <EcPeriodPicks labels={PICKS} currentFrom={`${fromYm}-01`}
                             onPick={(r) => { setFromYm(r.from.slice(0, 7)); setToYm(r.to.slice(0, 7)) }} />
            </div>
          </li>
        </ul>
      )}

      {sheet && (
        <div className="max-w-[900px]">
          <div className="ec-report-head">
            <div className="ec-report-title">부가세Checklist</div>
            <div className="ec-report-meta"><span>회사명 : {company}</span><span /></div>
          </div>

          <div className="ec-report-meta"><span>1. 매출액비교</span><span>{sheet.from.replace('-', '/')} ~{sheet.to.replace('-', '/')}</span></div>
          <CheckTable title="1. 매출액비교" head={['기간', '부가세매출액', '손익계산서매출액']} right={[1, 2]}
                      rows={[[`${ymLabel(sheet.from)} ~ ${ymLabel(sheet.to)}`, won(sheet.vatSales), won(sheet.plSales)]]} />

          <p className="mt-[12px] mb-[4px]">2.지출결의서중 부가세가 등록된 상황</p>
          <CheckTable title="2. 지출결의서" head={['계정코드', '계정명', '금액', '수수료', '부가세']} right={[2, 3, 4]}
                      rows={sheet.expense.map((r) => [r.code, r.name, won(r.amount), '', won(r.vat)])} />

          <p className="mt-[12px] mb-[4px]">3.가지급금정산서중 부가세가 등록된 상황</p>
          <CheckTable title="3. 가지급금정산서" head={['계정코드', '계정명', '금액', '수수료', '부가세']} right={[2, 3, 4]}
                      rows={sheet.advance.map((r) => [r.code, r.name, won(r.amount), '', won(r.vat)])} />

          <p className="mt-[12px] mb-[4px]">4.이카운트 매출 매입과 맞는지 확인</p>
          <p className="mb-[4px]">{ECOUNT}가 {company}에게 발행한 세금계산서</p>
          <CheckTable title="4. 이카운트 발행" head={['일자', '거래처명', '금액', '수수료', '적요']} right={[2, 3]}
                      rows={sheet.fromEcount.map((r) => [reportDate(r.date), r.partner, won(r.supply), won(r.vat), r.description])} />
          <p className="mt-[8px] mb-[4px]">{company}이(가) {ECOUNT}로 입력한 세금계산서</p>
          <CheckTable title="4. 이카운트 입력" head={['일자', '거래처명', '금액', '수수료', '적요']} right={[2, 3]}
                      rows={sheet.toEcount.map((r) => [reportDate(r.date), r.partner, won(r.supply), won(r.vat), r.description])} />

          <p className="mt-[12px] mb-[4px]">5.자금현황표상 마이너스인 계정</p>
          <CheckTable title="5. 자금현황표" head={['계정명', '거래처명', '잔액']} right={[2]}
                      rows={sheet.negatives.map((r) => [r.account, r.partner, Math.round(r.balance).toLocaleString('ko-KR')])} />

          <p className="mt-[12px] mb-[4px]">6.중복거래 확인대상 자료</p>
          <p className="mb-[4px]">매출</p>
          <CheckTable title="6. 중복 매출" head={['일자', '거래처명', '공급가액', '부가세', '합계']} right={[2, 3, 4]}
                      rows={sheet.dupSales.map((r) => [reportDate(r.date), r.partner, won(r.supply), won(r.vat), won(r.supply + r.vat)])} />
          <p className="mt-[8px] mb-[4px]">매입</p>
          <CheckTable title="6. 중복 매입" head={['일자', '거래처명', '공급가액', '부가세', '합계']} right={[2, 3, 4]}
                      rows={sheet.dupPurchases.map((r) => [reportDate(r.date), r.partner, won(r.supply), won(r.vat), won(r.supply + r.vat)])} />

          <EcReportFoot page={false} />
        </div>
      )}
    </EcListShell>
  )
}

function CheckTable({ title, head, rows, right }: { title: string; head: string[]; rows: string[][]; right: number[] }) {
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [rows.length])
  const align = (i: number) => (right.includes(i) ? 'text-right' : undefined)
  return (
    <table ref={tableRef} className="w-full ec-report">
      <thead>
        <tr>{head.map((h, i) => <th key={h} className={align(i)}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={head.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
        ) : rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={align(j)}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

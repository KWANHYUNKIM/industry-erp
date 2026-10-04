import { useEffect, useState } from 'react'
import { vatSlipAmounts } from '../../utils/vatSlip'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { fillAndPrint, openPrintWindow } from '../../utils/print'
import type { JournalEntry } from '../../types/api'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface AccountOpt { code: string; detailCategory: string | null }
interface CompanyInfo {
  name?: string; ceo?: string; bizRegNo?: string; bizType?: string; bizItem?: string
  tel?: string; email?: string; address?: string; addressDetail?: string
}
type Term = 1 | 2
type Kind = '예정' | '확정'
interface Amt { supply: number; vat: number }
interface Sheet {
  year: number; term: Term; kind: Kind; from: string; to: string
  taxInvoice: Amt; zeroInvoice: Amt; purchaseGeneral: Amt; purchaseFixed: Amt
}

/** 신고기간 — 예정은 그 기의 앞 석 달, 확정은 뒤 석 달(예정신고를 한 법인). */
function periodOf(year: number, term: Term, kind: Kind) {
  const first = (term - 1) * 6 + (kind === '예정' ? 1 : 4)
  const last = first + 2
  const pad = (n: number) => String(n).padStart(2, '0')
  const end = new Date(year, last, 0).getDate()
  return { from: `${year}-${pad(first)}-01`, to: `${year}-${pad(last)}-${pad(end)}`, first, last, end }
}
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const add = (a: Amt, b: Amt): Amt => ({ supply: a.supply + b.supply, vat: a.vat + b.vat })
const ZERO: Amt = { supply: 0, vat: 0 }
/** 고정자산 매입 — 부가세 줄 옆 차변이 유형 · 무형자산 계정인 매입. */
const FIXED_CATEGORIES = ['유형자산', '무형자산']
const PRINT_CSS = 'body{font-family:sans-serif;font-size:11px;margin:16px}'
  + 'table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid gray;padding:3px}'
  + '.text-right{text-align:right}.text-center{text-align:center}.ec-report-title{font-size:16px;font-weight:bold;text-align:center}'

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
 * <p>두지 않은 것: 신고서 목록 저장([신규(F2)] · [선택삭제] · 이력) · 첨부서류 33종 · 휴폐업조회(홈택스) · 영수증서 · 전자파일 · PDF ·
 * [자료입력](칸 손으로 고치기) · 예정신고누락분 · 그 밖의 공제 · 공제받지 못할 · 가산세 명세(모두 0 으로 그린다).
 */
export default function VatReturnPage() {
  const today = new Date()
  /* 원본 첫 줄은 지난 분기의 신고 — 10/04 에 2026년 2기 예정(7~9). */
  const lastQuarter = Math.floor(today.getMonth() / 3) - 1
  const initYear = lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear()
  const q = (lastQuarter + 4) % 4
  const [year, setYear] = useState(initYear)
  const [term, setTerm] = useState<Term>(q < 2 ? 1 : 2)
  const [kind, setKind] = useState<Kind>(q % 2 === 0 ? '예정' : '확정')
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<CompanyInfo | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  }, [])

  async function search() {
    setError('')
    const p = periodOf(year, term, kind)
    try {
      const r = await api.get<JournalList>('/journals', { params: { from: p.from, to: p.to, all: true } })
      const cat = new Map(accounts.map((a) => [a.code, a.detailCategory ?? '']))
      let taxInvoice = ZERO, zeroInvoice = ZERO, purchaseGeneral = ZERO, purchaseFixed = ZERO
      for (const e of r.data.rows) {
        const s = vatSlipAmounts(e.lines, '매출')
        if (s) {
          if (s.vat === 0) zeroInvoice = add(zeroInvoice, s)
          else taxInvoice = add(taxInvoice, s)
        }
        const b = vatSlipAmounts(e.lines, '매입')
        if (b) {
          const fixed = e.lines.some((l) => Number(l.debit) > 0 && FIXED_CATEGORIES.includes(cat.get(l.accountCode) ?? ''))
          if (fixed) purchaseFixed = add(purchaseFixed, b)
          else purchaseGeneral = add(purchaseGeneral, b)
        }
      }
      setSheet({ year, term, kind, from: p.from, to: p.to, taxInvoice, zeroInvoice, purchaseGeneral, purchaseFixed })
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

  return (
    <EcListShell title="부가가치세신고서(일반)" onSearch={search} option={false}
                 actions={sheet ? [{ label: '인쇄', primary: true, onClick: print }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="신고기간">
          <select className="ec-input w-[100px]" aria-label="연도" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[today.getFullYear(), today.getFullYear() - 1].map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="ec-input w-[80px]" aria-label="기" value={term} onChange={(e) => setTerm(Number(e.target.value) as Term)}>
            <option value={1}>1기</option><option value={2}>2기</option>
          </select>
          <select className="ec-input w-[80px]" aria-label="예정 확정" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="예정">예정</option><option value="확정">확정</option>
          </select>
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
          </div>
        </li>
      </ul>

      {sheet && <div id="vat-return-sheet"><ReturnSheet s={sheet} c={company} /></div>}
    </EcListShell>
  )
}

function ReturnSheet({ s, c }: { s: Sheet; c: CompanyInfo | null }) {
  const p = periodOf(s.year, s.term, s.kind)
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

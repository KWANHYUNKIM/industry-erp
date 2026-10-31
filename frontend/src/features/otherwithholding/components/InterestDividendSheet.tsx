import { useRef } from 'react'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import type { WithholdingReceiptPayee } from '../../../types/api'
import { fmtTruncBlankOf } from '../../../utils/format'

/** 서식에 그릴 회사 칸 — 원천징수영수증(보관용) · 지급명세서(보고용) 둘 다 /company 응답을 넘긴다. */
export interface SheetCompany {
  name?: string | null
  englishName?: string | null
  ceo?: string | null
  bizRegNo?: string | null
  corpRegNo?: string | null
  address?: string | null
  addressDetail?: string | null
}

/** 원본 지급 내역 칸은 쓴 줄 + 빈 줄로 12줄(2026-10-20 배당 한 줄 + 빈 11줄). */
const SHEET_ROWS = 12

const mark = (on: boolean) => (on ? '[ V ]' : '[ ]')
const dot = (d: string | null) => (d ? d.replace(/-/g, '.') : '')

/**
 * 이자 · 배당소득 원천징수영수증/지급명세서 겸용 서식 — 원본 [별지 제23호서식(1)] <개정 2026.05.22>
 * (세무 › 기타원천세 › 조회/인쇄 E030318 · E030319, 2026-10-20 loginaa 실측: 배당 최이사 · 과세구분 T · 소득의종류 51 · 1,000,000 · 14%).
 *
 * <p>영수증(보관용)은 [V]원천징수영수증 · [V]발행자 보관용(또는 소득자 보관용), 지급명세서(보고용)는 [V]지급명세서 · [V]발행자 보고용.
 * 지급 줄: ⑭ 지급 연 · 월 · 일 · ⑮ 귀속 연 · 월 · ⑯ 과세구분 · ⑰ 소득의종류 · ⑱ 조세특례등 · ⑲ 금융상품코드 · ⑳ 유가증권 표준코드 ·
 * ㉑ 채권이자구분 · ㉒ 지급대상기간 · ㉓ 이자율등('0.00000') · ㉔ 지급액 · ㉕ 세율('14.0000') · ㉖ 소득세 · ㉗ 법인세 · ㉘ 지방소득세 ·
 * ㉙ 농어촌특별세 · ㉚ 계. 원본 줄 '2026 10 20 2026 10 T 51 · · · · · 0.00000 1,000,000 14.0000 140,000 · 14,000 · 154,000'.
 */
export default function InterestDividendSheet({ payee: p, company, use, date }: {
  payee: WithholdingReceiptPayee
  company: SheetCompany | null
  /** 'issuer' 발행자 보관용 · 'payee' 소득자 보관용 · 'report' 발행자 보고용(지급명세서) */
  use: 'issuer' | 'payee' | 'report'
  /** 끝 줄 날짜 YYYY-MM-DD */
  date: string
}) {
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '이자배당 원천징수영수증', [p])
  const report = use === 'report'
  const address = [company?.address, company?.addressDetail].filter(Boolean).join(' ')
  const accountNo = p.lines.map((l) => l.accountNo).find(Boolean) ?? ''
  const trust = p.lines.some((l) => l.trustIncome)
  const [y, m, d] = date.split('-')
  const blanks = Math.max(0, SHEET_ROWS - p.lines.length)
  return (
    <>
      <p>■ 소득세법 시행규칙 [별지 제23호서식(1)] &lt;개정 2026.05.22&gt;</p>
      <table className="w-full ec-report ec-report-head400 mb-[8px]">
        <tbody>
          <tr>
            <td className="ec-report-title">
              {mark(!report)} 이자 · 배당소득 원천징수영수증<br />{mark(report)} 이자 · 배당소득 지급명세서
            </td>
            <td>
              {mark(use === 'payee')} 소득자 보관용<br />{mark(use === 'issuer')} 발행자 보관용<br />{mark(report)} 발행자 보고용
            </td>
          </tr>
        </tbody>
      </table>
      <table className="w-full ec-report ec-report-head400 mb-[8px]">
        <tbody>
          <tr>
            <th rowSpan={4}>징 수<br />의무자</th>
            <th>① 법인명(상 호)</th><th>①-1 영문법인명(상 호)</th><th>② 대표자(성 명)</th><th colSpan={2}>③ 사업자 등록번호</th>
          </tr>
          <tr>
            <td>{company?.name ?? ''}</td><td>{company?.englishName ?? ''}</td><td>{company?.ceo ?? ''}</td><td colSpan={2}>{company?.bizRegNo ?? ''}</td>
          </tr>
          <tr><th>④ 주민(법인)등록번호</th><th colSpan={4}>⑤ 소재지 또는 주소</th></tr>
          <tr><td>{company?.corpRegNo ?? ''}</td><td colSpan={4}>{address}</td></tr>
          <tr>
            <th rowSpan={4}>소득자</th>
            <th>⑥ 성명(상 호)</th><th>⑦ 주민(사업자)등록번호</th><th>⑦-1 비거주자 생년월일</th><th colSpan={2}>⑧ 소득자구분코드</th>
          </tr>
          <tr>
            <td>{p.name}</td><td>{p.regNo ?? p.bizRegNo ?? ''}</td><td></td><td colSpan={2}>{p.payeeKindCode ?? ''}</td>
          </tr>
          <tr>
            <th>⑨ 주 소</th><th>⑩ 거주구분</th><th>⑪ 거주지국 · ⑪-1 거주지국코드</th><th>⑫ 계좌번호 (발행번호)</th><th>⑬ 신탁이익 여부</th>
          </tr>
          <tr>
            <td>{p.address ?? ''}</td>
            <td>{mark(!p.nonResident)} 거 주 자 {mark(p.nonResident)} 비거주자</td>
            <td></td>
            <td>{accountNo}</td>
            <td>{mark(trust)} 여 {mark(!trust)} 부</td>
          </tr>
        </tbody>
      </table>
      <table ref={tableRef} className="w-full ec-report ec-report-head400 mb-[8px]">
        <thead>
          <tr><th colSpan={20} className="text-center">지 급 내 역</th></tr>
          <tr>
            <th colSpan={3} className="text-center">⑭지급일</th>
            <th colSpan={2} className="text-center">⑮귀속연월</th>
            <th rowSpan={2}>⑯과세구분</th><th rowSpan={2}>⑰소득의종류</th><th rowSpan={2}>⑱조세특례등</th><th rowSpan={2}>⑲금융상품코드</th>
            <th rowSpan={2}>⑳유가증권 표준코드(유가증권발행사업자등록번호)</th><th rowSpan={2}>㉑채권이자구분</th><th rowSpan={2}>㉒지급대상기간</th>
            <th rowSpan={2} className="text-right">㉓이자율등</th><th rowSpan={2} className="text-right">㉔지급액(소득금액)</th>
            <th rowSpan={2} className="text-right">㉕세율(%)</th>
            <th colSpan={5} className="text-center">원 천 징 수 세 액</th>
          </tr>
          <tr>
            <th className="text-center">연</th><th className="text-center">월</th><th className="text-center">일</th>
            <th className="text-center">연</th><th className="text-center">월</th>
            <th className="text-right">㉖소득세</th><th className="text-right">㉗법인세</th><th className="text-right">㉘지방 소득세</th>
            <th className="text-right">㉙농어촌특별세</th><th className="text-right">㉚계</th>
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l, i) => (
            <tr key={i}>
              <td className="text-center">{l.payDate.slice(0, 4)}</td>
              <td className="text-center">{l.payDate.slice(5, 7)}</td>
              <td className="text-center">{l.payDate.slice(8, 10)}</td>
              <td className="text-center">{l.attributionMonth.slice(0, 4)}</td>
              <td className="text-center">{l.attributionMonth.slice(5, 7)}</td>
              <td className="text-center">{l.taxationCode ?? ''}</td>
              <td className="text-center">{l.incomeCode ?? ''}</td>
              <td className="text-center">{l.specialCode ?? ''}</td>
              <td className="text-center">{l.productCode ?? ''}</td>
              <td>{l.securityCode ?? ''}</td>
              <td className="text-center">{l.bondInterestCode ?? ''}</td>
              <td className="text-center">{l.periodFrom || l.periodTo ? `${dot(l.periodFrom)}~${dot(l.periodTo)}` : ''}</td>
              <td className="text-right">{Number(l.interestRate ?? 0).toFixed(5)}</td>
              <td className="text-right">{fmtTruncBlankOf(l.grossAmount)}</td>
              <td className="text-right">{Number(l.taxRate).toFixed(4)}</td>
              <td className="text-right">{fmtTruncBlankOf(l.incomeTax)}</td>
              <td className="text-right"></td>
              <td className="text-right">{fmtTruncBlankOf(l.localIncomeTax)}</td>
              <td className="text-right"></td>
              <td className="text-right">{fmtTruncBlankOf(l.taxTotal)}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <tr key={`b${i}`}>{Array.from({ length: 20 }, (_, j) => <td key={j}>&nbsp;</td>)}</tr>
          ))}
        </tbody>
      </table>
      <p className="text-center mb-[4px]">위의 원천징수세액(수입금액)을 정히 영수(지급)합니다.</p>
      <p className="text-right mb-[4px]">{y} 년 {m} 월 {d} 일</p>
      <p className="text-right mb-[4px]">징수(보고)의무자 {company?.name ?? ''} (서명 또는 인)</p>
      <p className="mb-[8px]">{report ? '장 귀하' : '귀하'}</p>
      <p className="mb-[4px]">유 의 사 항</p>
      <p>※ ⑯과세구분란의 코드가 "E, L, H, R, O, B, N"인 경우 종합소득과세표준을 계산할 때 합산하지 아니하며, "G"인 경우 「소득세법」제17조제3항 단서(Gross-up)의 적용대상 배당소득에 해당합니다.</p>
      <p>※ ⑰소득의 종류가 "11~49"인 경우 이자소득, "51~99"인 경우 배당소득입니다.</p>
    </>
  )
}

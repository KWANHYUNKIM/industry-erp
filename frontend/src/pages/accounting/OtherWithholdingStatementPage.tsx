import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { fillAndPrint, openPrintWindow } from '../../utils/print'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { WithholdingPaymentStatement } from '../../types/api'
import type { Company } from './SimplePaymentPage'

type Kind = 'BUSINESS' | 'INTEREST' | 'OTHER' | 'NON_RESIDENT'
const KINDS: { value: Kind; label: string }[] = [
  { value: 'BUSINESS', label: '사업소득' }, { value: 'INTEREST', label: '이자배당소득' }, { value: 'OTHER', label: '기타소득' },
  { value: 'NON_RESIDENT', label: '비거주자사업기타소득' },
]
/** 원본 2. 소득자 줄 칸은 쓴 줄 뒤로 빈 줄을 채워 적어도 이만큼 그린다. */
const SHEET_ROWS = 10
const won = (n: number) => (Number(n) ? Math.trunc(Number(n)).toLocaleString('ko-KR') : '')
const PRINT_CSS = 'body{font-family:sans-serif;font-size:11px;margin:16px}'
  + 'table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid gray;padding:3px}'
  + '.text-right{text-align:right}.text-center{text-align:center}.ec-report-title{font-size:16px;font-weight:bold;text-align:center}'

/**
 * 기타원천-지급명세서(보고용) (원본 세무 › 기타원천세 › 조회/인쇄 E030319, 2026-10-04 loginaa 실측).
 *
 * <p>조건 [귀속연도 · 세무신고사업장 · 서식구분(사업소득 · 이자배당소득 · 기타소득)], [검색(F8)] 하면 바로 서식 한 장 —
 * '거주자의 사업소득 지급명세서 (발행자 보고용)' [별지 제23호서식(2)] / 기타소득 [별지 제23호 서식(4)].
 * 1. 원천징수의무자 인적사항 및 지급내용 합계사항 [(1) 법인명 · (2) 사업자등록번호 · (3) 소재지 · (4) 연간 소득인원 · (5) 연간 총 지급건수 ·
 * (6) 연간 총지급액 계 · 소득세 · 지방소득세 · 계], 2. 소득자 인적사항 및 연간 소득내용 — 소득자 × 업종(소득구분)코드 × 지급연도 × 세율
 * 한 줄. 사업소득은 '소득자별 연간소득 내용 합계' · '소액부징수 연간 합계' 줄이 먼저 선다. 소득자 없는 줄은 빠진다.
 * 원본 2026 사업소득 2명 · 3건 · 3,230,939 · 96,910 · 9,680 · 106,590 / 기타소득 3명 · 4건 · 12,968,552 · 5,520,755 · 1,104,130 · 110,400.
 *
 * <p>두지 않은 것: 귀속연도 [사용] 끄기 · 지급연월 조건 · 비거주자사업기타소득 · 관리번호. 이자배당은 원본 서식 대신 같은 표로 그린다.
 */
export default function OtherWithholdingStatementPage() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [kind, setKind] = useState<Kind>('BUSINESS')
  const [sheet, setSheet] = useState<{ kind: Kind; data: WithholdingPaymentStatement } | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [error, setError] = useState('')
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  async function search() {
    setError('')
    try {
      const { data } = await api.get<WithholdingPaymentStatement>('/other-withholdings/payment-statement', { params: { kind, year } })
      setSheet({ kind, data })
    } catch (e) {
      setSheet(null); setError(extractErrorMessage(e))
    }
  }

  function print() {
    const win = openPrintWindow()
    if (!win || !sheetRef.current) return
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지급명세서</title><style>${PRINT_CSS}</style></head>`
      + `<body>${sheetRef.current.innerHTML}</body></html>`)
  }

  return (
    <EcListShell title="기타원천-지급명세서(보고용)" onSearch={search} option={false}
                 actions={sheet ? [{ label: '인쇄', primary: true, onClick: print }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연도">
          <select className="ec-input w-[100px]" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </EcCond>
        <EcCond label="세무신고사업장">
          <select className="ec-input w-full" disabled value="">
            <option value="">{company?.name ?? ''} {company?.bizRegNo ?? ''}</option>
          </select>
        </EcCond>
        <EcCond label="서식구분">
          {KINDS.map((k) => (
            <label key={k.value} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="statement-kind" checked={kind === k.value} onChange={() => setKind(k.value)} /> {k.label}
            </label>
          ))}
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
          </div>
        </li>
      </ul>

      {sheet && (
        <div ref={sheetRef}>
          <StatementSheet kind={sheet.kind} s={sheet.data} company={company} />
        </div>
      )}
    </EcListShell>
  )
}

function StatementSheet({ kind, s, company }: { kind: Kind; s: WithholdingPaymentStatement; company: Company | null }) {
  const nr = kind === 'NON_RESIDENT'
  const other = kind === 'OTHER' || nr
  const business = kind === 'BUSINESS'
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '지급명세서', [kind, s])
  const label = business ? '사업소득' : nr ? '사업 · 기타소득' : other ? '기타소득' : '이자 · 배당소득'
  const address = [company?.address, company?.addressDetail].filter(Boolean).join(' ')
  const cols = other ? 15 : 11
  const blanks = Math.max(0, SHEET_ROWS - s.rows.length)
  return (
    <>
      <p>■ 소득세법 시행규칙 [별지 제23호서식({nr ? '5' : other ? '4' : '2'})]</p>
      <table className="w-full ec-report ec-report-head400 mb-[8px]">
        <tbody>
          <tr>
            <th>귀속연도</th><td>{s.year} 년</td>
            <td className="ec-report-title">{nr ? '비' : ''}거주자의 {label} 지급명세서 (발행자 보고용)<br />({`${nr ? '비' : ''}거주자의 ${label} 원천징수영수증 발행자 보관용 소득자별 연간집계표`})</td>
            <th>관리번호</th><td></td>
          </tr>
        </tbody>
      </table>
      <p className="mb-[4px]">1. 원천징수의무자 인적사항 및 지급내용 합계사항</p>
      <table className="w-full ec-report ec-report-head400 mb-[8px]">
        <tbody>
          <tr>
            <th>(1) 법인명(상호,성명)</th><th>(2) 사업자(주민)등록번호</th><th>(3) 소재지(주 소)</th>
            <th className="text-right">(4) 연간 소득인원</th><th className="text-right">(5) 연간 총 지급건수</th><th className="text-right">(6) 연간 총지급액 계</th>
            {other && <><th className="text-right">비과세소득</th><th className="text-right">연간 소득금액 계</th></>}
            <th className="text-right">소득세</th><th className="text-right">지방소득세</th>{other && <th className="text-right">농어촌특별세</th>}<th className="text-right">계</th>
          </tr>
          <tr>
            <td>{company?.name ?? ''}</td><td>{company?.bizRegNo ?? ''}</td><td>{address}</td>
            <td className="text-right">{s.payeeCount || ''}</td><td className="text-right">{s.lineCount || ''}</td><td className="text-right">{won(s.grossAmount)}</td>
            {other && <><td className="text-right"></td><td className="text-right">{won(s.taxableAmount)}</td></>}
            <td className="text-right">{won(s.incomeTax)}</td><td className="text-right">{won(s.localIncomeTax)}</td>{other && <td className="text-right"></td>}
            <td className="text-right">{won(s.taxTotal)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mb-[4px]">2. 소득자 인적사항 및 연간 소득내용</p>
      <table ref={tableRef} className="w-full ec-report ec-report-head400">
        <thead>
          <tr>
            <th className="text-center">일련번호</th>
            <th>{other ? '소득구분코드' : '업종구분코드'}</th><th>소득자 성명(상호)</th><th>주민(사업자)등록번호</th>
            <th className="text-center">내·외국인(1·9)</th><th className="text-center">지급연도</th><th className="text-right">지급건수</th>
            <th className="text-right">(연간)지급총액</th>
            {other && <><th className="text-right">비과세소득</th><th className="text-right">필요경비</th><th className="text-right">소득금액</th></>}
            <th className="text-right">세율</th><th className="text-right">소득세</th><th className="text-right">지방소득세</th>
            {other && <th className="text-right">농어촌특별세</th>}
            <th className="text-right">계</th>
          </tr>
        </thead>
        <tbody>
          {business && <>
            <tr>
              <td /><td colSpan={5} className="text-center">소득자별 연간소득 내용 합계</td>
              <td className="text-right">{s.lineCount || ''}</td><td className="text-right">{won(s.grossAmount)}</td>
              <td /><td className="text-right">{won(s.incomeTax)}</td><td className="text-right">{won(s.localIncomeTax)}</td><td className="text-right">{won(s.taxTotal)}</td>
            </tr>
            <tr>
              <td /><td colSpan={5} className="text-center">소액부징수 연간 합계</td>
              <td className="text-right">{s.smallCount || ''}</td><td className="text-right">{won(s.smallGross)}</td>
              <td /><td /><td /><td />
            </tr>
          </>}
          {s.rows.map((r, i) => (
            <tr key={i}>
              <td className="text-center">{i + 1}</td>
              <td>{r.code ?? ''}</td><td>{r.name}</td><td>{r.regNo ?? ''}</td>
              <td className="text-center">{r.foreigner ? 9 : 1}</td><td className="text-center">{r.payYear}</td>
              <td className="text-right">{r.count}</td><td className="text-right">{won(r.grossAmount)}</td>
              {other && <><td className="text-right"></td><td className="text-right">{won(r.expenseAmount)}</td><td className="text-right">{won(r.taxableAmount)}</td></>}
              <td className="text-right">{Number(r.taxRate)}</td>
              <td className="text-right">{won(r.incomeTax)}</td><td className="text-right">{won(r.localIncomeTax)}</td>
              {other && <td className="text-right"></td>}
              <td className="text-right">{won(r.taxTotal)}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <tr key={`b${i}`}>
              <td className="text-center">{s.rows.length + i + 1}</td>
              {Array.from({ length: cols }, (_, j) => <td key={j}>&nbsp;</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

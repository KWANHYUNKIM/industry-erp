import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { WithholdingReturn, WithholdingStatement } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => n.toLocaleString('ko-KR')

type Company = { name?: string; ceo?: string; bizRegNo?: string; corpRegNo?: string; address?: string; addressDetail?: string }
type Line = { kind: string; attribution: string; pay: string; count: number; gross: number; tax: number }

/**
 * 신고서 서식 코드 → 확인서의 [소득구분]. 원본은 가감계 단위(근로 · 퇴직 · 사업 · 기타 · 연금 · 이자 · 배당)로 한 줄씩 찍는다
 * (2026-10-03 loginaa: 2026/10 신고서 → '근로소득 | 2026.10 | 2026.10 | 6 | 20,469,000 | 646,370').
 */
const KIND: Record<string, string> = {
  A01: '근로소득', A02: '근로소득', A03: '근로소득', A04: '근로소득',
  A21: '퇴직소득', A22: '퇴직소득',
  A25: '사업소득', A26: '사업소득',
  A41: '기타소득', A42: '기타소득', A43: '기타소득', A44: '기타소득', A49: '기타소득', A59: '기타소득',
  A45: '연금소득', A46: '연금소득', A48: '연금소득',
  A50: '이자소득', A60: '배당소득',
}
const KIND_ORDER = ['근로소득', '퇴직소득', '사업소득', '기타소득', '연금소득', '이자소득', '배당소득']
const BLANK_ROWS = 9

/**
 * 원천징수이행상황신고서확인 (원본 세무 › 원천징수 › 세무신고 E030102, 2026-10-03 실측).
 * 조건 [귀속연월] · [신고일자] 로 <b>만들어 둔 원천징수이행상황신고서</b>를 찾아, 소득구분마다
 * 귀속년월 · 지급년월 · 총인원 · 총지급액 · 소득세등 · 농어촌특별세를 확인서 서식에 찍는다(9줄 칸).
 * 신고서가 없는 달은 칸이 빈 채로 나온다.
 */
export default function WithholdingConfirmPage() {
  const [month, setMonth] = useState(ymd(new Date()).slice(0, 7))
  const [reportDate, setReportDate] = useState('')
  const [company, setCompany] = useState<Company | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  async function search() {
    setError('')
    try {
      const all = (await api.get<WithholdingReturn[]>('/withholding/returns')).data
      const picked = all.filter((r) => r.attributionMonth === month && (!reportDate || r.reportDate === reportDate))
      const out: Line[] = []
      for (const r of picked) {
        const stmt = (await api.get<WithholdingStatement>('/withholding/statement', { params: { month: r.attributionMonth } })).data
        const by = new Map<string, Line>()
        for (const s of stmt.sections) {
          const kind = KIND[s.code]
          if (!kind) continue
          const l = by.get(kind) ?? { kind, attribution: r.attributionMonth, pay: r.payMonth, count: 0, gross: 0, tax: 0 }
          l.count += s.count; l.gross += Number(s.grossPay); l.tax += Number(s.incomeTax)
          by.set(kind, l)
        }
        out.push(...KIND_ORDER.map((k) => by.get(k)).filter((l): l is Line => !!l && (l.count > 0 || l.gross > 0)))
      }
      setLines(out)
    } catch (e) {
      setLines([]); setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search() }, [])

  const dot = (m: string) => m.replace('-', '.')
  const rows = [...lines, ...Array.from({ length: Math.max(0, BLANK_ROWS - lines.length) }, () => null)]

  return (
    <EcListShell title="원천징수이행상황신고서확인" option={false} collapseConditions onSearch={search}
                 actions={[{ label: '인쇄' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond">
        <EcCond label="세무신고사업장">{company ? `${company.name ?? ''} ${company.bizRegNo ?? ''}` : ''}</EcCond>
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[150px]" value={month} onChange={(e) => setMonth(e.target.value)} />
        </EcCond>
        <EcCond label="신고일자">
          <input type="date" className="ec-input w-[150px]" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
        </EcCond>
      </ul>

      <table className="w-full ec-report mt-[8px]">
        <tbody>
          <tr>
            <th>발 급 번 호</th>
            <th colSpan={5}>원천징수이행상황신고서확인</th>
            <th>처 리 기 간<br />즉 시</th>
          </tr>
          <tr>
            <th rowSpan={3}>원천징수의무자</th>
            <th>상 호(법인명)</th><td colSpan={2}>{company?.name ?? ''}</td>
            <th>사업자 등록 번호</th><td colSpan={2}>{company?.bizRegNo ?? ''}</td>
          </tr>
          <tr>
            <th>성 명(대표자)</th><td colSpan={2}>{company?.ceo ?? ''}</td>
            <th>주민(법인)등록번호</th><td colSpan={2}>{company?.corpRegNo ?? ''}</td>
          </tr>
          <tr>
            <th>주 소(사 업 장)</th>
            <td colSpan={5}>{[company?.address, company?.addressDetail].filter(Boolean).join(' ')}</td>
          </tr>
          <tr>
            <th>용 도</th><td colSpan={3}></td>
            <th>수 량</th><td colSpan={2}></td>
          </tr>
          <tr>
            <th rowSpan={2}>소 득 구 분</th>
            <th rowSpan={2}>귀 속 년 월</th>
            <th rowSpan={2}>지 급 년 월</th>
            <th rowSpan={2}>총인원</th>
            <th rowSpan={2}>총 지 급 액</th>
            <th colSpan={2}>원 천 징 수 세 액</th>
          </tr>
          <tr><th>소 득 세 등</th><th>농어촌 특별세</th></tr>
          {rows.map((l, i) => l ? (
            <tr key={i}>
              <td className="text-center">{l.kind}</td>
              <td className="text-center">{dot(l.attribution)}</td>
              <td className="text-center">{dot(l.pay)}</td>
              <td className="text-right">{won(l.count)}</td>
              <td className="text-right">{won(l.gross)}</td>
              <td className="text-right">{won(l.tax)}</td>
              <td className="text-right"></td>
            </tr>
          ) : (
            <tr key={i}><td>&nbsp;</td><td /><td /><td /><td /><td /><td /></tr>
          ))}
          <tr>
            <td colSpan={7}>
              위 사실을 확인하여 주시기 바랍니다.<br />
              신 청 인 {company?.name ?? ''} (서명 또는 인)<br />
              세무대리인 귀 하
            </td>
          </tr>
          <tr>
            <th rowSpan={2}>확인자</th>
            <th>사업장소재지</th><td colSpan={5}></td>
          </tr>
          <tr>
            <th>세무대리인 등 록 번 호</th><td colSpan={2}></td>
            <th>전화번호</th><td colSpan={2}></td>
          </tr>
          <tr>
            <td colSpan={7} className="text-center">
              위의 내용은 세무서에 제출한 원천징수이행 상황신고서의 내용과 틀림없음을 확인합니다.<br />
              년 월 일<br />
              세무대리인 (인)
            </td>
          </tr>
        </tbody>
      </table>
    </EcListShell>
  )
}

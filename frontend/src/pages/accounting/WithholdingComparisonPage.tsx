import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { WithholdingComparisonRow } from '../../types/api'

const num = (n: number | null | undefined) => (n == null || Number(n) === 0 ? '' : Number(n).toLocaleString('ko-KR'))
type Company = { name?: string; bizRegNo?: string }

/**
 * 원천세신고자료비교표 (원본 세무 › 원천징수 › 출력물 E030104, 2026-10-04 loginaa 실측).
 *
 * <p>조건 판이 펼쳐진 채 시작 — 세무신고사업장 · 기준연도(기본 올해) · 중도퇴사기준(◉귀속(퇴사일자) ○지급연월), [검색(F8) · 다시작성].
 * 격자 [기준월 · 구분 | 급여대장: 인원 · 지급총액 · 비과세(제출제외) · 소득세 · 지방소득세 | 신고내역: 인원 · 금액 · 소득세 | 차이여부],
 * 달마다 구분 열 줄(근로소득 · 중도퇴사 · 일용근로 · 연말정산 · 퇴직소득 · 사업소득 · 기타소득 · 이자소득 · 배당소득 · 법인원천),
 * 자료가 하나도 없는 달은 빼고 끝에 '합계' 열 줄, 하단 [인쇄 · Excel]. 0 은 빈칸이다.
 * 원본 2026: 근로소득 달마다 6 · 21,669,000 · 1,200,000 · 646,370 · 64,620, 합계 60 · 216,690,000 · 12,000,000 · 6,463,700 · 646,200.
 *
 * <p>차이여부는 원본에 신고서가 없어 글자를 못 쟀다 — 신고서가 있고 금액 · 소득세가 다르면 'O'.
 * 중도퇴사 · 연말정산 · 법인원천은 자료가 없어 빈다. 중도퇴사기준은 고를 수 있지만 쓰는 자료가 없다.
 */
export default function WithholdingComparisonPage() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [retireBasis, setRetireBasis] = useState<'귀속(퇴사일자)' | '지급연월'>('귀속(퇴사일자)')
  const [company, setCompany] = useState<Company | null>(null)
  const [rows, setRows] = useState<WithholdingComparisonRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  async function search() {
    setError('')
    try {
      setRows((await api.get<WithholdingComparisonRow[]>('/withholding/comparison', { params: { year } })).data)
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }

  const list = rows ?? []
  // 기준월 칸은 달마다 열 줄을 묶는다
  const firstOfGroup = (i: number) => i === 0 || list[i - 1].month !== list[i].month
  const groupSize = (i: number) => list.filter((r) => r.month === list[i].month).length

  return (
    <EcListShell title="원천세신고자료비교표" onSearch={search} option={false} collapseConditions={rows !== null}
                 actions={rows ? [{ label: '인쇄', primary: true }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="세무신고사업장" span="full">
          <select className="ec-input w-full" disabled value=""><option value="">{company?.name ?? ''} {company?.bizRegNo ?? ''}</option></select>
        </EcCond>
        <EcCond label="기준연도" span="full">
          <select className="ec-input w-full" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </EcCond>
        <EcCond label="중도퇴사기준" span="full">
          {(['귀속(퇴사일자)', '지급연월'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="wc-retire" checked={retireBasis === v} onChange={() => setRetireBasis(v)} /> {v}
            </label>
          ))}
        </EcCond>
        {rows === null && (
          <li className="full">
            <div className="form">
              <button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
              <button className="ec-btn" onClick={() => { setYear(thisYear); setRetireBasis('귀속(퇴사일자)') }}>다시작성</button>
            </div>
          </li>
        )}
      </ul>

      {rows && (
        <table className="w-full ec-report ec-report-head400">
          <thead>
            <tr>
              <th rowSpan={3}>기준월</th><th rowSpan={3}>구분</th><th colSpan={5}>급여대장</th><th colSpan={3}>신고내역</th>
              <th rowSpan={3}>차이여부</th>
            </tr>
            <tr>
              <th rowSpan={2}>인원</th><th>급여대장</th><th>제출제외</th><th rowSpan={2}>소득세</th><th rowSpan={2}>지방소득세</th>
              <th rowSpan={2}>인원</th><th rowSpan={2}>금액</th><th rowSpan={2}>소득세</th>
            </tr>
            <tr><th>지급총액</th><th>비과세</th></tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : list.map((r, i) => (
              <tr key={`${r.month ?? 'sum'}-${r.kind}`}>
                {firstOfGroup(i) && <td rowSpan={groupSize(i)} className="text-center">{r.month ? `${r.month.slice(5)}월` : '합계'}</td>}
                <td>{r.kind}</td>
                <td className="text-right">{num(r.count)}</td>
                <td className="text-right">{num(r.gross)}</td>
                <td className="text-right">{num(r.nonTaxable)}</td>
                <td className="text-right">{num(r.incomeTax)}</td>
                <td className="text-right">{num(r.localIncomeTax)}</td>
                <td className="text-right">{num(r.reportedCount)}</td>
                <td className="text-right">{num(r.reportedGross)}</td>
                <td className="text-right">{num(r.reportedTax)}</td>
                <td className="text-center">{r.differs ? 'O' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </EcListShell>
  )
}

import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { IncomeSubmission } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => Number(n).toLocaleString('ko-KR')
type Company = { name?: string; ceo?: string; bizRegNo?: string; corpRegNo?: string; tel?: string; address?: string; addressDetail?: string }

const KINDS = ['연말정산', '중도정산', '연말정산+중도정산', '퇴직소득', '사업소득', '이자소득', '배당소득', '기타소득']
/** 정산 · 퇴직은 귀속연월을 늘 쓰고(원본 '사용' 이 잠겨 켜져 있음) 지급연월 칸이 없다. */
const SETTLEMENT = new Set(['연말정산', '중도정산', '연말정산+중도정산', '퇴직소득'])

/**
 * 소득자료제출집계표 (원본 세무 › 원천징수 › 지급명세서 E030508, 2026-10-04 loginaa 실측).
 *
 * <p>조건 판이 펼쳐진 채 시작한다 — 귀속연도(기본 작년) · 원천세신고 사업자등록번호 · 귀속연월(사용) · 지급연월(사용, 사업 · 이자 ·
 * 배당 · 기타소득만) · 제출일자(오늘) · 출력구분(기본 연말정산+중도정산). [검색(F8)] 하면 [원천징수사무처리규정 별지 제 12호 서식]
 * 소득자료제출집계표 한 장 — 징수의무자 인적사항 · 제출내용 [귀속연도 · 제출 연월일 · 소득종류 · 매수 · 건수 · 소득(수입)금액 ·
 * 소득세 · 법인세 · 농어촌특별세 · 지방소득세] · 작성요령. 원본 2025 사업소득: 4 · 10 · 14,926,000 · 447,780 · 44,770.
 *
 * <p>우리는 기타원천세가 지급일 하나만 들어서 귀속연월과 지급연월을 같은 날짜로 거른다. 연말정산 · 중도정산 · 퇴직소득은 정산 자료가 없어 0.
 */
export default function IncomeSubmissionPage() {
  const lastYear = new Date().getFullYear() - 1
  const [year, setYear] = useState(lastYear)
  const [attr, setAttr] = useState({ use: true, from: `${lastYear}-01`, to: `${lastYear}-12` })
  const [paid, setPaid] = useState({ use: false, from: `${lastYear}-01`, to: `${lastYear}-12` })
  const [submitDate, setSubmitDate] = useState(ymd(new Date()))
  const [kind, setKind] = useState('연말정산+중도정산')
  const [company, setCompany] = useState<Company | null>(null)
  const [result, setResult] = useState<IncomeSubmission | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  function changeYear(y: number) {
    setYear(y)
    setAttr({ ...attr, from: `${y}-01`, to: `${y}-12` })
    setPaid({ ...paid, from: `${y}-01`, to: `${y}-12` })
  }

  async function search() {
    setError('')
    // 귀속 · 지급 둘 다 쓰면 겹치는 기간, 하나만 쓰면 그것, 둘 다 안 쓰면 귀속연도 한 해
    const ranges = [attr.use || SETTLEMENT.has(kind) ? attr : null, !SETTLEMENT.has(kind) && paid.use ? paid : null].filter(Boolean) as { from: string; to: string }[]
    const from = ranges.length ? ranges.map((r) => r.from).sort().pop()! : `${year}-01`
    const to = ranges.length ? ranges.map((r) => r.to).sort()[0] : `${year}-12`
    try {
      setResult((await api.get<IncomeSubmission>('/withholding/income-submission', { params: { kind, from, to } })).data)
    } catch (e) {
      setResult(null); setError(extractErrorMessage(e))
    }
  }

  const [sy, sm, sd] = submitDate.split('-')
  const address = [company?.address, company?.addressDetail].filter(Boolean).join(' ')
  const range = (v: { use: boolean; from: string; to: string }, set: (v: { use: boolean; from: string; to: string }) => void, locked = false) => (
    <>
      <input type="month" className="ec-input w-[140px]" disabled={!v.use && !locked} value={v.from} onChange={(e) => set({ ...v, from: e.target.value })} />
      ~
      <input type="month" className="ec-input w-[140px]" disabled={!v.use && !locked} value={v.to} onChange={(e) => set({ ...v, to: e.target.value })} />
      <label className="inline-flex items-center gap-[3px] ml-[6px]">
        <input type="checkbox" checked={v.use || locked} disabled={locked} onChange={(e) => set({ ...v, use: e.target.checked })} /> 사용
      </label>
    </>
  )

  return (
    <EcListShell title="소득자료제출집계표" onSearch={search} option={false} searchable={result !== null}
                 collapseConditions={result !== null} actions={result ? [{ label: '인쇄', primary: true }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연도" span="full">
          <select className="ec-input w-full" value={year} onChange={(e) => changeYear(Number(e.target.value))}>
            {[lastYear + 1, lastYear, lastYear - 1, lastYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </EcCond>
        <EcCond label="원천세신고 사업자등록번호" span="full">
          <select className="ec-input w-full" disabled value=""><option value="">{company?.name ?? ''} {company?.bizRegNo ?? ''}</option></select>
        </EcCond>
        <EcCond label="귀속연월" span="full">{range(attr, setAttr, SETTLEMENT.has(kind))}</EcCond>
        {!SETTLEMENT.has(kind) && <EcCond label="지급연월" span="full">{range(paid, setPaid)}</EcCond>}
        <EcCond label="제출일자" span="full">
          <input type="date" className="ec-input w-[150px]" value={submitDate} onChange={(e) => setSubmitDate(e.target.value)} />
        </EcCond>
        <EcCond label="출력구분" span="full">
          <select className="ec-input w-full" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
        {result === null && (
          <li className="full"><div className="form"><button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button></div></li>
        )}
      </ul>

      {result && (
        <div className="max-w-[900px]">
          <p>[원천징수사무처리규정 별지 제 12호 서식]</p>
          <div className="ec-report-title">소득자료제출집계표</div>
          <table className="w-full ec-report ec-report-head400 mb-[12px]">
            <tbody>
              <tr>
                <th rowSpan={3}>징　수<br />의무자</th>
                <th>① 사업자등록번호</th><td>{company?.bizRegNo ?? ''}</td>
                <th>② 법인등록번호</th><td>{company?.corpRegNo ?? ''}</td>
              </tr>
              <tr><th>③ 법인명(상호)</th><td>{company?.name ?? ''}</td><th>④ 대표자(성명)</th><td>{company?.ceo ?? ''}</td></tr>
              <tr><th>⑤ 소재지(주소)</th><td>{address}</td><th>⑥ 전화번호</th><td>{company?.tel ?? ''}</td></tr>
            </tbody>
          </table>
          <p className="text-center mb-[4px]">제　출　내　용</p>
          <table className="w-full ec-report ec-report-head400 mb-[12px]">
            <thead>
              <tr>
                <th rowSpan={2}>⑦ 귀속연도</th><th rowSpan={2}>⑧ 제출 연월일</th><th rowSpan={2}>⑨ 소득종류</th>
                <th rowSpan={2}>⑩ 매수</th><th rowSpan={2}>⑪ 건 수</th><th rowSpan={2}>⑫ 소득(수입)금액</th>
                <th colSpan={4}>원 천 징 수 세 액</th>
              </tr>
              <tr><th>⑬ 소득세</th><th>⑭ 법인세</th><th>⑮ 농어촌특별세</th><th>(16) 지방소득세</th></tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">{year}</td>
                <td className="text-center">{sy} 년 {sm} 월 {sd} 일</td>
                <td className="text-center">{result.kind}</td>
                <td className="text-right">{result.pages}</td>
                <td className="text-right">{result.count}</td>
                <td className="text-right">{won(result.income)}</td>
                <td className="text-right">{won(result.incomeTax)}</td>
                <td></td>
                <td></td>
                <td className="text-right">{won(result.localIncomeTax)}</td>
              </tr>
            </tbody>
          </table>
          <p>위 소득자료제출집계표의 제출내용을 제출합니다.</p>
          <p className="text-center my-[8px]">{sy} 년 {sm} 월 {sd} 일</p>
          <p className="text-right">징수(보고)의무자 {company?.ceo ?? ''} (서명 또는 인)</p>
          <p>() 세무서장 귀하</p>
          <div className="mt-[12px]">
            <p>작성요령</p>
            <p>1. 귀속연도별 이자소득, 배당소득, 근로소득, 기타소득(거주자), 사업소득(거주자), 사업연말, 비거주자의 사업·기타소득, 퇴직소득, 연금소득 등으로 구분하여 별지작성</p>
            <p>2. 매수 : 지급조서의 매수(페이지수)</p>
            <p>3. 건수 : 소득자 건수(명세서의 경우 라인 건수)</p>
            <p>4. 소득(수입)금액 : 총급여와 비과세 금액을 합계한 금액(원천징수이행상황신고서 상의 지급액과 동일) - 사업·기타소득의 경우 “소액부징수”를 제외함.</p>
            <p>5. 원천징수액 : 근로·사업연말·연금소득·퇴직소득은 결정세액을 기재하고 이자·배당·사업·기타소득의 경우에는 원천징수세액을 기재합니다.</p>
            <p>※ 해당 지급명세서를 서면으로 제출하는 경우에만 작성합니다.</p>
          </div>
        </div>
      )}
    </EcListShell>
  )
}

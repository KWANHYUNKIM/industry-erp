import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { DailyReceipt } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import type { Company } from './SimplePaymentPage'

const won = (n: number) => Number(n).toLocaleString('ko-KR')
/** 원본 목록은 0 을 빈칸으로 둔다(2026-10-14 총지급액 600,000 · 비과세 · 소득세 · 지방소득세 빈칸). */
const wonBlank = (n: number) => (Number(n) === 0 ? '' : won(n))

/**
 * 원천징수영수증(일용직) (원본 세무 › 원천징수 › 일용근로 C000733 '일용근로소득지급명세서(원천징수영수증)', 2026-10-04 실측).
 *
 * <p>조건 판이 펼쳐진 채 시작 — 세무신고사업장 · 사원 · 지급연월(연도 + 달, 기본 이번 달) · 제출일자(오늘) ·
 * 출력용도(◉지급자보관용 ○소득자보관용), [검색(F8) · 다시 작성]. 목록 [사원번호 · 사원명 · 주민등록번호 · 총지급액 · 비과세총액 ·
 * 소득세 · 지방소득세 · 인쇄], 하단 [Email · 인쇄]. 숫자는 그 지급연월의 일용근로 급여대장(관리)에서 — 2026-10-14 원본
 * QA세무-일용 일당 200,000 · 3일 → '00003 · QA세무-일용 · (빈칸) · 600,000 · (빈칸) · (빈칸) · (빈칸)'(0 은 빈칸).
 * 줄 [인쇄] 는 [별지 제24호4서식(3)] 일용근로소득 지급명세서(원천징수영수증) — 출력용도에 [v], 끝에 제출일자 · 징수의무자.
 * 주민등록번호는 일용근로 사원에 없어 빈칸, Email(바깥 발송)은 두지 않는다.
 */
export default function DailyReceiptPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [submitDate, setSubmitDate] = useState(ymd(today))
  const [purpose, setPurpose] = useState<'지급자보관용' | '소득자보관용'>('지급자보관용')
  const [employee, setEmployee] = useState('')
  const [company, setCompany] = useState<Company | null>(null)
  const [rows, setRows] = useState<DailyReceipt[] | null>(null)
  const [printing, setPrinting] = useState<DailyReceipt | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  async function search() {
    setError('')
    try {
      const m = `${year}-${String(month).padStart(2, '0')}`
      const data = (await api.get<DailyReceipt[]>('/withholding/daily-receipts', { params: { month: m } })).data
      setRows(data.filter((r) => !employee.trim() || `${r.employeeCode ?? ''} ${r.employeeName}`.includes(employee.trim())))
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }

  function reset() {
    setYear(today.getFullYear()); setMonth(today.getMonth() + 1); setSubmitDate(ymd(today)); setPurpose('지급자보관용'); setEmployee('')
  }

  const address = [company?.address, company?.addressDetail].filter(Boolean).join(' ')
  const years = [today.getFullYear() + 1, today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2]

  return (
    <EcListShell title="일용근로소득지급명세서(원천징수영수증)" onSearch={search} collapseConditions={rows !== null}
                 actions={rows ? [{ label: '인쇄', primary: true }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="세무신고사업장" span="full">
          <select className="ec-input w-full" disabled value=""><option value="">{company?.name ?? ''} {company?.bizRegNo ?? ''}</option></select>
        </EcCond>
        <EcCond label="사원" span="full">
          <input className="ec-input w-full" placeholder="사원" value={employee} onChange={(e) => setEmployee(e.target.value)} />
        </EcCond>
        <EcCond label="지급연월" span="full">
          <select className="ec-input w-[200px]" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="ec-input w-[200px]" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
          </select>
        </EcCond>
        <EcCond label="제출일자" span="full">
          <input type="date" className="ec-input w-[150px]" value={submitDate} onChange={(e) => setSubmitDate(e.target.value)} />
        </EcCond>
        <EcCond label="출력용도" span="full">
          {(['지급자보관용', '소득자보관용'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="dr-purpose" checked={purpose === v} onChange={() => setPurpose(v)} /> {v}
            </label>
          ))}
        </EcCond>
        {rows === null && (
          <li className="full">
            <div className="form">
              <button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
              <button className="ec-btn" onClick={reset}>다시 작성</button>
            </div>
          </li>
        )}
      </ul>

      {rows && (
        <table className="w-full text-center">
          <thead>
            <tr>
              <th className="w-[47px]"></th><th>사원번호</th><th>사원명</th><th>주민등록번호</th>
              <th className="text-right">총지급액</th><th className="text-right">비과세총액</th>
              <th className="text-right">소득세</th><th className="text-right">지방소득세</th><th>인쇄</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.employeeId}>
                <td>{i + 1}</td>
                <td>{r.employeeCode ?? ''}</td>
                <td>{r.employeeName}</td>
                <td></td>
                <td className="text-right">{wonBlank(r.totalPay)}</td>
                <td className="text-right">{wonBlank(r.nonTaxable)}</td>
                <td className="text-right">{wonBlank(r.incomeTax)}</td>
                <td className="text-right">{wonBlank(r.localIncomeTax)}</td>
                <td><button className="ec-link" onClick={() => setPrinting(r)}>인쇄</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {printing && (
        <Modal open title="일용근로소득 지급명세서" width={900} error={error} onClose={() => setPrinting(null)}>
          <ReceiptSheet r={printing} year={year} month={month} submitDate={submitDate} purpose={purpose} company={company} address={address} />
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn" onClick={() => setPrinting(null)}>닫기</button>
          </div>
        </Modal>
      )}
    </EcListShell>
  )
}

/** 줄 [인쇄] — [별지 제24호4서식(3)] 일용근로소득 지급명세서(원천징수영수증), 원본 2026-10-14 글자 차례 그대로. */
function ReceiptSheet({ r, year, month, submitDate, purpose, company, address }: {
  r: DailyReceipt; year: number; month: number; submitDate: string; purpose: '지급자보관용' | '소득자보관용'; company: Company | null; address: string
}) {
  const [y, m, d] = submitDate.split('-')
  return (
    <>
      <p>■ 소득세법 시행규칙 [별지 제24호4서식(3)] &lt;개정 2023. 3. 20&gt; (3쪽 중 제1쪽)</p>
      <div className="ec-report-title">일용근로소득 지급명세서 (원천징수영수증)</div>
      <p className="text-center mb-[8px]">
        ([{purpose === '소득자보관용' ? ' v ' : ' '}] 소득자 보관용 [{purpose === '지급자보관용' ? ' v ' : ' '}] 지급자 보관용)
      </p>
      <p className="text-right mb-[4px]">외국인 여부 아니오</p>
      <table className="w-full ec-report ec-report-head400 mb-[12px]">
        <tbody>
          <tr><th rowSpan={3}>원천징수의무자(지급자)</th><th>① 상호(법인명)</th><td>{company?.name ?? ''}</td><th>② 성명(대표자)</th><td>{company?.ceo ?? ''}</td></tr>
          <tr><th>③ 사업자등록번호</th><td>{company?.bizRegNo ?? ''}</td><th>④ 주민등록번호(법인등록번호)</th><td>{company?.corpRegNo ?? ''}</td></tr>
          <tr><th>⑤ 소재지(주소)</th><td>{address}</td><th>⑥ 전화번호</th><td>{company?.tel ?? ''}</td></tr>
          <tr><th rowSpan={2}>소득자</th><th>⑦ 성명</th><td>{r.employeeName}</td><th>⑧ 주민등록번호</th><td></td></tr>
          <tr><th>⑨ 주소</th><td></td><th>⑩ 전화번호</th><td></td></tr>
        </tbody>
      </table>
      <table className="w-full ec-report ec-report-head400 mb-[12px]">
        <tbody>
          <tr>
            <th>⑪ 귀속연도</th><td>{year} 년</td><th>⑫ 지급월</th>
            <td colSpan={5}>{Array.from({ length: 12 }, (_, i) => `[ ${month === i + 1 ? 'O' : ' '} ] ${i + 1}월`).join('  ')}</td>
          </tr>
          <tr>
            <th className="text-center">⑬ 근무월</th><th className="text-right">⑭ 근무일수</th><th className="text-center">⑮ 최종근무일</th>
            <th className="text-right">⑯ 과세소득</th><th className="text-right">⑰ 비과세소득</th>
            <th className="text-right">⑱ 소득세</th><th className="text-right">⑲ 지방소득세</th><th></th>
          </tr>
          <tr>
            <td className="text-center">{month}</td>
            <td className="text-right">{Number(r.days)}</td>
            <td className="text-center">{r.lastDate ? r.lastDate.slice(8) : ''}</td>
            <td className="text-right">{won(r.totalPay)}</td>
            <td className="text-right">{won(r.nonTaxable)}</td>
            <td className="text-right">{won(r.incomeTax)}</td>
            <td className="text-right">{won(r.localIncomeTax)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
      <p className="mt-[12px]">위의 일용근로소득(원천징수세액)을 지급(영수)합니다.</p>
      <p className="text-center my-[8px]">{y} 년 {m} 월 {d} 일</p>
      <p className="text-right">징수의무자(지급자) {company?.ceo ?? ''} (서명 또는 인)</p>
    </>
  )
}

import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { DailyReceipt, SimplePaymentSheet } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { DailySheet, type Company } from './SimplePaymentPage'

const won = (n: number) => Number(n).toLocaleString('ko-KR')

/**
 * 원천징수영수증(일용직) (원본 세무 › 원천징수 › 일용근로 C000733 '일용근로소득지급명세서(원천징수영수증)', 2026-10-04 실측).
 *
 * <p>조건 판이 펼쳐진 채 시작 — 세무신고사업장 · 사원 · 지급연월(연도 + 달, 기본 이번 달) · 제출일자(오늘) ·
 * 출력용도(◉지급자보관용 ○소득자보관용), [검색(F8) · 다시 작성]. 목록 [사원번호 · 사원명 · 주민등록번호 · 총지급액 · 비과세총액 ·
 * 소득세 · 지방소득세 · 인쇄], 하단 [Email · 인쇄]. 원본은 2026/06 · 2025/08 모두 '등록된 데이터가 없습니다.' 여서
 * 줄의 [인쇄] 서식은 못 쟀다 — 우리는 지급명세서(일용직)의 서식을 그 사원 한 사람으로 찍는다.
 * 주민등록번호 열 · Email(바깥 발송)은 두지 않는다.
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

  const sheetOf = (r: DailyReceipt): SimplePaymentSheet => ({
    statement: {
      id: 0, kind: 'DAILY', kindName: '일용근로소득', payYear: year, period: month, reportDate: submitDate,
      managerDept: '', managerName: '', managerPhone: '', submitter: 'DIRECT', submitterName: '',
    },
    labor: [], payees: [],
    daily: [{ name: r.employeeName, days: r.days, lastDate: r.lastDate, taxable: r.totalPay, incomeTax: r.incomeTax, localIncomeTax: r.localIncomeTax }],
  })
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
              <th className="w-[47px]"></th><th>사원번호</th><th>사원명</th>
              <th className="text-right">총지급액</th><th className="text-right">비과세총액</th>
              <th className="text-right">소득세</th><th className="text-right">지방소득세</th><th>인쇄</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.employeeId}>
                <td>{i + 1}</td>
                <td>{r.employeeCode ?? ''}</td>
                <td>{r.employeeName}</td>
                <td className="text-right">{won(r.totalPay)}</td>
                <td className="text-right">{won(r.nonTaxable)}</td>
                <td className="text-right">{won(r.incomeTax)}</td>
                <td className="text-right">{won(r.localIncomeTax)}</td>
                <td><button className="ec-link" onClick={() => setPrinting(r)}>인쇄</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {printing && (
        <Modal open title={`일용근로소득 지급명세서(원천징수영수증) — ${purpose}`} width={900} error={error} onClose={() => setPrinting(null)}>
          <DailySheet sheet={sheetOf(printing)} company={company} address={address} />
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn" onClick={() => setPrinting(null)}>닫기</button>
          </div>
        </Modal>
      )}
    </EcListShell>
  )
}

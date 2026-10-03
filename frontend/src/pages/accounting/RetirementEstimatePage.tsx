import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { RetirementEstimateRow } from '../../types/api'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

const won = (n: number) => Number(n).toLocaleString('ko-KR')
type Dept = { id: number; name: string }

/**
 * 퇴직급여추계액 (원본 세무 › 원천징수 › 출력물 E030108, 2026-10-04 loginaa 실측).
 *
 * <p>조건 판이 펼쳐진 채 시작 — 기준일(연 · 월, 기본 이번 달) · 사원번호 · 부서 · 정산시작일(◉입사기준 ○중간정산기준) ·
 * 급여반영기준 · 상여반영기준(○귀속연월 ◉지급일) · 기타구분(□1년 미만자 포함), [검색(F8) · 다시작성].
 * 격자 [No. · 사원번호 · 성명 · 정산시작일 · 3개월동안급여 · 1년상여합계(3개월로환산) · 근속일수(년 · 월 · 일) · 3개월근무일수 ·
 * 재직일수 · 퇴직급여] + '합계 [n명]', 하단 [인쇄 · Excel]. 원본 2026/10 합계 [30명] 129,210,221.
 * 우리 급여명세는 귀속연월 하나라 급여 · 상여반영기준은 늘 귀속연월로 센다. 중간정산이 없어 정산시작일은 늘 입사일이다.
 */
export default function RetirementEstimatePage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [employeeCode, setEmployeeCode] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [startBasis, setStartBasis] = useState<'입사기준' | '중간정산기준'>('입사기준')
  const [payBasis, setPayBasis] = useState<'귀속연월' | '지급일'>('지급일')
  const [bonusBasis, setBonusBasis] = useState<'귀속연월' | '지급일'>('지급일')
  const [underOne, setUnderOne] = useState(false)
  const [depts, setDepts] = useState<Dept[]>([])
  const [rows, setRows] = useState<RetirementEstimateRow[] | null>(null)
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '퇴직급여추계액', [rows])

  useEffect(() => {
    api.get<Dept[]>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }, [])

  async function search() {
    setError('')
    try {
      const params = {
        baseMonth: `${year}-${String(month).padStart(2, '0')}`,
        employeeCode: employeeCode.trim() || undefined,
        departmentId: departmentId || undefined,
        includeUnderOneYear: underOne,
      }
      setRows((await api.get<RetirementEstimateRow[]>('/retirement-pays/estimate', { params })).data)
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }

  function reset() {
    setYear(today.getFullYear()); setMonth(today.getMonth() + 1); setEmployeeCode(''); setDepartmentId('')
    setStartBasis('입사기준'); setPayBasis('지급일'); setBonusBasis('지급일'); setUnderOne(false)
  }

  const radio = <T extends string>(name: string, value: T, set: (v: T) => void, options: T[]) => options.map((v) => (
    <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
      <input type="radio" name={name} checked={value === v} onChange={() => set(v)} /> {v}
    </label>
  ))
  const years = [today.getFullYear() + 1, today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2]
  const list = rows ?? []

  return (
    <EcListShell title="퇴직급여추계액" onSearch={search} option={false} collapseConditions={rows !== null}
                 actions={rows ? [{ label: '인쇄', primary: true }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일" span="full">
          <select className="ec-input w-[80px]" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="ec-input w-[60px]" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </EcCond>
        <EcCond label="사원번호" span="full">
          <input className="ec-input w-full" placeholder="사원번호" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
        </EcCond>
        <EcCond label="부서" span="full">
          <select className="ec-input w-full" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">부서</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="정산시작일" span="full">{radio('re-start', startBasis, setStartBasis, ['입사기준', '중간정산기준'])}</EcCond>
        <EcCond label="급여반영기준" span="full">{radio('re-pay', payBasis, setPayBasis, ['귀속연월', '지급일'])}</EcCond>
        <EcCond label="상여반영기준" span="full">{radio('re-bonus', bonusBasis, setBonusBasis, ['귀속연월', '지급일'])}</EcCond>
        <EcCond label="기타구분" span="full">
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={underOne} onChange={(e) => setUnderOne(e.target.checked)} /> 1년 미만자 포함
          </label>
        </EcCond>
        {rows === null && (
          <li className="full">
            <div className="form">
              <button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
              <button className="ec-btn" onClick={reset}>다시작성</button>
            </div>
          </li>
        )}
      </ul>

      {rows && (
        <table ref={tableRef} className="w-full">
          <thead>
            <tr>
              <th rowSpan={2}>No.</th><th rowSpan={2}>사원번호</th><th rowSpan={2}>성명</th><th rowSpan={2}>정산시작일</th>
              <th rowSpan={2}>3개월동안급여</th><th rowSpan={2}>1년상여합계<br />(3개월로환산)</th>
              <th colSpan={3}>근속일수</th>
              <th rowSpan={2}>3개월근무일수</th><th rowSpan={2}>재직일수</th><th rowSpan={2}>퇴직급여</th>
            </tr>
            <tr><th>년</th><th>월</th><th>일</th></tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : list.map((r, i) => (
              <tr key={r.employeeId}>
                <td className="text-center">{i + 1}</td>
                <td>{r.employeeCode ?? ''}</td>
                <td>{r.employeeName}</td>
                <td className="text-center">{r.startDate.replace(/-/g, ' / ')}</td>
                <td className="text-right">{won(r.threeMonthPay)}</td>
                <td className="text-right">{won(r.bonusThreeMonths)}</td>
                <td className="text-right">{r.years}</td>
                <td className="text-right">{r.months}</td>
                <td className="text-right">{r.days}</td>
                <td className="text-right">{r.threeMonthDays}</td>
                <td className="text-right">{won(r.serviceDays)}</td>
                <td className="text-right">{won(r.retirementPay)}</td>
              </tr>
            ))}
          </tbody>
          {list.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={11} className="text-center">합계 [{list.length}명]</td>
                <td className="text-right">{won(list.reduce((t, r) => t + Number(r.retirementPay), 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </EcListShell>
  )
}

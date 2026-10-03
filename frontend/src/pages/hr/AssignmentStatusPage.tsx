import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks, { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { slipLabel, type AssignmentLine } from '../../features/assignment/types'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 관리 &gt; 인사관리 &gt; 인사발령 &gt; <b>인사발령현황</b> (원본 E020720).
 *
 * <p>2026-10-03 loginaa 실측: 조건이 펼쳐진 현황 — 기준일자(전월+금월) · 발령일자(사용) · 사원 · 발령구분 · 입사구분 ·
 * 직위/직급 · 부서 · 적요 · 재직구분(전체 · 재직자 · 퇴직자). 결과 머리 '회사명 : …' · 기간, 격자 일자-No. · 발령일자 · 사번 ·
 * 성명 · 발령구분명 · 입사구분명 · 이전 직위/직급 · 발령 직위/직급 · 이전 부서 · 발령 부서 · 적요(발령 줄마다 한 줄, 합계 없음).
 * 버튼 인쇄 · Excel. 발령일자 · 입사구분 · 직위 조건 · 정렬/소계기준은 없다.
 */
export default function AssignmentStatusPage() {
  const [range, setRange] = useState(() => periodOf('전월+금월')!)
  const [empCond, setEmpCond] = useState('')
  const [deptCond, setDeptCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [employment, setEmployment] = useState<'all' | 'active' | 'resigned'>('all')
  const [lines, setLines] = useState<AssignmentLine[]>([])
  const [shownRange, setShownRange] = useState(range)
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<AssignmentLine[]>('/employees/assignment-slips', { params: { from: range.from, to: range.to } })
      .then((r) => { setLines(r.data); setShownRange(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const has = (s: string | null | undefined, q: string) => !q || (s ?? '').includes(q)
  const shown = lines.filter((l) =>
    (has(l.employeeName, empCond) || has(l.employeeCode, empCond))
    && (has(l.department, deptCond) || has(l.prevDepartment, deptCond))
    && has(l.remark, remarkCond)
    && (employment === 'all' || (employment === 'active') === l.employeeActive))
  useTableColumnCheck(tableRef, '인사발령현황', [shown.length])

  return (
    <EcListShell title="인사발령현황" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[150px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="date" className="ec-input w-[150px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="사원"><input className="ec-input w-full" placeholder="사원" value={empCond} onChange={(e) => setEmpCond(e.target.value)} /></EcCond>
        <EcCond label="부서"><input className="ec-input w-full" placeholder="부서" value={deptCond} onChange={(e) => setDeptCond(e.target.value)} /></EcCond>
        <EcCond label="적요"><input className="ec-input w-full" placeholder="적요" value={remarkCond} onChange={(e) => setRemarkCond(e.target.value)} /></EcCond>
        <EcCond label="재직구분">
          {([['all', '전체'], ['active', '재직자'], ['resigned', '퇴직자']] as const).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-[4px] mr-[10px]">
              <input type="radio" name="employment" checked={employment === v} onChange={() => setEmployment(v)} /> {l}
            </label>
          ))}
        </EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        <EcPeriodPicks labels={STATUS_PICKS} currentFrom={range.from} onPick={setRange} />
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="text-center font-bold mb-[2px]">인사발령현황</div>
      <div className="text-ec-hint mb-[4px]">{shownRange.from.replace(/-/g, '/')} ~ {shownRange.to.replace(/-/g, '/')}</div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              <th>일자-No.</th>
              <th>발령일자</th>
              <th>사번</th>
              <th>성명</th>
              <th>발령구분명</th>
              <th>입사구분명</th>
              <th>이전 직위/직급</th>
              <th>발령 직위/직급</th>
              <th>이전 부서</th>
              <th>발령 부서</th>
              <th>적요</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((l) => (
              <tr key={l.id}>
                <td>{slipLabel(l)}</td>
                <td>{l.assignDate.replace(/-/g, '/')}</td>
                <td>{l.employeeCode}</td>
                <td>{l.employeeName}</td>
                <td>{l.typeName}</td>
                <td>{l.hireKind ?? ''}</td>
                <td>{l.prevJobTitle}</td>
                <td>{l.jobTitle}</td>
                <td>{l.prevDepartment}</td>
                <td>{l.department}</td>
                <td>{l.remark ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}

import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import EcPeriodPicks, { INQUIRY_PICKS } from '../../../components/EcPeriodPicks'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/CodePickerField'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import { isHoliday, koreanDateTime, monthToToday, slashDate, type EmployeeCommuteLine } from '../types'

type Tri = 'all' | 'a' | 'b'

/**
 * 출/퇴근현황(사원) · 지각현황(사원) 이 같이 쓰는 몸통 — 조건 판(기간 금월(~오늘) · 사원명 · 부서 · 내/외근구분 · 업무일/휴일구분 ·
 * 재직구분) · 빠른선택(금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일) · 결과 머리(회사명 · 기간) · 격자.
 * 열만 다르다. 사원명 · 부서는 여러 개 고르는 코드도움. 정렬/소계기준 · 모든날짜검색 · 양식은 없다.
 */
export default function EmployeeCommuteStatusView({ title, lateOnly }: { title: string; lateOnly: boolean }) {
  const [range, setRange] = useState(monthToToday())
  const [shown, setShown] = useState(range)
  const [empCond, setEmpCond] = useState<string[]>([])
  const [deptCond, setDeptCond] = useState<string[]>([])
  const [empList, setEmpList] = useState<{ id: number; code: string; name: string; department: string }[]>([])
  const [deptList, setDeptList] = useState<{ code?: string | null; name: string }[]>([])
  useEffect(() => {
    api.get<typeof empList>('/employees/all').then((r) => setEmpList(r.data)).catch(() => setEmpList([]))
    api.get<typeof deptList>('/departments').then((r) => setDeptList(r.data)).catch(() => setDeptList([]))
  }, [])
  const [place, setPlace] = useState<Tri>('all')
  const [dayKind, setDayKind] = useState<Tri>('all')
  const [employment, setEmployment] = useState<Tri>('all')
  const [rows, setRows] = useState<EmployeeCommuteLine[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<EmployeeCommuteLine[]>('/hr/employee-commutes', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShown(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const list = rows.filter((r) => (!lateOnly || r.late)
    && (empCond.length === 0 || empCond.includes(String(r.employeeId)))
    && (deptCond.length === 0 || deptCond.includes(r.department))
    && (place === 'all' || (place === 'b') === r.outside)
    && (dayKind === 'all' || (dayKind === 'b') === isHoliday(r.workDate))
    && (employment === 'all' || (employment === 'a') === r.employeeActive))
  useTableColumnCheck(tableRef, title, [list.length])

  const radios = (name: string, value: Tri, set: (v: Tri) => void, labels: [string, string, string]) => (
    <>
      {(['all', 'a', 'b'] as const).map((v, i) => (
        <label key={v} className="inline-flex items-center gap-[4px] mr-[10px]">
          <input type="radio" name={name} checked={value === v} onChange={() => set(v)} /> {labels[i]}
        </label>
      ))}
    </>
  )

  return (
    <EcListShell title={title} searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기간">
          <input type="date" className="ec-input w-[150px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="date" className="ec-input w-[150px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="사원명">
          <CodePickerField label="사원명" hideLabel fill multiple placeholder="사원명" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={empList.map((e) => ({ value: String(e.id), code: e.code, name: e.name, sub: e.department }))} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
                           items={deptList.map((d) => ({ value: d.name, code: d.code ?? undefined, name: d.name }))} />
        </EcCond>
        <EcCond label="내/외근구분">{radios(`${title}-place`, place, setPlace, ['전체', '내근', '외근'])}</EcCond>
        <EcCond label="업무일/휴일구분">{radios(`${title}-day`, dayKind, setDayKind, ['전체', '업무일', '휴일'])}</EcCond>
        <EcCond label="재직구분">{radios(`${title}-emp`, employment, setEmployment, ['전체', '재직자', '퇴사자'])}</EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={range.from} onPick={setRange} />
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="text-center font-bold mb-[2px]">{title}</div>
      <div className="text-ec-hint mb-[4px]">{slashDate(shown.from)} ~ {slashDate(shown.to)}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          {lateOnly ? (
            <tr><th className="text-center">일자</th><th>사원명</th><th>출근시간</th><th>출근입력시간</th><th>출근적요</th></tr>
          ) : (
            <tr><th className="text-center">일자</th><th>사원명</th><th>출근시간</th><th>퇴근시간</th><th className="text-right">근무시간(시간단위)</th></tr>
          )}
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : list.map((r) => (lateOnly ? (
            <tr key={r.id}>
              <td className="text-center">{slashDate(r.workDate)}</td>
              <td>{r.employeeName}</td>
              <td>{koreanDateTime(r.clockIn)}</td>
              <td>{koreanDateTime(r.enteredAt?.slice(0, 19) ?? null)}</td>
              <td>{r.reason ?? ''}</td>
            </tr>
          ) : (
            <tr key={r.id}>
              <td className="text-center">{slashDate(r.workDate)}</td>
              <td>{r.employeeName}</td>
              <td>{koreanDateTime(r.clockIn)}</td>
              <td>{koreanDateTime(r.clockOut)}</td>
              <td className="text-right">{r.workMinutes == null ? '' : (r.workMinutes / 60).toFixed(2)}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </EcListShell>
  )
}

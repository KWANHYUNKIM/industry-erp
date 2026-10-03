import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks, { INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster } from '../../types/api'
import { isHoliday, koreanDateTime, monthToToday, slashDate, type EmployeeCommuteLine } from '../../features/employeecommute/types'
import { ymd } from '../../utils/periods'

interface Vacation { empCode: string | null; type: string; startDate: string; endDate: string; days: number; reason: string | null; status: string }
interface Kind { code: string; name: string; vacationKindName: string | null; vacationKindId: number | null; kindGroup: string | null }
type Status = '정상근무' | '지각' | '조기퇴근' | '결근'
const STATUSES: Status[] = ['정상근무', '지각', '조기퇴근', '결근']
type Tri = 'all' | 'a' | 'b'
const WORK_END = '18:00'

/**
 * 관리 &gt; 근태관리 &gt; 출/퇴근(사원) &gt; <b>출퇴근/근태현황(사원)</b> (원본 E020728).
 *
 * <p>2026-10-03 loginaa 실측: 기간 금월(~오늘) 동안 <b>날마다 재직 사원 전부</b>를 한 줄씩 — 일자 · 사원명 · 출근시간 · 퇴근시간 ·
 * 근무시간(시간단위) · 근태내역('2024연차/2024 연차/1.00' = 근태항목/휴가항목/일수) · 적요, 끝에 합계.
 * 조건 기간 · 사원명 · 부서 · 내/외근구분 · 근태구분(☑정상근무 · 지각 · 조기퇴근 · 결근) · 업무일/휴일구분 · 프로젝트 · 근태항목 ·
 * 휴가항목 · 근태그룹 · 적요 · 상태(결재중 · UserPay · 확인) · 재직구분(기본 재직자).
 *
 * <p>근태구분은 우리 기준으로 가른다: 지각 = 09:00 넘어 출근, 조기퇴근 = 18:00 전에 퇴근, 결근 = 업무일에 출근도 근태도 없음,
 * 나머지 정상근무. 근태는 사번이 이어진 계정의 근태입력이다. 사원명 · 부서 · 근태항목 · 휴가항목 · 근태그룹은 여러 개 고르는 코드도움
 * (휴가항목 · 근태그룹은 그날 근태의 근태항목이 가리키는 값). 상태는 근태의 결재 상태(결재중 · 확인, 처음엔 다 켬 —
 * 2026-10-04 실측, UserPay 는 우리에 없다). 반려된 근태는 어느 상태에도 안 들어 근태내역에 안 찍힌다. 프로젝트 · 양식은 없다.
 */
export default function EmployeeCommuteAttendancePage() {
  const [range, setRange] = useState(monthToToday())
  const [shown, setShown] = useState(range)
  const [empCond, setEmpCond] = useState<string[]>([])
  const [deptCond, setDeptCond] = useState<string[]>([])
  const [kindCond, setKindCond] = useState<string[]>([])
  const [vkCond, setVkCond] = useState<string[]>([])
  const [groupCond, setGroupCond] = useState<string[]>([])
  const [depts, setDepts] = useState<{ code?: string | null; name: string }[]>([])
  const [vkMaster, setVkMaster] = useState<{ id: number; code: string; name: string }[]>([])
  const [groupMaster, setGroupMaster] = useState<{ code: string; name: string }[]>([])
  useEffect(() => {
    api.get<typeof depts>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
    api.get<typeof vkMaster>('/hr/vacation-kinds').then((r) => setVkMaster(r.data)).catch(() => setVkMaster([]))
    api.get<typeof groupMaster>('/hr/attendance-kind-groups').then((r) => setGroupMaster(r.data)).catch(() => setGroupMaster([]))
  }, [])
  const [remarkCond, setRemarkCond] = useState('')
  const [place, setPlace] = useState<Tri>('all')
  const [dayKind, setDayKind] = useState<Tri>('all')
  const [employment, setEmployment] = useState<Tri>('a')
  const [statuses, setStatuses] = useState<Set<Status>>(new Set(STATUSES))
  const [vacStatuses, setVacStatuses] = useState<Set<'PENDING' | 'APPROVED'>>(new Set(['PENDING', 'APPROVED']))
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [commutes, setCommutes] = useState<EmployeeCommuteLine[]>([])
  const [vacations, setVacations] = useState<Vacation[]>([])
  const [kinds, setKinds] = useState<Kind[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  async function search() {
    setError('')
    try {
      const [e, c, v, k] = await Promise.all([
        api.get<EmployeeMaster[]>('/employees/all'),
        api.get<EmployeeCommuteLine[]>('/hr/employee-commutes', { params: { from: range.from, to: range.to } }),
        api.get<Vacation[]>('/hr/vacations', { params: { from: `${range.from.slice(0, 4)}-01-01`, to: range.to } }),
        api.get<Kind[]>('/hr/attendance-kinds'),
      ])
      setEmployees(e.data); setCommutes(c.data); setVacations(v.data); setKinds(k.data); setShown(range)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  useEffect(() => { search() }, [])

  const days: string[] = []
  for (let d = new Date(`${shown.from}T00:00:00`); ymd(d) <= shown.to; d.setDate(d.getDate() + 1)) days.push(ymd(d))
  const vacName = (type: string) => kinds.find((k) => k.name === type)?.vacationKindName ?? ''

  const rows = days.flatMap((date) => employees
    .filter((e) => employment === 'all' || (employment === 'a') === e.active)
    .filter((e) => (!e.hireDate || e.hireDate <= date) && (!e.resignDate || e.resignDate >= date || employment !== 'a'))
    .map((e) => {
      const c = commutes.find((x) => x.employeeId === e.id && x.workDate === date)
      const vs = vacations.filter((v) => v.empCode === e.code && v.startDate <= date && v.endDate >= date && (vacStatuses as Set<string>).has(v.status))
      const holiday = isHoliday(date)
      const status: Status = c ? (c.late ? '지각' : c.clockOut && c.clockOut.slice(11, 16) < WORK_END ? '조기퇴근' : '정상근무')
        : (!holiday && vs.length === 0 ? '결근' : '정상근무')
      return { key: `${date}-${e.id}`, date, e, c, vs, holiday, status }
    }))
    .filter((r) => (empCond.length === 0 || empCond.includes(String(r.e.id)))
      && (deptCond.length === 0 || deptCond.includes(r.e.department))
      && (place === 'all' || (r.c != null && (place === 'b') === r.c.outside))
      && (dayKind === 'all' || (dayKind === 'b') === r.holiday)
      && statuses.has(r.status)
      && (kindCond.length === 0 || r.vs.some((v) => kindCond.includes(v.type)))
      && (vkCond.length === 0 || r.vs.some((v) => vkCond.includes(String(kinds.find((k) => k.name === v.type)?.vacationKindId ?? ''))))
      && (groupCond.length === 0 || r.vs.some((v) => groupCond.includes(kinds.find((k) => k.name === v.type)?.kindGroup ?? '')))
      && (!remarkCond || r.vs.some((v) => (v.reason ?? '').includes(remarkCond)) || (r.c?.reason ?? '').includes(remarkCond)))
  useTableColumnCheck(tableRef, '출퇴근/근태현황(사원)', [rows.length])
  const totalHours = rows.reduce((s, r) => s + (r.c?.workMinutes ?? 0), 0) / 60

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
    <EcListShell title="출퇴근/근태현황(사원)" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기간">
          <input type="date" className="ec-input w-[150px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="date" className="ec-input w-[150px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="사원명">
          <CodePickerField label="사원명" hideLabel fill multiple placeholder="사원명" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name, sub: e.department }))} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
                           items={depts.map((d) => ({ value: d.name, code: d.code ?? undefined, name: d.name }))} />
        </EcCond>
        <EcCond label="내/외근구분">{radios('eca-place', place, setPlace, ['전체', '내근', '외근'])}</EcCond>
        <EcCond label="근태구분">
          <label className="inline-flex items-center gap-[4px] mr-[10px]">
            <input type="checkbox" checked={statuses.size === STATUSES.length}
                   onChange={(e) => setStatuses(e.target.checked ? new Set(STATUSES) : new Set())} /> 전체
          </label>
          {STATUSES.map((s) => (
            <label key={s} className="inline-flex items-center gap-[4px] mr-[10px]">
              <input type="checkbox" checked={statuses.has(s)}
                     onChange={() => { const n = new Set(statuses); if (n.has(s)) n.delete(s); else n.add(s); setStatuses(n) }} /> {s}
            </label>
          ))}
        </EcCond>
        <EcCond label="업무일/휴일구분">{radios('eca-day', dayKind, setDayKind, ['전체', '업무일', '휴일'])}</EcCond>
        <EcCond label="근태항목">
          <CodePickerField label="근태항목" hideLabel fill multiple placeholder="근태항목" values={kindCond} onChangeMulti={(v) => setKindCond(v)}
                           items={kinds.map((k) => ({ value: k.name, code: k.code, name: k.name }))} />
        </EcCond>
        <EcCond label="휴가항목">
          <CodePickerField label="휴가항목" hideLabel fill multiple placeholder="휴가항목" values={vkCond} onChangeMulti={(v) => setVkCond(v)}
                           items={vkMaster.map((v) => ({ value: String(v.id), code: v.code, name: v.name }))} />
        </EcCond>
        <EcCond label="근태그룹">
          <CodePickerField label="근태그룹" hideLabel fill multiple placeholder="근태그룹" values={groupCond} onChangeMulti={(v) => setGroupCond(v)}
                           items={groupMaster.map((g) => ({ value: g.name, code: g.code, name: g.name }))} />
        </EcCond>
        <EcCond label="적요"><input className="ec-input w-full" placeholder="적요" value={remarkCond} onChange={(e) => setRemarkCond(e.target.value)} /></EcCond>
        <EcCond label="상태">
          <label className="inline-flex items-center gap-[4px] mr-[10px]">
            <input type="checkbox" checked={vacStatuses.size === 2} onChange={(e) => setVacStatuses(new Set(e.target.checked ? ['PENDING', 'APPROVED'] : []))} /> 전체
          </label>
          {([['PENDING', '결재중'], ['APPROVED', '확인']] as const).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-[4px] mr-[10px]">
              <input type="checkbox" checked={vacStatuses.has(v)} onChange={(e) => {
                const next = new Set(vacStatuses); if (e.target.checked) next.add(v); else next.delete(v); setVacStatuses(next)
              }} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="재직구분">{radios('eca-emp', employment, setEmployment, ['전체', '재직자', '퇴사자'])}</EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={range.from} onPick={setRange} />
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="text-center font-bold mb-[2px]">출퇴근/근태현황(사원)</div>
      <div className="text-ec-hint mb-[4px]">{slashDate(shown.from)} ~ {slashDate(shown.to)}</div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              <th className="text-center">일자</th>
              <th>사원명</th>
              <th>출근시간</th>
              <th>퇴근시간</th>
              <th className="text-right">근무시간(시간단위)</th>
              <th>근태내역</th>
              <th>적요</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="text-center">{slashDate(r.date)}</td>
                    <td>{r.e.name}</td>
                    <td>{koreanDateTime(r.c?.clockIn ?? null)}</td>
                    <td>{koreanDateTime(r.c?.clockOut ?? null)}</td>
                    <td className="text-right">{r.c?.workMinutes == null ? '' : (r.c.workMinutes / 60).toFixed(2)}</td>
                    <td>{r.vs.map((v) => `${v.type}/${vacName(v.type)}/${Number(v.days).toFixed(2)}`).join(', ')}</td>
                    <td>{[...r.vs.map((v) => v.reason ?? ''), r.c?.reason ?? ''].filter(Boolean).join(', ')}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td colSpan={4} className="text-center">합계</td>
                  <td className="text-right">{totalHours ? totalHours.toFixed(2) : ''}</td>
                  <td colSpan={2}></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}

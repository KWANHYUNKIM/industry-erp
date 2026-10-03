import { useEffect, useState } from 'react'
import CodePickerField from '../../../components/CodePickerField'
import { EcCond } from '../../../components/EcStatusPanel'
import { periodOf } from '../../../components/EcPeriodPicks'
import { api } from '../../../api/client'
import type { Department, EmployeeMaster } from '../../../types/api'
import { ASSIGNMENT_KINDS, type AssignmentLine } from '../types'

/**
 * 인사발령조회 · 인사발령현황의 조건 판 (원본 E020602 · E020720, 2026-10-03 loginaa 실측).
 *
 * <p>기준일자 · 발령일자([사용] 을 켜면 기간이 펴지고 기준일자와 같은 값으로 시작) · 사원 · 발령구분 · 입사구분 ·
 * 직위/직급 · 부서 · 적요. 코드도움은 모두 여러 개를 고른다(원본 창에 체크칸). 원본 발령구분 창은 회사 코드
 * '00001 인사발령' 하나, 입사구분 창은 '100 신입 · 200 경력' — 우리 발령구분은 고정 유형이고 입사구분은 글자라,
 * 입사구분 · 직위/직급 후보는 신입 · 경력 + 불러온 발령 줄에 적힌 값으로 띄운다.
 * 기준일자는 전표 일자, 발령일자는 줄의 발령일자로 거른다.
 */
export interface AssignmentCondState {
  range: { from: string; to: string }
  useAssignDate: boolean
  assignRange: { from: string; to: string }
  employeeIds: string[]
  kinds: string[]
  hireKinds: string[]
  jobTitles: string[]
  departmentIds: string[]
  remark: string
}

export function initialAssignmentConds(): AssignmentCondState {
  const range = periodOf('전월+금월')!
  return { range, useAssignDate: false, assignRange: range, employeeIds: [], kinds: [], hireKinds: [], jobTitles: [], departmentIds: [], remark: '' }
}

/** 기준일자는 서버가 거른다. 나머지를 줄마다 본다. */
export function matchAssignment(c: AssignmentCondState, l: AssignmentLine): boolean {
  const inList = (list: string[], ...vs: (string | number | null | undefined)[]) =>
    list.length === 0 || vs.some((v) => v != null && v !== '' && list.includes(String(v)))
  return (!c.useAssignDate || (l.assignDate >= c.assignRange.from && l.assignDate <= c.assignRange.to))
    && inList(c.employeeIds, l.employeeId)
    && inList(c.kinds, l.type)
    && inList(c.hireKinds, l.hireKind)
    && inList(c.jobTitles, l.jobTitle, l.prevJobTitle)
    && inList(c.departmentIds, l.departmentId, l.prevDepartmentId)
    && (!c.remark || (l.remark ?? '').includes(c.remark))
}

const uniq = (vs: (string | null | undefined)[]) => [...new Set(vs.filter((v): v is string => !!v))]

export default function AssignmentConds({ value, onChange, lines }: {
  value: AssignmentCondState
  onChange: (next: AssignmentCondState) => void
  /** 입사구분 · 직위/직급 후보를 뽑을 발령 줄 */
  lines: AssignmentLine[]
}) {
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  useEffect(() => {
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<Department[]>('/departments').then((r) => setDepartments(r.data)).catch(() => setDepartments([]))
  }, [])
  const set = (patch: Partial<AssignmentCondState>) => onChange({ ...value, ...patch })
  const hireItems = uniq(['신입', '경력', ...lines.map((l) => l.hireKind)]).map((v) => ({ value: v, name: v }))
  const titleItems = uniq([...employees.map((e) => e.jobTitle), ...lines.flatMap((l) => [l.jobTitle, l.prevJobTitle])])
    .map((v) => ({ value: v, name: v }))
  const { range, assignRange } = value

  return (
    <>
      <EcCond label="기준일자">
        <input type="date" className="ec-input w-[150px]" value={range.from} onChange={(e) => set({ range: { ...range, from: e.target.value } })} />
        ~
        <input type="date" className="ec-input w-[150px]" value={range.to} onChange={(e) => set({ range: { ...range, to: e.target.value } })} />
      </EcCond>
      <EcCond label="발령일자">
        {value.useAssignDate && (
          <>
            <input type="date" className="ec-input w-[150px]" aria-label="발령일자 시작" value={assignRange.from}
                   onChange={(e) => set({ assignRange: { ...assignRange, from: e.target.value } })} />
            ~
            <input type="date" className="ec-input w-[150px]" aria-label="발령일자 끝" value={assignRange.to}
                   onChange={(e) => set({ assignRange: { ...assignRange, to: e.target.value } })} />
          </>
        )}
        <label className="inline-flex items-center gap-[4px] ml-[6px]">
          <input type="checkbox" checked={value.useAssignDate}
                 onChange={(e) => set({ useAssignDate: e.target.checked, assignRange: e.target.checked ? range : assignRange })} /> 사용
        </label>
      </EcCond>
      <EcCond label="사원">
        <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={value.employeeIds}
                         onChangeMulti={(v) => set({ employeeIds: v })}
                         items={employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name, sub: e.department }))} />
      </EcCond>
      <EcCond label="발령구분">
        <CodePickerField label="발령구분" hideLabel fill multiple placeholder="발령구분" values={value.kinds}
                         onChangeMulti={(v) => set({ kinds: v })}
                         items={ASSIGNMENT_KINDS.map(([v, n]) => ({ value: v, name: n }))} />
      </EcCond>
      <EcCond label="입사구분">
        <CodePickerField label="입사구분" hideLabel fill multiple placeholder="입사구분" values={value.hireKinds}
                         onChangeMulti={(v) => set({ hireKinds: v })} items={hireItems} />
      </EcCond>
      <EcCond label="직위/직급">
        <CodePickerField label="직위/직급" hideLabel fill multiple placeholder="직위/직급" values={value.jobTitles}
                         onChangeMulti={(v) => set({ jobTitles: v })} items={titleItems} />
      </EcCond>
      <EcCond label="부서" pick>
        <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={value.departmentIds}
                         onChangeMulti={(v) => set({ departmentIds: v })}
                         items={departments.map((d) => ({ value: String(d.id), code: d.code, name: d.name }))} />
      </EcCond>
      <EcCond label="적요">
        <input className="ec-input w-full" placeholder="적요" value={value.remark} onChange={(e) => set({ remark: e.target.value })} />
      </EcCond>
    </>
  )
}

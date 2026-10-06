/** 인사발령 전표 한 줄 — 서버 EmployeeDtos.AssignmentResponse. */
export type AssignmentKind = 'GENERAL' | 'HIRE' | 'TRANSFER' | 'PROMOTION' | 'RESIGN' | 'REHIRE'

export interface AssignmentLine {
  id: number
  slipDate: string
  slipNo: number
  employeeId: number
  employeeCode: string
  employeeName: string
  assignDate: string
  type: AssignmentKind
  typeName: string
  departmentId: number | null
  department: string
  jobTitle: string
  prevDepartmentId: number | null
  prevDepartment: string
  prevJobTitle: string
  hireKind: string | null
  employeeActive: boolean
  remark: string | null
}

/** 원본 발령구분 코드도움에 '인사발령' 이 먼저 뜬다. 나머지는 재직상태까지 바꾸는 우리 발령 유형. */
export const ASSIGNMENT_KINDS: [AssignmentKind, string][] = [
  ['GENERAL', '인사발령'], ['HIRE', '입사'], ['TRANSFER', '전보'], ['PROMOTION', '승진'], ['RESIGN', '퇴사'], ['REHIRE', '재입사'],
]

export const slipLabel = (l: { slipDate: string; slipNo: number }) => `${l.slipDate.replace(/-/g, '/')} -${l.slipNo}`

/** 줄들을 전표(일자-No.)로 묶는다. 서버가 최신 전표부터 준다. */
export function groupSlips(lines: AssignmentLine[]): AssignmentLine[][] {
  const map = new Map<string, AssignmentLine[]>()
  for (const l of lines) {
    const k = `${l.slipDate}/${l.slipNo}`
    map.set(k, [...(map.get(k) ?? []), l])
  }
  return [...map.values()]
}

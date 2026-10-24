import type { CodeColumn } from '../../components/CodeSearchModal'
import type { EmployeeMaster } from '../../types/api'

/**
 * 4대보험 신고 화면 사원검색 창의 격자 열(원본 N001768~N001771, 2026-10-14 실측):
 * [사원번호][성명][부서명][입사일자][퇴사일자]. 항목에는 id 만 있어 사원 목록에서 찾아 채운다.
 */
export function insuranceEmployeeColumns(employees: EmployeeMaster[]): CodeColumn[] {
  const byId = new Map(employees.map((e) => [String(e.id), e]))
  const day = (s: string | null | undefined) => (s ? s.replaceAll('-', '/') : '')
  return [
    { head: '사원번호', link: true, cell: (i) => i.code ?? '' },
    { head: '성명', link: true, cell: (i) => i.name },
    { head: '부서명', cell: (i) => byId.get(i.value)?.department ?? '' },
    { head: '입사일자', cell: (i) => day(byId.get(i.value)?.hireDate) },
    { head: '퇴사일자', cell: (i) => day(byId.get(i.value)?.resignDate) },
  ]
}

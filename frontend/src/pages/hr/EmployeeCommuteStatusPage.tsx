import EmployeeCommuteStatusView from '../../features/employeecommute/components/EmployeeCommuteStatusView'

/**
 * 관리 &gt; 근태관리 &gt; 출/퇴근(사원) &gt; <b>출/퇴근현황(사원)</b> (원본 E020722).
 *
 * <p>2026-10-03 loginaa 실측: 결과 '출/퇴근현황(사원)' · 회사명 · 기간(2026/10/01 ~ 2026/10/03), 격자 일자 · 사원명 · 출근시간 ·
 * 퇴근시간 · 근무시간(시간단위). 근무시간은 퇴근 − 출근에서 점심 휴게(12~13시)를 뺀 시간(WorkTime, 근무현황과 같은 셈).
 */
export default function EmployeeCommuteStatusPage() {
  return <EmployeeCommuteStatusView title="출/퇴근현황(사원)" lateOnly={false} />
}

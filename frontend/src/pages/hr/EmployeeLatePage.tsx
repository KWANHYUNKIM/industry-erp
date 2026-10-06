import EmployeeCommuteStatusView from '../../features/employeecommute/components/EmployeeCommuteStatusView'

/**
 * 관리 &gt; 근태관리 &gt; 출/퇴근(사원) &gt; <b>지각현황(사원)</b> (원본 E020723).
 *
 * <p>2026-10-03 loginaa 실측: 조건은 출/퇴근현황(사원)과 같고, 격자 일자 · 사원명 · 출근시간 · 출근입력시간 · 출근적요.
 * 지각은 출근이 09:00 을 넘은 날(오전반차를 건 날은 아니다) — 근무현황 · 지각현황(ID)과 같은 기준. 출/퇴근반영기준의 지각 규칙은 아직 안 쓴다.
 */
export default function EmployeeLatePage() {
  return <EmployeeCommuteStatusView title="지각현황(사원)" lateOnly />
}

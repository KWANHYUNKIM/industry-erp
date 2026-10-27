import AttendanceIdReport from '../../features/attendance/components/AttendanceIdReport'

/** 그룹웨어 › 업무관리 › 출/퇴근 › 지각현황(ID) E070307 — 날마다 한 줄. 관리 › 근태관리 화면과는 다른 화면이다(plans/그룹웨어/E070305.md). */
export default function AttendanceIdLatePage() {
  return <AttendanceIdReport kind="late" />
}

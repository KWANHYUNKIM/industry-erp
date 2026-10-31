import WorkPage from '../workpost/WorkPage'

/**
 * 그룹웨어 > 공유정보 > 프로젝트 진행관리(예시) > 📅 프로젝트 진행현황 칸반 (E200072, 2026-10-13 loginaa 실측)
 *
 * 목록은 간판제작과 같은 E0725xx 꼴(번호 · 제목 · 작성자 · 전달자 · 완료일 · 진행상태 · 첨부 · 조회), 알약 진행중 · 완료.
 * 글 View 본문이 칸반 판이다 — 그 글에 [칸반연결] 한 🛠️간판제작 글을 열 = [프로젝트], 줄 = 진행상태로 모은다(EcKanban).
 */
export default function ProjectKanbanPage() {
  return <WorkPage board="PROJECT_KANBAN" title="📅 프로젝트 진행현황 칸반" />
}

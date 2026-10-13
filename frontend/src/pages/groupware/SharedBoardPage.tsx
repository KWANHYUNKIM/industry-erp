import WorkPage from './WorkPage'

/**
 * 그룹웨어 > 공유정보 > *통합게시판* > 공유정보/업무관리 게시판 20개까지 (2026-10-13 loginaa 실측)
 *
 * 원본은 게시판 하나다 — 격자 번호 · 제목 · 작성자 · 전달자 · 완료일 · 진행상태 · 첨부 · 조회, 알약 [전체][Default],
 * 하단 신규(F2) · 보내기 · 업무지원AI · 진행상태변경 · 모두펼쳐보기 · 선택삭제 · Excel · 이력조회 · 웹자료올리기(라벨 버튼 없음).
 * 글 1건 저장 → 번호 2(이 게시판 혼자 센다) · 완료일 저장한 날 · 진행상태 Default. 수정 → 제목만 바뀜, 삭제 '삭제하겠습니까?' → 목록에서 빠짐.
 */
export default function SharedBoardPage() {
  return <WorkPage board="SHARED" title="공유정보/업무관리 게시판 20개까지" />
}

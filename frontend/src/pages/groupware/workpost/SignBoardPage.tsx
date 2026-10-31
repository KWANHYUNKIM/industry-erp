import WorkPage from './WorkPage'

/**
 * 그룹웨어 > 공유정보 > 프로젝트 진행관리(예시) > 🛠️간판제작 프로젝트관리 (E200070, 2026-10-13 loginaa 실측)
 *
 * 통합게시판 꼴(번호 · 제목 · 작성자 · 전달자 · 완료일 · 진행상태 · 첨부 · 조회) + 라벨(진행중 · 견적서미첨부 …).
 * 진행상태 수주견적 · 디자인팀 시안 · 자재발주, 제작 · 현장시공. 원본 입력 창의 [프로젝트] · [칸반연결] · [완료일시] 는 아직 없다.
 */
export default function SignBoardPage() {
  return <WorkPage board="SIGN" title="🛠️간판제작 프로젝트관리" />
}

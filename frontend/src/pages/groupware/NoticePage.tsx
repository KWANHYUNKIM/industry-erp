import WorkPage from './WorkPage'

/**
 * 그룹웨어 > 공유정보 > 게시판 > 공지사항 (이카운트 E200062)
 *
 * 원본에서 공지사항은 게시판 하나일 뿐이고 화면 모양은 업무관리 &gt; WORK 와 완전히 같다
 * (일자-No. · 게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태 · 첨부 · 조회, 탭은 전체·진행중·완료).
 * 게시글번호도 두 게시판을 가로질러 한 줄기다.
 *
 * 우리는 여기에 제목·분류·고정·조회·작성자·작성일을 가진 별도 공지 화면(notices 테이블)을
 * 놓고 있었다. 두 모델을 유지할 이유가 없어 게시글로 합쳤다.
 */
export default function NoticePage() {
  return <WorkPage board="NOTICE" title="공지사항" />
}

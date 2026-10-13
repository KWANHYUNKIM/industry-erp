import { useLocation } from 'react-router-dom'
import WorkPage, { type PostBoardCode } from './WorkPage'

/**
 * 그룹웨어 > 업무관리 의 예시 게시판(2026-10-14 loginaa 실측). 원본은 회사가 '게시판 설정' 으로 만든 게시판이라
 * 화면 틀은 WORK · 공지사항과 같고 격자 열 · 입력항목만 다르다 — 그 차이는 WorkPage 의 BOARD_CFG 에 있다.
 * 주소 하나 = 게시판 하나. 메뉴 이름(이모지 포함)이 그대로 화면 제목이다.
 */
export const WORK_SAMPLE_BOARDS: { path: string; board: PostBoardCode; title: string }[] = [
  { path: '/groupware/ai-guide', board: 'AI_GUIDE', title: '🔹 이카운트 AI 활용 예시 🔹' },
  { path: '/groupware/site-log', board: 'SITE_LOG', title: '🏗️ 현장공사일지' },
  { path: '/groupware/site-status', board: 'SITE_STATUS', title: '📊 공사진행현황' },
  { path: '/groupware/dev-log', board: 'DEV_LOG', title: '📅 개발업무일지' },
  { path: '/groupware/dev-status', board: 'DEV_STATUS', title: '📈 개발진행현황' },
  { path: '/groupware/consult-board', board: 'CONSULT', title: '🎧 상담 이력관리' },
  { path: '/groupware/visit-board', board: 'VISIT', title: '🤝🏻 영업 방문관리' },
  { path: '/groupware/contract-board', board: 'CONTRACT', title: '📑 최종 계약관리' },
  { path: '/groupware/as-board', board: 'AS_CARE', title: '🛠️ A/S 관리' },
  { path: '/groupware/car-info', board: 'CAR_INFO', title: '🚗 1. 차량 정보관리' },
  { path: '/groupware/car-doc', board: 'CAR_DOC', title: '🚗 2. 차량 증빙관리' },
  { path: '/groupware/car-run', board: 'CAR_RUN', title: '🚗 3. 차량 운행관리' },
]

export default function WorkSampleBoardPage() {
  const { pathname } = useLocation()
  const b = WORK_SAMPLE_BOARDS.find((x) => x.path === pathname) ?? WORK_SAMPLE_BOARDS[0]
  return <WorkPage key={b.board} board={b.board} title={b.title} />
}

import { createContext, useContext, type ReactNode } from 'react'

/**
 * 위젯이 메인 위에 띄우는 창 — 원본(2026-10-30 loginaa 홈 실측, plans/데이터이관/클릭대조/대조-메인(MyPage).md)은
 * 머리 [새창] · [펜] 과 본문 글자를 누르면 화면을 옮기지 않고 메인 위에 창(레이어)을 띄운다.
 *
 *   page     — 그 메뉴 화면 하나를 창으로(새창 · 펜이 입력 창을 따로 갖지 않는 메뉴)
 *   schedule — '일정관리등록'(viewId 없음) · '일정조회'
 *   board    — '공지사항입력'(postId 없음) · '공지사항View' · '조회자 현황'(readers)
 *   order    — '오더관리번호등록'(orderId 없음 · 있으면 그 번호) · '오더관리번호별 상세내역'(detail)
 *   approval — 기안서 보기([복사] 면 그 기안서로 채운 기안서작성 창)
 *   chat     — 작성자 이름 → 1:1 대화(username)
 */
export type WidgetPopup =
  | { kind: 'page'; path: string; title?: string; state?: unknown }
  | { kind: 'schedule'; viewId?: number }
  | { kind: 'board'; board: string; title: string; postId?: number; readers?: boolean }
  | { kind: 'order'; orderId?: number; detail?: boolean }
  | { kind: 'approval'; id: number; copy?: boolean }
  | { kind: 'chat'; username: string }

/** 위젯마다 대시보드가 채워 준다 — 창이 닫히면 그 위젯만 다시 읽는다 */
export const WidgetOpenContext = createContext<(p: WidgetPopup) => void>(() => {})

export const useWidgetOpen = () => useContext(WidgetOpenContext)

/** 위젯 본문의 누르는 글자 — 화면을 옮기지 않고 창을 띄운다 */
export function WLink({ to, title, className = 'ec-wlink', children }: { to: WidgetPopup; title?: string; className?: string; children: ReactNode }) {
  const open = useWidgetOpen()
  return (
    <button type="button" className={className} title={title} onClick={(e) => { e.stopPropagation(); open(to) }}>
      {children}
    </button>
  )
}

import AppRouter from '../../app/router'
import { FLAT_MENU } from '../../app/layout/menu'
import AppWindow from '../appbar/AppWindow'

/** 메뉴 주소 → 메뉴 이름(창 제목). 메뉴에 없으면 fallback */
export const menuLabel = (path: string, fallback = '') => FLAT_MENU.find((m) => m.to === path)?.label ?? fallback

/**
 * 메뉴 화면 하나를 메인 위 창(레이어)으로 — 원본 홈 위젯 [새창](2026-10-30 실측: 오더관리진행단계 → 목록 창
 * Search · Option · 도움말 · 기간 · 표, 전자결재 → 내결재관리 창). 브라우저 주소는 그대로 '/' 이고, 창 안에서만
 * 그 주소의 화면을 그린다(AppRouter location). 창 틀은 앱바 창과 같다 — [새창] 은 그 화면을 브라우저 새 창으로.
 */
export default function PageWindow({ path, state, title, onClose }: {
  path: string
  state?: unknown
  title?: string
  onClose: () => void
}) {
  const [pathname, search] = path.split('?')
  return (
    <AppWindow title={title || menuLabel(pathname, pathname)} kind="ec-pagewin" popout={path} front onClose={onClose}>
      <AppRouter location={{ pathname, search: search ? `?${search}` : '', hash: '', state: state ?? null, key: 'mypage-window' }} />
    </AppWindow>
  )
}

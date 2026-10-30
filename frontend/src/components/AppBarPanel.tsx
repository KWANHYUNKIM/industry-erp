import type { AppKey } from '../features/appbar/AppBar'

export type PanelKind = AppKey

/**
 * 앱바 창(메신저 · 알림 …)을 <b>화면 안에서</b> 연다.
 *
 * <p>창은 앱바(features/appbar/AppBar)가 들고 있어 페이지가 손댈 수 없었다. 그런데 원본에는
 * 근태조회의 [메신저]·설문조사조회의 [대화방] 처럼 <b>그 화면에서 말을 거는</b> 버튼이 있다.
 * 창을 페이지마다 새로 만들면 앱바의 것과 둘이 되므로, <b>같은 창을 열어 달라고</b> 알린다.
 */
export function openAppBarPanel(kind: PanelKind) {
  window.dispatchEvent(new CustomEvent<PanelKind>('ec:open-panel', { detail: kind }))
}

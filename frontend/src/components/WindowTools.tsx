import { Icon } from '../features/appbar/icons'

/**
 * 떠 있는 창(ModalWindow) 제목줄의 [새창] [고정] [새로고침] — `<ModalWindow tools={<WindowTools … />}>`.
 * 원본 팝업창 제목줄 오른쪽 다섯 단추 중 앞의 셋이다([최대화] · [닫기] 는 ModalWindow 가 그린다).
 *
 * <p>앱바 창(features/appbar/AppWindow) · 전표 입력 창(SlipWindow)이 같은 단추를 따로 그리던 것을 모았다.
 * 고정 · 새로고침 상태는 부르는 쪽이 갖는다(고정이면 다른 화면으로 옮겨도 남기는 일 등은 창마다 다르다).
 */
export default function WindowTools({ popout, pinned, onPin, onRefresh }: {
  /** [새창] 으로 열 화면 주소 — 없으면 단추를 안 그린다 */
  popout?: string
  pinned: boolean
  onPin: () => void
  onRefresh: () => void
}) {
  return (
    <>
      {popout && (
        <button type="button" className="tool" title="새창" aria-label="새창"
                onClick={() => window.open(popout, '_blank', 'noopener,noreferrer')}><Icon name="popout" /></button>
      )}
      <button type="button" className={`tool${pinned ? ' on' : ''}`} title={pinned ? '고정 풀기' : '고정'} aria-label="고정"
              aria-pressed={pinned} onClick={onPin}><Icon name="pin" /></button>
      <button type="button" className="tool" title="새로고침" aria-label="새로고침" onClick={onRefresh}><Icon name="refresh" /></button>
    </>
  )
}

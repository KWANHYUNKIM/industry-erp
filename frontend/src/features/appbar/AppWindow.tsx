import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ModalWindow } from '../../components/Modal'
import { Icon } from './icons'
import './appbar.css'

/**
 * 앱바에서 여는 창의 틀 — 원본(2026-10-30 loginaa 쪽지 · E Note · 북마크 … 캡처)처럼
 * 파란 제목줄 오른쪽에 [새창] [고정] [새로고침] [최대화] [닫기].
 *
 * <ul>
 *   <li>뒤 화면을 어둡게 하지 않는다 — 창을 띄운 채 화면을 계속 쓴다.</li>
 *   <li>[고정] 을 안 누른 창은 다른 화면으로 옮기면 닫힌다. 고정한 창은 남고 Esc 로도 안 닫힌다.</li>
 *   <li>[새로고침] 은 창 안을 처음부터 다시 그린다(목록을 다시 받는다).</li>
 *   <li>[새창] 은 같은 기능의 전체 화면을 새 브라우저 창으로 연다(그 화면이 있을 때만 단추가 있다).</li>
 * </ul>
 */
export default function AppWindow({
  title,
  onClose,
  children,
  kind = 'ec-appwin',
  side = false,
  popout,
  front = false,
  onFront,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /** 창 모양 — 앱바 창(ec-appwin) · 메신저(ec-messenger) · 대화(ec-chat) · 메뉴 화면 하나(ec-pagewin, MyPage 위젯 [새창]) */
  kind?: 'ec-appwin' | 'ec-messenger' | 'ec-chat' | 'ec-pagewin'
  /** 오른쪽에 붙여 띄운다(메신저 옆 대화 창) */
  side?: boolean
  /** [새창] 으로 열 전체 화면 주소 */
  popout?: string
  /** 여러 창이 겹칠 때 맨 위 — 마지막에 열거나 누른 창 */
  front?: boolean
  onFront?: () => void
}) {
  const [pinned, setPinned] = useState(false)
  const [gen, setGen] = useState(0)
  const location = useLocation()
  const openedAt = useRef(location.pathname)   // 연 화면 — 다른 화면으로 옮기면 닫는다(StrictMode 의 두 번 실행에도 안 닫히게 경로로 비교)
  const pinRef = useRef(pinned)
  pinRef.current = pinned

  useEffect(() => {
    if (location.pathname === openedAt.current) return
    openedAt.current = location.pathname
    if (!pinRef.current) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pinRef.current) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tools = (
    <>
      {popout && (
        <button type="button" className="tool" title="새창" aria-label="새창"
                onClick={() => window.open(popout, '_blank', 'noopener,noreferrer')}><Icon name="popout" /></button>
      )}
      <button type="button" className={`tool${pinned ? ' on' : ''}`} title={pinned ? '고정 풀기' : '고정'} aria-label="고정"
              aria-pressed={pinned} onClick={() => setPinned((p) => !p)}><Icon name="pin" /></button>
      <button type="button" className="tool" title="새로고침" aria-label="새로고침" onClick={() => setGen((g) => g + 1)}><Icon name="refresh" /></button>
    </>
  )

  return (
    <div className={`ec-modal-back ec-appwin-back${pinned ? ' pinned' : ''}${front ? ' front' : ''}${side ? ' at-side' : ''}`}
         onPointerDownCapture={onFront}>
      <ModalWindow title={title} onClose={onClose} className={kind} esc={!pinned} tools={tools}>
        <Fragment key={gen}>{children}</Fragment>
      </ModalWindow>
    </div>
  )
}

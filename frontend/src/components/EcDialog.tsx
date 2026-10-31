import { useEffect, useRef, useSyncExternalStore } from 'react'
import EcIcon from './ui/EcIcon'
import { close, snapshot, subscribe } from '../utils/dialog'

export { ecAlert, ecConfirm, requireSelection, NO_SELECTION_MESSAGE } from '../utils/dialog'

/** 화면 안 '알림' 창의 틀 — 상태와 ecAlert · ecConfirm 은 utils/dialog.ts. */
export function EcDialogHost() {
  const items = useSyncExternalStore(subscribe, snapshot)
  const top = items[0]
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!top) return
    okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(top, top.kind === 'alert') }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(top, true) }
    }
    // 잡는 단계에서 먼저 받는다 — 뒤에 깔린 창(Modal)의 Esc 가 함께 닫히지 않게
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [top])

  if (!top) return null
  return (
    <div className="ec-modal-back items-center z-[90]">
      <div role="alertdialog" aria-modal="true" aria-label="알림" className="ec-modal w-[385px]">
        <div className="ec-modal-bar">
          <span className="name">알림</span>
          <button className="close" aria-label="닫기" onClick={() => close(top, top.kind === 'alert')}><EcIcon name="close" size={12} glyph="✕" /></button>
        </div>
        <div className="ec-modal-body flex flex-col min-h-[229px]">
          <p className="flex-1 m-0 whitespace-pre-line break-words leading-[18px]">{top.message}</p>
          <div className="flex gap-[5px] mt-[9px]">
            <button ref={okRef} type="button" className="ec-btn ec-btn-primary min-w-[var(--ec-btn-min-w)] justify-center" onClick={() => close(top, true)}>확인</button>
            {top.kind === 'confirm' && (
              <button type="button" className="ec-btn min-w-[var(--ec-btn-min-w)] justify-center" onClick={() => close(top, false)}>취소</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

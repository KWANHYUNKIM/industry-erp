import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { WidgetDef } from './types'

/**
 * 위젯 판(제목바 + 오른쪽 아이콘 + 본문). 원본 아이콘 차례: 새창 · 새로고침 · 신규 · ⋮([설정] [삭제]).
 * <b>원본에 있는 아이콘만</b> 그린다(재고현황엔 신규가 없고, 플로우차트는 삭제뿐). 삭제는 확인창 없이 바로 지운다.
 * 설정이 없는 위젯은 ⋮ 를 거치지 않고 삭제(✕)가 바로 보인다.
 */
export default function WidgetFrame({ def, title, busy, onRefresh, onNew, onSetting, onRemove, onHeadDown, children }: {
  def: WidgetDef
  title: ReactNode
  busy: boolean
  onRefresh: () => void
  onNew: () => void
  onSetting: () => void
  onRemove: () => void
  onHeadDown: (e: ReactPointerEvent) => void
  children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const ic = def.icons
  const openWindow = () => { if (def.to) window.open(def.to, '_blank', 'popup,width=1200,height=800') }
  return (
    <div className="ec-widget">
      <div className="ec-widget-head" onPointerDown={onHeadDown}>
        <span className="name">{title}</span>
        <div className="tools" onPointerDown={(e) => e.stopPropagation()}>
          {ic.window && <button title="새창" disabled={!def.to} onClick={openWindow}>⧉</button>}
          {ic.refresh && <button title="새로고침" className={busy ? 'spin' : undefined} onClick={() => { if (!busy) onRefresh() }}>⟳</button>}
          {ic.new && <button title="신규" disabled={!def.newTo} onClick={onNew}>＋</button>}
          {ic.setting ? (
            <>
              <button title="옵션" onClick={() => setMenuOpen((v) => !v)}>⋮</button>
              {menuOpen && (
                <>
                  <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
                  <div className="ec-menu">
                    <button onClick={() => { setMenuOpen(false); onSetting() }}>설정</button>
                    <button className="danger" onClick={() => { setMenuOpen(false); onRemove() }}>삭제</button>
                  </div>
                </>
              )}
            </>
          ) : (
            <button title="삭제" onClick={onRemove}>✕</button>
          )}
        </div>
      </div>
      <div className="ec-widget-body">{children}</div>
    </div>
  )
}

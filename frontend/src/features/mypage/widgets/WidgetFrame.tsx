import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { WidgetDef } from './types'
import EcIcon from '../../../components/ui/EcIcon'

/**
 * 위젯 판(제목바 + 오른쪽 아이콘 + 본문). 원본 아이콘 차례: 새창 · 새로고침 · 펜(새 글) · ⋮([설정] [삭제]).
 * <b>원본에 있는 아이콘만</b> 그린다(재고현황엔 신규가 없고, 플로우차트는 삭제뿐). 삭제는 확인창 없이 바로 지운다.
 * 설정이 없는 위젯은 ⋮ 를 거치지 않고 삭제(✕)가 바로 보인다.
 *
 * <p>원본(2026-10-30 홈 클릭 실측)은 화면을 옮기지 않는다 — [새창] 은 그 메뉴 화면을, [펜] 은 그 입력 창을 메인 위 창(레이어)으로
 * 띄운다(onWindow · onNew 가 대시보드의 창을 연다). ⋮ 는 위젯을 끌어 옮기는 손잡이다 — 끌면 옮기고, 그냥 누르면 [설정] [삭제].
 */
export default function WidgetFrame({ def, title, busy, onWindow, onRefresh, onNew, onSetting, onRemove, onHeadDown, children }: {
  def: WidgetDef
  title: ReactNode
  busy: boolean
  onWindow: () => void
  onRefresh: () => void
  onNew: () => void
  onSetting: () => void
  onRemove: () => void
  onHeadDown: (e: ReactPointerEvent) => void
  children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const ic = def.icons
  /* ⋮ 를 누른 자리 — 손을 뗄 때 거의 안 움직였으면 끌기가 아니라 누르기(메뉴) */
  const down = useRef<{ x: number; y: number } | null>(null)
  const gripDown = (e: ReactPointerEvent) => { down.current = { x: e.clientX, y: e.clientY }; onHeadDown(e) }
  const gripClick = (e: { clientX: number; clientY: number }) => {
    const d = down.current
    down.current = null
    if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) return
    setMenuOpen((v) => !v)
  }
  return (
    <div className="ec-widget">
      <div className="ec-widget-head" onPointerDown={onHeadDown}>
        <span className="name">{title}</span>
        <div className="tools" onPointerDown={(e) => e.stopPropagation()}>
          {ic.window && <button title="새창" disabled={!def.to} onClick={onWindow}>⧉</button>}
          {ic.refresh && <button title="새로고침" className={busy ? 'spin' : undefined} onClick={() => { if (!busy) onRefresh() }}>⟳</button>}
          {ic.new && <button title="새 글" disabled={!def.newTo && !def.pen} onClick={onNew}>✎</button>}
          {ic.setting ? (
            <>
              <button title="옵션" className="ec-widget-grip" onPointerDown={gripDown} onClick={gripClick}>⋮</button>
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
            <button title="삭제" onClick={onRemove}><EcIcon name="close" size={12} glyph="✕" /></button>
          )}
        </div>
      </div>
      <div className="ec-widget-body">{children}</div>
    </div>
  )
}

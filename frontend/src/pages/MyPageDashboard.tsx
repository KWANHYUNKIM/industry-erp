import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { WidgetOpenContext, type WidgetPopup } from '../features/mypage/widgets/actions'
import PageWindow, { menuLabel } from '../features/mypage/PageWindow'
import PopupHost from '../features/mypage/PopupHost'
import ApprovalViewer from '../features/mypage/ApprovalViewer'
import ChatWithWindow from '../features/mypage/ChatWithWindow'
import type { PostBoardCode } from './groupware/WorkPage'
import { DEFAULT_LAYOUT, headTitle, REGISTRY } from '../features/mypage/widgets/catalog'
import { loadAllSettings, saveAllSettings } from '../features/mypage/widgets/store'
import TableWidget from '../features/mypage/widgets/TableWidget'
import type { WidgetDef, WidgetSettings } from '../features/mypage/widgets/types'
import WidgetFrame from '../features/mypage/widgets/WidgetFrame'
import WidgetSettingsModal from '../features/mypage/widgets/WidgetSettingsModal'
import { bottomRow, fitWidth, MIN_H, MIN_W, normalize, place, type GridItem } from '../utils/gridLayout'

/** 배치 — 위젯마다 {id, x, y, w, h}(칸 수). 위젯 [설정] 값은 나란히 mypage-widget-settings-v1 */
const STORAGE_KEY = 'mypage-grid-v1'

/* 위젯 [펜] · 본문 클릭이 숨긴 채 빌려 쓰는 화면들(그 화면의 입력 · 조회 창만 보인다 — features/mypage/PopupHost) */
const SchedulePage = lazy(() => import('./groupware/SchedulePage'))
const WorkPage = lazy(() => import('./groupware/WorkPage'))
const OrderStagePage = lazy(() => import('./trade/OrderStagePage'))

type GripDir = 'e' | 'se' | 's' | 'sw' | 'w'
const GRIPS: GripDir[] = ['e', 'se', 's', 'sw', 'w']

/** 원본 My위젯선택 분류 차례 */
const GROUPS = ['재고', '회계', '공통', '게시판'] as const
/** 새로 올린 위젯 크기 — 원본 w8 h4(E Note 만 w10) */
const NEW_W = 8
const NEW_H = 4
const sizeOf = (def: WidgetDef | undefined) => ({ w: def?.w ?? NEW_W, h: def?.h ?? NEW_H })
/** 원본 기본 배치를 잰 판 폭(칸) — 이보다 좁으면 비율대로 줄인다 */
const DEFAULT_COLS = 28
const MOBILE = '(max-width: 768px)'
const DRAG_TYPE = 'application/x-ec-widget'

const defOf = (id: string) => REGISTRY.find((w) => w.id === id)
const known = (id: string) => !!defOf(id)
const byPos = (a: GridItem, b: GridItem) => a.y - b.y || a.x - b.x
const gridVars = (g: { x: number; y: number; w: number; h: number }) =>
  ({ '--gx': g.x, '--gy': g.y, '--gw': g.w, '--gh': g.h }) as CSSProperties

function loadStored(): GridItem[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return (JSON.parse(raw) as GridItem[]).filter((it) => it && known(it.id) && [it.x, it.y, it.w, it.h].every(Number.isFinite))
  } catch {
    return null
  }
}

/** 끄는 동안의 모습 — layout: 놓으면 될 배치, float: 손을 따라가는 위젯(칸 단위 소수), ph: 자리표시를 그릴 위젯 */
interface Preview {
  layout: GridItem[]
  float?: GridItem
  ph: string
}

export default function MyPageDashboard() {
  const { user } = useAuth()
  const [stored, setStored] = useState<GridItem[] | null>(loadStored)
  const [pick, setPick] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())  // 새로고침 중인 위젯 id
  const [ticks, setTicks] = useState<Record<string, number>>({})
  const [settings, setSettings] = useState<Record<string, WidgetSettings>>(loadAllSettings)
  const [editing, setEditing] = useState<WidgetDef | null>(null)
  const [folded, setFolded] = useState<Set<string>>(new Set())
  /** 메인 위에 띄운 창과 그것을 연 위젯 — 닫히면 그 위젯만 다시 읽는다(원본: 화면을 옮기지 않는다) */
  const [pop, setPop] = useState<{ widget: string; p: WidgetPopup } | null>(null)

  // 격자 — 한 칸은 토큰(--ec-grid-unit)에서 읽고, 열 수는 판 폭 ÷ 한 칸
  const gridRef = useRef<HTMLDivElement>(null)
  const [unit, setUnit] = useState(60)
  const [cols, setCols] = useState(0)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dragNew, setDragNew] = useState<string | null>(null)
  const dropCell = useRef('')

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const u = parseFloat(getComputedStyle(el).getPropertyValue('--ec-grid-unit')) || 60
    setUnit(u)
    const ro = new ResizeObserver(() => setCols(Math.max(MIN_W, Math.floor(el.clientWidth / u))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 저장된 배치는 그대로 두고 지금 판 폭에 맞춘 모습만 만든다 — 판이 다시 넓어지면 원래대로 돌아온다
  const layout = useMemo(() => {
    if (!cols) return []
    return normalize(stored ?? fitWidth(DEFAULT_LAYOUT, cols, DEFAULT_COLS), cols)
  }, [stored, cols])
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const colsRef = useRef(cols)
  colsRef.current = cols

  const commit = (next: GridItem[]) => {
    setStored(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  // 새로고침 — 그 위젯만 다시 받는다(본문이 tick 을 보고 다시 부른다)
  function refreshWidget(id: string) {
    setTicks((t) => ({ ...t, [id]: (t[id] ?? 0) + 1 }))
    setBusy((s) => new Set(s).add(id))
    setTimeout(() => setBusy((s) => { const n = new Set(s); n.delete(id); return n }), 600)
  }

  const closePop = () => {
    if (pop) refreshWidget(pop.widget)
    setPop(null)
  }

  /** 창 하나 — 메뉴 화면(새창) · 입력/조회 창(펜 · 본문 클릭) · 기안서 보기 · 1:1 대화 */
  function popupView() {
    if (!pop) return null
    const p = pop.p
    const hidden = (node: ReactNode) => (
      <PopupHost key={JSON.stringify(p)} onClose={closePop}><Suspense fallback={null}>{node}</Suspense></PopupHost>
    )
    switch (p.kind) {
      case 'page': return <PageWindow key={p.path} path={p.path} state={p.state} title={p.title} onClose={closePop} />
      case 'schedule': return hidden(<SchedulePage popup={{ viewId: p.viewId }} />)
      case 'board': return hidden(<WorkPage board={p.board as PostBoardCode} title={p.title} popup={{ postId: p.postId, readers: p.readers }} />)
      case 'order': return hidden(<OrderStagePage popup={{ orderId: p.orderId, detail: p.detail }} />)
      case 'approval':
        return <ApprovalViewer key={`${p.id}-${p.copy}`} id={p.id} copy={p.copy} onClose={closePop}
                               onCopy={(d) => setPop({ widget: pop.widget, p: { kind: 'page', path: '/groupware/approval/draft', title: '기안서작성', state: { copyFrom: d } } })} />
      case 'chat': return <ChatWithWindow key={p.username} username={p.username} onClose={() => setPop(null)} />
    }
  }

  function saveSettings(id: string, v: WidgetSettings) {
    const next = { ...settings, [id]: v }
    setSettings(next)
    saveAllSettings(next)
    setEditing(null)
  }

  /**
   * 제목바(옮기기) · 손잡이(크기)를 누르고 끈다. 위젯은 손을 그대로 따라가고, 놓일 자리(60px 칸에 맞춘 곳)는
   * 점선 자리표시로 보인다. 나머지 위젯은 미리 비켜 선다 — 손을 떼면 그 배치로 저장한다.
   */
  function begin(e: ReactPointerEvent, id: string, dir?: GripDir) {
    if (e.button !== 0 || window.matchMedia(MOBILE).matches) return
    const orig = layoutRef.current.find((it) => it.id === id)
    if (!orig) return
    e.preventDefault()
    e.stopPropagation()
    const sx = e.clientX
    const sy = e.clientY
    let last: Preview | null = null
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / unit
      const dy = (ev.clientY - sy) / unit
      const c = colsRef.current
      const f: GridItem = { ...orig }
      if (!dir) {
        f.x = Math.max(0, Math.min(orig.x + dx, c - orig.w))
        f.y = Math.max(0, orig.y + dy)
      } else {
        if (dir === 'e' || dir === 'se') f.w = Math.max(MIN_W, Math.min(orig.w + dx, c - orig.x))
        if (dir === 'w' || dir === 'sw') {
          f.x = Math.max(0, Math.min(orig.x + dx, orig.x + orig.w - MIN_W))
          f.w = orig.x + orig.w - f.x
        }
        if (dir !== 'e' && dir !== 'w') f.h = Math.max(MIN_H, orig.h + dy)
      }
      const x = Math.round(f.x)
      // 왼쪽 손잡이는 오른쪽 변을 붙박아 둔다 — x · w 를 따로 반올림하면 오른쪽 변이 한 칸 흔들린다
      const w = dir === 'w' || dir === 'sw' ? orig.x + orig.w - x : Math.round(f.w)
      const snapped = { id, x, y: Math.round(f.y), w, h: Math.round(f.h) }
      last = { layout: place(layoutRef.current, snapped, c), float: f, ph: id }
      setPreview(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (last) commit(last.layout)
      setPreview(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // My위젯선택에서 끌어 온 위젯 — 손 아래 칸에 자리표시를 띄우고, 놓으면 그 자리에 넣는다
  function onGridDragOver(e: DragEvent) {
    if (!dragNew || !gridRef.current || !cols) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const r = gridRef.current.getBoundingClientRect()
    const x = Math.floor((e.clientX - r.left) / unit)
    const y = Math.max(0, Math.floor((e.clientY - r.top) / unit))
    const size = sizeOf(defOf(dragNew))
    const w = Math.min(size.w, cols)
    const cand = { id: dragNew, x: Math.max(0, Math.min(x, cols - w)), y, w, h: size.h }
    // dragover 는 쉬지 않고 온다 — 칸이 바뀔 때만 다시 쌓는다
    const cell = `${cand.x},${cand.y}`
    if (preview && dropCell.current === cell) return
    dropCell.current = cell
    setPreview({ layout: place(layout, cand, cols), ph: dragNew })
  }
  function onGridDrop(e: DragEvent) {
    if (!dragNew) return
    e.preventDefault()
    if (preview) commit(preview.layout)
    setPreview(null)
    setDragNew(null)
  }
  function onGridDragLeave(e: DragEvent) {
    if (dragNew && !gridRef.current?.contains(e.relatedTarget as Node | null)) setPreview(null)
  }

  const removeWidget = (id: string) => commit(layout.filter((it) => it.id !== id))
  const addWidget = (id: string) => {
    if (!cols || layout.some((it) => it.id === id)) return
    const size = sizeOf(defOf(id))
    commit(place(layout, { id, x: 0, y: bottomRow(layout), w: Math.min(size.w, cols), h: size.h }, cols))
  }
  /** [위젯 초기화] — 원본 홈 기본 배치(일정관리 · 전자결재 · 공지사항 · 오더관리진행단계) */
  const reset = () => { if (cols) commit(fitWidth(DEFAULT_LAYOUT, cols, DEFAULT_COLS)) }

  const shown = preview?.layout ?? layout
  // DOM 차례는 저장된 배치의 위 → 아래(휴대폰에서 이 차례로 쌓인다). 끄는 동안에는 바꾸지 않는다
  const placed = [...layout].sort(byPos)
    .map((it) => defOf(it.id))
    .filter((w): w is WidgetDef => !!w)
  const phItem = preview ? shown.find((it) => it.id === preview.ph) : undefined
  const floatBottom = preview?.float ? Math.ceil(preview.float.y + preview.float.h) : 0
  const rows = Math.max(bottomRow(shown), floatBottom, 2) + (preview ? 2 : 0)

  return (
    <div>
      <div className="flex items-center mb-[10px]">
        <div className="text-[12px] text-ec-label">
          <b className="text-ec-text text-[14px]">MyPage</b> &nbsp; {user?.name}님, 환영합니다.
        </div>
      </div>

      <div className="ec-wpage">
        {/* My위젯선택 — 원본처럼 왼쪽에서 밀려 나온다(본문 왼쪽 가장자리 손잡이). 항목을 끌어 격자에 놓거나 눌러서 맨 아래에 더한다(놓인 것은 눌러서 뺀다) */}
        <button type="button" className={`ec-wpick-handle${pick ? ' open' : ''}`} title="My위젯선택" onClick={() => setPick((v) => !v)}>{pick ? '‹' : '›'}</button>
        {pick && (
          <div className="ec-wpick">
            <div className="ec-wpick-head">
              <span className="name">My위젯선택</span>
              <button className="ec-btn ec-btn-sm" onClick={reset}>위젯 초기화</button>
            </div>
            <div className="ec-wpick-hint">메뉴를 드래그하여 원하는 위치에 놓으시기 바랍니다.</div>
            {GROUPS.map((g) => {
              const list = REGISTRY.filter((w) => w.group === g)
              return (
                <div key={g} className="ec-wpick-group">
                  <button type="button" className="name" onClick={() => setFolded((f) => { const n = new Set(f); if (n.has(g)) n.delete(g); else n.add(g); return n })}>
                    {g} <span>{folded.has(g) ? '›' : '⌄'}</span>
                  </button>
                  {list.length === 0 && <div className="none">추가할 위젯이 없습니다.</div>}
                  {!folded.has(g) && list.map((w) => {
                    const on = layout.some((it) => it.id === w.id)
                    return (
                      <button
                        key={w.id}
                        className={`ec-wpick-item${on ? ' on' : ''}`}
                        title={on ? '눌러서 홈에서 뺍니다' : '끌어다 놓거나 눌러서 더합니다'}
                        draggable={!on}
                        onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, w.id); e.dataTransfer.effectAllowed = 'copy'; setDragNew(w.id) }}
                        onDragEnd={() => { setDragNew(null); setPreview(null) }}
                        onClick={() => (on ? removeWidget(w.id) : addWidget(w.id))}
                      >
                        {on ? '☑' : '☐'} {w.title}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
        <div
          ref={gridRef}
          className={`ec-wgrid${preview ? ' dragging' : ''}`}
          style={{ '--rows': rows } as CSSProperties}
          onDragOver={onGridDragOver}
          onDrop={onGridDrop}
          onDragLeave={onGridDragLeave}
        >
          {placed.length === 0 && !preview && (
            <div className="ec-wgrid-empty">
              표시할 위젯이 없습니다. <b>My위젯선택</b>에서 위젯을 끌어다 놓으세요.
            </div>
          )}
          {phItem && <div className="ec-wgrid-ph" style={gridVars(phItem)} />}
          {placed.map((w) => {
            const active = preview?.float?.id === w.id
            const g = active ? preview!.float! : shown.find((it) => it.id === w.id)
            if (!g) return null
            return (
              <div key={w.id} className={`ec-wgrid-item${active ? ' active' : ''}`} style={gridVars(g)}>
                <WidgetOpenContext.Provider value={(p) => setPop({ widget: w.id, p })}>
                <WidgetFrame
                  def={w}
                  title={headTitle(w, settings[w.id] ?? {})}
                  busy={busy.has(w.id)}
                  onWindow={() => { if (w.to) setPop({ widget: w.id, p: { kind: 'page', path: w.to, title: menuLabel(w.to, w.title) } }) }}
                  onRefresh={() => refreshWidget(w.id)}
                  onNew={() => {
                    const p: WidgetPopup | undefined = w.pen ?? (w.newTo ? { kind: 'page', path: w.newTo } : undefined)
                    if (p) setPop({ widget: w.id, p })
                  }}
                  onSetting={() => setEditing(w)}
                  onRemove={() => removeWidget(w.id)}
                  onHeadDown={(e) => begin(e, w.id)}
                >
                  {w.table
                    ? <TableWidget def={w} settings={settings[w.id] ?? {}} tick={ticks[w.id] ?? 0} />
                    : w.render?.({ settings: settings[w.id] ?? {}, tick: ticks[w.id] ?? 0 })}
                </WidgetFrame>
                </WidgetOpenContext.Provider>
                {GRIPS.map((d) => (
                  <div key={d} className={`ec-wgrid-grip ${d}`} onPointerDown={(e) => begin(e, w.id, d)} />
                ))}
              </div>
            )
          })}
        </div>

      </div>
      {popupView()}
      {editing && (
        <WidgetSettingsModal def={editing} value={settings[editing.id] ?? {}} onSave={(v) => saveSettings(editing.id, v)} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

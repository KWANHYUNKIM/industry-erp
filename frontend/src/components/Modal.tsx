import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import EcIcon from './ui/EcIcon'

/** 이카운트풍 중앙 팝업(모달). 신규/등록 폼을 인라인 대신 이 안에 띄운다.
 *  배경 클릭·ESC 로 닫힌다.
 *
 *  <p>{@code error} 를 주면 창 맨 위에 띄운다. 화면들은 오류를 화면(목록) 위에 띄우는데, 창이 열려 있으면
 *  그건 <b>창 뒤</b>라 안 보인다 — 필수 항목을 빠뜨리고 [저장]을 누르면 아무 일도 안 일어나는 것처럼
 *  보였다(QA 15회차, 기안서·작업지시·창고이동 …). 화면의 error 상태를 그대로 넘기면 된다.
 *
 *  <p>창 틀은 {@link ModalWindow} — 바깥을 눌러도 안 닫히는 전표 창(구매조회 '구매입력(수정)' …)은 그것을 바로 쓴다. */
export default function Modal({
  open,
  title,
  onClose,
  children,
  width = 640,
  error,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
  error?: string | null
}) {
  const errorRef = useRef<HTMLParagraphElement>(null)
  /* 창을 끌거나 크기를 바꾸다 바깥에서 손을 떼면 그 click 이 바깥(배경)에 떨어진다 — 그건 닫기가 아니다. */
  const dragged = useRef(false)
  /* 긴 폼은 아래쪽 [저장]을 누를 때 창 맨 위가 스크롤 밖이다 — 오류가 뜨면 보이는 데로 끌어온다. */
  useEffect(() => {
    if (open && error) errorRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [open, error])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="ec-modal-back" onClick={() => { if (!dragged.current) onClose() }}>
      <ModalWindow title={title} onClose={onClose} width={width} esc onDragEnd={() => {
        dragged.current = true
        setTimeout(() => { dragged.current = false }, 0)
      }}>
        {error && <p ref={errorRef} role="alert" className="ec-error">{error}</p>}
        {children}
      </ModalWindow>
    </div>
  )
}

/**
 * 창 안 입력칸의 Enter 가 <b>창 바깥 전표 form</b> 을 제출하지 않게 한다. 전표 화면은 화면 전체가 form 이고 창(Modal)은
 * 그 안에 그려져서, 주문서입력 [견적] '견적서검색창' 의 검색칸에서 Enter 를 치면 주문서 [저장(F8)] 이 돌아
 * '그리드(표)에 최소 1줄 이상 입력되어야 합니다.' 가 떴다(2026-10-29 QA). 원본 검색칸의 Enter 는 찾기만 한다.
 * 칸 자신의 onKeyDown(코드도움 고르기 …)은 먼저 돌고, 창 안에 따로 둔 form 의 제출은 그대로 둔다.
 */
function blockOuterSubmit(e: ReactKeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'Enter') return
  const t = e.target as HTMLElement
  if (!(t instanceof HTMLInputElement)) return
  const form = t.form
  if (form && !e.currentTarget.contains(form)) e.preventDefault()
}

type Dir = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
const GRIPS: Exclude<Dir, 'move'>[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']
interface Geo { x: number; y: number; w: number; h: number }

/** 휴대폰 · 태블릿 틀(CLAUDE.md 10.2) — 창은 화면 가득, 끌기 · 크기 조절 · 최대화 없음. */
const isMobile = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches

/**
 * 팝업창 틀 — 파란 제목줄 + 본문. 원본(jQuery UI dialog, 2026-10-28 loginaa 구매조회 '구매수정' 창 실측)처럼
 *   - 제목줄(커서 move)을 잡고 끌어 옮긴다. 제목줄이 화면 밖으로 다 나가지는 않는다(다시 잡을 수 있게).
 *   - 네 모서리 · 네 변 손잡이로 크기를 바꾼다. 최소 200 × 155(tokens.css --ec-modal-min-w/-h).
 *   - 제목줄 [최대화] 는 본문 틀(.ec-frame) 가득 → 다시 누르면 처음 크기 · 위치로.
 * 처음에는 지금처럼 가운데 흐름 배치이고, 처음 잡는 순간 그 자리 그대로 고정 배치로 바뀐다(창이 튀지 않게).
 * 크기 · 위치는 다음에 열 때 기억하지 않는다(원본 미실측).
 */
export function ModalWindow({
  title,
  onClose,
  children,
  width,
  className = '',
  esc = false,
  onDragEnd,
  tools,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
  className?: string
  /** ESC 로 닫히는 창이면 닫기 단추 풍선말에 그렇게 적는다(닫는 일은 부르는 쪽이 한다). */
  esc?: boolean
  onDragEnd?: () => void
  /** 제목줄 [최대화] 앞에 더 둘 단추(앱바 창의 새창 · 고정 · 새로고침 — 단추에 className="tool"). */
  tools?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<Geo | null>(null)
  const [restore, setRestore] = useState<Geo | null | undefined>(undefined)  // 최대화 전 — undefined 면 최대화 아님

  const begin = (e: ReactPointerEvent<HTMLElement>, dir: Dir) => {
    const el = ref.current
    if (!el || e.button !== 0 || isMobile() || restore !== undefined) return
    if (dir === 'move' && (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    e.stopPropagation()
    const cs = getComputedStyle(el)
    const minW = parseFloat(cs.getPropertyValue('--ec-modal-min-w')) || 0
    const minH = parseFloat(cs.getPropertyValue('--ec-modal-min-h')) || 0
    const keep = parseFloat(cs.getPropertyValue('--ec-modal-keep')) || 0
    const barH = el.querySelector('.ec-modal-bar')?.getBoundingClientRect().height ?? 0
    const r = el.getBoundingClientRect()
    /* 처음 잡을 때 창이 화면보다 길면(흐름 배치는 바깥이 스크롤했다) 화면 안으로 줄여 본문이 창 안에서 스크롤하게 한다. */
    const top = Math.max(r.top, 0)
    const s: Geo = geo ?? { x: r.left, y: top, w: r.width, h: Math.min(r.height, window.innerHeight - top) }
    const sx = e.clientX, sy = e.clientY
    const target = e.currentTarget
    try { target.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
    let moved = false
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (!moved && dx === 0 && dy === 0) return
      moved = true
      let { x, y, w, h } = s
      if (dir === 'move') {
        x = Math.min(Math.max(s.x + dx, keep - s.w), window.innerWidth - keep)
        y = Math.min(Math.max(s.y + dy, 0), window.innerHeight - barH)
      } else {
        if (dir.includes('e')) w = Math.max(minW, s.w + dx)
        if (dir.includes('s')) h = Math.max(minH, s.h + dy)
        if (dir.includes('w')) { w = Math.max(minW, s.w - dx); x = s.x + s.w - w }
        if (dir.includes('n')) {
          const ny = Math.max(0, Math.min(s.y + dy, s.y + s.h - minH))
          h = s.h + (s.y - ny); y = ny
        }
      }
      setGeo({ x, y, w, h })
      setRestore(undefined)
    }
    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      if (moved) onDragEnd?.()
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  const toggleMax = () => {
    if (restore !== undefined) { setGeo(restore); setRestore(undefined); return }
    const f = document.querySelector('.ec-frame')?.getBoundingClientRect()
    setRestore(geo)
    setGeo(f ? { x: f.left, y: f.top, w: f.width, h: f.height } : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight })
  }

  return (
    <div
      ref={ref}
      role="dialog" aria-modal="true" aria-label={title}
      className={`ec-modal ec-modal-win${geo ? ' is-free' : ''}${restore !== undefined ? ' is-max' : ''} ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={blockOuterSubmit}
      style={geo ? { left: geo.x, top: geo.y, width: geo.w, height: geo.h } : width != null ? { width } : undefined}
    >
      <div className="ec-modal-bar" onPointerDown={(e) => begin(e, 'move')}>
        <span className="name">{title}</span>
        {tools}
        <button type="button" className="max" aria-label={restore !== undefined ? '이전 크기로' : '최대화'}
                title={restore !== undefined ? '이전 크기로' : '최대화'} onClick={toggleMax}>{restore !== undefined ? <EcIcon name="restore" size={12} glyph="❐" /> : <EcIcon name="maximize" size={12} glyph="□" />}</button>
        <button type="button" className="close" aria-label="닫기" title={esc ? '닫기(ESC)' : '닫기'} onClick={onClose}><EcIcon name="close" size={12} glyph="✕" /></button>
      </div>
      <div className="ec-modal-body">{children}</div>
      {GRIPS.map((d) => <div key={d} className={`ec-modal-grip ${d}`} aria-hidden="true" onPointerDown={(e) => begin(e, d)} />)}
    </div>
  )
}

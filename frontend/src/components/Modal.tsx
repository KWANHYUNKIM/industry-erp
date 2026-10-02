import { useEffect, useRef, type ReactNode } from 'react'

/** 이카운트풍 중앙 팝업(모달). 신규/등록 폼을 인라인 대신 이 안에 띄운다.
 *  배경 클릭·ESC 로 닫힌다.
 *
 *  <p>{@code error} 를 주면 창 맨 위에 띄운다. 화면들은 오류를 화면(목록) 위에 띄우는데, 창이 열려 있으면
 *  그건 <b>창 뒤</b>라 안 보인다 — 필수 항목을 빠뜨리고 [저장]을 누르면 아무 일도 안 일어나는 것처럼
 *  보였다(QA 15회차, 기안서·작업지시·창고이동 …). 화면의 error 상태를 그대로 넘기면 된다. */
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
    <div className="ec-modal-back" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className="ec-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width }}
      >
        <div className="ec-modal-bar">
          <span className="name">{title}</span>
          <button className="close" aria-label="닫기" title="닫기(ESC)" onClick={onClose}>✕</button>
        </div>
        <div className="ec-modal-body">
          {error && <p ref={errorRef} role="alert" className="ec-error">{error}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}

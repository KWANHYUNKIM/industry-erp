import { useEffect, type ReactNode } from 'react'

/** 이카운트풍 중앙 팝업(모달). 신규/등록 폼을 인라인 대신 이 안에 띄운다.
 *  배경 클릭·ESC 로 닫힌다. */
export default function Modal({
  open,
  title,
  onClose,
  children,
  width = 640,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,36,68,.38)', zIndex: 70,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '56px 16px', overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 6, width, maxWidth: '96vw',
          boxShadow: '0 18px 44px rgba(20,36,68,.28)',
        }}
      >
        <div style={{
          padding: '11px 16px', borderBottom: '1px solid #e6eaef',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#f5b301', fontSize: 14 }}>☆</span>
          <span style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--ec-text)' }}>{title}</span>
          <button className="ec-btn" style={{ marginLeft: 'auto', height: 24 }} onClick={onClose}>닫기</button>
        </div>
        <div style={{ padding: 16 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import EcIcon from '../../../components/ui/EcIcon'

/**
 * 원본 '단추 + ▴/▾' 묶음 — 세무 창들(2026-10-22 loginaa 실측)이 쓴다: [저장(F8) ▴(저장/내용유지 · 저장/신규)],
 * [저장/청구서인쇄 ▴], [인쇄 ▴(PDF · 인쇄설정 · 프린트문제해결 · 인쇄)], [재고전표연결 ▴], [Email ▴(Fax · Email)].
 * down 이면 아래로 펼친다([종이세금계산서 ▾]). 단추 몸통은 onClick, 없으면 화살표만 펼친다.
 *
 * @param checked 고른 항목 글자 — 있으면 앞에 ✓ 를 붙인다([종이세금계산서 ▾] 목록).
 */
export interface DropItem { label: string; onClick?: () => void; footer?: boolean }
export default function DropUpButton({ label, primary, down, items, checked, onClick, arrow: arrowProp }: {
  label: string; primary?: boolean; down?: boolean; items: DropItem[]; checked?: string; onClick?: () => void
  /** 화살표 글자만 바꾼다(원본 [종이세금계산서 ⌄] 는 ⌄ 인데 목록은 위로 펼친다). */
  arrow?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  const arrow = arrowProp ?? (down ? '▾' : '▴')
  return (
    <span ref={ref} className="ec-btn-group relative">
      <button type="button" className={`ec-btn${primary ? ' ec-btn-primary' : ''}`} onClick={() => (onClick ? onClick() : setOpen((v) => !v))}>{label}</button>
      <button type="button" className={`ec-btn ec-btn-arrow${primary ? ' ec-btn-primary' : ''}`} aria-label="펼침" onClick={() => setOpen((v) => !v)}>{arrow === '▾' ? <EcIcon name="caret-down" size={10} glyph="▾" /> : arrow === '▴' ? <EcIcon name="caret-up" size={10} glyph="▴" /> : arrow}</button>
      {open && (
        <div className={`ec-menu absolute left-0 ${down ? 'top-[28px]' : 'bottom-[28px]'}`}>
          {items.map((it) => (
            <button key={it.label} type="button" className={it.footer ? 'font-bold' : undefined}
                    onClick={() => { setOpen(false); it.onClick?.() }}>
              {checked !== undefined && !it.footer ? (it.label === checked ? '✓ ' : '') : ''}{it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

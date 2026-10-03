import type { ButtonHTMLAttributes } from 'react'

/**
 * 버튼 — 원본 h26 · 둥글기 10(.ec-btn). primary 는 파란 버튼, small 은 격자 툴바용 h22.
 *
 *   <EcButton primary onClick={save}>저장(F8)</EcButton>
 *   <EcButton small onClick={find}>찾기(F3)</EcButton>
 */
export default function EcButton({ primary = false, small = false, className, type = 'button', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; small?: boolean }) {
  const cls = ['ec-btn', primary && 'ec-btn-primary', small && 'ec-btn-sm', className].filter(Boolean).join(' ')
  return <button type={type} className={cls} {...rest} />
}

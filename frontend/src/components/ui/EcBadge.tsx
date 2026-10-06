import type { ReactNode } from 'react'

/**
 * 상태 글자(정상 · 사용 · 부족 · 대기 …) — 색만 역할로 고른다. 화면에서 색 이름을 직접 고르지 않는다.
 *
 *   <EcBadge tone="success">정상</EcBadge>   <EcBadge tone="danger">부족</EcBadge>
 */
const TONE = {
  success: 'text-ec-success', danger: 'text-ec-danger', warn: 'text-ec-warn',
  info: 'text-ec-navy', muted: 'text-ec-hint',
} as const

export default function EcBadge({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return <span className={TONE[tone]}>{children}</span>
}

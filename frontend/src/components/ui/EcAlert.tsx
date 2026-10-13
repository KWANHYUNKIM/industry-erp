import type { ReactNode } from 'react'

/**
 * 안내 상자 — 저장 실패 · 저장 완료 · 알림. 모양은 styles/index.css `.ec-alert` 한 곳에서 정한다.
 *
 *   {error && <EcAlert tone="danger">{error}</EcAlert>}
 *   <EcAlert tone="success" className="mb-[8px]">저장했습니다.</EcAlert>
 */
export default function EcAlert({ tone = 'info', className, children }: {
  tone?: 'danger' | 'success' | 'info'
  className?: string
  children: ReactNode
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`ec-alert ec-alert-${tone}${className ? ' ' + className : ''}`}>
      {children}
    </div>
  )
}

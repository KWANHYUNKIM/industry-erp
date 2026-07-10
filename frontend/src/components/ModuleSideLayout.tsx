import { NavLink, Outlet } from 'react-router-dom'

/** 이카운트식 모듈 좌측 하위메뉴(localNav) + 본문 */
export interface SideTab { to: string; label: string }

export default function ModuleSideLayout({ title, tabs }: { title: string; tabs: SideTab[] }) {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 150px)', background: '#fff', border: '1px solid var(--ec-border)', borderRadius: 3, overflow: 'hidden' }}>
      {/* 좌측 하위메뉴 */}
      <aside style={{ width: 168, background: '#fafbfc', borderRight: '1px solid var(--ec-border)', padding: '8px 0', flexShrink: 0 }}>
        <div style={{ padding: '4px 14px 8px', fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{title}</div>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end
            style={({ isActive }) => ({
              display: 'block', padding: '7px 14px', fontSize: 12.5, textDecoration: 'none',
              color: isActive ? 'var(--ec-blue)' : '#3a4453',
              background: isActive ? 'var(--ec-blue-light)' : 'transparent',
              borderLeft: isActive ? '3px solid var(--ec-blue)' : '3px solid transparent',
              fontWeight: isActive ? 700 : 400,
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </aside>

      {/* 본문 */}
      <div style={{ flex: 1, minWidth: 0, padding: 12, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}

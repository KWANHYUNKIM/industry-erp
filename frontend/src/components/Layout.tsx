import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

interface MenuItem {
  to: string
  label: string
  icon: string
  adminOnly?: boolean
}

const MENU: { section: string; items: MenuItem[] }[] = [
  {
    section: '개요',
    items: [{ to: '/', label: '대시보드', icon: '🏠' }],
  },
  {
    section: '업무',
    items: [
      { to: '/inventory', label: '재고관리', icon: '📦' },
      { to: '/production', label: '생산관리', icon: '🏭' },
      { to: '/sales', label: '판매/구매', icon: '🧾' },
      { to: '/accounting', label: '회계/원가', icon: '💰' },
    ],
  },
  {
    section: '설정',
    items: [{ to: '/users', label: '사용자 관리', icon: '👤', adminOnly: true }],
  },
]

export default function Layout() {
  const { user, logout, hasRole } = useAuth()

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* 사이드바 */}
      <aside className="flex w-60 flex-col bg-slate-900 text-slate-200">
        <div className="flex h-16 items-center gap-2 border-b border-slate-700 px-5">
          <span className="text-xl">🏭</span>
          <span className="text-lg font-bold text-white">제조 ERP</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {MENU.map((group) => {
            const items = group.items.filter((i) => !i.adminOnly || hasRole('ADMIN'))
            if (items.length === 0) return null
            return (
              <div key={group.section} className="mb-5">
                <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {group.section}
                </p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                        isActive
                          ? 'bg-indigo-600 font-medium text-white'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`
                    }
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
      </aside>

      {/* 본문 */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div />
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">
                {user?.department ?? '부서 미지정'} · {user?.roles.join(', ')}
              </p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              로그아웃
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, tokenStore } from '../api/client'
import type { LoginResponse, User } from '../api/types'
import { permForRoute } from './menuPermissions'

interface MyPermissions {
  admin: boolean
  codes: string[]
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (companyCode: string, username: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (role: string) => boolean
  /** 현재 로그인한 회사코드/회사명 */
  companyCode: string | null
  companyName: string | null
  /** 본사(회사관리 권한 보유) 여부 */
  isHost: boolean
  /** 관리자(전권) 여부 */
  isAdmin: boolean
  /** 이 권한 코드를 가졌는지 (관리자는 항상 true) */
  can: (code: string | null) => boolean
  /** 이 라우트에 접근 가능한지 (메뉴 노출·라우트 가드) */
  canRoute: (path: string) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const COMPANY_KEY = 'erp_company'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [perms, setPerms] = useState<MyPermissions>({ admin: false, codes: [] })
  const [company, setCompany] = useState<{ code: string; name: string } | null>(() => {
    try {
      const raw = localStorage.getItem(COMPANY_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  async function loadPermissions() {
    try {
      const res = await api.get<MyPermissions>('/me/permissions')
      setPerms(res.data)
    } catch {
      setPerms({ admin: false, codes: [] })
    }
  }

  // 앱 시작 시 저장된 토큰으로 사용자 복원
  useEffect(() => {
    const token = tokenStore.get()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get<User>('/auth/me')
      .then(async (res) => {
        setUser(res.data)
        await loadPermissions()
      })
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false))
  }, [])

  async function login(companyCode: string, username: string, password: string) {
    const res = await api.post<LoginResponse>('/auth/login', { companyCode, username, password })
    tokenStore.set(res.data.token)
    const co = { code: res.data.companyCode, name: res.data.companyName }
    localStorage.setItem(COMPANY_KEY, JSON.stringify(co))
    setCompany(co)
    setUser(res.data.user)
    await loadPermissions()
  }

  function logout() {
    tokenStore.clear()
    localStorage.removeItem(COMPANY_KEY)
    setUser(null)
    setCompany(null)
    setPerms({ admin: false, codes: [] })
    window.location.href = '/login'
  }

  function hasRole(role: string) {
    return user?.roles.includes(role) ?? false
  }

  function can(code: string | null) {
    if (code == null) return true
    if (perms.admin) return true
    return perms.codes.includes(code)
  }

  function canRoute(path: string) {
    return can(permForRoute(path))
  }

  return (
    <AuthContext.Provider
      value={{
        user, loading, login, logout, hasRole,
        isAdmin: perms.admin, can, canRoute,
        companyCode: company?.code ?? null,
        companyName: company?.name ?? null,
        isHost: company?.code === '0001',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

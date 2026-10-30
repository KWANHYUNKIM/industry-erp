import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setPermissionHooks, tokenStore } from '../../api/client'
import { ecAlert } from '../../components/EcDialog'
import type { LoginResponse, User } from '../../types/api'
import { permForRoute } from './menuPermissions'

/** 업무 하나의 풀린 권한(서버 MeController.WorkAccess). menus = 예외(메뉴): 화면 경로 → 진입 여부. */
export interface WorkAccess {
  mode: 'ALLOW' | 'DENY' | 'EXC_ACTION' | 'EXC_MENU'
  create: boolean
  update: boolean
  delete: boolean
  export: boolean
  menus: Record<string, boolean>
}

export type WorkAction = 'create' | 'update' | 'delete' | 'export'

interface MyPermissions {
  admin: boolean
  codes: string[]
  works?: Record<string, WorkAccess>
  workNames?: Record<string, string>
  masterOnly?: string[]
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
  /** 이 라우트에 접근 가능한지 (메뉴 노출·라우트 가드) — 업무권한 + 예외(메뉴) */
  canRoute: (path: string) => boolean
  /** 이 업무에서 이 행위(입력 · 수정 · 삭제 · 외부전송)를 할 수 있는지 — 예외(행위) */
  canAct: (code: string | null, action: WorkAction) => boolean
  /** 업무 이름(자물쇠 화면 '(판매) 업무 권한이 없습니다.') */
  workName: (code: string) => string
  /** 마스터 전용 업무(사용자관리) — 자물쇠 화면에 [권한요청] 이 없다 */
  isMasterOnly: (code: string | null) => boolean
  /** 권한을 다시 읽는다(승인 뒤 새로고침 없이) */
  reloadPermissions: () => Promise<void>
}

/* 모든 요청에 화면 업무(X-Erp-Work)를 싣고, 행위 권한 거부는 원본 알림으로 — api/client 에 끼운다 */
setPermissionHooks({ workOf: permForRoute, onDenied: (m) => void ecAlert(m) })

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
    // 재기동 중(502 · 503 · 네트워크 오류)에는 토큰을 지우지 않는다 — 401 일 때만 로그아웃. 잠시 뒤 다시 시도한다.
    let cancelled = false
    const restore = async () => {
      for (let i = 0; i < 20 && !cancelled; i++) {
        try {
          const res = await api.get<User>('/auth/me')
          setUser(res.data)
          await loadPermissions()
          return
        } catch (e) {
          if ((e as { response?: { status?: number } }).response?.status === 401) {
            tokenStore.clear()
            return
          }
          await new Promise((r) => setTimeout(r, 3000))
        }
      }
    }
    restore().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
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
    const code = permForRoute(path)
    if (!can(code)) return false
    if (code == null || perms.admin) return true
    return perms.works?.[code]?.menus?.[path] !== false
  }

  function canAct(code: string | null, action: WorkAction) {
    if (code == null || perms.admin) return true
    const w = perms.works?.[code]
    return !!w && w.mode !== 'DENY' && w[action]
  }

  const workName = (code: string) => perms.workNames?.[code] ?? code
  const isMasterOnly = (code: string | null) => !!code && (perms.masterOnly ?? []).includes(code)

  return (
    <AuthContext.Provider
      value={{
        user, loading, login, logout, hasRole,
        isAdmin: perms.admin, can, canRoute, canAct, workName, isMasterOnly,
        reloadPermissions: loadPermissions,
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

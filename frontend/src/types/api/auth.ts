// 백엔드 응답과 매칭되는 타입 — 인증 · 사용자 · 회사. types/api.ts 가 다시 내보낸다(기존 import 경로 그대로).

export interface User {
  id: number
  username: string
  name: string
  email: string | null
  department: string | null
  /**
   * 이어진 사원(hr.Employee) id. 안 이으면 null.
   *
   * <p>이름·직급·사원번호는 여기 없다 — auth 는 기반층이라 hr 을 참조할 수 없어
   * 서버가 붙이지 못한다(CLAUDE.md 4.1). 근태 응답은 hr 이 붙여서 보낸다.
   */
  employeeId: number | null
  enabled: boolean
  roles: string[]
  /** 기본권한 — 업무모든권한(ALL) · 업무권한없음(NONE) · 권한그룹(GROUP) */
  basePermission: 'ALL' | 'NONE' | 'GROUP'
  /** 마스터(관리자설정) */
  master: boolean
}

export interface Role {
  id: number
  name: string
  displayName: string
  description: string | null
  system?: boolean
  userCount?: number
  permissionCodes?: string[]
}

export interface Permission {
  code: string
  name: string
  category: string
  sort: number
}

export interface LoginResponse {
  token: string
  companyCode: string
  companyName: string
  user: User
}

export interface Company {
  id: number
  code: string
  name: string
  schemaName: string
  active: boolean
  createdAt: string | null
  /** 사용자 수 한도. null = 제한 없음 */
  maxUsers: number | null
  /** 사용기한(이 날까지). null = 무기한 */
  expiresOn: string | null
}

export interface CreateUserRequest {
  username: string
  password: string
  name: string
  email?: string
  department?: string
  roleNames: string[]
}

export interface UpdateUserRequest {
  name: string
  email?: string
  department?: string
  enabled?: boolean
  roleNames?: string[]
  password?: string
}

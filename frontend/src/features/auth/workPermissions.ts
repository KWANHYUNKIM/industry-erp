// 업무권한(서버 WorkPermissionDtos) 타입과 업무 → 하위 메뉴.
import { FLAT_MENU } from '../../app/layout/menu'
import { permForRoute } from './menuPermissions'

export type WorkMode = 'ALLOW' | 'DENY' | 'EXC_ACTION' | 'EXC_MENU'
export type BasePermission = 'ALL' | 'NONE' | 'GROUP'

export interface WorkRow {
  workCode: string
  workName: string
  category: string
  masterOnly: boolean
  /** 사용자: 이 업무를 개별로 정했나(아니면 기본권한 · 권한그룹에서 풀린 값) */
  individual: boolean
  mode: WorkMode
  create: boolean
  update: boolean
  delete: boolean
  export: boolean
  menus: Record<string, boolean>
}

export interface UserWorks {
  userId: number
  username: string
  name: string
  master: boolean
  basePermission: BasePermission
  groupId: number | null
  groupName: string | null
  works: WorkRow[]
}

export interface GroupWorks { groupId: number; code: string; name: string; works: WorkRow[] }

export interface SaveWorkRow {
  workCode: string
  mode: WorkMode
  create: boolean
  update: boolean
  delete: boolean
  export: boolean
  menus: Record<string, boolean>
}

export const BASE_LABEL: Record<BasePermission, string> = { ALL: '업무모든권한', NONE: '업무권한없음', GROUP: '권한그룹' }

/** 상세 권한(예외(행위)) — 원본 입력 · 수정 · 삭제 · 외부전송(인쇄 · Excel · 메일). */
export const ACTIONS: { key: 'create' | 'update' | 'delete' | 'export'; label: string }[] = [
  { key: 'create', label: '입력' },
  { key: 'update', label: '수정' },
  { key: 'delete', label: '삭제' },
  { key: 'export', label: '외부전송' },
]

/**
 * 업무 안의 하위 메뉴(예외(메뉴) 창의 줄) — 메뉴 표(FLAT_MENU)에서 그 업무로 풀리는 화면들. 같은 화면이 여러 곳에 걸리면 하나만.
 * 메뉴 표와 업무 규칙(menuPermissions)이 단일 출처라 따로 적지 않는다.
 */
export function menusOfWork(code: string): { to: string; label: string; path: string }[] {
  const seen = new Set<string>()
  return FLAT_MENU.filter((m) => {
    const to = m.to.split('?')[0]
    if (seen.has(to) || permForRoute(to) !== code) return false
    seen.add(to)
    return true
  }).map((m) => ({ to: m.to.split('?')[0], label: m.label, path: m.path }))
}

/** 줄 → 저장 줄 */
export function toSave(r: WorkRow): SaveWorkRow {
  return { workCode: r.workCode, mode: r.mode, create: r.create, update: r.update, delete: r.delete, export: r.export, menus: r.menus ?? {} }
}

/** 화면에 보이는 권한 글(권한있음 · 권한없음 · 예외(행위) · 예외(메뉴)) */
export function modeLabel(r: Pick<WorkRow, 'mode' | 'create' | 'update' | 'delete' | 'export' | 'menus'>): string {
  if (r.mode === 'DENY') return '권한없음'
  const act = !(r.create && r.update && r.delete && r.export)
  const menu = Object.values(r.menus ?? {}).some((v) => v === false)
  if (act && menu) return '예외(행위) · 예외(메뉴)'
  if (act) return '예외(행위)'
  if (menu) return '예외(메뉴)'
  return '권한있음'
}

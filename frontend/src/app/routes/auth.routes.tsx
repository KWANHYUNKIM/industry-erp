import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
const UsersPage = lazy(() => import('../../pages/UsersPage'))
const PermissionGroupsPage = lazy(() => import('../../pages/PermissionGroupsPage'))
const PermissionRequestsPage = lazy(() => import('../../pages/PermissionRequestsPage'))
const MastersPage = lazy(() => import('../../pages/MastersPage'))
const CompaniesPage = lazy(() => import('../../pages/CompaniesPage'))

/** 사용자관리 라우트 — app/router.tsx 가 원래 자리(차례)에 그대로 붙인다. */
export const authRoutes = (
  <>
    <Route path="/users" element={<UsersPage />} />
    {/* 옛 역할·권한관리 → 원본 사용자관리 LNB(사용자등록 · 권한그룹 설정 · 권한승인대기현황 · 관리자설정) */}
    <Route path="/roles" element={<Navigate to="/users/permission-groups" replace />} />
    <Route path="/users/permission-groups" element={<PermissionGroupsPage />} />
    <Route path="/users/permission-requests" element={<PermissionRequestsPage />} />
    <Route path="/users/masters" element={<MastersPage />} />
    <Route path="/companies" element={<CompaniesPage />} />
  </>
)

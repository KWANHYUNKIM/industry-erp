import { Suspense, lazy } from 'react'
import { Navigate, Outlet, Route, Routes, type Location } from 'react-router-dom'
import ProtectedRoute from '../features/auth/components/ProtectedRoute'
import EcountLayout from './layout/EcountLayout'
import LoginPage from '../pages/LoginPage'
const MyPageDashboard = lazy(() => import('../pages/MyPageDashboard'))
import { inventoryRoutes } from './routes/inventory.routes'
import { productionRoutes } from './routes/production.routes'
import { tradeRoutes } from './routes/trade.routes'
import { accountingRoutes } from './routes/accounting.routes'
import { qualityRoutes } from './routes/quality.routes'
import { settingsRoutes } from './routes/settings.routes'
import { groupwareRoutes } from './routes/groupware.routes'
import { datacenterRoutes } from './routes/datacenter.routes'
import { hrRoutes } from './routes/hr.routes'
import { authRoutes } from './routes/auth.routes'

/** 좌측 사이드바는 EcountLayout이 활성 탭 기준으로 그린다.
 *  그래서 모듈별 레이아웃 래퍼 없이 모든 화면이 EcountLayout 아래 평평하게 붙는다.
 *
 *  <p>{@code location} 을 주면 브라우저 주소 대신 그 주소의 화면 하나만 틀(EcountLayout) 없이 그린다 —
 *  MyPage 위젯 [새창] 이 원본처럼 그 메뉴 화면을 메인 위의 창(레이어)으로 띄울 때 쓴다(features/mypage/PageWindow). */
export default function AppRouter({ location }: { location?: Partial<Location> } = {}) {
  return (
    <Suspense fallback={<div className="p-[24px] text-ec-hint text-[13px]">화면을 불러오는 중…</div>}>
      <Routes location={location}>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={location ? <Outlet /> : (
          <ProtectedRoute>
            <EcountLayout />
          </ProtectedRoute>
        )}
      >
        <Route path="/" element={<MyPageDashboard />} />

        {inventoryRoutes}
        {productionRoutes}
        {tradeRoutes}
        {accountingRoutes}
        {qualityRoutes}
        {settingsRoutes}
        {groupwareRoutes}
        {datacenterRoutes}
        {hrRoutes}
        {authRoutes}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

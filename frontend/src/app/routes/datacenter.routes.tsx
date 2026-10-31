import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
const DataCollectPage = lazy(() => import('../../pages/datacenter/DataCollectPage'))
const DataExportPage = lazy(() => import('../../pages/datacenter/DataExportPage'))
const CollectSourcePage = lazy(() => import('../../pages/datacenter/CollectSourcePage'))

/** 데이터센터 라우트 — app/router.tsx 가 원래 자리(차례)에 그대로 붙인다. */
export const datacenterRoutes = (
  <>
    {/* 데이터센터 */}
    <Route path="/datacenter" element={<Navigate to="/datacenter/collect" replace />} />
    <Route path="/datacenter/collect" element={<DataCollectPage />} />
    <Route path="/datacenter/collect-sources" element={<CollectSourcePage />} />
    <Route path="/datacenter/export" element={<DataExportPage />} />
  </>
)

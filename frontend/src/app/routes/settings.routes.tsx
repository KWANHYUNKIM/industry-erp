import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
const CompanyInfoPage = lazy(() => import('../../pages/settings/company/CompanyInfoPage'))
const PreferencesPage = lazy(() => import('../../pages/settings/preference/PreferencesPage'))
const SecurityPage = lazy(() => import('../../pages/settings/company/SecurityPage'))
const DefaultsPage = lazy(() => import('../../pages/settings/preference/DefaultsPage'))
const MyFolderPage = lazy(() => import('../../pages/mypage/MyFolderPage'))
const DownloadPage = lazy(() => import('../../pages/settings/DownloadPage'))
const PrintSignLinePage = lazy(() => import('../../pages/settings/company/PrintSignLinePage'))
const EtcSystemPage = lazy(() => import('../../pages/settings/EtcSystemPage'))
const CommonCodePage = lazy(() => import('../../pages/settings/commoncode/CommonCodePage'))
const DesignSystemPage = lazy(() => import('../../pages/settings/DesignSystemPage'))
const CustomFieldPage = lazy(() => import('../../pages/settings/commoncode/CustomFieldPage'))

/** Self-Customizing 라우트 — app/router.tsx 가 원래 자리(차례)에 그대로 붙인다. */
export const settingsRoutes = (
  <>
    {/* Self-Customizing */}
    <Route path="/settings" element={<Navigate to="/settings/company" replace />} />
    <Route path="/settings/company" element={<CompanyInfoPage />} />
    <Route path="/settings/preferences" element={<PreferencesPage />} />
    <Route path="/settings/security" element={<SecurityPage />} />
    <Route path="/settings/download" element={<DownloadPage />} />
    <Route path="/settings/defaults" element={<DefaultsPage />} />
    <Route path="/mypage/folders" element={<MyFolderPage />} />
    <Route path="/settings/print-sign" element={<PrintSignLinePage />} />
    {/* 인쇄용결재라인등록 — 회계 I 메뉴는 [회계], 관리 메뉴는 [관리] 알약이 켜진 채로 연다(원본 E010106 · E090102) */}
    <Route path="/accounting/print-sign" element={<PrintSignLinePage />} />
    <Route path="/hr/print-sign" element={<PrintSignLinePage />} />
    {/* 재고 I 메뉴는 [재고] 알약이 켜진 채로 연다(원본 E040111) */}
    <Route path="/inventory/print-sign" element={<PrintSignLinePage />} />
    <Route path="/settings/etc" element={<EtcSystemPage />} />
    <Route path="/settings/codes" element={<CommonCodePage />} />
    <Route path="/settings/design-system" element={<DesignSystemPage />} />
    <Route path="/settings/custom-fields" element={<CustomFieldPage />} />
  </>
)

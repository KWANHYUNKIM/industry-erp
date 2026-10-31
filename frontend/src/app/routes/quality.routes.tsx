import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
const QualityInspectionPage = lazy(() => import('../../pages/quality/inspection/QualityInspectionPage'))
const QualityRequestPage = lazy(() => import('../../pages/quality/inspectionrequest/QualityRequestPage'))
const QualityRequestEntryPage = lazy(() => import('../../pages/quality/inspectionrequest/QualityRequestEntryPage'))
const QualityInspectionEntryPage = lazy(() => import('../../pages/quality/inspection/QualityInspectionEntryPage'))
const UninspectedPage = lazy(() => import('../../pages/quality/inspectionrequest/UninspectedPage'))
const QualityRequestStatusPage = lazy(() => import('../../pages/quality/inspectionrequest/QualityRequestStatusPage'))
const DefectReportPage = lazy(() => import('../../pages/quality/inspection/DefectReportPage'))
const LotLedgerPage = lazy(() => import('../../pages/quality/lot/LotLedgerPage'))
const QualityStatusPage = lazy(() => import('../../pages/quality/inspection/QualityStatusPage'))
const SerialLotPage = lazy(() => import('../../pages/quality/lot/SerialLotPage'))
const LotStockComparePage = lazy(() => import('../../pages/quality/lot/LotStockComparePage'))
const LotStockStatusPage = lazy(() => import('../../pages/quality/lot/LotStockStatusPage'))
const LotAdjustPage = lazy(() => import('../../pages/quality/lot/LotAdjustPage'))
const LotTxStatusPage = lazy(() => import('../../pages/quality/lot/LotTxStatusPage'))
const LotTxListPage = lazy(() => import('../../pages/quality/lot/LotTxListPage'))
const AsManagePage = lazy(() => import('../../pages/quality/asrequest/AsManagePage'))
const AsReceiptEntryPage = lazy(() => import('../../pages/quality/asrequest/AsReceiptEntryPage'))
const AsStatusPage = lazy(() => import('../../pages/quality/asrequest/AsStatusPage'))
const AsRepairStatusPage = lazy(() => import('../../pages/quality/asrepair/AsRepairStatusPage'))
const AsRepairListPage = lazy(() => import('../../pages/quality/asrepair/AsRepairListPage'))
const AsRepairEntryPage = lazy(() => import('../../pages/quality/asrepair/AsRepairEntryPage'))
const AsConsumptionPage = lazy(() => import('../../pages/quality/asrequest/AsConsumptionPage'))
const QualityTypePage = lazy(() => import('../../pages/quality/qctype/QualityTypePage'))

/** 품질 라우트 — app/router.tsx 가 원래 자리(차례)에 그대로 붙인다. */
export const qualityRoutes = (
  <>
    {/* 품질 */}
    <Route path="/quality" element={<Navigate to="/quality/inspection" replace />} />
    <Route path="/quality/inspection" element={<QualityInspectionPage />} />
    <Route path="/quality/inspection-status" element={<QualityStatusPage />} />
    <Route path="/quality/inspection-type" element={<QualityTypePage />} />
    <Route path="/quality/inspection-request" element={<QualityRequestPage />} />
    {/* 원본 품질검사요청입력(E040628) · 품질검사입력(E040621) 메뉴 — 같은 화면이 입력 창을 열고 뜬다. */}
    <Route path="/quality/inspection-request-entry" element={<QualityRequestEntryPage />} />
    <Route path="/quality/inspection-entry" element={<QualityInspectionEntryPage />} />
    <Route path="/quality/uninspected" element={<UninspectedPage />} />
    <Route path="/quality/request-status" element={<QualityRequestStatusPage />} />
    <Route path="/quality/defect-report" element={<DefectReportPage />} />
    <Route path="/quality/lot-ledger" element={<LotLedgerPage />} />
    <Route path="/quality/serial-lot" element={<SerialLotPage />} />
    <Route path="/quality/lot-compare" element={<LotStockComparePage />} />
    <Route path="/quality/lot-stock" element={<LotStockStatusPage />} />
    <Route path="/quality/lot-adjust" element={<LotAdjustPage />} />
    <Route path="/quality/lot-tx-status" element={<LotTxStatusPage />} />
    <Route path="/quality/lot-tx-list" element={<LotTxListPage />} />
    <Route path="/quality/as" element={<AsManagePage />} />
    <Route path="/quality/as-entry" element={<AsReceiptEntryPage />} />
    <Route path="/quality/as-status" element={<AsStatusPage />} />
    <Route path="/quality/as-repair-entry" element={<AsRepairEntryPage />} />
    <Route path="/quality/as-repair-list" element={<AsRepairListPage />} />
    <Route path="/quality/as-repair-status" element={<AsRepairStatusPage />} />
    <Route path="/quality/as-consumption" element={<AsConsumptionPage />} />
  </>
)

import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
import { ProductionIssueStatusPage } from './inventory.routes'
const BomPage = lazy(() => import('../../pages/production/BomPage'))
const WorkOrderPage = lazy(() => import('../../pages/production/WorkOrderPage'))
const WorkOrderEntryPage = lazy(() => import('../../pages/production/WorkOrderEntryPage'))
const SubcontractReflectionPage = lazy(() => import('../../pages/production/SubcontractReflectionPage'))
const PurchaseTaxStockPage = lazy(() => import('../../pages/production/PurchaseTaxStockPage'))
const BomStatusPage = lazy(() => import('../../pages/production/BomStatusPage'))
const RequirementCalcPage = lazy(() => import('../../pages/production/RequirementCalcPage'))
const ProductionResultPage = lazy(() => import('../../pages/production/ProductionResultPage'))
const PlanningPage = lazy(() => import('../../pages/production/PlanningPage'))
const MrpPage = lazy(() => import('../../pages/production/MrpPage'))
const ProcessPage = lazy(() => import('../../pages/production/ProcessPage'))
const ResourcePage = lazy(() => import('../../pages/production/ResourcePage'))
const BorPage = lazy(() => import('../../pages/production/BorPage'))
const WoStatusPage = lazy(() => import('../../pages/production/WoStatusPage'))
const WoEfficiencyPage = lazy(() => import('../../pages/production/WoEfficiencyPage'))
const IssuePage = lazy(() => import('../../pages/production/IssuePage'))
const IssueEntryPage = lazy(() => import('../../pages/production/IssueEntryPage'))
const WorkResultPage = lazy(() => import('../../pages/production/WorkResultPage'))
const WorkProcessPage = lazy(() => import('../../pages/production/WorkProcessPage'))
const TimeCalcPage = lazy(() => import('../../pages/production/TimeCalcPage'))
const ReceiptStatusPage = lazy(() => import('../../pages/production/ReceiptStatusPage'))
const IssueStatusPage = lazy(() => import('../../pages/production/IssueStatusPage'))
const WorkResultListPage = lazy(() => import('../../pages/production/WorkResultListPage'))
const WorkResultInquiryPage = lazy(() => import('../../pages/production/WorkResultInquiryPage'))
const WoProgressPage = lazy(() => import('../../pages/production/WoProgressPage'))
const ReceiptInquiryPage = lazy(() => import('../../pages/production/ReceiptInquiryPage'))

/** 생산 라우트 — app/router.tsx 가 원래 자리(차례)에 그대로 붙인다. */
export const productionRoutes = (
  <>
    {/* 생산 */}
    <Route path="/production" element={<Navigate to="/production/bom" replace />} />
    <Route path="/production/bom" element={<BomPage />} />
    <Route path="/production/work-orders" element={<WorkOrderPage />} />
    <Route path="/production/work-order-entry" element={<WorkOrderEntryPage />} />
    <Route path="/production/subcontract-reflection" element={<SubcontractReflectionPage />} />
    <Route path="/production/purchase-tax-status" element={<PurchaseTaxStockPage />} />
    <Route path="/production/purchase-tax-list" element={<PurchaseTaxStockPage list />} />
    <Route path="/sales/sales-tax-status" element={<PurchaseTaxStockPage kind="SALES" />} />
    <Route path="/sales/sales-tax-list" element={<PurchaseTaxStockPage kind="SALES" list />} />
    <Route path="/production/bom-status" element={<BomStatusPage />} />
    <Route path="/production/requirement-calc" element={<RequirementCalcPage />} />
    {/*
      옛 경로. 메뉴에서는 [생산입고 I(BOM기준소모)] 로 부른다 — 원본에 [생산실적] 이라는
      이름이 없다. 북마크·바로가기가 남아 있을 수 있어 경로는 살려 둔다.
    */}
    <Route path="/production/result" element={<ProductionResultPage />} />
    <Route path="/production/planning" element={<PlanningPage />} />
    <Route path="/production/mrp" element={<MrpPage />} />
    <Route path="/production/process" element={<ProcessPage />} />
    <Route path="/production/resource" element={<ResourcePage />} />
    <Route path="/production/bor" element={<BorPage />} />
    <Route path="/production/wo-status" element={<WoStatusPage />} />
    <Route path="/production/wo-efficiency" element={<WoEfficiencyPage />} />
    <Route path="/production/issue" element={<IssuePage />} />
    <Route path="/production/issue-entry" element={<IssueEntryPage />} />
    <Route path="/production/issue-status" element={<IssueStatusPage />} />
    <Route path="/production/work-result" element={<WorkResultPage />} />
    <Route path="/production/work-result-list" element={<WorkResultInquiryPage />} />
    <Route path="/production/work-result-status" element={<WorkResultListPage />} />
    <Route path="/production/time-calc" element={<TimeCalcPage />} />
    <Route path="/production/receipt-status" element={<ReceiptStatusPage />} />
    <Route path="/production/wo-work" element={<WorkProcessPage />} />
    <Route path="/production/wo-progress" element={<WoProgressPage />} />
    {/* 원본 [생산입고 I(BOM기준소모)] 는 입력 화면이다 — 소모품목을 고르지 않고 BOM 대로 자동소모한다. */}
    <Route path="/production/receipt-bom" element={<ProductionResultPage key="I" />} />
    <Route path="/production/receipt-manual" element={<ProductionResultPage key="II" type="II" />} />
    <Route path="/production/receipt-qr" element={<ProductionResultPage key="III" type="III" />} />
    <Route path="/production/receipt-inquiry" element={<ReceiptInquiryPage />} />
    {/* 옛 경로. 원본 화면은 [생산입고/소모현황 I] 하나다 — 북마크가 남아 있을 수 있어 살려 둔다. */}
    <Route path="/production/consume-status" element={<ProductionIssueStatusPage />} />
  </>
)

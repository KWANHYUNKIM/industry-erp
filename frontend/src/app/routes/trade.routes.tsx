import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
/* 이름표 묶음은 값이라 lazy 로 못 받는다 — 화면 파일에서 그대로 가져온다. */
import { PLAN_LABELS } from '../../pages/trade/PurchaseRequestStatusPage'
const PartnersPage = lazy(() => import('../../pages/trade/PartnersPage'))
const TradeEntry = lazy(() => import('../../pages/trade/TradeEntry'))
const LedgerPage = lazy(() => import('../../pages/trade/LedgerPage'))
const SettlementPage = lazy(() => import('../../pages/trade/SettlementPage'))
const SalesOrderPage = lazy(() => import('../../pages/trade/SalesOrderPage'))
const SalesOrderEntry = lazy(() => import('../../pages/trade/SalesOrderEntry'))
const OrderReleasePage = lazy(() => import('../../pages/trade/OrderReleasePage'))
const QuotationPage = lazy(() => import('../../pages/trade/QuotationPage'))
const QuotationEntry = lazy(() => import('../../pages/trade/QuotationEntry'))
const PurchaseOrderPage = lazy(() => import('../../pages/trade/PurchaseOrderPage'))
const PayablePage = lazy(() => import('../../pages/trade/PayablePage'))
const TradeInquiryPage = lazy(() => import('../../pages/trade/TradeInquiryPage'))
const ExportPage = lazy(() => import('../../pages/trade/ExportPage'))
const ExportStatusPage = lazy(() => import('../../pages/trade/ExportStatusPage'))
const MallPage = lazy(() => import('../../pages/trade/MallPage'))
const SalesStatusPage = lazy(() => import('../../pages/trade/SalesStatusPage'))
const SalesOrderStatusPage = lazy(() => import('../../pages/trade/SalesOrderStatusPage'))
const TradeHistoryPage = lazy(() => import('../../pages/trade/TradeHistoryPage'))
const SalesPurchaseSummaryPage = lazy(() => import('../../pages/trade/SalesPurchaseSummaryPage'))
const MonthlyArApPage = lazy(() => import('../../pages/trade/MonthlyArApPage'))
const PriceMovementPage = lazy(() => import('../../pages/trade/PriceMovementPage'))
const ItemEntryPage = lazy(() => import('../../pages/trade/ItemEntryPage'))
const MonthlyCumulativePage = lazy(() => import('../../pages/trade/MonthlyCumulativePage'))
const PivotSummaryPage = lazy(() => import('../../pages/trade/PivotSummaryPage'))
const SalesPlanPage = lazy(() => import('../../pages/trade/SalesPlanPage'))
const SalesPlanComparePage = lazy(() => import('../../pages/trade/SalesPlanComparePage'))
const SalesPlanListPage = lazy(() => import('../../pages/trade/SalesPlanListPage'))
const SalesPlanEntryPage = lazy(() => import('../../pages/trade/SalesPlanEntryPage'))
const SalesPlanStatusPage = lazy(() => import('../../pages/trade/SalesPlanStatusPage'))
const UnorderedStatusPage = lazy(() => import('../../pages/trade/UnorderedStatusPage'))
const UnpurchasedStatusPage = lazy(() => import('../../pages/trade/UnpurchasedStatusPage'))
const PurchaseOrderStatusPage = lazy(() => import('../../pages/trade/PurchaseOrderStatusPage'))
const PurchaseRequestStatusPage = lazy(() => import('../../pages/trade/PurchaseRequestStatusPage'))
const PurchaseRequestListPage = lazy(() => import('../../pages/trade/PurchaseRequestListPage'))
const PurchaseRequestInputPage = lazy(() => import('../../pages/trade/PurchaseRequestInputPage'))
const PurchasePlanInputPage = lazy(() => import('../../pages/trade/PurchasePlanInputPage'))
const PurchasePlanListPage = lazy(() => import('../../pages/trade/PurchasePlanListPage'))
const PriceRequestListPage = lazy(() => import('../../pages/trade/PriceRequestListPage'))
const PriceRequestInputPage = lazy(() => import('../../pages/trade/PriceRequestInputPage'))
const PurchaseOrderInputPage = lazy(() => import('../../pages/trade/PurchaseOrderInputPage'))
const SalesDiscountPage = lazy(() => import('../../pages/trade/SalesDiscountPage'))
const PurchaseStatusPage = lazy(() => import('../../pages/trade/PurchaseStatusPage'))
const PurchaseDiscountPage = lazy(() => import('../../pages/trade/PurchaseDiscountPage'))
const ShipmentOrderPage = lazy(() => import('../../pages/trade/ShipmentOrderPage'))
const ShipmentOrderEntry = lazy(() => import('../../pages/trade/ShipmentOrderEntry'))
const ShipmentOrderStatusPage = lazy(() => import('../../pages/trade/ShipmentOrderStatusPage'))
const ShipmentPage = lazy(() => import('../../pages/trade/ShipmentPage'))
const ShipmentInquiryPage = lazy(() => import('../../pages/trade/ShipmentInquiryPage'))
const ShipmentEntryPage = lazy(() => import('../../pages/trade/ShipmentEntryPage'))
const PriceRequestProgressPage = lazy(() => import('../../pages/trade/PriceRequestProgressPage'))
const UnshippedPage = lazy(() => import('../../pages/trade/UnshippedPage'))
const UnsoldStatusPage = lazy(() => import('../../pages/trade/UnsoldStatusPage'))
const CollectionPage = lazy(() => import('../../pages/trade/CollectionPage'))
const PaymentPage = lazy(() => import('../../pages/trade/PaymentPage'))
const PartnerLedgerPage = lazy(() => import('../../pages/trade/PartnerLedgerPage'))
const ArApStatusPage = lazy(() => import('../../pages/trade/ArApStatusPage'))
const AccountingReflectionPage = lazy(() => import('../../pages/trade/SalesBatchReflectionPage'))
const OutsourcingDiscountPage = lazy(() => import('../../pages/trade/OutsourcingDiscountPage'))
const StatementPrintPage = lazy(() => import('../../pages/trade/StatementPrintPage'))
const PartnerEntryPage = lazy(() => import('../../pages/trade/PartnerEntryPage'))
const PaymentHistoryPage = lazy(() => import('../../pages/trade/PaymentHistoryPage'))
const PaymentComparePage = lazy(() => import('../../pages/trade/PaymentComparePage'))
const SalesPriceBulkPage = lazy(() => import('../../pages/trade/SalesPriceBulkPage'))
const SpecialPricePage = lazy(() => import('../../pages/trade/SpecialPricePage'))
const MallItemMappingPage = lazy(() => import('../../pages/trade/MallItemMappingPage'))
const MallAccountPage = lazy(() => import('../../pages/trade/MallAccountPage'))
const ConditionSearchPage = lazy(() => import('../../pages/trade/ConditionSearchPage'))
const PurchasePriceBulkPage = lazy(() => import('../../pages/trade/PurchasePriceBulkPage'))
const OrderTypePage = lazy(() => import('../../pages/trade/OrderTypePage'))
const OrderStagePage = lazy(() => import('../../pages/trade/OrderStagePage'))

/** 판매 · 구매 라우트 — app/router.tsx 가 원래 자리(차례)에 그대로 붙인다. */
export const tradeRoutes = (
  <>
    {/* 판매/구매 */}
    <Route path="/sales" element={<Navigate to="/sales/partners" replace />} />
    <Route path="/sales/partners" element={<PartnersPage />} />
    <Route path="/sales/sell" element={<TradeEntry mode="sales" />} />
    <Route path="/sales/sell2" element={<TradeEntry key="sell2" mode="sales" adjust />} />
    <Route path="/sales/buy" element={<TradeEntry mode="purchase" />} />
    <Route path="/sales/sales-list" element={<TradeInquiryPage mode="sales" />} />
    <Route path="/sales/purchase-list" element={<TradeInquiryPage mode="purchase" />} />
    <Route path="/sales/settlement" element={<SettlementPage />} />
    <Route path="/sales/ledger" element={<LedgerPage />} />
    <Route path="/sales/ledger-receivable" element={<LedgerPage side="AR" />} />
    <Route path="/sales/ledger-payable" element={<LedgerPage side="AP" />} />
    <Route path="/sales/orders" element={<SalesOrderPage />} />
    <Route path="/sales/order-entry" element={<SalesOrderEntry />} />
    <Route path="/sales/order-release" element={<OrderReleasePage />} />
    <Route path="/sales/order-status" element={<SalesOrderStatusPage />} />
    <Route path="/sales/trade-history" element={<TradeHistoryPage />} />
    <Route path="/sales/sales-purchase-summary" element={<SalesPurchaseSummaryPage />} />
    <Route path="/sales/monthly-ar-ap" element={<MonthlyArApPage />} />
    <Route path="/sales/monthly-ap" element={<MonthlyArApPage defaultMode="AP" />} />
    <Route path="/sales/price-movement" element={<PriceMovementPage />} />
    <Route path="/sales/item-entry" element={<ItemEntryPage />} />
    <Route path="/sales/monthly-cumulative" element={<MonthlyCumulativePage />} />
    <Route path="/sales/pivot-summary" element={<PivotSummaryPage />} />
    <Route path="/sales/sales-plan" element={<SalesPlanPage />} />
    <Route path="/sales/sales-plan-compare" element={<SalesPlanComparePage />} />
    <Route path="/sales/sales-plan-entry" element={<SalesPlanEntryPage />} />
    <Route path="/sales/sales-plan-list" element={<SalesPlanListPage />} />
    <Route path="/sales/sales-plan-status" element={<SalesPlanStatusPage />} />
    <Route path="/sales/unordered" element={<UnorderedStatusPage />} />
    <Route path="/sales/quotations" element={<QuotationPage />} />
    <Route path="/sales/quotation-entry" element={<QuotationEntry />} />
    <Route path="/sales/purchase-orders" element={<PurchaseOrderPage />} />
    <Route path="/sales/purchase-order-input" element={<PurchaseOrderInputPage />} />
    <Route path="/sales/payable" element={<PayablePage />} />
    <Route path="/sales/export" element={<ExportPage />} />
    <Route path="/sales/export-status" element={<ExportStatusPage />} />
    <Route path="/sales/mall" element={<MallPage />} />
    <Route path="/sales/mall/confirm" element={<MallPage mode="confirm" />} />
    <Route path="/sales/mall/ship" element={<MallPage mode="ship" />} />
    <Route path="/sales/mall/cancel" element={<MallPage mode="cancel" />} />
    <Route path="/sales/mall/return" element={<MallPage mode="return" />} />
    <Route path="/sales/mall/exchange" element={<MallPage mode="exchange" />} />
    <Route path="/sales/mall/erp-send" element={<MallPage mode="erp" />} />
    <Route path="/sales/mall-item-mappings" element={<MallItemMappingPage />} />
    <Route path="/sales/mall-accounts" element={<MallAccountPage />} />
    <Route path="/sales/condition-search" element={<ConditionSearchPage />} />
    <Route path="/sales/sales-status" element={<SalesStatusPage />} />
    <Route path="/sales/sales-discount" element={<SalesDiscountPage />} />
    <Route path="/sales/purchase-status" element={<PurchaseStatusPage />} />
    <Route path="/sales/unpurchased" element={<UnpurchasedStatusPage />} />
    <Route path="/sales/purchase-order-status" element={<PurchaseOrderStatusPage />} />
    <Route path="/sales/purchase-requests" element={<PurchaseRequestListPage />} />
    <Route path="/sales/purchase-request-input" element={<PurchaseRequestInputPage />} />
    <Route path="/sales/purchase-plans" element={<PurchasePlanListPage />} />
    <Route path="/sales/purchase-plan-input" element={<PurchasePlanInputPage />} />
    <Route path="/sales/price-requests" element={<PriceRequestListPage />} />
    <Route path="/sales/price-request-input" element={<PriceRequestInputPage />} />
    <Route path="/sales/purchase-request-status" element={<PurchaseRequestStatusPage />} />
    {/*
      한 파일이 셋을 겸하는데 <b>조건 이름표가 화면마다 다르다</b>(2026-09-08 실측) —
      발주요청현황만 [메뉴]·[발주요청No.]·[작성자]·[정렬기준] 이고,
      아래 둘은 [구분]·[발주No.]·[최초작성자]·[정렬/소계기준] 이다.
    */}
    <Route path="/sales/purchase-plan-status" element={<PurchaseRequestStatusPage defaultStatus="PLANNED" title="발주계획현황" {...PLAN_LABELS} />} />
    <Route path="/sales/price-request-status" element={<PurchaseRequestStatusPage defaultStatus="PRICE_REQUESTED" title="단가요청현황" {...PLAN_LABELS} />} />
    <Route path="/sales/price-request-progress" element={<PriceRequestProgressPage />} />
    <Route path="/sales/purchase-discount" element={<PurchaseDiscountPage />} />
    <Route path="/sales/shipment-order" element={<ShipmentOrderPage />} />
    <Route path="/sales/shipment-order-entry" element={<ShipmentOrderEntry />} />
    <Route path="/sales/shipment-order-status" element={<ShipmentOrderStatusPage />} />
    <Route path="/sales/shipment" element={<ShipmentPage />} />
    <Route path="/sales/shipment-inquiry" element={<ShipmentInquiryPage />} />
    <Route path="/sales/shipment-entry" element={<ShipmentEntryPage />} />
    <Route path="/sales/unshipped" element={<UnshippedPage />} />
    <Route path="/sales/unsold" element={<UnsoldStatusPage />} />
    <Route path="/sales/collection" element={<CollectionPage />} />
    <Route path="/sales/payment" element={<PaymentPage />} />
    <Route path="/sales/partner-ledger" element={<PartnerLedgerPage />} />
    <Route path="/sales/partner-ledger-receivable" element={<PartnerLedgerPage side="AR" />} />
    <Route path="/sales/partner-ledger-payable" element={<PartnerLedgerPage side="AP" />} />
    <Route path="/sales/ar-ap-status" element={<ArApStatusPage screen="AR_AP" />} />
    <Route path="/sales/receivable-status" element={<ArApStatusPage screen="AR" />} />
    <Route path="/sales/payable-status" element={<ArApStatusPage screen="AP" />} />
    <Route path="/sales/accounting-reflection" element={<AccountingReflectionPage />} />
    <Route path="/sales/outsourcing-discount" element={<OutsourcingDiscountPage />} />
    <Route path="/sales/order-types" element={<OrderTypePage />} />
    <Route path="/sales/order-stages" element={<OrderStagePage />} />
    <Route path="/sales/sales-price-bulk" element={<SalesPriceBulkPage />} />
    <Route path="/sales/special-price" element={<SpecialPricePage />} />
    <Route path="/sales/purchase-price-bulk" element={<PurchasePriceBulkPage />} />
    <Route path="/sales/partner-entry" element={<PartnerEntryPage />} />
    <Route path="/sales/statement" element={<StatementPrintPage />} />
    <Route path="/sales/payment-history" element={<PaymentHistoryPage />} />
    <Route path="/sales/payment-compare" element={<PaymentComparePage />} />
  </>
)

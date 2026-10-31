import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
const ItemsPage = lazy(() => import('../../pages/inventory/item/ItemsPage'))
const WarehousesPage = lazy(() => import('../../pages/inventory/warehouse/WarehousesPage'))
const StockIoPage = lazy(() => import('../../pages/inventory/stock/StockIoPage'))
const StockLedgerPage = lazy(() => import('../../pages/inventory/stock/StockLedgerPage'))
const StockRecalcPage = lazy(() => import('../../pages/inventory/stock/StockRecalcPage'))
const StockMovementPage = lazy(() => import('../../pages/inventory/stock/StockMovementPage'))
const DailyReportPage = lazy(() => import('../../pages/inventory/stock/DailyReportPage'))
const StagedAdjustmentPage = lazy(() => import('../../pages/inventory/adjustment/StagedAdjustmentPage'))
const StagedProgressPage = lazy(() => import('../../pages/inventory/adjustment/StagedProgressPage'))
const StockAnalysisPage = lazy(() => import('../../pages/inventory/stock/StockAnalysisPage'))
const ExecutiveReportPage = lazy(() => import('../../pages/inventory/stock/ExecutiveReportPage'))
const CurrentStockPage = lazy(() => import('../../pages/inventory/stock/CurrentStockPage'))
const WarehouseStockPage = lazy(() => import('../../pages/inventory/stock/WarehouseStockPage'))
const BomStockPage = lazy(() => import('../../pages/inventory/stock/BomStockPage'))
const RelationStockPage = lazy(() => import('../../pages/inventory/stock/RelationStockPage'))
const MultiSpecStockPage = lazy(() => import('../../pages/inventory/stock/MultiSpecStockPage'))
const TransferStatusPage = lazy(() => import('../../pages/inventory/transfer/TransferStatusPage'))
const DailyStockPage = lazy(() => import('../../pages/inventory/stock/DailyStockPage'))
const StocktakeStatusPage = lazy(() => import('../../pages/inventory/adjustment/StocktakeStatusPage'))
export const ProductionIssueStatusPage = lazy(() => import('../../pages/production/ProductionIssueStatusPage'))
const StockMoveStatusPage = lazy(() => import('../../pages/inventory/adjustment/StockMoveStatusPage'))
const ManageItemsPage = lazy(() => import('../../pages/inventory/item/ManageItemsPage'))
const PriceOrderPage = lazy(() => import('../../pages/inventory/item/PriceOrderPage'))
const SpecialPriceGroupPage = lazy(() => import('../../pages/inventory/item/SpecialPriceGroupPage'))
const ItemPricePage = lazy(() => import('../../pages/inventory/item/ItemPricePage'))
const TransferPage = lazy(() => import('../../pages/inventory/transfer/TransferPage'))
const TransferEntryPage = lazy(() => import('../../pages/inventory/transfer/TransferEntryPage'))
const StockMoveListPage = lazy(() => import('../../pages/inventory/adjustment/StockMoveListPage'))
const SelfUseInputPage = lazy(() => import('../../pages/inventory/adjustment/SelfUseInputPage'))
const AdjustListPage = lazy(() => import('../../pages/inventory/adjustment/AdjustListPage'))
const StocktakeListPage = lazy(() => import('../../pages/inventory/adjustment/StocktakeListPage'))
const StocktakePage = lazy(() => import('../../pages/inventory/adjustment/StocktakePage'))
const WmsPage = lazy(() => import('../../pages/inventory/wms/WmsPage'))
const WmsFramePage = lazy(() => import('../../pages/inventory/wms/WmsFramePage'))
const ReportsPage = lazy(() => import('../../pages/inventory/stock/ReportsPage'))

/** 재고 · WMS 라우트 — app/router.tsx 가 원래 자리(차례)에 그대로 붙인다. */
export const inventoryRoutes = (
  <>
    {/* 재고 */}
    <Route path="/inventory" element={<Navigate to="/inventory/items" replace />} />
    <Route path="/inventory/items" element={<ItemsPage />} />
    <Route path="/inventory/warehouses" element={<WarehousesPage />} />
    <Route path="/inventory/manage-items" element={<ManageItemsPage />} />
    <Route path="/inventory/price-order" element={<PriceOrderPage />} />
    <Route path="/inventory/special-price-group" element={<SpecialPriceGroupPage />} />
    <Route path="/inventory/item-prices" element={<ItemPricePage />} />
    <Route path="/inventory/stock-io" element={<StockIoPage />} />
    <Route path="/inventory/ledger" element={<StockLedgerPage />} />
    <Route path="/inventory/recalc" element={<StockRecalcPage />} />
    <Route path="/inventory/movement" element={<StockMovementPage />} />
    <Route path="/inventory/daily-report" element={<DailyReportPage />} />
    <Route path="/inventory/stock-analysis" element={<StockAnalysisPage />} />
    <Route path="/inventory/staged-adjustment" element={<StagedAdjustmentPage />} />
    <Route path="/inventory/staged-progress" element={<StagedProgressPage />} />
    <Route path="/inventory/executive-report" element={<ExecutiveReportPage />} />
    <Route path="/inventory/current" element={<CurrentStockPage />} />
    <Route path="/inventory/warehouse-stock" element={<WarehouseStockPage />} />
    <Route path="/inventory/relation-stock" element={<RelationStockPage />} />
    <Route path="/inventory/multi-spec-stock" element={<MultiSpecStockPage />} />
    <Route path="/inventory/bom-stock" element={<BomStockPage />} />
    <Route path="/inventory/transfer-status" element={<TransferStatusPage />} />
    <Route path="/inventory/daily-stock" element={<DailyStockPage />} />
    <Route path="/inventory/stocktake-status" element={<StocktakeStatusPage />} />
    <Route path="/production/receipt-issue-status" element={<ProductionIssueStatusPage />} />
    <Route path="/inventory/self-use" element={<StockMoveListPage kind="SELF_USE" />} />
    <Route path="/inventory/self-use-input" element={<SelfUseInputPage />} />
    <Route path="/inventory/defect-input" element={<SelfUseInputPage kind="DEFECT" />} />
    <Route path="/inventory/defect" element={<StockMoveListPage kind="DEFECT" />} />
    <Route path="/inventory/adjust-list" element={<AdjustListPage />} />
    <Route path="/inventory/stocktake-list" element={<StocktakeListPage />} />
    <Route path="/inventory/self-use-status" element={<StockMoveStatusPage kind="SELF_USE" />} />
    <Route path="/inventory/defect-status" element={<StockMoveStatusPage kind="DEFECT" />} />
    <Route path="/inventory/substitute-status" element={<StockMoveStatusPage kind="SUBSTITUTE" />} />
    <Route path="/inventory/disposal-status" element={<StockMoveStatusPage kind="DISPOSAL" />} />
    <Route path="/inventory/adjust-status" element={<StockMoveStatusPage kind="ADJUST" />} />
    <Route path="/inventory/transfer" element={<TransferPage />} />
    <Route path="/inventory/transfer-entry" element={<TransferEntryPage />} />
    <Route path="/inventory/stocktake" element={<StocktakePage />} />
    <Route path="/inventory/wms" element={<WmsPage />} />
    {/* WMS — 바깥 WMS 연동 화면들(틀만, WmsFramePage 머리말) */}
    <Route path="/inventory/wms/account" element={<WmsFramePage kind="account" />} />
    <Route path="/inventory/wms/inbound-plan" element={<WmsFramePage kind="inbound-plan" />} />
    <Route path="/inventory/wms/inbound-status" element={<WmsFramePage kind="inbound-status" />} />
    <Route path="/inventory/wms/inbound-process" element={<WmsFramePage kind="inbound-process" />} />
    <Route path="/inventory/wms/inbound-slip" element={<WmsFramePage kind="inbound-slip" />} />
    <Route path="/inventory/wms/outbound-plan" element={<WmsFramePage kind="outbound-plan" />} />
    <Route path="/inventory/wms/outbound-status" element={<WmsFramePage kind="outbound-status" />} />
    <Route path="/inventory/wms/outbound-process" element={<WmsFramePage kind="outbound-process" />} />
    <Route path="/inventory/wms/outbound-slip" element={<WmsFramePage kind="outbound-slip" />} />
    <Route path="/inventory/wms/adjust" element={<WmsFramePage kind="adjust" />} />
    <Route path="/inventory/wms/stock-status" element={<WmsFramePage kind="stock-status" />} />
    <Route path="/inventory/wms/history" element={<WmsFramePage kind="history" />} />
    <Route path="/inventory/reports" element={<ReportsPage />} />
  </>
)

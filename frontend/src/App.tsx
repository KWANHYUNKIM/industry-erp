import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import EcountLayout from './components/EcountLayout'
import LoginPage from './pages/LoginPage'
import MyPageDashboard from './pages/MyPageDashboard'
import UsersPage from './pages/UsersPage'
import InventoryLayout from './pages/inventory/InventoryLayout'
import ItemsPage from './pages/inventory/ItemsPage'
import WarehousesPage from './pages/inventory/WarehousesPage'
import StockIoPage from './pages/inventory/StockIoPage'
import CurrentStockPage from './pages/inventory/CurrentStockPage'
import ManageItemsPage from './pages/inventory/ManageItemsPage'
import PriceOrderPage from './pages/inventory/PriceOrderPage'
import SpecialPriceGroupPage from './pages/inventory/SpecialPriceGroupPage'
import TradeLayout from './pages/trade/TradeLayout'
import PartnersPage from './pages/trade/PartnersPage'
import TradeEntry from './pages/trade/TradeEntry'
import LedgerPage from './pages/trade/LedgerPage'
import SettlementPage from './pages/trade/SettlementPage'
import ProductionLayout from './pages/production/ProductionLayout'
import BomPage from './pages/production/BomPage'
import WorkOrderPage from './pages/production/WorkOrderPage'
import ProductionResultPage from './pages/production/ProductionResultPage'
import AccountingLayout from './pages/accounting/AccountingLayout'
import ProfitSummaryPage from './pages/accounting/ProfitSummaryPage'
import ItemCostPage from './pages/accounting/ItemCostPage'
import VatSummaryPage from './pages/accounting/VatSummaryPage'
import AccountsPage from './pages/accounting/AccountsPage'
import ExpensePage from './pages/accounting/ExpensePage'
import QualityLayout from './pages/quality/QualityLayout'
import QualityInspectionPage from './pages/quality/QualityInspectionPage'
import SerialLotPage from './pages/quality/SerialLotPage'
import AsManagePage from './pages/quality/AsManagePage'
import SettingsLayout from './pages/settings/SettingsLayout'
import CompanyInfoPage from './pages/settings/CompanyInfoPage'
import PreferencesPage from './pages/settings/PreferencesPage'
import SecurityPage from './pages/settings/SecurityPage'
import DownloadPage from './pages/settings/DownloadPage'
import GroupwareLayout from './pages/groupware/GroupwareLayout'
import ApprovalDraftPage from './pages/groupware/ApprovalDraftPage'
import MyApprovalPage from './pages/groupware/MyApprovalPage'
import ApprovalAllPage from './pages/groupware/ApprovalAllPage'
import EcDrivePage from './pages/groupware/EcDrivePage'
import BoardPage from './pages/groupware/BoardPage'
import WorkPage from './pages/groupware/WorkPage'
import WorkLogPage from './pages/groupware/WorkLogPage'
import AttendancePage from './pages/groupware/AttendancePage'
import CrmPage from './pages/groupware/CrmPage'
import ProjectPage from './pages/groupware/ProjectPage'
import SharedInfoPage from './pages/groupware/SharedInfoPage'
import SalesOrderPage from './pages/trade/SalesOrderPage'
import TradeInquiryPage from './pages/trade/TradeInquiryPage'
import ExportPage from './pages/trade/ExportPage'
import MallPage from './pages/trade/MallPage'
import PlanningPage from './pages/production/PlanningPage'
import TransferPage from './pages/inventory/TransferPage'
import WmsPage from './pages/inventory/WmsPage'
import ReportsPage from './pages/inventory/ReportsPage'
import EtcSystemPage from './pages/settings/EtcSystemPage'
import DatacenterLayout from './pages/datacenter/DatacenterLayout'
import DataCollectPage from './pages/datacenter/DataCollectPage'
import DataExportPage from './pages/datacenter/DataExportPage'
import MrpPage from './pages/production/MrpPage'
import ProcessPage from './pages/production/ProcessPage'
import ResourcePage from './pages/production/ResourcePage'
import BorPage from './pages/production/BorPage'
import WoStatusPage from './pages/production/WoStatusPage'
import WoEfficiencyPage from './pages/production/WoEfficiencyPage'
import IssuePage from './pages/production/IssuePage'
import WorkResultPage from './pages/production/WorkResultPage'
import CostBuildPage from './pages/accounting/CostBuildPage'
import StandardCostPage from './pages/accounting/StandardCostPage'
import ActualCostPage from './pages/accounting/ActualCostPage'
import VariancePage from './pages/accounting/VariancePage'
import MonthlyProfitPage from './pages/accounting/MonthlyProfitPage'
import DailyProfitPage from './pages/accounting/DailyProfitPage'
import SalesStatusPage from './pages/trade/SalesStatusPage'
import SalesDiscountPage from './pages/trade/SalesDiscountPage'
import PurchaseStatusPage from './pages/trade/PurchaseStatusPage'
import PurchaseDiscountPage from './pages/trade/PurchaseDiscountPage'
import ShipmentOrderPage from './pages/trade/ShipmentOrderPage'
import ShipmentPage from './pages/trade/ShipmentPage'
import UnshippedPage from './pages/trade/UnshippedPage'
import CollectionPage from './pages/trade/CollectionPage'
import PaymentPage from './pages/trade/PaymentPage'
import PartnerLedgerPage from './pages/trade/PartnerLedgerPage'
import HrLayout from './pages/hr/HrLayout'
import AttendanceInputPage from './pages/hr/AttendanceInputPage'
import AttendanceListPage from './pages/hr/AttendanceListPage'
import AttendanceStatusPage from './pages/hr/AttendanceStatusPage'
import VacationUsePage from './pages/hr/VacationUsePage'
import VacationRemainPage from './pages/hr/VacationRemainPage'
import NoticePage from './pages/groupware/NoticePage'
import SchedulePage from './pages/groupware/SchedulePage'
import SurveyPage from './pages/groupware/SurveyPage'
import AccountingReflectionPage from './pages/trade/AccountingReflectionPage'
import OutsourcingDiscountPage from './pages/trade/OutsourcingDiscountPage'
import SuppliesPage from './pages/groupware/SuppliesPage'
import TimeCalcPage from './pages/production/TimeCalcPage'
import ReceiptStatusPage from './pages/production/ReceiptStatusPage'
import IssueStatusPage from './pages/production/IssueStatusPage'
import WorkResultListPage from './pages/production/WorkResultListPage'
import WoProgressPage from './pages/production/WoProgressPage'
import ExpenseDetailPage from './pages/accounting/ExpenseDetailPage'
import SwSchedulePage from './pages/groupware/SwSchedulePage'
import ConstructionSchedulePage from './pages/groupware/ConstructionSchedulePage'
import SurveyInputPage from './pages/groupware/SurveyInputPage'
import SurveyStatusPage from './pages/groupware/SurveyStatusPage'
import StatementPrintPage from './pages/trade/StatementPrintPage'
import PartnerEntryPage from './pages/trade/PartnerEntryPage'
import PaymentHistoryPage from './pages/trade/PaymentHistoryPage'
import PaymentComparePage from './pages/trade/PaymentComparePage'
import SalesPriceBulkPage from './pages/trade/SalesPriceBulkPage'
import PurchasePriceBulkPage from './pages/trade/PurchasePriceBulkPage'
import OrderTypePage from './pages/trade/OrderTypePage'
import OrderStagePage from './pages/trade/OrderStagePage'
import BomConsumeReceiptPage from './pages/production/BomConsumeReceiptPage'
import ManualConsumeReceiptPage from './pages/production/ManualConsumeReceiptPage'
import ConsumeStatusPage from './pages/production/ConsumeStatusPage'
import ReceiptInquiryPage from './pages/production/ReceiptInquiryPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <EcountLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<MyPageDashboard />} />
        <Route path="/inventory" element={<InventoryLayout />}>
          <Route index element={<Navigate to="/inventory/items" replace />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="warehouses" element={<WarehousesPage />} />
          <Route path="manage-items" element={<ManageItemsPage />} />
          <Route path="price-order" element={<PriceOrderPage />} />
          <Route path="special-price-group" element={<SpecialPriceGroupPage />} />
          <Route path="stock-io" element={<StockIoPage />} />
          <Route path="current" element={<CurrentStockPage />} />
          <Route path="transfer" element={<TransferPage />} />
          <Route path="wms" element={<WmsPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>
        <Route path="/production" element={<ProductionLayout />}>
          <Route index element={<Navigate to="/production/bom" replace />} />
          <Route path="bom" element={<BomPage />} />
          <Route path="work-orders" element={<WorkOrderPage />} />
          <Route path="result" element={<ProductionResultPage />} />
          <Route path="planning" element={<PlanningPage />} />
          <Route path="mrp" element={<MrpPage />} />
          <Route path="process" element={<ProcessPage />} />
          <Route path="resource" element={<ResourcePage />} />
          <Route path="bor" element={<BorPage />} />
          <Route path="wo-status" element={<WoStatusPage />} />
          <Route path="wo-efficiency" element={<WoEfficiencyPage />} />
          <Route path="issue" element={<IssuePage />} />
          <Route path="issue-status" element={<IssueStatusPage />} />
          <Route path="work-result" element={<WorkResultPage />} />
          <Route path="work-result-status" element={<WorkResultListPage />} />
          <Route path="time-calc" element={<TimeCalcPage />} />
          <Route path="receipt-status" element={<ReceiptStatusPage />} />
          <Route path="wo-progress" element={<WoProgressPage />} />
          <Route path="receipt-bom" element={<BomConsumeReceiptPage />} />
          <Route path="receipt-manual" element={<ManualConsumeReceiptPage />} />
          <Route path="receipt-inquiry" element={<ReceiptInquiryPage />} />
          <Route path="consume-status" element={<ConsumeStatusPage />} />
        </Route>
        <Route path="/sales" element={<TradeLayout />}>
          <Route index element={<Navigate to="/sales/partners" replace />} />
          <Route path="partners" element={<PartnersPage />} />
          <Route path="sell" element={<TradeEntry mode="sales" />} />
          <Route path="buy" element={<TradeEntry mode="purchase" />} />
          <Route path="sales-list" element={<TradeInquiryPage mode="sales" />} />
          <Route path="purchase-list" element={<TradeInquiryPage mode="purchase" />} />
          <Route path="settlement" element={<SettlementPage />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="orders" element={<SalesOrderPage />} />
          <Route path="export" element={<ExportPage />} />
          <Route path="mall" element={<MallPage />} />
          <Route path="sales-status" element={<SalesStatusPage />} />
          <Route path="sales-discount" element={<SalesDiscountPage />} />
          <Route path="purchase-status" element={<PurchaseStatusPage />} />
          <Route path="purchase-discount" element={<PurchaseDiscountPage />} />
          <Route path="shipment-order" element={<ShipmentOrderPage />} />
          <Route path="shipment" element={<ShipmentPage />} />
          <Route path="unshipped" element={<UnshippedPage />} />
          <Route path="collection" element={<CollectionPage />} />
          <Route path="payment" element={<PaymentPage />} />
          <Route path="partner-ledger" element={<PartnerLedgerPage />} />
          <Route path="accounting-reflection" element={<AccountingReflectionPage />} />
          <Route path="outsourcing-discount" element={<OutsourcingDiscountPage />} />
          <Route path="order-types" element={<OrderTypePage />} />
          <Route path="order-stages" element={<OrderStagePage />} />
          <Route path="sales-price-bulk" element={<SalesPriceBulkPage />} />
          <Route path="purchase-price-bulk" element={<PurchasePriceBulkPage />} />
          <Route path="partner-entry" element={<PartnerEntryPage />} />
          <Route path="statement" element={<StatementPrintPage />} />
          <Route path="payment-history" element={<PaymentHistoryPage />} />
          <Route path="payment-compare" element={<PaymentComparePage />} />
        </Route>
        <Route path="/accounting" element={<AccountingLayout />}>
          <Route index element={<Navigate to="/accounting/profit" replace />} />
          <Route path="profit" element={<ProfitSummaryPage />} />
          <Route path="item-cost" element={<ItemCostPage />} />
          <Route path="vat" element={<VatSummaryPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="expense" element={<ExpensePage />} />
          <Route path="cost-build" element={<CostBuildPage />} />
          <Route path="standard-cost" element={<StandardCostPage />} />
          <Route path="actual-cost" element={<ActualCostPage />} />
          <Route path="variance" element={<VariancePage />} />
          <Route path="monthly-profit" element={<MonthlyProfitPage />} />
          <Route path="daily-profit" element={<DailyProfitPage />} />
          <Route path="expense-detail" element={<ExpenseDetailPage />} />
        </Route>
        <Route path="/quality" element={<QualityLayout />}>
          <Route index element={<Navigate to="/quality/inspection" replace />} />
          <Route path="inspection" element={<QualityInspectionPage />} />
          <Route path="serial-lot" element={<SerialLotPage />} />
          <Route path="as" element={<AsManagePage />} />
        </Route>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/settings/company" replace />} />
          <Route path="company" element={<CompanyInfoPage />} />
          <Route path="preferences" element={<PreferencesPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="download" element={<DownloadPage />} />
          <Route path="etc" element={<EtcSystemPage />} />
        </Route>
        <Route path="/groupware" element={<GroupwareLayout />}>
          <Route index element={<Navigate to="/groupware/approval/draft" replace />} />
          <Route path="approval/draft" element={<ApprovalDraftPage />} />
          <Route path="approval/my" element={<MyApprovalPage />} />
          <Route path="approval/all" element={<ApprovalAllPage />} />
          <Route path="drive" element={<EcDrivePage />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="work" element={<WorkPage />} />
          <Route path="worklog" element={<WorkLogPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="crm" element={<CrmPage />} />
          <Route path="project" element={<ProjectPage />} />
          <Route path="shared" element={<SharedInfoPage />} />
          <Route path="notice" element={<NoticePage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="survey" element={<SurveyPage />} />
          <Route path="supplies" element={<SuppliesPage />} />
          <Route path="dev-schedule" element={<SwSchedulePage />} />
          <Route path="construction-schedule" element={<ConstructionSchedulePage />} />
          <Route path="survey-input" element={<SurveyInputPage />} />
          <Route path="survey-status" element={<SurveyStatusPage />} />
        </Route>
        <Route path="/datacenter" element={<DatacenterLayout />}>
          <Route index element={<Navigate to="/datacenter/collect" replace />} />
          <Route path="collect" element={<DataCollectPage />} />
          <Route path="export" element={<DataExportPage />} />
        </Route>
        <Route path="/hr" element={<HrLayout />}>
          <Route index element={<Navigate to="/hr/attendance-input" replace />} />
          <Route path="attendance-input" element={<AttendanceInputPage />} />
          <Route path="attendance-list" element={<AttendanceListPage />} />
          <Route path="attendance-status" element={<AttendanceStatusPage />} />
          <Route path="vacation-use" element={<VacationUsePage />} />
          <Route path="vacation-remain" element={<VacationRemainPage />} />
        </Route>
        <Route path="/users" element={<UsersPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

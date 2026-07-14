import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import EcountLayout from './components/EcountLayout'
import LoginPage from './pages/LoginPage'
import MyPageDashboard from './pages/MyPageDashboard'
import UsersPage from './pages/UsersPage'
import ItemsPage from './pages/inventory/ItemsPage'
import WarehousesPage from './pages/inventory/WarehousesPage'
import StockIoPage from './pages/inventory/StockIoPage'
import CurrentStockPage from './pages/inventory/CurrentStockPage'
import ManageItemsPage from './pages/inventory/ManageItemsPage'
import PriceOrderPage from './pages/inventory/PriceOrderPage'
import SpecialPriceGroupPage from './pages/inventory/SpecialPriceGroupPage'
import PartnersPage from './pages/trade/PartnersPage'
import TradeEntry from './pages/trade/TradeEntry'
import LedgerPage from './pages/trade/LedgerPage'
import SettlementPage from './pages/trade/SettlementPage'
import BomPage from './pages/production/BomPage'
import WorkOrderPage from './pages/production/WorkOrderPage'
import ProductionResultPage from './pages/production/ProductionResultPage'
import ProfitSummaryPage from './pages/accounting/ProfitSummaryPage'
import ItemCostPage from './pages/accounting/ItemCostPage'
import VatSummaryPage from './pages/accounting/VatSummaryPage'
import WithholdingPage from './pages/accounting/WithholdingPage'
import OtherWithholdingPage from './pages/accounting/OtherWithholdingPage'
import PromissoryNotePage from './pages/accounting/PromissoryNotePage'
import BudgetPage from './pages/accounting/BudgetPage'
import CashPlanPage from './pages/accounting/CashPlanPage'
import AccountsPage from './pages/accounting/AccountsPage'
import JournalListPage from './pages/accounting/JournalListPage'
import AccountLedgerPage from './pages/accounting/AccountLedgerPage'
import TrialBalancePage from './pages/accounting/TrialBalancePage'
import BalanceSheetPage from './pages/accounting/BalanceSheetPage'
import IncomeStatementPage from './pages/accounting/IncomeStatementPage'
import TaxInvoicePage from './pages/accounting/TaxInvoicePage'
import JournalEntryPage from './pages/accounting/JournalEntryPage'
import CashTxnPage from './pages/accounting/CashTxnPage'
import BankCardPage from './pages/accounting/BankCardPage'
import FixedAssetPage from './pages/accounting/FixedAssetPage'
import FastVoucherPage from './pages/accounting/FastVoucherPage'
import ExpensePage from './pages/accounting/ExpensePage'
import QualityInspectionPage from './pages/quality/QualityInspectionPage'
import SerialLotPage from './pages/quality/SerialLotPage'
import AsManagePage from './pages/quality/AsManagePage'
import CompanyInfoPage from './pages/settings/CompanyInfoPage'
import PreferencesPage from './pages/settings/PreferencesPage'
import SecurityPage from './pages/settings/SecurityPage'
import DownloadPage from './pages/settings/DownloadPage'
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
import OrgChartPage from './pages/groupware/OrgChartPage'
import SalesOrderPage from './pages/trade/SalesOrderPage'
import QuotationPage from './pages/trade/QuotationPage'
import PurchaseOrderPage from './pages/trade/PurchaseOrderPage'
import PayablePage from './pages/trade/PayablePage'
import TradeInquiryPage from './pages/trade/TradeInquiryPage'
import ExportPage from './pages/trade/ExportPage'
import MallPage from './pages/trade/MallPage'
import PlanningPage from './pages/production/PlanningPage'
import TransferPage from './pages/inventory/TransferPage'
import WmsPage from './pages/inventory/WmsPage'
import ReportsPage from './pages/inventory/ReportsPage'
import EtcSystemPage from './pages/settings/EtcSystemPage'
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
import AttendanceInputPage from './pages/hr/AttendanceInputPage'
import AttendanceListPage from './pages/hr/AttendanceListPage'
import AttendanceStatusPage from './pages/hr/AttendanceStatusPage'
import VacationUsePage from './pages/hr/VacationUsePage'
import VacationRemainPage from './pages/hr/VacationRemainPage'
import EmployeePage from './pages/hr/EmployeePage'
import PayrollPage from './pages/hr/PayrollPage'
import HrRecordPage from './pages/hr/HrRecordPage'
import ContractPage from './pages/hr/ContractPage'
import DailyWagePage from './pages/hr/DailyWagePage'
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

/** 좌측 사이드바는 EcountLayout이 활성 탭 기준으로 그린다.
 *  그래서 모듈별 레이아웃 래퍼 없이 모든 화면이 EcountLayout 아래 평평하게 붙는다. */
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

        {/* 재고 */}
        <Route path="/inventory" element={<Navigate to="/inventory/items" replace />} />
        <Route path="/inventory/items" element={<ItemsPage />} />
        <Route path="/inventory/warehouses" element={<WarehousesPage />} />
        <Route path="/inventory/manage-items" element={<ManageItemsPage />} />
        <Route path="/inventory/price-order" element={<PriceOrderPage />} />
        <Route path="/inventory/special-price-group" element={<SpecialPriceGroupPage />} />
        <Route path="/inventory/stock-io" element={<StockIoPage />} />
        <Route path="/inventory/current" element={<CurrentStockPage />} />
        <Route path="/inventory/transfer" element={<TransferPage />} />
        <Route path="/inventory/wms" element={<WmsPage />} />
        <Route path="/inventory/reports" element={<ReportsPage />} />

        {/* 생산 */}
        <Route path="/production" element={<Navigate to="/production/bom" replace />} />
        <Route path="/production/bom" element={<BomPage />} />
        <Route path="/production/work-orders" element={<WorkOrderPage />} />
        <Route path="/production/result" element={<ProductionResultPage />} />
        <Route path="/production/planning" element={<PlanningPage />} />
        <Route path="/production/mrp" element={<MrpPage />} />
        <Route path="/production/process" element={<ProcessPage />} />
        <Route path="/production/resource" element={<ResourcePage />} />
        <Route path="/production/bor" element={<BorPage />} />
        <Route path="/production/wo-status" element={<WoStatusPage />} />
        <Route path="/production/wo-efficiency" element={<WoEfficiencyPage />} />
        <Route path="/production/issue" element={<IssuePage />} />
        <Route path="/production/issue-status" element={<IssueStatusPage />} />
        <Route path="/production/work-result" element={<WorkResultPage />} />
        <Route path="/production/work-result-status" element={<WorkResultListPage />} />
        <Route path="/production/time-calc" element={<TimeCalcPage />} />
        <Route path="/production/receipt-status" element={<ReceiptStatusPage />} />
        <Route path="/production/wo-progress" element={<WoProgressPage />} />
        <Route path="/production/receipt-bom" element={<BomConsumeReceiptPage />} />
        <Route path="/production/receipt-manual" element={<ManualConsumeReceiptPage />} />
        <Route path="/production/receipt-inquiry" element={<ReceiptInquiryPage />} />
        <Route path="/production/consume-status" element={<ConsumeStatusPage />} />

        {/* 판매/구매 */}
        <Route path="/sales" element={<Navigate to="/sales/partners" replace />} />
        <Route path="/sales/partners" element={<PartnersPage />} />
        <Route path="/sales/sell" element={<TradeEntry mode="sales" />} />
        <Route path="/sales/buy" element={<TradeEntry mode="purchase" />} />
        <Route path="/sales/sales-list" element={<TradeInquiryPage mode="sales" />} />
        <Route path="/sales/purchase-list" element={<TradeInquiryPage mode="purchase" />} />
        <Route path="/sales/settlement" element={<SettlementPage />} />
        <Route path="/sales/ledger" element={<LedgerPage />} />
        <Route path="/sales/orders" element={<SalesOrderPage />} />
        <Route path="/sales/quotations" element={<QuotationPage />} />
        <Route path="/sales/purchase-orders" element={<PurchaseOrderPage />} />
        <Route path="/sales/payable" element={<PayablePage />} />
        <Route path="/sales/export" element={<ExportPage />} />
        <Route path="/sales/mall" element={<MallPage />} />
        <Route path="/sales/sales-status" element={<SalesStatusPage />} />
        <Route path="/sales/sales-discount" element={<SalesDiscountPage />} />
        <Route path="/sales/purchase-status" element={<PurchaseStatusPage />} />
        <Route path="/sales/purchase-discount" element={<PurchaseDiscountPage />} />
        <Route path="/sales/shipment-order" element={<ShipmentOrderPage />} />
        <Route path="/sales/shipment" element={<ShipmentPage />} />
        <Route path="/sales/unshipped" element={<UnshippedPage />} />
        <Route path="/sales/collection" element={<CollectionPage />} />
        <Route path="/sales/payment" element={<PaymentPage />} />
        <Route path="/sales/partner-ledger" element={<PartnerLedgerPage />} />
        <Route path="/sales/accounting-reflection" element={<AccountingReflectionPage />} />
        <Route path="/sales/outsourcing-discount" element={<OutsourcingDiscountPage />} />
        <Route path="/sales/order-types" element={<OrderTypePage />} />
        <Route path="/sales/order-stages" element={<OrderStagePage />} />
        <Route path="/sales/sales-price-bulk" element={<SalesPriceBulkPage />} />
        <Route path="/sales/purchase-price-bulk" element={<PurchasePriceBulkPage />} />
        <Route path="/sales/partner-entry" element={<PartnerEntryPage />} />
        <Route path="/sales/statement" element={<StatementPrintPage />} />
        <Route path="/sales/payment-history" element={<PaymentHistoryPage />} />
        <Route path="/sales/payment-compare" element={<PaymentComparePage />} />

        {/* 회계 */}
        <Route path="/accounting" element={<Navigate to="/accounting/profit" replace />} />
        <Route path="/accounting/profit" element={<ProfitSummaryPage />} />
        <Route path="/accounting/item-cost" element={<ItemCostPage />} />
        <Route path="/accounting/vat" element={<VatSummaryPage />} />
        <Route path="/accounting/withholding" element={<WithholdingPage />} />
        <Route path="/accounting/other-withholding" element={<OtherWithholdingPage />} />
        <Route path="/accounting/notes" element={<PromissoryNotePage />} />
        <Route path="/accounting/budget" element={<BudgetPage />} />
        <Route path="/accounting/cash-plan" element={<CashPlanPage />} />
        <Route path="/accounting/accounts" element={<AccountsPage />} />
        <Route path="/accounting/journals" element={<JournalListPage />} />
        <Route path="/accounting/ledger-book" element={<AccountLedgerPage />} />
        <Route path="/accounting/trial-balance" element={<TrialBalancePage />} />
        <Route path="/accounting/balance-sheet" element={<BalanceSheetPage />} />
        <Route path="/accounting/income-statement" element={<IncomeStatementPage />} />
        <Route path="/accounting/tax-invoice-sales" element={<TaxInvoicePage type="SALES" />} />
        <Route path="/accounting/tax-invoice-purchase" element={<TaxInvoicePage type="PURCHASE" />} />
        <Route path="/accounting/journal-entry" element={<JournalEntryPage />} />
        <Route path="/accounting/bank-cards" element={<BankCardPage />} />
        <Route path="/accounting/fixed-assets" element={<FixedAssetPage />} />
        <Route path="/accounting/cash-deposit" element={<CashTxnPage mode="deposit" />} />
        <Route path="/accounting/cash-withdraw" element={<CashTxnPage mode="withdraw" />} />
        <Route path="/accounting/vouchers" element={<FastVoucherPage />} />
        <Route path="/accounting/expense" element={<ExpensePage />} />
        <Route path="/accounting/cost-build" element={<CostBuildPage />} />
        <Route path="/accounting/standard-cost" element={<StandardCostPage />} />
        <Route path="/accounting/actual-cost" element={<ActualCostPage />} />
        <Route path="/accounting/variance" element={<VariancePage />} />
        <Route path="/accounting/monthly-profit" element={<MonthlyProfitPage />} />
        <Route path="/accounting/daily-profit" element={<DailyProfitPage />} />
        <Route path="/accounting/expense-detail" element={<ExpenseDetailPage />} />

        {/* 품질 */}
        <Route path="/quality" element={<Navigate to="/quality/inspection" replace />} />
        <Route path="/quality/inspection" element={<QualityInspectionPage />} />
        <Route path="/quality/serial-lot" element={<SerialLotPage />} />
        <Route path="/quality/as" element={<AsManagePage />} />

        {/* Self-Customizing */}
        <Route path="/settings" element={<Navigate to="/settings/company" replace />} />
        <Route path="/settings/company" element={<CompanyInfoPage />} />
        <Route path="/settings/preferences" element={<PreferencesPage />} />
        <Route path="/settings/security" element={<SecurityPage />} />
        <Route path="/settings/download" element={<DownloadPage />} />
        <Route path="/settings/etc" element={<EtcSystemPage />} />

        {/* 그룹웨어 */}
        <Route path="/groupware" element={<Navigate to="/groupware/approval/draft" replace />} />
        <Route path="/groupware/approval/draft" element={<ApprovalDraftPage />} />
        <Route path="/groupware/approval/my" element={<MyApprovalPage />} />
        <Route path="/groupware/approval/all" element={<ApprovalAllPage />} />
        <Route path="/groupware/drive" element={<EcDrivePage />} />
        <Route path="/groupware/board" element={<BoardPage />} />
        <Route path="/groupware/work" element={<WorkPage />} />
        <Route path="/groupware/worklog" element={<WorkLogPage />} />
        <Route path="/groupware/attendance" element={<AttendancePage />} />
        <Route path="/groupware/crm" element={<CrmPage />} />
        <Route path="/groupware/project" element={<ProjectPage />} />
        <Route path="/groupware/shared" element={<SharedInfoPage />} />
        <Route path="/groupware/org" element={<OrgChartPage />} />
        <Route path="/groupware/notice" element={<NoticePage />} />
        <Route path="/groupware/schedule" element={<SchedulePage />} />
        <Route path="/groupware/survey" element={<SurveyPage />} />
        <Route path="/groupware/supplies" element={<SuppliesPage />} />
        <Route path="/groupware/dev-schedule" element={<SwSchedulePage />} />
        <Route path="/groupware/construction-schedule" element={<ConstructionSchedulePage />} />
        <Route path="/groupware/survey-input" element={<SurveyInputPage />} />
        <Route path="/groupware/survey-status" element={<SurveyStatusPage />} />

        {/* 데이터센터 */}
        <Route path="/datacenter" element={<Navigate to="/datacenter/collect" replace />} />
        <Route path="/datacenter/collect" element={<DataCollectPage />} />
        <Route path="/datacenter/export" element={<DataExportPage />} />

        {/* 관리(근태) */}
        <Route path="/hr" element={<Navigate to="/hr/attendance-input" replace />} />
        <Route path="/hr/attendance-input" element={<AttendanceInputPage />} />
        <Route path="/hr/attendance-list" element={<AttendanceListPage />} />
        <Route path="/hr/attendance-status" element={<AttendanceStatusPage />} />
        <Route path="/hr/vacation-use" element={<VacationUsePage />} />
        <Route path="/hr/vacation-remain" element={<VacationRemainPage />} />
        <Route path="/hr/employees" element={<EmployeePage />} />
        <Route path="/hr/payroll" element={<PayrollPage />} />
        <Route path="/hr/records" element={<HrRecordPage />} />
        <Route path="/hr/contracts" element={<ContractPage />} />
        <Route path="/hr/daily-wage" element={<DailyWagePage />} />

        <Route path="/users" element={<UsersPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

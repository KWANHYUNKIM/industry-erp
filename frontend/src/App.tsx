import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import EcountLayout from './components/EcountLayout'
import LoginPage from './pages/LoginPage'
const MyPageDashboard = lazy(() => import('./pages/MyPageDashboard'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const ItemsPage = lazy(() => import('./pages/inventory/ItemsPage'))
const WarehousesPage = lazy(() => import('./pages/inventory/WarehousesPage'))
const StockIoPage = lazy(() => import('./pages/inventory/StockIoPage'))
const CurrentStockPage = lazy(() => import('./pages/inventory/CurrentStockPage'))
const ManageItemsPage = lazy(() => import('./pages/inventory/ManageItemsPage'))
const PriceOrderPage = lazy(() => import('./pages/inventory/PriceOrderPage'))
const SpecialPriceGroupPage = lazy(() => import('./pages/inventory/SpecialPriceGroupPage'))
const PartnersPage = lazy(() => import('./pages/trade/PartnersPage'))
const TradeEntry = lazy(() => import('./pages/trade/TradeEntry'))
const LedgerPage = lazy(() => import('./pages/trade/LedgerPage'))
const SettlementPage = lazy(() => import('./pages/trade/SettlementPage'))
const BomPage = lazy(() => import('./pages/production/BomPage'))
const WorkOrderPage = lazy(() => import('./pages/production/WorkOrderPage'))
const ProductionResultPage = lazy(() => import('./pages/production/ProductionResultPage'))
const ProfitSummaryPage = lazy(() => import('./pages/accounting/ProfitSummaryPage'))
const ItemCostPage = lazy(() => import('./pages/accounting/ItemCostPage'))
const VatSummaryPage = lazy(() => import('./pages/accounting/VatSummaryPage'))
const WithholdingPage = lazy(() => import('./pages/accounting/WithholdingPage'))
const OtherWithholdingPage = lazy(() => import('./pages/accounting/OtherWithholdingPage'))
const CorporateTaxPage = lazy(() => import('./pages/accounting/CorporateTaxPage'))
const PromissoryNotePage = lazy(() => import('./pages/accounting/PromissoryNotePage'))
const BudgetPage = lazy(() => import('./pages/accounting/BudgetPage'))
const CashPlanPage = lazy(() => import('./pages/accounting/CashPlanPage'))
const AccountsPage = lazy(() => import('./pages/accounting/AccountsPage'))
const JournalListPage = lazy(() => import('./pages/accounting/JournalListPage'))
const AccountLedgerPage = lazy(() => import('./pages/accounting/AccountLedgerPage'))
const TrialBalancePage = lazy(() => import('./pages/accounting/TrialBalancePage'))
const BalanceSheetPage = lazy(() => import('./pages/accounting/BalanceSheetPage'))
const IncomeStatementPage = lazy(() => import('./pages/accounting/IncomeStatementPage'))
const TaxInvoicePage = lazy(() => import('./pages/accounting/TaxInvoicePage'))
const JournalEntryPage = lazy(() => import('./pages/accounting/JournalEntryPage'))
const CashTxnPage = lazy(() => import('./pages/accounting/CashTxnPage'))
const CashDetailPage = lazy(() => import('./pages/accounting/CashDetailPage'))
const BankCardPage = lazy(() => import('./pages/accounting/BankCardPage'))
const FixedAssetPage = lazy(() => import('./pages/accounting/FixedAssetPage'))
const FastVoucherPage = lazy(() => import('./pages/accounting/FastVoucherPage'))
const NonCashPage = lazy(() => import('./pages/accounting/NonCashPage'))
const CheckPage = lazy(() => import('./pages/accounting/CheckPage'))
const ContractPage = lazy(() => import('./pages/accounting/ContractPage'))
const CurrencyPage = lazy(() => import('./pages/settings/CurrencyPage'))
const ExpensePage = lazy(() => import('./pages/accounting/ExpensePage'))
const IncomePage = lazy(() => import('./pages/accounting/IncomePage'))
const QualityInspectionPage = lazy(() => import('./pages/quality/QualityInspectionPage'))
const SerialLotPage = lazy(() => import('./pages/quality/SerialLotPage'))
const AsManagePage = lazy(() => import('./pages/quality/AsManagePage'))
const CompanyInfoPage = lazy(() => import('./pages/settings/CompanyInfoPage'))
const PreferencesPage = lazy(() => import('./pages/settings/PreferencesPage'))
const SecurityPage = lazy(() => import('./pages/settings/SecurityPage'))
const DownloadPage = lazy(() => import('./pages/settings/DownloadPage'))
const PrintSignLinePage = lazy(() => import('./pages/settings/PrintSignLinePage'))
const ApprovalDraftPage = lazy(() => import('./pages/groupware/ApprovalDraftPage'))
const MyApprovalPage = lazy(() => import('./pages/groupware/MyApprovalPage'))
const ApprovalAllPage = lazy(() => import('./pages/groupware/ApprovalAllPage'))
const ApprovalSettingPage = lazy(() => import('./pages/groupware/ApprovalSettingPage'))
const EcDrivePage = lazy(() => import('./pages/groupware/EcDrivePage'))
const BoardPage = lazy(() => import('./pages/groupware/BoardPage'))
const AnonymousBoardPage = lazy(() => import('./pages/groupware/AnonymousBoardPage'))
const FieldWorkPage = lazy(() => import('./pages/groupware/FieldWorkPage'))
const WorkPage = lazy(() => import('./pages/groupware/WorkPage'))
const WorkLogPage = lazy(() => import('./pages/groupware/WorkLogPage'))
const AttendancePage = lazy(() => import('./pages/groupware/AttendancePage'))
const CrmPage = lazy(() => import('./pages/groupware/CrmPage'))
const BusinessCardPage = lazy(() => import('./pages/groupware/BusinessCardPage'))
const ProjectPage = lazy(() => import('./pages/groupware/ProjectPage'))
const ProjectProfitPage = lazy(() => import('./pages/accounting/ProjectProfitPage'))
const SharedInfoPage = lazy(() => import('./pages/groupware/SharedInfoPage'))
const MailPage = lazy(() => import('./pages/groupware/MailPage'))
const OrgChartPage = lazy(() => import('./pages/groupware/OrgChartPage'))
const SalesOrderPage = lazy(() => import('./pages/trade/SalesOrderPage'))
const QuotationPage = lazy(() => import('./pages/trade/QuotationPage'))
const PurchaseOrderPage = lazy(() => import('./pages/trade/PurchaseOrderPage'))
const PayablePage = lazy(() => import('./pages/trade/PayablePage'))
const TradeInquiryPage = lazy(() => import('./pages/trade/TradeInquiryPage'))
const ExportPage = lazy(() => import('./pages/trade/ExportPage'))
const MallPage = lazy(() => import('./pages/trade/MallPage'))
const PlanningPage = lazy(() => import('./pages/production/PlanningPage'))
const TransferPage = lazy(() => import('./pages/inventory/TransferPage'))
const WmsPage = lazy(() => import('./pages/inventory/WmsPage'))
const ReportsPage = lazy(() => import('./pages/inventory/ReportsPage'))
const EtcSystemPage = lazy(() => import('./pages/settings/EtcSystemPage'))
const CommonCodePage = lazy(() => import('./pages/settings/CommonCodePage'))
const DataCollectPage = lazy(() => import('./pages/datacenter/DataCollectPage'))
const DataExportPage = lazy(() => import('./pages/datacenter/DataExportPage'))
const MrpPage = lazy(() => import('./pages/production/MrpPage'))
const ProcessPage = lazy(() => import('./pages/production/ProcessPage'))
const ResourcePage = lazy(() => import('./pages/production/ResourcePage'))
const BorPage = lazy(() => import('./pages/production/BorPage'))
const WoStatusPage = lazy(() => import('./pages/production/WoStatusPage'))
const WoEfficiencyPage = lazy(() => import('./pages/production/WoEfficiencyPage'))
const IssuePage = lazy(() => import('./pages/production/IssuePage'))
const WorkResultPage = lazy(() => import('./pages/production/WorkResultPage'))
const CostBuildPage = lazy(() => import('./pages/accounting/CostBuildPage'))
const StandardCostPage = lazy(() => import('./pages/accounting/StandardCostPage'))
const ActualCostPage = lazy(() => import('./pages/accounting/ActualCostPage'))
const VariancePage = lazy(() => import('./pages/accounting/VariancePage'))
const MonthlyProfitPage = lazy(() => import('./pages/accounting/MonthlyProfitPage'))
const DailyProfitPage = lazy(() => import('./pages/accounting/DailyProfitPage'))
const SalesStatusPage = lazy(() => import('./pages/trade/SalesStatusPage'))
const SalesDiscountPage = lazy(() => import('./pages/trade/SalesDiscountPage'))
const PurchaseStatusPage = lazy(() => import('./pages/trade/PurchaseStatusPage'))
const PurchaseDiscountPage = lazy(() => import('./pages/trade/PurchaseDiscountPage'))
const ShipmentOrderPage = lazy(() => import('./pages/trade/ShipmentOrderPage'))
const ShipmentPage = lazy(() => import('./pages/trade/ShipmentPage'))
const UnshippedPage = lazy(() => import('./pages/trade/UnshippedPage'))
const CollectionPage = lazy(() => import('./pages/trade/CollectionPage'))
const PaymentPage = lazy(() => import('./pages/trade/PaymentPage'))
const PartnerLedgerPage = lazy(() => import('./pages/trade/PartnerLedgerPage'))
const AttendanceInputPage = lazy(() => import('./pages/hr/AttendanceInputPage'))
const AttendanceListPage = lazy(() => import('./pages/hr/AttendanceListPage'))
const AttendanceStatusPage = lazy(() => import('./pages/hr/AttendanceStatusPage'))
const VacationUsePage = lazy(() => import('./pages/hr/VacationUsePage'))
const VacationRemainPage = lazy(() => import('./pages/hr/VacationRemainPage'))
const EmployeePage = lazy(() => import('./pages/hr/EmployeePage'))
const PayrollPage = lazy(() => import('./pages/hr/PayrollPage'))
const EmployeePerformancePage = lazy(() => import('./pages/hr/EmployeePerformancePage'))
const PaySettingPage = lazy(() => import('./pages/hr/PaySettingPage'))
const HrRecordPage = lazy(() => import('./pages/hr/HrRecordPage'))
const LaborContractPage = lazy(() => import('./pages/hr/ContractPage'))
const DailyWagePage = lazy(() => import('./pages/hr/DailyWagePage'))
const NoticePage = lazy(() => import('./pages/groupware/NoticePage'))
const SchedulePage = lazy(() => import('./pages/groupware/SchedulePage'))
const SurveyPage = lazy(() => import('./pages/groupware/SurveyPage'))
const AccountingReflectionPage = lazy(() => import('./pages/trade/AccountingReflectionPage'))
const OutsourcingDiscountPage = lazy(() => import('./pages/trade/OutsourcingDiscountPage'))
const SuppliesPage = lazy(() => import('./pages/groupware/SuppliesPage'))
const TimeCalcPage = lazy(() => import('./pages/production/TimeCalcPage'))
const ReceiptStatusPage = lazy(() => import('./pages/production/ReceiptStatusPage'))
const IssueStatusPage = lazy(() => import('./pages/production/IssueStatusPage'))
const WorkResultListPage = lazy(() => import('./pages/production/WorkResultListPage'))
const WoProgressPage = lazy(() => import('./pages/production/WoProgressPage'))
const ExpenseDetailPage = lazy(() => import('./pages/accounting/ExpenseDetailPage'))
const SwSchedulePage = lazy(() => import('./pages/groupware/SwSchedulePage'))
const ConstructionSchedulePage = lazy(() => import('./pages/groupware/ConstructionSchedulePage'))
const SurveyInputPage = lazy(() => import('./pages/groupware/SurveyInputPage'))
const SurveyStatusPage = lazy(() => import('./pages/groupware/SurveyStatusPage'))
const StatementPrintPage = lazy(() => import('./pages/trade/StatementPrintPage'))
const PartnerEntryPage = lazy(() => import('./pages/trade/PartnerEntryPage'))
const PaymentHistoryPage = lazy(() => import('./pages/trade/PaymentHistoryPage'))
const PaymentComparePage = lazy(() => import('./pages/trade/PaymentComparePage'))
const SalesPriceBulkPage = lazy(() => import('./pages/trade/SalesPriceBulkPage'))
const PurchasePriceBulkPage = lazy(() => import('./pages/trade/PurchasePriceBulkPage'))
const OrderTypePage = lazy(() => import('./pages/trade/OrderTypePage'))
const OrderStagePage = lazy(() => import('./pages/trade/OrderStagePage'))
const BomConsumeReceiptPage = lazy(() => import('./pages/production/BomConsumeReceiptPage'))
const ManualConsumeReceiptPage = lazy(() => import('./pages/production/ManualConsumeReceiptPage'))
const ConsumeStatusPage = lazy(() => import('./pages/production/ConsumeStatusPage'))
const ReceiptInquiryPage = lazy(() => import('./pages/production/ReceiptInquiryPage'))

/** 좌측 사이드바는 EcountLayout이 활성 탭 기준으로 그린다.
 *  그래서 모듈별 레이아웃 래퍼 없이 모든 화면이 EcountLayout 아래 평평하게 붙는다. */
export default function App() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: '#8a929c', fontSize: 13 }}>화면을 불러오는 중…</div>}>
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
        <Route path="/accounting/corporate-tax" element={<CorporateTaxPage />} />
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
        <Route path="/accounting/cash-details" element={<CashDetailPage />} />
        <Route path="/accounting/vouchers" element={<FastVoucherPage />} />
        <Route path="/accounting/non-cash" element={<NonCashPage />} />
        <Route path="/accounting/checks" element={<CheckPage />} />
        <Route path="/accounting/contracts" element={<ContractPage />} />
        <Route path="/settings/currencies" element={<CurrencyPage />} />
        <Route path="/accounting/expense" element={<ExpensePage />} />
        <Route path="/accounting/income" element={<IncomePage />} />
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
        <Route path="/settings/print-sign" element={<PrintSignLinePage />} />
        <Route path="/settings/etc" element={<EtcSystemPage />} />
        <Route path="/settings/codes" element={<CommonCodePage />} />

        {/* 그룹웨어 */}
        <Route path="/groupware" element={<Navigate to="/groupware/approval/draft" replace />} />
        <Route path="/groupware/approval/draft" element={<ApprovalDraftPage />} />
        <Route path="/groupware/approval/my" element={<MyApprovalPage />} />
        <Route path="/groupware/approval/all" element={<ApprovalAllPage />} />
        <Route path="/groupware/approval/settings" element={<ApprovalSettingPage />} />
        <Route path="/groupware/drive" element={<EcDrivePage />} />
        <Route path="/groupware/board" element={<BoardPage />} />
        <Route path="/groupware/anonymous-board" element={<AnonymousBoardPage />} />
        <Route path="/groupware/field-works" element={<FieldWorkPage />} />
        <Route path="/groupware/work" element={<WorkPage />} />
        <Route path="/groupware/worklog" element={<WorkLogPage />} />
        <Route path="/groupware/attendance" element={<AttendancePage />} />
        <Route path="/groupware/crm" element={<CrmPage />} />
        <Route path="/groupware/cards" element={<BusinessCardPage />} />
        <Route path="/groupware/project" element={<ProjectPage />} />
        <Route path="/accounting/project-profit" element={<ProjectProfitPage />} />
        <Route path="/groupware/shared" element={<SharedInfoPage />} />
        <Route path="/groupware/mail" element={<MailPage />} />
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
        <Route path="/hr/performance" element={<EmployeePerformancePage />} />
        <Route path="/hr/pay-settings" element={<PaySettingPage />} />
        <Route path="/hr/records" element={<HrRecordPage />} />
        <Route path="/hr/contracts" element={<LaborContractPage />} />
        <Route path="/hr/daily-wage" element={<DailyWagePage />} />

        <Route path="/users" element={<UsersPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

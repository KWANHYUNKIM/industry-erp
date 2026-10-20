import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from '../features/auth/components/ProtectedRoute'
import EcountLayout from './layout/EcountLayout'
import LoginPage from '../pages/LoginPage'
const MyPageDashboard = lazy(() => import('../pages/MyPageDashboard'))
const UsersPage = lazy(() => import('../pages/UsersPage'))
const RolesPage = lazy(() => import('../pages/RolesPage'))
const CompaniesPage = lazy(() => import('../pages/CompaniesPage'))
const ItemsPage = lazy(() => import('../pages/inventory/ItemsPage'))
const WarehousesPage = lazy(() => import('../pages/inventory/WarehousesPage'))
const StockIoPage = lazy(() => import('../pages/inventory/StockIoPage'))
const StockLedgerPage = lazy(() => import('../pages/inventory/StockLedgerPage'))
const StockRecalcPage = lazy(() => import('../pages/inventory/StockRecalcPage'))
const StockMovementPage = lazy(() => import('../pages/inventory/StockMovementPage'))
const DailyReportPage = lazy(() => import('../pages/inventory/DailyReportPage'))
const StagedAdjustmentPage = lazy(() => import('../pages/inventory/StagedAdjustmentPage'))
const StagedProgressPage = lazy(() => import('../pages/inventory/StagedProgressPage'))
const StockAnalysisPage = lazy(() => import('../pages/inventory/StockAnalysisPage'))
const ExecutiveReportPage = lazy(() => import('../pages/inventory/ExecutiveReportPage'))
const CurrentStockPage = lazy(() => import('../pages/inventory/CurrentStockPage'))
const WarehouseStockPage = lazy(() => import('../pages/inventory/WarehouseStockPage'))
const BomStockPage = lazy(() => import('../pages/inventory/BomStockPage'))
const TransferStatusPage = lazy(() => import('../pages/inventory/TransferStatusPage'))
const DailyStockPage = lazy(() => import('../pages/inventory/DailyStockPage'))
const StocktakeStatusPage = lazy(() => import('../pages/inventory/StocktakeStatusPage'))
const ProductionIssueStatusPage = lazy(() => import('../pages/production/ProductionIssueStatusPage'))
const StockMoveStatusPage = lazy(() => import('../pages/inventory/StockMoveStatusPage'))
const ManageItemsPage = lazy(() => import('../pages/inventory/ManageItemsPage'))
const PriceOrderPage = lazy(() => import('../pages/inventory/PriceOrderPage'))
const SpecialPriceGroupPage = lazy(() => import('../pages/inventory/SpecialPriceGroupPage'))
const ItemPricePage = lazy(() => import('../pages/inventory/ItemPricePage'))
const PartnersPage = lazy(() => import('../pages/trade/PartnersPage'))
const TradeEntry = lazy(() => import('../pages/trade/TradeEntry'))
const LedgerPage = lazy(() => import('../pages/trade/LedgerPage'))
const SettlementPage = lazy(() => import('../pages/trade/SettlementPage'))
const BomPage = lazy(() => import('../pages/production/BomPage'))
const WorkOrderPage = lazy(() => import('../pages/production/WorkOrderPage'))
const WorkOrderEntryPage = lazy(() => import('../pages/production/WorkOrderEntryPage'))
const SubcontractReflectionPage = lazy(() => import('../pages/production/SubcontractReflectionPage'))
const PurchaseTaxStockPage = lazy(() => import('../pages/production/PurchaseTaxStockPage'))
const BomStatusPage = lazy(() => import('../pages/production/BomStatusPage'))
const RequirementCalcPage = lazy(() => import('../pages/production/RequirementCalcPage'))
const ProductionResultPage = lazy(() => import('../pages/production/ProductionResultPage'))
const ProfitSummaryPage = lazy(() => import('../pages/accounting/ProfitSummaryPage'))
const ItemCostPage = lazy(() => import('../pages/accounting/ItemCostPage'))
const VatSummaryPage = lazy(() => import('../pages/accounting/VatSummaryPage'))
const WithholdingPage = lazy(() => import('../pages/accounting/WithholdingPage'))
const WithholdingConfirmPage = lazy(() => import('../pages/accounting/WithholdingConfirmPage'))
const WithholdingPdfPage = lazy(() => import('../pages/accounting/WithholdingPdfPage'))
const SimplePaymentPage = lazy(() => import('../pages/accounting/SimplePaymentPage'))
const PaymentStatementFilePage = lazy(() => import('../pages/accounting/PaymentStatementFilePage'))
const IncomeSubmissionPage = lazy(() => import('../pages/accounting/IncomeSubmissionPage'))
const DailyPaymentStatementPage = lazy(() => import('../pages/accounting/DailyPaymentStatementPage'))
const DailyReceiptPage = lazy(() => import('../pages/accounting/DailyReceiptPage'))
const RetirementEstimatePage = lazy(() => import('../pages/accounting/RetirementEstimatePage'))
const WithholdingComparisonPage = lazy(() => import('../pages/accounting/WithholdingComparisonPage'))
const YearEndReviewPage = lazy(() => import('../pages/accounting/YearEndReviewPage'))
const WithholdingLedgerPage = lazy(() => import('../pages/accounting/WithholdingLedgerPage'))
const IncomeTaxCertPage = lazy(() => import('../pages/accounting/IncomeTaxCertPage'))
const RetirementPayPage = lazy(() => import('../pages/accounting/RetirementPayPage'))
const YearEndSettlementPage = lazy(() => import('../pages/accounting/YearEndSettlementPage'))
const MidTermPdfPage = lazy(() => import('../pages/accounting/MidTermPdfPage'))
const OtherWithholdingPage = lazy(() => import('../pages/accounting/OtherWithholdingPage'))
const WithholdingPayeePage = lazy(() => import('../pages/accounting/WithholdingPayeePage'))
const OtherWithholdingInputPage = lazy(() => import('../pages/accounting/OtherWithholdingInputPage'))
const OtherWithholdingStatusPage = lazy(() => import('../pages/accounting/OtherWithholdingStatusPage'))
const OtherWithholdingReceiptPage = lazy(() => import('../pages/accounting/OtherWithholdingReceiptPage'))
const OtherWithholdingStatementPage = lazy(() => import('../pages/accounting/OtherWithholdingStatementPage'))
const CorporateTaxPage = lazy(() => import('../pages/accounting/CorporateTaxPage'))
const CorporateTaxChecklistPage = lazy(() => import('../pages/accounting/CorporateTaxChecklistPage'))
const ExpenseEvidenceStatusPage = lazy(() => import('../pages/accounting/ExpenseEvidenceStatusPage'))
const PromissoryNotePage = lazy(() => import('../pages/accounting/PromissoryNotePage'))
const NoteHoldingPage = lazy(() => import('../pages/accounting/NoteHoldingPage'))
const NoteFlowPage = lazy(() => import('../pages/accounting/NoteFlowPage'))
const NoteLedgerPage = lazy(() => import('../pages/accounting/NoteLedgerPage'))
const NoteListPage = lazy(() => import('../pages/accounting/NoteListPage'))
const NoteEntryPage = lazy(() => import('../pages/accounting/NoteEntryPage'))
const NoteBatchDecreasePage = lazy(() => import('../pages/accounting/NoteBatchDecreasePage'))
const BudgetPage = lazy(() => import('../pages/accounting/BudgetPage'))
const BudgetReportPage = lazy(() => import('../pages/accounting/BudgetReportPage'))
const CashPlanPage = lazy(() => import('../pages/accounting/CashPlanPage'))
const FundPlanListPage = lazy(() => import('../pages/accounting/FundPlanListPage'))
const FundPlanStatusPage = lazy(() => import('../pages/accounting/FundPlanStatusPage'))
const FundForecastPage = lazy(() => import('../pages/accounting/FundForecastPage'))
const AccountsPage = lazy(() => import('../pages/accounting/AccountsPage'))
const JournalListPage = lazy(() => import('../pages/accounting/JournalListPage'))
const AccountLedgerPage = lazy(() => import('../pages/accounting/AccountLedgerPage'))
const CashBookPage = lazy(() => import('../pages/accounting/CashBookPage'))
const JournalBookPage = lazy(() => import('../pages/accounting/JournalBookPage'))
const JournalPrintPage = lazy(() => import('../pages/accounting/JournalPrintPage'))
const VoucherPrintListPage = lazy(() => import('../pages/accounting/VoucherPrintListPage'))
const DayMonthSheetPage = lazy(() => import('../pages/accounting/DayMonthSheetPage'))
const AccountPartnerLedgerPage = lazy(() => import('../pages/accounting/AccountPartnerLedgerPage'))
const PartnerAccountLedgerPage = lazy(() => import('../pages/accounting/PartnerAccountLedgerPage'))
const PartnerBookPage = lazy(() => import('../pages/accounting/PartnerBookPage'))
const AccountRemarkLedgerPage = lazy(() => import('../pages/accounting/AccountRemarkLedgerPage'))
const AccountFlowPage = lazy(() => import('../pages/accounting/AccountFlowPage'))
const VatBookPage = lazy(() => import('../pages/accounting/VatBookPage'))
const PartnerTxListPage = lazy(() => import('../pages/accounting/PartnerTxListPage'))
const CostStatementPage = lazy(() => import('../pages/accounting/CostStatementPage'))
const AccountDetailPage = lazy(() => import('../pages/accounting/AccountDetailPage'))
const JournalStatusPage = lazy(() => import('../pages/accounting/JournalStatusPage'))
const TaxInvoiceJournalPage = lazy(() => import('../pages/accounting/TaxInvoiceJournalPage'))
const TaxInvoiceListPage = lazy(() => import('../pages/accounting/TaxInvoiceListPage'))
const VatMarkChangePage = lazy(() => import('../pages/accounting/VatMarkChangePage'))
const TaxVoucherPage = lazy(() => import('../pages/accounting/TaxVoucherPage'))
const SalesTaxSummaryPage = lazy(() => import('../pages/accounting/SalesTaxSummaryPage'))
const VatChecklistPage = lazy(() => import('../pages/accounting/VatChecklistPage'))
const JournalVatComparePage = lazy(() => import('../pages/accounting/JournalVatComparePage'))
const BizCardComparePage = lazy(() => import('../pages/accounting/BizCardComparePage'))
const HometaxComparePage = lazy(() => import('../pages/accounting/HometaxComparePage'))
const VatReturnPage = lazy(() => import('../pages/accounting/VatReturnPage'))
const VatReturnPdfPage = lazy(() => import('../pages/accounting/VatReturnPdfPage'))
const VatMediaFilePage = lazy(() => import('../pages/accounting/VatMediaFilePage'))
const TaxCertificatePage = lazy(() => import('../pages/accounting/TaxCertificatePage'))
const JournalHistoryPage = lazy(() => import('../pages/accounting/JournalHistoryPage'))
const TransferListPage = lazy(() => import('../pages/accounting/TransferListPage'))
const AccountingVsStockPage = lazy(() => import('../pages/accounting/AccountingVsStockPage'))
const BalanceRecalcPage = lazy(() => import('../pages/accounting/BalanceRecalcPage'))
const FundDailyPage = lazy(() => import('../pages/accounting/FundDailyPage'))
const CashFlowListPage = lazy(() => import('../pages/accounting/CashFlowListPage'))
const FundStatusPage = lazy(() => import('../pages/accounting/FundStatusPage'))
const MonthlyPnlPage = lazy(() => import('../pages/accounting/MonthlyPnlPage'))
const MonthlyCostPage = lazy(() => import('../pages/accounting/MonthlyCostPage'))
const ArApAgingPage = lazy(() => import('../pages/accounting/ArApAgingPage'))
const ArApBalancePage = lazy(() => import('../pages/accounting/ArApBalancePage'))
const ManagementSummaryPage = lazy(() => import('../pages/accounting/ManagementSummaryPage'))
const AccountAggregatePage = lazy(() => import('../pages/accounting/AccountAggregatePage'))
const MonthlyVatSummaryPage = lazy(() => import('../pages/accounting/MonthlyVatSummaryPage'))
const ExpenseSlipSummaryPage = lazy(() => import('../pages/accounting/ExpenseSlipSummaryPage'))
const TrialBalancePage = lazy(() => import('../pages/accounting/TrialBalancePage'))
const BalanceSheetPage = lazy(() => import('../pages/accounting/BalanceSheetPage'))
const IncomeStatementPage = lazy(() => import('../pages/accounting/IncomeStatementPage'))
const TaxInvoicePage = lazy(() => import('../pages/accounting/TaxInvoicePage'))
const JournalEntryPage = lazy(() => import('../pages/accounting/JournalEntryPage'))
const AutoJournalListPage = lazy(() => import('../pages/accounting/AutoJournalListPage'))
const BalanceAdjustPage = lazy(() => import('../pages/accounting/BalanceAdjustPage'))
const BalanceAdjustListPage = lazy(() => import('../pages/accounting/BalanceAdjustListPage'))
const BalanceAdjustStatusPage = lazy(() => import('../pages/accounting/BalanceAdjustStatusPage'))
const VatSlipPage = lazy(() => import('../pages/accounting/VatSlipPage'))
const CashTxnPage = lazy(() => import('../pages/accounting/CashTxnPage'))
const CashDetailPage = lazy(() => import('../pages/accounting/CashDetailPage'))
const BankCardPage = lazy(() => import('../pages/accounting/BankCardPage'))
const LinkedTxnListPage = lazy(() => import('../pages/accounting/LinkedTxnListPage'))
const CardListPage = lazy(() => import('../pages/accounting/CardListPage'))
const BankAccountListPage = lazy(() => import('../pages/accounting/BankAccountListPage'))
const FixedAssetPage = lazy(() => import('../pages/accounting/FixedAssetPage'))
const FixedAssetLedgerPage = lazy(() => import('../pages/accounting/FixedAssetLedgerPage'))
const FixedAssetFlowPage = lazy(() => import('../pages/accounting/FixedAssetFlowPage'))
const FixedAssetStockPage = lazy(() => import('../pages/accounting/FixedAssetStockPage'))
const FixedAssetMovementPage = lazy(() => import('../pages/accounting/FixedAssetMovementPage'))
const FixedAssetSlipListPage = lazy(() => import('../pages/accounting/FixedAssetSlipListPage'))
const FastVoucherPage = lazy(() => import('../pages/accounting/FastVoucherPage'))
const ReceiptPaymentPage = lazy(() => import('../pages/accounting/ReceiptPaymentPage'))
const CashQuickEntryPage = lazy(() => import('../pages/accounting/CashQuickEntryPage'))
const NonCashPage = lazy(() => import('../pages/accounting/NonCashPage'))
const CheckPage = lazy(() => import('../pages/accounting/CheckPage'))
const CheckHoldingPage = lazy(() => import('../pages/accounting/CheckHoldingPage'))
const CheckFlowPage = lazy(() => import('../pages/accounting/CheckFlowPage'))
const CheckLedgerPage = lazy(() => import('../pages/accounting/CheckLedgerPage'))
const CheckListPage = lazy(() => import('../pages/accounting/CheckListPage'))
const CheckDepositPage = lazy(() => import('../pages/accounting/CheckDepositPage'))
const BondListPage = lazy(() => import('../pages/accounting/BondListPage'))
const BondLedgerPage = lazy(() => import('../pages/accounting/BondLedgerPage'))
const BondFlowPage = lazy(() => import('../pages/accounting/BondFlowPage'))
const BondStatusPage = lazy(() => import('../pages/accounting/BondStatusPage'))
const BondPartnerLedgerPage = lazy(() => import('../pages/accounting/BondPartnerLedgerPage'))
const BondPartnerLedgerPrintPage = lazy(() => import('../pages/accounting/BondPartnerLedgerPrintPage'))
const BondDecreasePage = lazy(() => import('../pages/accounting/BondDecreasePage'))
const BondBalanceAnalysisPage = lazy(() => import('../pages/accounting/BondBalanceAnalysisPage'))
const ContractPage = lazy(() => import('../pages/accounting/ContractPage'))
const ContractItemPage = lazy(() => import('../pages/accounting/ContractItemPage'))
const BillingContractEntryPage = lazy(() => import('../pages/accounting/BillingContractEntryPage'))
const EContractProgressPage = lazy(() => import('../pages/accounting/EContractProgressPage'))
const EContractStatusPage = lazy(() => import('../pages/accounting/EContractStatusPage'))
const BillingContractListPage = lazy(() => import('../pages/accounting/BillingContractListPage'))
const ContractBillPage = lazy(() => import('../pages/accounting/ContractBillPage'))
const ContractPriceChangePage = lazy(() => import('../pages/accounting/ContractPriceChangePage'))
const ContractStatusReportPage = lazy(() => import('../pages/accounting/ContractStatusReportPage'))
const ContractUnbilledPage = lazy(() => import('../pages/accounting/ContractUnbilledPage'))
const ContractBillPrintPage = lazy(() => import('../pages/accounting/ContractBillPrintPage'))
const ContractReflectPage = lazy(() => import('../pages/accounting/ContractReflectPage'))
const ContractUnreflectedPage = lazy(() => import('../pages/accounting/ContractUnreflectedPage'))
const ContractInvoiceStatusPage = lazy(() => import('../pages/accounting/ContractInvoiceStatusPage'))
const CurrencyPage = lazy(() => import('../pages/settings/CurrencyPage'))
const ExpensePage = lazy(() => import('../pages/accounting/ExpensePage'))
const IncomePage = lazy(() => import('../pages/accounting/IncomePage'))
const ImportLotPage = lazy(() => import('../pages/accounting/ImportLotPage'))
const ImportCostItemPage = lazy(() => import('../pages/accounting/ImportCostItemPage'))
const ExpenseControlTypePage = lazy(() => import('../pages/accounting/ExpenseControlTypePage'))
const ExpenseItemPage = lazy(() => import('../pages/accounting/ExpenseItemPage'))
const ExpenseGroupPage = lazy(() => import('../pages/accounting/ExpenseGroupPage'))
const ExpenseSettlePage = lazy(() => import('../pages/accounting/ExpenseSettlePage'))
const ImportCostEntryPage = lazy(() => import('../pages/accounting/ImportCostEntryPage'))
const ImportCostVoucherListPage = lazy(() => import('../pages/accounting/ImportCostVoucherListPage'))
const ImportCostLedgerPage = lazy(() => import('../pages/accounting/ImportCostLedgerPage'))
const QualityInspectionPage = lazy(() => import('../pages/quality/QualityInspectionPage'))
const QualityRequestPage = lazy(() => import('../pages/quality/QualityRequestPage'))
const QualityRequestEntryPage = lazy(() => import('../pages/quality/QualityRequestEntryPage'))
const QualityInspectionEntryPage = lazy(() => import('../pages/quality/QualityInspectionEntryPage'))
const UninspectedPage = lazy(() => import('../pages/quality/UninspectedPage'))
const QualityRequestStatusPage = lazy(() => import('../pages/quality/QualityRequestStatusPage'))
const DefectReportPage = lazy(() => import('../pages/quality/DefectReportPage'))
const LotLedgerPage = lazy(() => import('../pages/quality/LotLedgerPage'))
const QualityStatusPage = lazy(() => import('../pages/quality/QualityStatusPage'))
const SerialLotPage = lazy(() => import('../pages/quality/SerialLotPage'))
const LotStockComparePage = lazy(() => import('../pages/quality/LotStockComparePage'))
const LotStockStatusPage = lazy(() => import('../pages/quality/LotStockStatusPage'))
const LotAdjustPage = lazy(() => import('../pages/quality/LotAdjustPage'))
const LotTxStatusPage = lazy(() => import('../pages/quality/LotTxStatusPage'))
const LotTxListPage = lazy(() => import('../pages/quality/LotTxListPage'))
const AsManagePage = lazy(() => import('../pages/quality/AsManagePage'))
const AsReceiptEntryPage = lazy(() => import('../pages/quality/AsReceiptEntryPage'))
const AsStatusPage = lazy(() => import('../pages/quality/AsStatusPage'))
const AsRepairStatusPage = lazy(() => import('../pages/quality/AsRepairStatusPage'))
const AsRepairListPage = lazy(() => import('../pages/quality/AsRepairListPage'))
const AsRepairEntryPage = lazy(() => import('../pages/quality/AsRepairEntryPage'))
const AsConsumptionPage = lazy(() => import('../pages/quality/AsConsumptionPage'))
const QualityTypePage = lazy(() => import('../pages/quality/QualityTypePage'))
const CompanyInfoPage = lazy(() => import('../pages/settings/CompanyInfoPage'))
const PreferencesPage = lazy(() => import('../pages/settings/PreferencesPage'))
const SecurityPage = lazy(() => import('../pages/settings/SecurityPage'))
const DefaultsPage = lazy(() => import('../pages/settings/DefaultsPage'))
const MyFolderPage = lazy(() => import('../pages/mypage/MyFolderPage'))
const DownloadPage = lazy(() => import('../pages/settings/DownloadPage'))
const PrintSignLinePage = lazy(() => import('../pages/settings/PrintSignLinePage'))
const ApprovalDraftPage = lazy(() => import('../pages/groupware/ApprovalDraftPage'))
const MyApprovalPage = lazy(() => import('../pages/groupware/MyApprovalPage'))
const ApprovalAllPage = lazy(() => import('../pages/groupware/ApprovalAllPage'))
const ApprovalSettingPage = lazy(() => import('../pages/groupware/ApprovalSettingPage'))
const EcDrivePage = lazy(() => import('../pages/groupware/EcDrivePage'))
const WorkSampleBoardPage = lazy(() => import('../pages/groupware/WorkSampleBoardPage'))
const MultiSlipPage = lazy(() => import('../pages/groupware/MultiSlipPage'))
const AnonymousBoardPage = lazy(() => import('../pages/groupware/AnonymousBoardPage'))
const FieldWorkPage = lazy(() => import('../pages/groupware/FieldWorkPage'))
const FieldWorkStatusPage = lazy(() => import('../pages/groupware/FieldWorkStatusPage'))
const WorkPage = lazy(() => import('../pages/groupware/WorkPage'))
const WorkLogPage = lazy(() => import('../pages/groupware/WorkLogPage'))
const AttendancePage = lazy(() => import('../pages/groupware/AttendancePage'))
const AttendanceIdStatusPage = lazy(() => import('../pages/groupware/AttendanceIdStatusPage'))
const AttendanceIdLatePage = lazy(() => import('../pages/groupware/AttendanceIdLatePage'))
const AttendanceIdDailyHoursPage = lazy(() => import('../pages/groupware/AttendanceIdDailyHoursPage'))
const AttendanceIdIntegratedPage = lazy(() => import('../pages/groupware/AttendanceIdIntegratedPage'))
const CrmPage = lazy(() => import('../pages/groupware/CrmPage'))
const BusinessCardPage = lazy(() => import('../pages/groupware/BusinessCardPage'))
const ProjectPage = lazy(() => import('../pages/groupware/ProjectPage'))
const ProjectProfitPage = lazy(() => import('../pages/accounting/ProjectProfitPage'))
const ProjectPlanPage = lazy(() => import('../pages/accounting/ProjectPlanPage'))
const ProjectPlanStatusPage = lazy(() => import('../pages/accounting/ProjectPlanStatusPage'))
const CardIssuerListPage = lazy(() => import('../pages/accounting/CardIssuerListPage'))
const PaymentAgencyListPage = lazy(() => import('../pages/accounting/PaymentAgencyListPage'))
const KeyNoticePage = lazy(() => import('../pages/groupware/KeyNoticePage'))
const MailPage = lazy(() => import('../pages/groupware/MailPage'))
const ShortMessagePage = lazy(() => import('../pages/groupware/ShortMessagePage'))
const OrgChartPage = lazy(() => import('../pages/groupware/OrgChartPage'))
const SalesOrderPage = lazy(() => import('../pages/trade/SalesOrderPage'))
const OrderReleasePage = lazy(() => import('../pages/trade/OrderReleasePage'))
const QuotationPage = lazy(() => import('../pages/trade/QuotationPage'))
const PurchaseOrderPage = lazy(() => import('../pages/trade/PurchaseOrderPage'))
const PayablePage = lazy(() => import('../pages/trade/PayablePage'))
const TradeInquiryPage = lazy(() => import('../pages/trade/TradeInquiryPage'))
const ExportPage = lazy(() => import('../pages/trade/ExportPage'))
const ExportStatusPage = lazy(() => import('../pages/trade/ExportStatusPage'))
const MallPage = lazy(() => import('../pages/trade/MallPage'))
const PlanningPage = lazy(() => import('../pages/production/PlanningPage'))
const TransferPage = lazy(() => import('../pages/inventory/TransferPage'))
const StockMoveListPage = lazy(() => import('../pages/inventory/StockMoveListPage'))
const SelfUseInputPage = lazy(() => import('../pages/inventory/SelfUseInputPage'))
const AdjustListPage = lazy(() => import('../pages/inventory/AdjustListPage'))
const StocktakeListPage = lazy(() => import('../pages/inventory/StocktakeListPage'))
const StocktakePage = lazy(() => import('../pages/inventory/StocktakePage'))
const WmsPage = lazy(() => import('../pages/inventory/WmsPage'))
const WmsFramePage = lazy(() => import('../pages/inventory/WmsFramePage'))
const ReportsPage = lazy(() => import('../pages/inventory/ReportsPage'))
const EtcSystemPage = lazy(() => import('../pages/settings/EtcSystemPage'))
const CommonCodePage = lazy(() => import('../pages/settings/CommonCodePage'))
const DesignSystemPage = lazy(() => import('../pages/settings/DesignSystemPage'))
const CustomFieldPage = lazy(() => import('../pages/settings/CustomFieldPage'))
const DataCollectPage = lazy(() => import('../pages/datacenter/DataCollectPage'))
const DataExportPage = lazy(() => import('../pages/datacenter/DataExportPage'))
const CollectSourcePage = lazy(() => import('../pages/datacenter/CollectSourcePage'))
const MrpPage = lazy(() => import('../pages/production/MrpPage'))
const ProcessPage = lazy(() => import('../pages/production/ProcessPage'))
const ResourcePage = lazy(() => import('../pages/production/ResourcePage'))
const BorPage = lazy(() => import('../pages/production/BorPage'))
const WoStatusPage = lazy(() => import('../pages/production/WoStatusPage'))
const WoEfficiencyPage = lazy(() => import('../pages/production/WoEfficiencyPage'))
const IssuePage = lazy(() => import('../pages/production/IssuePage'))
const WorkResultPage = lazy(() => import('../pages/production/WorkResultPage'))
const WorkProcessPage = lazy(() => import('../pages/production/WorkProcessPage'))
const CostBuildPage = lazy(() => import('../pages/accounting/CostBuildPage'))
const StandardCostPage = lazy(() => import('../pages/accounting/StandardCostPage'))
const ActualCostPage = lazy(() => import('../pages/accounting/ActualCostPage'))
const VariancePage = lazy(() => import('../pages/accounting/VariancePage'))
const MonthlyProfitPage = lazy(() => import('../pages/accounting/MonthlyProfitPage'))
const DailyProfitPage = lazy(() => import('../pages/accounting/DailyProfitPage'))
const SalesStatusPage = lazy(() => import('../pages/trade/SalesStatusPage'))
const SalesOrderStatusPage = lazy(() => import('../pages/trade/SalesOrderStatusPage'))
const TradeHistoryPage = lazy(() => import('../pages/trade/TradeHistoryPage'))
const SalesPurchaseSummaryPage = lazy(() => import('../pages/trade/SalesPurchaseSummaryPage'))
const MonthlyArApPage = lazy(() => import('../pages/trade/MonthlyArApPage'))
const PriceMovementPage = lazy(() => import('../pages/trade/PriceMovementPage'))
const ItemEntryPage = lazy(() => import('../pages/trade/ItemEntryPage'))
const MonthlyCumulativePage = lazy(() => import('../pages/trade/MonthlyCumulativePage'))
const PivotSummaryPage = lazy(() => import('../pages/trade/PivotSummaryPage'))
const SalesPlanPage = lazy(() => import('../pages/trade/SalesPlanPage'))
const SalesPlanComparePage = lazy(() => import('../pages/trade/SalesPlanComparePage'))
const SalesPlanListPage = lazy(() => import('../pages/trade/SalesPlanListPage'))
const SalesPlanEntryPage = lazy(() => import('../pages/trade/SalesPlanEntryPage'))
const SalesPlanStatusPage = lazy(() => import('../pages/trade/SalesPlanStatusPage'))
const UnorderedStatusPage = lazy(() => import('../pages/trade/UnorderedStatusPage'))
const UnpurchasedStatusPage = lazy(() => import('../pages/trade/UnpurchasedStatusPage'))
const PurchaseOrderStatusPage = lazy(() => import('../pages/trade/PurchaseOrderStatusPage'))
const PurchaseRequestStatusPage = lazy(() => import('../pages/trade/PurchaseRequestStatusPage'))
const PurchaseRequestListPage = lazy(() => import('../pages/trade/PurchaseRequestListPage'))
const PurchaseRequestInputPage = lazy(() => import('../pages/trade/PurchaseRequestInputPage'))
const PurchasePlanInputPage = lazy(() => import('../pages/trade/PurchasePlanInputPage'))
const PurchasePlanListPage = lazy(() => import('../pages/trade/PurchasePlanListPage'))
const PriceRequestListPage = lazy(() => import('../pages/trade/PriceRequestListPage'))
/* 이름표 묶음은 값이라 lazy 로 못 받는다 — 화면 파일에서 그대로 가져온다. */
import { PLAN_LABELS } from '../pages/trade/PurchaseRequestStatusPage'
const SalesDiscountPage = lazy(() => import('../pages/trade/SalesDiscountPage'))
const PurchaseStatusPage = lazy(() => import('../pages/trade/PurchaseStatusPage'))
const PurchaseDiscountPage = lazy(() => import('../pages/trade/PurchaseDiscountPage'))
const ShipmentOrderPage = lazy(() => import('../pages/trade/ShipmentOrderPage'))
const ShipmentOrderStatusPage = lazy(() => import('../pages/trade/ShipmentOrderStatusPage'))
const ShipmentPage = lazy(() => import('../pages/trade/ShipmentPage'))
const ShipmentInquiryPage = lazy(() => import('../pages/trade/ShipmentInquiryPage'))
const PriceRequestProgressPage = lazy(() => import('../pages/trade/PriceRequestProgressPage'))
const UnshippedPage = lazy(() => import('../pages/trade/UnshippedPage'))
const UnsoldStatusPage = lazy(() => import('../pages/trade/UnsoldStatusPage'))
const CollectionPage = lazy(() => import('../pages/trade/CollectionPage'))
const PaymentPage = lazy(() => import('../pages/trade/PaymentPage'))
const PartnerLedgerPage = lazy(() => import('../pages/trade/PartnerLedgerPage'))
const ArApStatusPage = lazy(() => import('../pages/trade/ArApStatusPage'))
const AttendanceInputPage = lazy(() => import('../pages/hr/AttendanceInputPage'))
const LeaveInputPage = lazy(() => import('../pages/hr/LeaveInputPage'))
const LeaveListPage = lazy(() => import('../pages/hr/LeaveListPage'))
const AttendanceListPage = lazy(() => import('../pages/hr/AttendanceListPage'))
const AttendanceStatusPage = lazy(() => import('../pages/hr/AttendanceStatusPage'))
const AttendanceKindStatusPage = lazy(() => import('../pages/hr/AttendanceKindStatusPage'))
const LateArrivalPage = lazy(() => import('../pages/hr/LateArrivalPage'))
const DailyWorkHoursPage = lazy(() => import('../pages/hr/DailyWorkHoursPage'))
const WorkIntegratedPage = lazy(() => import('../pages/hr/WorkIntegratedPage'))
const VacationUsePage = lazy(() => import('../pages/hr/VacationUsePage'))
const VacationRemainPage = lazy(() => import('../pages/hr/VacationRemainPage'))
const RetiredEmployeePage = lazy(() => import('../pages/hr/RetiredEmployeePage'))
const HeadcountPage = lazy(() => import('../pages/hr/HeadcountPage'))
const EmployeePage = lazy(() => import('../pages/hr/EmployeePage'))
const PayrollPage = lazy(() => import('../pages/hr/PayrollPage'))
const EmployeePerformancePage = lazy(() => import('../pages/hr/EmployeePerformancePage'))
const PaySettingPage = lazy(() => import('../pages/hr/PaySettingPage'))
const PayItemListPage = lazy(() => import('../pages/hr/PayItemListPage'))
const PayGroupListPage = lazy(() => import('../pages/hr/PayGroupListPage'))
const DepartmentListPage = lazy(() => import('../pages/hr/DepartmentListPage'))
const ProjectListPage = lazy(() => import('../pages/inventory/ProjectListPage'))
const WorkInputPage = lazy(() => import('../pages/hr/WorkInputPage'))
const WorkListPage = lazy(() => import('../pages/hr/WorkListPage'))
const PayLedgerPage = lazy(() => import('../pages/hr/PayLedgerPage'))
const EmployeePayListPage = lazy(() => import('../pages/hr/EmployeePayListPage'))
const PayrollStatusPage = lazy(() => import('../pages/hr/PayrollStatusPage'))
const WorkConfirmStatusPage = lazy(() => import('../pages/hr/WorkConfirmStatusPage'))
const PayTransferStatusPage = lazy(() => import('../pages/hr/PayTransferStatusPage'))
const InsuranceAcquirePage = lazy(() => import('../pages/hr/InsuranceAcquirePage'))
const InsuranceLossPage = lazy(() => import('../pages/hr/InsuranceLossPage'))
const InsuranceDependentPage = lazy(() => import('../pages/hr/InsuranceDependentPage'))
const InsuranceReportListPage = lazy(() => import('../pages/hr/InsuranceReportListPage'))
const HrCardPage = lazy(() => import('../pages/hr/HrCardPage'))
const HrRecordPage = lazy(() => import('../pages/hr/HrRecordPage'))
const AssignmentListPage = lazy(() => import('../pages/hr/AssignmentListPage'))
const AssignmentInputPage = lazy(() => import('../pages/hr/AssignmentInputPage'))
const AssignmentStatusPage = lazy(() => import('../pages/hr/AssignmentStatusPage'))
const CertificatePage = lazy(() => import('../pages/hr/CertificatePage'))
const AttendanceKindListPage = lazy(() => import('../pages/hr/AttendanceKindListPage'))
const VacationKindListPage = lazy(() => import('../pages/hr/VacationKindListPage'))
const VacationGrantPage = lazy(() => import('../pages/hr/VacationGrantPage'))
const CommuteRuleListPage = lazy(() => import('../pages/hr/CommuteRuleListPage'))
const EmployeeCommutePage = lazy(() => import('../pages/hr/EmployeeCommutePage'))
const EmployeeCommuteStatusPage = lazy(() => import('../pages/hr/EmployeeCommuteStatusPage'))
const EmployeeLatePage = lazy(() => import('../pages/hr/EmployeeLatePage'))
const EmployeeCommuteAttendancePage = lazy(() => import('../pages/hr/EmployeeCommuteAttendancePage'))
const ContractStatusPage = lazy(() => import('../pages/hr/ContractStatusPage'))
const DailyWorkerListPage = lazy(() => import('../pages/hr/DailyWorkerListPage'))
const DailyPayItemListPage = lazy(() => import('../pages/hr/DailyPayItemListPage'))
const DailyWorkInputPage = lazy(() => import('../pages/hr/DailyWorkInputPage'))
const DailyWorkListPage = lazy(() => import('../pages/hr/DailyWorkListPage'))
const DailyWorkStatusPage = lazy(() => import('../pages/hr/DailyWorkStatusPage'))
const DailyPayLedgerPage = lazy(() => import('../pages/hr/DailyPayLedgerPage'))
const DailyPayByWorkerPage = lazy(() => import('../pages/hr/DailyPayByWorkerPage'))
const DailyPayStatusPage = lazy(() => import('../pages/hr/DailyPayStatusPage'))
const DailyWorkConfirmStatusPage = lazy(() => import('../pages/hr/DailyWorkConfirmStatusPage'))
const DailyPayTransferPage = lazy(() => import('../pages/hr/DailyPayTransferPage'))
const LaborContractPage = lazy(() => import('../pages/hr/ContractPage'))
const DailyWagePage = lazy(() => import('../pages/hr/DailyWagePage'))
const NoticePage = lazy(() => import('../pages/groupware/NoticePage'))
const SharedBoardPage = lazy(() => import('../pages/groupware/SharedBoardPage'))
const MeetingBoardPage = lazy(() => import('../pages/groupware/MeetingBoardPage'))
const MinutesBoardPage = lazy(() => import('../pages/groupware/MinutesBoardPage'))
const SignBoardPage = lazy(() => import('../pages/groupware/SignBoardPage'))
const ProjectKanbanPage = lazy(() => import('../pages/groupware/ProjectKanbanPage'))
const SchedulePage = lazy(() => import('../pages/groupware/SchedulePage'))
const SurveyPage = lazy(() => import('../pages/groupware/SurveyPage'))
const AccountingReflectionPage = lazy(() => import('../pages/trade/AccountingReflectionPage'))
const EvidenceCenterPage = lazy(() => import('../pages/accounting/EvidenceCenterPage'))
const MedicalDeviceReportPage = lazy(() => import('../pages/datacenter/MedicalDeviceReportPage'))
const OutsourcingDiscountPage = lazy(() => import('../pages/trade/OutsourcingDiscountPage'))
const SuppliesPage = lazy(() => import('../pages/groupware/SuppliesPage'))
const TimeCalcPage = lazy(() => import('../pages/production/TimeCalcPage'))
const EmployeeContactPage = lazy(() => import('../pages/groupware/EmployeeContactPage'))
const OrgStatusPage = lazy(() => import('../pages/groupware/OrgStatusPage'))
const OrgTreePage = lazy(() => import('../pages/groupware/OrgTreePage'))
const ReceiptStatusPage = lazy(() => import('../pages/production/ReceiptStatusPage'))
const IssueStatusPage = lazy(() => import('../pages/production/IssueStatusPage'))
const WorkResultListPage = lazy(() => import('../pages/production/WorkResultListPage'))
const WorkResultInquiryPage = lazy(() => import('../pages/production/WorkResultInquiryPage'))
const WoProgressPage = lazy(() => import('../pages/production/WoProgressPage'))
const ExpenseDetailPage = lazy(() => import('../pages/accounting/ExpenseDetailPage'))
const ExpenseListPage = lazy(() => import('../pages/accounting/ExpenseListPage'))
const SwSchedulePage = lazy(() => import('../pages/groupware/SwSchedulePage'))
const ConstructionSchedulePage = lazy(() => import('../pages/groupware/ConstructionSchedulePage'))
const SurveyInputPage = lazy(() => import('../pages/groupware/SurveyInputPage'))
const SurveyStatusPage = lazy(() => import('../pages/groupware/SurveyStatusPage'))
const StatementPrintPage = lazy(() => import('../pages/trade/StatementPrintPage'))
const PartnerEntryPage = lazy(() => import('../pages/trade/PartnerEntryPage'))
const PaymentHistoryPage = lazy(() => import('../pages/trade/PaymentHistoryPage'))
const PaymentComparePage = lazy(() => import('../pages/trade/PaymentComparePage'))
const SalesPriceBulkPage = lazy(() => import('../pages/trade/SalesPriceBulkPage'))
const SpecialPricePage = lazy(() => import('../pages/trade/SpecialPricePage'))
const MallItemMappingPage = lazy(() => import('../pages/trade/MallItemMappingPage'))
const MallAccountPage = lazy(() => import('../pages/trade/MallAccountPage'))
const ConditionSearchPage = lazy(() => import('../pages/trade/ConditionSearchPage'))
const PurchasePriceBulkPage = lazy(() => import('../pages/trade/PurchasePriceBulkPage'))
const OrderTypePage = lazy(() => import('../pages/trade/OrderTypePage'))
const OrderStagePage = lazy(() => import('../pages/trade/OrderStagePage'))
const ReceiptInquiryPage = lazy(() => import('../pages/production/ReceiptInquiryPage'))

/** 좌측 사이드바는 EcountLayout이 활성 탭 기준으로 그린다.
 *  그래서 모듈별 레이아웃 래퍼 없이 모든 화면이 EcountLayout 아래 평평하게 붙는다. */
export default function AppRouter() {
  return (
    <Suspense fallback={<div className="p-[24px] text-ec-hint text-[13px]">화면을 불러오는 중…</div>}>
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
        <Route path="/sales/purchase-orders" element={<PurchaseOrderPage />} />
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
        <Route path="/sales/purchase-request-status" element={<PurchaseRequestStatusPage />} />
        {/*
          한 파일이 셋을 겸하는데 <b>조건 이름표가 화면마다 다르다</b>(2026-09-08 실측) —
          발주요청현황만 [메뉴]·[발주요청No.]·[작성자]·[정렬기준] 이고,
          아래 둘은 [구분]·[발주No.]·[최초작성자]·[정렬/소계기준] 이다.
        */}
        <Route path="/sales/purchase-plan-status" element={<PurchaseRequestStatusPage defaultStatus="PLANNED" title="발주계획현황" {...PLAN_LABELS} />} />
        <Route path="/sales/price-request-status" element={<PurchaseRequestStatusPage defaultStatus="PRICED" title="단가요청현황" {...PLAN_LABELS} />} />
        <Route path="/sales/price-request-progress" element={<PriceRequestProgressPage />} />
        <Route path="/sales/purchase-discount" element={<PurchaseDiscountPage />} />
        <Route path="/sales/shipment-order" element={<ShipmentOrderPage />} />
        <Route path="/sales/shipment-order-status" element={<ShipmentOrderStatusPage />} />
        <Route path="/sales/shipment" element={<ShipmentPage />} />
        <Route path="/sales/shipment-inquiry" element={<ShipmentInquiryPage />} />
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

        {/* 회계 */}
        <Route path="/accounting" element={<Navigate to="/accounting/profit" replace />} />
        <Route path="/accounting/profit" element={<ProfitSummaryPage />} />
        <Route path="/accounting/item-cost" element={<ItemCostPage />} />
        <Route path="/accounting/vat" element={<VatSummaryPage />} />
        <Route path="/accounting/evidence-center" element={<EvidenceCenterPage />} />
        <Route path="/datacenter/medical-device-report" element={<MedicalDeviceReportPage />} />
        <Route path="/accounting/withholding" element={<WithholdingPage />} />
        <Route path="/accounting/withholding/pdf" element={<WithholdingPdfPage />} />
        <Route path="/accounting/simple-payment" element={<SimplePaymentPage />} />
        <Route path="/accounting/withholding/payment-statement-file" element={<PaymentStatementFilePage />} />
        <Route path="/accounting/withholding/income-submission" element={<IncomeSubmissionPage />} />
        <Route path="/accounting/withholding/daily-statement" element={<DailyPaymentStatementPage />} />
        <Route path="/accounting/withholding/daily-receipt" element={<DailyReceiptPage />} />
        <Route path="/accounting/withholding/year-end" element={<YearEndSettlementPage />} />
        <Route path="/accounting/withholding/mid-settlement" element={<YearEndSettlementPage key="mid" kind="MID_TERM" />} />
        <Route path="/accounting/withholding/mid-settlement-pdf" element={<MidTermPdfPage />} />
        <Route path="/accounting/withholding/retirement-estimate" element={<RetirementEstimatePage />} />
        <Route path="/accounting/withholding/comparison" element={<WithholdingComparisonPage />} />
        <Route path="/accounting/withholding/year-end-review-1" element={<YearEndReviewPage part={1} />} />
        <Route path="/accounting/withholding/year-end-review-2" element={<YearEndReviewPage part={2} />} />
        <Route path="/accounting/withholding/confirm" element={<WithholdingConfirmPage />} />
        <Route path="/accounting/withholding/ledger" element={<WithholdingLedgerPage />} />
        <Route path="/accounting/withholding/income-tax-cert" element={<IncomeTaxCertPage />} />
        <Route path="/hr/retirement-pay" element={<RetirementPayPage />} />
        <Route path="/accounting/other-withholding" element={<OtherWithholdingPage />} />
        <Route path="/accounting/other-withholding/payees" element={<WithholdingPayeePage />} />
        <Route path="/accounting/other-withholding/input" element={<OtherWithholdingInputPage />} />
        <Route path="/accounting/other-withholding/status" element={<OtherWithholdingStatusPage />} />
        <Route path="/accounting/other-withholding/receipts" element={<OtherWithholdingReceiptPage />} />
        <Route path="/accounting/other-withholding/payment-statement" element={<OtherWithholdingStatementPage />} />
        <Route path="/accounting/corporate-tax/checklist" element={<CorporateTaxChecklistPage />} />
        <Route path="/accounting/corporate-tax/expense-evidence" element={<ExpenseEvidenceStatusPage />} />
        <Route path="/accounting/corporate-tax" element={<CorporateTaxPage />} />
        <Route path="/accounting/notes" element={<PromissoryNotePage />} />
        <Route path="/accounting/notes-increase" element={<NoteEntryPage key="increase" mode="increase" />} />
        <Route path="/accounting/notes-decrease" element={<NoteEntryPage key="decrease" mode="decrease" />} />
        <Route path="/accounting/notes-endorse" element={<NoteEntryPage key="endorse" mode="endorse" />} />
        <Route path="/accounting/notes-batch-decrease" element={<NoteBatchDecreasePage key="recv" receivable />} />
        <Route path="/accounting/notes-pay-batch-decrease" element={<NoteBatchDecreasePage key="pay" receivable={false} />} />
        <Route path="/accounting/notes-list" element={<NoteListPage type="RECEIVABLE" />} />
        <Route path="/accounting/notes-pay-list" element={<NoteListPage type="PAYABLE" />} />
        <Route path="/accounting/notes-ledger" element={<NoteLedgerPage type="RECEIVABLE" />} />
        <Route path="/accounting/notes-pay-ledger" element={<NoteLedgerPage type="PAYABLE" />} />
        <Route path="/accounting/notes-in" element={<NoteFlowPage type="RECEIVABLE" flow="증가" />} />
        <Route path="/accounting/notes-out" element={<NoteFlowPage type="RECEIVABLE" flow="감소" />} />
        <Route path="/accounting/notes-pay-in" element={<NoteFlowPage type="PAYABLE" flow="증가" />} />
        <Route path="/accounting/notes-pay-out" element={<NoteFlowPage type="PAYABLE" flow="감소" />} />
        <Route path="/accounting/notes-held" element={<NoteHoldingPage type="RECEIVABLE" />} />
        <Route path="/accounting/notes-unpaid" element={<NoteHoldingPage type="PAYABLE" />} />
        <Route path="/accounting/budget" element={<BudgetPage />} />
        <Route path="/accounting/budget/status" element={<BudgetReportPage variant="status" />} />
        <Route path="/accounting/budget/compare" element={<BudgetReportPage variant="compare" />} />
        <Route path="/accounting/budget/control-ledger" element={<BudgetReportPage variant="controlLedger" />} />
        <Route path="/accounting/notes-pay-increase" element={<NoteEntryPage key="pay-increase" mode="pay-increase" />} />
        <Route path="/accounting/notes-pay-decrease" element={<NoteEntryPage key="pay-decrease" mode="pay-decrease" />} />
        <Route path="/accounting/budget/ledger" element={<BudgetReportPage variant="ledger" />} />
        <Route path="/accounting/budget/control-compare" element={<BudgetReportPage variant="controlCompare" />} />
        <Route path="/accounting/cash-plan" element={<CashPlanPage />} />
        <Route path="/accounting/fund-plans" element={<FundPlanListPage />} />
        <Route path="/accounting/fund-plans/status" element={<FundPlanStatusPage />} />
        <Route path="/accounting/fund-plans/daily" element={<FundForecastPage variant="daily" />} />
        <Route path="/accounting/fund-plans/monthly" element={<FundForecastPage variant="monthly" />} />
        <Route path="/accounting/fund-plans/yearly" element={<FundForecastPage variant="yearly" />} />
        <Route path="/accounting/accounts" element={<AccountsPage />} />
        <Route path="/accounting/journals" element={<JournalListPage />} />
        {/* 회계 I › 회계거래관리(2026-10-20 loginaa): 전표인쇄 E010702 · 매출 · 매입(세금)계산서조회 · 지출결의서 · 입금보고서 · 가지급금정산서인쇄 */}
        <Route path="/accounting/journal-print" element={<JournalPrintPage />} />
        <Route path="/accounting/sales-tax-list" element={<TaxInvoiceListPage key="s" side="매출" title="매출(세금)계산서조회" />} />
        <Route path="/accounting/purchase-tax-list" element={<TaxInvoiceListPage key="p" side="매입" title="매입청구서조회" />} />
        <Route path="/accounting/voucher-print/expense" element={<VoucherPrintListPage key="e" kind="EXPENSE_REPORT" />} />
        <Route path="/accounting/voucher-print/deposit" element={<VoucherPrintListPage key="d" kind="DEPOSIT_REPORT" />} />
        <Route path="/accounting/voucher-print/advance" element={<VoucherPrintListPage key="a" kind="ADVANCE_SETTLEMENT" />} />
        <Route path="/accounting/ledger-book" element={<AccountLedgerPage />} />
        <Route path="/accounting/cash-book" element={<CashBookPage />} />
        <Route path="/accounting/journal-book" element={<JournalBookPage />} />
        <Route path="/accounting/day-month-sheet" element={<DayMonthSheetPage />} />
        <Route path="/accounting/account-partner-ledger" element={<AccountPartnerLedgerPage />} />
        <Route path="/accounting/partner-account-ledger" element={<PartnerAccountLedgerPage />} />
        {/* 회계 I 장부 › 거래처관리대장 I · II(E010833 · E010842) — 회계 전표로 그린다(재고1 /sales/partner-ledger 와 따로) */}
        <Route path="/accounting/partner-book-1" element={<PartnerBookPage key="pb1" kind="I" />} />
        <Route path="/accounting/partner-book-2" element={<PartnerBookPage key="pb2" kind="II" />} />
        <Route path="/accounting/account-remark-ledger" element={<AccountRemarkLedgerPage />} />
        <Route path="/accounting/account-flow" element={<AccountFlowPage />} />
        <Route path="/accounting/vat-book" element={<VatBookPage />} />
        <Route path="/accounting/partner-tx-list" element={<PartnerTxListPage />} />
        <Route path="/accounting/cost-statement" element={<CostStatementPage />} />
        <Route path="/accounting/account-detail" element={<AccountDetailPage />} />
        <Route path="/accounting/journal-status" element={<JournalStatusPage />} />
        <Route path="/accounting/sales-tax-journal" element={<TaxInvoiceJournalPage side="매출" />} />
        <Route path="/accounting/vat/tax-voucher" element={<TaxVoucherPage />} />
        <Route path="/accounting/vat/sales-tax-list" element={<TaxInvoiceListPage side="매출" />} />
        <Route path="/accounting/vat/purchase-tax-list" element={<TaxInvoiceListPage side="매입" />} />
        <Route path="/accounting/vat/sales-tax-status" element={<TaxInvoiceJournalPage side="매출" menu="세무" />} />
        <Route path="/accounting/vat/purchase-tax-status" element={<TaxInvoiceJournalPage side="매입" menu="세무" />} />
        <Route path="/accounting/vat/marks" element={<VatMarkChangePage />} />
        <Route path="/accounting/vat/sales-tax-summary" element={<SalesTaxSummaryPage />} />
        <Route path="/accounting/vat/checklist" element={<VatChecklistPage />} />
        <Route path="/accounting/vat/journal-compare" element={<JournalVatComparePage />} />
        <Route path="/accounting/vat/card-compare" element={<BizCardComparePage />} />
        <Route path="/accounting/vat/hometax-compare" element={<HometaxComparePage />} />
        <Route path="/accounting/vat/return" element={<VatReturnPage />} />
        <Route path="/accounting/vat/return-pdf" element={<VatReturnPdfPage />} />
        <Route path="/accounting/vat/media-files" element={<VatMediaFilePage />} />
        <Route path="/accounting/vat/tax-certificate" element={<TaxCertificatePage />} />
        <Route path="/accounting/purchase-tax-journal" element={<TaxInvoiceJournalPage side="매입" />} />
        <Route path="/accounting/journal-history" element={<JournalHistoryPage />} />
        <Route path="/accounting/transfer-list" element={<TransferListPage />} />
        <Route path="/accounting/accounting-vs-stock" element={<AccountingVsStockPage />} />
        <Route path="/accounting/balance-recalc" element={<BalanceRecalcPage />} />
        <Route path="/accounting/fund-daily" element={<FundDailyPage />} />
        <Route path="/accounting/fund-flow" element={<FundDailyPage variant="flow" />} />
        <Route path="/accounting/cash-flow" element={<CashFlowListPage />} />
        <Route path="/accounting/fund-status" element={<FundStatusPage />} />
        <Route path="/accounting/monthly-pnl" element={<MonthlyPnlPage />} />
        <Route path="/accounting/monthly-cost" element={<MonthlyCostPage />} />
        <Route path="/accounting/arap-aging" element={<ArApAgingPage />} />
        <Route path="/accounting/arap-balance" element={<ArApBalancePage />} />
        <Route path="/accounting/management-summary" element={<ManagementSummaryPage />} />
        <Route path="/accounting/account-aggregate" element={<AccountAggregatePage />} />
        <Route path="/accounting/monthly-sales-summary" element={<MonthlyVatSummaryPage side="매출" />} />
        <Route path="/accounting/monthly-purchase-summary" element={<MonthlyVatSummaryPage side="매입" />} />
        <Route path="/accounting/trial-balance" element={<TrialBalancePage />} />
        <Route path="/accounting/deposit-slip-summary" element={<ExpenseSlipSummaryPage side="입금" />} />
        <Route path="/accounting/advance-slip-summary" element={<ExpenseSlipSummaryPage side="가지급금" />} />
        <Route path="/accounting/trial-balance" element={<TrialBalancePage />} />
        <Route path="/accounting/expense-slip-summary" element={<ExpenseSlipSummaryPage />} />
        <Route path="/accounting/balance-sheet" element={<BalanceSheetPage />} />
        <Route path="/accounting/income-statement" element={<IncomeStatementPage />} />
        <Route path="/accounting/tax-invoice-sales" element={<TaxInvoicePage type="SALES" />} />
        <Route path="/accounting/tax-invoice-purchase" element={<TaxInvoicePage type="PURCHASE" />} />
        <Route path="/accounting/journal-entry" element={<JournalEntryPage />} />
        <Route path="/accounting/auto-journals" element={<AutoJournalListPage />} />
        <Route path="/accounting/balance-adjust" element={<BalanceAdjustPage />} />
        <Route path="/accounting/balance-audits" element={<BalanceAdjustListPage audit />} />
        <Route path="/accounting/balance-adjustments" element={<BalanceAdjustListPage />} />
        <Route path="/accounting/balance-adjust-status" element={<BalanceAdjustStatusPage />} />
        <Route path="/accounting/sales-slip" element={<VatSlipPage sales />} />
        <Route path="/accounting/purchase-slip" element={<VatSlipPage sales={false} />} />
        <Route path="/accounting/bank-cards" element={<BankCardPage />} />
        {/* 원본 회계 I › 계좌/카드 네 화면(C001137 · E010206 · E010215 · E010207) */}
        <Route path="/accounting/bank-txns" element={<LinkedTxnListPage key="bank" kind="bank" />} />
        <Route path="/accounting/card-purchases" element={<LinkedTxnListPage key="cardBuy" kind="cardBuy" />} />
        <Route path="/accounting/card-sales" element={<LinkedTxnListPage key="cardSale" kind="cardSale" />} />
        <Route path="/accounting/pg-sales" element={<LinkedTxnListPage key="pg" kind="pg" />} />
        <Route path="/accounting/cards" element={<CardListPage />} />
        <Route path="/accounting/bank-accounts" element={<BankAccountListPage />} />
        <Route path="/accounting/fixed-assets" element={<FixedAssetPage />} />
        <Route path="/accounting/fixed-asset-ledger" element={<FixedAssetLedgerPage />} />
        <Route path="/accounting/fixed-asset-in" element={<FixedAssetFlowPage flow="증가" />} />
        <Route path="/accounting/fixed-asset-out" element={<FixedAssetFlowPage flow="감소" />} />
        <Route path="/accounting/fixed-asset-stock" element={<FixedAssetStockPage />} />
        <Route path="/accounting/fixed-asset-movement" element={<FixedAssetMovementPage />} />
        <Route path="/accounting/fixed-asset-slips" element={<FixedAssetSlipListPage />} />
        <Route path="/accounting/cash-deposit" element={<CashTxnPage mode="deposit" />} />
        <Route path="/accounting/cash-withdraw" element={<CashTxnPage mode="withdraw" />} />
        {/* 원본 현금예금출금 › 영수증으로(E010402) — 출금계좌 · 계정 · 거래처명 · 금액 · 수수료 한 장. */}
        <Route path="/accounting/receipt-payment" element={<ReceiptPaymentPage />} />
        {/* 회계 I › 현금거래 한 장짜리 입력 열한 종 — features/cashquick/kinds.ts */}
        <Route path="/accounting/sales-collection" element={<CashQuickEntryPage key="SALES_COLLECTION" type="SALES_COLLECTION" />} />
        <Route path="/accounting/card-sales-collection" element={<CashQuickEntryPage key="CARD_SALES_COLLECTION" type="CARD_SALES_COLLECTION" />} />
        <Route path="/accounting/temp-deposit" element={<CashQuickEntryPage key="TEMP_DEPOSIT" type="TEMP_DEPOSIT" />} />
        <Route path="/accounting/bank-borrowing" element={<CashQuickEntryPage key="BANK_BORROWING" type="BANK_BORROWING" />} />
        <Route path="/accounting/other-deposit" element={<CashQuickEntryPage key="OTHER_DEPOSIT" type="OTHER_DEPOSIT" />} />
        <Route path="/accounting/purchase-payment" element={<CashQuickEntryPage key="PURCHASE_PAYMENT" type="PURCHASE_PAYMENT" />} />
        <Route path="/accounting/card-bill-payment" element={<CashQuickEntryPage key="CARD_BILL_PAYMENT" type="CARD_BILL_PAYMENT" />} />
        <Route path="/accounting/account-transfer" element={<CashQuickEntryPage key="ACCOUNT_TRANSFER" type="ACCOUNT_TRANSFER" />} />
        <Route path="/accounting/temp-withdraw" element={<CashQuickEntryPage key="TEMP_WITHDRAW" type="TEMP_WITHDRAW" />} />
        <Route path="/accounting/loan-repayment" element={<CashQuickEntryPage key="LOAN_REPAYMENT" type="LOAN_REPAYMENT" />} />
        <Route path="/accounting/other-withdraw" element={<CashQuickEntryPage key="OTHER_WITHDRAW" type="OTHER_WITHDRAW" />} />
        <Route path="/accounting/noncash-receipt" element={<CashQuickEntryPage key="RECEIPT_ONLY" type="RECEIPT_ONLY" />} />
        <Route path="/accounting/noncash-card" element={<CashQuickEntryPage key="CARD_SLIP" type="CARD_SLIP" />} />
        <Route path="/accounting/noncash-other" element={<CashQuickEntryPage key="NONCASH_OTHER" type="NONCASH_OTHER" />} />
        <Route path="/accounting/cash-details" element={<CashDetailPage />} />
        <Route path="/accounting/vouchers" element={<FastVoucherPage />} />
        <Route path="/accounting/non-cash" element={<NonCashPage />} />
        <Route path="/accounting/checks" element={<CheckPage />} />
        <Route path="/accounting/checks-deposit" element={<CheckDepositPage />} />
        <Route path="/accounting/checks-withdraw" element={<CheckDepositPage type="ISSUED" />} />
        <Route path="/accounting/checks-list" element={<CheckListPage type="RECEIVED" />} />
        <Route path="/accounting/checks-issued-list" element={<CheckListPage type="ISSUED" />} />
        <Route path="/accounting/checks-ledger" element={<CheckLedgerPage type="RECEIVED" />} />
        <Route path="/accounting/checks-issued-ledger" element={<CheckLedgerPage type="ISSUED" />} />
        <Route path="/accounting/checks-in" element={<CheckFlowPage type="RECEIVED" flow="증가" />} />
        <Route path="/accounting/checks-out" element={<CheckFlowPage type="RECEIVED" flow="감소" />} />
        <Route path="/accounting/checks-issued-in" element={<CheckFlowPage type="ISSUED" flow="증가" />} />
        <Route path="/accounting/checks-issued-out" element={<CheckFlowPage type="ISSUED" flow="감소" />} />
        {/* 회계 II 채권관리 · 채무관리 — 채권(채무)내역 보조장부(2026-10-12 원본 E060403 · E060404 · E060405 · E060406 실측) */}
        <Route path="/accounting/bonds/ar/decrease-entry" element={<BondDecreasePage side="RECEIVABLE" />} />
        <Route path="/accounting/bonds/ar" element={<BondListPage side="RECEIVABLE" />} />
        <Route path="/accounting/bonds/ar/ledger" element={<BondLedgerPage side="RECEIVABLE" />} />
        <Route path="/accounting/bonds/ar/increase" element={<BondFlowPage side="RECEIVABLE" direction="INCREASE" />} />
        <Route path="/accounting/bonds/ar/decrease" element={<BondFlowPage side="RECEIVABLE" direction="DECREASE" />} />
        <Route path="/accounting/bonds/ar/status" element={<BondStatusPage side="RECEIVABLE" />} />
        <Route path="/accounting/bonds/ar/partner-ledger" element={<BondPartnerLedgerPage side="RECEIVABLE" />} />
        <Route path="/accounting/bonds/ar/partner-summary" element={<BondPartnerLedgerPage side="RECEIVABLE" summary />} />
        <Route path="/accounting/bonds/ar/partner-ledger-print" element={<BondPartnerLedgerPrintPage side="RECEIVABLE" />} />
        <Route path="/accounting/bonds/ar/balance-analysis" element={<BondBalanceAnalysisPage side="RECEIVABLE" />} />
        <Route path="/accounting/bonds/ap/decrease-entry" element={<BondDecreasePage side="PAYABLE" />} />
        <Route path="/accounting/bonds/ap" element={<BondListPage side="PAYABLE" />} />
        <Route path="/accounting/bonds/ap/ledger" element={<BondLedgerPage side="PAYABLE" />} />
        <Route path="/accounting/bonds/ap/increase" element={<BondFlowPage side="PAYABLE" direction="INCREASE" />} />
        <Route path="/accounting/bonds/ap/decrease" element={<BondFlowPage side="PAYABLE" direction="DECREASE" />} />
        <Route path="/accounting/bonds/ap/status" element={<BondStatusPage side="PAYABLE" />} />
        <Route path="/accounting/bonds/ap/partner-ledger" element={<BondPartnerLedgerPage side="PAYABLE" />} />
        <Route path="/accounting/bonds/ap/partner-summary" element={<BondPartnerLedgerPage side="PAYABLE" summary />} />
        <Route path="/accounting/bonds/ap/partner-ledger-print" element={<BondPartnerLedgerPrintPage side="PAYABLE" />} />
        <Route path="/accounting/bonds/ap/balance-analysis" element={<BondBalanceAnalysisPage side="PAYABLE" />} />
        <Route path="/accounting/checks-held" element={<CheckHoldingPage type="RECEIVED" />} />
        <Route path="/accounting/checks-issued" element={<CheckHoldingPage type="ISSUED" />} />
        <Route path="/accounting/contracts" element={<ContractPage />} />
        <Route path="/accounting/contract-items" element={<ContractItemPage />} />
        <Route path="/accounting/billing-contracts/new" element={<BillingContractEntryPage />} />
        <Route path="/accounting/billing-contracts" element={<BillingContractListPage />} />
        <Route path="/accounting/contract-bills" element={<ContractBillPage />} />
        <Route path="/accounting/e-contracts" element={<EContractProgressPage />} />
        <Route path="/accounting/e-contracts/status" element={<EContractStatusPage />} />
        <Route path="/accounting/contract-price-change" element={<ContractPriceChangePage />} />
        <Route path="/accounting/contract-status" element={<ContractStatusReportPage />} />
        <Route path="/accounting/contract-unbilled" element={<ContractUnbilledPage />} />
        <Route path="/accounting/contract-bill-print" element={<ContractBillPrintPage />} />
        <Route path="/accounting/contract-reflect" element={<ContractReflectPage />} />
        <Route path="/accounting/contract-unreflected" element={<ContractUnreflectedPage />} />
        <Route path="/accounting/contract-invoices" element={<ContractInvoiceStatusPage />} />
        <Route path="/settings/currencies" element={<CurrencyPage />} />
        <Route path="/accounting/expense" element={<ExpensePage />} />
        <Route path="/accounting/expense-control-types" element={<ExpenseControlTypePage />} />
        <Route path="/accounting/expense-items" element={<ExpenseItemPage />} />
        <Route path="/accounting/expense-groups" element={<ExpenseGroupPage />} />
        <Route path="/accounting/expense-settle" element={<ExpenseSettlePage />} />
        <Route path="/accounting/income" element={<IncomePage />} />
        {/* 회계 II › 수입비용(輸入 — 미착품, 원본 E060201 ~ E060210). /accounting/income(收入 등록)은 메뉴에서만 뺐다 — 사용자 결정 대기 */}
        <Route path="/accounting/import-cost/lots" element={<ImportLotPage />} />
        <Route path="/accounting/import-cost/items" element={<ImportCostItemPage />} />
        <Route path="/accounting/import-cost/bill" element={<ImportCostEntryPage key="bill" kind="BILL_RECEIPT" />} />
        <Route path="/accounting/import-cost/tax-invoice" element={<ImportCostEntryPage key="tax" kind="TAX_INVOICE" />} />
        <Route path="/accounting/import-cost/receipt" element={<ImportCostEntryPage key="receipt" kind="GENERAL_RECEIPT" />} />
        <Route path="/accounting/import-cost/trade-payment" element={<ImportCostEntryPage key="trade" kind="TRADE_PAYMENT" />} />
        <Route path="/accounting/import-cost/broker-payment" element={<ImportCostEntryPage key="broker" kind="BROKER_PAYMENT" />} />
        <Route path="/accounting/import-cost/transfer" element={<ImportCostEntryPage key="transfer" kind="TRANSFER" />} />
        <Route path="/accounting/import-cost/vouchers" element={<ImportCostVoucherListPage />} />
        <Route path="/accounting/import-cost/ledger" element={<ImportCostLedgerPage />} />
        <Route path="/accounting/cost-build" element={<CostBuildPage />} />
        <Route path="/accounting/standard-cost" element={<StandardCostPage />} />
        <Route path="/accounting/actual-cost" element={<ActualCostPage />} />
        <Route path="/accounting/variance" element={<VariancePage />} />
        <Route path="/accounting/monthly-profit" element={<MonthlyProfitPage />} />
        <Route path="/accounting/daily-profit" element={<DailyProfitPage />} />
        <Route path="/accounting/expense-detail" element={<ExpenseDetailPage />} />
        <Route path="/accounting/expense-list" element={<ExpenseListPage />} />

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

        {/* 그룹웨어 */}
        <Route path="/groupware" element={<Navigate to="/groupware/approval/draft" replace />} />
        <Route path="/groupware/approval/draft" element={<ApprovalDraftPage />} />
        <Route path="/groupware/approval/my" element={<MyApprovalPage />} />
        <Route path="/groupware/approval/all" element={<ApprovalAllPage />} />
        <Route path="/groupware/approval/settings" element={<ApprovalSettingPage />} />
        <Route path="/groupware/drive" element={<EcDrivePage />} />
        <Route path="/groupware/ai-guide" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/kanban-sample" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/site-log" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/site-status" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/dev-log" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/dev-status" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/consult-board" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/visit-board" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/contract-board" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/as-board" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/car-info" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/car-doc" element={<WorkSampleBoardPage />} />
        <Route path="/groupware/car-run" element={<WorkSampleBoardPage />} />
        {/* 그룹웨어 › 다목적관리 — 다목적 전표 넷(plans/그룹웨어/E200276.md). 화면 하나가 주소로 게시판을 고른다. */}
        <Route path="/groupware/multi-input" element={<MultiSlipPage />} />
        <Route path="/groupware/sales-contract" element={<MultiSlipPage />} />
        <Route path="/groupware/bond-collect" element={<MultiSlipPage />} />
        <Route path="/groupware/monthly-attendance" element={<MultiSlipPage />} />
        <Route path="/groupware/anonymous-board" element={<AnonymousBoardPage />} />
        <Route path="/groupware/field-works" element={<FieldWorkPage />} />
        <Route path="/groupware/field-work-status" element={<FieldWorkStatusPage />} />
        <Route path="/groupware/work" element={<WorkPage />} />
        <Route path="/groupware/worklog" element={<WorkLogPage />} />
        <Route path="/groupware/attendance" element={<AttendancePage />} />
        <Route path="/groupware/attendance-status" element={<AttendanceIdStatusPage />} />
        <Route path="/groupware/attendance-late" element={<AttendanceIdLatePage />} />
        <Route path="/groupware/daily-hours" element={<AttendanceIdDailyHoursPage />} />
        <Route path="/groupware/work-integrated" element={<AttendanceIdIntegratedPage />} />
        <Route path="/groupware/crm" element={<CrmPage />} />
        <Route path="/groupware/cards" element={<BusinessCardPage />} />
        <Route path="/groupware/project" element={<ProjectPage />} />
        <Route path="/accounting/project-profit" element={<ProjectProfitPage />} />
        <Route path="/accounting/project-plan" element={<ProjectPlanPage />} />
        <Route path="/accounting/project-plan-status" element={<ProjectPlanStatusPage />} />
        <Route path="/accounting/card-issuers" element={<CardIssuerListPage />} />
        <Route path="/accounting/payment-agencies" element={<PaymentAgencyListPage />} />
        <Route path="/groupware/key-notice" element={<KeyNoticePage />} />
        <Route path="/groupware/mail" element={<MailPage />} />
        <Route path="/groupware/messages" element={<ShortMessagePage />} />
        <Route path="/groupware/org" element={<OrgChartPage />} />
        <Route path="/groupware/notice" element={<NoticePage />} />
        <Route path="/groupware/shared-board" element={<SharedBoardPage />} />
        <Route path="/groupware/minutes-board" element={<MinutesBoardPage />} />
        <Route path="/groupware/meeting-board" element={<MeetingBoardPage />} />
        <Route path="/groupware/sign-board" element={<SignBoardPage />} />
        <Route path="/groupware/project-kanban" element={<ProjectKanbanPage />} />
        <Route path="/groupware/schedule" element={<SchedulePage />} />
        <Route path="/groupware/survey" element={<SurveyPage />} />
        <Route path="/groupware/supplies" element={<SuppliesPage />} />
        <Route path="/groupware/dev-schedule" element={<SwSchedulePage />} />
        <Route path="/groupware/contacts" element={<EmployeeContactPage />} />
        <Route path="/groupware/org-status" element={<OrgStatusPage />} />
        <Route path="/groupware/org-tree" element={<OrgTreePage />} />
        <Route path="/groupware/construction-schedule" element={<ConstructionSchedulePage />} />
        <Route path="/groupware/survey-input" element={<SurveyInputPage />} />
        <Route path="/groupware/survey-status" element={<SurveyStatusPage />} />

        {/* 데이터센터 */}
        <Route path="/datacenter" element={<Navigate to="/datacenter/collect" replace />} />
        <Route path="/datacenter/collect" element={<DataCollectPage />} />
        <Route path="/datacenter/collect-sources" element={<CollectSourcePage />} />
        <Route path="/datacenter/export" element={<DataExportPage />} />

        {/* 관리(근태) */}
        <Route path="/hr" element={<Navigate to="/hr/attendance-input" replace />} />
        {/* 원본에서 '근태'는 연차·반차 같은 근태 기록이고, 출퇴근 시각은 [출/퇴근기록부(ID)] 가 맡는다. */}
        <Route path="/hr/leave-input" element={<LeaveInputPage />} />
        <Route path="/hr/leave-list" element={<LeaveListPage />} />
        <Route path="/hr/attendance-input" element={<AttendanceInputPage />} />
        <Route path="/hr/attendance-list" element={<AttendanceListPage />} />
        <Route path="/hr/attendance-status" element={<AttendanceStatusPage />} />
        <Route path="/hr/attendance-kind-status" element={<AttendanceKindStatusPage />} />
        <Route path="/hr/attendance-late" element={<LateArrivalPage />} />
        <Route path="/hr/daily-hours" element={<DailyWorkHoursPage />} />
        <Route path="/hr/work-integrated" element={<WorkIntegratedPage />} />
        <Route path="/hr/vacation-use" element={<VacationUsePage />} />
        <Route path="/hr/retired" element={<RetiredEmployeePage />} />
        <Route path="/hr/headcount" element={<HeadcountPage />} />
        <Route path="/hr/retired" element={<RetiredEmployeePage />} />
        <Route path="/hr/vacation-remain" element={<VacationRemainPage />} />
        <Route path="/hr/employees" element={<EmployeePage />} />
        <Route path="/hr/payroll" element={<PayLedgerPage />} />
        <Route path="/hr/payroll/ledger" element={<PayrollPage />} />
        <Route path="/hr/payroll/by-employee" element={<EmployeePayListPage />} />
        <Route path="/hr/payroll/status" element={<PayrollStatusPage />} />
        <Route path="/hr/payroll/work-confirms" element={<WorkConfirmStatusPage />} />
        <Route path="/hr/payroll/transfer-status" element={<PayTransferStatusPage />} />
        <Route path="/hr/insurance/acquire" element={<InsuranceAcquirePage />} />
        <Route path="/hr/insurance/loss" element={<InsuranceLossPage />} />
        <Route path="/hr/insurance/dependent" element={<InsuranceDependentPage />} />
        <Route path="/hr/insurance/reports" element={<InsuranceReportListPage />} />
        <Route path="/hr/cards" element={<HrCardPage />} />
        <Route path="/hr/performance" element={<EmployeePerformancePage />} />
        <Route path="/hr/pay-settings" element={<PaySettingPage />} />
        <Route path="/hr/allowance-items" element={<PayItemListPage kind="ALLOWANCE" />} />
        <Route path="/hr/deduction-items" element={<PayItemListPage kind="DEDUCTION" />} />
        <Route path="/hr/pay-groups" element={<PayGroupListPage />} />
        <Route path="/hr/departments" element={<DepartmentListPage />} />
        <Route path="/inventory/projects" element={<ProjectListPage />} />
        <Route path="/hr/work-input" element={<WorkInputPage />} />
        <Route path="/hr/work-list" element={<WorkListPage />} />
        <Route path="/hr/records" element={<HrRecordPage />} />
        <Route path="/hr/assignments" element={<AssignmentListPage />} />
        <Route path="/hr/assignments/input" element={<AssignmentInputPage />} />
        <Route path="/hr/assignments/status" element={<AssignmentStatusPage />} />
        <Route path="/hr/certificates" element={<CertificatePage />} />
        <Route path="/hr/attendance-kinds" element={<AttendanceKindListPage />} />
        <Route path="/hr/vacation-kinds" element={<VacationKindListPage />} />
        <Route path="/hr/vacation-grants" element={<VacationGrantPage />} />
        <Route path="/hr/commute-rules" element={<CommuteRuleListPage />} />
        <Route path="/hr/employee-commutes" element={<EmployeeCommutePage />} />
        <Route path="/hr/employee-commutes/status" element={<EmployeeCommuteStatusPage />} />
        <Route path="/hr/employee-commutes/late" element={<EmployeeLatePage />} />
        <Route path="/hr/employee-commutes/attendance" element={<EmployeeCommuteAttendancePage />} />
        <Route path="/hr/contracts/status" element={<ContractStatusPage />} />
        <Route path="/hr/daily-workers" element={<DailyWorkerListPage />} />
        <Route path="/hr/daily-allowance-items" element={<DailyPayItemListPage kind="ALLOWANCE" />} />
        <Route path="/hr/daily-deduction-items" element={<DailyPayItemListPage kind="DEDUCTION" />} />
        <Route path="/hr/daily-work-input" element={<DailyWorkInputPage />} />
        <Route path="/hr/daily-work-list" element={<DailyWorkListPage />} />
        <Route path="/hr/daily-work-status" element={<DailyWorkStatusPage />} />
        <Route path="/hr/daily-payroll" element={<DailyPayLedgerPage />} />
        <Route path="/hr/daily-payroll/by-worker" element={<DailyPayByWorkerPage />} />
        <Route path="/hr/daily-payroll/status" element={<DailyPayStatusPage />} />
        <Route path="/hr/daily-payroll/work-confirms" element={<DailyWorkConfirmStatusPage />} />
        <Route path="/hr/daily-payroll/transfer-status" element={<DailyPayTransferPage />} />
        <Route path="/hr/contracts" element={<LaborContractPage />} />
        <Route path="/hr/daily-wage" element={<DailyWagePage />} />

        <Route path="/users" element={<UsersPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

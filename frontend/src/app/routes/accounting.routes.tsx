import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
const ProfitSummaryPage = lazy(() => import('../../pages/accounting/summary/ProfitSummaryPage'))
const ItemCostPage = lazy(() => import('../../pages/accounting/cost/ItemCostPage'))
const VatSummaryPage = lazy(() => import('../../pages/accounting/vat/VatSummaryPage'))
const WithholdingPage = lazy(() => import('../../pages/accounting/withholding/WithholdingPage'))
const WithholdingConfirmPage = lazy(() => import('../../pages/accounting/withholding/WithholdingConfirmPage'))
const WithholdingPdfPage = lazy(() => import('../../pages/accounting/withholding/WithholdingPdfPage'))
const SimplePaymentPage = lazy(() => import('../../pages/accounting/withholding/SimplePaymentPage'))
const PaymentStatementFilePage = lazy(() => import('../../pages/accounting/withholding/PaymentStatementFilePage'))
const IncomeSubmissionPage = lazy(() => import('../../pages/accounting/withholding/IncomeSubmissionPage'))
const DailyPaymentStatementPage = lazy(() => import('../../pages/accounting/withholding/DailyPaymentStatementPage'))
const DailyReceiptPage = lazy(() => import('../../pages/accounting/withholding/DailyReceiptPage'))
const RetirementEstimatePage = lazy(() => import('../../pages/accounting/withholding/RetirementEstimatePage'))
const WithholdingComparisonPage = lazy(() => import('../../pages/accounting/withholding/WithholdingComparisonPage'))
const YearEndReviewPage = lazy(() => import('../../pages/accounting/yearend/YearEndReviewPage'))
const WithholdingLedgerPage = lazy(() => import('../../pages/accounting/withholding/WithholdingLedgerPage'))
const IncomeTaxCertPage = lazy(() => import('../../pages/accounting/withholding/IncomeTaxCertPage'))
const RetirementPayPage = lazy(() => import('../../pages/accounting/withholding/RetirementPayPage'))
const YearEndSettlementPage = lazy(() => import('../../pages/accounting/yearend/YearEndSettlementPage'))
const MidTermPdfPage = lazy(() => import('../../pages/accounting/yearend/MidTermPdfPage'))
const OtherWithholdingPage = lazy(() => import('../../pages/accounting/otherwithholding/OtherWithholdingPage'))
const WithholdingPayeePage = lazy(() => import('../../pages/accounting/otherwithholding/WithholdingPayeePage'))
const OtherWithholdingInputPage = lazy(() => import('../../pages/accounting/otherwithholding/OtherWithholdingInputPage'))
const OtherWithholdingStatusPage = lazy(() => import('../../pages/accounting/otherwithholding/OtherWithholdingStatusPage'))
const OtherWithholdingReceiptPage = lazy(() => import('../../pages/accounting/otherwithholding/OtherWithholdingReceiptPage'))
const OtherWithholdingStatementPage = lazy(() => import('../../pages/accounting/otherwithholding/OtherWithholdingStatementPage'))
const CorporateTaxPage = lazy(() => import('../../pages/accounting/corporatetax/CorporateTaxPage'))
const CorporateTaxChecklistPage = lazy(() => import('../../pages/accounting/corporatetax/CorporateTaxChecklistPage'))
const ExpenseEvidenceStatusPage = lazy(() => import('../../pages/accounting/evidence/ExpenseEvidenceStatusPage'))
const PromissoryNotePage = lazy(() => import('../../pages/accounting/promissorynote/PromissoryNotePage'))
const NoteHoldingPage = lazy(() => import('../../pages/accounting/promissorynote/NoteHoldingPage'))
const NoteFlowPage = lazy(() => import('../../pages/accounting/promissorynote/NoteFlowPage'))
const NoteLedgerPage = lazy(() => import('../../pages/accounting/promissorynote/NoteLedgerPage'))
const NoteListPage = lazy(() => import('../../pages/accounting/promissorynote/NoteListPage'))
const NoteEntryPage = lazy(() => import('../../pages/accounting/promissorynote/NoteEntryPage'))
const NoteBatchDecreasePage = lazy(() => import('../../pages/accounting/promissorynote/NoteBatchDecreasePage'))
const BudgetPage = lazy(() => import('../../pages/accounting/budget/BudgetPage'))
const BudgetReportPage = lazy(() => import('../../pages/accounting/budget/BudgetReportPage'))
const CashPlanPage = lazy(() => import('../../pages/accounting/cash/CashPlanPage'))
const FundPlanListPage = lazy(() => import('../../pages/accounting/fundplan/FundPlanListPage'))
const FundPlanStatusPage = lazy(() => import('../../pages/accounting/fundplan/FundPlanStatusPage'))
const FundForecastPage = lazy(() => import('../../pages/accounting/fundplan/FundForecastPage'))
const AccountsPage = lazy(() => import('../../pages/accounting/account/AccountsPage'))
const JournalListPage = lazy(() => import('../../pages/accounting/journal/JournalListPage'))
const AccountLedgerPage = lazy(() => import('../../pages/accounting/ledger/AccountLedgerPage'))
const CashBookPage = lazy(() => import('../../pages/accounting/ledger/CashBookPage'))
const JournalBookPage = lazy(() => import('../../pages/accounting/journal/JournalBookPage'))
const ForeignLedgerPage = lazy(() => import('../../pages/accounting/ledger/ForeignLedgerPage'))
const JournalPrintPage = lazy(() => import('../../pages/accounting/journal/JournalPrintPage'))
const VoucherPrintListPage = lazy(() => import('../../pages/accounting/fastvoucher/VoucherPrintListPage'))
const DayMonthSheetPage = lazy(() => import('../../pages/accounting/ledger/DayMonthSheetPage'))
const AccountPartnerLedgerPage = lazy(() => import('../../pages/accounting/ledger/AccountPartnerLedgerPage'))
const PartnerAccountLedgerPage = lazy(() => import('../../pages/accounting/ledger/PartnerAccountLedgerPage'))
const PartnerBookPage = lazy(() => import('../../pages/accounting/ledger/PartnerBookPage'))
const AccountRemarkLedgerPage = lazy(() => import('../../pages/accounting/ledger/AccountRemarkLedgerPage'))
const AccountFlowPage = lazy(() => import('../../pages/accounting/ledger/AccountFlowPage'))
const VatBookPage = lazy(() => import('../../pages/accounting/vat/VatBookPage'))
const PartnerTxListPage = lazy(() => import('../../pages/accounting/ledger/PartnerTxListPage'))
const CostStatementPage = lazy(() => import('../../pages/accounting/statementsheet/CostStatementPage'))
const AccountDetailPage = lazy(() => import('../../pages/accounting/ledger/AccountDetailPage'))
const JournalStatusPage = lazy(() => import('../../pages/accounting/journal/JournalStatusPage'))
const TaxInvoiceJournalPage = lazy(() => import('../../pages/accounting/vat/TaxInvoiceJournalPage'))
const TaxInvoiceListPage = lazy(() => import('../../pages/accounting/vat/TaxInvoiceListPage'))
const VatMarkChangePage = lazy(() => import('../../pages/accounting/vat/VatMarkChangePage'))
const TaxVoucherPage = lazy(() => import('../../pages/accounting/vat/TaxVoucherPage'))
const SalesTaxSummaryPage = lazy(() => import('../../pages/accounting/vat/SalesTaxSummaryPage'))
const VatChecklistPage = lazy(() => import('../../pages/accounting/vat/VatChecklistPage'))
const JournalVatComparePage = lazy(() => import('../../pages/accounting/vat/JournalVatComparePage'))
const BizCardComparePage = lazy(() => import('../../pages/accounting/vat/BizCardComparePage'))
const HometaxComparePage = lazy(() => import('../../pages/accounting/vat/HometaxComparePage'))
const VatReturnPage = lazy(() => import('../../pages/accounting/vat/VatReturnPage'))
const VatReturnPdfPage = lazy(() => import('../../pages/accounting/vat/VatReturnPdfPage'))
const VatMediaFilePage = lazy(() => import('../../pages/accounting/vat/VatMediaFilePage'))
const TaxCertificatePage = lazy(() => import('../../pages/accounting/vat/TaxCertificatePage'))
const JournalHistoryPage = lazy(() => import('../../pages/accounting/journal/JournalHistoryPage'))
const TransferListPage = lazy(() => import('../../pages/accounting/journal/TransferListPage'))
const AccountingVsStockPage = lazy(() => import('../../pages/accounting/ledger/AccountingVsStockPage'))
const BalanceRecalcPage = lazy(() => import('../../pages/accounting/journal/BalanceRecalcPage'))
const FundDailyPage = lazy(() => import('../../pages/accounting/cash/FundDailyPage'))
const CashFlowListPage = lazy(() => import('../../pages/accounting/ledger/CashFlowListPage'))
const FundStatusPage = lazy(() => import('../../pages/accounting/cash/FundStatusPage'))
const MonthlyPnlPage = lazy(() => import('../../pages/accounting/statementsheet/MonthlyPnlPage'))
const MonthlyCostPage = lazy(() => import('../../pages/accounting/statementsheet/MonthlyCostPage'))
const ArApAgingPage = lazy(() => import('../../pages/accounting/ledger/ArApAgingPage'))
const ArApBalancePage = lazy(() => import('../../pages/accounting/ledger/ArApBalancePage'))
const ManagementSummaryPage = lazy(() => import('../../pages/accounting/summary/ManagementSummaryPage'))
const AccountAggregatePage = lazy(() => import('../../pages/accounting/ledger/AccountAggregatePage'))
const MonthlyVatSummaryPage = lazy(() => import('../../pages/accounting/vat/MonthlyVatSummaryPage'))
const ExpenseSlipSummaryPage = lazy(() => import('../../pages/accounting/fastvoucher/ExpenseSlipSummaryPage'))
const TrialBalancePage = lazy(() => import('../../pages/accounting/statementsheet/TrialBalancePage'))
const BalanceSheetPage = lazy(() => import('../../pages/accounting/statementsheet/BalanceSheetPage'))
const IncomeStatementPage = lazy(() => import('../../pages/accounting/statementsheet/IncomeStatementPage'))
const CashFlowStatementPage = lazy(() => import('../../pages/accounting/statementsheet/CashFlowStatementPage'))
const RetainedEarningsStatementPage = lazy(() => import('../../pages/accounting/statementsheet/RetainedEarningsStatementPage'))
const IncomeExpenseStatementPage = lazy(() => import('../../pages/accounting/statementsheet/IncomeExpenseStatementPage'))
const TaxInvoicePage = lazy(() => import('../../pages/accounting/vat/TaxInvoicePage'))
const JournalEntryPage = lazy(() => import('../../pages/accounting/journal/JournalEntryPage'))
const AutoJournalListPage = lazy(() => import('../../pages/accounting/journal/AutoJournalListPage'))
const BalanceAdjustPage = lazy(() => import('../../pages/accounting/balanceadjust/BalanceAdjustPage'))
const BalanceAdjustListPage = lazy(() => import('../../pages/accounting/balanceadjust/BalanceAdjustListPage'))
const BalanceAdjustStatusPage = lazy(() => import('../../pages/accounting/balanceadjust/BalanceAdjustStatusPage'))
const VatSlipPage = lazy(() => import('../../pages/accounting/vat/VatSlipPage'))
const CashTxnPage = lazy(() => import('../../pages/accounting/cash/CashTxnPage'))
const CashDetailPage = lazy(() => import('../../pages/accounting/cash/CashDetailPage'))
const BankCardPage = lazy(() => import('../../pages/accounting/bankcard/BankCardPage'))
const LinkedTxnListPage = lazy(() => import('../../pages/accounting/bankcard/LinkedTxnListPage'))
const CardListPage = lazy(() => import('../../pages/accounting/bankcard/CardListPage'))
const BankAccountListPage = lazy(() => import('../../pages/accounting/bankcard/BankAccountListPage'))
const FixedAssetPage = lazy(() => import('../../pages/accounting/fixedasset/FixedAssetPage'))
const FixedAssetLedgerPage = lazy(() => import('../../pages/accounting/fixedasset/FixedAssetLedgerPage'))
const FixedAssetFlowPage = lazy(() => import('../../pages/accounting/fixedasset/FixedAssetFlowPage'))
const FixedAssetStockPage = lazy(() => import('../../pages/accounting/fixedasset/FixedAssetStockPage'))
const FixedAssetMovementPage = lazy(() => import('../../pages/accounting/fixedasset/FixedAssetMovementPage'))
const FixedAssetSlipListPage = lazy(() => import('../../pages/accounting/fixedasset/FixedAssetSlipListPage'))
const DepreciationCalcPage = lazy(() => import('../../pages/accounting/fixedasset/DepreciationCalcPage'))
const FastVoucherPage = lazy(() => import('../../pages/accounting/fastvoucher/FastVoucherPage'))
const ReceiptPaymentPage = lazy(() => import('../../pages/accounting/fastvoucher/ReceiptPaymentPage'))
const CashQuickEntryPage = lazy(() => import('../../pages/accounting/fastvoucher/CashQuickEntryPage'))
const NonCashPage = lazy(() => import('../../pages/accounting/noncash/NonCashPage'))
const CheckPage = lazy(() => import('../../pages/accounting/bankcheck/CheckPage'))
const CheckHoldingPage = lazy(() => import('../../pages/accounting/bankcheck/CheckHoldingPage'))
const CheckFlowPage = lazy(() => import('../../pages/accounting/bankcheck/CheckFlowPage'))
const CheckLedgerPage = lazy(() => import('../../pages/accounting/bankcheck/CheckLedgerPage'))
const CheckListPage = lazy(() => import('../../pages/accounting/bankcheck/CheckListPage'))
const CheckDepositPage = lazy(() => import('../../pages/accounting/bankcheck/CheckDepositPage'))
const BondListPage = lazy(() => import('../../pages/accounting/bond/BondListPage'))
const BondLedgerPage = lazy(() => import('../../pages/accounting/bond/BondLedgerPage'))
const BondFlowPage = lazy(() => import('../../pages/accounting/bond/BondFlowPage'))
const BondStatusPage = lazy(() => import('../../pages/accounting/bond/BondStatusPage'))
const BondPartnerLedgerPage = lazy(() => import('../../pages/accounting/bond/BondPartnerLedgerPage'))
const BondPartnerLedgerPrintPage = lazy(() => import('../../pages/accounting/bond/BondPartnerLedgerPrintPage'))
const BondDecreasePage = lazy(() => import('../../pages/accounting/bond/BondDecreasePage'))
const BondBalanceAnalysisPage = lazy(() => import('../../pages/accounting/bond/BondBalanceAnalysisPage'))
const ContractPage = lazy(() => import('../../pages/accounting/econtract/ContractPage'))
const EContractProgressPage = lazy(() => import('../../pages/accounting/econtract/EContractProgressPage'))
const EContractStatusPage = lazy(() => import('../../pages/accounting/econtract/EContractStatusPage'))
const ContractItemPage = lazy(() => import('../../pages/accounting/contractitem/ContractItemPage'))
const BillingContractEntryPage = lazy(() => import('../../pages/accounting/billingcontract/BillingContractEntryPage'))
const BillingContractListPage = lazy(() => import('../../pages/accounting/billingcontract/BillingContractListPage'))
const ContractBillPage = lazy(() => import('../../pages/accounting/contractbill/ContractBillPage'))
const ContractPriceChangePage = lazy(() => import('../../pages/accounting/billingcontract/ContractPriceChangePage'))
const ContractStatusReportPage = lazy(() => import('../../pages/accounting/billingcontract/ContractStatusReportPage'))
const ContractUnbilledPage = lazy(() => import('../../pages/accounting/contractbill/ContractUnbilledPage'))
const ContractBillPrintPage = lazy(() => import('../../pages/accounting/contractbill/ContractBillPrintPage'))
const ContractReflectPage = lazy(() => import('../../pages/accounting/contractbill/ContractReflectPage'))
const ContractUnreflectedPage = lazy(() => import('../../pages/accounting/contractbill/ContractUnreflectedPage'))
const ContractInvoiceStatusPage = lazy(() => import('../../pages/accounting/contractbill/ContractInvoiceStatusPage'))
const CurrencyPage = lazy(() => import('../../pages/settings/commoncode/CurrencyPage'))
const ExpensePage = lazy(() => import('../../pages/accounting/expense/ExpensePage'))
const IncomePage = lazy(() => import('../../pages/accounting/income/IncomePage'))
const ImportLotPage = lazy(() => import('../../pages/accounting/importcost/ImportLotPage'))
const ImportCostItemPage = lazy(() => import('../../pages/accounting/importcost/ImportCostItemPage'))
const ExtraFieldTypePage = lazy(() => import('../../pages/accounting/account/ExtraFieldTypePage'))
const CodeChangePage = lazy(() => import('../../pages/accounting/journal/CodeChangePage'))
const ExpenseControlTypePage = lazy(() => import('../../pages/accounting/expense/ExpenseControlTypePage'))
const ExpenseItemPage = lazy(() => import('../../pages/accounting/expense/ExpenseItemPage'))
const ExpenseBulkPage = lazy(() => import('../../pages/accounting/expense/ExpenseBulkPage'))
const ExpenseGroupPage = lazy(() => import('../../pages/accounting/expense/ExpenseGroupPage'))
const ExpenseSettlePage = lazy(() => import('../../pages/accounting/expense/ExpenseSettlePage'))
const ImportCostEntryPage = lazy(() => import('../../pages/accounting/importcost/ImportCostEntryPage'))
const ImportCostVoucherListPage = lazy(() => import('../../pages/accounting/importcost/ImportCostVoucherListPage'))
const ImportCostLedgerPage = lazy(() => import('../../pages/accounting/importcost/ImportCostLedgerPage'))
const CostBuildPage = lazy(() => import('../../pages/accounting/cost/CostBuildPage'))
const StandardCostPage = lazy(() => import('../../pages/accounting/cost/StandardCostPage'))
const ActualCostPage = lazy(() => import('../../pages/accounting/cost/ActualCostPage'))
const VariancePage = lazy(() => import('../../pages/accounting/cost/VariancePage'))
const MonthlyProfitPage = lazy(() => import('../../pages/accounting/summary/MonthlyProfitPage'))
const DailyProfitPage = lazy(() => import('../../pages/accounting/summary/DailyProfitPage'))
const EvidenceCenterPage = lazy(() => import('../../pages/accounting/evidence/EvidenceCenterPage'))
const MedicalDeviceReportPage = lazy(() => import('../../pages/datacenter/MedicalDeviceReportPage'))
const ExpenseDetailPage = lazy(() => import('../../pages/accounting/expense/ExpenseDetailPage'))
const ExpenseListPage = lazy(() => import('../../pages/accounting/expense/ExpenseListPage'))

/** 회계 라우트 — app/router.tsx 가 원래 자리(차례)에 그대로 붙인다. */
export const accountingRoutes = (
  <>
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
    <Route path="/accounting/notes-pay-increase" element={<NoteEntryPage key="pay-increase" mode="pay-increase" />} />
    <Route path="/accounting/notes-pay-decrease" element={<NoteEntryPage key="pay-decrease" mode="pay-decrease" />} />
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
    <Route path="/accounting/foreign-ledger" element={<ForeignLedgerPage />} />
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
    <Route path="/accounting/cash-flow-statement" element={<CashFlowStatementPage />} />
    <Route path="/accounting/retained-earnings-statement" element={<RetainedEarningsStatementPage />} />
    <Route path="/accounting/income-expense-statement" element={<IncomeExpenseStatementPage />} />
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
    <Route path="/accounting/depreciation-calc" element={<DepreciationCalcPage />} />
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
    <Route path="/accounting/e-contracts" element={<EContractProgressPage />} />
    <Route path="/accounting/e-contracts/status" element={<EContractStatusPage />} />
    <Route path="/accounting/contract-items" element={<ContractItemPage />} />
    <Route path="/accounting/billing-contracts/new" element={<BillingContractEntryPage />} />
    <Route path="/accounting/billing-contracts" element={<BillingContractListPage />} />
    <Route path="/accounting/contract-bills" element={<ContractBillPage />} />
    <Route path="/accounting/contract-price-change" element={<ContractPriceChangePage />} />
    <Route path="/accounting/contract-status" element={<ContractStatusReportPage />} />
    <Route path="/accounting/contract-unbilled" element={<ContractUnbilledPage />} />
    <Route path="/accounting/contract-bill-print" element={<ContractBillPrintPage />} />
    <Route path="/accounting/contract-reflect" element={<ContractReflectPage />} />
    <Route path="/accounting/contract-unreflected" element={<ContractUnreflectedPage />} />
    <Route path="/accounting/contract-invoices" element={<ContractInvoiceStatusPage />} />
    <Route path="/settings/currencies" element={<CurrencyPage />} />
    <Route path="/accounting/expense" element={<ExpensePage />} />
    <Route path="/accounting/extra-field-types" element={<ExtraFieldTypePage />} />
    <Route path="/accounting/code-change" element={<CodeChangePage />} />
    <Route path="/accounting/expense-control-types" element={<ExpenseControlTypePage />} />
    <Route path="/accounting/expense-items" element={<ExpenseItemPage />} />
    <Route path="/accounting/expense-bulk" element={<ExpenseBulkPage />} />
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
  </>
)

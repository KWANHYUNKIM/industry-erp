import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
const AttendanceInputPage = lazy(() => import('../../pages/hr/AttendanceInputPage'))
const LeaveInputPage = lazy(() => import('../../pages/hr/LeaveInputPage'))
const LeaveListPage = lazy(() => import('../../pages/hr/LeaveListPage'))
const AttendanceListPage = lazy(() => import('../../pages/hr/AttendanceListPage'))
const AttendanceStatusPage = lazy(() => import('../../pages/hr/AttendanceStatusPage'))
const AttendanceKindStatusPage = lazy(() => import('../../pages/hr/AttendanceKindStatusPage'))
const LateArrivalPage = lazy(() => import('../../pages/hr/LateArrivalPage'))
const DailyWorkHoursPage = lazy(() => import('../../pages/hr/DailyWorkHoursPage'))
const WorkIntegratedPage = lazy(() => import('../../pages/hr/WorkIntegratedPage'))
const VacationUsePage = lazy(() => import('../../pages/hr/VacationUsePage'))
const VacationRemainPage = lazy(() => import('../../pages/hr/VacationRemainPage'))
const RetiredEmployeePage = lazy(() => import('../../pages/hr/RetiredEmployeePage'))
const HeadcountPage = lazy(() => import('../../pages/hr/HeadcountPage'))
const EmployeePage = lazy(() => import('../../pages/hr/EmployeePage'))
const PayrollPage = lazy(() => import('../../pages/hr/PayrollPage'))
const EmployeePerformancePage = lazy(() => import('../../pages/hr/EmployeePerformancePage'))
const PaySettingPage = lazy(() => import('../../pages/hr/PaySettingPage'))
const PayItemListPage = lazy(() => import('../../pages/hr/PayItemListPage'))
const PayGroupListPage = lazy(() => import('../../pages/hr/PayGroupListPage'))
const DepartmentListPage = lazy(() => import('../../pages/hr/DepartmentListPage'))
const ProjectListPage = lazy(() => import('../../pages/inventory/ProjectListPage'))
const SalesRepPage = lazy(() => import('../../pages/inventory/SalesRepPage'))
const WorkInputPage = lazy(() => import('../../pages/hr/WorkInputPage'))
const WorkListPage = lazy(() => import('../../pages/hr/WorkListPage'))
const PayLedgerPage = lazy(() => import('../../pages/hr/PayLedgerPage'))
const EmployeePayListPage = lazy(() => import('../../pages/hr/EmployeePayListPage'))
const PayrollStatusPage = lazy(() => import('../../pages/hr/PayrollStatusPage'))
const WorkConfirmStatusPage = lazy(() => import('../../pages/hr/WorkConfirmStatusPage'))
const PayTransferStatusPage = lazy(() => import('../../pages/hr/PayTransferStatusPage'))
const InsuranceAcquirePage = lazy(() => import('../../pages/hr/InsuranceAcquirePage'))
const InsuranceLossPage = lazy(() => import('../../pages/hr/InsuranceLossPage'))
const InsuranceDependentPage = lazy(() => import('../../pages/hr/InsuranceDependentPage'))
const InsuranceReportListPage = lazy(() => import('../../pages/hr/InsuranceReportListPage'))
const HrCardPage = lazy(() => import('../../pages/hr/HrCardPage'))
const HrRecordPage = lazy(() => import('../../pages/hr/HrRecordPage'))
const AssignmentListPage = lazy(() => import('../../pages/hr/AssignmentListPage'))
const AssignmentInputPage = lazy(() => import('../../pages/hr/AssignmentInputPage'))
const AssignmentStatusPage = lazy(() => import('../../pages/hr/AssignmentStatusPage'))
const CertificatePage = lazy(() => import('../../pages/hr/CertificatePage'))
const AttendanceKindListPage = lazy(() => import('../../pages/hr/AttendanceKindListPage'))
const VacationKindListPage = lazy(() => import('../../pages/hr/VacationKindListPage'))
const VacationGrantPage = lazy(() => import('../../pages/hr/VacationGrantPage'))
const CommuteRuleListPage = lazy(() => import('../../pages/hr/CommuteRuleListPage'))
const EmployeeCommutePage = lazy(() => import('../../pages/hr/EmployeeCommutePage'))
const EmployeeCommuteStatusPage = lazy(() => import('../../pages/hr/EmployeeCommuteStatusPage'))
const EmployeeLatePage = lazy(() => import('../../pages/hr/EmployeeLatePage'))
const EmployeeCommuteAttendancePage = lazy(() => import('../../pages/hr/EmployeeCommuteAttendancePage'))
const ContractStatusPage = lazy(() => import('../../pages/hr/ContractStatusPage'))
const DailyWorkerListPage = lazy(() => import('../../pages/hr/DailyWorkerListPage'))
const DailyPayItemListPage = lazy(() => import('../../pages/hr/DailyPayItemListPage'))
const DailyWorkInputPage = lazy(() => import('../../pages/hr/DailyWorkInputPage'))
const DailyWorkListPage = lazy(() => import('../../pages/hr/DailyWorkListPage'))
const DailyWorkStatusPage = lazy(() => import('../../pages/hr/DailyWorkStatusPage'))
const DailyPayLedgerPage = lazy(() => import('../../pages/hr/DailyPayLedgerPage'))
const DailyPayByWorkerPage = lazy(() => import('../../pages/hr/DailyPayByWorkerPage'))
const DailyPayStatusPage = lazy(() => import('../../pages/hr/DailyPayStatusPage'))
const DailyWorkConfirmStatusPage = lazy(() => import('../../pages/hr/DailyWorkConfirmStatusPage'))
const DailyPayTransferPage = lazy(() => import('../../pages/hr/DailyPayTransferPage'))
const LaborContractPage = lazy(() => import('../../pages/hr/ContractPage'))
const DailyWagePage = lazy(() => import('../../pages/hr/DailyWagePage'))

/** 관리(근태 · 인사 · 급여) 라우트 — app/router.tsx 가 원래 자리(차례)에 그대로 붙인다. */
export const hrRoutes = (
  <>
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
    <Route path="/inventory/sales-reps" element={<SalesRepPage />} />
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
  </>
)

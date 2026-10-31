import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
const ApprovalDraftPage = lazy(() => import('../../pages/groupware/approval/ApprovalDraftPage'))
const MyApprovalPage = lazy(() => import('../../pages/groupware/approval/MyApprovalPage'))
const ApprovalAllPage = lazy(() => import('../../pages/groupware/approval/ApprovalAllPage'))
const ApprovalSettingPage = lazy(() => import('../../pages/groupware/approval/ApprovalSettingPage'))
const EcDrivePage = lazy(() => import('../../pages/groupware/drive/EcDrivePage'))
const WorkSampleBoardPage = lazy(() => import('../../pages/groupware/workpost/WorkSampleBoardPage'))
const MultiSlipPage = lazy(() => import('../../pages/groupware/multislip/MultiSlipPage'))
const AnonymousBoardPage = lazy(() => import('../../pages/groupware/workpost/AnonymousBoardPage'))
const FieldWorkPage = lazy(() => import('../../pages/groupware/fieldwork/FieldWorkPage'))
const FieldWorkStatusPage = lazy(() => import('../../pages/groupware/fieldwork/FieldWorkStatusPage'))
const WorkPage = lazy(() => import('../../pages/groupware/workpost/WorkPage'))
const WorkLogPage = lazy(() => import('../../pages/groupware/workjournal/WorkLogPage'))
const AttendancePage = lazy(() => import('../../pages/groupware/attendance/AttendancePage'))
const AttendanceIdStatusPage = lazy(() => import('../../pages/groupware/attendance/AttendanceIdStatusPage'))
const AttendanceIdLatePage = lazy(() => import('../../pages/groupware/attendance/AttendanceIdLatePage'))
const AttendanceIdDailyHoursPage = lazy(() => import('../../pages/groupware/attendance/AttendanceIdDailyHoursPage'))
const AttendanceIdIntegratedPage = lazy(() => import('../../pages/groupware/attendance/AttendanceIdIntegratedPage'))
const CrmPage = lazy(() => import('../../pages/groupware/crm/CrmPage'))
const BusinessCardPage = lazy(() => import('../../pages/groupware/org/BusinessCardPage'))
const ProjectPage = lazy(() => import('../../pages/groupware/project/ProjectPage'))
const ProjectProfitPage = lazy(() => import('../../pages/accounting/project/ProjectProfitPage'))
const ProjectPlanPage = lazy(() => import('../../pages/accounting/project/ProjectPlanPage'))
const ProjectPlanStatusPage = lazy(() => import('../../pages/accounting/project/ProjectPlanStatusPage'))
const CardIssuerListPage = lazy(() => import('../../pages/accounting/bankcard/CardIssuerListPage'))
const PaymentAgencyListPage = lazy(() => import('../../pages/accounting/bankcard/PaymentAgencyListPage'))
const KeyNoticePage = lazy(() => import('../../pages/groupware/workpost/KeyNoticePage'))
const MailPage = lazy(() => import('../../pages/groupware/mail/MailPage'))
const ShortMessagePage = lazy(() => import('../../pages/groupware/mail/ShortMessagePage'))
const OrgChartPage = lazy(() => import('../../pages/groupware/org/OrgChartPage'))
const NoticePage = lazy(() => import('../../pages/groupware/workpost/NoticePage'))
const SharedBoardPage = lazy(() => import('../../pages/groupware/workpost/SharedBoardPage'))
const MeetingBoardPage = lazy(() => import('../../pages/groupware/workpost/MeetingBoardPage'))
const MinutesBoardPage = lazy(() => import('../../pages/groupware/workpost/MinutesBoardPage'))
const SignBoardPage = lazy(() => import('../../pages/groupware/workpost/SignBoardPage'))
const ProjectKanbanPage = lazy(() => import('../../pages/groupware/project/ProjectKanbanPage'))
const SchedulePage = lazy(() => import('../../pages/groupware/schedule/SchedulePage'))
const SurveyPage = lazy(() => import('../../pages/groupware/survey/SurveyPage'))
const SuppliesPage = lazy(() => import('../../pages/groupware/supply/SuppliesPage'))
const EmployeeContactPage = lazy(() => import('../../pages/groupware/org/EmployeeContactPage'))
const OrgStatusPage = lazy(() => import('../../pages/groupware/org/OrgStatusPage'))
const OrgTreePage = lazy(() => import('../../pages/groupware/org/OrgTreePage'))
const SwSchedulePage = lazy(() => import('../../pages/groupware/schedule/SwSchedulePage'))
const ConstructionSchedulePage = lazy(() => import('../../pages/groupware/schedule/ConstructionSchedulePage'))
const SurveyInputPage = lazy(() => import('../../pages/groupware/survey/SurveyInputPage'))
const SurveyStatusPage = lazy(() => import('../../pages/groupware/survey/SurveyStatusPage'))

/** 그룹웨어 라우트 — app/router.tsx 가 원래 자리(차례)에 그대로 붙인다. */
export const groupwareRoutes = (
  <>
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
  </>
)

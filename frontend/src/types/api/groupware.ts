// 백엔드 응답과 매칭되는 타입 — 그룹웨어. types/api.ts 가 다시 내보낸다(기존 import 경로 그대로).
import type { IncomeType } from './accounting'

// ===== 그룹웨어: 전자결재 =====

/** 양식코드. 양식은 approval_form_templates 마스터가 정하므로 열린 문자열이다. */
export type ApprovalFormType = string

export type ApprovalStatus = 'DRAFTING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED'

export type ApprovalLineStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type ApprovalParticipantRole = 'REFERENCE' | 'SHARE'

/** 양식별 입력 항목 정의. 백엔드 field_schema(jsonb)를 그대로 받는다. */
export type ApprovalFieldType = 'text' | 'textarea' | 'date' | 'datetime' | 'number' | 'table'

export interface ApprovalFieldColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'date'
}

export interface ApprovalField {
  key: string
  label: string
  type: ApprovalFieldType
  required?: boolean
  /** type='table' 전용 */
  columns?: ApprovalFieldColumn[]
  defaultRows?: Record<string, unknown>[]
  /** 이 컬럼을 합계 낸다 (예: 여비 총계) */
  totalOf?: string
  totalLabel?: string
  /**
   * 셀 배치 — 원본은 「신청일자 | 시작 ~ 종료」처럼 여러 필드를 한 줄에 놓는다.
   * 같은 `row` 값을 가진 필드들이 한 줄에 그려진다. 없으면 한 줄에 한 필드(기존 동작).
   */
  row?: number
  /** 그 줄의 라벨. 줄의 첫 필드에만 준다. 없으면 첫 필드의 label 을 쓴다. */
  rowLabel?: string
  /** 앞 필드와 이 필드 사이에 넣을 글자 (예: '~'). */
  sep?: string
}

export interface ApprovalFormTemplate {
  id: number
  code: string
  name: string
  sortOrder: number
  fieldSchema: ApprovalField[]
}

export interface ApprovalLine {
  id: number
  stepOrder: number
  approverId: number
  approverName: string
  status: ApprovalLineStatus
  statusName: string
  comment: string | null
  actedAt: string | null
}

export interface ApprovalParticipant {
  userId: number
  userName: string
  role: ApprovalParticipantRole
  roleName: string
}

export interface ApprovalVoucher {
  id: number
  voucherType: 'SALES' | 'PURCHASE' | 'EXPENSE'
  voucherId: number
  voucherNo: string
}

export interface ApprovalDoc {
  id: number
  /** 기안서No. */
  docNo: string
  /** 기안No. (2026/07/10-2) */
  draftNo: string
  formTemplateId: number
  formType: ApprovalFormType
  formTypeName: string
  title: string
  content: string
  formData: Record<string, unknown>
  drafterId: number
  drafterName: string
  draftDate: string
  department: string | null
  projectId: number | null
  projectName: string | null
  status: ApprovalStatus
  statusName: string
  currentStep: number
  reference: string | null
  deleted: boolean
  /** 원본 기안서통합관리 조건의 [라벨] — 문서에 붙이는 꼬리표. 서버는 이미 주고 있었다. */
  labelText: string | null
  /** 원본 조건의 [첨부] — 붙임 파일. 서버는 이미 주고 있었다. */
  attachmentId: number | null
  attachmentName: string | null
  currentApproverName: string | null
  /**
   * 작업자 · 작업일시 — 원본 기안서통합관리의 마지막 두 열.
   * 마지막으로 이 문서를 움직인 사람과 시각이다. 아무도 결재 안 했으면 기안자·기안 시각.
   */
  lastActorName: string | null
  lastActedAt: string | null
  voucherCount: number
  lines: ApprovalLine[]
  participants: ApprovalParticipant[]
  vouchers: ApprovalVoucher[]
  /** [결재문서] › '전표 출력물'(V515) */
  outputs?: ApprovalOutput[]
}

/** 기안서에 붙인 출력물 — SNAPSHOT 은 적용한 때의 사본(html), AUTO 는 조건(conditions)으로 열 때 다시 조회. */
export interface ApprovalOutput {
  id?: number
  menuName: string
  /** 적용한 때 'YYYY-MM-DDTHH:mm:ss' */
  appliedAt: string
  mode: 'SNAPSHOT' | 'AUTO'
  html: string | null
  conditions: Record<string, unknown> | null
}

// ===== 그룹웨어: 업무일지 =====

export interface WorkJournal {
  id: number
  reportDate: string
  authorId: number
  authorName: string
  department: string | null
  partnerName: string | null
  /** 거래처 마스터와 이름이 정확히 일치할 때만 채워진다 */
  partnerId: number | null
  projectId: number | null
  projectName: string | null
  title: string
  content: string
  /** 원본 '조회' 머리의 작성 시각 */
  createdAt: string | null
  /** 답글이면 원글 id — 격자에는 원글(null)만 찍는다 */
  parentId: number | null
  attachmentId?: number | null
  attachmentName?: string | null
  attachmentSize?: number | null
}

// 결재선 지정용 간단 사용자 옵션
export interface MemberOption {
  id: number
  name: string
  department: string
}

// ===== 전자결재 설정 (공통양식등록 · 결재선 프리셋) =====

/** 관리 화면용 양식 (사용중지된 양식도 포함) */
export interface ApprovalFormTemplateAdmin {
  id: number
  code: string
  name: string
  sortOrder: number
  active: boolean
  fieldSchema: ApprovalField[]
  /** 이 양식으로 작성된 기안서 수 — 0건일 때만 삭제 가능 */
  documentCount: number
}

export interface ApprovalPresetStep {
  stepOrder: number
  approverId: number
  approverName: string
  department: string | null
}

export interface ApprovalPreset {
  id: number
  name: string
  active: boolean
  formTemplateId: number | null
  formTemplateName: string | null
  steps: ApprovalPresetStep[]
}

// ===== 고객관리(CRM) =====

export type CrmStage = 'LEAD' | 'CONSULTING' | 'QUOTE' | 'CONTRACT' | 'LOST'

export interface CrmActivity {
  id: number
  activityDate: string
  partnerId: number
  partnerCode: string
  partnerName: string
  contactName: string | null
  charge: string | null
  activity: string | null
  stage: CrmStage
  stageName: string
  nextAction: string | null
}

// ===== WORK 업무게시판 =====

export type WorkPostStatus = 'IN_PROGRESS' | 'DONE'

export interface WorkPost {
  id: number
  /** 게시판. 게시글번호는 게시판을 가로질러 한 줄기라 목록 번호에 구멍이 보인다 */
  board: 'WORK' | 'NOTICE' | 'SHARED' | 'MEETING' | 'SIGN' | 'MINUTES'
    | 'AI_GUIDE' | 'SITE_LOG' | 'SITE_STATUS' | 'DEV_LOG' | 'DEV_STATUS' | 'CONSULT' | 'VISIT' | 'CONTRACT' | 'AS_CARE'
    | 'CAR_INFO' | 'CAR_DOC' | 'CAR_RUN' | 'KANBAN_SAMPLE' | 'PROJECT_KANBAN'
  boardName: string
  postNo: number
  postDate: string
  title: string
  content: string
  /** 작성자 로그인 아이디 (users.username FK) */
  writer: string
  /** 작성자 표시 이름. 화면은 이걸 쓴다 — writer 는 아이디라 사람이 읽기 나쁘다. */
  writerName: string
  forwardTo: string | null
  /** 원본 WORK입력 폼의 [참조자]. */
  ccTo: string | null
  /** 원본 WORK입력 폼의 [공지사항여부]. true 면 목록 맨 위에 붙는다. */
  notice: boolean
  /** 원본 WORK입력 폼의 [완료일시]. 진행중이면 null. */
  completedAt: string | null
  /** 원본 격자의 [첨부] 열. 파일이 없으면 셋 다 null 이다. */
  attachmentId: number | null
  attachmentName: string | null
  attachmentSize: number | null
  /** 원본 격자의 [조회] 열 — 글을 연 횟수. */
  viewCount: number
  /** 원본 View 머리줄의 작성 일시. */
  createdAt: string | null
  /** 원본 조건 [수정일자순(정렬)] 의 기준. */
  updatedAt?: string | null
  status: WorkPostStatus
  statusName: string
  /** 원본 [라벨] — 제목 앞 칩. */
  labels: string[]
  /** 회사가 정한 진행상태 이름(SHARED · MEETING · SIGN). 그 밖의 게시판은 null */
  stage?: string | null
  /** 통합회의록 [주 차 구분] 1 ~ 5. 그 밖의 게시판은 null */
  weekNo?: number | null
  /** 통합회의록 부서 칸(경영지원팀 · 구매팀 · 생산팀 · 영업팀 회의록)에 이은 팀별회의록 글 id, 칸 차례대로(빈 칸 null) */
  meetingLinks?: (number | null)[]
  /** 업무관리 예시 게시판의 입력항목(이름:값 JSON). 없으면 null. */
  extraFields?: string | null
  /** 간판제작 [프로젝트] — 📅 프로젝트 진행현황 칸반 판의 열 이름. 그 밖의 게시판은 null */
  project?: string | null
  /** 간판제작 [칸반연결] — 📅 프로젝트 진행현황 칸반 글 id. 그 밖의 게시판은 null */
  kanbanPostId?: number | null
  /** 답글(하위 글)이면 원글 id. 목록은 원글 제목 뒤에 '[답글 수]' 를 달고 [모두펼쳐보기] 로 그 아래에 편다. */
  parentId?: number | null
}

// ===== ECDrive 문서 드라이브 =====

export interface DriveDocument {
  id: number
  name: string
  drive: string
  sizeBytes: number
  uploader: string | null
  important: boolean
  trashed: boolean
  updatedAt: string | null
  /** 실제 업로드된 파일 id. null 이면 메타데이터만 등록된 항목(다운로드 불가). */
  fileId: number | null
  /** 폴더면 true(원본 [새 폴더]) */
  folder: boolean
  /** 들어 있는 폴더 id. 최상위면 null */
  parentId: number | null
}

// ===== 명함관리 =====

export interface BusinessCard {
  id: number
  name: string
  partnerId: number | null
  partnerName: string | null
  companyName: string | null
  department: string | null
  jobTitle: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  address: string | null
  ownerUserId: number | null
  ownerName: string | null
  tags: string[]
  memo: string | null
}

// ===== 그룹웨어: 공용메일 =====

export type MailType = 'INTERNAL' | 'SHARED'
export type MailStatus = 'UNREAD' | 'READ' | 'IN_PROGRESS' | 'HANDLED'

export interface Mail {
  id: number
  type: MailType
  typeName: string
  senderId: number | null
  senderName: string | null
  fromAddress: string | null
  recipientId: number | null
  recipientName: string | null
  subject: string
  body: string | null
  sentAt: string
  status: MailStatus
  statusName: string
  assigneeId: number | null
  assigneeName: string | null
  handledAt: string | null
  handleNote: string | null
  draft: boolean
  deletedAt: string | null
  /** 스팸 메일함 분류 여부와 사유(어떤 규칙에 걸렸는지 / 수동 지정) */
  spam: boolean
  spamReason: string | null
}

export interface SharedMailBox {
  pendingCount: number
  mails: Mail[]
}

// ===== 쪽지 =====

/** 쪽지. senderId 가 null 이면 시스템 자동알림(senderName 은 'ECOUNT'). */
export interface ShortMessage {
  id: number
  senderId: number | null
  senderName: string
  recipientId: number
  recipientName: string
  partnerId: number | null
  partnerName: string | null
  content: string
  sentAt: string
  readAt: string | null
  archived: boolean
  system: boolean
  statusName: string
  linkSource: string | null
  linkRef: string | null
  linkPath: string | null
}

// ===== 인쇄용 결재라인 =====

/** 인쇄용결재라인등록(원본 E010106 · E090102) — 모듈마다 결재라인 1 · 2 */
export type SignModule = 'ACCOUNTING' | 'INVENTORY' | 'MANAGEMENT'

export interface SignSlotRow {
  slotOrder: number
  title: string | null
  widthPx: number | null
  fontPx: number | null
}

export interface SignLineRow {
  lineNo: number
  labelName: string | null
  labelWidth: number | null
  labelFont: number | null
  slots: SignSlotRow[]
}

export interface SignLineSet {
  module: SignModule
  lines: SignLineRow[]
}

// ===== 익명게시판 · 외근조회 =====

export interface BoardPost {
  id: number
  title: string
  /** 목록에도 본문이 실린다 — 익명게시판은 목록이 곧 본문이라서 */
  content: string | null
  category: string | null
  author: string | null
  anonymous: boolean
  views: number
  createdAt: string
}

export interface BoardPostDetail extends BoardPost {
  content: string | null
}

export type FieldWorkStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED'

export interface FieldWork {
  id: number
  userId: number
  userName: string
  department: string | null
  workDate: string
  startTime: string | null
  endTime: string | null
  /** 원본 [도착지 주소]. 비워 둘 수 있다. */
  destination: string | null
  /** 원본 [적요]. */
  purpose: string | null
  status: FieldWorkStatus
  statusName: string
  approverName: string | null
  rejectReason: string | null
  /** 원본 외근조회(E070254) 운행 기록 칸 — 출발지 주소 · 이동수단코드(차량번호) · 이동수단명 · 사용목적명 · 운행거리. */
  departure: string | null
  vehicleNo: string | null
  vehicleName: string | null
  usePurpose: string | null
  distance: number | null
  /** 원본 [주행전 계기판거리][주행후 계기판거리] */
  odometerBefore: number | null
  odometerAfter: number | null
}

export interface FieldWorkSummary {
  requestedCount: number
  approvedCount: number
  rejectedCount: number
  rows: FieldWork[]
}

// ===== 우측 앱바 위젯 (통합검색 · 알림 · E Note) =====

export interface SearchHit {
  title: string
  subtitle: string
  /** 클릭하면 이동할 화면 경로 */
  to: string
}

export interface SearchGroup {
  type: string
  typeName: string
  /** 전체 매칭 건수 (hits 는 상위 일부만) */
  total: number
  hits: SearchHit[]
}

export interface WorkspaceSearch {
  keyword: string
  total: number
  groups: SearchGroup[]
}

export interface WorkspaceNotification {
  type: string
  level: 'INFO' | 'WARN'
  title: string
  message: string
  count: number
  to: string
}

export interface NotificationResponse {
  total: number
  notifications: WorkspaceNotification[]
}

export interface UserNote {
  id: number
  content: string
  pinned: boolean
  updatedAt: string
}

/* ── 메신저 (앱바 💬) ───────────────────────────────────────────── */

export interface ChatMember {
  userId: number
  name: string
  department: string | null
}

export interface ChatRoom {
  id: number
  /** 1:1 이면 상대 이름, 그룹이면 방 이름 (백엔드가 내 기준으로 만들어 준다) */
  title: string
  direct: boolean
  memberCount: number
  members: ChatMember[]
  lastMessage: string | null
  lastSenderName: string | null
  lastMessageAt: string | null
  unread: number
}

export interface ChatMessage {
  id: number
  roomId: number
  senderId: number | null
  senderName: string
  content: string
  sentAt: string
  /** 참여·퇴장 같은 시스템 안내 */
  system: boolean
  /** [보기] 가 여는 화면 — 권한요청 알림처럼 서버가 보낸 메시지만 */
  linkTo?: string | null
}

// ── 설문조사 (그룹웨어 > 공유정보 > 설문조사) ───────────────────────────────

/** 원본 설문조사입력의 질문유형 9종. */
export type QuestionType =
  | 'SINGLE' | 'MULTI' | 'SINGLE_ETC' | 'MULTI_ETC'
  | 'SHORT_TEXT' | 'LONG_TEXT' | 'RANK' | 'DATE' | 'SCALE'

export type SurveyStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'UNSENT'

export interface SurveyQuestion {
  id: number
  seq: number
  type: QuestionType
  typeName: string
  /** 보기항목을 쓰는 유형인가 — 화면이 보기 칸을 그릴지 판단한다 */
  usesOptions: boolean
  content: string
  options: string[]
  required: boolean
}

export interface SurveyDoc {
  id: number
  postNo: number
  title: string
  endAt: string | null
  targetScope: 'INTERNAL' | 'EXTERNAL'
  targetScopeName: string
  anonymous: boolean
  resultVisibility: 'ALL' | 'PARTIAL' | 'NONE'
  resultVisibilityName: string
  headerText: string | null
  status: SurveyStatus
  statusName: string
  createdBy: string | null
  writerName: string | null
  createdAt: string | null
  questionCount: number
  targetCount: number
  responseCount: number
  responseRate: number
  /** 지금 보는 사람이 이미 응답했는가 — 원본 '설문조사 참여여부' 칸 */
  answeredByMe: boolean
  /** 설문종료일이 지났는가. 상태가 '진행중'이어도 시간으로 닫힌다 */
  expired: boolean
  questions: SurveyQuestion[]
  targets: { userId: number; userName: string }[]
}

export interface SurveyQuestionResult {
  questionId: number
  seq: number
  typeName: string
  content: string
  usesOptions: boolean
  /** 보기 → 응답 수. 보기 없는 유형이면 비어 있다 */
  counts: Record<string, number>
  /** 서술형 답변 원문 + '기타' 직접 입력 */
  texts: string[]
  answeredCount: number
}

export interface SurveyResult {
  surveyId: number
  title: string
  targetCount: number
  responseCount: number
  responseRate: number
  anonymous: boolean
  questions: SurveyQuestionResult[]
}

/** 법인세Checklist(E030401) — GET /corporate-tax/checklist?year= */
export interface CorporateTaxChecklist {
  year: number
  sales: CorporateTaxSalesMonth[]
  payroll: CorporateTaxPayrollMonth[]
}

/** [2. 손익계산서 매출계정 내역] 한 달 — 칸이 없는 달은 null */
export interface CorporateTaxSalesMonth {
  month: number
  sales: number
  quarterOnly: number | null
  quarterCumulative: number | null
  halfCumulative: number | null
  total: number | null
}

/** [3. 급여 및 원천세 내역] 한 달. difference = reported − salary */
export interface CorporateTaxPayrollMonth {
  month: number
  reported: number
  difference: number
  salary: number
  bonus: number
  incomeTax: number
  localIncomeTax: number
  pension: number
  health: number
  employment: number
}

export interface CorporateTaxCheckMemo {
  id: number
  year: number
  section: number
  memoDate: string
  title: string
  content: string
  writer: string | null
}

/** 지출증빙현황(E030402) — GET /expense-evidence?from=YYYY-MM&to=YYYY-MM */
export interface ExpenseEvidenceStatus {
  from: string
  to: string
  kinds: string[]
  rows: { accountId: number; accountCode: string; accountName: string; amounts: Record<string, number>; total: number }[]
}

/** 지출증빙현황 금액 링크 → 전표vs매출매입자료비교 한 줄 */
export interface ExpenseEvidenceCompareRow {
  entryId: number
  entryDate: string
  docNo: string
  accountName: string
  partnerName: string | null
  debit: number
  credit: number
  vatDocNo: string | null
  vatKind: string | null
  vatPartnerName: string | null
  supply: number
  vat: number
  vatTotal: number
}

/** 지출증빙현황 [계정설정] 한 줄 — shown 이 인쇄방법 '표시' */
export interface ExpenseEvidenceAccount { id: number; code: string; name: string; shown: boolean }

/** 간이지급명세서(E030116) */
export type SimplePaymentKind = 'LABOR' | 'BUSINESS' | 'OTHER' | 'DAILY'
export interface SimplePaymentStatement {
  id: number
  kind: SimplePaymentKind
  kindName: string
  payYear: number
  /** 근로소득은 반기(1 · 2), 사업 · 기타소득은 달(1~12) */
  period: number
  reportDate: string
  managerDept: string
  managerName: string
  managerPhone: string
  submitter: 'DIRECT' | 'AGENT'
  submitterName: string
}
export interface SimplePaymentSheet {
  statement: SimplePaymentStatement
  labor: { employeeName: string; workFrom: string; workTo: string; monthlyPay: (number | null)[]; total: number }[]
  payees: { payeeName: string; payeeRegNo: string | null; incomeCode: string | null; count: number; gross: number; expense: number; taxable: number;
    rate: number; incomeTax: number; localIncomeTax: number }[]
  daily: { name: string; days: number; lastDate: string | null; taxable: number; incomeTax: number; localIncomeTax: number }[]
}

/** 소득자료제출집계표(E030508) — GET /withholding/income-submission */
export interface IncomeSubmission { kind: string; label: string; pages: number; count: number; income: number; incomeTax: number; corporateTax: number; ruralTax: number; localIncomeTax: number }

/** 원천징수영수증(일용직, C000733) — GET /withholding/daily-receipts?month= */
export interface DailyReceipt {
  employeeId: number; employeeCode: string | null; employeeName: string; days: number; lastDate: string | null
  totalPay: number; nonTaxable: number; incomeTax: number; localIncomeTax: number
}

/** 퇴직급여추계액(E030108) — GET /retirement-pays/estimate */
export interface RetirementEstimateRow {
  employeeId: number; employeeCode: string | null; employeeName: string; hireDate: string; startDate: string
  threeMonthPay: number; bonusThreeMonths: number; years: number; months: number; days: number
  threeMonthDays: number; serviceDays: number; retirementPay: number
}

/** 원천세신고자료비교표(E030104) 한 줄 — month 가 null 이면 합계 줄 */
export interface WithholdingComparisonRow {
  month: string | null; kind: string; count: number
  gross: number | null; nonTaxable: number | null; incomeTax: number | null; localIncomeTax: number | null
  reportedCount: number | null; reportedGross: number | null; reportedTax: number | null; differs: boolean
}

/** 소득자등록(세무 › 기타원천세 E030301) */
export type PayeeKind = 'CORPORATE' | 'INDIVIDUAL'

export interface WithholdingPayee {
  id: number
  kind: PayeeKind
  kindName: string
  bizRegNo: string | null
  regNo: string
  regNoFront: string
  tradeName: string | null
  name: string
  address: string | null
  englishName: string | null
  bizAddress: string | null
  payeeKindCode: string | null
  industryCode: string | null
  industryName: string | null
  bankName: string | null
  accountNo: string | null
  nonResident: boolean
  foreigner: boolean
  nonRealName: boolean
  birthDate: string | null
  accountCode: string | null
  mobile: string | null
  email: string | null
  memo: string | null
  deleted: boolean
}

/** 기타원천세 코드도움 한 줄 — rate1 · rate2 는 기타소득 소득코드의 기본 필요경비율 · 세율(%). */
export interface WithholdingCodeItem {
  code: string
  name: string
  rate1: string | null
  rate2: string | null
}

/** 기타원천세 전표 한 줄(원본 기타원천세입력 E030314) */
export interface WithholdingSlipLine {
  id: number
  lineNo: number
  payeeId: number | null
  payeeName: string | null
  payeeKindName: string | null
  incomeCode: string | null
  incomeCodeName: string | null
  grossAmount: number
  expenseRate: number | null
  expenseAmount: number
  taxableAmount: number
  taxRate: number
  incomeTax: number
  localIncomeTax: number
  taxTotal: number
  netAmount: number
  description: string | null
  /** 소액부징수(SMALL) · 과세최저한(MIN) 으로 세액을 0 으로 둔 줄 */
  taxExempt: 'SMALL' | 'MIN' | null
  /** 이자배당소득 줄의 지급명세서 칸(다른 줄은 null) */
  interest: {
    accountNo: string | null; taxationCode: string | null; specialCode: string | null; productCode: string | null
    securityCode: string | null; bondInterestCode: string | null; periodFrom: string | null; periodTo: string | null
    interestRate: number | null; changeKind: string | null; changeMonth: string | null; trustIncome: boolean
  } | null
}

/** 기타원천세 전표 한 장 — slipNo 는 원본 표기 '2025/07/31-2'. */
export interface WithholdingSlip {
  slipNo: string
  payDate: string
  slipSeq: number
  attributionMonth: string
  payMonth: string
  incomeType: IncomeType
  incomeTypeName: string
  lines: WithholdingSlipLine[]
}

/** 기타원천세조회 한 줄 */
export interface WithholdingSlipListRow {
  slipNo: string
  payDate: string
  slipSeq: number
  attributionMonth: string
  payMonth: string
  payeeSummary: string
  incomeType: IncomeType
  incomeTypeName: string
  grossAmount: number
  taxTotal: number
  netAmount: number
}

/** 기타원천세현황 한 줄 */
export interface WithholdingLineReportRow {
  slipNo: string
  payDate: string
  slipSeq: number
  attributionMonth: string
  payMonth: string
  payeeName: string | null
  incomeType: IncomeType
  incomeTypeName: string
  incomeCode: string | null
  grossAmount: number
  incomeAmount: number
  taxRate: number
  taxTotal: number
  description: string | null
}

/** 기타원천세 원천징수영수증(보관용) — 소득자 한 사람 */
export interface WithholdingReceiptLine {
  payDate: string
  attributionMonth: string
  incomeCode: string | null
  grossAmount: number
  expenseAmount: number
  taxableAmount: number
  taxRate: number
  incomeTax: number
  localIncomeTax: number
  taxTotal: number
  /** 이자 · 배당 서식 [별지 제23호서식(1)] 칸 */
  accountNo: string | null
  trustIncome: boolean
  taxationCode: string | null
  specialCode: string | null
  productCode: string | null
  securityCode: string | null
  bondInterestCode: string | null
  periodFrom: string | null
  periodTo: string | null
  interestRate: number | null
}

export interface WithholdingReceiptPayee {
  payeeId: number | null
  regNo: string | null
  name: string
  tradeName: string | null
  bizRegNo: string | null
  address: string | null
  bizAddress: string | null
  foreigner: boolean
  industryCode: string | null
  incomeCodes: string[]
  grossAmount: number
  taxTotal: number
  lines: WithholdingReceiptLine[]
  /** 이자 · 배당 서식 ⑧ 소득자구분코드 · ⑩ 거주구분 */
  payeeKindCode: string | null
  nonResident: boolean
}

/** 기타원천세 지급명세서(보고용) — 소득자별 연간집계표 */
export interface WithholdingStatementRow {
  code: string | null
  name: string
  regNo: string | null
  foreigner: boolean
  payYear: number
  count: number
  grossAmount: number
  expenseAmount: number
  taxableAmount: number
  taxRate: number
  incomeTax: number
  localIncomeTax: number
  taxTotal: number
}

export interface WithholdingPaymentStatement {
  year: number
  payeeCount: number
  lineCount: number
  grossAmount: number
  taxableAmount: number
  incomeTax: number
  localIncomeTax: number
  taxTotal: number
  smallCount: number
  smallGross: number
  rows: WithholdingStatementRow[]
}

/** 재고 I › 기초등록 › 사원(담당)등록(E010110) — 전표 [담당자] 마스터(/sales-reps). 관리 사원(EmployeeMaster)과 다른 마스터다. */
export interface SalesRep {
  id: number
  code: string
  name: string
  searchKeyword: string | null
  remark: string | null
  phone: string | null
  email: string | null
  extra3: string | null
  extra4: string | null
  extra5: string | null
  extra6: string | null
  active: boolean
}

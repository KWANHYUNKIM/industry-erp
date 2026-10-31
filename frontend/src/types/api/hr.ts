// 백엔드 응답과 매칭되는 타입 — 인사 · 근태 · 급여. types/api.ts 가 다시 내보낸다(기존 import 경로 그대로).

// ===== 그룹웨어: 출퇴근 =====

export interface Attendance {
  id: number
  userId: number
  userName: string
  workDate: string
  clockIn: string | null
  clockOut: string | null
  workMinutes: number | null
  late: boolean
  note: string | null
  /** 아래는 출/퇴근기록부(ID) 창(E070305)의 칸 — 장소 · ☐외근 · ☐오전반차설정, 입력한 때(지각현황(ID) [입력시간]) */
  username: string
  department: string | null
  place: string | null
  outsideWork: boolean
  halfLeave: boolean
  enteredAt: string | null
}

// ===== 급여관리 =====

export type PayslipStatus = 'DRAFT' | 'CONFIRMED'
export type PayslipLineKind = 'ALLOWANCE' | 'DEDUCTION'

/** 사원 마스터 (/api/employees). 로그인 User 와는 별개다. */
export interface EmployeeMaster {
  id: number
  code: string
  name: string
  departmentId: number | null
  department: string
  jobTitle: string
  baseSalary: number
  hireDate: string | null
  resignDate: string | null
  active: boolean
  /** 원본 [담당자연락처]·[담당자Email]·[검색창내용]·[적요]. */
  phone: string | null
  email: string | null
  searchKeyword: string | null
  remark: string | null
  /** 원본 관리 > 사원등록의 [급여구분]·[모바일]·[퇴사사유]·[주소]. */
  payType: EmployeePayType
  payTypeName: string
  mobile: string | null
  resignReason: string | null
  /** 원본 사원등록 [외국어성명1] · [외국어성명2] · [세대주여부](세대주 · 세대원 · 세대주의 배우자) */
  foreignName1: string | null
  foreignName2: string | null
  household: string | null
  /** 원본 사원등록 [주민등록번호] — 필수 아님(급여를 못 보는 사람에게는 null) */
  residentNo?: string | null
  /** 원본 사원등록 [우편번호] */
  zipcode: string | null
  address: string | null
  /** 원본 사원등록 [급여통장] — 급여 권한이 없으면 null */
  bankCode: string | null
  bankName: string | null
  accountNo: string | null
  accountHolder: string | null
  /** 원본 사원등록 [입사구분] — 100 신입 · 200 경력 */
  hireKind: string | null
  /** 원본 사원등록 [직책] — 100 팀원 · 200 팀장 */
  duty: string | null
  /** 원본 사원등록 [프로젝트] */
  projectId: number | null
}

export type EmployeePayType = 'FIXED' | 'VARIABLE'

export interface PayslipLine {
  id: number
  lineNo: number
  kind: PayslipLineKind
  kindName: string
  name: string
  amount: number
  auto: boolean
}

export interface Payslip {
  id: number
  employeeId: number
  employeeCode: string
  employeeName: string
  department: string | null
  payMonth: string
  baseSalary: number
  allowanceTotal: number
  deductionTotal: number
  grossPay: number
  netPay: number
  status: PayslipStatus
  statusName: string
  remark: string | null
  lines: PayslipLine[]
}

// ===== 급여 설정 (수당·공제 항목/그룹) · 급여이체 =====
// PayslipLineKind 는 위 급여관리 블록에 이미 있다.

export interface PayItem {
  id: number
  code: string
  name: string
  kind: PayslipLineKind
  kindName: string
  /** 비과세 수당이면 false — 4대보험·소득세 기준에서 빠진다 */
  taxable: boolean
  defaultAmount: number
  active: boolean
  /** 원본 수당항목등록(E090103)의 [표시순서]·[배율]·[비과세유형]·[지급유형]·[산출방법]. */
  sortOrder: number
  rate: number | null
  taxFreeType: PayTaxFreeType
  taxFreeTypeName: string
  payMethod: PayMethod
  payMethodName: string
  calcNote: string | null
}

export type PayTaxFreeType = 'NONE' | 'NIGHT_WORK' | 'CHILDCARE' | 'MEAL' | 'VEHICLE'
export type PayMethod = 'FIXED' | 'DAILY' | 'HOURLY' | 'RATE' | 'MANUAL'

export interface PayGroupLine {
  payItemId: number
  code: string
  name: string
  kind: PayslipLineKind
  kindName: string
  taxable: boolean
  amount: number
}

export interface PayGroup {
  id: number
  /** 원본 [수당/공제그룹코드] (00001 꼴) */
  code: string
  name: string
  remark: string | null
  active: boolean
  allowanceTotal: number
  deductionTotal: number
  lines: PayGroupLine[]
  /** 원본 목록 [사원] 칸 — 적용사원 수 */
  employeeCount: number
}

/** 원본 [적용사원등록] 한 줄 */
export interface PayGroupEmployee {
  employeeId: number
  employeeCode: string
  employeeName: string
  department: string
  rate: number
}

export interface PayrollTransferLine {
  payslipId: number
  employeeId: number
  employeeName: string
  department: string | null
  netPay: number
}

export interface PayrollTransfer {
  id: number
  transferNo: string
  payMonth: string
  transferDate: string
  bankAccountId: number
  bankAccountName: string
  totalPay: number
  totalDeduction: number
  netPay: number
  journalEntryId: number | null
  journalDocNo: string | null
  createdBy: string | null
  lines: PayrollTransferLine[]
}

// ===== 인사관리 (발령이력) =====

export type AssignmentType = 'HIRE' | 'TRANSFER' | 'PROMOTION' | 'RESIGN' | 'REHIRE'

export interface Assignment {
  id: number
  employeeId: number
  employeeCode: string
  employeeName: string
  assignDate: string
  type: AssignmentType
  typeName: string
  departmentId: number | null
  department: string
  jobTitle: string
  remark: string | null
  createdBy: string | null
}

// ===== 전자근로계약 =====

export type ContractType = 'PERMANENT' | 'FIXED_TERM' | 'DAILY'
export type ContractStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'TERMINATED'

export interface EmploymentContract {
  id: number
  contractNo: string
  employeeId: number | null
  employeeCode: string
  employeeName: string
  type: ContractType | null
  typeName: string
  status: ContractStatus
  statusName: string
  startDate: string
  endDate: string | null
  departmentId: number | null
  department: string
  jobTitle: string
  monthlySalary: number
  weeklyHours: number
  workPlace: string | null
  duty: string | null
  signedAt: string | null
  signedBy: string | null
  remark: string | null
  createdBy: string | null
  /** 원본 근로계약현황 [요청일시] · [최종수정일자] */
  sentAt: string | null
  updatedAt: string | null
  /** 원본 근로계약서진행단계 [최초작성일자] */
  createdAt: string | null
  /** 원본 계약서입력 — 계약서명 · 첨부(PDF) · 2차인증사용여부 · 구분 · 프로젝트, 수신정보입력 전달방식 */
  contractName: string
  attachmentFileId: number | null
  attachmentName: string | null
  attachmentSize: number | null
  twoFactor: boolean
  category: string
  projectId: number | null
  deliveryMethod: 'EMAIL' | 'SMS' | 'KAKAO' | 'DIRECT' | null
  deliveryMethodName: string
}

// ===== 일용근로급여 =====

export interface DailyWork {
  id: number
  employeeId: number
  employeeCode: string
  employeeName: string
  department: string
  workDate: string
  workHours: number
  dailyWage: number
  incomeTax: number
  localIncomeTax: number
  netPay: number
  paid: boolean
  paidDate: string | null
  remark: string | null
  createdBy: string | null
  /** 지급하며 만든 회계전표 번호(QA 69회차). 미지급이면 null. */
  journalNo: string | null
}

export interface DailyWorkSummary {
  month: string
  headcount: number
  workDays: number
  totalWage: number
  totalIncomeTax: number
  totalLocalIncomeTax: number
  totalNetPay: number
  unpaidNetPay: number
  rows: DailyWork[]
}

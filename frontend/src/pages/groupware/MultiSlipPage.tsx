import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useLocation } from 'react-router-dom'
import Modal from '../../components/Modal'
import GridCode from '../../components/GridCode'
import type { CodeItem } from '../../components/CodePickerField'
import EcPeriodPicks, { ymd, BOARD_PICKS } from '../../components/EcPeriodPicks'
import { ecConfirm, requireSelection } from '../../components/EcDialog'
import { api, extractErrorMessage } from '../../api/client'
import { dateText } from '../../utils/dateText'
import { useShortcut } from '../../utils/useShortcut'
import { MenuButton } from '../../components/EcSlipShell'
import EcFileDrop from '../../components/EcFileDrop'
import { SlipHistoryModal, SlipLastHistoryModal } from '../../features/sliphistory/SlipHistoryModal'
import { exportTableToXlsx } from '../../utils/excel'
import { shrinkImage } from '../../utils/imageResize'

/**
 * 그룹웨어 › 다목적관리 — '다목적 전표' 넷(2026-10-14 loginaa 실측, .claude/skills/ecount-diff/plans/그룹웨어/E200276.md).
 *
 * 이름에 '게시판' 이 붙어도 업무관리 게시판(WorkPage)과 틀이 다르다: 목록은 게시판 꼴(알약 · 기간 글자 · 하단 버튼줄)이지만
 * [신규(F2)] 창은 전표 입력 — 머리 `일자-No.` 하나 + 격자 줄 여럿. 목록 한 줄 = 전표 한 장의 첫 줄, 번호 `일자-순번`.
 * 원본은 회사가 입력항목(열)을 정하는 표다. 우리는 원본 넷의 열을 아래 BOARDS 에 고정으로 둔다.
 * 판매 · 채권 · 출퇴근 자료를 끌어오지 않는다(원본도 사람이 숫자를 직접 치는 표).
 */

type Board = 'MULTI_INPUT' | 'SALES_CONTRACT' | 'BOND_COLLECT' | 'MONTHLY_ATTENDANCE'
type Master = 'emp' | 'staff' | 'dept' | 'route' | 'partner' | 'partnerCode' | 'contract'
type Fields = Record<string, string>

/** 입력 격자 한 칸. code 칸은 고르면 nameKey 칸에 이름을 채운다(돋보기 없음 — 치고 칸을 떠나면 채워짐). */
interface InCol {
  key: string
  head: string
  width: number
  /** none = 원본도 칸이 안 열린다(영업자별 계약상황 [계약일자] — 목록은 전표 일자). */
  kind: 'code' | 'name' | 'text' | 'memo' | 'num' | 'none' | 'calc'
  master?: Master
  nameKey?: string
  /** 처음 값(원본 단가 · 청구한근무시간 '0'). */
  init?: string
  /** 고른 뒤 칸에 이름을 보인다(채권 [담당자] 는 이름 칸이 따로 없다). */
  showName?: boolean
}
interface ListCol { head: string; width?: number; cell: (f: Fields, s: Slip) => string; align?: 'left' | 'right' | 'center'; pre?: boolean }

interface BoardCfg {
  board: Board
  title: string
  width: number
  rows: number
  period: 'thisYear' | 'lastYear'
  cols: InCol[]
  /** 영업자별 계약상황 — 줄 하나가 두 단(아래 단 [계약세부내역]). */
  second?: InCol
  list: ListCol[]
  /** 목록의 링크 칸(전표일자-No. 대신 계약일자가 링크인 화면). */
  linkHead?: string
}

const fmt = (v: string | undefined, digits = 0) => {
  if (v == null || v === '') return ''
  const n = Number(String(v).replace(/,/g, ''))
  if (!Number.isFinite(n)) return v
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
/** 원본 회수율 목록 꼴 — 소수 한 자리, 끝 0 없음('66.7' · '90'). */
const rate1 = (v: string | undefined) => (v == null || v === '' ? '' : String(Math.round(Number(v) * 10) / 10))
const num = (v: string | undefined) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0 }
const r2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2)

const BOARDS: Record<string, BoardCfg> = {
  '/groupware/multi-input': {
    board: 'MULTI_INPUT', title: '다목적 게시판 입력항목은', width: 960, rows: 3, period: 'thisYear',
    cols: [
      { key: 'managerCode', head: '담당자', width: 112, kind: 'code', master: 'emp', nameKey: 'managerName' },
      { key: 'managerName', head: '담당자', width: 159, kind: 'name' },
      { key: 'routeCode', head: '구매경로', width: 112, kind: 'code', master: 'route', nameKey: 'routeName' },
      { key: 'routeName', head: '구매경로', width: 159, kind: 'name' },
      { key: 'detail', head: '세부내역', width: 159, kind: 'text' },
      { key: 'etc', head: '기타', width: 159, kind: 'memo' },
    ],
    list: [
      { head: '담당자명', cell: (f) => f.managerName ?? '' },
      { head: '작성일', cell: (_f, s) => stampText(s.createdAt) },
      { head: '구매경로', cell: (f) => f.routeName ?? '' },
      { head: '세부내역', cell: (f) => f.detail ?? '' },
      { head: '기타', cell: (f) => f.etc ?? '', pre: true },
    ],
  },
  '/groupware/sales-contract': {
    board: 'SALES_CONTRACT', title: '영업자별 계약상황', width: 1304, rows: 6, period: 'lastYear', linkHead: '계약일자',
    cols: [
      // 원본 [계약일자] 칸은 눌러도 입력이 안 열린다(2026-10-14 신규 · 수정 둘 다) — 목록 '계약일자' 는 전표 일자다.
      { key: 'contractDate', head: '계약일자', width: 234, kind: 'none' },
      { key: 'no', head: '번호', width: 41, kind: 'text' },
      { key: 'empCode', head: '사번', width: 41, kind: 'code', master: 'emp', nameKey: 'empName' },
      { key: 'empName', head: '영업자', width: 75, kind: 'name' },
      { key: 'bizNo', head: '사업자번호', width: 122, kind: 'code', master: 'partner', nameKey: 'partnerName' },
      { key: 'partnerName', head: '거래처', width: 126, kind: 'name' },
      // 원본 [계약코드] 는 코드 칸('계약여부검색' 창: 코드 · 항목명 · 적요 — 2026-10-20 실측 10 계약 · 20 보류 · 30 실패 · 40 진행,
      // '1' 처럼 하나만 맞으면 창 없이 바로 채움), 고르면 [계약여부] 에 항목명. [계약여부] 는 글자를 그대로 쳐도 저장된다('계약').
      { key: 'contractCode', head: '계약코드', width: 41, kind: 'code', master: 'contract', nameKey: 'contractName' },
      { key: 'contractName', head: '계약여부', width: 60, kind: 'name' },
      { key: 'qty', head: '수량', width: 53, kind: 'num' },
      { key: 'price', head: '단가', width: 99, kind: 'num', init: '0' },
      // 원본은 금액을 저절로 매기지 않는다(수량 2 · 단가 1,000 → 금액 빈칸).
      { key: 'amount', head: '금액', width: 101, kind: 'num' },
      { key: 'remark', head: '비고', width: 241, kind: 'memo' },
    ],
    second: { key: 'contractDetail', head: '계약세부내역', width: 0, kind: 'memo' },
    list: [
      { head: '영업자명', cell: (f) => f.empName ?? '' },
      { head: '계약여부', cell: (f) => f.contractName ?? '' },
      { head: '거래처명', cell: (f) => f.partnerName ?? '' },
      { head: '금액', cell: (f) => fmt(f.amount, 2), align: 'right' },
      { head: '계약세부내역', cell: (f) => f.contractDetail ?? '', align: 'left', pre: true },
      { head: '비고', cell: (f) => f.remark ?? '', pre: true },
    ],
  },
  '/groupware/bond-collect': {
    board: 'BOND_COLLECT', title: '채권회수 상황판', width: 960, rows: 3, period: 'lastYear',
    cols: [
      { key: 'managerCode', head: '담당자', width: 70, kind: 'code', master: 'emp', nameKey: 'managerName', showName: true },
      // 원본 [거래처] 는 코드 칸(거래처검색 — 고르면 칸에 거래처명). 고르지 않고 친 글은 안 맞는 코드라 지워져 저장되지 않는다(2026-10-14).
      { key: 'partnerCode', head: '거래처', width: 102, kind: 'code', master: 'partnerCode', nameKey: 'partnerName', showName: true },
      { key: 'target', head: '목표금액', width: 102, kind: 'num' },
      { key: 'c1', head: '1차 회수액', width: 102, kind: 'num' },
      { key: 'c2', head: '2차 회수액', width: 102, kind: 'num' },
      { key: 'c3', head: '3차 회수액', width: 102, kind: 'num' },
      { key: 'total', head: '총 회수액', width: 102, kind: 'calc' },
      { key: 'shortfall', head: '미달금액', width: 102, kind: 'calc' },
      { key: 'rate', head: '회수율(%)', width: 102, kind: 'calc' },
    ],
    list: [
      { head: '담당자', cell: (f) => f.managerName ?? '' },
      { head: '거래처', cell: (f) => f.partnerName ?? '' },
      { head: '목표금액', cell: (f) => fmt(f.target), align: 'right' },
      { head: '1차회수액', cell: (f) => fmt(f.c1), align: 'right' },
      { head: '2차회수액', cell: (f) => fmt(f.c2), align: 'right' },
      { head: '3차회수액', cell: (f) => fmt(f.c3), align: 'right' },
      // 원본 목록은 0 을 빈칸으로(2026-10-21: 목표 1,000 만 친 줄 → 총회수액 · 회수율 빈칸, 미달 1,000)
      { head: '총회수액', cell: (f) => (num(f.total) === 0 ? '' : fmt(f.total)), align: 'right' },
      { head: '미달금액', cell: (f) => fmt(f.shortfall), align: 'right' },
      { head: '회수율(%)', cell: (f) => (num(f.rate) === 0 ? '' : rate1(f.rate)), align: 'right' },
    ],
  },
  '/groupware/monthly-attendance': {
    board: 'MONTHLY_ATTENDANCE', title: '월근태', width: 1530, rows: 3, period: 'lastYear',
    cols: [
      { key: 'deptCode', head: '부서', width: 70, kind: 'code', master: 'dept', nameKey: 'deptName' },
      { key: 'deptName', head: '부서', width: 70, kind: 'name' },
      { key: 'empCode', head: '이름', width: 60, kind: 'code', master: 'staff', nameKey: 'empName' },
      { key: 'empName', head: '이름', width: 60, kind: 'name' },
      { key: 'availDays', head: '근무가능일수', width: 80, kind: 'num' },
      { key: 'vacationDays', head: '휴가일수', width: 60, kind: 'num' },
      { key: 'workDays', head: '근무일수', width: 60, kind: 'calc' },
      { key: 'totalHours', head: '총근무시간', width: 70, kind: 'num' },
      { key: 'claimedHours', head: '청구한근무시간', width: 90, kind: 'num', init: '0' },
      { key: 'netHours', head: '순 근무시간', width: 70, kind: 'calc' },
      { key: 'standardHours', head: '표준근무시간', width: 80, kind: 'calc' },
      { key: 'extraHours', head: '추가근무시간', width: 80, kind: 'calc' },
      { key: 'extraRate', head: '추가근무율(%)', width: 70, kind: 'calc' },
      { key: 'cType', head: 'C-Type기준(%)', width: 80, kind: 'calc' },
      { key: 'lateBefore', head: '지각09:30분이전(횟수)', width: 100, kind: 'num' },
      { key: 'lateAfter', head: '지각09:30분이후(횟수)', width: 100, kind: 'num' },
      { key: 'absent', head: '무단결근(횟수)', width: 60, kind: 'num' },
      { key: 'note', head: '소명(필요시 기재)', width: 200, kind: 'memo' },
    ],
    // 목록 열은 입력 열과 다르다(회사가 목록에 내건 항목). 2026-10-14 원본 저장으로 짝 확정:
    // 영업 일수 = 근무가능일수 · 휴가일수 = 휴가일수 · 지각횟수 = 무단결근(횟수) · 휴일근무 청구시간 = 청구한근무시간 · 비고 = 소명.
    list: [
      { head: '부서', width: 200, cell: (f) => f.deptName ?? '' },
      { head: '이름', width: 104, cell: (f) => f.empName ?? '' },
      { head: '영업 일수', width: 96, cell: (f) => f.availDays ?? '', align: 'right' },
      { head: '휴가일수', width: 85, cell: (f) => f.vacationDays ?? '', align: 'right' },
      // 원본 목록 '지각횟수' = 입력 [무단결근(횟수)](2026-10-14 실측: 지각 이전 1 · 이후 4 · 무단결근 3 → '3').
      { head: '지각횟수', width: 81, cell: (f) => f.absent ?? '', align: 'right' },
      // 원본은 청구한근무시간 0(처음 값) 을 목록에 빈칸으로 둔다(2026-10-20 저장 '… | 22 | 2 | | | …', 수정 5 → '5').
      { head: '휴일근무 청구시간', width: 135, cell: (f) => (Number(f.claimedHours || 0) === 0 ? '' : f.claimedHours), align: 'right' },
      { head: '비고', width: 700, cell: (f) => f.note ?? '', pre: true },
    ],
  },
}

/** 원본 첫 코드 칸(담당자 · 사번 · 부서) — 이 칸이 빈 줄은 '입력된 줄' 이 아니다. 서버 MultiSlipBoard#firstCodeKey 와 같다. */
const FIRST_KEY: Record<Board, string> = {
  MULTI_INPUT: 'managerCode', SALES_CONTRACT: 'empCode', BOND_COLLECT: 'managerCode', MONTHLY_ATTENDANCE: 'deptCode',
}

/** 원본이 '입력된 줄' 로 치는 줄인가 — 서버 MultiSlipBoard#isEntered 와 같다(2026-10-21 loginaa 실측).
 *  채권회수: [거래처] 만 고른 줄은 빈 줄, 담당자 없이 [거래처] + [목표금액] 은 줄 · 월근태: [이름] 만 넣은 줄도 줄. */
function isEntered(board: Board, l: Fields): boolean {
  const has = (k: string) => String(l[k] ?? '').trim() !== ''
  if (board === 'BOND_COLLECT') return ['managerCode', 'target', 'c1', 'c2', 'c3'].some(has)
  if (board === 'MONTHLY_ATTENDANCE') {
    return ['deptCode', 'empCode', 'availDays', 'vacationDays', 'totalHours', 'lateBefore', 'lateAfter', 'absent', 'note'].some(has)
      || num(l.claimedHours) !== 0
  }
  return has(FIRST_KEY[board])
}

/** 계산 칸 — 서버(MultiSlipService#recompute)와 같은 식. 창에서는 소수 둘째 자리. */
function recompute(board: Board, f: Fields): Fields {
  if (board === 'BOND_COLLECT') {
    const target = num(f.target)
    const total = num(f.c1) + num(f.c2) + num(f.c3)
    return { ...f, total: r2(total), shortfall: r2(target - total), rate: target === 0 ? '' : r2(total / target * 100) }
  }
  if (board === 'MONTHLY_ATTENDANCE') {
    const wd = num(f.availDays) - num(f.vacationDays)
    const net = num(f.totalHours) - num(f.claimedHours)
    const std = wd * 9
    const base7 = wd * 7
    return {
      ...f, workDays: String(wd), netHours: String(net), standardHours: String(std), extraHours: String(net - std),
      extraRate: std === 0 ? '' : r2((net - std) / std * 100), cType: base7 === 0 ? '' : r2((net - base7) / base7 * 100),
    }
  }
  return f
}

interface Slip {
  id: number
  board: Board
  slipDate: string
  slipNo: number
  status: 'IN_PROGRESS' | 'DONE'
  statusName: string
  createdAt: string | null
  attachmentId?: number | null
  attachmentName?: string | null
  lines: { lineNo: number; fields: Record<string, unknown> }[]
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
/** 원본 작성일 꼴 '2026/10/14 (수) 오전 3:50:27'. */
function stampText(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.getHours()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dateText(ymd(d))} (${WEEK[d.getDay()]}) ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const slipNoText = (s: Slip) => `${dateText(s.slipDate)}-${s.slipNo}`
const toFields = (o: Record<string, unknown>): Fields =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? '' : String(v)]))

function periodOf(kind: BoardCfg['period']) {
  const y = new Date().getFullYear() - (kind === 'lastYear' ? 1 : 0)
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

/** 원본 구매경로 코드 = 판매경로 관리항목(2026-10-14 실측 1 인터넷판매 · 2 오프라인판매 · 3 증정). */
const ROUTES: CodeItem[] = [
  { value: '1', code: '1', name: '인터넷판매' },
  { value: '2', code: '2', name: '오프라인판매' },
  { value: '3', code: '3', name: '증정' },
]
/** 영업자별 계약상황 [계약코드] — 원본 '계약여부검색' 항목(2026-10-20 loginaa 실측). */
const CONTRACTS: CodeItem[] = [
  { value: '10', code: '10', name: '계약' },
  { value: '20', code: '20', name: '보류' },
  { value: '30', code: '30', name: '실패' },
  { value: '40', code: '40', name: '진행' },
]
const MASTER_TITLE: Record<Master, [string, string, string, string?]> = {
  emp: ['사원검색', '사원코드', '사원명'],
  /** 월근태 [이름] — 원본은 인사 사원 '사원검색' 창(사원번호 · 사원명 · 부서명, 2026-10-20 loginaa 실측). */
  staff: ['사원검색', '사원번호', '사원명', '부서명'],
  dept: ['부서검색', '부서코드', '부서명'],
  route: ['판매경로검색', '코드', '항목명'],
  partner: ['거래처검색', '사업자번호', '거래처명'],
  partnerCode: ['거래처검색', '거래처코드', '거래처명'],
  contract: ['계약여부검색', '코드', '항목명'],
}

export default function MultiSlipPage() {
  const { pathname } = useLocation()
  const cfg = BOARDS[pathname] ?? BOARDS['/groupware/multi-input']
  return <MultiSlipBoardView key={cfg.board} cfg={cfg} />
}

function MultiSlipBoardView({ cfg }: { cfg: BoardCfg }) {
  const [rows, setRows] = useState<Slip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [tab, setTab] = useState<'전체' | '진행중' | '완료'>('전체')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [period, setPeriod] = useState(periodOf(cfg.period))
  const [cond, setCond] = useState(period)
  const [condOpen, setCondOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [stageMenu, setStageMenu] = useState(false)
  const [masters, setMasters] = useState<Record<Master, CodeItem[]>>({ emp: [], staff: [], dept: [], route: ROUTES, partner: [], partnerCode: [], contract: CONTRACTS })

  // 입력 창
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Slip | null>(null)
  /** 원본 수정 창 [복사] — 같은 줄을 채운 새 입력 창('월근태입력', 하단 [저장(F8)▴][리스트][닫기]). */
  const [copied, setCopied] = useState(false)
  const [attachment, setAttachment] = useState<{ id: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [histOf, setHistOf] = useState<Slip | null>(null)
  const [lastOf, setLastOf] = useState<Slip | null>(null)
  const [date, setDate] = useState(ymd(new Date()))
  const [lines, setLines] = useState<Fields[]>([])
  const [dirty, setDirty] = useState(false)
  /* 원본 임시저장(2026-10-21 채권회수 상황판 실측): 새 입력 창에서 값을 넣고 20초쯤 지나면 창 오른쪽 아래에 '오후 11:40 임시저장되었습니다.',
   * 닫아도 남아서 다음에 신규 창을 열면 제목 아래 '○○입력에 임시저장된 내역이 있습니다. [적용] [삭제]'. [적용] 은 줄을 되살리고 안내만 사라진다
   * (임시저장 자체는 남음), [삭제] 는 확인 없이 지운다. 우리는 이 브라우저(localStorage)에 둔다. */
  const draftKey = `ms-draft:${cfg.board}`
  const readDraft = (): { date: string; lines: Fields[] } | null => {
    try { const r = localStorage.getItem(draftKey); return r ? JSON.parse(r) : null } catch { return null }
  }
  const [draftNotice, setDraftNotice] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const draftSnap = useRef('')
  const [emptyAlert, setEmptyAlert] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<Slip[]>('/multi-slips', { params: { board: cfg.board } })
      setRows(r.data)
      setError('')
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const need = new Set(cfg.cols.map((c) => c.master).filter(Boolean))
    if (need.has('emp') || need.has('staff')) api.get<{ code: string; name: string; department: string | null }[]>('/employees')
      .then((r) => setMasters((m) => ({ ...m,
        emp: r.data.map((x) => ({ value: x.code, code: x.code, name: x.name })),
        staff: r.data.map((x) => ({ value: x.code, code: x.code, name: x.name, sub: x.department ?? '' })) }))).catch(() => {})
    if (need.has('dept')) api.get<{ code: string; name: string }[]>('/departments')
      .then((r) => setMasters((m) => ({ ...m, dept: r.data.map((x) => ({ value: x.code, code: x.code, name: x.name })) }))).catch(() => {})
    if (need.has('partner') || need.has('partnerCode')) api.get<{ code: string; name: string; bizRegNo: string | null }[]>('/partners')
      .then((r) => setMasters((m) => ({ ...m,
        partner: r.data.filter((x) => x.bizRegNo).map((x) => ({ value: x.bizRegNo!, code: x.bizRegNo, name: x.name })),
        partnerCode: r.data.map((x) => ({ value: x.code, code: x.code, name: x.name })) }))).catch(() => {})
  }, [cfg])

  const shown = useMemo(() => rows.filter((s) =>
    s.slipDate >= period.from && s.slipDate <= period.to
    && (tab === '전체' || s.statusName === tab)
    && (!keyword.trim() || JSON.stringify(s.lines.map((l) => l.fields)).includes(keyword.trim()))), [rows, period, tab, keyword])

  const blankLine = (): Fields => Object.fromEntries([...cfg.cols, ...(cfg.second ? [cfg.second] : [])].map((c) => [c.key, c.init ?? '']))
  const blankLines = (n: number) => Array.from({ length: n }, blankLine)

  function openNew() {
    setEditing(null)
    setCopied(false)
    setAttachment(null)
    setDate(ymd(new Date()))
    setLines(blankLines(cfg.rows))
    setDraftNotice(!!readDraft())
    setDraftSavedAt('')
    draftSnap.current = ''
    setDirty(false)
    setError('')
    setOpen(true)
  }
  useShortcut('F2', open ? undefined : openNew)

  function openEdit(s: Slip) {
    setEditing(s)
    setDraftNotice(false)
    setDraftSavedAt('')
    setCopied(false)
    setAttachment(s.attachmentId ? { id: s.attachmentId, name: s.attachmentName ?? '첨부' } : null)
    setDate(s.slipDate)
    // 원본 수정 창은 내용 줄 + 빈 줄
    setLines([...s.lines.map((l) => ({ ...blankLine(), ...toFields(l.fields) })), blankLine()])
    setDirty(false)
    setError('')
    setOpen(true)
  }

  /** 원본 [복사] — 지금 줄을 그대로 둔 새 입력 창(일자는 오늘). */
  function copyOne() {
    setEditing(null)
    setCopied(true)
    setAttachment(null)
    setDate(ymd(new Date()))
    setDirty(false)
    setError('')
  }
  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', await shrinkImage(file))
      const r = await api.post<{ id: number; name: string }>('/files', fd)
      setAttachment({ id: r.data.id, name: r.data.name })
      setDirty(true)
    } catch (e) { setError(extractErrorMessage(e)) } finally { setUploading(false) }
  }

  async function close() {
    if (dirty && !(await ecConfirm('작성한 내용이 저장되지 않았습니다. 페이지를 벗어나겠습니까?'))) return
    setOpen(false)
  }

  useEffect(() => {
    if (!open || editing || copied || !dirty) return
    const t = window.setInterval(() => {
      const snap = JSON.stringify([date, lines])
      if (snap === draftSnap.current) return
      draftSnap.current = snap
      try { localStorage.setItem(draftKey, JSON.stringify({ date, lines })) } catch { return }
      const n = new Date()
      setDraftSavedAt(`${n.getHours() < 12 ? '오전' : '오후'} ${n.getHours() % 12 === 0 ? 12 : n.getHours() % 12}:${String(n.getMinutes()).padStart(2, '0')} 임시저장되었습니다.`)
    }, 20000)
    return () => window.clearInterval(t)
  }, [open, editing, copied, dirty, date, lines, draftKey])

  function setCell(i: number, key: string, v: string) {
    setLines((ls) => ls.map((l, j) => (j === i ? recompute(cfg.board, { ...l, [key]: v }) : l)))
    setDirty(true)
  }
  function pickCode(i: number, col: InCol, v: string) {
    const item = masters[col.master!].find((x) => x.value === v)
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [col.key]: v, ...(col.nameKey ? { [col.nameKey]: item?.name ?? '' } : {}) } : l)))
    setDirty(true)
  }
  function insertLine(i: number) {
    setLines((ls) => [...ls.slice(0, i), blankLine(), ...ls.slice(i)])
  }

  async function save(after: 'close' | 'new' | 'keep' = 'close') {
    const filled = lines.filter((l) => isEntered(cfg.board, l))
    // 원본 월근태는 빈 창도 저장한다(빈 전표 — 서버가 빈 줄 하나로 받는다)
    if (filled.length === 0 && cfg.board !== 'MONTHLY_ATTENDANCE') { setEmptyAlert(true); return }
    setSaving(true)
    try {
      const body = { board: cfg.board, slipDate: date, lines: filled, attachmentId: attachment?.id }
      const saved = editing
        ? (await api.put<Slip>(`/multi-slips/${editing.id}`, body)).data
        : (await api.post<Slip>('/multi-slips', body)).data
      if (!editing) { try { localStorage.removeItem(draftKey) } catch { /* 없어도 됨 */ } }
      // 원본: 안내 없이 창이 닫히고 목록 맨 위에 새 줄. [저장(F8)▴] 의 저장/신규는 빈 새 창, 저장/내용유지는 저장한 전표의 수정 창.
      if (after === 'new') openNew()
      else if (after === 'keep') openEdit(saved)
      else setOpen(false)
      void load()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  useShortcut('F8', open ? () => void save() : undefined)

  async function remove() {
    if (!editing) return
    if (!(await ecConfirm(`전표를 삭제하겠습니까? - ${cfg.title}`))) return
    try {
      await api.delete(`/multi-slips/${editing.id}`)
      setOpen(false)
      void load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function changeStatus(status: 'IN_PROGRESS' | 'DONE') {
    setStageMenu(false)
    if (!requireSelection(selected.size)) return
    try {
      await api.patch('/multi-slips/status', { ids: [...selected], status })
      setSelected(new Set())
      void load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function deleteSelected() {
    if (!requireSelection(selected.size)) return
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const id of selected) await api.delete(`/multi-slips/${id}`)
      setSelected(new Set())
      void load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  function toggle(id: number) {
    setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const gridRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(gridRef, `${cfg.title} 목록`, [shown.length, loading, cfg.board])
  useTableColumnCheck(inputRef, `${cfg.title}입력`, [lines.length, open, cfg.board])
  const firstHead = cfg.linkHead ?? '전표일자-No.'
  const colCount = 2 + cfg.list.length
  const [year, month, day] = date.split('-')
  const setYmd = (y: string, m: string, d: string) => {
    const last = new Date(Number(y), Number(m), 0).getDate()
    const dd = String(Math.min(Math.max(Number(d) || 1, 1), last)).padStart(2, '0')
    setDate(`${y}-${m}-${dd}`)
    setDirty(true)
  }
  const thisYear = new Date().getFullYear()

  function inputCell(i: number, c: InCol, l: Fields) {
    const v = l[c.key] ?? ''
    if (c.kind === 'code') {
      const [title, codeHead, nameHead, subHead] = MASTER_TITLE[c.master!]
      return <GridCode title={title} codeHead={codeHead} nameHead={nameHead} subHead={subHead} items={masters[c.master!]} value={v}
                       showName={c.showName} onPick={(x) => pickCode(i, c, x)}
                       emptyEnterNext={c.key === 'contractCode' ? 1 : cfg.board === 'BOND_COLLECT' && c.key === 'managerCode' ? 2 : undefined} />
    }
    if (c.kind === 'calc') return <input className="ec-input w-full text-right" aria-label={c.head} value={v} readOnly disabled />
    if (c.kind === 'memo') return <textarea className="ec-input w-full h-[26px] resize-y" aria-label={c.head} value={v} onChange={(e) => setCell(i, c.key, e.target.value)} />
    if (c.kind === 'none') return null
    return <input className={`ec-input w-full${c.kind === 'num' ? ' text-right' : ''}`} aria-label={c.head} value={v}
                  inputMode={c.kind === 'num' ? 'decimal' : undefined} onChange={(e) => setCell(i, c.key, e.target.value)} />
  }

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">{cfg.title}</span>
        <div className="ec-pills ml-[8px]">
          {(['전체', '진행중', '완료'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`ec-pill no-ec${tab === t ? ' active' : ''}`}>{t}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-[4px]">
          <input className="ec-input w-[110px]" placeholder="입력 후 [Enter]" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <button className="ec-btn ec-btn-primary" onClick={() => { if (!keyword.trim()) setCondOpen((v) => !v) }}>Search(F3)</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {condOpen && (
        <div className="ec-cond mb-[8px]">
          <ul className="ec-form border-0">
            <li className="wide">
              <div className="title">일자</div>
              <div className="form gap-[4px]">
                <input type="date" className="ec-input w-[140px]" value={cond.from} onChange={(e) => setCond((c) => ({ ...c, from: e.target.value }))} />
                ~
                <input type="date" className="ec-input w-[140px]" value={cond.to} onChange={(e) => setCond((c) => ({ ...c, to: e.target.value }))} />
              </div>
            </li>
          </ul>
          <div className="flex flex-wrap gap-[4px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => { setPeriod(cond); setCondOpen(false) }}>검색(F8)</button>
            <EcPeriodPicks labels={BOARD_PICKS} currentFrom={cond.from} onPick={(r) => setCond({ from: r.from, to: r.to })} />
            <button type="button" className="ec-btn" onClick={() => setCond(periodOf(cfg.period))}>다시작성</button>
          </div>
        </div>
      )}

      {error && !open && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {info && <p className="ec-alert mb-[8px]" onClick={() => setInfo('')}>{info}</p>}

      <div className="text-right text-[12px] text-ec-ink mb-[4px]">{dateText(period.from)} ~ {dateText(period.to)}</div>

      <div id="multi-slip-list" ref={gridRef} className="flex-1 min-h-0 overflow-x-auto">
        <table className="w-full ec-multi-slip">
          <colgroup>
            <col width={34} />
            <col width={cfg.board === 'MONTHLY_ATTENDANCE' ? 188 : 130} />
            {cfg.list.map((c) => <col key={c.head} width={c.width} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="cursor-pointer" title="전체 선택 / 해제"
                  onClick={() => setSelected(selected.size === shown.length ? new Set() : new Set(shown.map((r) => r.id)))}>
                {shown.length > 0 && selected.size === shown.length ? '☑' : ''}
              </th>
              <th className="text-center">{firstHead}</th>
              {cfg.list.map((c) => <th key={c.head} className="text-center">{c.head}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="ec-empty">불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={colCount} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((s, i) => {
              const f = toFields(s.lines[0]?.fields ?? {})
              return (
                <tr key={s.id}>
                  <td className={`text-center cursor-pointer select-none ${selected.has(s.id) ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'bg-ec-stripe text-ec-hint'}`}
                      title="눌러서 이 전표를 고릅니다" onClick={() => toggle(s.id)}>{i + 1}</td>
                  <td className="text-center">
                    <a href="#" className="ec-link" onClick={(e) => { e.preventDefault(); openEdit(s) }}>
                      {cfg.linkHead ? dateText(f.contractDate || s.slipDate) : slipNoText(s)}
                    </a>
                  </td>
                  {cfg.list.map((c) => (
                    <td key={c.head} className={`${c.align === 'right' ? 'text-right' : c.align === 'left' ? 'text-left' : 'text-center'}${c.pre ? ' whitespace-pre-wrap' : ''}`}>
                      {c.cell(f, s)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
        <button className="ec-btn ec-btn-primary" onClick={openNew}>신규(F2)</button>
        {/* 원본 [보내기 ▲] · [업무지원AI ▲] — 메일 · 바깥 AI 로 나가는 기능이라 모양만 둔다. */}
        <button className="ec-btn" onClick={() => setInfo('보내기는 지원하지 않습니다(메일 · 쪽지 발송).')}>보내기 ▲</button>
        <button className="ec-btn" onClick={() => setInfo('업무지원AI는 지원하지 않습니다(바깥 서비스).')}>업무지원AI ▲</button>
        <span className="relative">
          <button className="ec-btn" onClick={() => setStageMenu((v) => !v)}>진행상태변경 ▲</button>
          {stageMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setStageMenu(false)} />
              <ul role="menu" aria-label="진행상태변경"
                  className="absolute bottom-full left-0 mb-[4px] z-[41] min-w-[140px] py-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                {([['IN_PROGRESS', '진행중'], ['DONE', '완료']] as const).map(([k, label]) => (
                  <li key={k}>
                    <button type="button" role="menuitem" className="no-ec w-full text-left px-[10px] py-[4px] bg-transparent border-0 cursor-pointer hover:bg-ec-blue-wash"
                            onClick={() => void changeStatus(k)}>{label}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </span>
        <button className="ec-btn" onClick={() => void deleteSelected()}>선택삭제</button>
        <button className="ec-btn" onClick={() => { const t = document.querySelector<HTMLTableElement>('#multi-slip-list table'); if (t) void exportTableToXlsx(t, cfg.title) }}>Excel</button>
        <button className="ec-btn" onClick={() => setInfo('이력조회는 아직 지원하지 않습니다.')}>이력조회</button>
        <button className="ec-btn" onClick={() => setInfo('웹자료올리기는 지원하지 않습니다.')}>웹자료올리기</button>
      </div>

      <Modal open={open} error={error} title={`${cfg.title}입력${editing ? '(수정)' : ''}`} width={cfg.width} onClose={() => void close()}>
        <div className="flex justify-end gap-[4px] mb-[6px]">
          <button type="button" className="ec-btn">{cfg.title} ▾</button>
          <button type="button" className="ec-btn">Option</button>
          <button type="button" className="ec-btn">도움말</button>
        </div>
        {draftNotice && !editing && !copied && (
          <div className="text-[12px] mb-[6px]">
            {cfg.title}입력에 임시저장된 내역이 있습니다.{' '}
            <button type="button" className="text-ec-navy cursor-pointer" onClick={() => {
              const d = readDraft()
              if (d) { setDate(d.date); setLines(d.lines); setDirty(true); draftSnap.current = JSON.stringify([d.date, d.lines]) }
              setDraftNotice(false)
            }}>적용</button>{' '}
            <button type="button" className="text-ec-navy cursor-pointer" onClick={() => {
              try { localStorage.removeItem(draftKey) } catch { /* 없어도 됨 */ }
              setDraftNotice(false)
            }}>삭제</button>
          </div>
        )}
        <ul className="ec-form mb-[8px]">
          <li className="wide">
            <div className="title">일자-No.</div>
            <div className="form gap-[4px] flex-nowrap">
              <select className="ec-input w-[80px]" aria-label="년" value={year} onChange={(e) => setYmd(e.target.value, month, day)}>
                {Array.from({ length: 11 }, (_, k) => String(thisYear - 5 + k)).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              /
              <select className="ec-input w-[60px]" aria-label="월" value={month} onChange={(e) => setYmd(year, e.target.value, day)}>
                {Array.from({ length: 12 }, (_, k) => String(k + 1).padStart(2, '0')).map((m) => <option key={m} value={m}>{Number(m)}</option>)}
              </select>
              /
              <input className="ec-input w-[44px] text-center" aria-label="일" value={String(Number(day))} onChange={(e) => setYmd(year, month, e.target.value.replace(/\D/g, ''))} />
              <input type="date" className="ec-input w-[30px]" aria-label="달력" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setDirty(true) } }} />
              {editing && <span>- {editing.slipNo}</span>}
            </div>
          </li>
          {cfg.board === 'SALES_CONTRACT' && (
            <li className="wide">
              <div className="title">첨부</div>
              <div className="form">
                <EcFileDrop busy={uploading} disabled={uploading} hint="+" onFiles={(fs) => { if (fs[0]) void upload(fs[0]) }}>
                  {attachment && (
                    <span className="text-[12px] text-ec-navy">
                      {attachment.name}
                      <span onClick={() => { setAttachment(null); setDirty(true) }} className="cursor-pointer ml-[6px] font-bold">×</span>
                    </span>
                  )}
                </EcFileDrop>
              </div>
            </li>
          )}
        </ul>
        <div className="flex gap-[4px] mb-[4px]">
          <button type="button" className="ec-btn ec-btn-sm">찾기(F3)</button>
          <button type="button" className="ec-btn ec-btn-sm">정렬</button>
        </div>
        <div ref={inputRef} className="overflow-x-auto">
          <table className="table-fixed ec-multi-slip-input">
            <colgroup>
              <col width={30} />
              <col width={24} />
              {cfg.cols.map((c) => <col key={c.key} width={c.width} />)}
            </colgroup>
            <thead>
              <tr>
                <th />
                <th />
                {cfg.cols.map((c) => <th key={c.key} className="text-center">{c.head}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <Fragment key={i}>
                  <tr>
                    <td className="text-center bg-ec-stripe text-ec-hint" rowSpan={cfg.second ? 2 : 1}>{i + 1}</td>
                    <td className="text-center" rowSpan={cfg.second ? 2 : 1}>
                      <button type="button" className="no-ec bg-transparent border-0 cursor-pointer text-ec-hint" aria-label="줄 넣기" onClick={() => insertLine(i)}>⊕</button>
                    </td>
                    {cfg.cols.map((c) => <td key={c.key}>{inputCell(i, c, l)}</td>)}
                  </tr>
                  {cfg.second && (
                    <tr>
                      <td colSpan={cfg.cols.length - 1}>{inputCell(i, cfg.second, l)}</td>
                      <td />
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            {/* 원본 채권회수 입력 격자 아래 합계줄(2026-10-14 실측 목표 1,000 · 1차 300 → '1,000.00 · 300.00 · 0.00 · 0.00 · 300.00 · 700.00 · 30.00') */}
            {cfg.board === 'BOND_COLLECT' && (
              <tfoot>
                <tr>
                  {/* 번호 · ⊕ · 담당자 · 거래처 = 금액 칸(뒤 7칸) 앞의 칸 수 — 열 수는 useTableColumnCheck 가 실행 중에 본다 */}
                  <td colSpan={2 + cfg.cols.length - 7} />
                  {cfg.cols.slice(2).map((c) => (
                    <td key={c.key} className="text-right font-bold">{fmt(String(lines.reduce((t, l) => t + num(l[c.key]), 0)), 2)}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="flex flex-wrap gap-[6px] mt-[10px]">
          {editing ? (
            <>
              <MenuButton label="저장(F8)" className="ec-btn ec-btn-primary" up disabled={saving} onMain={() => void save()}
                          items={[{ label: '저장/신규', onClick: () => void save('new') }, { label: '저장/내용유지', onClick: () => void save('keep') }]} />
              <button type="button" className="ec-btn" onClick={copyOne}>복사</button>
              <button type="button" className="ec-btn" onClick={() => void close()}>리스트</button>
              <button type="button" className="ec-btn" onClick={() => void close()}>닫기</button>
              <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>
              <button type="button" className="ec-btn" onClick={() => editing && setHistOf(editing)}>H</button>
              <button type="button" className="ec-btn" onClick={() => editing && setLastOf(editing)}>최종이력</button>
            </>
          ) : (
            <>
              <MenuButton label="저장(F8)" className="ec-btn ec-btn-primary" up disabled={saving} onMain={() => void save()}
                          items={[{ label: '저장/신규', onClick: () => void save('new') }, { label: '저장/내용유지', onClick: () => void save('keep') }]} />
              {!copied && <button type="button" className="ec-btn" onClick={() => { setLines(blankLines(cfg.rows)); setDirty(false) }}>다시 작성</button>}
              <button type="button" className="ec-btn" onClick={() => void close()}>리스트</button>
              <button type="button" className="ec-btn" onClick={() => void close()}>닫기</button>
              {!copied && <button type="button" className="ec-btn">웹자료올리기</button>}
            </>
          )}
          {draftSavedAt && <span className="ml-auto self-center text-[12px]">{draftSavedAt}</span>}
        </div>
      </Modal>

      {/* 원본 빈 저장 — 알림 표(구분 | 메뉴 | 사유) [닫기] */}
      <Modal open={emptyAlert} error={error} title="알림" width={560} onClose={() => setEmptyAlert(false)}>
        <p className="mb-[8px] leading-[1.6]">
          아래의 경우 처리가 불가능합니다.<br />
          자세한 내용은 아래의 사항을 참고하시기 바랍니다.<br />
          아래 사항을 수정 후 다시 진행하시기 바랍니다.
        </p>
        <table className="w-full">
          <thead><tr><th className="text-center">구분</th><th className="text-center">메뉴</th><th className="text-left">사유</th></tr></thead>
          <tbody>
            <tr>
              <td className="text-center">{date.replace(/-/g, '')}</td>
              <td className="text-center">{cfg.title}입력</td>
              <td>그리드(표)에 최소 1줄 이상 입력되어야 합니다.</td>
            </tr>
          </tbody>
        </table>
        <div className="flex justify-center mt-[10px]">
          <button type="button" className="ec-btn" onClick={() => setEmptyAlert(false)}>닫기</button>
        </div>
      </Modal>

      {/* 수정 창 [H] · [최종이력] — 원본 월근태 실측(2026-10-21): 이력 머리 '[20261021-n]' · 거래이력 전표상태 '확인' · 진행상태 · 행위 신규/수정 */}
      {histOf && (
        <SlipHistoryModal target="MULTI_SLIP" id={histOf.id} withSections confirmLabel="확인"
                          head={`[${histOf.slipDate.replace(/-/g, '')}-${histOf.slipNo}]`} onClose={() => setHistOf(null)} />
      )}
      {lastOf && <SlipLastHistoryModal target="MULTI_SLIP" id={lastOf.id} onClose={() => setLastOf(null)} />}
    </div>
  )
}

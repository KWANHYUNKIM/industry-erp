import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useAuth } from '../../features/auth/AuthContext'
import { useTableSort } from '../../utils/useTableSort'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import type { ApprovalDoc, ApprovalField, ApprovalFormTemplate, ApprovalStatus } from '../../types/api'
import ApprovalDetailModal, { STATUS_LABEL, VOUCHER_LABEL, statusColor } from '../../features/approval/components/ApprovalDetailModal'
import { ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useShortcut } from '../../utils/useShortcut'
import { requireSelection } from '../../components/EcDialog'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EcIcon from '../../components/ui/EcIcon'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { periodOf } from '../../utils/periods'
import AppWindow from '../../features/appbar/AppWindow'
import ApprovalDraftPage from './ApprovalDraftPage'
import StampSignModal from '../../features/approval/components/StampSignModal'

/**
 * 알약(탭)은 화면마다 마지막 하나가 다르다 — 원본에서 확인했다.
 *   내결재관리     : 전체·기안중·진행중·반려·결재·**수신참조**
 *   기안서통합관리 : 전체·기안중·진행중·반려·결재·**삭제**
 * 앞의 다섯은 같고, 내 결재함에서는 '내가 수신참조로 걸린 문서', 통합관리에서는
 * '지운 문서'를 마지막 칸으로 본다. 우리는 둘 다 '삭제'로 두고 있었다.
 */
const COMMON_TABS = ['전체', '기안중', '진행중', '반려', '결재'] as const
/** 원본 작업일시 꼴 — '2026/10/14 오전 0:02:16' */
const actedText = (iso: string) => {
  const d = new Date(iso)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${d.toLocaleTimeString('ko-KR')}`
}
const TABS_MINE = [...COMMON_TABS, '수신참조'] as const
const TABS_ALL = [...COMMON_TABS, '삭제'] as const
type Tab = (typeof TABS_MINE)[number] | (typeof TABS_ALL)[number]

/** [라벨] 단추의 '라벨없음' — 라벨을 달지 않은 문서만 */
const LABEL_NONE = '(라벨없음)'
/** [라벨] 팝업의 '라벨있음' — 라벨이 달린 문서만 */
const LABEL_ANY = '(라벨있음)'
const labelText0 = (v: string) => (v === LABEL_NONE ? '라벨없음' : v === LABEL_ANY ? '라벨있음' : v)

/**
 * 원본 [Option](2026-10-30 E070105 · E070108 클릭 대조) — 검색항목설정 · 양식설정 · 조건양식설정.
 * 검색항목 · 양식 디자이너는 두지 않아 다른 현황 화면(이익관리 VariancePage)처럼 안내만 한다.
 */
const OPTION_MENU = [
  { label: '검색항목설정', onClick: () => void ecAlert('검색항목설정은 지원하지 않습니다.') },
  { label: '양식설정', onClick: () => void ecAlert('양식설정은 지원하지 않습니다(양식 하나).') },
  { label: '조건양식설정', onClick: () => void ecAlert('조건양식설정은 지원하지 않습니다.') },
]

/** 원본 내결재관리 조건 판 [검색(F8)] 옆 ▾ 기간 빠른선택(2026-10-30 실측) */
const MINE_PICKS = ['최근30일(+1개월)', '전월+금월'] as const

const TAB_STATUS: Record<Exclude<Tab, '전체' | '삭제' | '수신참조'>, ApprovalStatus> = {
  기안중: 'DRAFTING',
  진행중: 'IN_PROGRESS',
  반려: 'REJECTED',
  결재: 'APPROVED',
}

const inTab = (d: ApprovalDoc, tab: Tab, myName?: string) => {
  if (tab === '삭제') return d.deleted
  if (d.deleted) return false
  if (tab === '수신참조') {
    return !!myName && d.participants.some((p) => p.role === 'REFERENCE' && p.userName === myName)
  }
  if (tab === '전체') return true
  return d.status === TAB_STATUS[tab]
}

/** 내결재관리(scope=mine) / 기안서통합관리(scope=all) 공용 목록 — 실제 결재 연동 */
export default function ApprovalListPage({
  title, scope, bottomActions = [],
}: {
  title: string
  scope: 'mine' | 'all'
  bottomActions?: string[]
}) {
  const { user, companyCode } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<ApprovalDoc[]>([])
  /*
   * 원본 기안서통합관리 조건의 <b>[출력양식]·[부서]</b>. 우리는 목록 글자를 훑는
   * 검색상자 하나뿐이라, 기안서가 쌓이면 <b>양식이나 부서로 좁힐 방법이 없었다</b> —
   * '지출결의서만' 이나 '생산부가 낸 것만' 을 보려면 눈으로 골라야 했다.
   */
  const [formType, setFormType] = useState('')
  const [dept, setDept] = useState('')
  /*
   * 원본 기안서통합관리 조건은 구분 · 출력양식 · 부서 · [프로젝트] · [라벨] 이다.
   * 뒤 둘이 없었다 — 응답에는 projectName·labelText 가 <b>이미 실려 있었는데</b>
   * 화면이 거르는 데 쓰지 않았다. 라벨은 목록에서 달아 놓고 그걸로 찾을 수가 없었다.
   */
  const [project, setProject] = useState('')
  const [labelCond, setLabelCond] = useState('')
  /*
   * 원본 조건 판에는 [제목]·[기안서No.]도 따로 있다. 우리는 목록 글자를 훑는
   * 검색상자 하나뿐이라, 제목만으로 좁히고 싶어도 본문·기안자까지 걸려들었다.
   */
  /*
   * 원본 내결재관리 조건 차례: 기준일자 · 기안서No. · 구분 · <b>기안자</b> · 제목 · <b>내용</b>.
   * 둘 다 문서에 실려 오는데 거를 수가 없어, 검색상자 하나로 제목·본문·기안자가
   * 한꺼번에 걸렸다 — 누가 쓴 것인지로만 좁힐 수가 없었다.
   */
  const [drafterCond, setDrafterCond] = useState('')
  const [contentCond, setContentCond] = useState('')
  const [titleCond, setTitleCond] = useState('')
  const [docNoCond, setDocNoCond] = useState('')
  /** 원본 [결재라인] — 그 사람이 결재선에 든 문서만 본다. */
  const [lineCond, setLineCond] = useState('')
  /** 원본 [첨부] — 붙임 파일이 있는 문서만/없는 문서만. */
  const [attachCond, setAttachCond] = useState<'전체' | '있음' | '없음'>('전체')
  /* 원본 기안서통합관리는 [진행중] 알약이 켜진 채로 열린다(2026-10-03 실측). 내결재관리는 전체. */
  /* 원본 기안서통합관리 · 내결재관리 둘 다 [진행중] 알약이 켜진 채로 열린다(2026-10-03 실측). */
  const [tab, setTab] = useState<Tab>('진행중')
  const TABS: readonly Tab[] = scope === 'mine' ? TABS_MINE : TABS_ALL
  /* 기간 줄 이름 — 두 화면 모두 [기준일자](2026-10-30 원본 기안서통합관리 실측 · 사본에서 '일자' 로 봤던 것을 바로잡음). */
  const dateLabel = '기준일자'
  /**
   * 빈 줄이 걸칠 칸 수. [작업자]·[작업일시]가 scope 에 따라 붙었다 빠지므로
   * 숫자를 두 군데 적으면 한쪽만 고치게 된다 — 실제로 이 저장소에서 가장 자주 낸 실수다.
   */
  /*
   * 원본 두 화면의 열이 다르다(2026-10-03 실측):
   *   기안서통합관리 — 기안일자 · 제목 · ERP전표(건) · 구분 · 기안자 · 결재자 · 진행상태 · 결재 · 기안서복사 · 조회 · 연결전표
   *   내결재관리     — 기안일자 · 제목 · 기안자 · 결재자 · 진행상태 · 결재 · 기안서복사 · 연결전표 · 첨부
   */
  const isAll = scope === 'all'
  /*
   * 원본 기안서통합관리 [삭제] 알약만 열이 다르다(2026-10-20 E070108 실측):
   *   다른 알약 — 기안일자 · 제목 · ERP전표(건) · 구분 · 기안자 · 결재자 · 진행상태 · 결재 · 기안서복사 · 조회 · 연결전표
   *   [삭제]    — 기안일자 · 제목 · 구분 · 기안자 · 결재자 · 결재 · 작업자 · 작업일시(지운 때)
   */
  const delView = isAll && tab === '삭제'
  /** 내결재관리 [기안중] 알약 — 하단 [보내기] · [결재/검토완료] · [인쇄] 가 없다 */
  const draftTab = !isAll && tab === '기안중'
  const colCount = delView ? 9 : 12
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 기안서 작성 화면이 넘겨준 저장 결과(번호). 넘어오자마자 보여 줄 자리가 여기뿐이다. */
  const passedNotice = (useLocation().state as { notice?: string } | null)?.notice ?? ''
  const [detail, setDetail] = useState<ApprovalDoc | null>(null)
  // 상세에서 formData 의 키를 사람이 읽는 라벨로 바꾸기 위해 양식 스키마를 받아둔다.
  const [schemas, setSchemas] = useState<Record<number, ApprovalField[]>>({})
  // 원본 하단 버튼줄의 [결재/검토완료]·[라벨변경]은 **고른 문서에 한꺼번에** 하는 동작이다.
  // 그러려면 행을 고를 수 있어야 하는데 우리 목록엔 그 방법이 없었다.
  // 원본처럼 줄 앞 체크박스로 고른다(머리 체크박스 = 지금 쪽 전체).
  const [selected, setSelected] = useState<Set<number>>(new Set())
  /** 원본 목록은 한 쪽 15줄이다(2026-10-03 실측 — 1 2 3 / 3). */
  const [page, setPage] = useState(1)
  /** 조건 판 — 원본은 접어 두고 [Search(F3)] 로 편다. */
  const [condOpen, setCondOpen] = useState(false)
  // 원본은 목록 위에 기안일자 기간을 놓는다(기본 오늘 −30일 ~ +30일).
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(() => ymd(new Date(Date.now() + 30 * 86400000)))

  const bodyRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [optionOpen, setOptionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notice, setNotice] = useState('')
  /** 머리 [라벨] 단추의 목록 · 조건 판 [검색(F8)] ▾ · [My도장/서명] 창 */
  const [labelOpen, setLabelOpen] = useState(false)
  const [picksOpen, setPicksOpen] = useState(false)
  const [stampOpen, setStampOpen] = useState(false)
  /** 내결재관리 [신규(F2)] — 원본은 '기안서작성' 이 떠 있는 창이다(2026-10-31 클릭 대조). busy: 그 안의 작성 폼이 떠 있는 동안 Esc 가 창까지 닫지 않게. */
  const [draftWinOpen, setDraftWinOpen] = useState(false)
  const draftBusy = useRef(false)
  const [labelTyping, setLabelTyping] = useState(false)
  const [labelText, setLabelText] = useState('')

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const filterRows = (q: string) => {
    const table = findDataTable(bodyRef.current)
    if (!table) return
    const needle = q.trim().toLowerCase()
    let hit = 0
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const row = tr as HTMLTableRowElement
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) return
      const match = !needle || (row.textContent ?? '').toLowerCase().includes(needle)
      row.style.display = match ? '' : 'none'
      if (match) hit += 1
    })
    if (needle) flash(`'${q.trim()}' 검색결과 ${hit}건`)
  }

  // Search(F3) — 버튼 라벨이 약속한 단축키
  useShortcut('F3', () => filterRows(search))

  async function doExcel() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 내보낼 표가 없습니다.')
    if (!(await exportTableToXlsx(table, title))) flash('내보낼 자료가 없습니다.')
  }

  function doPrint() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 인쇄할 표가 없습니다.')
    if (!printTable(table, title)) flash('인쇄할 자료가 없습니다.')
  }

  async function load() {
    setLoading(true)
    try {
      // 삭제 탭을 위해 삭제분까지 한 번에 받아 클라이언트에서 가른다.
      const r = await api.get<ApprovalDoc[]>('/approvals', { params: { scope, includeDeleted: true } })
      setRows(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  useEffect(() => {
    api.get<ApprovalFormTemplate[]>('/approval-form-templates')
      .then((r) => setSchemas(Object.fromEntries(r.data.map((t) => [t.id, t.fieldSchema]))))
      .catch(() => {})
  }, [])

  /** 원본 [구분] — 기안서의 구분(그룹) 이름. 양식(formTypeName)과 다르다(휴가신청서 양식 → 구분 '휴가신청서', 출장보고서 양식 → 빈칸). */
  const catOf = (d: ApprovalDoc) => (d as ApprovalDoc & { category?: string | null }).category ?? ''
  const inPeriod = (d: ApprovalDoc) =>
    (!from || (d.draftDate ?? '') >= from) && (!to || (d.draftDate ?? '') <= to)
  // 원본 기안서통합관리 [전체] 에는 기안중(임시저장) 문서가 없다 — [기안중] 알약에만 선다(2026-10-14 E070108 실측). 내결재관리 [전체] 에는 있다.
  const filtered = rows.filter((r) => inTab(r, tab, user?.name)).filter(inPeriod)
    .filter((r) => !(isAll && tab === '전체' && r.status === 'DRAFTING'))
    .filter((r) => !formType || catOf(r) === formType)
    .filter((r) => !dept || (r.department ?? '') === dept)
    .filter((r) => !project || String(r.projectId ?? '') === project)
    .filter((r) => !labelCond || (labelCond === LABEL_NONE ? !r.labelText : labelCond === LABEL_ANY ? !!r.labelText : (r.labelText ?? '') === labelCond))
    .filter((r) => !drafterCond || r.drafterName.includes(drafterCond))
    .filter((r) => !contentCond || (r.content ?? '').includes(contentCond))
    .filter((r) => !titleCond || r.title.includes(titleCond))
    .filter((r) => !docNoCond || r.docNo.includes(docNoCond) || (r.draftNo ?? '').includes(docNoCond))
    .filter((r) => !lineCond || (r.lines ?? []).some((l) => l.approverName === lineCond))
    .filter((r) => attachCond === '전체' || (attachCond === '있음' ? r.attachmentId != null : r.attachmentId == null))

  /*
   * 사본 내결재관리는 <b>기안일자·구분·기안자</b> 세 칸에 정렬 표시를 단다.
   * 우리는 표시조차 없어 결재함이 쌓이면 <b>누가 올린 것부터</b> 볼 수가 없었다.
   *
   * <p>[기안일자] 칸에 찍히는 값은 <code>draftNo</code> 다(20260828-001 처럼 일자+일련번호).
   * 그래서 그 값으로 세우면 <b>날짜 차례가 되고 같은 날은 낸 차례</b>로 선다 —
   * 찍힌 글자와 정렬이 어긋나지 않는다.
   *
   * <p>고르기(selected)와 전체선택은 <code>filtered</code> 를 그대로 쓴다. 정렬은 보이는
   * 차례만 바꾸지 <b>어떤 줄이 있는지는 안 바꾸므로</b> 그쪽은 손대지 않는다.
   */
  const sort = useTableSort(filtered, {
    기안일자: (r) => r.draftNo,
    구분: (r) => catOf(r),
    기안자: (r) => r.drafterName,
  })
  const PAGE_SIZE = 15
  const pages = Math.max(1, Math.ceil(sort.sorted.length / PAGE_SIZE))
  const curPage = Math.min(page, pages)
  const pageRows = sort.sorted.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)

  /** 조건 보기에 채울 값 — 지금 목록에 실제로 있는 것만 고르게 한다. */
  const formTypes = [...new Set(rows.map(catOf).filter(Boolean))].sort()
  const depts = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort() as string[]
  /* 프로젝트는 이름이 겹칠 수 있어 id 로 고르고 거른다(코드도움). */
  const projects = [...new Map(rows.filter((r) => r.projectId != null)
    .map((r) => [r.projectId, { value: String(r.projectId), name: r.projectName ?? '' }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const labels = [...new Set(rows.map((r) => r.labelText).filter(Boolean))].sort() as string[]
  const approvers = [...new Set(rows.flatMap((r) => (r.lines ?? []).map((l) => l.approverName)))].sort()

  /** 조건 판 [다시 작성] — 칸을 처음 값으로(기간은 오늘 −30일 ~ +30일). */
  function resetConds() {
    setFrom(ymd(new Date(Date.now() - 30 * 86400000))); setTo(ymd(new Date(Date.now() + 30 * 86400000)))
    setDocNoCond(''); setFormType(''); setDrafterCond(''); setTitleCond(''); setContentCond('')
    setLineCond(''); setDept(''); setProject(''); setAttachCond('전체'); setLabelCond(''); setPage(1)
  }

  const isMyTurn = (d: ApprovalDoc) =>
    !d.deleted && d.status === 'IN_PROGRESS' && d.currentApproverName === user?.name

  const isMine = (d: ApprovalDoc) => d.drafterName === user?.name

  async function act(d: ApprovalDoc, kind: 'approve' | 'reject') {
    const comment = kind === 'reject' ? window.prompt('반려 사유를 입력하세요.', '') : window.prompt('결재 의견(선택).', '')
    if (kind === 'reject' && comment === null) return
    try {
      await api.post(`/approvals/${d.id}/${kind}`, { comment: comment || undefined })
      setDetail(null)
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  const toggleSelect = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  /**
   * 원본 [결재/검토완료] — 고른 문서 중 **내 차례인 것만** 결재한다.
   * 내 차례가 아닌 문서는 서버가 막으므로, 미리 걸러 내고 몇 건을 건너뛰었는지 알려 준다.
   */
  async function approveSelected() {
    const targets = filtered.filter((d) => selected.has(d.id) && isMyTurn(d))
    const skipped = selected.size - targets.length
    if (targets.length === 0) {
      flash(selected.size === 0
        ? '결재할 문서를 고르세요. 줄 앞 체크박스로 고릅니다.'
        : '고른 문서 중 지금 내 차례인 것이 없습니다.')
      return
    }
    if (!(await ecConfirm(`${targets.length}건을 결재할까요?`))) return
    const failed: string[] = []
    for (const d of targets) {
      try {
        await api.post(`/approvals/${d.id}/approve`, {})
      } catch (err) {
        failed.push(`${d.title}: ${extractErrorMessage(err)}`)
      }
    }
    setSelected(new Set())
    load()
    flash(failed.length === 0
      ? `${targets.length}건 결재했습니다.${skipped > 0 ? ` (내 차례가 아닌 ${skipped}건은 건너뜀)` : ''}`
      : `결재하지 못한 문서 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  /** 원본 [라벨변경] — 고른 문서의 꼬리표를 한 번에 바꾼다. 비우면 라벨을 뗀다. */
  async function changeLabelSelected() {
    const targets = filtered.filter((d) => selected.has(d.id))
    if (targets.length === 0) {
      flash('라벨을 바꿀 문서를 고르세요. 줄 앞 체크박스로 고릅니다.')
      return
    }
    const next = window.prompt(`${targets.length}건의 라벨을 무엇으로 바꿀까요? (비우면 라벨을 뗍니다)`, '')
    if (next === null) return
    const failed: string[] = []
    for (const d of targets) {
      try {
        await api.patch(`/approvals/${d.id}/label`, { labelText: next })
      } catch (err) {
        failed.push(`${d.title}: ${extractErrorMessage(err)}`)
      }
    }
    setSelected(new Set())
    load()
    flash(failed.length === 0
      ? `${targets.length}건의 라벨을 바꿨습니다.`
      : `바꾸지 못한 문서 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  /**
   * 원본 기안서통합관리 하단의 [선택삭제] — 고른 문서를 한꺼번에 지운다(소프트 삭제).
   * 결재가 끝난 문서는 서버가 막는다. 막힌 건은 사유를 모아 보여 주고 나머지는 계속 지운다.
   */
  async function deleteSelected() {
    const targets = filtered.filter((d) => selected.has(d.id) && !d.deleted)
    if (targets.length === 0) {
      flash(selected.size === 0
        ? '지울 문서를 고르세요. 줄 앞 체크박스로 고릅니다.'
        : '고른 문서 중 지울 수 있는 것이 없습니다.')
      return
    }
    if (!(await ecConfirm('기안서를 삭제하겠습니까?\n삭제된 기안서는 복구되지 않습니다.'))) return
    const failed: string[] = []
    for (const d of targets) {
      try {
        await api.delete(`/approvals/${d.id}`)
      } catch (err) {
        failed.push(`${d.title}: ${extractErrorMessage(err)}`)
      }
    }
    setSelected(new Set())
    load()
    flash(failed.length === 0
      ? `${targets.length}건 삭제했습니다.`
      : `지우지 못한 문서 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  async function submitDraft(d: ApprovalDoc) {
    try {
      await api.post(`/approvals/${d.id}/submit`)
      setDetail(null)
      flash('상신되었습니다.')
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  async function remove(d: ApprovalDoc) {
    if (!(await ecConfirm('기안서를 삭제하겠습니까?\n삭제된 기안서는 복구되지 않습니다.'))) return
    try {
      await api.delete(`/approvals/${d.id}`)
      setDetail(null)
      flash('삭제되었습니다.')
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  const copy = (d: ApprovalDoc) => navigate('/groupware/approval/draft', { state: { copyFrom: d } })



  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '전자결재 목록', [])

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star mr-[4px]"><EcIcon name="star-outline" size={13} glyph="☆" /></span>
        <span className="text-[15px] font-extrabold text-ec-text">{title}</span>
        <div className="ml-auto flex items-center gap-[4px] relative">
          {/* 원본 검색칸 왼쪽 [라벨] — 라벨없음 · 쓰고 있는 라벨(긴급 …), 고르면 그 라벨 문서만(2026-10-30 클릭 대조). 다시 누르면 푼다. */}
          <span className="relative">
            <button type="button" className={`ec-btn${labelCond ? ' ec-btn-primary' : ''}`} aria-haspopup="menu" aria-expanded={labelOpen}
                    onClick={() => setLabelOpen((v) => !v)}>
              {labelCond ? labelText0(labelCond) : '라벨'}
            </button>
            {labelOpen && (
              <>
                <div className="ec-backdrop-clear" onClick={() => setLabelOpen(false)} />
                <div className="ec-menu left-0 right-auto" role="menu">
                  {/* 원본 팝업: 체크 [전체] [라벨있음] + 아래 줄 ↵ · + · × 아이콘(2026-10-31 클릭 대조). 우리는 라벨없음 · 쓰고 있는 라벨도 이어 둔다. */}
                  {['', LABEL_ANY, LABEL_NONE, ...labels].map((v) => (
                    <button key={v || 'all'} type="button" role="menuitemcheckbox" aria-checked={labelCond === v}
                            onClick={() => { setLabelOpen(false); setPage(1); setLabelCond(v) }}>
                      <input type="checkbox" readOnly tabIndex={-1} checked={labelCond === v} className="mr-[6px] align-middle" />
                      {v === '' ? '전체' : labelText0(v)}
                    </button>
                  ))}
                  {labelTyping && (
                    <div className="px-[8px] py-[4px]">
                      <input className="ec-input w-full" autoFocus aria-label="라벨 찾기" placeholder="라벨 이름" value={labelText}
                             onChange={(e) => setLabelText(e.target.value)}
                             onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setLabelOpen(false); setPage(1); setLabelCond(labelText.trim()); setLabelTyping(false) } }} />
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-[4px] px-[8px] py-[4px] border-t border-t-ec-line-soft border-solid">
                    <button type="button" className="ec-btn ec-btn-sm" aria-label="적용" title="적용"
                            onClick={() => { setLabelOpen(false); setLabelTyping(false); if (labelTyping) { setPage(1); setLabelCond(labelText.trim()) } }}>↵</button>
                    <button type="button" className="ec-btn ec-btn-sm" aria-label="라벨 이름으로 찾기" title="라벨 이름으로 찾기"
                            onClick={() => setLabelTyping((v) => !v)}><EcIcon name="plus" size={11} glyph="+" /></button>
                    <button type="button" className="ec-btn ec-btn-sm" aria-label="라벨 조건 풀기" title="라벨 조건 풀기"
                            onClick={() => { setLabelOpen(false); setLabelTyping(false); setLabelText(''); setPage(1); setLabelCond('') }}><EcIcon name="close" size={11} glyph="×" /></button>
                  </div>
                </div>
              </>
            )}
          </span>
          <input
            className="ec-input"
            placeholder="입력 후 [Enter]"
            value={search}
            onChange={(e) => { setSearch(e.target.value); filterRows(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') filterRows(search) }}
            style={{ width: 150 }}
          />
          {/* 원본: 검색창이 빈 채로 [Search(F3)] 를 누르면 조건 판이 펴진다(2026-10-03 실측 — 조건은 접혀 있다). */}
          <button className="ec-btn ec-btn-primary" onClick={() => (search.trim() ? filterRows(search) : setCondOpen((v) => !v))}>Search(F3)</button>
          <button className="ec-btn" onClick={() => setOptionOpen((v) => !v)}>Option</button>
          <button className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>

          {optionOpen && (
            <>
              <div className="ec-backdrop-clear" onClick={() => setOptionOpen(false)} />
              <div className="ec-menu" role="menu">
                {OPTION_MENU.map((m) => (
                  <button key={m.label} type="button" onClick={() => { setOptionOpen(false); m.onClick() }}>{m.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {passedNotice && <p className="ec-alert ec-alert-success mb-[8px]">{passedNotice}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {/* 상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다. */}
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {TABS.filter((t) => t !== '수신참조').map((t) => (
          <button
            key={t} type="button" onClick={() => { setTab(t); setPage(1); setSelected(new Set()) }}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t}
          </button>
        ))}
        {/* 원본 내결재관리: 수신참조는 알약 줄 오른쪽 끝의 파란 드롭다운 단추(2026-10-31 클릭 대조) */}
        {!isAll && (
          <button type="button" className={`ec-btn ec-btn-primary ml-auto${tab === '수신참조' ? ' active' : ''}`} aria-pressed={tab === '수신참조'}
                  onClick={() => { setTab(tab === '수신참조' ? '전체' : '수신참조'); setPage(1); setSelected(new Set()) }}>
            수신참조 <EcIcon name="caret-down" size={10} glyph="▾" />
          </button>
        )}
      </div>

      {/* 원본은 조건을 접어 두고 [Search(F3)] 로 편다. 펴면 기안일자 기간 + 조건들이 나온다. */}
      {condOpen && <div className="flex items-center flex-wrap gap-[4px] mb-[6px] ec-search-conds">
        {/* 두 화면 모두 [기준일자] — 기안서통합관리를 사본에서 [일자] 로 봤으나 2026-10-30 원본은 [기준일자]였다. */}
        <label className="text-[12.5px] text-ec-label">{dateLabel}</label>
        <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
        {/* 원본 조건 차례(2026-10-30 기안서통합관리 실측): 기준일자 · 기안서No. · 구분 · 기안자 · 제목 · 내용 — 그 뒤는 예전에 잰 더보기 칸. */}
        <label className="text-[12.5px] text-ec-label ml-[8px]">기안서No.</label>
        <input className="ec-input" value={docNoCond} onChange={(e) => setDocNoCond(e.target.value)}
               style={{ width: 140 }} placeholder="문서번호 일부" />
        {/*
          <b>이름을 잘못 달고 있었다.</b> 이 칸이 거르는 것은 기안서의 <b>양식</b>(지출결의서·
          품의서 …)인데 원본은 그것을 <b>[구분]</b> 이라 부른다. 원본의 [출력양식]은 따로 있는
          <b>인쇄 양식</b>이라 다른 것이다 — 우리는 화면마다 인쇄 양식이 하나라 그 칸이 없다.
        */}
        <label className="text-[12.5px] text-ec-label ml-[8px]">구분</label>
        <select className="ec-input" value={formType} onChange={(e) => setFormType(e.target.value)} style={{ width: 150 }}>
          <option value="">전체</option>
          {formTypes.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className="text-[12.5px] text-ec-label ml-[8px]">기안자</label>
        <input className="ec-input" value={drafterCond} onChange={(e) => setDrafterCond(e.target.value)}
               style={{ width: 110 }} placeholder="기안자" />
        <label className="text-[12.5px] text-ec-label ml-[8px]">제목</label>
        <input className="ec-input" value={titleCond} onChange={(e) => setTitleCond(e.target.value)}
               style={{ width: 140 }} placeholder="제목 일부" />
        <label className="text-[12.5px] text-ec-label ml-[8px]">내용</label>
        <input className="ec-input" value={contentCond} onChange={(e) => setContentCond(e.target.value)}
               style={{ width: 140 }} placeholder="내용 일부" />
        <label className="text-[12.5px] text-ec-label ml-[8px]">결재라인</label>
        <select className="ec-input" value={lineCond} onChange={(e) => setLineCond(e.target.value)} style={{ width: 130 }}>
          <option value="">전체</option>
          {approvers.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="text-[12.5px] text-ec-label ml-[8px]">부서</label>
        <select className="ec-input" value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: 130 }}>
          <option value="">전체</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="text-[12.5px] text-ec-label ml-[8px]">프로젝트</label>
        {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */}
        <CodePickerField label="프로젝트" hideLabel width={150} placeholder="프로젝트" emptyLabel="전체"
                         value={project} onChange={setProject} items={projects} />
        <label className="text-[12.5px] text-ec-label ml-[8px]">첨부</label>
        <select className="ec-input" value={attachCond} style={{ width: 100 }}
                onChange={(e) => setAttachCond(e.target.value as '전체' | '있음' | '없음')}>
          {(['전체', '있음', '없음'] as const).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <label className="text-[12.5px] text-ec-label ml-[8px]">라벨</label>
        <select className="ec-input" value={labelCond} onChange={(e) => setLabelCond(e.target.value)} style={{ width: 130 }}>
          <option value="">전체</option>
          <option value={LABEL_NONE}>라벨없음</option>
          {labels.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        {/* 원본 판 아래 줄: [검색(F8)│▾ 기간 빠른선택](내결재관리) · [다시 작성]. 우리 조건은 고르는 즉시 걸려 [검색(F8)] 은 판을 접는다. */}
        <div className="basis-full flex items-center gap-[4px] mt-[4px]">
          <span className="ec-btn-group relative">
            <button type="button" className="ec-btn ec-btn-primary ec-btn-sm" onClick={() => { setPage(1); setCondOpen(false) }}>검색(F8)</button>
            {!isAll && (
              <button type="button" className="ec-btn ec-btn-primary ec-btn-sm ec-btn-arrow" aria-label="기간 빠른선택"
                      onClick={() => setPicksOpen((v) => !v)}><EcIcon name="caret-down" size={10} glyph="▾" /></button>
            )}
            {picksOpen && (
              <div className="ec-menu ec-search-picks">
                {MINE_PICKS.map((l) => (
                  <button key={l} type="button" onClick={() => {
                    setPicksOpen(false)
                    const r = periodOf(l)
                    if (r) { setFrom(r.from); setTo(r.to); setPage(1) }
                  }}>{l}</button>
                ))}
              </div>
            )}
          </span>
          <button type="button" className="ec-btn ec-btn-sm" onClick={resetConds}>다시 작성</button>
        </div>
      </div>}

      {/* 원본: 쪽번호(한 쪽 15줄)는 왼쪽, 기안일자 기간은 오른쪽 — 표 바로 위 */}
      <div className="flex items-center gap-[6px] mb-[4px]">
        {pages > 1 && <div className="ec-paging">
          {Array.from({ length: pages }, (_, k) => k + 1).map((p) => (
            <button key={p} type="button" className={p === curPage ? 'active' : ''} onClick={() => setPage(p)}>{p}</button>
          ))}
        </div>}
        {pages > 1 && <span className="text-[12px] text-ec-ink">/ {pages}</span>}
        <span className="ml-auto text-[12px] text-ec-ink">{from.replace(/-/g, '/')} ~{to.replace(/-/g, '/')}</span>
      </div>

      <div ref={bodyRef} className="flex-1 min-h-0 overflow-x-auto">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              {/* 원본 1열은 체크박스다(2026-10-30 기안서통합관리 실측) — 머리 체크박스 = 지금 쪽 전체 선택. */}
              <th className="w-[34px] text-center">
                <input type="checkbox" aria-label="전체 선택"
                       checked={pageRows.length > 0 && pageRows.every((d) => selected.has(d.id))}
                       onChange={(e) => setSelected(e.target.checked ? new Set(pageRows.map((d) => d.id)) : new Set())} />
              </th>
              <th className="cursor-pointer text-ec-navy" onClick={() => sort.toggle('기안일자')}>기안일자 {sort.mark('기안일자')}</th>
              <th>제목</th>
              {!delView && <th className="text-center">ERP전표(건)</th>}
              {<th className="cursor-pointer text-ec-navy" onClick={() => sort.toggle('구분')}>구분 {sort.mark('구분')}</th>}
              <th className="cursor-pointer text-ec-navy" onClick={() => sort.toggle('기안자')}>기안자 {sort.mark('기안자')}</th>
              <th>결재자</th>
              {!delView && <th className="text-center">진행상태</th>}
              <th className="text-center">결재</th>
              {!delView && <th className="text-center">기안서복사</th>}
              {!delView && <th className="text-center">조회</th>}
              {!delView && <th>연결전표</th>}
              {/* 작업자 · 작업일시는 통합관리 [삭제] 알약의 맨 마지막 두 열뿐이다(2026-10-20 실측 — 다른 알약 · 내결재관리에는 없다). */}
              {delView && <th className="w-[90px]">작업자</th>}
              {delView && <th className="w-[150px]">작업일시</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="ec-empty">불러오는 중…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={colCount} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : pageRows.map((r) => (
              <tr key={r.id} style={{ opacity: r.deleted ? 0.55 : 1 }}>
                <td className="text-center">
                  <input type="checkbox" aria-label="선택" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                </td>
                <td className="whitespace-nowrap">
                  {/* 원본: 기안중(임시저장) 줄의 [기안일자] 는 링크 — 같은 작성 창이 [삭제] 와 함께 열려 고쳐 다시 저장한다(같은 번호). */}
                  {r.status === 'DRAFTING' && !r.deleted
                    ? <a onClick={() => navigate('/groupware/approval/draft', { state: { editOf: r } })} className="text-ec-navy cursor-pointer">{r.draftNo}</a>
                    : r.draftNo}
                </td>
                <td>
                  {/* 원본: 라벨은 제목 앞 작은 옅은 배지(label label-light mr-5) — 2026-10-30 실측 */}
                  {r.labelText && <span className="ec-label-chip bg-ec-disabled text-ec-ink mr-[5px]">{r.labelText}</span>}
                  <a onClick={() => setDetail(r)} className="text-ec-blue cursor-pointer">{r.title}</a>
                </td>
                {!delView && <td className="text-center">{r.voucherCount > 0 ? r.voucherCount : ''}</td>}
                {/* 원본 [구분]은 기안서의 구분(휴가신청서 · 지출결의서)이다 — 구분 없는 문서(비품 구매 신청서)는 빈칸. 양식 이름은 칸 풍선으로. */}
                <td title={r.formTypeName}>{catOf(r)}</td>
                <td>{r.drafterName}</td>
                <td>{r.currentApproverName ?? ''}</td>
                {!delView && (
                <td className="text-center">
                  {r.deleted
                    ? <span className="text-ec-hint">삭제</span>
                    : <span style={{ color: statusColor(r.status) }}>{STATUS_LABEL[r.status]}</span>}
                </td>
                )}
                <td className="text-center">
                  {/* 원본 기안서통합관리의 [결재] 칸은 줄마다 '보기'(문서를 열어 거기서 결재한다), [조회]는 빈칸. 내결재관리는 그 자리에서 승인 · 반려. */}
                  {/* 원본 내결재관리도 [결재] 칸은 '보기' — 문서를 열어 그 안의 [승인][반려]로 결재한다. 아직 올리지 않은 내 기안만 [상신]. */}
                  {/* 기안중(임시저장) 줄도 원본은 '보기' — 상신은 문서를 열어 [저장/결재(F7)] 로 한다(2026-10-14 E070105 실측). */}
                  <a onClick={() => setDetail(r)} className="text-ec-navy cursor-pointer">보기</a>
                </td>
                {!delView && <td className="text-center">
                  {/* 원본은 기안중(임시저장) 줄의 [기안서복사] 가 빈칸이다. */}
                  {r.status !== 'DRAFTING' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => copy(r)}>복사</button>}
                </td>}
                {!delView && <td className="text-center" />}
                {!delView && <td className="whitespace-nowrap">
                  {r.vouchers.map((v) => (
                    <span key={v.id} className="inline-block mr-[4px] py-[1px] px-[6px] rounded-[10px] text-[11px] bg-ec-blue-wash text-ec-navy">
                      {VOUCHER_LABEL[v.voucherType] ?? v.voucherType} {v.voucherNo}
                    </span>
                  ))}
                </td>}
                {delView && <td>{r.lastActorName ?? ''}</td>}
                {/* 원본 작업일시 '2026/10/14 오전 0:02:16' — 지운 때(서버가 지운 문서는 lastActedAt 에 deletedAt 을 싣는다) */}
                {delView && <td>{r.lastActedAt ? actedText(r.lastActedAt) : ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
        {/*
          **두 화면의 하단 버튼줄이 다르다** — 같은 컴포넌트를 쓴다고 같은 버튼을 달면 안 된다.
            내결재관리(mine)     : 신규(F2) · My도장/서명 · 보내기 · 결재/검토완료 · 라벨변경 · 인쇄 · Excel
            기안서통합관리(all)  : 선택삭제 · 라벨변경 · 인쇄 · Excel
          통합관리는 남의 기안서까지 보는 자리라 **거기서 결재하거나 새로 쓰지 않는다.**
          (My도장/서명·보내기는 받쳐 줄 기능이 없어 넣지 않는다 — 눌러도 아무 일 없는 버튼은 거짓말이다.)
        */}
        {scope === 'mine' ? (
          <>
            <button className="ec-btn ec-btn-primary" onClick={() => setDraftWinOpen(true)}>
              신규(F2)
            </button>
            <button className="ec-btn" onClick={() => setStampOpen(true)}>My도장/서명</button>
            {/* [보내기] · [결재/검토완료] · [인쇄] 는 [기안중] 알약에는 없다(원본 2026-10-30 — 기안중 → 진행중 으로 옮기면 셋이 생긴다). */}
            {!draftTab && (
              <button className="ec-btn" onClick={() => { if (requireSelection(selected.size)) void ecAlert('메일 · 팩스 보내기는 아직 없습니다.') }}>보내기</button>
            )}
            {!draftTab && <button className="ec-btn" onClick={() => { if (requireSelection(selected.size)) void approveSelected() }}>결재/검토완료</button>}
          </>
        ) : (
          <button className="ec-btn" onClick={() => { if (requireSelection(selected.size)) void deleteSelected() }}>선택삭제</button>
        )}
        <button className="ec-btn" onClick={() => { if (requireSelection(selected.size)) void changeLabelSelected() }}>라벨변경</button>
        {!draftTab && bottomActions.includes('인쇄') && <button className="ec-btn" onClick={() => doPrint()}>인쇄</button>}
        {bottomActions.includes('Excel') && <button className="ec-btn" onClick={() => { void doExcel() }}>Excel</button>}
      </div>

      {detail && (
        <ApprovalDetailModal
          doc={detail}
          fields={schemas[detail.formTemplateId] ?? []}
          isMyTurn={isMyTurn(detail)}
          canDelete={isMine(detail) && !detail.deleted && detail.status !== 'APPROVED'}
          onClose={() => setDetail(null)}
          onAct={act}
          onCopy={copy}
          onDelete={remove}
          onSubmit={isMine(detail) && !detail.deleted && detail.status === 'DRAFTING' ? submitDraft : undefined}
        />
      )}

      {draftWinOpen && (
        <AppWindow title="기안서작성" kind="ec-pagewin" popout="/groupware/approval/draft"
                   onClose={() => { if (!draftBusy.current) setDraftWinOpen(false) }}>
          <ApprovalDraftPage embedded={{ busy: draftBusy, onDone: () => { draftBusy.current = false; setDraftWinOpen(false); void load() } }} />
        </AppWindow>
      )}

      {stampOpen && user && <StampSignModal user={`${companyCode ?? ""}:${user.username}`} onClose={() => setStampOpen(false)} />}

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 460, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
              <span>{title} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div className="p-[14px] text-[12.5px] leading-[1.7] text-ec-text">
              <ul className="pl-[16px] m-0">
                <li>탭으로 <b>기안중·진행중·반려·결재·삭제</b> 상태별 문서를 걸러 봅니다.</li>
                <li><b>ERP전표(건)</b> — 이 기안서에 연결된 판매·구매·지출 전표 건수입니다. 오른쪽 <b>연결전표</b>에 전표번호가 보입니다.</li>
                <li><b>기안서복사</b> — 양식·제목·입력값을 그대로 가져와 새 기안서를 씁니다. 결재선은 다시 지정합니다.</li>
                <li>삭제는 문서를 지우지 않고 <b>삭제 탭</b>으로 옮깁니다. 기안번호는 그대로 남습니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

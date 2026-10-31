import { useEffect, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { exportTableToXlsx } from '../../../utils/excel'
import { printHtml } from '../../../utils/print'
import { escapeHtml } from '../../../utils/escapeHtml'
import LabelChip from '../../../features/board/components/LabelChip'
import LabelMasterModal from '../../../features/board/components/LabelMasterModal'
import { fetchLabels, type BoardLabel } from '../../../features/board/labels'
import { api, extractErrorMessage } from '../../../api/client'
import type { WorkPost } from '../../../types/api'
import { useShortcut } from '../../../utils/useShortcut'
import { downloadStoredFile, formatBytes } from '../../../utils/fileDownload'
import { dateText } from '../../../utils/dateText'
import { requireSelection, ecConfirm, ecAlert } from '../../../components/EcDialog'
import EcKanban, { type KanbanCard } from '../../../components/EcKanban'
import { defaultRange } from '../../../components/EcDateTimeRange'
import { isHtml, sanitizeHtml } from '../../../utils/richText'
import { shrinkImage } from '../../../utils/imageResize'
import { todayYmd } from '../../../utils/periods'
import WorkCondPanel from '../../../features/workpost/components/WorkCondPanel'
import WorkPostFormModal from '../../../features/workpost/components/WorkPostFormModal'
import WorkPostViewModal from '../../../features/workpost/components/WorkPostViewModal'
import WorkPostSubModals from '../../../features/workpost/components/WorkPostSubModals'
import { BOARD_CFG, colHead, type CondExtra, defaultPeriod, EMPTY_COND, emptyForm, type Form, MINUTE_TEAMS, NAMED_STAGE_BOARDS, parseExtra, passCond, type PostBoardCode, splitNames, stampText } from '../../../features/workpost/boardConfig'
export type { PostBoardCode } from '../../../features/workpost/boardConfig'

/**
 * 게시판 목록 화면. 원본은 게시판을 여러 개 두고 게시글을 그 아래 다는데,
 * 화면 모양은 게시판마다 똑같다 — 업무관리 &gt; WORK 와 공유정보 &gt; 공지사항이 그렇다.
 * 게시글번호도 게시판을 가로질러 한 줄기여서 목록 번호에 구멍이 보인다.
 *
 * 그래서 한 컴포넌트가 board 만 바꿔 두 화면을 낸다(내결재관리·기안서통합관리와 같은 방식).
 *
 * <p><b>2026-10-03 원본 공지사항(E200080)을 직접 쓰며 다시 맞췄다.</b>
 * <ul>
 *   <li>격자는 <b>게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태 · 첨부 · 조회</b>다. [일자-No.]는 목록에 없고
 *       글을 연 View 안에만 있다 — 우리는 목록 첫 열에 두고 있었다.</li>
 *   <li>[공지사항여부]를 켠 글은 목록 <b>맨 위에 한 번 더</b> 붙는다(행번호 없이, 옅은 노랑 바탕). 아래 번호 붙은
 *       목록에도 그대로 남는다. 우리는 제목 앞에 빨간 [공지] 글자만 달았다.</li>
 *   <li>제목을 누르면 <b>'공지사항View' 창</b>이 뜬다 — 머리줄 '16 | 제목 | 작성자 | 2026/10/03 (토) 오후 12:53:08',
 *       그 아래 일자-No.·첨부와 본문, 하단 [수정]·[삭제]·[닫기]·[인쇄]. 우리는 목록 안에서 펼쳤다.
 *       [모두펼쳐보기]만 목록 안에서 편다(원본도 그 버튼은 목록 안에서 편다).</li>
 *   <li>[수정]은 입력 창을 '…입력(수정)' 으로 다시 띄운다. [삭제]는 '삭제하겠습니까?' 를 묻는다.</li>
 *   <li>[인쇄]는 목록 하단이 아니라 View 안에 있다 — 글 한 건을 찍는다.</li>
 * </ul>
 *
 * <p>보내기·업무지원AI·라벨·이력조회는 받쳐 줄 것이 없어 만들지 않는다 — 눌러도
 * 아무 일 없는 버튼은 있는 것만 못하다.
 *
 * <p>{@code popup} — MyPage 게시판 위젯이 이 화면을 숨긴 채(features/mypage/PopupHost) 창 하나만 띄울 때(원본 2026-10-30 홈 실측):
 * postId 가 없으면 펜(새 글) → '공지사항입력', 있으면 제목 → '공지사항View', readers 면 R → '조회자 현황'.
 */
export default function WorkPage({ board = 'WORK', title = 'WORK', popup }: {
  board?: PostBoardCode
  title?: string
  popup?: { postId?: number; readers?: boolean }
} = {}) {
  const cfg = BOARD_CFG[board]
  /** 서버가 stage 를 적는 게시판(공지사항의 '기본'은 화면에서만 붙이는 이름이라 뺀다). */
  const namedStages = NAMED_STAGE_BOARDS.has(board)
  const colCount = cfg.cols ? cfg.cols.length + 3 : cfg.minutes ? 10 : cfg.wide ? 9 : 8
  const [rows, setRows] = useState<WorkPost[]>([])
  const [tab, setTab] = useState<string>('전체')
  /*
   * 진행상태는 게시판마다 회사가 정한다(원본 '진행상태를 자유롭게 추가 가능합니다'). 2026-10-03 원본 공지사항은
   * 상태가 <b>'기본' 하나</b> — 알약 [전체][기본], 모든 줄의 진행상태 '기본'. WORK 는 진행중 · 완료 그대로.
   * 우리 서버의 상태(진행중/완료)는 WORK 의 것이라 공지사항에서는 쓰지 않고 '기본' 으로 보인다.
   */
  const statuses: string[] = cfg.stages ?? ['진행중', '완료']
  const firstStage = cfg.defaultStage ?? cfg.stages?.[0] ?? ''
  const stageLabel = cfg.stageLabel ?? '진행상태'
  const statusOf = (r: WorkPost) => (board === 'NOTICE' ? '기본' : namedStages ? (r.stage ?? firstStage) : r.statusName)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 입력 창. editId 가 있으면 '…입력(수정)'. */
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  /** 입력 창에서 손댄 것이 있나 — [닫기] 가 '작성한 내용이 저장되지 않았습니다' 를 묻는 기준. */
  const [formDirty, setFormDirty] = useState(false)
  /** 글에 붙일 파일. 원본 [웹자료올리기]·[여기에 파일 놓기]. */
  const [attachment, setAttachment] = useState<{ id: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [statusBlank, setStatusBlank] = useState(false)
  /**
   * [담당자] 사원검색 — 사원(담당) 마스터(코드 · 이름). 원본 칸반 예시의 담당자 '정다인' 은 관리 사원(30명)에 없고
   * 재고 I › 사원(담당)등록에만 있다(2026-10-30 실측) — 전표의 [담당자] 와 같은 마스터.
   */
  const [employees, setEmployees] = useState<{ code: string; name: string }[]>([])
  useEffect(() => {
    if (cfg.extras?.some((x) => x.type === 'emp')) api.get<{ code: string; name: string }[]>('/sales-reps').then((r) => setEmployees(r.data)).catch(() => {})
  }, [cfg.extras])
  /** [거래처] · [품목] 코드도움 후보(거래처 · 품목 마스터). */
  const [partnerList, setPartnerList] = useState<{ code: string; name: string }[]>([])
  const [itemList, setItemList] = useState<{ code: string; name: string }[]>([])
  useEffect(() => {
    if (cfg.extras?.some((x) => x.type === 'partner')) api.get<{ code: string; name: string }[]>('/partners').then((r) => setPartnerList(r.data)).catch(() => {})
    if (cfg.extras?.some((x) => x.type === 'item')) api.get<{ code: string; name: string }[]>('/items').then((r) => setItemList(r.data)).catch(() => {})
  }, [cfg.extras])
  // 원본 하단의 [진행상태변경]·[선택삭제]는 고른 글에 한꺼번에 하는 동작이다.
  // 고르는 방식은 다른 목록과 같다 — 회색 행번호 칸을 누른다.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  /** [모두펼쳐보기]로 목록 안에 펴 놓은 글. */
  const [opened, setOpened] = useState(false)
  /** View 창에 띄운 글. */
  const [viewing, setViewing] = useState<WorkPost | null>(null)
  /** 통합회의록이 잇는 팀별회의록 게시판 글(부서 칸 제목 · View 의 펼친 본문 · 🔍 검색창). */
  const [meetingPosts, setMeetingPosts] = useState<WorkPost[]>([])
  /** 🔍 '팀별회의록 게시판검색창' 을 띄운 부서 칸(MINUTE_TEAMS 의 차례). */
  const [linkPickFor, setLinkPickFor] = useState<number | null>(null)
  const [linkTab, setLinkTab] = useState('전체')
  const [weekMenu, setWeekMenu] = useState(false)
  /** View 에서 펼친 부서 칸('경영지원팀(클릭)'). */
  const [openTeams, setOpenTeams] = useState<Set<number>>(new Set())
  /** 간판제작 ↔ 📅 프로젝트 진행현황 칸반: 간판제작 입력 창 [칸반연결] 후보 · 칸반 글 View 판의 카드(간판제작 글과 그 라벨 색). */
  const [kanbanPosts, setKanbanPosts] = useState<WorkPost[]>([])
  const [signPosts, setSignPosts] = useState<WorkPost[]>([])
  const [signLabels, setSignLabels] = useState<BoardLabel[]>([])
  /** [프로젝트] 코드도움의 프로젝트 마스터 — 간판제작 · 입력항목에 프로젝트가 있는 게시판(개발업무일지 · 현장공사일지). */
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  useEffect(() => {
    if (board !== 'SIGN' && !BOARD_CFG[board].extras?.some((x) => x.type === 'project')) return
    api.get<{ id: number; code: string; name: string }[]>('/projects').then((r) => setProjects(r.data)).catch(() => setProjects([]))
  }, [board])
  /** View 칸반 판에서 고른 카드 · [카드접기]. */
  const [boardPick, setBoardPick] = useState<Set<number>>(new Set())
  const [cardsFolded, setCardsFolded] = useState(false)
  /** View 칸반 판에서 누른 카드(간판제작 글) — 판 아래에 제목 · 본문을 편다. */
  const [cardView, setCardView] = useState<WorkPost | null>(null)
  const meetingTitle = (id: number | null | undefined) => (id == null ? '' : meetingPosts.find((m) => m.id === id)?.title ?? '')

  /*
   * 조회 기간 — 원본 [Search(F3)] 를 검색창이 빈 채로 누르면 내려오는 조건 판의 [게시일]. 판에서 고친 값은
   * [검색(F8)] 을 눌러야 목록에 걸린다(원본도 그렇다).
   */
  const [period, setPeriod] = useState(() => defaultPeriod(cfg.period))
  const { from, to } = period
  const [condOpen, setCondOpen] = useState(false)
  const [cond, setCond] = useState(() => ({ from: period.from, to: period.to, ...EMPTY_COND }))
  /** [검색(F8)] 을 눌러 목록에 건 조건(게시일 빼고). */
  const [applied, setApplied] = useState<CondExtra>(EMPTY_COND)
  useEffect(() => {
    setMenu('조회'); setRepRan(false); setAgg(['', '', '', ''])
    const p = defaultPeriod(BOARD_CFG[board].period)
    setPeriod(p)
    setCond({ ...p, ...EMPTY_COND })
    setApplied(EMPTY_COND)
  }, [board])
  /** 조건 판 [메뉴] — 조회(목록) · 현황 · 집계. 현황 · 집계는 [검색(F8)] 뒤에 표만 그린다(2026-10-22 실측). */
  const [menu, setMenu] = useState<'조회' | '현황' | '집계'>('조회')
  const [repRan, setRepRan] = useState(false)
  /** 집계조건1 · 2(항목추가 창에서 고른 것) · 비교기간. */
  const [agg, setAgg] = useState<string[]>(['', '', '', ''])
  const [aggPick, setAggPick] = useState<number | null>(null)
  /** 집계조건 칸 수 — 처음 둘, 하나 고를 때마다 하나씩 늘어 최대 넷(2026-10-22 실측). */
  const aggSlots = Math.min(4, agg.filter(Boolean).length + 2)
  /** 집계 결과 줄 — 고른 조건으로 묶어(전표별은 글 하나가 한 묶음), 묶음마다 첫 글 한 줄, 묶음 끝마다 '<값> 계', 맨 끝 '총합계'(2026-10-22 실측). */
  function aggRows() {
    const keys = agg.filter(Boolean)
    const val = (r: WorkPost, k: string) => {
      const d = dateText(r.postDate)
      switch (k) {
        case '일별': return d
        case '주차별': return `${d.slice(0, 4)}-${String(Math.ceil(Number(d.slice(8, 10)) / 7)).padStart(2, '0')}주`
        case '월별': return d.slice(0, 7)
        case '분기별': return `${d.slice(0, 4)}/${Math.ceil(Number(d.slice(5, 7)) / 3)}분기`
        case '반기별': return `${d.slice(0, 4)}/${Number(d.slice(5, 7)) <= 6 ? '상' : '하'}반기`
        case '연별': return d.slice(0, 4)
        case '진행상태별': return statusOf(r)
        case '전표별': return r.title
        default: return ''
      }
    }
    const sorted = [...numbered].sort((a, b) => a.postNo - b.postNo)
    const groups: { vals: string[]; row: WorkPost; id: string }[] = []
    for (const r of sorted) {
      const vals = keys.map((k) => val(r, k))
      const id = keys.map((k, i) => (k === '전표별' ? String(r.id) : vals[i])).join('\u0001')
      if (!groups.some((g) => g.id === id)) groups.push({ vals, row: r, id })
    }
    const out: ({ kind: 'row'; vals: string[]; row: WorkPost } | { kind: 'sum'; label: string; n: number })[] = []
    const flush = (g: { vals: string[] } | null, upto: number) => {
      if (!g) return
      for (let lv = keys.length - 1; lv >= upto; lv--) out.push({ kind: 'sum', label: `${g.vals[lv]} 계`, n: lv })
    }
    let prev: (typeof groups)[number] | null = null
    for (const g of groups) {
      if (prev) { let d = 0; while (d < keys.length && prev.vals[d] === g.vals[d] && keys[d] !== '전표별') d++; flush(prev, d) }
      out.push({ kind: 'row', vals: g.vals, row: g.row })
      prev = g
    }
    flush(prev, 0)
    return { keys, out }
  }
  const [compare, setCompare] = useState('사용안함')
  const rep = !!cfg.menuModes && menu !== '조회'
  function applyCond() {
    if (rep && menu === '집계' && !agg.some(Boolean)) { void ecAlert('집계조건은 1개 이상 선택하여야 합니다.'); return }
    setRepRan(rep)
    setPeriod({ from: cond.from, to: cond.to })
    const { from: _f, to: _t, ...extra } = cond
    setApplied({ ...extra, title: extra.title.trim(), content: extra.content.trim(), user: extra.user.trim(), no: extra.no.trim() })
    setCondOpen(false)
    void load()
  }
  /** 원본 [Search(F3)] — 검색창이 비었으면 조건 판을 내리고, 글자가 있으면 그 글자로 찾는다. */
  function onSearch() {
    if (!keyword.trim()) { setCondOpen((v) => !v); return }
    void load()
  }

  /** 원본 화면 안 '알림' 창 — '삭제하겠습니까?' [확인][취소]. 브라우저 confirm 대신. ids 가 지울 글. */
  const [confirmIds, setConfirmIds] = useState<number[] | null>(null)
  /** 전달자 · 참조자 🔍 '사용자검색' 창. */
  const [pickFor, setPickFor] = useState<'forwardTo' | 'ccTo' | null>(null)
  /** 전달자 '전체 / 선택' 고르기 판. */
  const [forwardMenu, setForwardMenu] = useState(false)
  const [ccMenu, setCcMenu] = useState(false)
  /** 하단 [진행상태변경 ▲] 의 진행상태 목록 판. */
  const [stageMenu, setStageMenu] = useState(false)
  /** 바깥 기능 버튼(보내기 · 업무지원AI · 이력조회 · 웹자료올리기)을 눌렀을 때의 안내. */
  const [info, setInfo] = useState('')

  /** 원본 '라벨조회' 의 라벨 마스터(코드 · 이름 · 색). */
  const [labelMaster, setLabelMaster] = useState<BoardLabel[]>([])
  const [masterOpen, setMasterOpen] = useState(false)

  // Search(F3) — 버튼 라벨이 약속한 단축키. 창이 떠 있을 때는 뒤 화면이 바뀌면 안 된다.
  useShortcut('F3', onSearch, !showForm && !viewing && !masterOpen && !condOpen)
  useShortcut('F8', applyCond, condOpen && !showForm && !viewing)
  useShortcut('F2', openNew, !showForm && !viewing && !masterOpen)
  useShortcut('F8', () => void submit(), showForm)
  useShortcut('F8', () => { if (viewing) openReply(viewing) }, !!viewing && !showForm)

  const colorOf = (name: string) => labelMaster.find((l) => l.name === name)?.color

  async function load() {
    setLoading(true)
    try {
      const none = Promise.resolve([] as WorkPost[])
      const [r, labs, meet, kan, sign, signLabs] = await Promise.all([
        api.get<WorkPost[]>('/work-posts', { params: { board } }),
        cfg.labels ? fetchLabels(board) : Promise.resolve([] as BoardLabel[]),
        cfg.minutes ? api.get<WorkPost[]>('/work-posts', { params: { board: 'MEETING' } }).then((x) => x.data) : none,
        board === 'SIGN' ? api.get<WorkPost[]>('/work-posts', { params: { board: 'PROJECT_KANBAN' } }).then((x) => x.data) : none,
        board === 'PROJECT_KANBAN' ? api.get<WorkPost[]>('/work-posts', { params: { board: 'SIGN' } }).then((x) => x.data) : none,
        board === 'PROJECT_KANBAN' ? fetchLabels('SIGN') : Promise.resolve([] as BoardLabel[]),
      ])
      setRows(r.data)
      setLabelMaster(labs)
      setMeetingPosts(meet)
      setKanbanPosts(kan)
      setSignPosts(sign)
      setSignLabels(signLabs)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [board])

  /* MyPage 위젯에서 부른 창 — 처음 한 번만 연다(글은 목록을 받은 뒤에 찾는다) */
  const popupDone = useRef(false)
  useEffect(() => {
    if (!popup || popupDone.current) return
    if (popup.postId == null) { popupDone.current = true; openNew(); return }
    if (popup.readers) { popupDone.current = true; void openReaders({ id: popup.postId } as WorkPost); return }
    const post = rows.find((r) => r.id === popup.postId)
    if (post) { popupDone.current = true; openView(post) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  /**
   * View 창을 연다. <b>열 때만</b> 조회수를 올린다 — 목록을 부르는 것만으로 올리면
   * 화면을 열 때마다 모든 글이 같이 올라가서 그 숫자가 '몇 명이 봤나' 를 뜻하지 않게 된다.
   */
  function openView(r: WorkPost) {
    setViewing(r)
    setBoardPick(new Set())
    setCardView(null)
    setOpenTeams(new Set())
    api.post<WorkPost>(`/work-posts/${r.id}/read`)
      .then((res) => {
        setRows((prev) => prev.map((x) => (x.id === r.id ? res.data : x)))
        setViewing((v) => (v && v.id === r.id ? res.data : v))
      })
      .catch(() => { /* 조회수는 곁다리다 — 실패해도 글은 보인다. */ })
  }

  /** 원본 입력 창 [닫기] — 손댄 것이 있으면 먼저 묻는다(2026-10-13 통합게시판 실측 문구). */
  async function closeForm() {
    if (formDirty && !(await ecConfirm('작성한 내용이 저장되지 않았습니다. 페이지를 벗어나겠습니까?'))) return
    setShowForm(false)
  }

  /** 원본 View 의 [복사](2026-10-22 공지사항 실측): 같은 글을 새 입력 창에 그대로 채운다(제목 · 본문 · 라벨 · 완료일시 …). 하단 [저장(F8)▲][리스트][View][닫기]. */
  const [copyId, setCopyId] = useState<number | null>(null)
  /** View 의 [H] 이력 창 · [최종이력] 창에 띄운 글. */
  const [histFor, setHistFor] = useState<WorkPost | null>(null)
  const [lastFor, setLastFor] = useState<WorkPost | null>(null)
  function openCopy(r: WorkPost) {
    openEdit(r)
    setEditId(null)
    setCopyId(r.id)
    setAttachment(null)
  }
  /**
   * View [답글(F8)] 로 연 입력 창의 원글. 원본 업무일지 답글 창(2026-10-21 실측)처럼 제목은 원글 그대로('Re:' 없음) · 본문은 비운다.
   * 저장하면 원글 제목 뒤 '[n]' 이 하나 늘고, [모두펼쳐보기] 로 원글 아래에 하위 글 줄이 펴진다.
   */
  const [replyTo, setReplyTo] = useState<WorkPost | null>(null)
  function openReply(r: WorkPost) {
    const root = r.parentId != null ? rows.find((x) => x.id === r.parentId) ?? r : r
    openNew()
    setViewing(null)
    setReplyTo(root)
    setForm((f) => ({ ...f, title: root.title, content: '', stage: root.stage ?? f.stage }))
  }
  function openNew() {
    setReplyTo(null)
    setCopyId(null)
    setStatusBlank(false)
    setFormDirty(false)
    setEditId(null)
    // 원본 통합회의록 입력 창은 제목에 오늘 날짜가 미리 들어 있다('2026/10/13 ').
    setForm({ ...emptyForm(), title: cfg.minutes ? `${dateText(todayYmd())} ` : '', content: cfg.template ?? '', ccAll: !!cfg.ccAll })
    setAttachment(null)
    setError('')
    setShowForm(true)
  }
  /** 게시판 잇기 창 [신규(F2)] 가 새 탭으로 연 주소(?new=1)면 입력 창을 바로 연다. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') openNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board])

  /** 원본 View 의 [수정] — 같은 입력 창을 '…입력(수정)' 으로 띄운다. */
  function openEdit(r: WorkPost) {
    setReplyTo(null)
    setCopyId(null)
    setStatusBlank(false)
    setFormDirty(false)
    setViewing(null)
    setEditId(r.id)
    setForm({
      title: r.title, content: r.content,
      forwardAll: !r.forwardTo, forwardTo: splitNames(r.forwardTo), ccTo: splitNames(r.ccTo),
      ccAll: !!cfg.ccAll && !r.ccTo, status: r.status,
      notice: r.notice, postDate: r.postDate, stage: r.stage ?? '',
      weekNo: r.weekNo ?? null,
      links: MINUTE_TEAMS.map((_, i) => r.meetingLinks?.[i] ?? null),
      extra: parseExtra(r.extraFields),
      project: r.project ?? '', kanbanPostId: r.kanbanPostId ?? null,
      done: r.completedAt ? r.completedAt.slice(0, 16) : '',
    })
    setAttachment(r.attachmentId ? { id: r.attachmentId, name: r.attachmentName ?? '첨부' } : null)
    setError('')
    setShowForm(true)
  }

  /** [삭제] — 먼저 '알림' 창으로 묻는다. 지우는 일은 [확인] 에서(doDelete). */
  function removeOne(id: number) { setConfirmIds([id]) }

  async function doDelete() {
    const ids = confirmIds ?? []
    setConfirmIds(null)
    for (const id of ids) {
      try {
        await api.delete(`/work-posts/${id}`)
      } catch (err) {
        setError(extractErrorMessage(err))
      }
    }
    setViewing(null)
    setShowForm(false)
    setEditId(null)
    setSelected(new Set())
    load()
  }

  function set<K extends keyof Form>(k: K, v: Form[K]) { setFormDirty(true); setForm((f) => ({ ...f, [k]: v })) }

  /** 파일을 먼저 올려 id 를 받고, 글을 저장할 때 그 id 를 붙인다(기안서와 같은 방식). */
  async function upload(file: File) {
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', await shrinkImage(file))
      const r = await api.post<{ id: number; name: string }>('/files', fd)
      setAttachment({ id: r.data.id, name: r.data.name })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function submit(after: 'close' | 'new' | 'keep' = 'close') {
    setError('')
    if (!form.title.trim()) return setError('제목을 입력하세요.')
    // 통합회의록은 내용 없이도 저장된다(원본 2026-10-13 — 부서 칸 · 주 차만 넣고 저장).
    if (!cfg.contentOptional && !form.content.trim()) return setError('내용을 입력하세요.')
    if (!form.forwardAll && form.forwardTo.length === 0) return setError('전달자를 선택하세요.')
    const common = {
      title: form.title, content: form.content,
      // 전달자 '전체' 는 null 로 둔다. 알림은 보내지 않는다 — 우리는 누구에게 전달했는지 적어 두기만 한다.
      forwardTo: form.forwardAll ? null : form.forwardTo.join(', '),
      ccTo: form.ccAll || !form.ccTo.length ? null : form.ccTo.join(', '),
      notice: form.notice,
      stage: namedStages ? (form.stage || firstStage) : null,
      // 수정은 통째로 덮는다 — 첨부를 안 보내면 서버가 뗀다(예전 수정이 그래서 첨부를 잃었다).
      attachmentId: attachment ? attachment.id : null,
      weekNo: cfg.minutes || cfg.weekPick ? form.weekNo : null,
      meetingLinks: cfg.minutes ? form.links : null,
      extraFields: cfg.extras && (Object.values(form.extra).some((v) => v.trim()) || cfg.extras.some((x) => x.type === 'range'))
        ? JSON.stringify(Object.fromEntries(cfg.extras.map((x) => [x.name, (form.extra[x.name] ?? '').trim() || (x.type === 'range' ? defaultRange() : '')]).filter(([, v]) => v)))
        : null,
      project: board === 'SIGN' ? form.project.trim() || null : null,
      kanbanPostId: board === 'SIGN' ? form.kanbanPostId : null,
      completedAt: (board === 'SIGN' || board === 'AS_CARE') && form.done ? `${form.done}:00` : null,
    }
    try {
      if (editId != null) {
        // 원본: 수정 저장 뒤에는 목록이 아니라 그 글의 View 로 돌아간다(2026-10-13 실측).
        let res = await api.put<WorkPost>(`/work-posts/${editId}`, common)
        // 통합회의록 [진행상태] — 저장 요청에는 칸이 없어 바뀌었을 때만 /status 로 맞춘다.
        if (cfg.minutes && res.data.status !== form.status) res = await api.patch<WorkPost>(`/work-posts/${editId}/status`, { status: form.status })
        if (after === 'keep') { openEdit(res.data); load(); return }
        if (after === 'new') { openNew(); load(); return }
        setShowForm(false)
        setEditId(null)
        setViewing(res.data)
      } else {
        const res = await api.post<WorkPost>('/work-posts', { ...common, board, postDate: form.postDate || null, parentId: replyTo?.id ?? null })
        if (cfg.minutes && form.status !== 'IN_PROGRESS') await api.patch(`/work-posts/${res.data.id}/status`, { status: form.status })
        // 원본 [저장(F8)▲](2026-10-21 상담 이력관리 · 칸반보드 실측): 저장/신규 = 빈 새 창, 저장/내용유지 = 저장한 글의 수정 창.
        if (after === 'keep') { openEdit(res.data); load(); return }
        if (after === 'new') { openNew(); load(); return }
        setShowForm(false)
      }
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const toggleSelect = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  /**
   * 원본 [진행상태변경 ▲] — 위로 진행상태 목록이 펴지고, 하나를 누르면 고른 글이 모두 그 상태가 된다.
   * 회사가 정한 이름(통합게시판 · 팀별회의록 · 간판제작)은 stage 로, WORK 는 진행중/완료(status)로 보낸다.
   */
  function openStageMenu() {
    if (pickedRows().length === 0) return setError('상태를 바꿀 글을 고르세요. 행번호 칸을 누르면 선택됩니다.')
    setStageMenu((v) => !v)
  }
  async function changeStatusSelected(target: string) {
    setStageMenu(false)
    const targets = pickedRows()
    for (const r of targets) {
      try {
        // enum 값은 IN_PROGRESS 다. 'ONGOING' 을 보내면 400 이 난다(직접 시험해서 잡았다).
        await api.patch(`/work-posts/${r.id}/status`, namedStages
          ? { stage: target }
          : { status: target === '완료' ? 'DONE' : 'IN_PROGRESS' })
      } catch (err) {
        setError(extractErrorMessage(err))
      }
    }
    setSelected(new Set())
    load()
  }

  /*
   * 원본 [라벨변경](2026-10-03 실측): 글을 고르고 누르면 작은 판이 뜬다 — [전체] · 라벨마다 체크(여럿 고름),
   * 아래 ↵(적용) · +(라벨조회 창) · ×(닫기). 후보는 '라벨조회' 에서 회사가 정한 라벨(사용중단 뺌), 칩은 그 색
   * (2026-10-12 라벨 마스터를 만들어 이어 붙임).
   */
  const [labelOpen, setLabelOpen] = useState(false)
  const [labelPick, setLabelPick] = useState<Set<string>>(new Set())
  const knownLabels = labelMaster.filter((l) => l.active).map((l) => l.name)
  /**
   * 원본 제목줄 [라벨] — 펴면 전체 · 라벨없음 · 라벨마다 체크, ↵(적용) · +(라벨조회) · ×. 고른 라벨이 붙은 글만 본다.
   * null 이면 거르지 않는다(전체).
   */
  const [labelFilter, setLabelFilter] = useState<Set<string> | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterPick, setFilterPick] = useState<Set<string>>(new Set())
  const NO_LABEL = '\u0000라벨없음'
  const filterKeys = [NO_LABEL, ...knownLabels]
  function openFilter() {
    setFilterPick(new Set(labelFilter ?? filterKeys))
    setFilterOpen((v) => !v)
  }
  function applyFilter() {
    setLabelFilter(filterKeys.every((k) => filterPick.has(k)) ? null : new Set(filterPick))
    setFilterOpen(false)
  }
  const passLabel = (r: WorkPost) => {
    if (!labelFilter) return true
    const ls = r.labels ?? []
    return ls.length === 0 ? labelFilter.has(NO_LABEL) : ls.some((l) => labelFilter.has(l))
  }
  function openLabels() {
    const targets = pickedRows()
    // 하나만 골랐으면 그 글의 라벨을 켜 두고 연다 — 고칠 때 지금 값에서 시작한다.
    setLabelPick(new Set(targets.length === 1 ? targets[0].labels ?? [] : []))
    setLabelOpen(true)
  }
  const togglePick = (l: string) => setLabelPick((p) => { const n = new Set(p); if (n.has(l)) n.delete(l); else n.add(l); return n })
  async function applyLabels() {
    const targets = pickedRows()
    for (const r of targets) {
      try { await api.patch(`/work-posts/${r.id}/labels`, { labels: knownLabels.filter((l) => labelPick.has(l)) }) }
      catch (err) { setError(extractErrorMessage(err)) }
    }
    setLabelOpen(false)
    setSelected(new Set())
    load()
  }

  /** 원본 '조회자 현황' — 왼쪽 미조회자, 오른쪽 조회자 [이름][최초조회일시][최종조회일시]. */
  const [readers, setReaders] = useState<{ readers: { name: string; firstReadAt: string; lastReadAt: string }[]; nonReaders: string[] } | null>(null)
  async function openReaders(r: WorkPost) {
    try { setReaders((await api.get(`/work-posts/${r.id}/readers`)).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  /** 원본 [선택삭제] */
  async function deleteSelected() {
    const targets = pickedRows()
    if (targets.length === 0) return setError('지울 글을 고르세요. 행번호 칸을 누르면 선택됩니다.')
    setConfirmIds(targets.map((r) => r.id))
  }

  async function doExcel() {
    const table = document.querySelector('#work-list table') as HTMLTableElement | null
    if (!table) return setError('내보낼 표가 없습니다.')
    if (!(await exportTableToXlsx(table, title))) setError('내보낼 자료가 없습니다.')
  }

  /** 원본 View 의 [인쇄] — 펼쳐 놓은 글 한 건을 찍는다. */
  function printPost(r: WorkPost) {
    printHtml(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(r.title)}</title>
<style>body{font-family:sans-serif;font-size:12px;padding:24px}h1{font-size:14px;margin:0 0 8px}
.meta{margin-bottom:12px}.body{white-space:pre-wrap;border-top:1px solid;padding-top:12px}</style></head>
<body><h1>${escapeHtml(`${r.postNo} | ${r.title} | ${r.writerName ?? r.writer} | ${stampText(r.createdAt, r.postDate)}`)}</h1>
<div class="meta">일자-No. ${escapeHtml(dateNoOf(r))}${r.attachmentName ? ` · 첨부 ${escapeHtml(r.attachmentName)}` : ''}</div>
<div class="body">${isHtml(r.content) ? sanitizeHtml(r.content) : escapeHtml(r.content)}</div></body></html>`)
  }

  const shown = rows
    .filter((r) => r.postDate >= from && r.postDate <= to)
    .filter((r) => tab === '전체' || statusOf(r) === tab)
    .filter(passLabel)
    .filter((r) => passCond(r, applied))
    // [유형] 에 본문이 켜져 있으면 답글은 따로 줄을 서지 않고 원글 아래에 편다([모두펼쳐보기]). 답글만 고르면 답글이 줄을 선다.
    .filter((r) => r.parentId == null || !applied.kinds.includes('본문'))
    .filter((r) => !keyword || r.title.includes(keyword) || (r.writerName ?? r.writer).includes(keyword))
  /** 원글 id → 답글(먼저 단 차례). 원본 목록은 원글 제목 뒤에 '[답글 수]'(차량 증빙관리 · 상담 이력관리 2026-10-30 실측). */
  const repliesOf = new Map<number, WorkPost[]>()
  for (const r of [...rows].sort((a, b) => a.id - b.id)) {
    if (r.parentId != null) repliesOf.set(r.parentId, [...(repliesOf.get(r.parentId) ?? []), r])
  }
  /** [일자-No.] 의 No. — 그 게시판에서 같은 일자에 올린 원글 차례(번호 작은 글이 1). 답글은 원글 것을 따른다. */
  const dateSeq = new Map<number, number>()
  {
    const byDate = new Map<string, WorkPost[]>()
    for (const r of rows) if (r.parentId == null) byDate.set(r.postDate, [...(byDate.get(r.postDate) ?? []), r])
    for (const list of byDate.values()) list.sort((a, b) => a.postNo - b.postNo || a.id - b.id).forEach((r, i) => dateSeq.set(r.id, i + 1))
  }
  const dateNoOf = (r: WorkPost) => {
    const root = r.parentId != null ? rows.find((x) => x.id === r.parentId) ?? r : r
    return `${dateText(root.postDate)} -${dateSeq.get(root.id) ?? 1}`
  }
  /*
   * 원본(2026-10-03 같은 글 넷을 넣어 견줌): 번호 붙은 줄은 공지 여부와 상관없이 <b>새 글부터</b>(15 · 14 · 13 · 12),
   * 공지사항여부를 켠 글은 그와 별도로 맨 위에 한 번 더(행번호 없이, 역시 새 글부터). 서버는 공지를 앞에 세워 주는데
   * 그 차례를 그대로 쓰면 번호 줄에서도 공지가 위로 올라갔다(3 · 2 · 4 · 1).
   */
  const newestFirst = (a: WorkPost, b: WorkPost) =>
    a.postDate !== b.postDate ? (a.postDate < b.postDate ? 1 : -1) : b.postNo - a.postNo
  /** 조건 [기타 ☑수정일자순(정렬)] — 마지막으로 고친 글부터. */
  const byOrder = (a: WorkPost, b: WorkPost) =>
    applied.byUpdated && (a.updatedAt ?? '') !== (b.updatedAt ?? '') ? ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : -1) : newestFirst(a, b)
  const numbered = [...shown].sort(byOrder)
  const pinned = shown.filter((r) => r.notice).sort(byOrder)
  /**
   * 번호 붙은 줄 — 원글, [모두펼쳐보기] 면 그 아래 답글 줄(원본 차량 증빙관리 2026-10-30: 답글 줄도 행번호 · 체크칸이 있고
   * 번호가 이어진다 1 원글 · 2 원글 · 3 그 답글 …, 본문은 펴지 않는다). 답글이 이미 따로 줄을 섰으면 또 펴지 않는다.
   */
  const shownIds = new Set(shown.map((r) => r.id))
  const listed: { r: WorkPost; reply: boolean }[] = numbered.flatMap((r) => [
    { r, reply: false },
    ...(opened && r.parentId == null ? (repliesOf.get(r.id) ?? []).filter((c) => !shownIds.has(c.id)).map((c) => ({ r: c, reply: true })) : []),
  ])
  /** [진행상태변경] · [라벨변경] · [선택삭제] 가 다루는 글 — 화면에 줄이 선 글 중 고른 것(답글 줄 포함). */
  const pickedRows = () => listed.map((x) => x.r).filter((r) => selected.has(r.id))
  /** 게시판마다 [완료일] 열이 붙었다 빠졌다 한다 — 머리 · 본문 · 빈 줄 칸 수를 개발 모드에서 본다. */
  const gridRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(gridRef, `${board} 게시판`, [shown.length, opened, loading, board])

  /** 격자 한 줄의 데이터 칸(게시글번호부터). 맨 위 공지 줄과 번호 붙은 줄이 같이 쓴다. */
  const cells = (r: WorkPost, pin: boolean, reply = false) => {
    const bg = pin ? 'bg-ec-pinned' : ''
    /** 제목 칸 — 답글 줄은 '↳' 로 들여 쓰고, 원글은 제목 뒤에 '[답글 수]'(답글이 있을 때만, 12px 굵게 남색 — E200190 실측). */
    const titleCell = (
      <>
        {reply && <span className="text-ec-hint pl-[14px] pr-[4px]">↳</span>}
        {cfg.labels && (r.labels ?? []).map((l) => <LabelChip key={l} name={l} color={colorOf(l)} className="mr-[4.5px]" />)}
        <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-left text-ec-navy"
                onClick={() => openView(r)}>{r.title}</button>
        {!reply && (repliesOf.get(r.id)?.length ?? 0) > 0 && (
          <span className="ml-[4px] text-[12px] font-bold text-ec-navy">[{repliesOf.get(r.id)!.length}]</span>
        )}
      </>
    )
    if (cfg.cols) {
      const ex = parseExtra(r.extraFields)
      return (
        <>
          {cfg.cols.map((c) => {
            if (c === 'title') return (
              <td key={c} className={bg}>{titleCell}</td>
            )
            if (c.startsWith('x:')) {
              const v = ex[c.slice(2).split('|')[0]] ?? ''
              return <td key={c} className={`${bg}${/^\d{4}-\d\d-\d\d$/.test(v) ? ' text-center' : ''}`}>{/^\d{4}-\d\d-\d\d$/.test(v) ? dateText(v) : v}</td>
            }
            const text = c === 'no' ? (reply ? '' : r.postNo) : c === 'dateNo' ? dateNoOf(r) : c === 'writer' ? (r.writerName ?? r.writer)
              : c === 'forward' ? (r.forwardTo ?? '') : c === 'postDate' ? dateText(r.postDate) : statusOf(r)
            return <td key={c} className={`${bg}${c === 'stage' ? ' text-ec-navy' : ''}${c === 'postDate' || c === 'dateNo' ? ' text-center' : ''}`}>{text}</td>
          })}
          <td className={`${bg} text-center`}>
            {r.attachmentId && (
              <span title={`${r.attachmentName} (${formatBytes(r.attachmentSize ?? 0)})`}
                    onClick={() => void downloadStoredFile(r.attachmentId!, r.attachmentName ?? '첨부')}
                    className="cursor-pointer text-ec-blue">📎</span>
            )}
          </td>
          <td className={`${bg} text-center`}>
            <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                    title={`연 횟수 ${r.viewCount ?? 0}`} onClick={() => void openReaders(r)}>R</button>
          </td>
        </>
      )
    }
    return (
      <>
        {/* 답글 줄의 게시글번호는 원본도 빈 칸 */}
        <td className={bg}>{reply ? '' : r.postNo}</td>
        {/* 원본 [라벨] 칩 — 제목 앞(여백 3.6 4.5 2.7 · 둥글기 10 · 오른쪽 4.5, 실측) */}
        <td className={bg}>{titleCell}</td>
        {cfg.minutes ? (
          <>
            {/* 원본 부서 칸 — 이은 팀별회의록 글의 제목(링크 아님) */}
            {MINUTE_TEAMS.map((t, i) => <td key={t} className={bg}>{meetingTitle(r.meetingLinks?.[i])}</td>)}
            <td className={bg}>{r.weekNo ? `${r.weekNo}주차` : ''}</td>
          </>
        ) : (
          <>
            <td className={bg}>{r.writerName ?? r.writer}</td>
            <td className={bg}>{r.forwardTo ?? ''}</td>
            {cfg.wide && <td className={`${bg} text-center`}>{r.completedAt ? dateText(r.completedAt.slice(0, 10)) : ''}</td>}
            <td className={`${bg} text-ec-navy`}>{statusOf(r)}</td>
          </>
        )}
        {/* 원본 [첨부]. 파일이 없으면 원본도 빈 칸이다. */}
        <td className={`${bg} text-center`}>
          {r.attachmentId && (
            <span title={`${r.attachmentName} (${formatBytes(r.attachmentSize ?? 0)})`}
                  onClick={() => void downloadStoredFile(r.attachmentId!, r.attachmentName ?? '첨부')}
                  className="cursor-pointer text-ec-blue">📎</span>
          )}
        </td>
        {/* 원본 [조회] — 숫자가 아니라 'R' 링크, 누르면 '조회자 현황'(2026-10-03 실측). 연 횟수는 글자 풍선으로. */}
        <td className={`${bg} text-center`}>
          <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                  title={`연 횟수 ${r.viewCount ?? 0}`} onClick={() => void openReaders(r)}>R</button>
        </td>
      </>
    )
  }

  /**
   * 칸반 카드 한 장 — 라벨 칩 · 제목 · N(아직 아무도 안 연 글) · 아랫줄(담당자) · 답글 수 [n](E200190 실측 — 답글이 있을 때만).
   * 원본 N 은 '내가 안 읽은 글' 로 보이는데 우리 응답에는 조회수만 있어 '조회 0' 으로 본다.
   */
  const toCard = (r: WorkPost, col: string, lane?: string, colors: BoardLabel[] = labelMaster): KanbanCard => ({
    id: r.id, col, lane, title: r.title, bold: r.notice, isNew: (r.viewCount ?? 0) === 0,
    chips: (r.labels ?? []).map((l) => ({ name: l, color: colors.find((x) => x.name === l)?.color })),
    sub: cfg.subField ? parseExtra(r.extraFields)[cfg.subField] : undefined,
    replies: repliesOf.get(r.id)?.length,
  })
  /** 카드를 끌어 놓으면 진행상태가 바뀐다(= [진행상태변경]). */
  async function moveStage(id: number, stage: string) {
    try { await api.patch(`/work-posts/${id}/status`, { stage }) } catch (err) { setError(extractErrorMessage(err)) }
    void load()
  }

  /** 하단 [라벨변경] · [라벨설정] — 칸반 게시판은 줄 끝에 둔다(원본 차례). */
  const labelButtons = (
    <>
        {cfg.labels && <span className="relative">
          <button className="ec-btn" onClick={() => { if (requireSelection(selected.size)) openLabels() }}>라벨변경</button>
          {labelOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLabelOpen(false)} />
              <div role="dialog" aria-label="라벨변경"
                   className="absolute bottom-full left-0 mb-[4px] z-[41] min-w-[160px] p-[9px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                <label className="flex items-center gap-[6px] py-[3px] cursor-pointer">
                  <input type="checkbox" checked={knownLabels.length > 0 && knownLabels.every((l) => labelPick.has(l))}
                         onChange={(e) => setLabelPick(new Set(e.target.checked ? knownLabels : []))} />
                  전체
                </label>
                {knownLabels.map((l) => (
                  <label key={l} className="flex items-center gap-[6px] py-[3px] cursor-pointer">
                    <input type="checkbox" checked={labelPick.has(l)} onChange={() => togglePick(l)} />
                    <LabelChip name={l} color={colorOf(l)} />
                  </label>
                ))}
                <div className="flex justify-between mt-[6px]">
                  <button type="button" className="ec-btn ec-btn-sm ec-btn-primary" aria-label="적용" onClick={() => void applyLabels()}>↵</button>
                  <button type="button" className="ec-btn ec-btn-sm" aria-label="라벨 더하기"
                          onClick={() => { setLabelOpen(false); setMasterOpen(true) }}>+</button>
                  <button type="button" className="ec-btn ec-btn-sm" aria-label="닫기" onClick={() => setLabelOpen(false)}>×</button>
                </div>
              </div>
            </>
          )}
        </span>}
        {/* 원본 하단 [라벨설정] — '라벨조회' 창(2026-10-12 잼, [라벨] · [라벨변경]의 + 와 같은 창). 통합게시판에는 없다. */}
        {cfg.labels && <button className="ec-btn" onClick={() => setMasterOpen(true)}>라벨설정</button>}
    </>
  )

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">{title}</span>
        {/* 상태 알약은 원본처럼 제목 바로 옆에 붙는다. */}
        {!cfg.kanban && <div className="ec-pills ml-[8px]">
          {['전체', ...statuses].map((t) => (
            <button
              key={t} type="button" onClick={() => setTab(t)}
              className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
            >
              {t}
            </button>
          ))}
          {/* 원본 공지사항은 알약 끝에 이 안내가 붙는다(누르면 회사 진행상태 설정 — 우리에게는 아직 없다). */}
          {(board === 'NOTICE' || cfg.freePill) && <span className="ec-pill no-ec">진행상태를 자유롭게 추가 가능합니다</span>}
        </div>}
        <div className="ml-auto flex gap-[4px]">
          {cfg.labels && <span className="relative">
            <button type="button" className={`ec-btn${labelFilter ? ' ec-btn-primary' : ''}`} onClick={openFilter}>라벨</button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                <div role="dialog" aria-label="라벨"
                     className="absolute top-full right-0 mt-[4px] z-[41] min-w-[160px] p-[9px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                  <label className="flex items-center gap-[6px] py-[3px] cursor-pointer">
                    <input type="checkbox" checked={filterKeys.every((k) => filterPick.has(k))}
                           onChange={(e) => setFilterPick(new Set(e.target.checked ? filterKeys : []))} />
                    전체
                  </label>
                  {filterKeys.map((k) => (
                    <label key={k} className="flex items-center gap-[6px] py-[3px] cursor-pointer">
                      <input type="checkbox" checked={filterPick.has(k)}
                             onChange={() => setFilterPick((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })} />
                      {k === NO_LABEL ? '라벨없음' : <LabelChip name={k} color={colorOf(k)} />}
                    </label>
                  ))}
                  <div className="flex justify-between mt-[6px]">
                    <button type="button" className="ec-btn ec-btn-sm ec-btn-primary" aria-label="적용" onClick={applyFilter}>↵</button>
                    <button type="button" className="ec-btn ec-btn-sm" aria-label="라벨조회"
                            onClick={() => { setFilterOpen(false); setMasterOpen(true) }}>+</button>
                    <button type="button" className="ec-btn ec-btn-sm" aria-label="닫기" onClick={() => setFilterOpen(false)}>×</button>
                  </div>
                </div>
              </>
            )}
          </span>}
          <input className="ec-input w-[110px]" placeholder="입력 후 [Enter]" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load() }} />
          <button className="ec-btn ec-btn-primary" onClick={onSearch}>Search(F3)</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      <WorkCondPanel agg={agg} aggSlots={aggSlots} applyCond={applyCond} cfg={cfg} compare={compare} cond={cond} condOpen={condOpen} menu={menu} rep={rep} setAgg={setAgg} setAggPick={setAggPick} setCompare={setCompare} setCond={setCond} setMenu={setMenu} setRepRan={setRepRan} />

      {error && !showForm && !viewing && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {info && <p className="ec-alert mb-[8px]" onClick={() => setInfo('')}>{info}</p>}

      {/* 원본 목록 오른쪽 위의 조회 기간 */}
      {!cfg.kanban && !(rep && repRan) && <div className="text-right text-[12px] text-ec-ink mb-[4px]">{dateText(from)} ~ {dateText(to)}</div>}

      {/* 현황 · 집계 결과(통합게시판 E200076 실측): 현황 = 일자-No. · 게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태, 집계 = 집계기준항목 · 제목 · 작성자명 · 전달자 · 진행상태. 아래 [인쇄 ▲][Excel(화면)]. */}
      {rep && repRan && (() => {
        const ag = menu === '집계' ? aggRows() : null
        return (
        <div className="flex-1 min-h-0">
          <table className="w-full text-left">
            <thead>
              <tr>
                {menu === '현황' ? <><th className="w-[110px] text-center">일자-No.</th><th className="w-[90px] text-center">게시글번호</th></> : ag!.keys.map((k) => <th key={k} className="w-[130px] text-center">{k}</th>)}
                <th className="text-center">제목</th><th className="w-[100px] text-center">작성자명</th><th className="w-[110px] text-center">전달자</th><th className="w-[110px] text-center">진행상태</th>
              </tr>
            </thead>
            <tbody>
              {numbered.length === 0 && <tr><td colSpan={menu === '현황' ? 6 : 4 + ag!.keys.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
              {menu === '현황' && numbered.map((r) => (
                <tr key={r.id}>
                  <td className="text-center">{dateText(r.postDate)} -{r.postNo}</td><td className="text-center">{r.postNo}</td>
                  <td>{r.title}</td><td>{r.writerName ?? r.writer}</td><td>{r.forwardTo ?? ''}</td><td>{statusOf(r)}</td>
                </tr>
              ))}
              {ag && numbered.length > 0 && ag.out.map((o, i) => o.kind === 'row' ? (
                <tr key={i}>
                  {o.vals.map((v, j) => <td key={j} className="text-center">{v}</td>)}
                  <td>{o.row.title}</td><td>{o.row.writerName ?? o.row.writer}</td><td>{o.row.forwardTo ?? ''}</td><td>{statusOf(o.row)}</td>
                </tr>
              ) : (
                <tr key={i}><td colSpan={4 + ag.keys.length} className="text-center font-bold bg-ec-page">{o.label}</td></tr>
              ))}
              {ag && numbered.length > 0 && <tr><td colSpan={4 + ag.keys.length} className="text-center font-bold bg-ec-page">총합계</td></tr>}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
            <button className="ec-btn" onClick={() => window.print()}>인쇄 ▲</button>
            <button className="ec-btn" onClick={() => setInfo('Excel(화면)은 지원하지 않습니다(파일 내려받기).')}>Excel(화면)</button>
          </div>
        </div>
        )
      })()}

      <div id="work-list" ref={gridRef} className={`flex-1 min-h-0${rep && repRan ? ' hidden' : ''}`}>
        {cfg.kanban ? (
          <EcKanban
            columns={cfg.kanban.order.map((st) => ({ key: st, name: st, tone: cfg.kanban!.tones[st], closed: cfg.kanban!.closed.includes(st) }))}
            cards={numbered.map((r) => toCard(r, statusOf(r)))}
            selected={selected}
            onToggle={(ids, on) => setSelected((p) => { const n = new Set(p); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n })}
            onOpen={(c) => { const r = rows.find((x) => x.id === c.id); if (r) openView(r) }}
            onMove={(c, col) => void moveStage(c.id, col)}
            onDelete={(c) => removeOne(c.id)} />
        ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              {/*
                * 1열은 행머리 — 헤더는 전체선택 체크칸, 본문은 회색 행번호 + 체크칸(번호 칸을 눌러도 고른다).
                * 원본 공지사항 목록은 줄마다 체크칸이 있어 [라벨변경] · [선택삭제] 할 글을 고른다(2026-10-29 데이터이관 QA B11 —
                * 번호 칸만 눌러 고르게 해 두었더니 고를 줄 몰라 '리스트에 선택된 자료가 없습니다' 에서 막혔다).
                */}
              <th className="w-[52px] text-center">
                <input type="checkbox" aria-label="전체선택" checked={listed.length > 0 && listed.every((x) => selected.has(x.r.id))}
                       onChange={() => setSelected(listed.every((x) => selected.has(x.r.id)) ? new Set() : new Set(listed.map((x) => x.r.id)))} />
              </th>
              {/* 원본 컬럼 순서: 게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태 · 첨부 · 조회 */}
              {cfg.cols ? cfg.cols.map((c) => (
                <th key={c} className={`${c === 'title' ? '' : c === 'stage' || c === 'forward' ? 'w-[150px] ' : 'w-[100px] '}text-center`}>{colHead(c, stageLabel)}</th>
              )) : <>
              <th className="w-[90px] text-center">{cfg.wide ? '번호' : '게시글번호'}</th>
              <th className="text-center">제목</th>
              {cfg.minutes ? (
                <>
                  {MINUTE_TEAMS.map((t) => <th key={t} className="w-[150px] text-center">{t} 회의록</th>)}
                  <th className="w-[80px] text-center">주 차</th>
                </>
              ) : (
                <>
                  <th className="w-[100px] text-center">{cfg.wide ? '작성자' : '작성자명'}</th>
                  <th className="w-[150px] text-center">전달자</th>
                  {cfg.wide && <th className="w-[100px] text-center">완료일</th>}
                  <th className="w-[150px] text-center">{stageLabel}</th>
                </>
              )}
              </>}
              <th className="w-[60px] text-center">첨부</th>
              <th className="w-[60px] text-center">조회</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="ec-empty">불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={colCount} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {pinned.map((r) => (
                  <tr key={`pin-${r.id}`}>
                    <td className="bg-ec-pinned" />
                    {cells(r, true)}
                  </tr>
                ))}
                {listed.map(({ r, reply }, i) => (
                  <tr key={reply ? `reply-${r.id}` : r.id}>
                    <td className={`text-center cursor-pointer select-none ${selected.has(r.id)
                          ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'bg-ec-stripe text-ec-hint'}`}
                        title="눌러서 이 글을 고릅니다"
                        onClick={() => toggleSelect(r.id)}>
                      <span className="inline-flex items-center gap-[4px]">
                        {i + 1}
                        <input type="checkbox" aria-label={reply ? `답글 ${r.title} 선택` : `${r.postNo} 선택`} checked={selected.has(r.id)}
                               onClick={(e) => e.stopPropagation()} onChange={() => toggleSelect(r.id)} />
                      </span>
                    </td>
                    {cells(r, false, reply)}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
        )}
      </div>

      <div className={`flex gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid${rep && repRan ? ' hidden' : ''}`}>
        {/*
          원본 하단: 신규(F2)·보내기·업무지원AI·진행상태변경·라벨변경·라벨설정·모두펼쳐보기·선택삭제·Excel·이력조회·웹자료올리기.
          받쳐 줄 기능이 있는 것만 둔다 — 보내기·업무지원AI·이력조회는 아직 없다. 라벨설정은 [라벨] · [라벨변경]의 + (라벨조회 창).
          [인쇄]는 원본처럼 View 창 안에 있다. [웹자료올리기]는 입력 창의 첨부 자리다.
        */}
        <button className="ec-btn ec-btn-primary" onClick={openNew}>신규(F2)</button>
        {/* 원본 [보내기 ▲] · [업무지원AI ▲] — 메일 · 바깥 AI 로 나가는 기능이라 모양만 둔다(누르면 안내). */}
        <button className="ec-btn" onClick={() => setInfo('보내기는 지원하지 않습니다(메일 · 쪽지 발송).')}>보내기 ▲</button>
        <button className="ec-btn" onClick={() => setInfo('업무지원AI는 지원하지 않습니다(바깥 서비스).')}>업무지원AI ▲</button>
        {/* 공지사항은 상태가 '기본' 하나라 바꿀 곳이 없다. */}
        <span className="relative">
          <button className="ec-btn disabled:opacity-45" disabled={statuses.length < 2 && !namedStages} onClick={openStageMenu}>진행상태변경 ▲</button>
          {stageMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setStageMenu(false)} />
              <ul role="menu" aria-label="진행상태변경"
                  className="absolute bottom-full left-0 mb-[4px] z-[41] min-w-[140px] py-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                {statuses.map((st) => (
                  <li key={st}>
                    <button type="button" role="menuitem" className="no-ec w-full text-left px-[10px] py-[4px] bg-transparent border-0 cursor-pointer hover:bg-ec-blue-wash"
                            onClick={() => void changeStatusSelected(st)}>{st}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </span>
        {!cfg.kanban && labelButtons}
        {/* 원본 칸반 게시판(E200190) 하단: … 진행상태변경 · 선택삭제 · Excel · 이력조회 · 라벨변경 · 라벨설정 — 모두펼쳐보기 · 웹자료올리기 없음 */}
        {!cfg.kanban && <button className="ec-btn" onClick={() => setOpened((v) => !v)}>{opened ? '모두접기' : '모두펼쳐보기'}</button>}
        <button className="ec-btn" onClick={() => { if (requireSelection(selected.size)) void deleteSelected() }}>선택삭제</button>
        <button className="ec-btn" onClick={() => void doExcel()}>Excel</button>
        <button className="ec-btn" onClick={() => setInfo('이력조회는 아직 지원하지 않습니다.')}>이력조회</button>
        {cfg.kanban ? labelButtons
          : <button className="ec-btn" onClick={() => setInfo('웹자료올리기는 지원하지 않습니다 — 신규(F2) 입력 창의 [첨부] 를 쓰세요.')}>웹자료올리기</button>}
      </div>

      {masterOpen && <LabelMasterModal board={board} onClose={() => { setMasterOpen(false); void load() }} />}

      <WorkPostFormModal attachment={attachment} board={board} ccMenu={ccMenu} cfg={cfg} closeForm={closeForm} copyId={copyId} editId={editId} employees={employees} error={error} firstStage={firstStage} form={form} forwardMenu={forwardMenu} itemList={itemList} kanbanPosts={kanbanPosts} meetingTitle={meetingTitle} namedStages={namedStages} partnerList={partnerList} projects={projects} removeOne={removeOne} rows={rows} set={set} setAttachment={setAttachment} setCcMenu={setCcMenu} setCopyId={setCopyId} setEditId={setEditId} setError={setError} setForm={setForm} setForwardMenu={setForwardMenu} setLinkPickFor={setLinkPickFor} setLinkTab={setLinkTab} setPickFor={setPickFor} setShowForm={setShowForm} setStatusBlank={setStatusBlank} setViewing={setViewing} setWeekMenu={setWeekMenu} showForm={showForm} stageLabel={stageLabel} statusBlank={statusBlank} submit={submit} title={title} upload={upload} uploading={uploading} weekMenu={weekMenu} />

      <WorkPostViewModal board={board} boardPick={boardPick} cardView={cardView} cardsFolded={cardsFolded} cfg={cfg} dateNoOf={dateNoOf} error={error} histFor={histFor} lastFor={lastFor} meetingPosts={meetingPosts} moveStage={moveStage} numbered={numbered} openCopy={openCopy} openEdit={openEdit} openReply={openReply} openTeams={openTeams} openView={openView} printPost={printPost} removeOne={removeOne} setBoardPick={setBoardPick} setCardView={setCardView} setCardsFolded={setCardsFolded} setConfirmIds={setConfirmIds} setHistFor={setHistFor} setInfo={setInfo} setLastFor={setLastFor} setOpenTeams={setOpenTeams} setViewing={setViewing} signLabels={signLabels} signPosts={signPosts} statusOf={statusOf} title={title} toCard={toCard} viewing={viewing} />

      <WorkPostSubModals agg={agg} aggPick={aggPick} confirmIds={confirmIds} doDelete={doDelete} error={error} form={form} linkPickFor={linkPickFor} linkTab={linkTab} meetingPosts={meetingPosts} pickFor={pickFor} readers={readers} set={set} setAgg={setAgg} setAggPick={setAggPick} setConfirmIds={setConfirmIds} setLinkPickFor={setLinkPickFor} setLinkTab={setLinkTab} setPickFor={setPickFor} setReaders={setReaders} />
    </div>
  )
}


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

/**
 * 알약(탭)은 화면마다 마지막 하나가 다르다 — 원본에서 확인했다.
 *   내결재관리     : 전체·기안중·진행중·반려·결재·**수신참조**
 *   기안서통합관리 : 전체·기안중·진행중·반려·결재·**삭제**
 * 앞의 다섯은 같고, 내 결재함에서는 '내가 수신참조로 걸린 문서', 통합관리에서는
 * '지운 문서'를 마지막 칸으로 본다. 우리는 둘 다 '삭제'로 두고 있었다.
 */
const COMMON_TABS = ['전체', '기안중', '진행중', '반려', '결재'] as const
const TABS_MINE = [...COMMON_TABS, '수신참조'] as const
const TABS_ALL = [...COMMON_TABS, '삭제'] as const
type Tab = (typeof TABS_MINE)[number] | (typeof TABS_ALL)[number]

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
  const { user } = useAuth()
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
  const [tab, setTab] = useState<Tab>('전체')
  const TABS: readonly Tab[] = scope === 'mine' ? TABS_MINE : TABS_ALL
  /* 기간 줄의 이름은 화면마다 다르다 — 내결재관리 [기준일자] · 기안서통합관리 [일자](사본 실측). */
  const dateLabel = scope === 'mine' ? '기준일자' : '일자'
  /**
   * 빈 줄이 걸칠 칸 수. [작업자]·[작업일시]가 scope 에 따라 붙었다 빠지므로
   * 숫자를 두 군데 적으면 한쪽만 고치게 된다 — 실제로 이 저장소에서 가장 자주 낸 실수다.
   */
  const colCount = 12 + (scope === 'all' ? 2 : 0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 기안서 작성 화면이 넘겨준 저장 결과(번호). 넘어오자마자 보여 줄 자리가 여기뿐이다. */
  const passedNotice = (useLocation().state as { notice?: string } | null)?.notice ?? ''
  const [detail, setDetail] = useState<ApprovalDoc | null>(null)
  // 상세에서 formData 의 키를 사람이 읽는 라벨로 바꾸기 위해 양식 스키마를 받아둔다.
  const [schemas, setSchemas] = useState<Record<number, ApprovalField[]>>({})
  // 원본 하단 버튼줄의 [결재/검토완료]·[라벨변경]은 **고른 문서에 한꺼번에** 하는 동작이다.
  // 그러려면 행을 고를 수 있어야 하는데 우리 목록엔 그 방법이 없었다.
  // 고르는 방식은 판매조회·전표입력과 같다 — 회색 행번호 칸을 누른다.
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

  const inPeriod = (d: ApprovalDoc) =>
    (!from || (d.draftDate ?? '') >= from) && (!to || (d.draftDate ?? '') <= to)
  const filtered = rows.filter((r) => inTab(r, tab, user?.name)).filter(inPeriod)
    .filter((r) => !formType || r.formTypeName === formType)
    .filter((r) => !dept || (r.department ?? '') === dept)
    .filter((r) => !project || String(r.projectId ?? '') === project)
    .filter((r) => !labelCond || (r.labelText ?? '') === labelCond)
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
    구분: (r) => r.formTypeName,
    기안자: (r) => r.drafterName,
  })
  const PAGE_SIZE = 15
  const pages = Math.max(1, Math.ceil(sort.sorted.length / PAGE_SIZE))
  const curPage = Math.min(page, pages)

  /** 조건 보기에 채울 값 — 지금 목록에 실제로 있는 것만 고르게 한다. */
  const formTypes = [...new Set(rows.map((r) => r.formTypeName).filter(Boolean))].sort()
  const depts = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort() as string[]
  /* 프로젝트는 이름이 겹칠 수 있어 id 로 고르고 거른다(코드도움). */
  const projects = [...new Map(rows.filter((r) => r.projectId != null)
    .map((r) => [r.projectId, { value: String(r.projectId), name: r.projectName ?? '' }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const labels = [...new Set(rows.map((r) => r.labelText).filter(Boolean))].sort() as string[]
  const approvers = [...new Set(rows.flatMap((r) => (r.lines ?? []).map((l) => l.approverName)))].sort()

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
      alert(extractErrorMessage(err))
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
        ? '결재할 문서를 고르세요. 행번호 칸을 누르면 선택됩니다.'
        : '고른 문서 중 지금 내 차례인 것이 없습니다.')
      return
    }
    if (!window.confirm(`${targets.length}건을 결재할까요?`)) return
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
      flash('라벨을 바꿀 문서를 고르세요. 행번호 칸을 누르면 선택됩니다.')
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
        ? '지울 문서를 고르세요. 행번호 칸을 누르면 선택됩니다.'
        : '고른 문서 중 지울 수 있는 것이 없습니다.')
      return
    }
    if (!window.confirm(`${targets.length}건을 삭제할까요? (삭제 탭에서 다시 볼 수 있습니다)`)) return
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
      alert(extractErrorMessage(err))
    }
  }

  async function remove(d: ApprovalDoc) {
    if (!window.confirm(`'${d.title}' 기안서를 삭제할까요? (삭제 탭에서 다시 볼 수 있습니다)`)) return
    try {
      await api.delete(`/approvals/${d.id}`)
      setDetail(null)
      flash('삭제되었습니다.')
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const copy = (d: ApprovalDoc) => navigate('/groupware/approval/draft', { state: { copyFrom: d } })



  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '전자결재 목록', [])

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">{title}</span>
        <div className="ml-auto flex items-center gap-[4px] relative">
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
              <div onClick={() => setOptionOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41, background: '#fff', border: '1px solid var(--ec-line)', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150, padding: 4 }}>
                {[
                  { label: 'Excel', run: () => { void doExcel() } },   // 원본 버튼 이름 그대로
                  { label: '인쇄', run: () => doPrint() },
                  { label: '검색조건 초기화', run: () => { setSearch(''); filterRows('') } },
                ].map((m) => (
                  <button key={m.label} onClick={() => { setOptionOpen(false); m.run() }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, background: 'none', border: 0, cursor: 'pointer' }}>{m.label}</button>
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
        {TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => { setTab(t); setPage(1) }}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 원본은 조건을 접어 두고 [Search(F3)] 로 편다. 펴면 기안일자 기간 + 조건들이 나온다. */}
      {condOpen && <div className="flex items-center flex-wrap gap-[4px] mb-[6px] ec-search-conds">
        {/*
          <b>이 파일이 겸하는 두 화면은 이 줄을 서로 다르게 부른다</b>(사본 실측) —
          기안서통합관리는 [일자], 내결재관리는 [기준일자]다. 한 이름으로 눌러 두면
          한쪽이 늘 틀린다(판매조회/구매조회에서 겪은 것과 같다).
        */}
        <label className="text-[12.5px] text-ec-label">{dateLabel}</label>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
        <span className="text-ec-label">~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
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
        <label className="text-[12.5px] text-ec-label ml-[8px]">부서</label>
        <select className="ec-input" value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: 130 }}>
          <option value="">전체</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="text-[12.5px] text-ec-label ml-[8px]">프로젝트</label>
        {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */}
        <CodePickerField label="프로젝트" hideLabel width={150} placeholder="프로젝트" emptyLabel="전체"
                         value={project} onChange={setProject} items={projects} />
        <label className="text-[12.5px] text-ec-label ml-[8px]">기안서No.</label>
        <input className="ec-input" value={docNoCond} onChange={(e) => setDocNoCond(e.target.value)}
               style={{ width: 140 }} placeholder="문서번호 일부" />
        <label className="text-[12.5px] text-ec-label ml-[8px]">첨부</label>
        <select className="ec-input" value={attachCond} style={{ width: 100 }}
                onChange={(e) => setAttachCond(e.target.value as '전체' | '있음' | '없음')}>
          {(['전체', '있음', '없음'] as const).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <label className="text-[12.5px] text-ec-label ml-[8px]">라벨</label>
        <select className="ec-input" value={labelCond} onChange={(e) => setLabelCond(e.target.value)} style={{ width: 130 }}>
          <option value="">전체</option>
          {labels.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>}

      {/* 원본: 쪽번호(한 쪽 15줄)는 왼쪽, 기안일자 기간은 오른쪽 — 표 바로 위 */}
      <div className="flex items-center gap-[6px] mb-[4px]">
        <div className="ec-paging">
          {Array.from({ length: pages }, (_, k) => k + 1).map((p) => (
            <button key={p} type="button" className={p === curPage ? 'active' : ''} onClick={() => setPage(p)}>{p}</button>
          ))}
        </div>
        <span className="text-[12px] text-ec-ink">/ {pages}</span>
        <span className="ml-auto text-[12px] text-ec-ink">{from.replace(/-/g, '/')} ~{to.replace(/-/g, '/')}</span>
      </div>

      <div ref={bodyRef} className="flex-1 min-h-0 overflow-x-auto">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              {/* 1열은 행머리다 — 헤더는 전체선택, 본문은 행번호(눌러서 선택). 다른 목록과 같은 규칙. */}
              <th
                style={{ width: 34, cursor: filtered.length > 0 ? 'pointer' : 'default' }}
                title="전체 선택 / 해제"
                onClick={() => setSelected(
                  selected.size === filtered.length ? new Set() : new Set(filtered.map((d) => d.id)),
                )}
              >
                {filtered.length > 0 && selected.size === filtered.length ? '☑' : ''}
              </th>
              <th className="cursor-pointer" onClick={() => sort.toggle('기안일자')}>기안일자 {sort.mark('기안일자')}</th>
              <th>제목</th>
              <th className="text-center">ERP전표(건)</th>
              <th className="cursor-pointer" onClick={() => sort.toggle('구분')}>구분 {sort.mark('구분')}</th>
              <th className="cursor-pointer" onClick={() => sort.toggle('기안자')}>기안자 {sort.mark('기안자')}</th>
              <th>결재자</th>
              <th className="text-center">진행상태</th>
              <th className="text-center">결재</th>
              <th className="text-center">기안서복사</th>
              <th className="text-center">조회</th>
              <th>연결전표</th>
              {/*
                원본 기안서통합관리에서 이 둘은 <b>맨 마지막 두 열</b>이다(대조표 실측).
                주석에는 그렇게 적어 두고 정작 [결재자] 바로 뒤에 세워 두어,
                원본을 쓰던 사람이 오른쪽 끝에서 찾던 값이 가운데에 있었다.
                내결재관리(mine)에는 원본에도 없다 — 그래서 scope 로 가른다.
              */}
              {scope === 'all' && <th className="w-[90px]">작업자</th>}
              {scope === 'all' && <th className="w-[150px]">작업일시</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="ec-empty">불러오는 중…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={colCount} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : sort.sorted.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE).map((r, i0) => { const i = (curPage - 1) * PAGE_SIZE + i0; return (
              <tr key={r.id} style={{ opacity: r.deleted ? 0.55 : 1 }}>
                <td
                  style={{
                    textAlign: 'center',
                    background: selected.has(r.id) ? 'var(--ec-blue-light)' : 'var(--ec-report-stripe)',
                    color: selected.has(r.id) ? 'var(--ec-blue-dark)' : 'var(--ec-text-hint)',
                    fontWeight: selected.has(r.id) ? 700 : 400,
                    cursor: 'pointer', userSelect: 'none',
                  }}
                  title="눌러서 이 문서를 고릅니다"
                  onClick={() => toggleSelect(r.id)}
                >
                  {i + 1}
                </td>
                <td className="whitespace-nowrap">{r.draftNo}</td>
                <td><a onClick={() => setDetail(r)} className="text-ec-blue cursor-pointer">{r.title}</a></td>
                <td className="text-center">{r.voucherCount > 0 ? r.voucherCount : ''}</td>
                <td>{r.formTypeName}</td>
                <td>{r.drafterName}</td>
                <td>{r.currentApproverName ?? ''}</td>
                <td className="text-center">
                  {r.deleted
                    ? <span className="text-ec-hint">삭제</span>
                    : <span style={{ color: statusColor(r.status) }}>{STATUS_LABEL[r.status]}</span>}
                </td>
                <td className="text-center">
                  {isMyTurn(r) ? (
                    <div className="inline-flex gap-[3px]">
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => act(r, 'approve')}>승인</button>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => act(r, 'reject')}>반려</button>
                    </div>
                  ) : r.status === 'DRAFTING' && isMine(r) && !r.deleted ? (
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => submitDraft(r)}>상신</button>
                  ) : (
                    <span className="text-ec-off">—</span>
                  )}
                </td>
                <td className="text-center">
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => copy(r)}>복사</button>
                </td>
                <td className="text-center">
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setDetail(r)}>보기</button>
                </td>
                <td className="whitespace-nowrap">
                  {r.vouchers.map((v) => (
                    <span key={v.id} className="inline-block mr-[4px] py-[1px] px-[6px] rounded-[10px] text-[11px] bg-ec-blue-wash text-ec-navy">
                      {VOUCHER_LABEL[v.voucherType] ?? v.voucherType} {v.voucherNo}
                    </span>
                  ))}
                </td>
                {scope === 'all' && <td>{r.lastActorName ?? ''}</td>}
                {scope === 'all' && (
                  <td className="text-[11.5px] text-ec-label">
                    {r.lastActedAt ? r.lastActedAt.replace('T', ' ').slice(0, 16) : ''}
                  </td>
                )}
              </tr>
            )})}
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
            <button className="ec-btn ec-btn-primary" onClick={() => navigate('/groupware/approval/draft')}>
              신규(F2)
            </button>
            <button className="ec-btn" disabled={selected.size === 0} style={selected.size === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined} onClick={() => void approveSelected()}>결재/검토완료</button>
          </>
        ) : (
          <button className="ec-btn" disabled={selected.size === 0} style={selected.size === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined} onClick={() => void deleteSelected()}>선택삭제</button>
        )}
        <button className="ec-btn" disabled={selected.size === 0} style={selected.size === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined} onClick={() => void changeLabelSelected()}>라벨변경</button>
        {bottomActions.map((a) => {
          const onClick = a.includes('Excel') || a.includes('엑셀') ? () => { void doExcel() }
            : a.includes('인쇄') || a.includes('출력') ? () => doPrint()
            : undefined
          return <button key={a} className="ec-btn" onClick={onClick}>{a}</button>
        })}
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
        />
      )}

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

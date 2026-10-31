import { Fragment, useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcPeriodPicks, { periodOf, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { EcHistoryModal } from '../../components/EcHistory'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, Project, WorkJournal } from '../../types/api'
import { partnerCodeItems } from '../../utils/codeItems'
import { useAuth } from '../../features/auth/AuthContext'
import { useShortcut } from '../../utils/useShortcut'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { inactiveDeptNames, showsJournal, type DeptRow } from '../../utils/inactiveDept'
import { openPrintWindow, fillAndPrint } from '../../utils/print'
import { escapeHtml } from '../../utils/escapeHtml'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EcRichEditor from '../../components/EcRichEditor'
import EcFileDrop from '../../components/EcFileDrop'
import { downloadStoredFile, formatBytes } from '../../utils/fileDownload'
import EcRichBody from '../../components/EcRichBody'
import { htmlToText, isHtml, sanitizeHtml } from '../../utils/richText'
import { shrinkImage } from '../../utils/imageResize'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'
import { pad2, todayYmd } from '../../utils/periods'

const WORKLOG_PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월', '전월', '금년', '전년', '종료일', '최근3일+7일'] as const

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const dow = (d: string) => (d ? DOW[new Date(`${d}T00:00:00`).getDay()] : '')
/** 격자 머리 '10/05(월)'. */
const dayHead = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}(${dow(d)})`
/** 원본 '조회' 머리의 작성 시각 — '2026/10/03 오후 6:20:13'. */
const stampText = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${d.toLocaleTimeString('ko-KR')}`
}
/** 원본 [R] '조회자 현황' 응답 */
type Viewers = { notViewed: string[]; viewed: { name: string; firstViewedAt: string; lastViewedAt: string }[] }
/** 원본: 업무보고일 기간이 255일을 넘으면 검색하지 않고 알린다(2026-10-20 실측 — [금년]). */
const MAX_DAYS = 255
const spanDays = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1
/** from ~ to 의 날짜(요일 조건이 있으면 그 요일만). 너무 긴 기간은 1년으로 자른다. */
function daysOf(from: string, to: string, onlyDow: string): string[] {
  if (!from || !to || from > to) return []
  const out: string[] = []
  const d = new Date(`${from}T00:00:00`)
  for (let i = 0; i < 366 && ymd(d) <= to; i++) {
    const s = ymd(d)
    if (!onlyDow || dow(s) === onlyDow) out.push(s)
    d.setDate(d.getDate() + 1)
  }
  return out
}

type Form = { reportDate: string; department: string; partnerName: string; projectId: string; title: string; content: string; attachment: { id: number; name: string } | null }
const emptyForm = (): Form => ({ reportDate: todayYmd(), department: '', partnerName: '', projectId: '', title: '', content: '', attachment: null })

/**
 * 그룹웨어 > 업무관리 > 업무일지 (이카운트 E070304)
 *
 * <p><b>2026-10-03 원본에 QA그룹웨어-일지를 넣어 재고 지웠다.</b> 원본 업무일지의 결과는 목록이 아니라
 * <b>부서 × 일자 격자</b>다 — 줄은 부서(회계팀 · 인사팀 …), 칸은 업무보고일 기간의 날마다 '10/05(월)' 머리 아래
 * 두 칸(제목 150 · 빈 칸 30). 일지 제목이 그 부서 · 그날 칸에 가운데 링크로 찍히고, 기간이 길면 표가 옆으로 민다.
 * [요일] 조건을 걸면 그 요일 칸만 남는다(회사가 저장해 둔 '업무일지' 탭은 월요일만). 하단은 [신규(F2)] 하나.
 *
 * <p>[신규(F2)] → '업무일지게시글작성': 작성자 · 업무보고일 · 부서 · 거래처 · 프로젝트 · 제목 · 첨부 · 본문,
 * [저장(F8)][닫기]. 본문 없이도 저장된다. 제목을 누르면 '조회' 창 — 머리 '8 QA그룹웨어-일지 guest 2026/10/03 오후 6:20:13',
 * 업무보고일 : 20261005 · 부서 · 거래처 · 프로젝트, [삭제]는 '게시글을 삭제하면 복구할 수 없습니다. 삭제하겠습니까?'.
 * 우리는 일지 목록 하나였고 고치거나 지울 길이 없었다(서버에 PUT · DELETE 를 더했다).
 *
 * <p><b>2026-10-12 답글 · 복사 · 답변을 더했다(원본에 QA그룹웨어-일지 · -답글을 넣어 재고 지웠다).</b>
 * [답글(F8)] · 아래 [답변]은 그 글의 칸을 그대로 채운 '업무일지게시글작성' 창을 띄우고, 저장하면 '조회' 창의
 * 원글 아래에 '↳ 1 제목 작성자 시각' 카드가 붙는다(답글 카드의 버튼은 [답글][수정][삭제]). 답글은 격자에 찍히지 않는다.
 * [복사]는 같은 칸을 채운 새 글 창. 답글이 달린 글의 [삭제]는 '답변이 있는 글은 삭제할 수 없습니다. 답변 삭제 후 다시 시도 바랍니다.'
 *
 * <p><b>2026-10-14 다시 쟀다(원본에 QA그룹웨어-일지를 넣고 고치고 지웠다).</b> 신규 창에는 임시저장 배너가 없다
 * (원본 임시저장은 게시판 입력 창 `temporary_board/…` 만 쓴다 — 본문을 치고 닫았다 다시 열어도 안내가 안 뜬다).
 * 필수는 <b>부서 · 제목</b> — 비운 채 저장하면 문구 없이 두 칸만 빨갛게 두른다. 원글을 고쳐 저장하면 '조회' 창으로 돌아온다.
 * 수정 창 하단은 [저장(F8)][닫기][삭제][H]. 격자 둘째 칸(30)은 답글 수 '[1]' 이다(답글이 있을 때만).
 *
 * <p><b>2026-10-14 [H] · 답글펼치기.</b> 조회 창의 글 카드마다(원글 · 답글) 와 수정 창 하단에 [H] — '이력' 창(머리 '게시글번호 : 원글번호',
 * 저장할 때마다 1 GUEST … 신규 · 2 … 수정). 하단 [답글펼치기] 는 처음엔 답글 본문이 펼쳐진 채이고 누르면 [답글접기] 로만 바뀌며,
 * [답글접기] 를 누르면 답글 카드가 머리 줄(↳ 번호 · 제목 · 작성자 · 시각)만 남는다(원본 실측 차례 그대로).
 *
 * <p><b>2026-10-20 [R] · 255일.</b> 조회 창 하단 [답변][인쇄][닫기][R][답글펼치기] — [R] 은 '조회자 현황' 창(화면 폭의 절반):
 * 왼쪽 '미조회자' 이름 격자(글쓴이 빼고 회사 사용자 전부, 한글 이름 먼저), 오른쪽 '조회자' 이름 · 최초조회일시 · 최종조회일시
 * (아무도 안 봤으면 빈 줄 하나), 하단 [닫기]. 글쓴이 자신이 열어 본 것은 조회자에 오르지 않는다.
 * 업무보고일 기간이 255일을 넘으면 '검색된 일자가 255일을 초과했습니다. / 검색조건을 재설정해주시기 바랍니다.' 만 띄운다.
 *
 * <p>2026-10-21: 입력 창 [첨부] 줄 · 서식 편집기(본문은 HTML 로 저장) · 답글 창 [본문보기](원글 카드를 창 아래에 붙인다 —
 * 수정 창에는 없다: [저장(F8)][닫기][삭제][H]). 원본 [요일] 칩은 지우면 일자 열이 날마다로 바뀐다(우리 [요일] 전체).
 * 원본은 조회 창에서 지운 뒤 격자를 다시 읽지 않아 지운 제목이 [검색] 전까지 남는데, 우리는 바로 다시 읽는다.
 */
export default function WorkLogPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<WorkJournal[]>([])
  const [error, setError] = useState('')
  const [view, setView] = useState<'cond' | 'result'>('cond')
  const [projects, setProjects] = useState<Project[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  /** 부서 마스터 — 격자의 줄이고 조건 [부서]의 후보다. */
  const [depts, setDepts] = useState<DeptRow[]>([])
  const [inactiveDepts, setInactiveDepts] = useState<Set<string>>(new Set())

  /* 원본 조건 차례: 업무보고일 · 요일 · 부서 · 프로젝트 · 거래처 · 제목 · 내용 · 최초작성자 · 기타. */
  const initCond = () => {
    const m = periodOf('최근3일+7일')!
    return { from: m.from, to: m.to, dow: '', department: '', projectId: '', partnerName: '', title: '', content: '', author: '' }
  }
  const [cond, setCond] = useState(initCond)
  const setC = (k: keyof ReturnType<typeof initCond>, v: string) => setCond((c) => ({ ...c, [k]: v }))
  /** 원본 [기타]의 [사용중단부서포함] — 기본은 꺼져 있다. */
  const [withInactiveDept, setWithInactiveDept] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const setF = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const [viewing, setViewing] = useState<WorkJournal | null>(null)
  /** 원본 [답글펼치기] — init(처음 · 펼쳐 둠) → open([답글접기]) → closed(머리 줄만, [답글펼치기]). */
  const [replyFold, setReplyFold] = useState<'init' | 'open' | 'closed'>('init')
  /** [H] '이력' 창을 띄울 글 */
  const [historyOf, setHistoryOf] = useState<WorkJournal | null>(null)
  /** [R] '조회자 현황' */
  const [viewers, setViewers] = useState<Viewers | null>(null)
  /** 답글 창이면 원글 id — 저장할 때 parentId 로 보낸다. */
  const [replyTo, setReplyTo] = useState<number | null>(null)
  /** 답글 창 [본문보기] — 원글 카드를 창 아래에 붙인다. */
  const [showOriginal, setShowOriginal] = useState(false)
  const [uploading, setUploading] = useState(false)
  async function upload(file: File) {
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', await shrinkImage(file))
      const r = await api.post<{ id: number; name: string }>('/files', fd)
      setF('attachment', { id: r.data.id, name: r.data.name })
    } catch (err) { setError(extractErrorMessage(err)) } finally { setUploading(false) }
  }
  /** 저장을 눌렀는데 비어 있던 필수칸 — 원본은 문구 없이 그 칸만 빨갛게 두른다(부서 · 제목). */
  const [invalid, setInvalid] = useState<Set<'department' | 'title'>>(new Set())

  useEffect(() => {
    api.get<DeptRow[]>('/departments')
      .then((r) => { setDepts(r.data); setInactiveDepts(inactiveDeptNames(r.data)) })
      .catch(() => { /* 못 받으면 일지에 적힌 부서만 줄로 세운다 */ })
    api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
  }, [])

  async function search() {
    setError('')
    if (cond.from && cond.to && spanDays(cond.from, cond.to) > MAX_DAYS) {
      return void ecAlert(`검색된 일자가 ${MAX_DAYS}일을 초과했습니다.\n검색조건을 재설정해주시기 바랍니다.`)
    }
    try {
      const r = await api.get<WorkJournal[]>('/work-journals', { params: { from: cond.from || undefined, to: cond.to || undefined } })
      setRows(r.data)
      setView('result')
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useShortcut('F8', () => void search(), view === 'cond' && !showForm && !viewing)
  useShortcut('F8', () => void submit(), showForm)
  useShortcut('F8', () => { if (viewing) openReply(viewing) }, !!viewing && !showForm)

  const has = (v: string | null | undefined, q: string) => !q || (v ?? '').includes(q)
  const shown = rows.filter((r) =>
    r.parentId == null
    && (!cond.dow || dow(r.reportDate) === cond.dow)
    && has(r.department, cond.department)
    && (!cond.projectId || String(r.projectId ?? '') === cond.projectId)
    && has(r.partnerName, cond.partnerName)
    && has(r.title, cond.title)
    && has(htmlToText(r.content), cond.content)
    && has(r.authorName, cond.author)
    && showsJournal(r.department, inactiveDepts, withInactiveDept))

  /** 격자의 줄 — 부서 마스터 차례, 그 뒤에 마스터에 없는 이름으로 적힌 일지의 부서. */
  const deptRows = (() => {
    const names = depts.filter((d) => withInactiveDept || d.active).map((d) => d.name)
    for (const r of shown) if (r.department && !names.includes(r.department)) names.push(r.department)
    return cond.department ? names.filter((n) => n.includes(cond.department)) : names
  })()
  const days = daysOf(cond.from, cond.to, cond.dow)
  /** 원글 아래 답글 수(답글의 답글은 세지 않는다). */
  const replyCount = (id: number) => rows.filter((x) => x.parentId === id).length
  const gridRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(gridRef, '업무일지 부서×일자', [view, days.length, deptRows.length])

  /** '조회' 창의 원글 아래 답글들 — 답글의 답글까지, 단 차례(id)대로 깊이와 함께. */
  function threadOf(root: WorkJournal): { r: WorkJournal; depth: number }[] {
    const out: { r: WorkJournal; depth: number }[] = []
    const walk = (pid: number, depth: number) => {
      for (const c of rows.filter((x) => x.parentId === pid).sort((a, b) => a.id - b.id)) {
        out.push({ r: c, depth })
        walk(c.id, depth + 1)
      }
    }
    walk(root.id, 1)
    return out
  }
  /** 답글이면 맨 위 원글 번호 — 원본 이력 머리 '게시글번호 : 8' 은 답글도 원글 번호다. */
  const rootId = (r: WorkJournal): number => {
    let cur = r
    for (let i = 0; i < 50 && cur.parentId != null; i++) {
      const p = rows.find((x) => x.id === cur.parentId)
      if (!p) return cur.parentId
      cur = p
    }
    return cur.id
  }
  /** 제목을 눌러 '조회' 창을 연다 — 조회 기록을 남긴다(글쓴이 자신은 서버가 뺀다). */
  function openView(r: WorkJournal) {
    setViewing(r)
    api.post(`/work-journals/${r.id}/views`).catch(() => { /* 기록을 못 남겨도 창은 연다 */ })
  }
  async function openViewers(r: WorkJournal) {
    try {
      setViewers((await api.get<Viewers>(`/work-journals/${r.id}/viewers`)).data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  const fill = (r: WorkJournal): Form => ({
    reportDate: r.reportDate, department: r.department ?? '', partnerName: r.partnerName ?? '',
    projectId: r.projectId != null ? String(r.projectId) : '', title: r.title, content: r.content ?? '',
    attachment: r.attachmentId ? { id: r.attachmentId, name: r.attachmentName ?? '첨부' } : null,
  })
  /** 원본 [답글(F8)] · [답변] — 그 글의 칸을 그대로 채운 작성 창. '조회' 창은 열어 둔다. */
  function openReply(r: WorkJournal) {
    setInvalid(new Set())
    setEditId(null)
    setReplyTo(r.id)
    setShowOriginal(false)
    setForm(fill(r))
    setError('')
    setShowForm(true)
  }
  /** 원본 [복사] — 같은 칸을 채운 새 글. */
  function openCopy(r: WorkJournal) {
    setInvalid(new Set())
    setViewing(null)
    setEditId(null)
    setReplyTo(null)
    setForm(fill(r))
    setError('')
    setShowForm(true)
  }

  function openNew() {
    setInvalid(new Set())
    setReplyTo(null)
    setEditId(null)
    setForm(emptyForm())
    setError('')
    setShowForm(true)
  }
  function openEdit(r: WorkJournal) {
    setInvalid(new Set())
    // 원본: 원글 [수정] 은 '조회' 창 자리에 작성 창을 띄우고, 저장하면 다시 '조회' 창(submit)
    if (r.parentId == null) setViewing(null)
    setReplyTo(null)
    setEditId(r.id)
    setForm(fill(r))
    setError('')
    setShowForm(true)
  }

  async function submit() {
    setError('')
    // 원본(2026-10-14): 부서 · 제목이 비면 저장하지 않고 두 칸을 빨갛게만 두른다 — 알림 문구는 없다.
    const miss = new Set<'department' | 'title'>()
    if (!form.department) miss.add('department')
    if (!form.title.trim()) miss.add('title')
    setInvalid(miss)
    if (miss.size > 0) return
    const body = {
      reportDate: form.reportDate,
      department: form.department || undefined,
      partnerName: form.partnerName || undefined,
      projectId: form.projectId ? Number(form.projectId) : undefined,
      title: form.title,
      content: form.content,
      attachmentId: form.attachment?.id,
      parentId: replyTo ?? undefined,
    }
    try {
      const saved = editId != null
        ? (await api.put<WorkJournal>(`/work-journals/${editId}`, body)).data
        : (await api.post<WorkJournal>('/work-journals', body)).data
      setShowForm(false)
      setReplyTo(null)
      // 원본: 원글을 고쳐 저장하면 그 글의 '조회' 창으로 돌아온다(고친 제목으로). 답글을 고치면 조회 창은 원글 그대로.
      if (editId != null && saved && saved.parentId == null) setViewing(saved)
      if (view === 'result') void search()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(r: WorkJournal) {
    // 원본은 답글이 달린 글이면 묻지도 않고 이 안내만 띄운다(2026-10-12 실측). 서버도 같은 말로 막는다.
    if (rows.some((x) => x.parentId === r.id)) return setError('답변이 있는 글은 삭제할 수 없습니다.\n\n답변 삭제 후 다시 시도 바랍니다.')
    setError('')
    if (!(await ecConfirm('게시글을 삭제하면 복구할 수 없습니다.\n삭제하겠습니까?'))) return
    try {
      await api.delete(`/work-journals/${r.id}`)
      // 답글을 지우면 '조회' 창은 원글을 띄운 채로 남는다(원본 실측).
      if (r.parentId == null) setViewing(null)
      setShowForm(false)
      void search()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  function printOne(r: WorkJournal) {
    const win = openPrintWindow()
    if (!win) return
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>업무일지</title></head><body>
<h1>${escapeHtml(r.title)}</h1><p>${escapeHtml(r.authorName)} ${escapeHtml(stampText(r.createdAt))}</p>
<p>업무보고일 : ${r.reportDate.replace(/-/g, '')}<br>부서 : ${escapeHtml(r.department ?? '')}<br>거래처 : ${escapeHtml(r.partnerName ?? '')}<br>프로젝트 : ${escapeHtml(r.projectName ?? '')}</p>
${isHtml(r.content) ? `<div>${sanitizeHtml(r.content)}</div>` : `<pre>${escapeHtml(r.content ?? '')}</pre>`}</body></html>`)
  }

  const deptItems = depts.filter((d) => withInactiveDept || d.active).map((d) => ({ value: d.name, code: d.code ?? '', name: d.name }))
  const projectItems = projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))
  /**
   * 원본 [거래처] 는 조건 · 작성 창 둘 다 코드도움('거래처검색' — 기본 · 거래처정보 · 여신단가 · 부가정보 탭, 2026-10-14 실측).
   * 일지는 거래처 이름을 적어 두지만, 코드도움은 이름이 겹치는 거래처를 가르도록 id 를 담는다 —
   * 칸에 넣을 때 이름 → id(idOfPartner), 고른 값을 적을 때 id → 이름(nameOfPartner)으로 바꾼다.
   * 옛 일지의 손으로 친 이름(거래처 목록에 없는 이름)도 칸에 보이게 한 줄 더한다.
   */
  const idOfPartner = (name: string) => {
    const p = partners.find((x) => x.name === name)
    return p ? String(p.id) : name
  }
  const nameOfPartner = (v: string) => partners.find((x) => String(x.id) === v)?.name ?? v
  const partnerItemsFor = (name: string) => {
    const items = partnerCodeItems(partners)
    const v = idOfPartner(name)
    return v && !items.some((i) => i.value === v) ? [...items, { value: v, code: '', name: v }] : items
  }

  return (
    <EcListShell title="업무일지" searchable={view === 'result'} onSearch={() => setView('cond')}
                 onNew={view === 'result' ? openNew : undefined}>
      {error && !showForm && !viewing && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {view === 'cond' ? (
        <div>
          <ul className="ec-form">
            <li className="wide">
              <div className="title">업무보고일</div>
              <div className="form">
                <EcDateRange from={{ className: "ec-input w-[150px]", value: cond.from, onChange: (e) => setC('from', e.target.value) }} to={{ className: "ec-input w-[150px]", value: cond.to, onChange: (e) => setC('to', e.target.value) }} />
              </div>
            </li>
            <li className="wide">
              <div className="title">요일</div>
              <div className="form">
                <select className="ec-input w-[120px]" aria-label="요일" value={cond.dow} onChange={(e) => setC('dow', e.target.value)}>
                  <option value="">전체</option>
                  {DOW.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </li>
            <li className="wide">
              <div className="title">부서</div>
              <div className="form"><CodePickerField label="부서" hideLabel fill value={cond.department} onChange={(v) => setC('department', v)} items={deptItems} /></div>
            </li>
            <li className="wide">
              <div className="title">프로젝트</div>
              <div className="form"><CodePickerField label="프로젝트" hideLabel fill value={cond.projectId} onChange={(v) => setC('projectId', v)} items={projectItems} /></div>
            </li>
            <li className="wide">
              <div className="title">거래처</div>
              <div className="form"><CodePickerField label="거래처" hideLabel fill value={idOfPartner(cond.partnerName)} onChange={(v) => setC('partnerName', nameOfPartner(v))} items={partnerItemsFor(cond.partnerName)} /></div>
            </li>
            <li className="wide">
              <div className="title">제목</div>
              <div className="form"><input className="ec-input w-full" placeholder="제목" value={cond.title} onChange={(e) => setC('title', e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">내용</div>
              <div className="form"><input className="ec-input w-full" placeholder="내용" value={cond.content} onChange={(e) => setC('content', e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">최초작성자</div>
              <div className="form"><input className="ec-input w-full" placeholder="최초작성자" value={cond.author} onChange={(e) => setC('author', e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">기타</div>
              <div className="form">
                <label className="inline-flex items-center gap-[4px] cursor-pointer">
                  <input type="checkbox" checked={withInactiveDept} onChange={(e) => setWithInactiveDept(e.target.checked)} />
                  사용중단부서포함
                </label>
              </div>
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-[6px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
            {/* 원본 빠른선택: 금일 · 전일 · 금주(~오늘) · 전주 · 금월 · 전월 · 금년 · 전년 · 종료일 · 최근3일+7일 */}
            <EcPeriodPicks labels={WORKLOG_PICKS} onPick={(r) => setCond((c) => ({ ...c, from: r.from || c.from, to: r.to }))} />
            <button type="button" className="ec-btn" onClick={() => { setCond(initCond()); setWithInactiveDept(false) }}>다시 작성</button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table ref={gridRef} className="table-fixed">
            <thead>
              <tr>
                <th className="w-[150px] text-center">부서</th>
                {days.map((d) => <th key={d} colSpan={2} className="w-[180px] text-center">{dayHead(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {/*
               * 원본(2026-10-13 실측 — 회계팀 10/13 에 QA 일지 둘): 한 칸에 일지가 여럿이면 줄을 늘린다. 부서 칸은 rowSpan 으로 합치고
               * N 번째 줄에는 날마다 N 번째 일지(먼저 쓴 차례)만, 없는 날은 빈칸.
               */}
              {deptRows.flatMap((name) => {
                const byDay = days.map((d) => shown.filter((r) => r.department === name && r.reportDate === d).sort((a, b) => a.id - b.id))
                const n = Math.max(1, ...byDay.map((h) => h.length))
                return Array.from({ length: n }, (_, k) => (
                  <tr key={`${name}-${k}`}>
                    {k === 0 && <td rowSpan={n} className="w-[150px]">{name}</td>}
                    {days.map((d, di) => {
                      const r = byDay[di][k]
                      return (
                        <Fragment key={d}>
                          <td className="w-[150px] text-center">
                            {r && (
                              <button type="button" onClick={() => openView(r)}
                                      className="no-ec block w-full bg-transparent border-0 p-0 cursor-pointer text-center text-ec-navy truncate">
                                {r.title}
                              </button>
                            )}
                          </td>
                          {/* 원본 둘째 칸 = 답글 수 '[1]'(답글이 있을 때만) */}
                          <td className="w-[30px] text-center">{r && replyCount(r.id) > 0 ? `[${replyCount(r.id)}]` : ''}</td>
                        </Fragment>
                      )
                    })}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 원본 '조회' */}
      <Modal error={error} open={!!viewing} title="조회" width={780} onClose={() => { setViewing(null); setReplyFold('init') }}>
        {viewing && (
          <>
            {[{ r: viewing, depth: 0 }, ...threadOf(viewing)].map(({ r, depth }, n) => (
              <div key={r.id} className={`border border-solid border-ec-line rounded-ec mb-[9px] ${depth > 0 ? 'ml-[12px]' : ''}`}>
                <div className="flex flex-wrap items-baseline gap-[9px] py-[6px] px-[9px] bg-ec-page rounded-ec">
                  {depth > 0 ? <span>↳ {n}</span> : <span>{r.id}</span>}
                  <b>{r.title}</b>
                  <span className="text-ec-navy">{r.authorName}</span>
                  <span>{stampText(r.createdAt)}</span>
                </div>
                {(depth === 0 || replyFold !== 'closed') && (<>
                <div className="py-[9px] px-[9px] text-[12px] leading-[1.8]">
                  <div>업무보고일 : {r.reportDate.replace(/-/g, '')}</div>
                  <div>부서 : {r.department ?? ''}</div>
                  <div>거래처 : {r.partnerName ?? ''}</div>
                  <div>프로젝트 : {r.projectName ?? ''}</div>
                  {r.attachmentId && (
                    <div>첨부 : <span className="text-ec-navy cursor-pointer" title={formatBytes(r.attachmentSize ?? 0)}
                                     onClick={() => void downloadStoredFile(r.attachmentId!, r.attachmentName ?? '첨부')}>{r.attachmentName}</span></div>
                  )}
                  <EcRichBody content={r.content} className="mt-[6px]" />
                </div>
                <div className="flex gap-[6px] px-[9px] pb-[9px]">
                  <button type="button" className="ec-btn" onClick={() => openReply(r)}>{depth === 0 ? '답글(F8)' : '답글'}</button>
                  {depth === 0 && <button type="button" className="ec-btn" onClick={() => openCopy(r)}>복사</button>}
                  <button type="button" className="ec-btn" onClick={() => openEdit(r)}>수정</button>
                  <button type="button" className="ec-btn" onClick={() => void remove(r)}>삭제</button>
                  <button type="button" className="ec-btn" onClick={() => setHistoryOf(r)}>H</button>
                </div>
                </>)}
              </div>
            ))}
            <div className="flex gap-[6px] mt-[10px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => openReply(viewing)}>답변</button>
              <button type="button" className="ec-btn" onClick={() => printOne(viewing)}>인쇄</button>
              <button type="button" className="ec-btn" onClick={() => { setViewing(null); setReplyFold('init') }}>닫기</button>
              <button type="button" className="ec-btn" onClick={() => void openViewers(viewing)}>R</button>
              <button type="button" className="ec-btn"
                      onClick={() => setReplyFold((f) => (f === 'open' ? 'closed' : 'open'))}>{replyFold === 'open' ? '답글접기' : '답글펼치기'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* 작성 창은 '조회' 창 위에 뜬다 — [답글] 은 조회 창을 연 채로 연다. */}
      {/* 원본 '업무일지게시글작성' */}
      <Modal error={error} open={showForm} title="업무일지게시글작성" width={780} onClose={() => setShowForm(false)}>
        <div className="text-right text-[12px] text-ec-ink mb-[6px]">작성자 : {user?.name ?? ''}</div>
        <ul className="ec-form mb-[10px]">
          <li>
            <div className="title">업무보고일</div>
            <div className="form"><EcDateInput className="ec-input w-[150px]" value={form.reportDate} onChange={(e) => setF('reportDate', e.target.value)} /></div>
          </li>
          <li>
            <div className="title">부서</div>
            <div className={`form${invalid.has('department') && !form.department ? ' ec-invalid' : ''}`}><CodePickerField label="부서" hideLabel fill value={form.department} onChange={(v) => setF('department', v)} items={deptItems} /></div>
          </li>
          <li>
            <div className="title">거래처</div>
            <div className="form"><CodePickerField label="거래처" hideLabel fill value={idOfPartner(form.partnerName)} onChange={(v) => setF('partnerName', nameOfPartner(v))} items={partnerItemsFor(form.partnerName)} /></div>
          </li>
          <li>
            <div className="title">프로젝트</div>
            <div className="form"><CodePickerField label="프로젝트" hideLabel fill value={form.projectId} onChange={(v) => setF('projectId', v)} items={projectItems} /></div>
          </li>
          <li className="wide">
            <div className="title">제목</div>
            <div className={`form${invalid.has('title') && !form.title.trim() ? ' ec-invalid' : ''}`}><input className="ec-input w-full" aria-label="제목" value={form.title} onChange={(e) => setF('title', e.target.value)} /></div>
          </li>
          <li className="wide">
            <div className="title">첨부</div>
            <div className="form">
              <EcFileDrop busy={uploading} disabled={uploading} hint="+" onFiles={(fs) => { if (fs[0]) void upload(fs[0]) }}>
                {form.attachment && (
                  <span className="text-[12px] text-ec-navy">
                    {form.attachment.name}
                    <span onClick={() => setF('attachment', null)} className="cursor-pointer ml-[6px] font-bold">×</span>
                  </span>
                )}
              </EcFileDrop>
            </div>
          </li>
        </ul>
        <EcRichEditor value={form.content} onChange={(h) => setF('content', h)} />
        {replyTo != null && showOriginal && (() => { const o = rows.find((x) => x.id === replyTo); return o ? (
          <div className="border border-solid border-ec-line rounded-ec mt-[9px]" aria-label="원글">
            <div className="flex flex-wrap items-baseline gap-[9px] py-[6px] px-[9px] bg-ec-page rounded-ec">
              <span>{rootId(o)}</span><b>{o.title}</b><span className="text-ec-navy">{o.authorName}</span><span>{stampText(o.createdAt)}</span>
            </div>
            <div className="py-[9px] px-[9px] text-[12px] leading-[1.8]"><EcRichBody content={o.content} /></div>
          </div>) : null })()}
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void submit()}>저장(F8)</button>
          {replyTo != null && <button type="button" className="ec-btn" onClick={() => setShowOriginal((v) => !v)}>본문보기</button>}
          <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          {/* 원본 수정 창: [저장(F8)][닫기][삭제][H] — 새 글 · 답글 창에는 [삭제]가 없다 */}
          {editId != null && (() => { const r = rows.find((x) => x.id === editId); return r ? <>
            <button type="button" className="ec-btn" onClick={() => void remove(r)}>삭제</button>
            <button type="button" className="ec-btn" onClick={() => setHistoryOf(r)}>H</button>
          </> : null })()}
        </div>
      </Modal>

      {/* 원본 [R] '조회자 현황' — 왼쪽 미조회자(160) · 오른쪽 조회자(480), 하단 [닫기] */}
      <Modal error={error} open={!!viewers} title="조회자 현황" width={Math.round(window.innerWidth / 2)} onClose={() => setViewers(null)}>
        {viewers && (
          <>
            <div className="flex flex-wrap items-start gap-[12px]">
              <div className="w-[160px]">
                <div className="mb-[4px]">미조회자</div>
                <table className="w-full">
                  <thead><tr><th className="text-center">이름</th></tr></thead>
                  <tbody>
                    {viewers.notViewed.length === 0
                      ? <tr><td className="text-center">&nbsp;</td></tr>
                      : viewers.notViewed.map((n, i) => <tr key={`${n}-${i}`}><td className="text-center">{n}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <div className="w-[480px]">
                <div className="mb-[4px]">조회자</div>
                <table className="w-full">
                  <thead><tr><th className="text-center">이름</th><th className="text-center">최초조회일시</th><th className="text-center">최종조회일시</th></tr></thead>
                  <tbody>
                    {viewers.viewed.length === 0
                      ? <tr><td className="text-center">&nbsp;</td><td className="text-center" /><td className="text-center" /></tr>
                      : viewers.viewed.map((v, i) => (
                        <tr key={`${v.name}-${i}`}>
                          <td className="text-center">{v.name}</td>
                          <td className="text-center">{stampText(v.firstViewedAt)}</td>
                          <td className="text-center">{stampText(v.lastViewedAt)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex gap-[6px] mt-[10px]">
              <button type="button" className="ec-btn" onClick={() => setViewers(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>

      {historyOf && (
        <EcHistoryModal url={`/work-journals/${historyOf.id}/history`} head={`게시글번호 : ${rootId(historyOf)}`}
                        onClose={() => setHistoryOf(null)} />
      )}
    </EcListShell>
  )
}

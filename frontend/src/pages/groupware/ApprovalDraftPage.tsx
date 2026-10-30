import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import ApprovalFormFields from '../../features/approval/components/ApprovalFormFields'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import EcFileDrop from '../../components/EcFileDrop'
import { findDataTable } from '../../utils/tableExport'
import type { ApprovalDoc, ApprovalFormTemplate, ApprovalOutput, ApprovalPreset, MemberOption } from '../../types/api'
import { OutputChips, OutputLinkMenu, OutputMenuWindow, OutputReportWindow, OutputViewWindow, type OutputWindowState } from '../../features/approval/components/ApprovalOutputs'
import { ymd } from '../../components/EcPeriodPicks'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { useShortcut } from '../../utils/useShortcut'
import { useTableSort } from '../../utils/useTableSort'
import { fetchApprovalGroups, type ApprovalGroup, type WithGroup } from '../../features/approval/groups'
import { ApprovalGroupField } from '../../features/approval/components/ApprovalGroupSearch'
import { shrinkImage } from '../../utils/imageResize'
import RichBodyEditor from '../../features/approval/components/RichBodyEditor'
import { APPROVAL_DOCS, approvalDocOf, bodyHtmlOf, formFieldsOf, looksLikeHtml, sanitizeHtml } from '../../features/approval/bodyTemplate'
import LeaveInputPage from '../hr/LeaveInputPage'

import EcDateField from '../../components/EcDateField'
import { MenuButton } from '../../components/EcSlipShell'
import EcIcon from '../../components/ui/EcIcon'
import StampSignModal from '../../features/approval/components/StampSignModal'
import { useAuth } from '../../features/auth/AuthContext'

const TITLE = '기안서작성'
/** 원본 [출력양식] 고를 거리 — 처음 값은 '기본양식(결재문서 별도 인쇄)'(2026-10-30 실측). */
const PRINT_FORMATS = ['기본양식(결재문서 별도 인쇄)', '기본양식(결재문서 함께 인쇄)']

/** 예전 기안서의 맨 글자 본문을 편집기 HTML 로(줄바꿈 → <br>). */
function toEditorHtml(s: string | null | undefined): string {
  if (!s) return ''
  if (looksLikeHtml(s)) return s
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}

/** 편집기 본문 → 저장할 글. 글자 · 표 · 그림이 하나도 없으면 빈 글. */
function bodyForSave(html: string): string {
  if (!looksLikeHtml(html)) return html
  const clean = sanitizeHtml(html)
  const empty = !/<(table|img|hr)\b/i.test(clean) && clean.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === ''
  return empty ? '' : clean
}

const today = () => ymd(new Date())

/** 양식의 table 필드는 기본행(defaultRows)을 깔아준다. 예: 여비산정의 숙박비/교통비/… */
function initialFormData(t: ApprovalFormTemplate): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const f of formFieldsOf(t.fieldSchema)) {
    if (f.type === 'table') data[f.key] = f.defaultRows ? f.defaultRows.map((r) => ({ ...r })) : []
  }
  return data
}

/** 전자결재 > 기안서작성 — 좌측 양식 목록 + 우측 기안 편집기. 양식별 입력항목은 서버가 내려준다. */
export default function ApprovalDraftPage({ embedded }: {
  /** 내결재관리 [신규(F2)] 처럼 떠 있는 창 안에 그릴 때 — 저장 · 삭제 뒤 페이지를 옮기지 않고 창만 닫는다. busy: 작성 폼이 떠 있는 동안 true(Esc 가 창까지 닫지 않게). */
  embedded?: { onDone: () => void; busy?: { current: boolean } }
} = {}) {
  const routerNavigate = useNavigate()
  const navigate = (to: string) => (embedded ? embedded.onDone() : routerNavigate(to))
  // 기안서통합관리의 '기안서복사'가 원본 문서를 넘겨준다.
  const navState = useLocation().state as { copyFrom?: ApprovalDoc; editOf?: ApprovalDoc } | null
  const copyFrom = navState?.copyFrom ?? null
  /** 내결재관리 기안중 줄 [기안일자] 로 연 임시저장 문서 — 같은 창에서 고쳐 같은 번호로 다시 저장한다(원본 E070105). */
  const editOf = navState?.editOf ?? null
  const [members, setMembers] = useState<MemberOption[]>([])
  const [templates, setTemplates] = useState<(ApprovalFormTemplate & WithGroup)[]>([])
  /** 원본 [구분] 코드도움의 후보 — '구분검색'(01 지출결의서 · 02 휴가신청서 …). */
  const [groups, setGroups] = useState<ApprovalGroup[]>([])
  const [selected, setSelected] = useState<ApprovalFormTemplate | null>(null)
  useEffect(() => { if (embedded?.busy) embedded.busy.current = !!selected }, [embedded, selected])
  /** 원본: 결재문서가 '근태관리' 인 양식(휴가신청서)을 열면 [근태입력] 창이 같이 뜬다(2026-10-30 실측). */
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  /*
   * 원본 [Search(F3)] 조건 판(2026-10-30 E070103 클릭 대조): 양식명 · 정렬순서 · 구분 · 결재전표 + [검색(F8)] [다시 작성].
   * 검색칸이 빈 채로 [Search(F3)] 를 누르면 판이 펴진다(다른 목록과 같다). 조건은 고르는 즉시 걸린다.
   */
  const [condOpen, setCondOpen] = useState(false)
  const { user, companyCode } = useAuth()
  const [stampOpen, setStampOpen] = useState(false)
  const [condName, setCondName] = useState('')
  const [condOrder, setCondOrder] = useState('')
  const [condGroup, setCondGroup] = useState('')
  const [condDoc, setCondDoc] = useState('')
  const resetConds = () => { setCondName(''); setCondOrder(''); setCondGroup(''); setCondDoc('') }
  const condTemplates = templates.filter((t) =>
    (!condName || t.name.includes(condName.trim()))
    && (!condOrder.trim() || String(t.sortOrder) === condOrder.trim())
    && (!condGroup || (t.groupName ?? '') === condGroup)
    && (!condDoc || (approvalDocOf(t.fieldSchema) || '기안서') === condDoc))
  const groupNames = [...new Set(templates.map((t) => t.groupName).filter(Boolean))].sort() as string[]
  const sort = useTableSort(condTemplates, { 정렬순서: (t) => t.sortOrder, 양식명: (t) => t.name, 구분: (t) => t.groupName ?? '' })

  const [draftDate, setDraftDate] = useState(today())
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [body, setBody] = useState('')
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [approverIds, setApproverIds] = useState<number[]>([])
  const [referenceIds, setReferenceIds] = useState<number[]>([])
  const [shareIds, setShareIds] = useState<number[]>([])
  /**
   * 결재라인 프리셋. 원본 기안서작성의 **맨 윗줄 [결재라인]** 이다 —
   * 고르면 결재자가 그 순서대로 한 번에 채워진다.
   * 우리는 `ApprovalSettingPage` 에서 프리셋을 만들 수는 있었는데 **기안 화면에서 쓰지 못했다.**
   * 만들어 두고 못 쓰는 마스터였다.
   */
  const [presets, setPresets] = useState<ApprovalPreset[]>([])
  const [presetId, setPresetId] = useState('')
  // 원본 폼에 있는데 우리에게 없던 칸들. 기안서No.·결재문서는 백엔드에 이미 있었고 화면만 안 쓰고 있었다.
  const [category, setCategory] = useState('')
  const [printFormat, setPrintFormat] = useState(PRINT_FORMATS[0])
  const [labelText, setLabelText] = useState('')
  const [attachment, setAttachment] = useState<{ id: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  /** [결재문서] › '전표 출력물' — 붙인 출력물(칩)과 지금 떠 있는 출력물 창. */
  const [outputs, setOutputs] = useState<ApprovalOutput[]>(() => editOf?.outputs ?? [])
  const [outputWin, setOutputWin] = useState<OutputWindowState>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  // 버튼 라벨이 약속한 단축키들. 저장/결재는 처리 중이면 안 먹는다.
  const searchF3 = () => (search.trim() ? filterRows(search) : setCondOpen((v) => !v))
  useShortcut('F3', searchF3)
  useShortcut('F7', () => void save(false), !saving && !attendanceOpen && !outputWin)

  useEffect(() => {
    api.get<MemberOption[]>('/meta/users').then((r) => setMembers(r.data)).catch(() => {})
    // 결재라인 프리셋. 부가기능이라 못 불러와도 화면을 막지 않는다.
    api.get<ApprovalPreset[]>('/approval-settings/presets')
      .then((r) => setPresets(r.data.filter((p) => p.active)))
      .catch(() => setPresets([]))
    fetchApprovalGroups().then(setGroups).catch(() => setGroups([]))
    api
      .get<(ApprovalFormTemplate & WithGroup)[]>('/approval-form-templates', { params: { forDraft: true } })
      .then((r) => {
        setTemplates(r.data)
        if (editOf) {
          const e = r.data.find((x) => x.id === editOf.formTemplateId)
          if (!e) return
          setSelected(e)
          const extra = editOf as { category?: string | null; printFormat?: string | null }
          setCategory(extra.category ?? e.groupName ?? '')
          setTitle(editOf.title)
          setDraftDate(editOf.draftDate)
          setDepartment(editOf.department ?? '')
          setBody(toEditorHtml(editOf.content))
          setFormData({ ...initialFormData(e), ...(editOf.formData ?? {}) })
          setPrintFormat(extra.printFormat ?? PRINT_FORMATS[0])
          setLabelText(editOf.labelText ?? '')
          setAttachment(editOf.attachmentId ? { id: editOf.attachmentId, name: editOf.attachmentName ?? '' } : null)
          setApproverIds([...editOf.lines].sort((a, b) => a.stepOrder - b.stepOrder).map((l) => l.approverId))
          setReferenceIds(editOf.participants.filter((p) => p.role === 'REFERENCE').map((p) => p.userId))
          setShareIds(editOf.participants.filter((p) => p.role === 'SHARE').map((p) => p.userId))
          return
        }
        if (!copyFrom) return
        // 복사: 양식·제목·본문·입력값을 그대로 가져오되 결재선과 일자는 새로 잡는다.
        const t = r.data.find((x) => x.id === copyFrom.formTemplateId)
        if (!t) return
        setSelected(t)
        setCategory((copyFrom as { category?: string | null }).category ?? t.groupName ?? '')
        setTitle(`${copyFrom.title} (복사)`)
        setDepartment(copyFrom.department ?? '')
        setBody(toEditorHtml(copyFrom.content))
        setFormData({ ...initialFormData(t), ...(copyFrom.formData ?? {}) })
        flash(`'${copyFrom.title}' 을(를) 복사했습니다. 결재선을 다시 지정하세요.`)
      })
      .catch((err) => setError(extractErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectForm(t: ApprovalFormTemplate & WithGroup) {
    setSelected(t)
    // 원본 '00 기본' 양식은 제목이 빈칸(자리표시 '제목')으로 열린다(2026-10-14 E070103 실측).
    setTitle(t.code === 'BASIC' ? '' : t.name)
    // 원본: 양식의 기본값설정 › 구분(휴가신청서 → 02 휴가신청서)으로 [구분] 칸이 열린다.
    setCategory(t.groupName ?? '')
    setFormData(initialFormData(t))
    setOutputs([])
    // 공통양식 [기안내용] 서식(표)이 있으면 본문이 그 서식으로 열린다 — 원본은 양식이 본문 안의 표다.
    setBody(bodyHtmlOf(t.fieldSchema))
    setError('')
    setAttendanceOpen(approvalDocOf(t.fieldSchema) === '근태관리')
  }

  const memberName = (id: number) => members.find((m) => m.id === id)?.name ?? `#${id}`

  /**
   * 결재라인을 고르면 결재자를 그 순서대로 채운다.
   * 프리셋의 `stepOrder` 가 곧 결재 순서라 정렬해서 넣는다 — 서버가 준 배열 순서에 기대지 않는다.
   * 이미 찍어 둔 결재자는 **덮어쓴다**. 결재선을 고른다는 건 그 줄로 가겠다는 뜻이다.
   */
  function applyPreset(v: string) {
    setPresetId(v)
    if (!v) return
    const p = presets.find((x) => String(x.id) === v)
    if (!p) return
    setApproverIds([...p.steps].sort((a, b) => a.stepOrder - b.stepOrder).map((st) => st.approverId))
  }

  /** 필수 항목 검사. 서버도 막지만, 왕복 전에 알려준다. */
  const missing = useMemo(() => {
    if (!selected) return []
    return formFieldsOf(selected.fieldSchema)
      .filter((f) => f.required)
      .filter((f) => {
        const v = formData[f.key]
        if (f.type === 'table') return !Array.isArray(v) || v.length === 0
        return v == null || String(v).trim() === ''
      })
      .map((f) => f.label)
  }, [selected, formData])

  /** 첨부. 공용 파일 저장(POST /api/files)에 먼저 올리고 그 id 를 기안서에 붙인다 - ECDrive 와 같은 흐름. */
  async function uploadAttachment(file: File) {
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', await shrinkImage(file))
      const r = await api.post<{ id: number; name: string }>('/files', form)
      setAttachment({ id: r.data.id, name: r.data.name })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function removeDraft() {
    if (!editOf) return
    if (!(await ecConfirm('기안서를 삭제하겠습니까?\n삭제된 기안서는 복구되지 않습니다.'))) return
    try {
      await api.delete(`/approvals/${editOf.id}`)
      navigate('/groupware/approval/my')
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function save(temporary: boolean) {
    setError('')
    // 원본(2026-10-14): 임시저장은 제목 없이도 받는다 — 목록에 제목 빈 '2026/10/14-1' 줄이 생긴다. 상신만 제목을 묻는다.
    if (!temporary && !title.trim()) return setError('제목을 입력하세요.')
    if (!temporary && approverIds.length === 0) {
      return setError('결재자를 1명 이상 지정하세요. 결재선 없이 보관하려면 임시저장을 쓰세요.')
    }
    if (!temporary && missing.length > 0) {
      return setError(`필수 항목을 입력하세요: ${missing.join(', ')}`)
    }
    setSaving(true)
    try {
      const body0 = {
        formTemplateId: selected!.id,
        title,
        content: bodyForSave(body),
        formData,
        draftDate,
        department: department || undefined,
        category: category || undefined,
        printFormat: printFormat || undefined,
        labelText: labelText || undefined,
        attachmentId: attachment?.id,
        approverIds,
        referenceUserIds: referenceIds,
        shareUserIds: shareIds,
        outputs: outputs.map(({ menuName, appliedAt, mode, html, conditions }) => ({ menuName, appliedAt, mode, html, conditions })),
        temporary,
      }
      const res = editOf
        ? await api.put<ApprovalDoc>(`/approvals/${editOf.id}`, body0)
        : await api.post<ApprovalDoc>('/approvals', body0)
      /* 원본(2026-10-14)은 저장하면 안내 없이 창만 닫히고 목록(내결재관리)에 줄이 생긴다 — 'AP-…' 번호 안내는 원본에 없다. */
      void res
      navigate('/groupware/approval/my')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const chips = (ids: number[], setIds: (fn: (a: number[]) => number[]) => void, numbered: boolean) =>
    ids.length > 0 && (
      <div className="flex flex-wrap gap-[6px] mt-[6px]">
        {ids.map((id, idx) => (
          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--ec-blue-light)', color: 'var(--ec-blue-dark)', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
            {numbered ? `${idx + 1}. ` : ''}{memberName(id)}
            <span onClick={() => setIds((a) => a.filter((x) => x !== id))} className="cursor-pointer font-bold">×</span>
          </span>
        ))}
      </div>
    )

  /** 양식에 [기안내용] 서식(표)이 있나 — 있으면 그 표 자체가 문서라 칸 표를 따로 그리지 않는다. */
  const hasBodyForm = !!selected && bodyHtmlOf(selected.fieldSchema) !== ''

  const memberItems = useMemo(
    () => members.map((m) => ({ value: String(m.id), code: m.department ?? '', name: m.name, sub: m.department })),
    [members],
  )

  /**
   * 사람을 고르는 칸. 원본은 코드도움(🔍)이고 우리는 `<select>` 나열 + [+추가] 였다.
   * 사원이 수십 명만 넘어가도 나열로는 못 찾는다 — 그래서 원본이 팝업을 쓰는 것이고 우리도 맞춘다.
   * 다중 선택이라 고른 순서가 곧 결재 순서다.
   */
  const picker = (
    ids: number[],
    setIds: (fn: (a: number[]) => number[]) => void,
    placeholder: string,
  ) => (
    <CodePickerField
      label={placeholder} hideLabel multiple fill placeholder={placeholder}
      values={ids.map(String)}
      onChangeMulti={(vals) => setIds(() => vals.map(Number))}
      items={memberItems}
    />
  )

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        {!embedded && <span className="text-ec-star mr-[4px]"><EcIcon name="star-outline" size={13} glyph="☆" /></span>}
        {!embedded && <span className="text-[15px] font-extrabold text-ec-text">{TITLE}</span>}
        <div className="ml-auto flex items-center gap-[4px] relative">
          <input
            className="ec-input"
            placeholder="양식검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); filterRows(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') filterRows(search) }}
            style={{ width: 140 }}
          />
          <button className="ec-btn ec-btn-primary" onClick={searchF3}>Search(F3)</button>
          <button className="ec-btn" onClick={() => setOptionOpen((v) => !v)}>Option</button>
          <button className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>

          {/* 원본 [Option] 은 [리스트설정] 하나(2026-10-30 E070103 클릭 대조) — 목록 열 디자이너는 두지 않아 안내만 한다. */}
          {optionOpen && (
            <>
              <div className="ec-backdrop-clear" onClick={() => setOptionOpen(false)} />
              <div className="ec-menu" role="menu">
                <button type="button" onClick={() => { setOptionOpen(false); void ecAlert('리스트설정은 지원하지 않습니다.') }}>리스트설정</button>
              </div>
            </>
          )}
        </div>
      </div>

      {condOpen && (
        <div className="ec-search-conds flex items-center flex-wrap gap-[4px] mb-[6px]">
          <label className="text-[12.5px] text-ec-label">양식명</label>
          <input className="ec-input w-[160px]" aria-label="양식명" value={condName} onChange={(e) => setCondName(e.target.value)} />
          <label className="text-[12.5px] text-ec-label ml-[8px]">정렬순서</label>
          <input className="ec-input w-[70px] text-right" aria-label="정렬순서" inputMode="numeric" value={condOrder} onChange={(e) => setCondOrder(e.target.value.replace(/\D/g, ''))} />
          <label className="text-[12.5px] text-ec-label ml-[8px]">구분</label>
          <CodePickerField label="구분" hideLabel width={150} emptyLabel="전체" value={condGroup} onChange={setCondGroup}
                           items={groupNames.map((g) => ({ value: g, name: g }))} />
          <label className="text-[12.5px] text-ec-label ml-[8px]">결재전표</label>
          <CodePickerField label="결재전표" hideLabel width={130} emptyLabel="전체" value={condDoc} onChange={setCondDoc}
                           items={['기안서', ...APPROVAL_DOCS].map((d) => ({ value: d, name: d }))} />
          <div className="basis-full flex items-center gap-[4px] mt-[4px]">
            <button type="button" className="ec-btn ec-btn-primary ec-btn-sm" onClick={() => setCondOpen(false)}>검색(F8)</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={resetConds}>다시 작성</button>
          </div>
        </div>
      )}

      {error && !selected && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {/*
        원본 기안서작성은 **전폭 양식 목록**이다 — 정렬순서·양식명·구분·결재문서 4열.
        양식을 누르면 **모달 팝업**으로 작성 폼이 뜬다.
        우리는 좌우 분할(좁은 목록 + 인라인 편집기)이라 같은 화면인데 전혀 다르게 보였다.
      */}
      <div ref={bodyRef} className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {/*
                2026-10-03 원본 실측: 머리 셋([정렬순서▼][양식명▼][구분▼])은 눌러 정렬하고 링크색이다.
                [정렬순서]는 0 을 채우지 않는다('1' · '2' — 우리는 '01' 이었다). [구분]은 양식 분류(휴가신청서 ·
                지출결의서) — 양식의 기본 구분 이름(2026-10-12 구분 마스터를 만들어 이어 붙임). 없으면 빈칸.
              */}
              <th className="w-[90px] text-center cursor-pointer text-ec-navy" onClick={() => sort.toggle('정렬순서')}>정렬순서 {sort.mark('정렬순서')}</th>
              <th className="cursor-pointer text-ec-navy" onClick={() => sort.toggle('양식명')}>양식명 {sort.mark('양식명')}</th>
              {/* 원본은 [구분] 200 · [결재문서] 150 이다. */}
              <th className="w-[200px] cursor-pointer text-ec-navy" onClick={() => sort.toggle('구분')}>구분 {sort.mark('구분')}</th>
              <th className="w-[150px]">결재문서</th>
            </tr>
          </thead>
          <tbody>
            {/* 원본 맨 위 '00 기본' — 칸 없는 기본 기안서, 정렬과 상관없이 초록 바탕으로 붙는다(V252 가 심는다) */}
            {templates.filter((t) => t.code === 'BASIC').map((t) => (
              <tr key={t.id} onClick={() => selectForm(t)} className="cursor-pointer bg-ec-basic">
                <td className="text-center">00</td>
                <td className="text-ec-navy">{t.name}</td>
                <td />
                <td />
              </tr>
            ))}
            {sort.sorted.filter((t) => t.code !== 'BASIC').map((t) => (
              <tr key={t.id} onClick={() => selectForm(t)} className="cursor-pointer">
                <td className="text-center">{t.sortOrder}</td>
                <td className="text-ec-navy">{t.name}</td>
                <td>{t.groupName ?? ''}</td>
                <td>{approvalDocOf(t.fieldSchema)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 작성 폼 — 원본과 같이 모달 팝업이다. */}
      <Modal
        open={!!selected}
        title={TITLE}
        width={1440}
        onClose={() => setSelected(null)}
      >
        {selected && (
            <div>
              {/* 원본의 파란 배지 — [기안서 | 양식명] */}
              <div className="mb-[10px]">
                <span className="inline-block bg-ec-blue text-white text-[12px] py-[5px] px-[12px] rounded-[5px]">
                  기안서 | {selected.name}
                </span>
              </div>

              {/*
                머리 — 원본(2026-10-30 실측, 10-기안서작성-창.jpg): 흰 판에 이름표 + 칸. 일자는 YYYY ▾ / MM ▾ / DD 📅,
                결재라인 이름표 하나 아래 [결재라인 · 결재자 · 참조자 · 공유자] 네 줄, [구분] 과 [출력양식] 이 한 줄.
                우리는 회색 이름표 격자에 부서 · 기안서No. 줄이 더 있었다(원본에 없음 — 부서는 고쳐 열 때 그대로 넘긴다).
              */}
              <ul className="ec-form mb-[8px]">
                <li className="wide">
                  <div className="title">일자</div>
                  <div className="form"><EcDateField value={draftDate} onChange={setDraftDate} /></div>
                </li>
                <li className="wide">
                  <div className="title">제목<span className="req">*</span></div>
                  <div className="form"><input className="ec-input w-full" placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                </li>
                <li className="wide">
                  <div className="title">결재라인</div>
                  <div className="form">
                    <div className="grid gap-[3px] w-full">
                      <div className="flex items-center gap-[6px]">
                        <span className="ec-line-tag">결재라인</span>
                        <div className="flex-1 min-w-0">
                          <CodePickerField
                            label="결재라인" hideLabel fill placeholder="결재라인" emptyLabel="선택 해제"
                            value={presetId}
                            onChange={(v) => applyPreset(v)}
                            items={presets.map((p) => ({
                              value: String(p.id),
                              code: p.formTemplateName ?? '공통',
                              name: p.name,
                              sub: p.steps.map((st) => st.approverName).join(' → '),
                            }))}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-[6px] flex-wrap">
                        <span className="ec-line-tag">결재자</span>
                        <div className="flex-1 min-w-0">{picker(approverIds, setApproverIds, '결재자 선택')}</div>
                        {chips(approverIds, setApproverIds, true)}
                      </div>
                      <div className="flex items-center gap-[6px] flex-wrap">
                        <span className="ec-line-tag">참조자</span>
                        <div className="flex-1 min-w-0">{picker(referenceIds, setReferenceIds, '참조자 선택')}</div>
                        {chips(referenceIds, setReferenceIds, false)}
                      </div>
                      <div className="flex items-center gap-[6px] flex-wrap">
                        <span className="ec-line-tag">공유자</span>
                        <div className="flex-1 min-w-0">{picker(shareIds, setShareIds, '공유자 선택')}</div>
                        {chips(shareIds, setShareIds, false)}
                      </div>
                    </div>
                  </div>
                </li>
                <li>
                  <div className="title">구분</div>
                  <div className="form">
                    {/* 원본 [구분] 코드도움 — '구분검색' 창(그룹코드 · 그룹명, [신규(F2)][수정])에서 고른다. 양식의 기본 구분으로 열린다. */}
                    <ApprovalGroupField
                      value={category ? { code: groups.find((g) => g.name === category)?.code, name: category } : null}
                      onChange={(g) => { setCategory(g?.name ?? ''); if (g && !groups.some((x) => x.id === g.id)) setGroups([...groups, g]) }} />
                  </div>
                </li>
                <li>
                  <div className="title">출력양식</div>
                  <div className="form">
                    <select className="ec-input w-full" aria-label="출력양식" value={printFormat} onChange={(e) => setPrintFormat(e.target.value)}>
                      {[...PRINT_FORMATS, ...(PRINT_FORMATS.includes(printFormat) ? [] : [printFormat])].map((f) => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                </li>
                <li className="wide">
                  <div className="title">결재문서</div>
                  <div className="form text-[12px]">
                    {/* 원본(2026-10-30): 붙인 출력물 칩이 링크 위에 쌓이고, 링크는 그대로 남아 더 붙일 수 있다. */}
                    <div>
                      <OutputChips outputs={outputs} onOpen={(o) => setOutputWin({ kind: 'view', output: o })}
                                   onRemove={(i) => setOutputs((a) => a.filter((_, j) => j !== i))} />
                      <OutputLinkMenu onPick={(m) => setOutputWin({ kind: 'report', menuName: m })} onAll={() => setOutputWin({ kind: 'menu' })} />
                    </div>
                  </div>
                </li>
                <li className="wide">
                  <div className="title">첨부</div>
                  <div className="form">
                    <div className="w-full">
                      {/* 원본 기안서작성의 넓은 첨부 자리(+). 한 건만 붙는 자리다. */}
                      <EcFileDrop
                        disabled={uploading} busy={uploading}
                        onFiles={(fs) => { if (fs[0]) void uploadAttachment(fs[0]) }}
                      >
                        {attachment && (
                          <span className="text-[12px] text-ec-navy">
                            {attachment.name}
                            <span onClick={() => setAttachment(null)} className="cursor-pointer ml-[6px] font-bold">×</span>
                          </span>
                        )}
                      </EcFileDrop>
                    </div>
                  </div>
                </li>
                <li>
                  <div className="title">라벨</div>
                  <div className="form">
                    <input className="ec-input w-full" aria-label="라벨" value={labelText} onChange={(e) => setLabelText(e.target.value)}
                           placeholder="라벨" />
                  </div>
                </li>
              </ul>

              {/*
                본문 — 원본은 머리 아래 편집 도구 모음 + 폭 700 본문 판이다. 양식이 본문 안의 표로 들어가고 그 아래 자유 서술이 이어진다.
                칸이 있는 양식(예전 우리 양식)은 칸 표를 본문 위에 그대로 둔다.
              */}
              {(formFieldsOf(selected.fieldSchema).length > 0 || !hasBodyForm) && (
                <div className="mb-[8px]">
                  <ApprovalFormFields
                    title={selected.name.split('').join(' ')}
                    fields={formFieldsOf(selected.fieldSchema)}
                    value={formData}
                    onChange={setFormData}
                  />
                </div>
              )}
              <RichBodyEditor label="본문" value={body} onChange={setBody} minHeight="min-h-[320px]" />

              {/*
                작성창이 열려 있으면 오류도 창 안에 띄운다. 예전엔 창 뒤(목록 위)에만 떠서, 필수 항목을 빠뜨리고
                [저장/결재] 를 누르면 아무 일도 안 일어나는 것처럼 보였다(QA 15회차, 화면으로 기안해 보다 발견).
              */}
              {error && <p className="ec-alert ec-alert-danger mt-[10px] mb-0">{error}</p>}

              <div className="flex gap-[6px] mt-[12px] pt-[8px] border-t border-t-ec-line-soft border-solid items-center">
                {/* 원본 푸터: 저장/결재(F7)▴ · 임시저장/미리보기 · 양식샘플보기 · My도장/서명 · 닫기 */}
                <MenuButton up className="ec-btn ec-btn-primary" disabled={saving} label={saving ? '처리 중…' : '저장/결재(F7)'}
                            onMain={() => void save(false)}
                            items={[
                              { label: '저장/결재(F7)', onClick: () => void save(false) },
                              { label: '임시저장', onClick: () => void save(true) },
                            ]} />
                <button className="ec-btn" onClick={() => void save(true)} disabled={saving}>임시저장/미리보기</button>
                {/* 원본: 임시저장 문서를 다시 연 창에는 [삭제] 가 더 있다(2026-10-14 E070105 실측 — [H] 는 이력 표가 없어 두지 않음) */}
                {editOf && <button className="ec-btn" onClick={() => void removeDraft()} disabled={saving}>삭제</button>}
                <button
                  className="ec-btn"
                  title="이 양식이 어떤 항목을 요구하는지 미리 봅니다."
                  onClick={() => setNotice(
                    `${selected.name} — 입력항목: ${formFieldsOf(selected.fieldSchema).map((f) => f.label).join(' · ') || '없음'}`,
                  )}
                >
                  양식샘플보기
                </button>
                {/* 원본 [My도장/서명] → '도장/서명올리기' 창(내결재관리 하단과 같은 창) */}
                <button className="ec-btn" onClick={() => setStampOpen(true)}>My도장/서명</button>
                <button className="ec-btn" onClick={() => setSelected(null)}>닫기</button>
                {missing.length > 0 && (
                  <span className="text-[11.5px] text-ec-danger ml-[4px]">미입력 필수: {missing.join(', ')}</span>
                )}
              </div>
            </div>
        )}
      </Modal>

      {/* [결재문서] › '전표 출력물' 창들 — 작성 창 위에 겹쳐 뜬다. */}
      {outputWin?.kind === 'report' && (
        <OutputReportWindow menuName={outputWin.menuName} onClose={() => setOutputWin(null)}
                            onApply={(o) => { setOutputs((a) => [...a, o]); setOutputWin(null) }} />
      )}
      {outputWin?.kind === 'menu' && (
        <OutputMenuWindow onClose={() => setOutputWin(null)} onPick={(m) => setOutputWin({ kind: 'report', menuName: m })} />
      )}
      {outputWin?.kind === 'view' && <OutputViewWindow output={outputWin.output} onClose={() => setOutputWin(null)} />}

      {stampOpen && user && <StampSignModal user={`${companyCode ?? ''}:${user.username}`}onClose={() => setStampOpen(false)} />}

      {/* 결재문서 '근태관리' — 작성 창 위에 [근태입력] 창이 같이 뜬다(원본 캡처 12-휴가신청서-근태입력-같이뜸). */}
      <Modal open={attendanceOpen} title="근태입력" width={1100} onClose={() => setAttendanceOpen(false)}>
        {attendanceOpen && <LeaveInputPage onClose={() => setAttendanceOpen(false)} />}
      </Modal>

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 460, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
              <span>{TITLE} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div className="p-[14px] text-[12.5px] leading-[1.7] text-ec-text">
              <ul className="pl-[16px] m-0">
                <li>좌측 목록에서 <b>결재양식</b>을 고르면 그 양식이 요구하는 입력 항목이 자동으로 나타납니다.</li>
                <li>양식별 항목은 서버의 <b>양식 마스터</b>가 정의합니다. 출장 양식의 <b>여비산정</b>처럼 표 항목은 합계가 자동 계산됩니다.</li>
                <li><b>임시저장</b>은 결재선 없이 보관합니다(상태: 기안중). <b>저장/결재(F7)</b>는 결재선 순서대로 상신합니다.</li>
                <li><b>Search(F3)</b> — 양식명에 입력한 낱말이 포함된 항목만 좌측 목록에서 추립니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

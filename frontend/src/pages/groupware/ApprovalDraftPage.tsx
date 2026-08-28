import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import ApprovalFormFields from '../../components/approval/ApprovalFormFields'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import EcFileDrop from '../../components/EcFileDrop'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import type { ApprovalDoc, ApprovalFormTemplate, ApprovalPreset, MemberOption } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'
import { useShortcut } from '../../utils/useShortcut'

const TITLE = '기안서작성'
// 글꼴 select 표시명 → 실제 CSS font-family 매핑
const FONT_FAMILY: Record<string, string> = {
  돋움: 'Dotum, 돋움, sans-serif',
  '맑은 고딕': '"Malgun Gothic", 맑은 고딕, sans-serif',
}

const today = () => ymd(new Date())

/** 양식의 table 필드는 기본행(defaultRows)을 깔아준다. 예: 여비산정의 숙박비/교통비/… */
function initialFormData(t: ApprovalFormTemplate): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const f of t.fieldSchema) {
    if (f.type === 'table') data[f.key] = f.defaultRows ? f.defaultRows.map((r) => ({ ...r })) : []
  }
  return data
}

/** 전자결재 > 기안서작성 — 좌측 양식 목록 + 우측 기안 편집기. 양식별 입력항목은 서버가 내려준다. */
export default function ApprovalDraftPage() {
  const navigate = useNavigate()
  // 기안서통합관리의 '기안서복사'가 원본 문서를 넘겨준다.
  const copyFrom = (useLocation().state as { copyFrom?: ApprovalDoc } | null)?.copyFrom ?? null
  const [members, setMembers] = useState<MemberOption[]>([])
  const [templates, setTemplates] = useState<ApprovalFormTemplate[]>([])
  const [selected, setSelected] = useState<ApprovalFormTemplate | null>(null)

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
  const [printFormat, setPrintFormat] = useState('기안No.')
  const [labelText, setLabelText] = useState('')
  const [attachment, setAttachment] = useState<{ id: number; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const bodyRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [optionOpen, setOptionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const [fontFamily, setFontFamily] = useState('돋움')
  const [fontSize, setFontSize] = useState('10')
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)
  const [underline, setUnderline] = useState(false)

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
  useShortcut('F3', () => filterRows(search))
  useShortcut('F7', () => void save(false), !saving)

  async function doExcel() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 내보낼 표가 없습니다.')
    if (!(await exportTableToXlsx(table, TITLE))) flash('내보낼 자료가 없습니다.')
  }

  function doPrint() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 인쇄할 표가 없습니다.')
    if (!printTable(table, TITLE)) flash('인쇄할 자료가 없습니다.')
  }

  useEffect(() => {
    api.get<MemberOption[]>('/meta/users').then((r) => setMembers(r.data)).catch(() => {})
    // 결재라인 프리셋. 부가기능이라 못 불러와도 화면을 막지 않는다.
    api.get<ApprovalPreset[]>('/approval-settings/presets')
      .then((r) => setPresets(r.data.filter((p) => p.active)))
      .catch(() => setPresets([]))
    api
      .get<ApprovalFormTemplate[]>('/approval-form-templates')
      .then((r) => {
        setTemplates(r.data)
        if (!copyFrom) return
        // 복사: 양식·제목·본문·입력값을 그대로 가져오되 결재선과 일자는 새로 잡는다.
        const t = r.data.find((x) => x.id === copyFrom.formTemplateId)
        if (!t) return
        setSelected(t)
        setTitle(`${copyFrom.title} (복사)`)
        setDepartment(copyFrom.department ?? '')
        setBody(copyFrom.content ?? '')
        setFormData({ ...initialFormData(t), ...(copyFrom.formData ?? {}) })
        flash(`'${copyFrom.title}' 을(를) 복사했습니다. 결재선을 다시 지정하세요.`)
      })
      .catch((err) => setError(extractErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectForm(t: ApprovalFormTemplate) {
    setSelected(t)
    setTitle(t.name)
    setFormData(initialFormData(t))
    setError('')
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
    return selected.fieldSchema
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
      form.append('file', file)
      const r = await api.post<{ id: number; name: string }>('/files', form)
      setAttachment({ id: r.data.id, name: r.data.name })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function save(temporary: boolean) {
    setError('')
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (!temporary && approverIds.length === 0) {
      return setError('결재자를 1명 이상 지정하세요. 결재선 없이 보관하려면 임시저장을 쓰세요.')
    }
    if (!temporary && missing.length > 0) {
      return setError(`필수 항목을 입력하세요: ${missing.join(', ')}`)
    }
    setSaving(true)
    try {
      await api.post('/approvals', {
        formTemplateId: selected!.id,
        title,
        content: body,
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
        temporary,
      })
      navigate('/groupware/approval/my')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const chips = (ids: number[], setIds: (fn: (a: number[]) => number[]) => void, numbered: boolean) =>
    ids.length > 0 && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {ids.map((id, idx) => (
          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--ec-blue-light)', color: 'var(--ec-blue-dark)', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
            {numbered ? `${idx + 1}. ` : ''}{memberName(id)}
            <span onClick={() => setIds((a) => a.filter((x) => x !== id))} style={{ cursor: 'pointer', fontWeight: 700 }}>×</span>
          </span>
        ))}
      </div>
    )

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
      label={placeholder} hideLabel multiple placeholder={placeholder} width={260}
      values={ids.map(String)}
      onChangeMulti={(vals) => setIds(() => vals.map(Number))}
      items={memberItems}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>{TITLE}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
          <input
            className="ec-input"
            placeholder="양식검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); filterRows(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') filterRows(search) }}
            style={{ width: 140 }}
          />
          <button className="ec-btn ec-btn-primary" onClick={() => filterRows(search)}>Search(F3)</button>
          <button className="ec-btn" onClick={() => setOptionOpen((v) => !v)}>Option</button>
          <button className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>

          {optionOpen && (
            <>
              <div onClick={() => setOptionOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41, background: '#fff', border: '1px solid #c9d1da', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150, padding: 4 }}>
                {[
                  { label: 'Excel 내려받기', run: () => { void doExcel() } },
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

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {/*
        원본 기안서작성은 **전폭 양식 목록**이다 — 정렬순서·양식명·구분·결재문서 4열.
        양식을 누르면 **모달 팝업**으로 작성 폼이 뜬다.
        우리는 좌우 분할(좁은 목록 + 인라인 편집기)이라 같은 화면인데 전혀 다르게 보였다.
      */}
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 90 }}>정렬순서</th>
              <th>양식명</th>
              <th style={{ width: 200 }}>구분</th>
              {/* 원본은 [구분] 200 · [결재문서] 150 이다 — 우리는 거꾸로였다. */}
              <th style={{ width: 150 }}>결재문서</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} onClick={() => selectForm(t)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#8a929c' }}>{String(t.sortOrder).padStart(2, '0')}</td>
                <td>{t.name}</td>
                <td style={{ textAlign: 'center', color: '#8a929c' }}>기본</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 작성 폼 — 원본과 같이 모달 팝업이다. */}
      <Modal
        open={!!selected}
        title={TITLE}
        width={1180}
        onClose={() => setSelected(null)}
      >
        {selected && (
            <div>
              {/* 원본의 파란 배지 — [기안서 | 양식명] */}
              <div style={{ marginBottom: 10 }}>
                <span style={{
                  display: 'inline-block', background: 'var(--ec-blue)', color: '#fff',
                  fontSize: 12, padding: '5px 12px', borderRadius: 5,
                }}>
                  기안서 | {selected.name}
                </span>
              </div>

              <table className="w-full text-left" style={{ marginBottom: 12 }}>
                <tbody>
                  <tr>
                    <th style={{ width: 130, background: '#f5f7fa' }}>일자</th>
                    <td><input className="ec-input" type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} style={{ width: 150 }} /></td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>제목<span style={{ color: '#c60a2e', marginLeft: 2 }}>*</span></th>
                    <td><input className="ec-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} /></td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>부서</th>
                    <td><input className="ec-input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="예: 부설연구소" style={{ width: 240 }} /></td>
                  </tr>
                  {/*
                    원본은 결재라인·결재자·참조자·공유자를 [결재라인] 라벨 하나 아래 4줄로 묶는다.
                    우리는 넷을 각각 별도 행으로 두어 같은 라벨이 네 번 나왔다.
                  */}
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>결재라인</th>
                    <td>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="ec-line-tag">결재라인</span>
                          <CodePickerField
                            label="결재라인" hideLabel placeholder="결재라인 선택" emptyLabel="선택 해제" width={260}
                            value={presetId}
                            onChange={(v) => applyPreset(v)}
                            items={presets.map((p) => ({
                              value: String(p.id),
                              code: p.formTemplateName ?? '공통',
                              name: p.name,
                              sub: p.steps.map((st) => st.approverName).join(' → '),
                            }))}
                          />
                          <span style={{ fontSize: 11.5, color: '#9aa1ab' }}>
                            {presets.length === 0
                              ? '저장된 결재선이 없습니다. [공통양식·결재선 설정]에서 만들 수 있습니다.'
                              : '고르면 아래 결재자가 그 순서대로 채워집니다.'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="ec-line-tag">결재자</span>
                          {picker(approverIds, setApproverIds, '결재자 선택')}
                          <span style={{ fontSize: 11.5, color: '#9aa1ab' }}>선택 순서대로 결재 진행</span>
                          {chips(approverIds, setApproverIds, true)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="ec-line-tag">참조자</span>
                          {picker(referenceIds, setReferenceIds, '참조자 선택')}
                          {chips(referenceIds, setReferenceIds, false)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="ec-line-tag">공유자</span>
                          {picker(shareIds, setShareIds, '공유자 선택')}
                          {chips(shareIds, setShareIds, false)}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {/* 원본은 [구분]과 [출력양식]이 한 줄에 좌우로 놓인다. */}
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>구분</th>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                        <input className="ec-input" value={category} onChange={(e) => setCategory(e.target.value)}
                               placeholder="문서 구분" style={{ width: 240 }} />
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--ec-label)', fontSize: 12 }}>출력양식</span>
                          <select className="ec-input" value={printFormat} onChange={(e) => setPrintFormat(e.target.value)} style={{ width: 200 }}>
                            <option>기안No.</option>
                            <option>기안서No.</option>
                          </select>
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>기안서No.</th>
                    <td>
                      <input className="ec-input" value="" readOnly placeholder="(저장 시 자동채번)"
                             style={{ width: '100%', background: '#f7f8f9', color: '#8a929c' }} />
                    </td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>결재문서</th>
                    <td style={{ fontSize: 12, color: '#8a929c' }}>
                      전표 · 출력물 —{' '}
                      <span style={{ color: '#62677e' }}>
                        저장한 뒤 [내결재관리]에서 판매·구매·비용 전표를 연결합니다.
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>첨부</th>
                    <td>
                      {/* 원본 기안서작성의 [여기에 파일 놓기]. 한 건만 붙는 자리다. */}
                      <EcFileDrop
                        disabled={uploading} busy={uploading}
                        onFiles={(fs) => { if (fs[0]) void uploadAttachment(fs[0]) }}
                      >
                        {attachment && (
                          <span style={{ fontSize: 12, color: 'var(--ec-blue-dark)' }}>
                            {attachment.name}
                            <span onClick={() => setAttachment(null)} style={{ cursor: 'pointer', marginLeft: 6, fontWeight: 700 }}>×</span>
                          </span>
                        )}
                      </EcFileDrop>
                    </td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>라벨</th>
                    <td>
                      <input className="ec-input" value={labelText} onChange={(e) => setLabelText(e.target.value)}
                             placeholder="문서를 묶어 보는 꼬리표" style={{ width: 360 }} />
                    </td>
                  </tr>
                </tbody>
              </table>

              {/*
                원본 에디터 툴바는 한 줄을 [글꼴][서식][삽입][레이아웃] 그룹으로 나누고
                각 그룹 아래에 회색(#868d93) 12px 라벨을 단다(실측). 우리는 라벨 없는 평평한 한 줄이었다.
                지금 실제로 동작하는 것만 제자리에 둔다 — 눌러도 아무 일 없는 버튼을 늘리는 건
                원본을 닮은 게 아니라 거짓말이다.
              */}
              <div className="ec-editor-bar">
                <div className="ec-editor-group">
                  <div className="row">
                    <select className="ec-input" style={{ height: 24 }} value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                      <option>돋움</option><option>맑은 고딕</option>
                    </select>
                    <select className="ec-input" style={{ height: 24, width: 60 }} value={fontSize} onChange={(e) => setFontSize(e.target.value)}>
                      <option>10</option><option>12</option><option>14</option>
                    </select>
                  </div>
                  <div className="name">글꼴</div>
                </div>
                <div className="ec-editor-group">
                  <div className="row">
                    <span title="굵게" onClick={() => setBold((v) => !v)}
                      style={{ fontWeight: 700, cursor: 'pointer', padding: '2px 7px', borderRadius: 3, fontSize: 12,
                        background: bold ? 'var(--ec-blue-light)' : undefined, color: bold ? 'var(--ec-blue-dark)' : undefined }}>B</span>
                    <span title="기울임" onClick={() => setItalic((v) => !v)}
                      style={{ fontStyle: 'italic', cursor: 'pointer', padding: '2px 7px', borderRadius: 3, fontSize: 12,
                        background: italic ? 'var(--ec-blue-light)' : undefined, color: italic ? 'var(--ec-blue-dark)' : undefined }}>I</span>
                    <span title="밑줄" onClick={() => setUnderline((v) => !v)}
                      style={{ textDecoration: 'underline', cursor: 'pointer', padding: '2px 7px', borderRadius: 3, fontSize: 12,
                        background: underline ? 'var(--ec-blue-light)' : undefined, color: underline ? 'var(--ec-blue-dark)' : undefined }}>U</span>
                  </div>
                  <div className="name">서식</div>
                </div>
              </div>

              {/*
                본문. 원본은 **양식이 본문 안의 표**로 들어가고 그 아래 자유 서술이 이어진다.
                우리는 양식 필드를 에디터 위에 따로 두고 본문은 자유 텍스트뿐이었다 — 모델이 달랐다.
              */}
              <div style={{
                border: '1px solid var(--ec-border)', background: '#fff', padding: 14,
                maxHeight: 420, overflow: 'auto',
                fontFamily: FONT_FAMILY[fontFamily] ?? undefined,
              }}>
                <ApprovalFormFields
                  title={selected.name.split('').join(' ')}
                  fields={selected.fieldSchema}
                  value={formData}
                  onChange={setFormData}
                />
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="본문(자유서식)을 입력하세요."
                  style={{
                    width: 621, maxWidth: '100%', marginTop: 10, minHeight: 90,
                    border: '1px solid var(--ec-border)', padding: 8, resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit',
                    fontSize: Number(fontSize) || 12,
                    fontWeight: bold ? 700 : 400,
                    fontStyle: italic ? 'italic' : 'normal',
                    textDecoration: underline ? 'underline' : 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 8, borderTop: '1px solid #eef1f5', alignItems: 'center' }}>
                {/* 원본 푸터: 저장/결재(F7)▴ · 임시저장/미리보기 · 양식샘플보기 · My도장/서명 · 닫기 */}
                <button className="ec-btn ec-btn-primary" onClick={() => void save(false)} disabled={saving}>{saving ? '처리 중…' : '저장/결재(F7)'}</button>
                <button className="ec-btn" onClick={() => void save(true)} disabled={saving}>임시저장/미리보기</button>
                <button
                  className="ec-btn"
                  title="이 양식이 어떤 항목을 요구하는지 미리 봅니다."
                  onClick={() => setNotice(
                    `${selected.name} — 입력항목: ${selected.fieldSchema.map((f) => f.label).join(' · ') || '없음'}`,
                  )}
                >
                  양식샘플보기
                </button>
                <button
                  className="ec-btn"
                  title="도장·서명 이미지는 아직 없습니다. 인쇄 결재란은 [인쇄용결재라인등록]에서 씁니다."
                  disabled
                >
                  My도장/서명
                </button>
                <button className="ec-btn" onClick={() => setSelected(null)}>닫기</button>
                {missing.length > 0 && (
                  <span style={{ fontSize: 11.5, color: '#c60a2e', marginLeft: 4 }}>미입력 필수: {missing.join(', ')}</span>
                )}
              </div>
            </div>
        )}
      </Modal>

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 460, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>{TITLE} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <ul style={{ paddingLeft: 16, margin: 0 }}>
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

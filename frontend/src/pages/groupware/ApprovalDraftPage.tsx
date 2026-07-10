import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import ApprovalFormFields from '../../components/approval/ApprovalFormFields'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import type { ApprovalDoc, ApprovalFormTemplate, MemberOption } from '../../api/types'

const TITLE = '기안서작성'
// 글꼴 select 표시명 → 실제 CSS font-family 매핑
const FONT_FAMILY: Record<string, string> = {
  돋움: 'Dotum, 돋움, sans-serif',
  '맑은 고딕': '"Malgun Gothic", 맑은 고딕, sans-serif',
}

const today = () => new Date().toISOString().slice(0, 10)

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
  const [pick, setPick] = useState('')
  const [pickRef, setPickRef] = useState('')
  const [pickShare, setPickShare] = useState('')
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

  const addTo = (
    raw: string,
    ids: number[],
    setIds: (fn: (a: number[]) => number[]) => void,
    clear: (v: string) => void,
  ) => {
    const id = Number(raw)
    if (!id || ids.includes(id)) return
    setIds((a) => [...a, id])
    clear('')
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

  const picker = (
    value: string,
    setValue: (v: string) => void,
    ids: number[],
    setIds: (fn: (a: number[]) => number[]) => void,
    placeholder: string,
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select className="ec-input" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 200 }}>
        <option value="">{placeholder}</option>
        {members.filter((m) => !ids.includes(m.id)).map((m) => (
          <option key={m.id} value={m.id}>{m.name}{m.department ? ` (${m.department})` : ''}</option>
        ))}
      </select>
      <button className="ec-btn" onClick={() => addTo(value, ids, setIds, setValue)}>+ 추가</button>
    </div>
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

      <div ref={bodyRef} style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
        {/* 좌측 양식 목록 — 서버의 양식 마스터 */}
        <div style={{ width: 260, border: '1px solid var(--ec-border)', background: '#fff', flexShrink: 0, overflow: 'auto' }}>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 60 }}>정렬순서</th>
                <th>양식명</th>
                <th style={{ width: 44 }}>구분</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} onClick={() => selectForm(t)} style={{ cursor: 'pointer', background: selected?.id === t.id ? 'var(--ec-blue-light)' : undefined }}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{t.sortOrder}</td>
                  <td>{t.name}</td>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>기본</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 우측 기안 편집기 */}
        <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--ec-border)', background: '#fff', padding: 16, overflow: 'auto' }}>
          {!selected ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa1ab', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 40 }}>📝</div>
              <div>좌측에서 결재양식을 선택하세요.</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 12 }}>기안서 | {selected.name}</div>

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
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>결재자<span style={{ color: '#c60a2e', marginLeft: 2 }}>*</span></th>
                    <td>
                      {picker(pick, setPick, approverIds, setApproverIds, '결재자 선택')}
                      <span style={{ fontSize: 11.5, color: '#9aa1ab' }}>선택 순서대로 결재 진행</span>
                      {chips(approverIds, setApproverIds, true)}
                    </td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>수신참조</th>
                    <td>{picker(pickRef, setPickRef, referenceIds, setReferenceIds, '수신참조 선택')}{chips(referenceIds, setReferenceIds, false)}</td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>공유자</th>
                    <td>{picker(pickShare, setPickShare, shareIds, setShareIds, '공유자 선택')}{chips(shareIds, setShareIds, false)}</td>
                  </tr>
                </tbody>
              </table>

              {/* 양식별 입력 항목 — 서버의 field_schema 가 정의한다 */}
              <ApprovalFormFields fields={selected.fieldSchema} value={formData} onChange={setFormData} />

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--ec-border)', borderBottom: 'none', padding: '4px 8px', background: '#f5f7fa', fontSize: 12 }}>
                <select className="ec-input" style={{ height: 22 }} value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                  <option>돋움</option><option>맑은 고딕</option>
                </select>
                <select className="ec-input" style={{ height: 22, width: 54 }} value={fontSize} onChange={(e) => setFontSize(e.target.value)}>
                  <option>10</option><option>12</option>
                </select>
                <span onClick={() => setBold((v) => !v)} title="굵게" style={{ fontWeight: 700, cursor: 'pointer', padding: '0 5px', borderRadius: 2, background: bold ? 'var(--ec-blue-light)' : undefined, color: bold ? 'var(--ec-blue-dark)' : undefined }}>B</span>
                <span onClick={() => setItalic((v) => !v)} title="기울임" style={{ fontStyle: 'italic', cursor: 'pointer', padding: '0 5px', borderRadius: 2, background: italic ? 'var(--ec-blue-light)' : undefined, color: italic ? 'var(--ec-blue-dark)' : undefined }}>I</span>
                <span onClick={() => setUnderline((v) => !v)} title="밑줄" style={{ textDecoration: 'underline', cursor: 'pointer', padding: '0 5px', borderRadius: 2, background: underline ? 'var(--ec-blue-light)' : undefined, color: underline ? 'var(--ec-blue-dark)' : undefined }}>U</span>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="본문(자유서식)을 입력하세요."
                style={{
                  width: '100%', height: 160, border: '1px solid var(--ec-border)', padding: 10, resize: 'vertical', outline: 'none',
                  fontFamily: FONT_FAMILY[fontFamily] ?? undefined,
                  fontSize: Number(fontSize) || 13,
                  fontWeight: bold ? 700 : 400,
                  fontStyle: italic ? 'italic' : 'normal',
                  textDecoration: underline ? 'underline' : 'none',
                }} />

              <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 8, borderTop: '1px solid #eef1f5', alignItems: 'center' }}>
                <button className="ec-btn ec-btn-primary" onClick={() => void save(false)} disabled={saving}>{saving ? '처리 중…' : '저장/결재(F7)'}</button>
                <button className="ec-btn" onClick={() => void save(true)} disabled={saving}>임시저장</button>
                <button className="ec-btn" onClick={() => setSelected(null)}>닫기</button>
                {missing.length > 0 && (
                  <span style={{ fontSize: 11.5, color: '#c60a2e', marginLeft: 4 }}>미입력 필수: {missing.join(', ')}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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

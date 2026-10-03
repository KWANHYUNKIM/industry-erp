import { useEffect, useState, useRef} from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { useTableSort } from '../../utils/useTableSort'
import { useShortcut } from '../../utils/useShortcut'
import type {
  ApprovalField, ApprovalFieldType, ApprovalFormTemplateAdmin, ApprovalPreset, MemberOption,
} from '../../types/api'

// 원본 전자결재 > 기초자료등록 아래의 두 화면 이름 그대로다(공통양식등록 · 결재설정).
const TABS = ['공통양식등록', '결재설정'] as const
type Tab = (typeof TABS)[number]

const tabOf = (q: string | null): Tab => (TABS.includes(q as Tab) ? (q as Tab) : '공통양식등록')

/** 편집기가 다루는 입력 타입. table 은 컬럼 정의가 필요해 편집 대상에서 뺀다(기존 정의는 그대로 보존). */
const EDITABLE_TYPES: ApprovalFieldType[] = ['text', 'textarea', 'date', 'datetime', 'number']
const TYPE_LABEL: Record<string, string> = {
  text: '한 줄 텍스트', textarea: '여러 줄 텍스트', date: '날짜', datetime: '일시', number: '숫자', table: '표(편집 미지원)',
}

/**
 * 그룹웨어 > 전자결재 설정 — 공통양식등록 · 결재선 프리셋.
 * 양식의 입력항목(fieldSchema)을 여기서 정의하면 기안서 작성 화면이 그대로 폼을 그린다.
 */
export default function ApprovalSettingPage() {
  // 메뉴가 ?tab= 으로 어느 화면인지 정해서 들어온다(원본은 두 메뉴가 각각 별도 화면이다).
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => tabOf(params.get('tab')))

  // 두 메뉴가 같은 경로를 가리키므로 서로 오갈 때 컴포넌트가 다시 만들어지지 않는다.
  // 초기값만 읽으면 메뉴를 눌러도 탭이 그대로다 — 쿼리가 바뀌면 따라가게 한다.
  useEffect(() => { setTab(tabOf(params.get('tab'))) }, [params])
  const [templates, setTemplates] = useState<ApprovalFormTemplateAdmin[]>([])
  const [presets, setPresets] = useState<ApprovalPreset[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<ApprovalFormTemplateAdmin | 'new' | null>(null)
  const [editingPreset, setEditingPreset] = useState<ApprovalPreset | 'new' | null>(null)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3000) }
  const tsort = useTableSort(templates, { 정렬순서: (t) => t.sortOrder, 양식명: (t) => t.name })
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickCopy, setQuickCopy] = useState('')
  const [quickErr, setQuickErr] = useState('')
  function openQuickNew() { setQuickName(''); setQuickCopy(''); setQuickErr(''); setQuickOpen(true) }
  /** '양식등록' — 이름과 복사할 양식만 받아 만든다. 양식코드는 우리 서버가 필수라 자동으로 붙인다(원본 화면에는 없다). */
  async function quickSave() {
    setQuickErr('')
    if (!quickName.trim()) return setQuickErr('양식명을 입력하세요.')
    const src = templates.find((t) => String(t.id) === quickCopy)
    try {
      await api.post('/approval-settings/templates', {
        code: `FORM-${Date.now().toString(36).toUpperCase()}`,
        name: quickName.trim(),
        sortOrder: templates.reduce((m, t) => Math.max(m, t.sortOrder), 0) + 1,
        active: true,
        fieldSchema: src ? src.fieldSchema : [],
      })
      setQuickOpen(false)
      flash(`${quickName.trim()} 양식을 저장했습니다.`)
      await load()
    } catch (err) { setQuickErr(extractErrorMessage(err)) }
  }
  useShortcut('F8', () => void quickSave(), quickOpen)

  async function load() {
    setLoading(true)
    try {
      const [t, p, m] = await Promise.all([
        api.get<ApprovalFormTemplateAdmin[]>('/approval-settings/templates'),
        api.get<ApprovalPreset[]>('/approval-settings/presets'),
        api.get<MemberOption[]>('/meta/users'),
      ])
      setTemplates(t.data)
      setPresets(p.data)
      setMembers(m.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function removeTemplate(t: ApprovalFormTemplateAdmin) {
    if (!window.confirm(`${t.name} 양식을 삭제할까요?`)) return
    try {
      await api.delete(`/approval-settings/templates/${t.id}`)
      flash(`${t.name} 양식을 삭제했습니다.`)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function removePreset(p: ApprovalPreset) {
    if (!window.confirm(`결재선 "${p.name}"을 삭제할까요?`)) return
    try {
      await api.delete(`/approval-settings/presets/${p.id}`)
      flash('결재선을 삭제했습니다.')
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '결재선 설정', [])

  return (
    <EcListShell
      // 원본 공통양식등록 화면의 제목은 '공통양식리스트' 다(2026-10-03 실측). 두 화면은 메뉴가 따로라 화면 안 탭은 없다.
      title={tab === '공통양식등록' ? '공통양식리스트' : tab}
      newLabel={tab === '공통양식등록' ? '신규(F2)' : '결재선 추가(F2)'}
      onNew={() => (tab === '공통양식등록' ? openQuickNew() : setEditingPreset('new'))}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {loading ? <p className="ec-empty">불러오는 중…</p>
        : tab === '공통양식등록' ? (
          <>
            {editing && (
              <TemplateForm
                template={editing === 'new' ? null : editing}
                onDelete={editing !== 'new' ? () => { const t = editing; setEditing(null); void removeTemplate(t) } : undefined}
                onError={setError}
                onClose={() => setEditing(null)}
                onSaved={(name) => { setEditing(null); flash(`${name} 양식을 저장했습니다.`); load() }}
              />
            )}
            {/*
              원본 공통양식리스트(E070107): [정렬순서▼][양식명▼][구분▼][결재문서] 네 칸, 양식명을 누르면 그 양식을 고친다,
              하단 [신규(F2)] 하나. 우리는 순서·양식코드·양식명·입력항목·기안서·사용·처리 일곱 칸이었다.
              [구분]은 양식 분류(휴가신청서·지출결의서)인데 우리 양식에 분류가 없어 비운다. 삭제는 양식을 열어서 한다.
            */}
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="w-[160px] text-center cursor-pointer text-ec-navy" onClick={() => tsort.toggle('정렬순서')}>정렬순서 {tsort.mark('정렬순서')}</th>
                  <th className="cursor-pointer text-ec-navy" onClick={() => tsort.toggle('양식명')}>양식명 {tsort.mark('양식명')}</th>
                  <th className="w-[200px] text-ec-navy">구분 ▼</th>
                  <th className="w-[150px]">결재문서</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : tsort.sorted.map((t) => (
                  <tr key={t.id}>
                    <td className="text-center">{t.sortOrder}</td>
                    <td>
                      <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-left text-ec-navy"
                              onClick={() => setEditing(t)}>{t.name}{t.active ? '' : ' (사용중단)'}</button>
                    </td>
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 원본 [신규(F2)] → '양식등록': 양식명 + 복사대상양식 만 묻는다. 저장하면 목록에 생기고, 양식명을 눌러 칸을 고친다. */}
            <Modal error={quickErr} open={quickOpen} title="양식등록" width={640} onClose={() => setQuickOpen(false)}>
              <ul className="ec-form mb-[10px]">
                <li className="wide"><div className="title">양식명</div><div className="form">
                  <input className="ec-input w-full" placeholder="양식명" value={quickName} onChange={(e) => setQuickName(e.target.value)} />
                </div></li>
                <li className="wide"><div className="title">복사대상양식</div><div className="form">
                  <select className="ec-input w-full" aria-label="복사대상양식" value={quickCopy} onChange={(e) => setQuickCopy(e.target.value)}>
                    <option value="">기본(기본)</option>
                    {templates.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                  </select>
                </div></li>
              </ul>
              <div className="flex gap-[6px]">
                <button type="button" className="ec-btn ec-btn-primary" onClick={() => void quickSave()}>저장(F8)</button>
                <button type="button" className="ec-btn" onClick={() => setQuickOpen(false)}>닫기</button>
              </div>
            </Modal>
          </>
        ) : (
          <>
            {editingPreset && (
              <PresetForm
                preset={editingPreset === 'new' ? null : editingPreset}
                templates={templates}
                members={members}
                onError={setError}
                onClose={() => setEditingPreset(null)}
                onSaved={(name) => { setEditingPreset(null); flash(`결재선 "${name}"을 저장했습니다.`); load() }}
              />
            )}
            <table ref={tableRef} className="w-full text-left">
              <thead>
                <tr>
                  <th className="w-[34px]"></th>
                  <th className="w-[200px]">결재선</th>
                  <th className="w-[150px]">적용 양식</th>
                  <th>결재 순서</th>
                  <th className="w-[80px] text-center">사용</th>
                  <th className="w-[110px] text-center">처리</th>
                </tr>
              </thead>
              <tbody>
                {presets.length === 0 ? (
                  <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : presets.map((p, i) => (
                  <tr key={p.id}>
                    <td className="text-center text-ec-hint">{i + 1}</td>
                    <td className="font-semibold">{p.name}</td>
                    <td className="text-ec-label">{p.formTemplateName ?? '공통(모든 양식)'}</td>
                    <td>
                      {p.steps.map((s, idx) => (
                        <span key={s.stepOrder}>
                          {idx > 0 && <span className="text-ec-off my-0 mx-[5px]">→</span>}
                          <span className="text-ec-navy">{s.approverName}</span>
                          {s.department && <span className="text-ec-hint text-[11.5px]"> ({s.department})</span>}
                        </span>
                      ))}
                    </td>
                    <td style={{ textAlign: 'center', color: p.active ? 'var(--ec-success)' : 'var(--ec-text-hint)' }}>{p.active ? '사용' : '중지'}</td>
                    <td className="text-center">
                      <div className="inline-flex gap-[3px]">
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditingPreset(p)}>수정</button>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => removePreset(p)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-[8px] text-[11.5px] text-ec-hint">
              ※ 결재선은 기안할 때 결재자를 하나씩 고르지 않으려고 미리 만들어 두는 순서입니다. 같은 결재자가 연속으로 오는 결재선은 저장되지 않습니다.
            </div>
          </>
        )}
    </EcListShell>
  )
}

// ── 양식 편집 ───────────────────────────────────────────────────────────

interface FieldRow { key: string; label: string; type: ApprovalFieldType; required: boolean }

function TemplateForm({ template, onError, onClose, onSaved, onDelete }: {
  template: ApprovalFormTemplateAdmin | null
  onError: (m: string) => void; onClose: () => void; onSaved: (name: string) => void
  /** 목록에서 [처리] 칸을 뺐으므로 삭제는 양식을 열어서 한다. */
  onDelete?: () => void
}) {
  const isNew = template === null
  // 표(table) 같은 편집 미지원 항목은 건드리지 않고 그대로 보존한다.
  const preserved = (template?.fieldSchema ?? []).filter((f) => !EDITABLE_TYPES.includes(f.type))
  const [code, setCode] = useState(template?.code ?? '')
  const [name, setName] = useState(template?.name ?? '')
  const [sortOrder, setSortOrder] = useState(String(template?.sortOrder ?? 0))
  const [active, setActive] = useState(template?.active ?? true)
  const [fields, setFields] = useState<FieldRow[]>(
    (template?.fieldSchema ?? [])
      .filter((f) => EDITABLE_TYPES.includes(f.type))
      .map((f) => ({ key: f.key, label: f.label, type: f.type, required: Boolean(f.required) })))
  const [saving, setSaving] = useState(false)

  function setField(i: number, patch: Partial<FieldRow>) {
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  async function submit() {
    onError('')
    if (!code) return onError('양식코드를 입력하세요.')
    if (!name) return onError('양식명을 입력하세요.')
    for (const f of fields) {
      if (!f.key || !f.label) return onError('입력항목의 키와 라벨을 모두 채우세요.')
    }
    const keys = fields.map((f) => f.key)
    if (new Set(keys).size !== keys.length) return onError('입력항목의 키가 중복됩니다.')

    const schema: ApprovalField[] = [
      ...fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })),
      ...preserved,
    ]
    setSaving(true)
    try {
      const body = { code: code.toUpperCase(), name, sortOrder: Number(sortOrder) || 0, active, fieldSchema: schema }
      if (isNew) await api.post('/approval-settings/templates', body)
      else await api.put(`/approval-settings/templates/${template.id}`, body)
      onSaved(name)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">
        {isNew ? '양식 추가' : `양식 수정 — ${template.code}`}
      </div>
      <div className="flex gap-[12px] flex-wrap items-end mb-[12px]">
        <Field label="양식코드 *">
          <input className="ec-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ width: 150 }} placeholder="LEAVE" disabled={!isNew} />
        </Field>
        <Field label="양식명 *">
          <input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 200 }} placeholder="휴가신청서" />
        </Field>
        <Field label="정렬순서">
          <input className="ec-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ width: 90, textAlign: 'right' }} />
        </Field>
        <Field label="사용여부">
          <select className="ec-input" value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')} style={{ width: 100 }}>
            <option value="1">사용</option>
            <option value="0">중지</option>
          </select>
        </Field>
        {!isNew && (
          <span className="text-[11.5px] text-ec-hint pb-[5px]">
            양식코드는 바꿀 수 없습니다(기안서 {template.documentCount}건이 이 코드를 가리킵니다).
          </span>
        )}
      </div>

      <div className="text-[12.5px] font-bold text-ec-label mb-[4px]">입력항목</div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[160px]">키 (영문)</th>
            <th className="w-[200px]">라벨</th>
            <th className="w-[150px]">타입</th>
            <th className="w-[80px] text-center">필수</th>
            <th className="w-[40px]"></th>
          </tr>
        </thead>
        <tbody>
          {fields.length === 0 ? (
            <tr><td colSpan={6} className="text-center text-ec-hint p-[14px]">
              입력항목이 없으면 자유서식(본문만)으로 작성합니다.
            </td></tr>
          ) : fields.map((f, i) => (
            <tr key={i}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td><input className="ec-input" value={f.key} onChange={(e) => setField(i, { key: e.target.value })} style={{ width: '100%' }} placeholder="startDate" /></td>
              <td><input className="ec-input" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} style={{ width: '100%' }} placeholder="시작일" /></td>
              <td>
                <select className="ec-input" value={f.type} onChange={(e) => setField(i, { type: e.target.value as ApprovalFieldType })} style={{ width: '100%' }}>
                  {EDITABLE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </td>
              <td className="text-center">
                <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
              </td>
              <td className="text-center">
                <button className="ec-btn" onClick={() => setFields((fs) => fs.filter((_, idx) => idx !== i))}>×</button>
              </td>
            </tr>
          ))}
          {preserved.map((f, i) => (
            <tr key={`p-${i}`} style={{ background: 'var(--ec-bg-page)' }}>
              <td className="text-center text-ec-hint">-</td>
              <td className="text-ec-hint">{f.key}</td>
              <td className="text-ec-hint">{f.label}</td>
              <td className="text-ec-hint">{TYPE_LABEL[f.type] ?? f.type}</td>
              <td colSpan={2} className="text-ec-hint text-[11.5px]">이 화면에서 편집하지 않고 그대로 보존합니다</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-[6px] mt-[8px]">
        <button className="ec-btn" onClick={() => setFields((fs) => [...fs, { key: '', label: '', type: 'text', required: false }])}>+ 항목 추가</button>
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        {onDelete && <button className="ec-btn" onClick={onDelete}>삭제</button>}
        <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

// ── 결재선 편집 ─────────────────────────────────────────────────────────

function PresetForm({ preset, templates, members, onError, onClose, onSaved }: {
  preset: ApprovalPreset | null
  templates: ApprovalFormTemplateAdmin[]
  members: MemberOption[]
  onError: (m: string) => void; onClose: () => void; onSaved: (name: string) => void
}) {
  const isNew = preset === null
  const [name, setName] = useState(preset?.name ?? '')
  const [formTemplateId, setFormTemplateId] = useState(preset?.formTemplateId ? String(preset.formTemplateId) : '')
  const [active, setActive] = useState(preset?.active ?? true)
  const [approverIds, setApproverIds] = useState<string[]>(
    preset ? preset.steps.map((s) => String(s.approverId)) : [''])
  const [saving, setSaving] = useState(false)

  function setApprover(i: number, v: string) {
    setApproverIds((ids) => ids.map((id, idx) => (idx === i ? v : id)))
  }

  async function submit() {
    onError('')
    if (!name) return onError('결재선 이름을 입력하세요.')
    const ids = approverIds.filter(Boolean).map(Number)
    if (ids.length === 0) return onError('결재자를 1명 이상 지정하세요.')
    setSaving(true)
    try {
      const body = {
        name,
        formTemplateId: formTemplateId ? Number(formTemplateId) : undefined,
        active,
        approverIds: ids,
      }
      if (isNew) await api.post('/approval-settings/presets', body)
      else await api.put(`/approval-settings/presets/${preset.id}`, body)
      onSaved(name)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">
        {isNew ? '결재선 추가' : `결재선 수정 — ${preset.name}`}
      </div>
      <div className="flex gap-[12px] flex-wrap items-end mb-[10px]">
        <Field label="결재선 이름 *">
          <input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 220 }} placeholder="팀장→본부장→대표" />
        </Field>
        <Field label="적용 양식">
          <select className="ec-input" value={formTemplateId} onChange={(e) => setFormTemplateId(e.target.value)} style={{ width: 200 }}>
            <option value="">공통 (모든 양식)</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="사용여부">
          <select className="ec-input" value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')} style={{ width: 100 }}>
            <option value="1">사용</option>
            <option value="0">중지</option>
          </select>
        </Field>
      </div>

      <div className="text-[12.5px] font-bold text-ec-label mb-[4px]">결재 순서</div>
      <div className="flex gap-[8px] flex-wrap items-center">
        {approverIds.map((id, i) => (
          <div key={i} className="flex items-center gap-[4px]">
            {i > 0 && <span className="text-ec-blue">→</span>}
            <span className="text-[11.5px] text-ec-hint">{i + 1}차</span>
            {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */}
            <CodePickerField label={`${i + 1}차 결재자`} hideLabel width={170} placeholder="결재자" emptyLabel="선택 해제"
                             value={id} onChange={(v) => setApprover(i, v)}
                             items={members.map((m) => ({ value: String(m.id), name: m.name, sub: m.department || null }))} />
            {approverIds.length > 1 && (
              <button className="ec-btn" onClick={() => setApproverIds((ids) => ids.filter((_, idx) => idx !== i))}>×</button>
            )}
          </div>
        ))}
        <button className="ec-btn" onClick={() => setApproverIds((ids) => [...ids, ''])}>+ 결재자 추가</button>
      </div>

      <div className="flex gap-[6px] mt-[10px]">
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-[12.5px]">
      <div className="text-ec-label mb-[3px]">{label}</div>
      {children}
    </label>
  )
}

import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import type {
  ApprovalField, ApprovalFieldType, ApprovalFormTemplateAdmin, ApprovalPreset, MemberOption,
} from '../../api/types'

const TABS = ['공통양식등록', '결재선 설정'] as const
type Tab = (typeof TABS)[number]

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
  const [tab, setTab] = useState<Tab>('공통양식등록')
  const [templates, setTemplates] = useState<ApprovalFormTemplateAdmin[]>([])
  const [presets, setPresets] = useState<ApprovalPreset[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<ApprovalFormTemplateAdmin | 'new' | null>(null)
  const [editingPreset, setEditingPreset] = useState<ApprovalPreset | 'new' | null>(null)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3000) }

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

  return (
    <EcListShell
      title="전자결재 설정 (공통양식·결재선)"
      newLabel={tab === '공통양식등록' ? '양식 추가(F2)' : '결재선 추가(F2)'}
      onNew={() => (tab === '공통양식등록' ? setEditing('new') : setEditingPreset('new'))}
      actions={[{ label: '새로고침', onClick: load }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setEditing(null); setEditingPreset(null); setError('') }} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({t === '공통양식등록' ? templates.length : presets.length})</button>
        ))}
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {loading ? <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
        : tab === '공통양식등록' ? (
          <>
            {editing && (
              <TemplateForm
                template={editing === 'new' ? null : editing}
                onError={setError}
                onClose={() => setEditing(null)}
                onSaved={(name) => { setEditing(null); flash(`${name} 양식을 저장했습니다.`); load() }}
              />
            )}
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th style={{ width: 70, textAlign: 'right' }}>순서</th>
                  <th style={{ width: 130 }}>양식코드</th>
                  <th style={{ width: 180 }}>양식명</th>
                  <th>입력항목</th>
                  <th style={{ width: 90, textAlign: 'center' }}>기안서</th>
                  <th style={{ width: 80, textAlign: 'center' }}>사용</th>
                  <th style={{ width: 110, textAlign: 'center' }}>처리</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 양식이 없습니다.</td></tr>
                ) : templates.map((t, i) => (
                  <tr key={t.id}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ textAlign: 'right', color: '#5a626e' }}>{t.sortOrder}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{t.code}</td>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td style={{ color: '#5a626e', fontSize: 12 }}>
                      {t.fieldSchema.length === 0
                        ? <span style={{ color: '#9aa1ab' }}>자유서식 (본문만)</span>
                        : t.fieldSchema.map((f) => f.label).join(' · ')}
                    </td>
                    <td style={{ textAlign: 'center', color: t.documentCount > 0 ? '#5a626e' : '#9aa1ab' }}>{t.documentCount}건</td>
                    <td style={{ textAlign: 'center', color: t.active ? '#1c7c3c' : '#8a929c' }}>{t.active ? '사용' : '중지'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 3 }}>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditing(t)}>수정</button>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: t.documentCount > 0 ? '#c9ced6' : '#c60a2e' }}
                          onClick={() => removeTemplate(t)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
              ※ 기안서가 한 건이라도 쓰인 양식은 삭제할 수 없습니다(그 기안서들이 양식을 가리킵니다). 사용중지로 내리면 새 기안에서만 사라지고 과거 문서는 그대로 열립니다.
            </div>
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
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th style={{ width: 200 }}>결재선</th>
                  <th style={{ width: 150 }}>적용 양식</th>
                  <th>결재 순서</th>
                  <th style={{ width: 80, textAlign: 'center' }}>사용</th>
                  <th style={{ width: 110, textAlign: 'center' }}>처리</th>
                </tr>
              </thead>
              <tbody>
                {presets.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 결재선이 없습니다.</td></tr>
                ) : presets.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ color: '#5a626e' }}>{p.formTemplateName ?? '공통(모든 양식)'}</td>
                    <td>
                      {p.steps.map((s, idx) => (
                        <span key={s.stepOrder}>
                          {idx > 0 && <span style={{ color: '#c9ced6', margin: '0 5px' }}>→</span>}
                          <span style={{ color: 'var(--ec-blue-dark)' }}>{s.approverName}</span>
                          {s.department && <span style={{ color: '#9aa1ab', fontSize: 11.5 }}> ({s.department})</span>}
                        </span>
                      ))}
                    </td>
                    <td style={{ textAlign: 'center', color: p.active ? '#1c7c3c' : '#8a929c' }}>{p.active ? '사용' : '중지'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 3 }}>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditingPreset(p)}>수정</button>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => removePreset(p)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
              ※ 결재선은 기안할 때 결재자를 하나씩 고르지 않으려고 미리 만들어 두는 순서입니다. 같은 결재자가 연속으로 오는 결재선은 저장되지 않습니다.
            </div>
          </>
        )}
    </EcListShell>
  )
}

// ── 양식 편집 ───────────────────────────────────────────────────────────

interface FieldRow { key: string; label: string; type: ApprovalFieldType; required: boolean }

function TemplateForm({ template, onError, onClose, onSaved }: {
  template: ApprovalFormTemplateAdmin | null
  onError: (m: string) => void; onClose: () => void; onSaved: (name: string) => void
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
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>
        {isNew ? '양식 추가' : `양식 수정 — ${template.code}`}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
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
          <span style={{ fontSize: 11.5, color: '#8a929c', paddingBottom: 5 }}>
            양식코드는 바꿀 수 없습니다(기안서 {template.documentCount}건이 이 코드를 가리킵니다).
          </span>
        )}
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5a626e', marginBottom: 4 }}>입력항목</div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 160 }}>키 (영문)</th>
            <th style={{ width: 200 }}>라벨</th>
            <th style={{ width: 150 }}>타입</th>
            <th style={{ width: 80, textAlign: 'center' }}>필수</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {fields.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 14 }}>
              입력항목이 없으면 자유서식(본문만)으로 작성합니다.
            </td></tr>
          ) : fields.map((f, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td><input className="ec-input" value={f.key} onChange={(e) => setField(i, { key: e.target.value })} style={{ width: '100%' }} placeholder="startDate" /></td>
              <td><input className="ec-input" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} style={{ width: '100%' }} placeholder="시작일" /></td>
              <td>
                <select className="ec-input" value={f.type} onChange={(e) => setField(i, { type: e.target.value as ApprovalFieldType })} style={{ width: '100%' }}>
                  {EDITABLE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </td>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" onClick={() => setFields((fs) => fs.filter((_, idx) => idx !== i))}>×</button>
              </td>
            </tr>
          ))}
          {preserved.map((f, i) => (
            <tr key={`p-${i}`} style={{ background: '#f7f9fb' }}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>-</td>
              <td style={{ color: '#8a929c' }}>{f.key}</td>
              <td style={{ color: '#8a929c' }}>{f.label}</td>
              <td style={{ color: '#8a929c' }}>{TYPE_LABEL[f.type] ?? f.type}</td>
              <td colSpan={2} style={{ color: '#9aa1ab', fontSize: 11.5 }}>이 화면에서 편집하지 않고 그대로 보존합니다</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="ec-btn" onClick={() => setFields((fs) => [...fs, { key: '', label: '', type: 'text', required: false }])}>+ 항목 추가</button>
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
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
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>
        {isNew ? '결재선 추가' : `결재선 수정 — ${preset.name}`}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
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

      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5a626e', marginBottom: 4 }}>결재 순서</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {approverIds.map((id, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: 'var(--ec-blue)' }}>→</span>}
            <span style={{ fontSize: 11.5, color: '#8a929c' }}>{i + 1}차</span>
            <select className="ec-input" value={id} onChange={(e) => setApprover(i, e.target.value)} style={{ width: 170 }}>
              <option value="">결재자 선택</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name} {m.department ? `(${m.department})` : ''}</option>)}
            </select>
            {approverIds.length > 1 && (
              <button className="ec-btn" onClick={() => setApproverIds((ids) => ids.filter((_, idx) => idx !== i))}>×</button>
            )}
          </div>
        ))}
        <button className="ec-btn" onClick={() => setApproverIds((ids) => [...ids, ''])}>+ 결재자 추가</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12.5 }}>
      <div style={{ color: '#5a626e', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  )
}

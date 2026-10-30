import { useEffect, useState, useRef} from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { useTableSort } from '../../utils/useTableSort'
import { useShortcut } from '../../utils/useShortcut'
import { fetchApprovalGroups, type ApprovalGroup, type WithGroup } from '../../features/approval/groups'
import { ApprovalGroupField } from '../../features/approval/components/ApprovalGroupSearch'
import { UserPermissionModal, ViewTimingModal, type ViewTiming, type WithInputSettings } from '../../features/approval/components/FormInputSettings'
import RichBodyEditor from '../../features/approval/components/RichBodyEditor'
import { APPROVAL_DOCS, BODY_KEY, DOC_KEY, approvalDocOf, bodyHtmlOf, formFieldsOf, withApprovalDoc, withBodyHtml } from '../../features/approval/bodyTemplate'
import { originalFormFor } from '../../features/approval/templates'
import type {
  ApprovalField, ApprovalFieldType, ApprovalFormTemplateAdmin, ApprovalPreset, MemberOption,
} from '../../types/api'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

/** 원본 공통양식리스트 [Option](2026-10-30 E070107 클릭 대조) — 양식작성서비스 · 리스트설정. 받쳐 줄 기능이 없어 안내만 한다. */
const FORM_OPTION_MENU = [
  { label: '양식작성서비스', onClick: () => void ecAlert('양식작성서비스(양식 대행 작성)는 지원하지 않습니다.') },
  { label: '리스트설정', onClick: () => void ecAlert('리스트설정은 지원하지 않습니다.') },
]
/** 원본 조건 판의 결재문서 구분 — 우리 양식은 결재문서(근태관리 …)가 있으면 '결재전표', 없으면 '기타'. 출력물을 다는 양식은 아직 없다. */
const DOC_KINDS = ['결재전표', '결재출력물', '기타'] as const
type DocKind = (typeof DOC_KINDS)[number]

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
  /** 입력화면설정 [취소] — 이 값을 올려 창을 불러온 값으로 다시 그린다. */
  const [formKey, setFormKey] = useState(0)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3000) }
  /** 기안서작성 맨 위 '00 기본'(BASIC)은 제품이 심는 양식이라 원본 공통양식리스트에 없다(2026-10-03 실측). */
  const companyTemplates = templates.filter((t) => t.code !== 'BASIC')
  /*
   * 원본 [Search(F3)] 조건 판(2026-10-30 E070107 클릭 대조): 양식명 · 정렬순서 · 구분 · 결재전표 · 결재출력물 · 기타 · 수정일자순(정렬).
   * 판 아래 [검색(F8)] [다시 작성] 은 셸(EcListShell)이 붙인다. 조건은 고르는 즉시 걸린다.
   */
  const [condName, setCondName] = useState('')
  const [condOrder, setCondOrder] = useState('')
  const [condGroup, setCondGroup] = useState('')
  const [condKinds, setCondKinds] = useState<Set<DocKind>>(() => new Set(DOC_KINDS))
  /** 수정일자순 — 양식에 수정일이 실려 오지 않아 나중에 만든(고친) 것부터(id 내림차순)로 갈음한다 */
  const [byModified, setByModified] = useState(false)
  const resetConds = () => { setCondName(''); setCondOrder(''); setCondGroup(''); setCondKinds(new Set(DOC_KINDS)); setByModified(false) }
  const kindOf = (t: ApprovalFormTemplateAdmin): DocKind => (approvalDocOf(t.fieldSchema) ? '결재전표' : '기타')
  const condTemplates = companyTemplates.filter((t) =>
    (!condName.trim() || t.name.includes(condName.trim()))
    && (!condOrder.trim() || String(t.sortOrder) === condOrder.trim())
    && (!condGroup || ((t as WithGroup).groupName ?? '') === condGroup)
    && condKinds.has(kindOf(t)))
  const groupNames = [...new Set(companyTemplates.map((t) => (t as WithGroup).groupName).filter(Boolean))].sort() as string[]
  const tsort = useTableSort(byModified ? [...condTemplates].sort((a, b) => b.id - a.id) : condTemplates,
    { 정렬순서: (t) => t.sortOrder, 양식명: (t) => t.name, 구분: (t) => (t as WithGroup).groupName ?? '' })
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
      // 원본: 새 양식의 정렬순서는 0, 저장하면 곧바로 '입력화면설정' 창이 그 양식으로 열린다(2026-10-03 실측).
      const res = await api.post<ApprovalFormTemplateAdmin>('/approval-settings/templates', {
        code: `FORM-${Date.now().toString(36).toUpperCase()}`,
        name: quickName.trim(),
        sortOrder: 0,
        active: true,
        fieldSchema: src ? src.fieldSchema : [],
      })
      setQuickOpen(false)
      await load()
      setEditing(res.data)
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
    // 원본 '입력화면설정' [삭제] 의 확인 문구 그대로.
    if (!(await ecConfirm('등록한 양식을 삭제하겠습니까?\n삭제된 양식은 복구되지 않습니다.'))) return
    try {
      await api.delete(`/approval-settings/templates/${t.id}`)
      flash(`${t.name} 양식을 삭제했습니다.`)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function removePreset(p: ApprovalPreset) {
    if (!(await ecConfirm(`결재선 "${p.name}"을 삭제할까요?`))) return
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
      optionMenu={tab === '공통양식등록' ? FORM_OPTION_MENU : undefined}
      onReset={tab === '공통양식등록' ? resetConds : undefined}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {loading ? <p className="ec-empty">불러오는 중…</p>
        : tab === '공통양식등록' ? (
          <>
            <div className="ec-search-conds flex items-center flex-wrap gap-[4px] mb-[6px]">
              <label className="text-[12.5px] text-ec-label">양식명</label>
              <input className="ec-input w-[160px]" aria-label="양식명" value={condName} onChange={(e) => setCondName(e.target.value)} />
              <label className="text-[12.5px] text-ec-label ml-[8px]">정렬순서</label>
              <input className="ec-input w-[70px] text-right" aria-label="정렬순서" inputMode="numeric" value={condOrder}
                     onChange={(e) => setCondOrder(e.target.value.replace(/\D/g, ''))} />
              <label className="text-[12.5px] text-ec-label ml-[8px]">구분</label>
              <CodePickerField label="구분" hideLabel width={150} emptyLabel="전체" value={condGroup} onChange={setCondGroup}
                               items={groupNames.map((g) => ({ value: g, name: g }))} />
              {DOC_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-[3px] ml-[8px]">
                  <input type="checkbox" checked={condKinds.has(k)}
                         onChange={(e) => setCondKinds((cur) => { const n = new Set(cur); if (e.target.checked) n.add(k); else n.delete(k); return n })} />
                  {k}
                </label>
              ))}
              <label className="flex items-center gap-[3px] ml-[8px]">
                <input type="checkbox" checked={byModified} onChange={(e) => setByModified(e.target.checked)} />
                수정일자순(정렬)
              </label>
            </div>
            {editing && (
              <TemplateForm
                key={`${editing === 'new' ? 'new' : editing.id}-${formKey}`}
                template={editing === 'new' ? null : editing}
                onCancel={() => setFormKey((k) => k + 1)}
                onDelete={editing !== 'new' ? () => { const t = editing; setEditing(null); void removeTemplate(t) } : undefined}
                onError={setError}
                onClose={() => setEditing(null)}
                onSaved={(name) => { setEditing(null); flash(`${name} 양식을 저장했습니다.`); load() }}
              />
            )}
            {/*
              원본 공통양식리스트(E070107): [정렬순서▼][양식명▼][구분▼][결재문서] 네 칸, 양식명을 누르면 그 양식을 고친다,
              하단 [신규(F2)] 하나. 우리는 순서·양식코드·양식명·입력항목·기안서·사용·처리 일곱 칸이었다.
              [구분]은 양식의 기본 구분(기본값설정 › 구분, '구분검색' 01 지출결의서 · 02 휴가신청서 …)의 이름. 삭제는 양식을 열어서 한다.
            */}
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="w-[160px] text-center cursor-pointer text-ec-navy" onClick={() => tsort.toggle('정렬순서')}>정렬순서 {tsort.mark('정렬순서')}</th>
                  <th className="cursor-pointer text-ec-navy" onClick={() => tsort.toggle('양식명')}>양식명 {tsort.mark('양식명')}</th>
                  <th className="w-[200px] cursor-pointer text-ec-navy" onClick={() => tsort.toggle('구분')}>구분 {tsort.mark('구분')}</th>
                  <th className="w-[150px]">결재문서</th>
                </tr>
              </thead>
              <tbody>
                {tsort.sorted.length === 0 ? (
                  <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : tsort.sorted.map((t) => (
                  <tr key={t.id}>
                    <td className="text-center">{t.sortOrder}</td>
                    <td>
                      <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-left text-ec-navy"
                              onClick={() => setEditing(t)}>{t.name}{t.active ? '' : ' (사용중단)'}</button>
                    </td>
                    <td>{(t as WithGroup).groupName ?? ''}</td>
                    {/* 원본 [결재문서] — 휴가신청서는 '근태관리'. 양식 창 기본값목록 › 결재문서에서 고른다. */}
                    <td>{approvalDocOf(t.fieldSchema)}</td>
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
                    {companyTemplates.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
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

function TemplateForm({ template, onError, onClose, onSaved, onDelete, onCancel }: {
  template: ApprovalFormTemplateAdmin | null
  onError: (m: string) => void; onClose: () => void; onSaved: (name: string) => void
  /** 목록에서 [처리] 칸을 뺐으므로 삭제는 양식을 열어서 한다. */
  onDelete?: () => void
  /** 원본 [취소] — 고친 것을 버리고 불러온 값으로 되돌린다. */
  onCancel: () => void
}) {
  const isNew = template === null
  const schema0 = template?.fieldSchema ?? []
  // 표(table) 같은 편집 미지원 항목은 건드리지 않고 그대로 보존한다. 본문 서식(__body)은 [기안내용] 이 따로 다룬다.
  const preserved = formFieldsOf(schema0).filter((f) => !EDITABLE_TYPES.includes(f.type))
  const [code, setCode] = useState(template?.code ?? '')
  const [name, setName] = useState(template?.name ?? '')
  const [sortOrder, setSortOrder] = useState(String(template?.sortOrder ?? 0))
  const [active, setActive] = useState(template?.active ?? true)
  /** 원본 기본값설정 › 구분 — '구분검색'에서 고른 그룹코드. */
  const [groupCode, setGroupCode] = useState((template as WithGroup | null)?.groupCode ?? '')
  const [groups, setGroups] = useState<ApprovalGroup[]>([])
  /** 원본 [기안서확인시점설정] · [사용자별권한] — 창에서 [적용]/[저장] 하면 여기 담기고, 이 창의 [저장(F8)] 이 서버에 보낸다. */
  const inputs = template as (ApprovalFormTemplateAdmin & WithInputSettings) | null
  const [refTiming, setRefTiming] = useState<ViewTiming>(inputs?.referenceViewTiming ?? 'DEFAULT')
  const [shareTiming, setShareTiming] = useState<ViewTiming>(inputs?.shareViewTiming ?? 'DEFAULT')
  const [userPerms, setUserPerms] = useState<Record<string, 'ALLOW' | 'DENY'>>(inputs?.userPermissions ?? {})
  const [showTiming, setShowTiming] = useState(false)
  const [showPerms, setShowPerms] = useState(false)
  /** 원본 [상단 입력설정] — 기안내용 위 입력 칸(우리 field_schema)을 고치는 자리. 눌러야 펼친다. */
  const [showInputs, setShowInputs] = useState(false)
  /** 원본 오른쪽 아래 [기안내용] — 표로 된 본문 서식(휴 가 신 청 서 …). */
  const [bodyHtml, setBodyHtml] = useState(() => bodyHtmlOf(schema0))
  /** 원본 [결재문서] — '근태관리' 면 기안서작성에서 이 양식을 열 때 [근태입력] 창이 같이 뜬다. 빈 값 = 기안서. */
  const [approvalDoc, setApprovalDoc] = useState(() => approvalDocOf(schema0))
  /** 개발 서버 전용 — 같은 이름의 원본 양식 본문(features/approval/templates)이 있으면 [원본 양식 불러오기] 를 보인다. */
  const original = import.meta.env.DEV ? originalFormFor(name) : null
  async function loadOriginal() {
    if (!original) return
    if (bodyHtml.trim() !== '' && !(await ecConfirm(`[기안내용] 을 원본 '${original.name}' 서식으로 바꿉니다. 지금 내용은 사라집니다.`))) return
    setBodyHtml(original.html)
    if (original.approvalDoc) setApprovalDoc(original.approvalDoc)
  }
  useEffect(() => { fetchApprovalGroups().then(setGroups).catch(() => setGroups([])) }, [])
  const [fields, setFields] = useState<FieldRow[]>(
    schema0
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
    if (keys.includes(BODY_KEY)) return onError(`입력항목 키 '${BODY_KEY}' 는 기안내용이 씁니다. 다른 키를 쓰세요.`)
    if (keys.includes(DOC_KEY)) return onError(`입력항목 키 '${DOC_KEY}' 는 결재문서가 씁니다. 다른 키를 쓰세요.`)

    const schema: ApprovalField[] = withApprovalDoc(withBodyHtml([
      ...fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })),
      ...preserved,
    ], bodyHtml), approvalDoc)
    setSaving(true)
    try {
      const body = { code: code.toUpperCase(), name, sortOrder: Number(sortOrder) || 0, active, fieldSchema: schema, groupCode: groupCode || null,
        referenceViewTiming: refTiming, shareViewTiming: shareTiming, userPermissions: userPerms }
      if (isNew) await api.post('/approval-settings/templates', body)
      else await api.put(`/approval-settings/templates/${template.id}`, body)
      onSaved(name)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const groupName = groups.find((g) => g.code === groupCode)?.name ?? groupCode

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">
        {/* 원본은 양식을 열면 '입력화면설정' 창이다 */}
        {isNew ? '양식 추가' : '입력화면설정'}
      </div>
      {/*
        원본 입력화면설정(2026-10-30 실측): 왼쪽 [기본] 양식명 · 기본값설정 · 정렬순서 · 기안서작성시점설정 · 사용자별권한 ·
        권한그룹별권한 + [상단 입력설정], 오른쪽 기본값목록(일자 · 제목 · 결재라인 · 구분 · 출력양식 · 결재문서 · 첨부 · 라벨)과 [기안내용].
        양식코드 · 사용여부는 원본에 없지만 우리 서버가 쓰므로 [기본] 아래에 둔다.
      */}
      <div className="flex gap-[14px] items-start mobile:flex-col">
        <div className="w-[320px] shrink-0 mobile:w-full">
          <div className="text-[12.5px] font-bold text-ec-label mb-[6px]">기본</div>
          <div className="grid gap-[6px]">
            <SideField label="양식명 *">
              <input className="ec-input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="휴가신청서" />
            </SideField>
            <SideField label="기본값설정">
              <span className="text-ec-hint text-[12px] leading-[26px]">오른쪽 기본값목록</span>
            </SideField>
            <SideField label="정렬순서">
              <input className="ec-input w-[90px] text-right" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </SideField>
            {/* 원본 입력화면설정 › 기본 › [기안서확인시점설정] · [사용자별권한] — 글자 링크 '설정' 이 창을 연다. */}
            <SideField label="기안서확인시점설정">
              <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy h-[26px]" onClick={() => setShowTiming(true)}>설정</button>
            </SideField>
            <SideField label="사용자별권한">
              <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy h-[26px]" onClick={() => setShowPerms(true)}>
                설정{Object.keys(userPerms).length > 0 ? ` (${Object.keys(userPerms).length})` : ''}
              </button>
            </SideField>
            {/* 원본 [권한그룹별권한] — 권한그룹 설정이 서버에 아직 없어, 사용자별권한에 없는 사람은 모두 쓸 수 있다. */}
            <SideField label="권한그룹별권한">
              <span className="text-ec-hint text-[12px] leading-[26px]">전체 사용</span>
            </SideField>
            <SideField label="양식코드 *">
              <input className="ec-input w-[150px]" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                     placeholder="LEAVE" disabled={!isNew} />
            </SideField>
            <SideField label="사용여부">
              <select className="ec-input w-[100px]" value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
                <option value="1">사용</option>
                <option value="0">중지</option>
              </select>
            </SideField>
          </div>
          {!isNew && (
            <div className="text-[11.5px] text-ec-hint mt-[6px]">
              양식코드는 바꿀 수 없습니다(기안서 {template.documentCount}건이 이 코드를 가리킵니다).
            </div>
          )}
          <button type="button" className={`ec-btn mt-[10px]${showInputs ? ' ec-btn-primary' : ''}`} onClick={() => setShowInputs(true)}>
            상단 입력설정
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <table className="w-full text-left mb-[10px]">
            <thead>
              <tr><th className="w-[140px]">항목</th><th>기본값</th></tr>
            </thead>
            <tbody>
              <tr><td>일자</td><td className="text-ec-hint">기안일(오늘)</td></tr>
              <tr><td>제목</td><td className="text-ec-hint">{name || '양식명'}</td></tr>
              <tr><td>결재라인</td><td /></tr>
              <tr>
                <td>구분</td>
                <td>
                  {/* 원본 입력화면설정 › 기본값설정 › [구분] (직접지정 · 코드도움 '구분검색'). 비우면 미설정. */}
                  <ApprovalGroupField
                    value={groupCode ? { code: groupCode, name: groupName } : null}
                    onChange={(g) => { setGroupCode(g?.code ?? ''); fetchApprovalGroups().then(setGroups).catch(() => {}) }} />
                </td>
              </tr>
              <tr><td>출력양식</td><td>기안서</td></tr>
              <tr>
                <td>결재문서</td>
                <td>
                  <select className="ec-input w-[150px]" aria-label="결재문서" value={approvalDoc} onChange={(e) => setApprovalDoc(e.target.value)}>
                    <option value="">기안서</option>
                    {APPROVAL_DOCS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </td>
              </tr>
              <tr><td>첨부</td><td /></tr>
              <tr><td>라벨</td><td /></tr>
            </tbody>
          </table>

          <div className="flex items-center gap-[6px] mb-[4px]">
            <span className="text-[12.5px] font-bold text-ec-label">기안내용</span>
            {original && (
              <button type="button" className="ec-btn ec-btn-sm" title="개발용 — features/approval/templates 의 원본 이카운트 서식으로 채운다"
                      onClick={() => void loadOriginal()}>원본 양식 불러오기</button>
            )}
          </div>
          <RichBodyEditor value={bodyHtml} onChange={setBodyHtml} />
        </div>
      </div>

      {showTiming && <ViewTimingModal reference={refTiming} share={shareTiming} onClose={() => setShowTiming(false)}
                                      onApply={(v) => { setRefTiming(v.reference); setShareTiming(v.share); setShowTiming(false) }} />}
      {showPerms && <UserPermissionModal value={userPerms} onClose={() => setShowPerms(false)}
                                         onApply={(v) => { setUserPerms(v); setShowPerms(false) }} />}

      {showInputs && <Modal open title="상단 입력설정" width={780} onClose={() => setShowInputs(false)}>
      <div className="text-[14px] font-bold mb-[8px]">상단 입력설정</div>
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
              입력항목이 없으면 기안내용(본문)만으로 작성합니다.
            </td></tr>
          ) : fields.map((f, i) => (
            <tr key={i}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td><input className="ec-input w-full" value={f.key} onChange={(e) => setField(i, { key: e.target.value })} placeholder="startDate" /></td>
              <td><input className="ec-input w-full" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="시작일" /></td>
              <td>
                <select className="ec-input w-full" value={f.type} onChange={(e) => setField(i, { type: e.target.value as ApprovalFieldType })}>
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
            <tr key={`p-${i}`} className="bg-ec-page">
              <td className="text-center text-ec-hint">-</td>
              <td className="text-ec-hint">{f.key}</td>
              <td className="text-ec-hint">{f.label}</td>
              <td className="text-ec-hint">{TYPE_LABEL[f.type] ?? f.type}</td>
              <td colSpan={2} className="text-ec-hint text-[11.5px]">이 화면에서 편집하지 않고 그대로 보존합니다</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="ec-btn mt-[6px]" onClick={() => setFields((fs) => [...fs, { key: '', label: '', type: 'text', required: false }])}>+ 항목 추가</button>
      <div className="flex gap-[6px] mt-[14px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => setShowInputs(false)}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={() => setShowInputs(false)}>닫기</button>
      </div>
      </Modal>}

      {/* 원본 단추줄: 저장(F8) · 취소 · 리스트 · 닫기 · 삭제 */}
      <div className="flex gap-[6px] mt-[10px]">
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        <button className="ec-btn" onClick={onCancel}>취소</button>
        <button className="ec-btn" onClick={onClose}>리스트</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
        {onDelete && <button className="ec-btn" onClick={onDelete}>삭제</button>}
      </div>
    </div>
  )
}

/** 입력화면설정 왼쪽 [기본] 한 줄 — 이름표 · 값. label 로 감싸 이름표 글자로 칸을 찾게 한다. */
function SideField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-[8px] text-[12.5px]">
      <span className="w-[118px] shrink-0 text-ec-label">{label}</span>
      <span className="flex-1 min-w-0 flex items-center">{children}</span>
    </label>
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

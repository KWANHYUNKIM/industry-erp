import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { insuranceEmployeeColumns } from './employeeColumns'
import CodePickerField, { type CodeItem } from '../../components/CodePickerField'
import type { CodeColumn } from '../../components/CodeSearchModal'
import { api, extractErrorMessage } from '../../api/client'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { useRequired } from '../../utils/useRequired'
import { ACQUIRE_CODE_FIELDS, DEP_CODE_COLS, LOSS_CODE_FIELDS, type CodeList } from './codes'
import type { EmployeeMaster } from '../../types/api'
import WorkplaceModal from './WorkplaceModal'
import { REJECT_HEAD, type InsuranceKind, type InsuranceReport, type InsuranceWorkplace } from './types'
import EcDateInput from '../../components/ui/EcDateInput'
import { todayYmd } from '../../utils/periods'

/**
 * 4대보험취득신고입력(N001769) · 4대보험상실신고입력(N001770) · 피부양자자격신고입력(N001771) — 2026-10-14 loginaa 실측.
 *
 * 위: 일자-No. · 사업장 넷(하나를 고르면 넷이 같이 채워진다) · 사원 · 주민등록번호. 그 아래 보험마다 [신청구분 ☐보험] 판 —
 * 체크해야 그 판의 칸이 열린다. 피부양자는 3줄 격자. 아래 버튼줄 [저장(F8)] [다시 작성].
 * 빈 사업장으로 저장하면 원본은 '아래의 경우 처리가 불가능합니다.' 창에 [구분 20261014 · 메뉴 · 사항 '사업장명[기본값설정] 필수'] 를
 * 빈 사업장마다 한 줄씩 낸다.
 * 2026-10-24 원본 재측(QA관리-주민1 · 가짜 주민번호 900101-1000000 — 체크숫자가 틀려도 받는다):
 * - 주민등록번호 필수(사원을 고르면 사원등록의 번호가 '-' 없이 들어온다 — 우리 사원엔 번호가 없어 직접 친다). 비면 창 없이 빨간 테두리.
 * - 사원 이름칸은 고칠 수 있고 한글만 받는다(말풍선 '한글만 입력 가능합니다.') — 현황의 사원 열은 이 이름.
 * - 사업장 · 사원은 있는데 신청구분이 하나도 없으면 '알림' 창 '신청구분을 1개 이상 선택해 주세요.'
 * - 고용 · 산재 판을 켜면 1주소정근로시간 · 직종부호가 필수(빨간 테두리만).
 * - 피부양자: 격자가 비면 거절 창 [구분 · 메뉴 · 사유] '그리드(표)에 최소 1줄 이상 입력되어야 합니다.', 줄을 쓰면
 *   관계부호 · 취득/상실구분 · 취득/상실년월일 · 취득/상실사유가 필수(빨간 칸).
 * - 신규 저장 뒤 안내 없이 빈 입력 화면(일자만 남고 사업장도 비움), 수정 저장 · [삭제]('삭제하겠습니까?') 뒤 안내 없이 현황으로.
 * - 신고는 사원등록 [기타설정] 4대보험 · 급여 보험료를 바꾸지 않는다(취득 저장 뒤에도 '안함' 그대로).
 * 대상자주민등록번호 · 국적 · 체류자격 · 첨부는 칸만.
 */

type FieldType = 'text' | 'num' | 'yn' | 'month' | 'date'
interface Field { label: string; type?: FieldType }
type Row = [Field, Field | null]
type InsKey = 'pension' | 'health' | 'employment' | 'accident'
interface Block { key: InsKey; title: string; rows: Row[] }

const f = (label: string, type: FieldType = 'text'): Field => ({ label, type })
const INS: [InsKey, string][] = [['pension', '국민연금'], ['health', '건강보험'], ['employment', '고용보험'], ['accident', '산재보험']]

const ACQUIRE_BLOCKS: Block[] = [
  { key: 'pension', title: '국민연금', rows: [
    [f('취득일', 'date'), f('소득월액', 'num')], [f('취득월납부여부', 'yn'), f('취득부호')], [f('특수직종'), f('직역연금부호')]] },
  { key: 'health', title: '건강보험', rows: [
    [f('취득일', 'date'), f('보수월액', 'num')], [f('취득부호'), f('감면부호')],
    [f('공무원/교직원회계부호'), f('공무원/교직원직종부호')], [f('피부양자신청여부', 'yn'), null]] },
  { key: 'employment', title: '고용보험', rows: [
    [f('취득일', 'date'), f('월평균보수', 'num')], [f('1주소정근로시간', 'num'), f('직종부호')],
    [f('계약직여부', 'yn'), f('계약종료월', 'month')], [f('보험료부과구분부호'), f('보험료부과구분사유')]] },
  { key: 'accident', title: '산재보험', rows: [
    [f('취득일', 'date'), f('월평균보수', 'num')], [f('1주소정근로시간', 'num'), f('직종부호')],
    [f('계약직여부', 'yn'), f('계약종료월', 'month')], [f('보험료부과구분부호'), f('보험료부과구분사유')]] },
]
const LOSS_BLOCKS: Block[] = [
  { key: 'pension', title: '국민연금', rows: [[f('상실일', 'date'), f('상실부호')], [f('초일취득당월상실자납부여부', 'yn'), null]] },
  { key: 'health', title: '건강보험', rows: [
    [f('상실일', 'date'), f('상실부호')], [f('해당연도보수총액', 'num'), f('해당연도근무월수', 'num')],
    [f('전년도보수총액', 'num'), f('전년도근무월수', 'num')]] },
  { key: 'employment', title: '고용보험', rows: [
    [f('상실일', 'date'), null], [f('상실사유코드'), f('상실사유구체적사유')], [f('해당연도보수총액', 'num'), f('전년도보수총액', 'num')]] },
  { key: 'accident', title: '산재보험', rows: [[f('상실일', 'date'), null], [f('해당연도보수총액', 'num'), f('전년도보수총액', 'num')]] },
]

const DEP_COLS_ACQUIRE = ['대상자성명', '대상자주민등록번호', '관계부호', '장애인/국가유공자여부', '종별', '등급', '등록일자', '국적', '체류자격', '시작일자', '종료일자', '첨부']
const DEP_COLS_DEPENDENT = ['대상자성명', '대상자주민등록번호', '관계부호', '취득/상실구분', '취득/상실년월일', '취득/상실사유', '장애인/국가유공자여부', '종별', '등급', '등록일자', '국적', '체류자격', '시작일자', '종료일자', '첨부']
/** 파일 칸 — 칸만 둔다(대상자주민등록번호는 원본처럼 받는다 — 체크숫자 안 봄). */
const LOCKED_COLS = new Set(['첨부'])
const YN_COLS = new Set(['장애인/국가유공자여부'])

const TITLES: Record<InsuranceKind, string> = { ACQUIRE: '4대보험취득신고입력', LOSS: '4대보험상실신고입력', DEPENDENT: '피부양자자격신고입력' }
const MENU_CODE = (d: string) => d.replaceAll('-', '')
const HANGUL = /^[가-힣]+$/
/** 피부양자 줄에 값이 있으면 이 넷이 필수(원본 빨간 칸). */
const DEP_REQUIRED = ['관계부호', '취득/상실구분', '취득/상실년월일', '취득/상실사유']
const DEP_DATE_COLS = new Set(['취득/상실년월일'])

type DepRow = Record<string, string>
const emptyDeps = (): DepRow[] => [{}, {}, {}]

interface FormState {
  reportDate: string
  workplaceId: string
  employeeId: string
  phone: string
  residentNo: string
  reportName: string
  apply: Record<InsKey, boolean>
  dates: Record<InsKey, string>
  detail: Record<string, string>
  deps: DepRow[]
}
const emptyForm = (): FormState => ({
  reportDate: todayYmd(), workplaceId: '', employeeId: '', phone: '', residentNo: '', reportName: '',
  apply: { pension: false, health: false, employment: false, accident: false },
  dates: { pension: '', health: '', employment: '', accident: '' },
  detail: {}, deps: emptyDeps(),
})

const WORKPLACE_COLUMNS: CodeColumn[] = [
  { head: '사업장명', width: 240, cell: (i) => i.name, link: true },
  { head: '사업장관리번호', width: 240, cell: (i) => i.code, link: true },
  { head: '사업장전화번호', width: 240, cell: (i) => i.sub ?? '' },
  { head: '사업자등록번호', width: 240, cell: () => '' },
]

export default function InsuranceReportForm({ kind }: { kind: InsuranceKind }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('id')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [seqText, setSeqText] = useState('')
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [workplaces, setWorkplaces] = useState<InsuranceWorkplace[]>([])
  const [wpOpen, setWpOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const req = useRequired()
  const codeFields: Record<string, CodeList> = kind === 'ACQUIRE' ? ACQUIRE_CODE_FIELDS : kind === 'LOSS' ? LOSS_CODE_FIELDS : {}

  const blocks = kind === 'ACQUIRE' ? ACQUIRE_BLOCKS : kind === 'LOSS' ? LOSS_BLOCKS : []
  const depCols = kind === 'DEPENDENT' ? DEP_COLS_DEPENDENT : DEP_COLS_ACQUIRE

  const loadWorkplaces = () =>
    api.get<InsuranceWorkplace[]>('/hr/insurance/workplaces').then((r) => setWorkplaces(r.data)).catch(() => setWorkplaces([]))
  useEffect(() => {
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    loadWorkplaces()
  }, [])

  useEffect(() => {
    if (!editId) { setForm(emptyForm()); setSeqText(''); return }
    api.get<InsuranceReport>(`/hr/insurance/reports/${editId}`).then(({ data: r }) => {
      let detail: Record<string, string> = {}
      let deps: DepRow[] = emptyDeps()
      try { detail = r.detail ? JSON.parse(r.detail) : {} } catch { detail = {} }
      try { deps = r.dependents ? JSON.parse(r.dependents) : emptyDeps() } catch { deps = emptyDeps() }
      setForm({
        reportDate: r.reportDate,
        workplaceId: String((r.healthWorkplace ?? r.pensionWorkplace)?.id ?? ''),
        employeeId: String(r.employeeId), phone: r.phone ?? '', residentNo: r.residentNo ?? '', reportName: r.reportName ?? r.employeeName,
        apply: { pension: r.pensionApply, health: r.healthApply, employment: r.employmentApply, accident: r.accidentApply },
        dates: { pension: r.pensionDate ?? '', health: r.healthDate ?? '', employment: r.employmentDate ?? '', accident: r.accidentDate ?? '' },
        detail, deps,
      })
      setSeqText(String(r.reportSeq))
    }).catch((e) => setError(extractErrorMessage(e)))
  }, [editId])

  const wpItems: CodeItem[] = useMemo(() => workplaces.filter((w) => w.active || String(w.id) === form.workplaceId)
    .map((w) => ({ value: String(w.id), code: w.manageNo, name: w.name, sub: w.phone })), [workplaces, form.workplaceId])
  const empItems: CodeItem[] = useMemo(() => employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name })), [employees])

  const setDetail = (k: string, v: string) => setForm((p) => ({ ...p, detail: { ...p.detail, [k]: v } }))
  const setDep = (i: number, col: string, v: string) =>
    setForm((p) => ({ ...p, deps: p.deps.map((d, j) => (j === i ? { ...d, [col]: v } : d)) }))

  const rejectWindow = (head: string, lines: string[]) =>
    ecAlert(`${REJECT_HEAD}\n\n구분 · 메뉴 · ${head}\n${lines.map((m) => `${MENU_CODE(form.reportDate)}  ${TITLES[kind]}  ${m}`).join('\n')}`)
  const depFilled = (d: DepRow) => Object.values(d).some(Boolean)

  async function save() {
    setError(null)
    const wp = form.workplaceId ? Number(form.workplaceId) : null
    const dependent = kind === 'DEPENDENT'
    // 원본 차례(2026-10-24): 빈 사업장 → 거절 창(사원 · 주민번호 칸도 같이 빨갛게) → 사원 · 주민번호 → 이름 한글 → 신청구분 → 판 필수칸
    const base = { workplace: !!form.workplaceId, employee: !!form.employeeId, resident: !!form.residentNo.replace(/\D/g, '') }
    if (!form.workplaceId) {
      req.check(base)
      void rejectWindow('사항', Array(dependent ? 1 : 4).fill('사업장명[기본값설정] 필수'))
      return
    }
    if (!req.check(base)) return
    if (!HANGUL.test(form.reportName.trim())) { req.check({ name: false }); return }
    if (!dependent && !Object.values(form.apply).some(Boolean)) { void ecAlert('신청구분을 1개 이상 선택해 주세요.'); return }
    const must: Record<string, boolean> = {}
    for (const k of ['employment', 'accident'] as InsKey[]) {
      if (!form.apply[k]) continue
      must[`${k}.1주소정근로시간`] = !!form.detail[`${k}.1주소정근로시간`]
      must[`${k}.직종부호`] = !!form.detail[`${k}.직종부호`]
    }
    if (dependent) {
      if (!form.deps.some(depFilled)) { void rejectWindow('사유', ['그리드(표)에 최소 1줄 이상 입력되어야 합니다.']); return }
      form.deps.forEach((d, i) => { if (depFilled(d)) DEP_REQUIRED.forEach((c) => { must[`dep${i}.${c}`] = !!d[c] }) })
    }
    if (!req.check(must)) return
    const body = {
      reportDate: form.reportDate, kind,
      employeeId: form.employeeId ? Number(form.employeeId) : null,
      pensionWorkplaceId: dependent ? null : wp, healthWorkplaceId: wp,
      employmentWorkplaceId: dependent ? null : wp, accidentWorkplaceId: dependent ? null : wp,
      pensionApply: form.apply.pension, pensionDate: form.apply.pension ? form.dates.pension || null : null,
      healthApply: form.apply.health, healthDate: form.apply.health ? form.dates.health || null : null,
      employmentApply: form.apply.employment, employmentDate: form.apply.employment ? form.dates.employment || null : null,
      accidentApply: form.apply.accident, accidentDate: form.apply.accident ? form.dates.accident || null : null,
      phone: form.phone,
      detail: Object.keys(form.detail).length ? JSON.stringify(form.detail) : null,
      dependents: form.deps.some(depFilled) ? JSON.stringify(form.deps) : null,
      residentNo: form.residentNo.replace(/\D/g, ''), reportName: form.reportName.trim(),
    }
    setSaving(true)
    try {
      if (editId) await api.put(`/hr/insurance/reports/${editId}`, body)
      else await api.post('/hr/insurance/reports', body)
      if (editId) navigate('/hr/insurance/reports')
      else { setForm({ ...emptyForm(), reportDate: form.reportDate }); setSeqText('') }
    } catch (e) {
      const msg = extractErrorMessage(e)
      if (/사업장명/.test(msg)) void rejectWindow('사항', msg.split('\n'))
      else if (/그리드/.test(msg)) void rejectWindow('사유', [msg])
      else if (/신청구분/.test(msg)) void ecAlert(msg)
      else setError(msg)
    } finally {
      setSaving(false)
    }
  }

  /** 수정 창 [삭제] — 원본 '삭제하겠습니까?' 뒤 안내 없이 현황으로(현황 [선택삭제] 와 같은 삭제 표시). */
  async function remove() {
    if (!editId || !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      await api.post('/hr/insurance/reports/delete', [Number(editId)])
      navigate('/hr/insurance/reports')
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  const wpField = (label: string) => (
    <li key={label}>
      <span className="title">{label}</span>
      <div className="form">
        <CodePickerField label={label} hideLabel fill pair placeholder={label} value={form.workplaceId} items={wpItems}
                         columns={WORKPLACE_COLUMNS} popupTitle="사업장관리검색" onNew={() => setWpOpen(true)}
                         onChange={(v) => setForm((p) => ({ ...p, workplaceId: v }))} />
      </div>
    </li>
  )

  const input = (key: string, fld: Field, disabled: boolean) => {
    const v = form.detail[key] ?? ''
    if (fld.type === 'yn') {
      const val = v || 'N'
      return (
        <span className="inline-flex items-center gap-[10px]">
          {['Y', 'N'].map((o) => (
            <label key={o} className="inline-flex items-center gap-[3px]">
              <input type="radio" disabled={disabled} checked={val === o} onChange={() => setDetail(key, o)} />{o}
            </label>
          ))}
        </span>
      )
    }
    const codes = codeFields[key]
    if (codes) {
      return (
        <CodePickerField label={fld.label} hideLabel fill pair placeholder={fld.label} disabled={disabled} value={v}
                         items={codes.map(([c, n]) => ({ value: c, code: c, name: n }))} popupTitle={fld.label}
                         onChange={(val) => setDetail(key, val)} />
      )
    }
    if (fld.type === 'month') return <input type="month" className="ec-input w-[150px]" disabled={disabled} value={v} onChange={(e) => setDetail(key, e.target.value)} />
    return (
      <div className={`w-full ${req.cls(key, !!v)}`}>
        <input className={`ec-input w-full${fld.type === 'num' ? ' text-right' : ''}`} disabled={disabled} placeholder={fld.label}
               value={v} onChange={(e) => setDetail(key, e.target.value)} />
      </div>
    )
  }

  const cell = (b: Block, fld: Field | null, idx: number) => {
    if (!fld) return <li key={`${b.key}-e${idx}`} />
    const on = form.apply[b.key]
    if (fld.type === 'date') {
      return (
        <li key={`${b.key}-${fld.label}`}>
          <span className="title">{fld.label}</span>
          <div className="form">
            <EcDateInput className="ec-input w-[150px]" disabled={!on} value={form.dates[b.key]} onChange={(e) => setForm((p) => ({ ...p, dates: { ...p.dates, [b.key]: e.target.value } }))} />
          </div>
        </li>
      )
    }
    return (
      <li key={`${b.key}-${fld.label}`}>
        <span className="title">{fld.label}</span>
        <div className="form">{input(`${b.key}.${fld.label}`, fld, !on)}</div>
      </li>
    )
  }

  const depGridOn = kind === 'DEPENDENT' || (form.apply.health && form.detail['health.피부양자신청여부'] === 'Y')

  return (
    <EcListShell
      title={TITLES[kind]}
      searchable={false}
      actions={editId ? [
        { label: saving ? '저장 중…' : '저장(F8)', primary: true, onClick: save },
        { label: '삭제', onClick: remove },
        { label: '닫기', onClick: () => navigate('/hr/insurance/reports') },
      ] : [
        { label: saving ? '저장 중…' : '저장(F8)', primary: true, onClick: save },
        { label: '다시 작성', onClick: () => { setForm(emptyForm()); setSeqText(''); setError(null) } },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-form mb-[8px] [&>li>.title]:basis-[158px]">
        <li>
          <span className="title">일자-No.</span>
          <div className="form">
            <EcDateInput className="ec-input w-[150px]" value={form.reportDate} disabled={!!editId} onChange={(e) => setForm((p) => ({ ...p, reportDate: e.target.value }))} />
            {seqText && <span>-{seqText}</span>}
          </div>
        </li>
        {kind === 'DEPENDENT' ? (
          <>
            <li />
            {wpField('건강보험사업장')}
          </>
        ) : (
          <>
            <li />
            {INS.map(([, t]) => wpField(`${t}사업장`))}
          </>
        )}
        <li>
          <span className="title">사원</span>
          <div className="form">
            {/* 원본 [코드][🔍][이름] 의 이름칸은 고칠 수 있다(한글만) — 공용 칸의 읽기 전용 이름칸 · × 를 감추고 우리 이름칸을 붙인다 */}
            <div className="flex w-full [&_.ec-input.name]:hidden [&_.ec-code>button~button]:hidden">
              <CodePickerField label="사원" hideLabel fill pair plain placeholder="사원" value={form.employeeId} items={empItems} columns={insuranceEmployeeColumns(employees)}
                               invalid={req.on('employee', !!form.employeeId)}
                               onChange={(v, item) => setForm((p) => ({ ...p, employeeId: v, reportName: item?.name ?? '' }))} />
              <div className={`flex-1 ${req.cls('name', HANGUL.test(form.reportName.trim()))}`} title={req.on('name', HANGUL.test(form.reportName.trim())) ? '한글만 입력 가능합니다.' : undefined}>
                <input className="ec-input w-full" placeholder="사원" value={form.reportName}
                       onChange={(e) => setForm((p) => ({ ...p, reportName: e.target.value }))} />
              </div>
            </div>
            {req.on('name', HANGUL.test(form.reportName.trim())) && <span className="text-ec-danger ml-[6px] whitespace-nowrap">한글만 입력 가능합니다.</span>}
          </div>
        </li>
        <li>
          <span className="title">주민등록번호</span>
          <div className={`form ${req.cls('resident', !!form.residentNo.replace(/\D/g, ''))}`}>
            <input className="ec-input w-full" placeholder="주민등록번호" maxLength={14} value={form.residentNo}
                   onChange={(e) => setForm((p) => ({ ...p, residentNo: e.target.value }))} />
          </div>
        </li>
        {kind === 'ACQUIRE' && (
          <>
            <li><span className="title">국적</span><div className="form"><input className="ec-input w-full" disabled placeholder="국적" /></div></li>
            <li><span className="title">체류자격</span><div className="form"><input className="ec-input w-full" disabled placeholder="체류자격" /></div></li>
            <li><span className="title">대표자여부</span><div className="form">{input('대표자여부', f('대표자여부', 'yn'), false)}</div></li>
            <li><span className="title">첨부</span><div className="form"><input className="ec-input w-full" disabled /></div></li>
          </>
        )}
        {kind !== 'ACQUIRE' && (
          <>
            <li>
              <span className="title">전화번호</span>
              <div className="form"><input className="ec-input w-full" placeholder="전화번호" value={form.phone}
                                           onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
            </li>
            {kind === 'LOSS' && <li><span className="title">첨부</span><div className="form"><input className="ec-input w-full" disabled /></div></li>}
          </>
        )}
        {blocks.map((b) => (
          <BlockRows key={b.key} b={b} on={form.apply[b.key]}
                     onToggle={(v) => setForm((p) => ({ ...p, apply: { ...p.apply, [b.key]: v } }))}
                     cells={b.rows.flatMap(([l, r], i) => [cell(b, l, i * 2), cell(b, r, i * 2 + 1)])} />
        ))}
      </ul>
      <div className="overflow-x-auto">
        <table className="ec-list-grid">
          <thead>
            <tr><th className="w-[25px]" />{depCols.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {form.deps.map((d, i) => (
              <tr key={i}>
                <td className="text-center">{i + 1}</td>
                {depCols.map((c) => (
                  <td key={c} className={YN_COLS.has(c) ? 'text-center' : undefined}>
                    {YN_COLS.has(c)
                      ? (d[c] || 'N')
                      : (
                        <div className={req.cls(`dep${i}.${c}`, !!d[c])}>
                          {DEP_CODE_COLS[c] && !(kind !== 'DEPENDENT' && c !== '관계부호') ? (
                            <select className="ec-input w-full min-w-[100px]" disabled={!depGridOn} value={d[c] ?? ''} onChange={(e) => setDep(i, c, e.target.value)}>
                              <option value="" />
                              {DEP_CODE_COLS[c].map(([code, name]) => <option key={code} value={code}>{code} {name}</option>)}
                            </select>
                          ) : DEP_DATE_COLS.has(c) ? (
                            <EcDateInput className="ec-input w-full min-w-[120px]" disabled={!depGridOn} value={d[c] ?? ''} onChange={(e) => setDep(i, c, e.target.value)} />
                          ) : (
                            <input className="ec-input w-full min-w-[80px]" disabled={!depGridOn || LOCKED_COLS.has(c)}
                                   value={LOCKED_COLS.has(c) ? '' : d[c] ?? ''} onChange={(e) => setDep(i, c, e.target.value)} />
                          )}
                        </div>
                      )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wpOpen && <WorkplaceModal startNew onClose={() => { setWpOpen(false); loadWorkplaces() }} />}
    </EcListShell>
  )
}

function BlockRows({ b, on, onToggle, cells }: { b: Block; on: boolean; onToggle: (v: boolean) => void; cells: React.ReactNode[] }) {
  return (
    <>
      <li className="wide">
        <span className="title">신청구분</span>
        <div className="form">
          <label className="inline-flex items-center gap-[4px]">
            <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />{b.title}
          </label>
        </div>
      </li>
      {cells}
    </>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField, { type CodeItem } from '../../components/CodePickerField'
import type { CodeColumn } from '../../components/CodeSearchModal'
import { api, extractErrorMessage } from '../../api/client'
import { ecAlert } from '../../components/EcDialog'
import type { EmployeeMaster } from '../../types/api'
import WorkplaceModal from './WorkplaceModal'
import { REJECT_HEAD, type InsuranceKind, type InsuranceReport, type InsuranceWorkplace } from './types'

/**
 * 4대보험취득신고입력(N001769) · 4대보험상실신고입력(N001770) · 피부양자자격신고입력(N001771) — 2026-10-14 loginaa 실측.
 *
 * 위: 일자-No. · 사업장 넷(하나를 고르면 넷이 같이 채워진다) · 사원 · 주민등록번호. 그 아래 보험마다 [신청구분 ☐보험] 판 —
 * 체크해야 그 판의 칸이 열린다. 피부양자는 3줄 격자. 아래 버튼줄 [저장(F8)] [다시 작성].
 * 빈 사업장으로 저장하면 원본은 '아래의 경우 처리가 불가능합니다.' 창에 [구분 20261014 · 메뉴 · 사항 '사업장명[기본값설정] 필수'] 를
 * 빈 사업장마다 한 줄씩 낸다.
 * 주민등록번호 · 대상자주민등록번호는 개인정보라 칸만 두고 받지 않는다(사용자 결정 대기). 국적 · 체류자격 · 첨부도 칸만.
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
/** 개인정보 · 파일 칸 — 칸만 둔다. */
const LOCKED_COLS = new Set(['대상자주민등록번호', '첨부'])
const YN_COLS = new Set(['장애인/국가유공자여부'])

const TITLES: Record<InsuranceKind, string> = { ACQUIRE: '4대보험취득신고입력', LOSS: '4대보험상실신고입력', DEPENDENT: '피부양자자격신고입력' }
const MENU_CODE = (d: string) => d.replaceAll('-', '')

type DepRow = Record<string, string>
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const emptyDeps = (): DepRow[] => [{}, {}, {}]

interface FormState {
  reportDate: string
  workplaceId: string
  employeeId: string
  phone: string
  apply: Record<InsKey, boolean>
  dates: Record<InsKey, string>
  detail: Record<string, string>
  deps: DepRow[]
}
const emptyForm = (): FormState => ({
  reportDate: today(), workplaceId: '', employeeId: '', phone: '',
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
        employeeId: String(r.employeeId), phone: r.phone ?? '',
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

  async function save() {
    setError(null)
    const wp = form.workplaceId ? Number(form.workplaceId) : null
    const dependent = kind === 'DEPENDENT'
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
      dependents: form.deps.some((d) => Object.values(d).some(Boolean)) ? JSON.stringify(form.deps) : null,
    }
    setSaving(true)
    try {
      if (editId) await api.put(`/hr/insurance/reports/${editId}`, body)
      else await api.post('/hr/insurance/reports', body)
      if (editId) navigate('/hr/insurance/reports')
      else { setForm({ ...emptyForm(), reportDate: form.reportDate, workplaceId: form.workplaceId }); setSeqText('') }
    } catch (e) {
      const msg = extractErrorMessage(e)
      if (/필수/.test(msg)) {
        void ecAlert(`${REJECT_HEAD}\n\n구분 · 메뉴 · 사항\n${msg.split('\n').map((m) => `${MENU_CODE(form.reportDate)}  ${TITLES[kind]}  ${m}`).join('\n')}`)
      } else setError(msg)
    } finally {
      setSaving(false)
    }
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
    if (fld.type === 'month') return <input type="month" className="ec-input w-[150px]" disabled={disabled} value={v} onChange={(e) => setDetail(key, e.target.value)} />
    return <input className={`ec-input w-full${fld.type === 'num' ? ' text-right' : ''}`} disabled={disabled} placeholder={fld.label}
                  value={v} onChange={(e) => setDetail(key, e.target.value)} />
  }

  const cell = (b: Block, fld: Field | null, idx: number) => {
    if (!fld) return <li key={`${b.key}-e${idx}`} />
    const on = form.apply[b.key]
    if (fld.type === 'date') {
      return (
        <li key={`${b.key}-${fld.label}`}>
          <span className="title">{fld.label}</span>
          <div className="form">
            <input type="date" className="ec-input w-[150px]" disabled={!on} value={form.dates[b.key]}
                   onChange={(e) => setForm((p) => ({ ...p, dates: { ...p.dates, [b.key]: e.target.value } }))} />
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
      actions={[
        { label: saving ? '저장 중…' : '저장(F8)', primary: true, onClick: save },
        { label: '다시 작성', onClick: () => { setForm(emptyForm()); setSeqText(''); setError(null) } },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-form mb-[8px] [&>li>.title]:basis-[158px]">
        <li>
          <span className="title">일자-No.</span>
          <div className="form">
            <input type="date" className="ec-input w-[150px]" value={form.reportDate} disabled={!!editId}
                   onChange={(e) => setForm((p) => ({ ...p, reportDate: e.target.value }))} />
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
            <CodePickerField label="사원" hideLabel fill pair plain placeholder="사원" value={form.employeeId} items={empItems}
                             onChange={(v) => setForm((p) => ({ ...p, employeeId: v }))} />
          </div>
        </li>
        <li>
          <span className="title">주민등록번호</span>
          <div className="form"><input className="ec-input w-full" disabled placeholder="주민등록번호" /></div>
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
                      : <input className="ec-input w-full min-w-[80px]" disabled={!depGridOn || LOCKED_COLS.has(c)}
                               value={LOCKED_COLS.has(c) ? '' : d[c] ?? ''} onChange={(e) => setDep(i, c, e.target.value)} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wpOpen && <WorkplaceModal onClose={() => { setWpOpen(false); loadWorkplaces() }}
                                 onPick={(w) => { setForm((p) => ({ ...p, workplaceId: String(w.id) })); setWpOpen(false); loadWorkplaces() }} />}
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

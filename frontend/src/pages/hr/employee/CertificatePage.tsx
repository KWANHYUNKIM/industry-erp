import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import EcPeriodPicks, { INQUIRY_PICKS } from '../../../components/EcPeriodPicks'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import Modal from '../../../components/Modal'
import CertificateDoc, { type CertificateDocData, type CompanyInfo } from '../../../features/certificate/components/CertificateDoc'
import { CERTIFICATE_KINDS, type Certificate, type CertificateKind } from '../../../features/certificate/types'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import type { EmployeeMaster } from '../../../types/api'
import { ymd } from '../../../utils/periods'
import { ecConfirm } from '../../../components/EcDialog'
import EcIcon from '../../../components/ui/EcIcon'
import EcDateInput, { EcDateRange } from '../../../components/ui/EcDateInput'

interface Form { kind: CertificateKind | ''; employeeId: string; purpose: string; issueDate: string }
/** 원본 '====' 은 재직증명서 판으로 그린다(2026-10-14 실측). */
const docKindName = (kind: CertificateKind | '' | null) => CERTIFICATE_KINDS.find(([k]) => k === (kind || 'EMPLOYMENT'))![1]
const blankForm = (): Form => ({ kind: '', employeeId: '', purpose: '', issueDate: ymd(new Date()) })

/**
 * 관리 &gt; 인사관리 &gt; 인사관리현황 &gt; <b>각종증명서인쇄</b> (원본 E020606).
 *
 * <p>2026-10-03 loginaa 에서 발급하고 지워 본 그대로:
 * <ul>
 *   <li>[전체] 알약 · 격자 발행번호 · 사원번호 · 성명 · 증명서종류 · 용도 · 발행일 · 인쇄(줄마다 [인쇄]) — 최근 발행이 위.
 *       버튼 신규(F2) · 인쇄 ▲ · 선택삭제('삭제하시겠습니까?').</li>
 *   <li>[신규(F2)] '각종증명서등록' 창: 증명서종류(==== · 재직증명서 · 퇴직증명서 · 경력증명서) · 사원번호(코드도움) · 용도 ·
 *       발행일(오늘) · ▸ 증명서 확인(펴면 증명서가 보인다) · 저장(F8)▴ · 다시 작성 · 닫기. 저장하면 안내 없이 닫히고 목록 맨 위에
 *       2026-1 꼴 발행번호(발행일의 해 - 그해 차례)로 붙는다.</li>
 *   <li>2026-10-14 다시 잼: 필수는 사원번호 하나 — 비우고 저장하면 문구 없이 그 칸 테두리만 빨갛다. 증명서종류를 '====' 로 두면 그대로
 *       저장되어 목록 증명서종류가 '없음'(증명서 판은 재직증명서 꼴). 재직 중인 사원도 퇴직증명서로 저장된다.
 *       저장 ▴ 메뉴는 '저장/전표(F7)' 하나 — 저장하고 창을 닫은 뒤 인쇄 창을 띄운다(그 창의 인쇄는 누르지 않았다).
 *       발행번호를 클릭하면 '각종증명서수정' 창(증명서 확인이 펴져 있음) · 저장(F8)▴ · 다시 작성 · 삭제 · 닫기, 삭제 '삭제하겠습니까?' →
 *       안내 없이 닫힘. 목록 [선택삭제] 도 '삭제하겠습니까?'. 마지막 번호를 지우면 그 번호를 다시 쓴다(2026-1 지움 → 새 것도 2026-1).</li>
 * </ul>
 * 조건 판은 접혀 있고 [Search(F3)]로 편다(2026-10-04 실측) — 증명서종류(전체 · 재직 · 퇴직 · 경력) · 발행일([사용]) · 사원번호 ·
 * 용도 · 발송여부. 발송여부(Email 발송 기록)는 메일을 보내지 않아 두지 않는다.
 * 원본 '증명서 확인' 은 편집기라 글자를 고쳐 저장할 수 있다 — 우리는 사원의 지금 값으로 그리기만 한다. [인쇄 ▲] 펼침 항목은 못 쟀다.
 */
export default function CertificatePage() {
  const [rows, setRows] = useState<Certificate[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [error, setError] = useState('')
  const [quick, setQuick] = useState('')
  const [kindCond, setKindCond] = useState<CertificateKind | ''>('')
  const [useIssueDate, setUseIssueDate] = useState(false)
  const [issueRange, setIssueRange] = useState({ from: ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: ymd(new Date()) })
  const [empCond, setEmpCond] = useState<string[]>([])
  const [purposeCond, setPurposeCond] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(blankForm())
  const [preview, setPreview] = useState(false)
  const [empBad, setEmpBad] = useState(false)
  const [saveMenu, setSaveMenu] = useState(false)
  const [printing, setPrinting] = useState<Certificate[]>([])
  const tableRef = useRef<HTMLTableElement>(null)

  function load() {
    setError('')
    api.get<Certificate[]>('/hr/certificates').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    load()
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<CompanyInfo | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  const shown = rows.filter((r) => (!quick || r.employeeName.includes(quick) || r.employeeCode.includes(quick) || r.issueNo.includes(quick))
    && (!kindCond || r.kind === kindCond)
    && (!useIssueDate || (r.issueDate >= issueRange.from && r.issueDate <= issueRange.to))
    && (empCond.length === 0 || empCond.includes(String(r.employeeId)))
    && (!purposeCond || (r.purpose ?? '').includes(purposeCond)))
  useTableColumnCheck(tableRef, '각종증명서인쇄', [shown.length])
  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id))

  function openNew() {
    setEditId(null); setForm(blankForm()); setFormError(''); setEmpBad(false); setSaveMenu(false); setPreview(false); setFormOpen(true)
  }
  function openEdit(c: Certificate) {
    setEditId(c.id)
    setForm({ kind: c.kind ?? '', employeeId: String(c.employeeId), purpose: c.purpose ?? '', issueDate: c.issueDate })
    // 원본 수정 창은 증명서 확인이 펴진 채 열린다.
    setFormError(''); setEmpBad(false); setSaveMenu(false); setPreview(true); setFormOpen(true)
  }

  // 창이 떠 있을 때 F8 = 저장, F7 = 저장/전표(원본 단축키).
  const saveRef = useRef<(print?: boolean) => Promise<void>>(async () => {})
  useEffect(() => {
    if (!formOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F8' || e.key === 'F7') { e.preventDefault(); void saveRef.current(e.key === 'F7') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [formOpen])

  /** 저장(F8) · 저장/전표(F7). 전표는 저장한 증명서로 인쇄 창을 띄운다. */
  async function save(print = false) {
    setSaveMenu(false)
    // 원본: 사원번호만 필수 — 문구 없이 그 칸 테두리만 빨갛다. 증명서종류 '====' 는 그대로 저장('없음').
    if (!form.employeeId) { setEmpBad(true); return }
    const body = { kind: form.kind || null, employeeId: Number(form.employeeId), purpose: form.purpose || null, issueDate: form.issueDate }
    try {
      const r = editId ? await api.put<Certificate>(`/hr/certificates/${editId}`, body) : await api.post<Certificate>('/hr/certificates', body)
      setFormOpen(false)
      load()
      if (print) setPrinting([r.data])
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  saveRef.current = save

  /** 수정 창 [삭제] — 원본 '삭제하겠습니까?' → 안내 없이 닫힌다. */
  async function deleteEditing() {
    if (!editId || !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      await api.delete(`/hr/certificates/${editId}`)
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function deleteChecked() {
    if (checked.size === 0 || !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const id of checked) await api.delete(`/hr/certificates/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const docOf = (c: Pick<Certificate, 'issueNo' | 'kind' | 'employeeName' | 'address' | 'department' | 'jobTitle' | 'hireDate' | 'resignDate' | 'purpose' | 'issueDate'>): CertificateDocData => ({
    // 재직증명서('====' 포함)는 발행일까지. 경력증명서는 퇴사일까지 — 아직 다니면 비운다(원본 '2019년 01월 05일~', 2026-10-04 실측).
    ...c, kindName: docKindName(c.kind), endDate: !c.kind || c.kind === 'EMPLOYMENT' ? c.issueDate : c.resignDate,
  })
  const formEmp = employees.find((e) => String(e.id) === form.employeeId)
  const editing = rows.find((r) => r.id === editId)
  const formDoc: CertificateDocData | null = formEmp ? docOf({
    issueNo: editing?.issueNo ?? '', kind: form.kind || null,
    employeeName: formEmp.name, address: formEmp.address ?? null, department: formEmp.department, jobTitle: formEmp.jobTitle,
    hireDate: formEmp.hireDate, resignDate: formEmp.resignDate, purpose: form.purpose, issueDate: form.issueDate,
  }) : null

  return (
    <EcListShell
      title="각종증명서인쇄"
      collapseConditions
      search={quick}
      onSearchChange={setQuick}
      onSearch={load}
      onNew={openNew}
      actions={[
        { label: '인쇄', onClick: () => setPrinting(rows.filter((r) => checked.has(r.id))), disabled: checked.size === 0 },
        { label: '선택삭제', onClick: deleteChecked, selected: checked.size },
      ]}
    >
      <ul className="ec-cond mb-[8px]">
        <EcCond label="증명서종류">
          <select className="ec-input w-full" value={kindCond} onChange={(e) => setKindCond(e.target.value as CertificateKind | '')}>
            <option value="">전체</option>
            {CERTIFICATE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </EcCond>
        <EcCond label="발행일">
          {useIssueDate && (
            <>
              <EcDateRange from={{ className: "ec-input w-[150px]", 'aria-label': "발행일 시작", value: issueRange.from, onChange: (e) => setIssueRange({ ...issueRange, from: e.target.value }) }} to={{ className: "ec-input w-[150px]", 'aria-label': "발행일 끝", value: issueRange.to, onChange: (e) => setIssueRange({ ...issueRange, to: e.target.value }) }} />
            </>
          )}
          <label className="inline-flex items-center gap-[4px] ml-[6px]">
            <input type="checkbox" checked={useIssueDate} onChange={(e) => setUseIssueDate(e.target.checked)} /> 사용
          </label>
        </EcCond>
        <EcCond label="사원번호">
          <CodePickerField label="사원번호" hideLabel fill multiple placeholder="사원번호" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))} />
        </EcCond>
        <EcCond label="용도"><input className="ec-input w-full" placeholder="용도" value={purposeCond} onChange={(e) => setPurposeCond(e.target.value)} /></EcCond>
        <li className="flex flex-wrap items-center gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={load}>검색(F8)</button>
          <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={issueRange.from} onPick={(r) => { setIssueRange(r); setUseIssueDate(true) }} />
        </li>
      </ul>
      <div className="ec-pills mb-[8px]"><button type="button" className="ec-pill active">전체</button></div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
            <th>발행번호</th>
            <th>사원번호</th>
            <th>성명</th>
            <th>증명서종류</th>
            <th>용도</th>
            <th className="text-center">발행일</th>
            <th className="w-[110px] text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)}
                       onChange={() => {
                         const next = new Set(checked)
                         if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                         setChecked(next)
                       }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.issueNo}</a></td>
              <td>{r.employeeCode}</td>
              <td>{r.employeeName}</td>
              <td>{r.kindName}</td>
              <td>{r.purpose ?? ''}</td>
              <td className="text-center">{r.issueDate.replace(/-/g, '/')}</td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setPrinting([r]) }}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={formOpen} title={editId ? '각종증명서수정' : '각종증명서등록'} width={960} onClose={() => setFormOpen(false)}>
        <ul className="ec-form">
          <li className="wide">
            <span className="title">증명서종류</span>
            <div className="form">
              <select className="ec-input w-full" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CertificateKind })}>
                <option value="">====</option>
                {CERTIFICATE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </li>
          <li className="wide">
            <span className="title">사원번호</span>
            <div className={`form ${empBad && !form.employeeId ? '[&_.ec-input]:border-ec-danger' : ''}`} aria-invalid={empBad && !form.employeeId}>
              <CodePickerField label="사원번호" hideLabel fill placeholder="사원번호" emptyLabel="선택 해제"
                               value={form.employeeId} onChange={(v) => setForm({ ...form, employeeId: v })}
                               items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
          </li>
          <li className="wide">
            <span className="title">용도</span>
            <div className="form"><input className="ec-input w-full" placeholder="용도" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
          </li>
          <li className="wide">
            <span className="title">발행일</span>
            <div className="form"><EcDateInput className="ec-input w-[150px]" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
          </li>
        </ul>
        <button type="button" className="ec-btn ec-btn-pick mt-[8px]" onClick={() => setPreview((v) => !v)}>{preview ? '▾' : '▸'} 증명서 확인</button>
        {preview && (formDoc ? <CertificateDoc d={formDoc} company={company} /> : <p className="text-ec-hint">사원번호를 넣으면 보입니다.</p>)}
        <div className="flex gap-[6px] mt-[12px]">
          {/* 원본 신규: 저장(F8)▴ · 다시 작성 · 닫기 / 수정: 저장(F8)▴ · 다시 작성 · 삭제 · 닫기. ▴ 메뉴는 '저장/전표(F7)' 하나. */}
          <span className="ec-btn-group relative">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
            <button type="button" className="ec-btn ec-btn-primary ec-btn-arrow" aria-label="저장 더보기" onClick={() => setSaveMenu((v) => !v)}><EcIcon name="caret-up" size={10} glyph="▴" /></button>
            {saveMenu && (
              <div className="absolute bottom-full left-0 mb-[2px] z-[41] min-w-[120px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
                <button type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                        onClick={() => void save(true)}>저장/전표(F7)</button>
              </div>
            )}
          </span>
          <button type="button" className="ec-btn" onClick={() => (editing ? openEdit(editing) : (setForm(blankForm()), setEmpBad(false)))}>다시 작성</button>
          {editId && <button type="button" className="ec-btn" onClick={() => void deleteEditing()}>삭제</button>}
          <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal error={error} open={printing.length > 0} title="각종증명서인쇄" width={760} onClose={() => setPrinting([])}>
        {printing.map((c) => <div key={c.id} className="mb-[24px]"><CertificateDoc d={docOf(c)} company={company} /></div>)}
        <div className="flex gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
          <button type="button" className="ec-btn" onClick={() => setPrinting([])}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}

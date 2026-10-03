import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import CertificateDoc, { type CertificateDocData, type CompanyInfo } from '../../features/certificate/components/CertificateDoc'
import { CERTIFICATE_KINDS, type Certificate, type CertificateKind } from '../../features/certificate/types'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster } from '../../types/api'
import { ymd } from '../../utils/periods'

interface Form { kind: CertificateKind | ''; employeeId: string; purpose: string; issueDate: string }
const blankForm = (): Form => ({ kind: '', employeeId: '', purpose: '', issueDate: ymd(new Date()) })

/**
 * 관리 &gt; 인사관리 &gt; 인사관리현황 &gt; <b>각종증명서인쇄</b> (원본 E020606).
 *
 * <p>2026-10-03 loginaa 에서 발급하고 지워 본 그대로:
 * <ul>
 *   <li>[전체] 알약 · 격자 발행번호 · 사원번호 · 성명 · 증명서종류 · 용도 · 발행일 · 인쇄(줄마다 [인쇄]) — 최근 발행이 위.
 *       버튼 신규(F2) · 인쇄 ▲ · 선택삭제('삭제하시겠습니까?').</li>
 *   <li>[신규(F2)] '각종증명서등록' 창: 증명서종류(==== · 재직증명서 · 퇴직증명서 · 경력증명서) · 사원번호(코드도움) · 용도 ·
 *       발행일(오늘) · ▸ 증명서 확인(펴면 증명서가 보인다) · 저장(F8) · 다시 작성 · 닫기. 저장하면 안내 없이 닫히고 목록 맨 위에
 *       2026-1 꼴 발행번호(발행일의 해 - 그해 차례)로 붙는다.</li>
 * </ul>
 * 원본 '증명서 확인' 은 편집기라 글자를 고쳐 저장할 수 있다 — 우리는 사원의 지금 값으로 그리기만 한다. [인쇄 ▲] 펼침 항목은 못 쟀다.
 */
export default function CertificatePage() {
  const [rows, setRows] = useState<Certificate[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [error, setError] = useState('')
  const [quick, setQuick] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(blankForm())
  const [preview, setPreview] = useState(false)
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

  const shown = rows.filter((r) => !quick || r.employeeName.includes(quick) || r.employeeCode.includes(quick) || r.issueNo.includes(quick))
  useTableColumnCheck(tableRef, '각종증명서인쇄', [shown.length])
  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id))

  function openNew() {
    setEditId(null); setForm(blankForm()); setFormError(''); setPreview(false); setFormOpen(true)
  }
  function openEdit(c: Certificate) {
    setEditId(c.id)
    setForm({ kind: c.kind, employeeId: String(c.employeeId), purpose: c.purpose ?? '', issueDate: c.issueDate })
    setFormError(''); setPreview(false); setFormOpen(true)
  }

  async function save() {
    if (!form.kind) { setFormError('증명서종류를 선택 바랍니다.'); return }
    if (!form.employeeId) { setFormError('사원번호를 입력 바랍니다.'); return }
    const body = { kind: form.kind, employeeId: Number(form.employeeId), purpose: form.purpose || null, issueDate: form.issueDate }
    try {
      if (editId) await api.put(`/hr/certificates/${editId}`, body)
      else await api.post('/hr/certificates', body)
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function deleteChecked() {
    if (checked.size === 0 || !window.confirm('삭제하시겠습니까?')) return
    try {
      for (const id of checked) await api.delete(`/hr/certificates/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const docOf = (c: Pick<Certificate, 'issueNo' | 'kind' | 'kindName' | 'employeeName' | 'address' | 'department' | 'jobTitle' | 'hireDate' | 'resignDate' | 'purpose' | 'issueDate'>): CertificateDocData => ({
    ...c, endDate: c.kind === 'EMPLOYMENT' ? c.issueDate : c.resignDate ?? c.issueDate,
  })
  const formEmp = employees.find((e) => String(e.id) === form.employeeId)
  const editing = rows.find((r) => r.id === editId)
  const formDoc: CertificateDocData | null = form.kind && formEmp ? docOf({
    issueNo: editing?.issueNo ?? '', kind: form.kind, kindName: CERTIFICATE_KINDS.find(([k]) => k === form.kind)![1],
    employeeName: formEmp.name, address: formEmp.address ?? null, department: formEmp.department, jobTitle: formEmp.jobTitle,
    hireDate: formEmp.hireDate, resignDate: formEmp.resignDate, purpose: form.purpose, issueDate: form.issueDate,
  }) : null

  return (
    <EcListShell
      title="각종증명서인쇄"
      search={quick}
      onSearchChange={setQuick}
      onSearch={load}
      onNew={openNew}
      actions={[
        { label: '인쇄', onClick: () => setPrinting(rows.filter((r) => checked.has(r.id))), disabled: checked.size === 0 },
        { label: '선택삭제', onClick: deleteChecked, disabled: checked.size === 0 },
      ]}
    >
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

      <Modal error={formError} open={formOpen} title="각종증명서등록" width={780} onClose={() => setFormOpen(false)}>
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
            <div className="form">
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
            <div className="form"><input type="date" className="ec-input w-[150px]" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
          </li>
        </ul>
        <button type="button" className="ec-btn ec-btn-pick mt-[8px]" onClick={() => setPreview((v) => !v)}>{preview ? '▾' : '▸'} 증명서 확인</button>
        {preview && (formDoc ? <CertificateDoc d={formDoc} company={company} /> : <p className="text-ec-hint">증명서종류와 사원번호를 넣으면 보입니다.</p>)}
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => (editing ? openEdit(editing) : setForm(blankForm()))}>다시 작성</button>
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

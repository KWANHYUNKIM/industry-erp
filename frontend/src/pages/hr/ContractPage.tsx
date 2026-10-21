import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { Department, EmployeeMaster, EmploymentContract, Project } from '../../types/api'
import { ymd } from '../../utils/periods'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import ContractSettingModal from '../../features/contract/ContractSettingModal'

const slash = (s: string) => s.replace(/-/g, '/')
/** 원본 '2026/10/21 오후 1:36:00' */
const stamp = (s: string | null) => {
  if (!s) return ''
  const h = Number(s.slice(11, 13))
  return `${slash(s.slice(0, 10))} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${s.slice(14, 19)}`
}
const oneYear = () => { const d = new Date(); return { from: ymd(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate())), to: ymd(d) } }
const kb = (n: number | null) => (n == null ? '' : `${(n / 1024).toFixed(1)}KB`)

/** 원본 [삭제] 확인(2026-10-21 실측) */
const DELETE_CONFIRM = '중요 계약서는 백업 후 삭제하시기 바랍니다.\n\n삭제하시겠습니까?'
/** 원본 계약서입력 수정 [저장(F8)] 확인(2026-10-21 실측 — 첨부를 안 바꿔도 뜬다) */
const EDIT_CONFIRM = '파일 변경 시 지금까지 설정한 모든 내용이 삭제 됩니다.\n계속 진행하겠습니까?'
/** 요청 · 계약서설정 — 원본은 바깥 발송(Email · SMS · 카카오톡 · 전자서명)이라 누르지 않았다. 지은 문구. */
const LINK_NEEDED = '전자서명 요청(Email · SMS · 카카오톡 발송)은 외부 연동이 필요합니다.\n\n연동 전에는 진행상태만 기록합니다.'

const METHODS = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
  { value: 'KAKAO', label: '카카오톡' },
  { value: 'DIRECT', label: '직접서명' },
] as const

/**
 * 관리 &gt; 전자근로계약 &gt; <b>근로계약서진행단계</b> (원본 C061103).
 *
 * <p>2026-10-21 loginaa 실측: 격자 □ · 일자 · 최초작성일자 · 최종수정일자 · 계약서명 · 진행단계([수신정보입력] · [계약서설정] 알약)
 * · 요청기능(요청 · 요청취소 · 재요청) · 문서 · 복사 · 구분명, 아래 신규(F2) · 선택삭제 · Excel.
 * [신규(F2)] · 계약서명 링크는 '계약서입력' 창 — 계약서명 · 첨부(PDF) · 2차인증사용여부 · 구분 · 부서 · 프로젝트 · 전달메시지.
 * 계약서명 · 첨부를 비우고 저장하면 두 칸이 빨갛게 되고 저장 안 됨(문구 없음).
 * [복사]는 '계약서복사' 창(계약서명 하나) → 같은 첨부로 새 계약서. [수신정보입력]은 계약참여자1(사원) · 전달방식.
 * 수신정보를 넣기 전에는 [수신정보입력]이 주황, [요청]이 흐림. [요청]한 계약서는 근로계약현황(E061104)으로 간다.
 * 원본 [요청]은 바깥 발송이라 우리는 진행상태만 진행중으로 바꾼다.
 */
export default function ContractPage() {
  const [range, setRange] = useState(oneYear())
  const [nameCond, setNameCond] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<EmploymentContract[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<EmploymentContract | null>(null)
  const [copyOf, setCopyOf] = useState<EmploymentContract | null>(null)
  const [recipientOf, setRecipientOf] = useState<EmploymentContract | null>(null)
  const [settingOf, setSettingOf] = useState<EmploymentContract | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  const load = () => {
    api.get<EmploymentContract[]>('/employment-contracts').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    load()
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => {})
    api.get<Department[]>('/departments').then((r) => setDepartments(r.data)).catch(() => {})
    api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
  }, [])

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice((cur) => (cur === m ? '' : cur)), 2500) }

  async function deleteChecked() {
    if (checked.size === 0 || !(await ecConfirm(DELETE_CONFIRM))) return
    setError('')
    try {
      for (const id of checked) await api.delete(`/employment-contracts/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  async function request(r: EmploymentContract) {
    if (!(await ecConfirm(LINK_NEEDED))) return
    try {
      await api.post(`/employment-contracts/${r.id}/send`)
      flash(`${r.contractName} 요청 — 근로계약현황에서 진행중으로 봅니다.`)
      load()
    } catch (e) { void ecAlert(extractErrorMessage(e)) }
  }

  const day = (r: EmploymentContract) => (r.createdAt ?? r.startDate).slice(0, 10)
  const q = search.trim()
  const shown = rows
    .filter((r) => r.status === 'DRAFT')
    .filter((r) => day(r) >= range.from && day(r) <= range.to)
    .filter((r) => !nameCond || r.contractName.includes(nameCond))
    .filter((r) => !q || r.contractName.includes(q))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id - a.id)
  useTableColumnCheck(tableRef, '근로계약서진행단계', [shown.length])

  const formProps = { departments, projects, onError: setError }

  return (
    <EcListShell
      title="근로계약서진행단계"
      search={search}
      onSearchChange={setSearch}
      formTitle="계약서입력"
      renderForm={(close) => <DocumentForm {...formProps} onSaved={(c) => { close(); flash(`${c.contractName} 저장`); load() }} />}
      actions={[{ label: '선택삭제', onClick: deleteChecked, selected: checked.size }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[150px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="date" className="ec-input w-[150px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="계약서명"><input className="ec-input w-full" placeholder="계약서명" value={nameCond} onChange={(e) => setNameCond(e.target.value)} /></EcCond>
      </ul>
      <div className="text-right text-ec-hint mb-[6px]">{slash(range.from)} ~ {slash(range.to)}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} />
            </th>
            <th className="text-center">일자</th>
            <th className="text-center">최초작성일자</th>
            <th className="text-center">최종수정일자</th>
            <th>계약서명</th>
            <th className="text-center">진행단계</th>
            <th className="text-center">요청기능</th>
            <th className="text-center">문서</th>
            <th className="text-center">복사</th>
            <th>구분명</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)}
                       onChange={(e) => { const n = new Set(checked); if (e.target.checked) n.add(r.id); else n.delete(r.id); setChecked(n) }} />
              </td>
              <td className="text-center">{slash(day(r))}</td>
              <td className="text-center">{stamp(r.createdAt)}</td>
              <td className="text-center">{stamp(r.updatedAt)}</td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setEditing(r) }}>{r.contractName}</a></td>
              <td className="text-center">
                {/* 원본 수신정보 전 label-warning(주황) · 후 label-primary label-inverse(파란 테) */}
                <span className="inline-flex gap-[3px]">
                  <button type="button" className={`ec-pill${r.employeeId ? ' active' : ''}`} onClick={() => setRecipientOf(r)}>수신정보입력</button>
                  <button type="button" className="ec-pill active" onClick={() => setSettingOf(r)}>계약서설정</button>
                </span>
              </td>
              <td className="text-center">
                <span className="inline-flex gap-[6px]">
                  {r.employeeId
                    ? <a href="#" onClick={(e) => { e.preventDefault(); void request(r) }}>요청</a>
                    : <span className="text-ec-hint">요청</span>}
                  <span className="text-ec-hint">요청취소</span>
                  <span className="text-ec-hint">재요청</span>
                </span>
              </td>
              <td className="text-center"></td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setCopyOf(r) }}>복사</a></td>
              <td>{r.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal error={error} open={editing !== null} title="계약서입력" onClose={() => setEditing(null)}>{(
        editing && <DocumentForm {...formProps} initial={editing}
                                 onSaved={(c) => { setEditing(null); flash(`${c.contractName} 저장`); load() }} />
      )}</Modal>
      <Modal error={error} open={copyOf !== null} title="계약서복사" onClose={() => setCopyOf(null)}>{(
        copyOf && <CopyForm source={copyOf} onError={setError} onSaved={() => { setCopyOf(null); load() }} />
      )}</Modal>
      <ContractSettingModal open={settingOf !== null} contractName={settingOf?.contractName ?? ''} onClose={() => setSettingOf(null)} />
      <Modal error={error} open={recipientOf !== null} title="수신정보입력" onClose={() => setRecipientOf(null)}>{(
        recipientOf && <RecipientForm contract={recipientOf} employees={employees} onError={setError}
                                      onSaved={() => { setRecipientOf(null); load() }} />
      )}</Modal>
    </EcListShell>
  )
}

/** 원본 '계약서입력' 창 — 계약서명 · 첨부(PDF 필수) · 2차인증사용여부 · 구분 · 부서 · 프로젝트 · 전달메시지. */
function DocumentForm({ initial, departments, projects, onError, onSaved }: {
  initial?: EmploymentContract
  departments: Department[]
  projects: Project[]
  onError: (m: string) => void
  onSaved: (c: EmploymentContract) => void
}) {
  const [name, setName] = useState(initial?.contractName ?? '')
  const [file, setFile] = useState<{ id: number; name: string; size: number | null } | null>(
    initial?.attachmentFileId ? { id: initial.attachmentFileId, name: initial.attachmentName ?? '', size: initial.attachmentSize } : null)
  const [twoFactor, setTwoFactor] = useState(initial?.twoFactor ?? false)
  const [category, setCategory] = useState(initial?.category ?? '')
  // 원본 [구분] 은 코드도움(코드 · 항목명 · 적요) — 처음엔 비어 있고 창의 [신규(F2)] 로 더한다(2026-10-22 실측)
  const [cats, setCats] = useState<{ code: string; name: string; remark: string | null }[]>([])
  const [catGroupId, setCatGroupId] = useState<number | null>(null)
  const [catNew, setCatNew] = useState(false)
  const [catForm, setCatForm] = useState({ code: '', name: '', remark: '' })
  const [catError, setCatError] = useState('')
  async function loadCats() {
    try {
      const [g, c] = await Promise.all([
        api.get<{ id: number; groupCode: string }[]>('/codes'),
        api.get<{ code: string; name: string; remark: string | null }[]>('/codes/CONTRACT_CATEGORY'),
      ])
      setCatGroupId(g.data.find((x) => x.groupCode === 'CONTRACT_CATEGORY')?.id ?? null)
      setCats(c.data)
    } catch { setCats([]) }
  }
  useEffect(() => { void loadCats() }, [])
  async function saveCat() {
    setCatError('')
    if (!catForm.code.trim() || !catForm.name.trim()) { setCatError(!catForm.code.trim() ? '코드를 입력하세요.' : '항목명을 입력하세요.'); return }
    try {
      await api.post(`/codes/groups/${catGroupId}/codes`, { code: catForm.code.trim(), name: catForm.name.trim(), remark: catForm.remark.trim() || null })
      await loadCats(); setCategory(catForm.name.trim()); setCatNew(false); setCatForm({ code: '', name: '', remark: '' })
    } catch (e) { setCatError(extractErrorMessage(e)) }
  }
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ? String(initial.departmentId) : '')
  const [projectId, setProjectId] = useState(initial?.projectId ? String(initial.projectId) : '')
  const [remark, setRemark] = useState(initial?.remark ?? '')
  const [bad, setBad] = useState<{ name?: boolean; file?: boolean }>({})
  const [busy, setBusy] = useState(false)

  async function upload(f: File | undefined) {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.pdf')) { void ecAlert('PDF 파일만 첨부할 수 있습니다.'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await api.post<{ id: number; name: string; sizeBytes: number }>('/files', fd)
      setFile({ id: r.data.id, name: r.data.name, size: r.data.sizeBytes })
      setBad((b) => ({ ...b, file: false }))
    } catch (e) { onError(extractErrorMessage(e)) } finally { setBusy(false) }
  }

  async function save() {
    const miss = { name: !name.trim(), file: !file }
    setBad(miss)
    if (miss.name || miss.file) return
    if (initial && !(await ecConfirm(EDIT_CONFIRM))) return
    setBusy(true)
    onError('')
    const body = {
      contractName: name.trim(), attachmentFileId: file!.id, twoFactor, category: category.trim() || null,
      departmentId: departmentId ? Number(departmentId) : null, projectId: projectId ? Number(projectId) : null,
      remark: remark.trim() || null,
    }
    try {
      const r = initial
        ? await api.put<EmploymentContract>(`/employment-contracts/${initial.id}/document`, body)
        : await api.post<EmploymentContract>('/employment-contracts/documents', body)
      onSaved(r.data)
    } catch (e) { onError(extractErrorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <div>
      <ul className="ec-form">
        <EcCond label="계약서명">
          <span className={`w-full${bad.name ? ' ec-invalid' : ''}`}>
            <input className="ec-input w-full" placeholder="계약서명" value={name} aria-invalid={bad.name}
                   onChange={(e) => { setName(e.target.value); setBad((b) => ({ ...b, name: false })) }} />
          </span>
        </EcCond>
        <EcCond label="첨부">
          <span className={`w-full flex items-center gap-[6px]${bad.file ? ' ec-invalid' : ''}`}>
            <input type="file" accept=".pdf" aria-label="첨부" aria-invalid={bad.file} disabled={busy}
                   onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
            {file && <span>{file.name} ({kb(file.size)})</span>}
          </span>
        </EcCond>
        <EcCond label="2차인증사용여부">
          <label className="inline-flex items-center gap-[4px]"><input type="checkbox" checked={twoFactor} onChange={(e) => setTwoFactor(e.target.checked)} />사용</label>
        </EcCond>
        <EcCond label="구분">
          <CodePickerField label="구분" hideLabel width={220} placeholder="구분" emptyLabel="선택 해제"
                           value={category} onChange={setCategory} onNew={() => { setCatError(''); setCatNew(true) }}
                           columns={[
                             { head: '코드', width: 235, cell: (i) => i.code ?? '', link: true },
                             { head: '항목명', width: 470, cell: (i) => i.name, link: true },
                             { head: '적요', width: 235, cell: (i) => i.sub ?? '' },
                           ]}
                           items={cats.map((x) => ({ value: x.name, code: x.code, name: x.name, sub: x.remark ?? '' }))} />
          <Modal error={catError} open={catNew} title="구분" width={460} onClose={() => setCatNew(false)}>{(
            <>
              <ul className="ec-form">
                {([['코드', 'code'], ['항목명', 'name'], ['적요', 'remark']] as const).map(([l, k]) => (
                  <li key={k} className="wide"><span className="title">{l}</span>
                    <div className="form"><input className="ec-input w-full" value={catForm[k]} onChange={(e) => setCatForm({ ...catForm, [k]: e.target.value })} /></div></li>
                ))}
              </ul>
              <div className="flex gap-[6px] mt-[12px]">
                <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveCat()}>저장(F8)</button>
                <button type="button" className="ec-btn" onClick={() => setCatForm({ code: '', name: '', remark: '' })}>다시작성</button>
                <button type="button" className="ec-btn" onClick={() => setCatNew(false)}>닫기</button>
              </div>
            </>
          )}</Modal>
        </EcCond>
        <EcCond label="부서">
          <CodePickerField label="부서" hideLabel width={220} placeholder="부서" emptyLabel="선택 해제"
                           value={departmentId} onChange={setDepartmentId}
                           items={departments.map((x) => ({ value: String(x.id), name: x.name }))} />
        </EcCond>
        <EcCond label="프로젝트">
          <CodePickerField label="프로젝트" hideLabel width={220} placeholder="프로젝트" emptyLabel="선택 해제"
                           value={projectId} onChange={setProjectId}
                           items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="전달메시지">
          <textarea className="ec-input w-full h-[90px]" placeholder="내용" value={remark} onChange={(e) => setRemark(e.target.value)} />
        </EcCond>
      </ul>
      <div className="flex gap-[6px] mt-[9px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={busy} onClick={save}>저장(F8)</button>
      </div>
    </div>
  )
}

/** 원본 '계약서복사' 창 — 계약서명 하나와 [복사]. 첨부 · 설정은 원래 계약서를 그대로 쓴다. */
function CopyForm({ source, onError, onSaved }: { source: EmploymentContract; onError: (m: string) => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [bad, setBad] = useState(false)
  async function copy() {
    if (!name.trim()) { setBad(true); return }
    onError('')
    try {
      await api.post(`/employment-contracts/${source.id}/copy`, { contractName: name.trim() })
      onSaved()
    } catch (e) { onError(extractErrorMessage(e)) }
  }
  return (
    <div>
      <ul className="ec-form">
        <EcCond label="계약서명">
          <span className={`w-full${bad ? ' ec-invalid' : ''}`}>
            <input className="ec-input w-full" placeholder="계약서명" value={name} aria-invalid={bad}
                   onChange={(e) => { setName(e.target.value); setBad(false) }} />
          </span>
        </EcCond>
      </ul>
      <div className="flex gap-[6px] mt-[9px]"><button type="button" className="ec-btn ec-btn-primary" onClick={copy}>복사</button></div>
    </div>
  )
}

/**
 * 원본 '수신정보입력' 창 — 계약참여자1 [항목등록] · [전송정보입력](전달방식 Email · SMS · 카카오톡 · 직접서명, 찾기 탭 사원 · 일용근로사원),
 * 계약참여자2 사용여부(사용 · 사용안함). 우리는 계약참여자1의 사원 · 전달방식만 담는다(계약참여자2 는 사용안함 고정).
 */
function RecipientForm({ contract, employees, onError, onSaved }: {
  contract: EmploymentContract; employees: EmployeeMaster[]; onError: (m: string) => void; onSaved: () => void
}) {
  const [employeeId, setEmployeeId] = useState(contract.employeeId ? String(contract.employeeId) : '')
  const [method, setMethod] = useState<string>(contract.deliveryMethod ?? 'EMAIL')
  const [bad, setBad] = useState(false)
  async function save() {
    if (!employeeId) { setBad(true); return }
    onError('')
    try {
      await api.put(`/employment-contracts/${contract.id}/recipient`, { employeeId: Number(employeeId), deliveryMethod: method })
      onSaved()
    } catch (e) { onError(extractErrorMessage(e)) }
  }
  return (
    <div>
      <ul className="ec-form">
        <EcCond label="계약참여자1">
          <span className={bad ? 'ec-invalid' : undefined}>
            <CodePickerField label="사원" hideLabel width={220} placeholder="사원" emptyLabel="선택 해제"
                             value={employeeId} onChange={(v) => { setEmployeeId(v); setBad(false) }}
                             items={employees.filter((e) => e.active !== false).map((e) => ({ value: String(e.id), code: e.code, name: e.name, sub: e.department || null }))} />
          </span>
        </EcCond>
        <EcCond label="전달방식">
          <span className="inline-flex gap-[9px]">
            {METHODS.map((m) => (
              <label key={m.value} className="inline-flex items-center gap-[3px]">
                <input type="radio" name="delivery" checked={method === m.value} onChange={() => setMethod(m.value)} />{m.label}
              </label>
            ))}
          </span>
        </EcCond>
        <EcCond label="계약참여자2">
          <span className="inline-flex gap-[9px]">
            <label className="inline-flex items-center gap-[3px] text-ec-hint"><input type="radio" disabled />사용</label>
            <label className="inline-flex items-center gap-[3px]"><input type="radio" checked readOnly />사용안함</label>
          </span>
        </EcCond>
      </ul>
      <div className="flex gap-[6px] mt-[9px]"><button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button></div>
    </div>
  )
}

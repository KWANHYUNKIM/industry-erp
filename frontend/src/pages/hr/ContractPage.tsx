import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Department, EmployeeMaster, EmploymentContract, ContractStatus, ContractType } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)

const TABS = ['전체', '작성', '발송', '서명완료', '해지'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, ContractStatus> = {
  작성: 'DRAFT', 발송: 'SENT', 서명완료: 'SIGNED', 해지: 'TERMINATED',
}
const statusColor = (s: ContractStatus) =>
  s === 'SIGNED' ? '#1c7c3c' : s === 'TERMINATED' ? '#c60a2e' : s === 'SENT' ? 'var(--ec-blue)' : '#5a626e'

const TYPES: { value: ContractType; label: string }[] = [
  { value: 'PERMANENT', label: '정규직' },
  { value: 'FIXED_TERM', label: '계약직' },
  { value: 'DAILY', label: '일용직' },
]

/** 관리 > 전자근로계약 — 작성 → 발송 → 서명. 서명된 계약은 수정할 수 없다. */
export default function ContractPage() {
  const [rows, setRows] = useState<EmploymentContract[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [showForm, setShowForm] = useState(false)
  const [viewing, setViewing] = useState<EmploymentContract | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load() {
    setError('')
    try {
      const [c, e, d] = await Promise.all([
        api.get<EmploymentContract[]>('/employment-contracts'),
        api.get<EmployeeMaster[]>('/employees'),
        api.get<Department[]>('/departments'),
      ])
      setRows(c.data)
      setEmployees(e.data)
      setDepartments(d.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])

  const shown = useMemo(() => rows.filter((r) => tab === '전체' || r.status === TAB_STATUS[tab]), [rows, tab])
  const tabCount = (t: Tab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length

  async function act(c: EmploymentContract, action: 'send' | 'terminate') {
    const label = action === 'send' ? '발송' : '해지'
    if (action === 'terminate' && !window.confirm(`${c.contractNo} 계약을 해지할까요?`)) return
    try {
      await api.post(`/employment-contracts/${c.id}/${action}`)
      flash(`${c.contractNo} ${label}`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function sign(c: EmploymentContract) {
    const name = window.prompt(`서명자명을 입력하세요 (사원 본인 확인).\n계약: ${c.contractNo} / ${c.employeeName}`, c.employeeName)
    if (!name?.trim()) return
    try {
      await api.post(`/employment-contracts/${c.id}/sign`, { signedBy: name.trim() })
      flash(`${c.contractNo} 서명 완료`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function remove(c: EmploymentContract) {
    if (!window.confirm(`${c.contractNo} 계약을 삭제할까요?`)) return
    try {
      await api.delete(`/employment-contracts/${c.id}`)
      flash('계약을 삭제했습니다.')
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="전자근로계약" actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 근로계약 작성(F2)</button>
        <span style={{ fontSize: 12, color: '#9aa1ab' }}>작성 → 발송 → 서명. 서명된 계약은 수정할 수 없고 해지만 됩니다.</span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({tabCount(t)})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>계약번호</th>
            <th>사원</th>
            <th style={{ width: 70 }}>유형</th>
            <th>계약기간</th>
            <th>부서</th>
            <th>직위</th>
            <th style={{ textAlign: 'right' }}>월 급여</th>
            <th style={{ textAlign: 'center', width: 60 }}>주 시간</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ textAlign: 'center', width: 150 }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>근로계약이 없습니다.</td></tr>
          ) : shown.map((c, i) => (
            <tr key={c.id} onClick={() => setViewing(c)} style={{ cursor: 'pointer' }}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{c.contractNo}</td>
              <td>{c.employeeName} <span style={{ color: '#9aa1ab', fontSize: 11 }}>{c.employeeCode}</span></td>
              <td>{c.typeName}</td>
              <td>{c.startDate} ~ {c.endDate ?? <span style={{ color: '#9aa1ab' }}>기간없음</span>}</td>
              <td>{c.department || '-'}</td>
              <td>{c.jobTitle || '-'}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(c.monthlySalary)}</td>
              <td style={{ textAlign: 'center' }}>{c.weeklyHours}h</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ color: statusColor(c.status) }}>{c.statusName}</span>
                {c.status === 'SIGNED' && c.signedBy && (
                  <div style={{ fontSize: 10.5, color: '#9aa1ab' }}>{c.signedBy} 서명</div>
                )}
              </td>
              <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'inline-flex', gap: 3 }}>
                  {c.status === 'DRAFT' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => act(c, 'send')}>발송</button>}
                  {c.status === 'SENT' && <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => sign(c)}>서명</button>}
                  {c.status === 'SIGNED' && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => act(c, 'terminate')}>해지</button>}
                  {(c.status === 'DRAFT' || c.status === 'SENT') && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(c)}>삭제</button>}
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setViewing(c)}>계약서</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <ContractForm
          employees={employees}
          departments={departments}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('근로계약을 작성했습니다.'); load() }}
        />
      )}
      {viewing && <ContractSheet contract={viewing} onClose={() => setViewing(null)} />}
    </EcListShell>
  )
}

/** 계약서 인쇄 뷰 — 계약 시점에 박아 둔 조건을 그대로 보여준다. */
function ContractSheet({ contract: c, onClose }: { contract: EmploymentContract; onClose: () => void }) {
  const row = (label: string, value: React.ReactNode) => (
    <tr>
      <th style={{ width: 110, background: '#f5f7fa' }}>{label}</th>
      <td>{value}</td>
    </tr>
  )
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 640, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>근로계약서 — {c.contractNo}</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          <p style={{ textAlign: 'center', fontSize: 17, fontWeight: 800, margin: '4px 0 14px' }}>근 로 계 약 서</p>
          <table className="w-full text-left">
            <tbody>
              {row('사원', `${c.employeeName} (${c.employeeCode})`)}
              {row('계약 유형', c.typeName)}
              {row('계약 기간', `${c.startDate} ~ ${c.endDate ?? '기간의 정함 없음'}`)}
              {row('소속 부서', c.department || '-')}
              {row('직위', c.jobTitle || '-')}
              {row('담당 업무', c.duty || '-')}
              {row('근무 장소', c.workPlace || '-')}
              {row('월 급여', `${won(c.monthlySalary)} 원`)}
              {row('주당 근로시간', `${c.weeklyHours} 시간`)}
              {row('상태', <span style={{ color: statusColor(c.status), fontWeight: 700 }}>{c.statusName}</span>)}
              {row('서명', c.signedAt
                ? `${c.signedBy} · ${c.signedAt.replace('T', ' ').slice(0, 16)}`
                : <span style={{ color: '#9aa1ab' }}>미서명</span>)}
              {row('비고', c.remark || '-')}
            </tbody>
          </table>
          <p style={{ marginTop: 12, fontSize: 11.5, color: '#9aa1ab' }}>
            ※ 계약서의 근로조건은 계약 시점의 값입니다. 이후 사원의 부서·급여가 바뀌어도 이 계약서는 바뀌지 않습니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn" onClick={() => window.print()}>인쇄</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function ContractForm({ employees, departments, onClose, onSaved }: {
  employees: EmployeeMaster[]
  departments: Department[]
  onClose: () => void
  onSaved: () => void
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [type, setType] = useState<ContractType>('PERMANENT')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [monthlySalary, setMonthlySalary] = useState('')
  const [weeklyHours, setWeeklyHours] = useState('40')
  const [workPlace, setWorkPlace] = useState('')
  const [duty, setDuty] = useState('')
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 사원을 고르면 현재 부서·직위·기본급을 계약 조건의 출발점으로 채운다
  function pickEmployee(id: string) {
    setEmployeeId(id)
    const e = employees.find((x) => String(x.id) === id)
    if (e) {
      setDepartmentId(e.departmentId != null ? String(e.departmentId) : '')
      setJobTitle(e.jobTitle)
      setMonthlySalary(String(e.baseSalary))
    }
  }

  async function save() {
    setError('')
    if (!employeeId) return setError('사원을 선택하세요.')
    if (type !== 'PERMANENT' && !endDate) return setError(`${TYPES.find((t) => t.value === type)?.label} 계약은 종료일이 있어야 합니다.`)
    setSaving(true)
    try {
      await api.post('/employment-contracts', {
        employeeId: Number(employeeId),
        type,
        startDate,
        endDate: endDate || null,
        departmentId: departmentId ? Number(departmentId) : null,
        jobTitle: jobTitle.trim() || null,
        monthlySalary: Number(monthlySalary) || 0,
        weeklyHours: Number(weeklyHours) || 40,
        workPlace: workPlace.trim() || null,
        duty: duty.trim() || null,
        remark: remark.trim() || null,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 640, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>근로계약 작성</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 100, background: '#f5f7fa' }}>사원<span style={{ color: '#c60a2e' }}>*</span></th>
                <td>
                  <select className="ec-input" value={employeeId} onChange={(e) => pickEmployee(e.target.value)} style={{ width: 220 }}>
                    <option value="">재직 사원 선택</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.code} {e.name}</option>)}
                  </select>
                </td>
                <th style={{ width: 90, background: '#f5f7fa' }}>계약 유형</th>
                <td>
                  <select className="ec-input" value={type} onChange={(e) => setType(e.target.value as ContractType)} style={{ width: 120 }}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>계약 시작일</th>
                <td><input type="date" className="ec-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={{ background: '#f5f7fa' }}>종료일</th>
                <td>
                  <input type="date" className="ec-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 150 }} disabled={type === 'PERMANENT'} />
                  {type === 'PERMANENT' && <span style={{ marginLeft: 6, fontSize: 11.5, color: '#9aa1ab' }}>정규직은 기간 없음</span>}
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>소속 부서</th>
                <td>
                  <select className="ec-input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ width: 220 }}>
                    <option value="">(미배치)</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </td>
                <th style={{ background: '#f5f7fa' }}>직위</th>
                <td><input className="ec-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>월 급여</th>
                <td><input className="ec-input" type="number" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} style={{ width: 150, textAlign: 'right' }} /></td>
                <th style={{ background: '#f5f7fa' }}>주당 시간</th>
                <td><input className="ec-input" type="number" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>근무 장소</th>
                <td><input className="ec-input" value={workPlace} onChange={(e) => setWorkPlace(e.target.value)} placeholder="예: 본사 공장" style={{ width: 220 }} /></td>
                <th style={{ background: '#f5f7fa' }}>담당 업무</th>
                <td><input className="ec-input" value={duty} onChange={(e) => setDuty(e.target.value)} placeholder="예: 조립 공정" style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>비고</th>
                <td colSpan={3}><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

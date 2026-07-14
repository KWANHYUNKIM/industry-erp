import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Assignment, AssignmentType, Department, EmployeeMaster } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)

const TYPES: { value: AssignmentType; label: string; hint: string }[] = [
  { value: 'TRANSFER', label: '전보', hint: '부서를 지정하세요.' },
  { value: 'PROMOTION', label: '승진', hint: '직위를 지정하세요.' },
  { value: 'RESIGN', label: '퇴사', hint: '재직 상태가 퇴사로 바뀌고 퇴사일이 기록됩니다.' },
  { value: 'REHIRE', label: '재입사', hint: '퇴사한 사원만 재입사할 수 있습니다.' },
  { value: 'HIRE', label: '입사', hint: '입사일이 발령일로 갱신됩니다.' },
]

/** 근속일수. 퇴사자는 입사~퇴사 기준. */
function tenureDays(e: EmployeeMaster): number | null {
  if (!e.hireDate) return null
  const end = e.resignDate ? new Date(`${e.resignDate}T00:00:00`).getTime() : Date.now()
  return Math.max(0, Math.floor((end - new Date(`${e.hireDate}T00:00:00`).getTime()) / 86_400_000))
}

/** 관리 > 인사관리 — 인사기록카드(재직상태·부서·직위·근속)와 발령이력 */
export default function HrRecordPage() {
  const [rows, setRows] = useState<EmployeeMaster[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selected, setSelected] = useState<EmployeeMaster | null>(null)
  const [assigning, setAssigning] = useState<EmployeeMaster | null>(null)
  const [tab, setTab] = useState<'재직' | '퇴사' | '전체'>('재직')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load() {
    setError('')
    try {
      const [e, d] = await Promise.all([
        api.get<EmployeeMaster[]>('/employees/all'),
        api.get<Department[]>('/departments'),
      ])
      setRows(e.data)
      setDepartments(d.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!selected) { setAssignments([]); return }
    api.get<Assignment[]>(`/employees/${selected.id}/assignments`)
      .then((r) => setAssignments(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [selected, rows])

  const shown = useMemo(() => rows.filter((e) =>
    tab === '전체' || (tab === '재직' ? e.active : !e.active)), [rows, tab])
  const count = (t: typeof tab) => rows.filter((e) => t === '전체' || (t === '재직' ? e.active : !e.active)).length

  return (
    <EcListShell title="인사관리 (인사기록카드)" actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {(['재직', '퇴사', '전체'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({count(t)})</button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: '#9aa1ab' }}>
          사원을 클릭하면 발령이력이 보입니다. 발령을 등록하면 부서·직위·재직상태가 함께 갱신됩니다.
        </span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>사번</th>
            <th>성명</th>
            <th>부서</th>
            <th>직위</th>
            <th>입사일</th>
            <th>퇴사일</th>
            <th style={{ textAlign: 'right' }}>근속</th>
            <th style={{ textAlign: 'center' }}>재직</th>
            <th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>사원이 없습니다.</td></tr>
          ) : shown.map((e, i) => {
            const days = tenureDays(e)
            return (
              <tr
                key={e.id}
                onClick={() => setSelected(selected?.id === e.id ? null : e)}
                style={{ cursor: 'pointer', background: selected?.id === e.id ? '#eef5ff' : undefined }}
              >
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{selected?.id === e.id ? '▾ ' : '▸ '}{e.code}</td>
                <td style={{ fontWeight: 600 }}>{e.name}</td>
                <td>{e.department || <span style={{ color: '#c60a2e' }}>미배치</span>}</td>
                <td>{e.jobTitle || <span style={{ color: '#c3c8cf' }}>-</span>}</td>
                <td>{e.hireDate ?? ''}</td>
                <td style={{ color: e.resignDate ? '#c60a2e' : undefined }}>{e.resignDate ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{days == null ? '-' : `${days.toLocaleString('ko-KR')}일`}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: e.active ? '#1c7c3c' : '#8a929c' }}>{e.active ? '재직' : '퇴사'}</span>
                </td>
                <td style={{ textAlign: 'center' }} onClick={(ev) => ev.stopPropagation()}>
                  <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => setAssigning(e)}>발령</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {selected && (
        <div style={{ marginTop: 12 }}>
          <div style={{ padding: '6px 8px', background: '#f5f7fa', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            {selected.name} 발령이력 ({assignments.length}건)
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>발령일</th>
                <th style={{ width: 80 }}>유형</th>
                <th>부서</th>
                <th>직위</th>
                <th>비고</th>
                <th style={{ width: 80 }}>등록자</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>발령이력이 없습니다.</td></tr>
              ) : assignments.map((a, i) => (
                <tr key={a.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>{a.assignDate}</td>
                  <td style={{ color: a.type === 'RESIGN' ? '#c60a2e' : a.type === 'PROMOTION' ? '#1c7c3c' : 'var(--ec-blue)' }}>{a.typeName}</td>
                  <td>{a.department || '-'}</td>
                  <td>{a.jobTitle || '-'}</td>
                  <td style={{ color: '#5a626e' }}>{a.remark ?? ''}</td>
                  <td style={{ color: '#8a929c' }}>{a.createdBy ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assigning && (
        <AssignmentForm
          employee={assigning}
          departments={departments}
          onClose={() => setAssigning(null)}
          onSaved={(msg) => { setAssigning(null); flash(msg); load() }}
        />
      )}
    </EcListShell>
  )
}

function AssignmentForm({ employee, departments, onClose, onSaved }: {
  employee: EmployeeMaster
  departments: Department[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [type, setType] = useState<AssignmentType>(employee.active ? 'TRANSFER' : 'REHIRE')
  const [assignDate, setAssignDate] = useState(today())
  const [departmentId, setDepartmentId] = useState(employee.departmentId != null ? String(employee.departmentId) : '')
  const [jobTitle, setJobTitle] = useState(employee.jobTitle)
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hint = TYPES.find((t) => t.value === type)?.hint ?? ''

  async function save() {
    setError('')
    setSaving(true)
    try {
      await api.post(`/employees/${employee.id}/assignments`, {
        assignDate,
        type,
        departmentId: departmentId ? Number(departmentId) : null,
        jobTitle: jobTitle.trim() || null,
        remark: remark.trim() || null,
      })
      onSaved(`${employee.name} ${TYPES.find((t) => t.value === type)?.label} 발령을 등록했습니다.`)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 520, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>인사발령 — {employee.name} ({employee.code})</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>발령 유형</th>
                <td>
                  <select className="ec-input" value={type} onChange={(e) => setType(e.target.value as AssignmentType)} style={{ width: 160 }}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: '#9aa1ab' }}>{hint}</span>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>발령일</th>
                <td><input type="date" className="ec-input" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>부서</th>
                <td>
                  <select className="ec-input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ width: 200 }} disabled={type === 'RESIGN'}>
                    <option value="">(변경 없음)</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>직위</th>
                <td><input className="ec-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="예: 대리" style={{ width: 200 }} disabled={type === 'RESIGN'} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>비고</th>
                <td><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '발령 등록(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

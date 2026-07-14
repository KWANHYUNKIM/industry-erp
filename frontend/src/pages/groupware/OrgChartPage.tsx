import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Department, EmployeeMaster } from '../../api/types'

/** 부서 트리 노드 (children 은 sortOrder → 이름 순) */
interface Node extends Department {
  children: Node[]
  depth: number
}

function buildTree(rows: Department[]): Node[] {
  const byId = new Map<number, Node>()
  for (const d of rows) byId.set(d.id, { ...d, children: [], depth: 0 })

  const roots: Node[] = []
  for (const n of byId.values()) {
    const parent = n.parentId != null ? byId.get(n.parentId) : undefined
    if (parent) parent.children.push(n)
    else roots.push(n)
  }
  const sort = (ns: Node[], depth: number) => {
    ns.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    for (const n of ns) {
      n.depth = depth
      sort(n.children, depth + 1)
    }
  }
  sort(roots, 0)
  return roots
}

const flatten = (ns: Node[]): Node[] => ns.flatMap((n) => [n, ...flatten(n.children)])

/** 그룹웨어 > 공유정보 > 조직도관리 — 부서 마스터(트리)와 사원 배치 */
export default function OrgChartPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Department | 'new' | null>(null)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load() {
    setError('')
    try {
      const [d, e] = await Promise.all([
        api.get<Department[]>('/departments'),
        api.get<EmployeeMaster[]>('/employees'),
      ])
      setDepartments(d.data)
      setEmployees(e.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])

  const tree = useMemo(() => flatten(buildTree(departments)), [departments])
  const unassigned = employees.filter((e) => e.departmentId == null)
  const members = selected == null ? unassigned : employees.filter((e) => e.departmentId === selected)
  const selectedDept = departments.find((d) => d.id === selected)

  async function assign(employeeId: number, departmentId: number | null) {
    try {
      await api.put(`/employees/${employeeId}/department`, { departmentId })
      flash(departmentId == null ? '부서 배치를 해제했습니다.' : '부서를 옮겼습니다.')
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function remove(d: Department) {
    if (!window.confirm(`부서 「${d.name}」을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/departments/${d.id}`)
      if (selected === d.id) setSelected(null)
      flash('부서를 삭제했습니다.')
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  return (
    <EcListShell title="조직도관리" actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setEditing('new')}>+ 부서 등록</button>
        <span style={{ fontSize: 12, color: '#9aa1ab' }}>부서를 클릭하면 소속 사원이 보입니다. 사원의 부서는 오른쪽에서 바로 바꿀 수 있습니다.</span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* 좌: 부서 트리 */}
        <div style={{ flex: '0 0 46%' }}>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>부서 (조직도)</th>
                <th style={{ width: 90 }}>부서코드</th>
                <th style={{ width: 60, textAlign: 'right' }}>인원</th>
                <th style={{ width: 90, textAlign: 'center' }}>처리</th>
              </tr>
            </thead>
            <tbody>
              {tree.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>부서가 없습니다. 「부서 등록」으로 조직도를 만드세요.</td></tr>
              ) : tree.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelected(selected === d.id ? null : d.id)}
                  style={{ cursor: 'pointer', background: selected === d.id ? '#eef5ff' : undefined }}
                >
                  <td style={{ paddingLeft: 8 + d.depth * 18 }}>
                    <span style={{ color: '#c3c8cf', marginRight: 4 }}>{d.depth > 0 ? '└' : ''}</span>
                    <span style={{ fontWeight: d.depth === 0 ? 700 : 400, color: d.active ? undefined : '#b0b6bd' }}>{d.name}</span>
                    {!d.active && <span style={{ marginLeft: 6, fontSize: 11, color: '#b0b6bd' }}>(비활성)</span>}
                  </td>
                  <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{d.code}</td>
                  <td style={{ textAlign: 'right' }}>{d.employeeCount}</td>
                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'inline-flex', gap: 3 }}>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditing(d)}>수정</button>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(d)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {unassigned.length > 0 && (
            <p style={{ marginTop: 8, fontSize: 12, color: '#c60a2e' }}>
              미배치 사원 {unassigned.length}명 —{' '}
              <span onClick={() => setSelected(null)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>보기</span>
            </p>
          )}
        </div>

        {/* 우: 소속 사원 */}
        <div style={{ flex: 1 }}>
          <div style={{ padding: '6px 8px', background: '#f5f7fa', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            {selectedDept ? `${selectedDept.name} 소속 사원` : '미배치 사원'} ({members.length}명)
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>사번</th>
                <th>성명</th>
                <th>직위</th>
                <th style={{ width: 170 }}>부서 이동</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>사원이 없습니다.</td></tr>
              ) : members.map((e, i) => (
                <tr key={e.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{e.code}</td>
                  <td>{e.name}</td>
                  <td>{e.jobTitle}</td>
                  <td>
                    <select
                      className="ec-input"
                      style={{ width: '100%' }}
                      value={e.departmentId ?? ''}
                      onChange={(ev) => assign(e.id, ev.target.value ? Number(ev.target.value) : null)}
                    >
                      <option value="">(미배치)</option>
                      {tree.map((d) => (
                        <option key={d.id} value={d.id}>{' '.repeat(d.depth * 2)}{d.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <DepartmentForm
          department={editing === 'new' ? null : editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); flash(msg); load() }}
        />
      )}
    </EcListShell>
  )
}

function DepartmentForm({ department, departments, onClose, onSaved }: {
  department: Department | null
  departments: Department[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [name, setName] = useState(department?.name ?? '')
  const [code, setCode] = useState(department?.code ?? '')
  const [parentId, setParentId] = useState(department?.parentId != null ? String(department.parentId) : '')
  const [sortOrder, setSortOrder] = useState(String(department?.sortOrder ?? 0))
  const [active, setActive] = useState(department?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 자기 자신은 상위 부서로 고를 수 없다 (하위 부서 선택은 서버가 사이클로 거른다)
  const parents = departments.filter((d) => d.id !== department?.id)

  async function save() {
    setError('')
    if (!name.trim()) return setError('부서명을 입력하세요.')
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        parentId: parentId ? Number(parentId) : null,
        sortOrder: Number(sortOrder) || 0,
      }
      if (department) {
        await api.put(`/departments/${department.id}`, { ...body, active })
        onSaved('부서를 수정했습니다.')
      } else {
        await api.post('/departments', { ...body, code: code.trim() || undefined })
        onSaved('부서를 등록했습니다.')
      }
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 460, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{department ? '부서 수정' : '부서 등록'}</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>부서명<span style={{ color: '#c60a2e' }}>*</span></th>
                <td><input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>부서코드</th>
                <td>
                  {department ? (
                    <span style={{ fontFamily: 'monospace' }}>{department.code}</span>
                  ) : (
                    <input className="ec-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="비우면 자동 채번 (DEPT-0001)" style={{ width: '100%' }} />
                  )}
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>상위 부서</th>
                <td>
                  <select className="ec-input" value={parentId} onChange={(e) => setParentId(e.target.value)} style={{ width: '100%' }}>
                    <option value="">(최상위)</option>
                    {parents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>표시 순서</th>
                <td><input className="ec-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ width: 100 }} /></td>
              </tr>
              {department && (
                <tr>
                  <th style={{ background: '#f5f7fa' }}>사용</th>
                  <td>
                    <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 사용
                    </label>
                  </td>
                </tr>
              )}
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

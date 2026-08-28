import { useEffect, useState, type FormEvent, useRef} from 'react'
import { api, extractErrorMessage } from '../api/client'
import { useTableColumnCheck } from '../utils/assertTableColumns'
import CodePickerField from '../components/CodePickerField'
import type { Role, User } from '../api/types'
import EcListShell from '../components/EcListShell'
import { useTableSort } from '../utils/useTableSort'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadAll() {
    setLoading(true)
    try {
      const [u, r] = await Promise.all([api.get<User[]>('/users'), api.get<Role[]>('/roles')])
      setUsers(u.data)
      setRoles(r.data)
    } catch (err) {
      setError(extractErrorMessage(err, '데이터를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function toggleEnabled(user: User) {
    try {
      // 사용여부만 보낸다. 이름·권한까지 되돌려 보내면 이 목록을 띄운 뒤 다른 사람이
      // 바꾼 값을 토글한 사람이 모르는 채로 되돌린다.
      await api.patch(`/users/${user.id}`, { enabled: !user.enabled })
      loadAll()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function remove(user: User) {
    if (!confirm(`'${user.name}(${user.username})' 계정을 삭제할까요?`)) return
    try {
      await api.delete(`/users/${user.id}`)
      loadAll()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const roleLabel = (code: string) =>
    roles.find((r) => r.name === code)?.displayName ?? code

  /*
   * 두 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다.
   * [부서]·[권한]은 원본에도 표시가 없어 걸지 않았다.
   */
  const sort = useTableSort(users, {
    아이디: (u) => u.username,
    이름: (u) => u.name,
  })


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '사용자', [])

  return (
    <EcListShell
      title="사용자등록 리스트"
      formTitle="새 사용자 등록"
      renderForm={(close) => (
        <CreateUserForm
          roles={roles}
          onCreated={() => {
            close()
            loadAll()
          }}
        />
      )}
      actions={[{ label: 'Excel' }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('아이디')}>아이디 {sort.mark('아이디')}</th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('이름')}>이름 {sort.mark('이름')}</th>
            <th>부서</th>
            <th style={{ width: 110 }}>사원</th>
            <th>권한</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : users.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : (
            sort.sorted.map((u, idx) => (
              <tr key={u.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{u.username}</td>
                <td>{u.name}</td>
                <td>{u.department ?? '-'}</td>
                <td style={{ color: u.employeeId ? undefined : '#c9ced6' }}>{u.employeeId ? '연결됨' : '안 이음'}</td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {u.roles.map((r) => (
                      <span key={r} style={{ background: '#eef1fb', color: 'var(--ec-blue)', padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{roleLabel(r)}</span>
                    ))}
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => toggleEnabled(u)} className="ec-btn" style={{ height: 20, padding: '0 8px', color: u.enabled ? '#1c7c3c' : '#9aa1ab' }}>
                    {u.enabled ? '활성' : '비활성'}
                  </button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => remove(u)} className="no-ec" style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

/**
 * 계정에 이을 사원. 이어 두면 근태현황이 [직급]·[사원번호]·[부서명]을
 * <b>사원 마스터에서</b> 가져온다 — 계정의 자유입력 부서는 부서 마스터와 맞는다는
 * 보장이 없어 같은 부서가 두 이름으로 갈릴 수 있다.
 */
interface EmployeeLite { id: number; code: string; name: string; jobTitle: string | null }

function CreateUserForm({ roles, onCreated }: { roles: Role[]; onCreated: () => void }) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    department: '',
    employeeId: '',
  })
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  useEffect(() => {
    api.get<EmployeeLite[]>('/employees')
      .then((r) => setEmployees(r.data))
      .catch(() => { /* 사원 목록을 못 받아도 계정은 만들 수 있다 */ })
  }, [])
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['STAFF'])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function toggleRole(code: string) {
    setSelectedRoles((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code],
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/users', {
        ...form,
        email: form.email || undefined,
        department: form.department || undefined,
        employeeId: form.employeeId ? Number(form.employeeId) : null,
        roleNames: selectedRoles,
      })
      onCreated()
    } catch (err) {
      setError(extractErrorMessage(err, '사용자 생성에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'ec-input w-full'

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-slate-600">아이디 *</label>
          <input className={inputCls} value={form.username} onChange={(e) => update('username', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">비밀번호 *</label>
          <input type="password" className={inputCls} value={form.password} onChange={(e) => update('password', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">이름 *</label>
          <input className={inputCls} value={form.name} onChange={(e) => update('name', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">부서</label>
          <input className={inputCls} value={form.department} onChange={(e) => update('department', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">사원</label>
          {/* 원본은 이 칸을 <b>코드도움</b>으로 받는다(사본 실측 525칸, 예외 없음) — 드롭다운은 항목이 늘면 못 찾는다. */}
          <CodePickerField label="사원" hideLabel fill placeholder="사원"
                           emptyLabel="안 이음"
                           value={form.employeeId} onChange={(v) => update('employeeId', v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
          <span style={{ fontSize: 11, color: '#8a929c' }}>이어 두면 근태현황에 직급·사원번호가 나옵니다</span>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">이메일</label>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => update('email', e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm text-slate-600">권한 *</label>
        <div className="flex flex-wrap gap-3">
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={selectedRoles.includes(r.name)}
                onChange={() => toggleRole(r.name)}
              />
              {r.displayName}
            </label>
          ))}
        </div>
      </div>

      {/* 권한을 전부 해제하면 예전에는 서버가 STAFF(권한 22개)를 조용히 붙였다.
          이제 서버가 거절하므로, 여기서도 눌리기 전에 이유를 보여 준다. */}
      {selectedRoles.length === 0 && (
        <p style={{ marginTop: 8, color: '#c60a2e', fontSize: 12.5 }}>
          권한그룹을 하나 이상 선택하세요.
        </p>
      )}

      {error && <p style={{ marginTop: 10, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={submitting || selectedRoles.length === 0}
          className="ec-btn ec-btn-primary"
        >
          {submitting ? '등록 중…' : '등록'}
        </button>
      </div>
    </form>
  )
}

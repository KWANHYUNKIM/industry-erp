import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../api/client'
import type { Role, User } from '../api/types'
import EcListShell from '../components/EcListShell'

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
      await api.put(`/users/${user.id}`, {
        name: user.name,
        email: user.email ?? undefined,
        department: user.department ?? undefined,
        enabled: !user.enabled,
        roleNames: user.roles,
      })
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

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>아이디 ▼</th>
            <th>이름 ▼</th>
            <th>부서</th>
            <th>권한</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : users.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 사용자가 없습니다.</td></tr>
          ) : (
            users.map((u, idx) => (
              <tr key={u.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{u.username}</td>
                <td>{u.name}</td>
                <td>{u.department ?? '-'}</td>
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

function CreateUserForm({ roles, onCreated }: { roles: Role[]; onCreated: () => void }) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    department: '',
  })
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
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-slate-600">이메일</label>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => update('email', e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm text-slate-600">권한</label>
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

      {error && <p style={{ marginTop: 10, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={submitting} className="ec-btn ec-btn-primary">
          {submitting ? '등록 중…' : '등록'}
        </button>
      </div>
    </form>
  )
}

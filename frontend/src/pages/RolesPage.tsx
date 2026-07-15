import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../api/client'
import type { Permission, Role } from '../api/types'
import EcListShell from '../components/EcListShell'
import Modal from '../components/Modal'

/** 역할·권한 관리: 역할을 만들고, 역할이 접근할 메뉴(권한)를 체크박스로 부여한다.
 *  ADMIN 은 전권(바이패스)이라 권한 목록과 무관하게 모든 메뉴를 쓴다. */
export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [perms, setPerms] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Role | 'new' | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [r, p] = await Promise.all([
        api.get<Role[]>('/roles'),
        api.get<Permission[]>('/permissions'),
      ])
      setRoles(r.data)
      setPerms(p.data)
    } catch (err) {
      setError(extractErrorMessage(err, '데이터를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function remove(role: Role) {
    if (!confirm(`역할 '${role.displayName}(${role.name})' 을 삭제할까요?`)) return
    try {
      await api.delete(`/roles/${role.id}`)
      loadAll()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  return (
    <EcListShell
      title="역할·권한관리 리스트"
      onNew={() => setEditing('new')}
      actions={[{ label: 'Excel' }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <Modal
        open={editing !== null}
        title={editing === 'new' ? '새 역할 등록' : '역할 편집'}
        width={880}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <RoleForm
            key={editing === 'new' ? 'new' : editing.id}
            role={editing === 'new' ? null : editing}
            perms={perms}
            onDone={() => {
              setEditing(null)
              loadAll()
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>코드 ▼</th>
            <th>역할명</th>
            <th>설명</th>
            <th style={{ textAlign: 'center' }}>사용자</th>
            <th style={{ textAlign: 'center' }}>접근 메뉴</th>
            <th style={{ textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : roles.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 역할이 없습니다.</td></tr>
          ) : (
            roles.map((r, idx) => {
              const isAdmin = r.name === 'ADMIN'
              return (
                <tr key={r.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>
                    {r.name}
                    {r.system && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#9aa1ab' }}>기본</span>}
                  </td>
                  <td>{r.displayName}</td>
                  <td style={{ color: '#6b7280' }}>{r.description ?? '-'}</td>
                  <td style={{ textAlign: 'center' }}>{r.userCount ?? 0}</td>
                  <td style={{ textAlign: 'center' }}>
                    {isAdmin
                      ? <span style={{ color: 'var(--ec-blue)', fontWeight: 700 }}>전체(관리자)</span>
                      : `${r.permissionCodes?.length ?? 0}개`}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => setEditing(r)} className="ec-btn" style={{ height: 20, padding: '0 8px' }}>편집</button>
                    {!r.system && (
                      <button onClick={() => remove(r)} className="no-ec" style={{ marginLeft: 8, border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

function RoleForm({
  role,
  perms,
  onDone,
  onCancel,
}: {
  role: Role | null
  perms: Permission[]
  onDone: () => void
  onCancel: () => void
}) {
  const isEdit = !!role
  const isAdmin = role?.name === 'ADMIN'
  const [name, setName] = useState(role?.name ?? '')
  const [displayName, setDisplayName] = useState(role?.displayName ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissionCodes ?? []))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 카테고리별로 묶는다 (표시 순서 유지)
  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of perms) {
      if (!map.has(p.category)) map.set(p.category, [])
      map.get(p.category)!.push(p)
    }
    return [...map.entries()]
  }, [perms])

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function toggleCategory(items: Permission[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const p of items) {
        if (on) next.add(p.code)
        else next.delete(p.code)
      }
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const permissionCodes = [...selected]
      if (isEdit) {
        await api.put(`/roles/${role!.id}`, { displayName, description: description || undefined, permissionCodes })
      } else {
        await api.post('/roles', { name, displayName, description: description || undefined, permissionCodes })
      }
      onDone()
    } catch (err) {
      setError(extractErrorMessage(err, '저장에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'ec-input w-full'

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm text-slate-600">역할 코드 *</label>
          <input
            className={inputCls}
            value={name}
            disabled={isEdit}
            placeholder="예: SALES_TEAM"
            onChange={(e) => setName(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">역할명 *</label>
          <input className={inputCls} value={displayName} placeholder="예: 영업팀" onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">설명</label>
          <input className={inputCls} value={description ?? ''} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm text-slate-600">접근 가능한 메뉴(권한)</label>
        {isAdmin ? (
          <p style={{ background: '#eef1fb', color: 'var(--ec-blue-dark)', padding: '8px 12px', fontSize: 12.5, borderRadius: 4 }}>
            관리자(ADMIN)는 모든 메뉴에 접근하는 전권 역할입니다. 개별 권한 설정과 무관합니다.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {grouped.map(([category, items]) => {
              const allOn = items.every((p) => selected.has(p.code))
              return (
                <div key={category} style={{ border: '1px solid #e6e9ee', borderRadius: 4, padding: '8px 10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5, color: '#3a4453', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #eef1f4' }}>
                    <input type="checkbox" checked={allOn} onChange={() => toggleCategory(items, !allOn)} />
                    {category}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {items.map((p) => (
                      <label key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#4a5260' }}>
                        <input type="checkbox" checked={selected.has(p.code)} onChange={() => toggle(p.code)} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {error && <p style={{ marginTop: 10, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} className="ec-btn">취소</button>
        <button type="submit" disabled={submitting} className="ec-btn ec-btn-primary">
          {submitting ? '저장 중…' : isEdit ? '수정' : '등록'}
        </button>
      </div>
    </form>
  )
}

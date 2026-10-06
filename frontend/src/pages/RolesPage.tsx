import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../api/client'
import type { Permission, Role } from '../types/api'
import EcListShell from '../components/EcListShell'
import { useTableSort } from '../utils/useTableSort'
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


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(roles, {
    코드: (r) => r.name,
  })

  return (
    <EcListShell
      title="역할·권한관리 리스트"
      onNew={() => setEditing('new')}
      actions={[{ label: 'Excel' }]}
    >
      {error && <p className="mb-2 rounded bg-ec-danger-bg px-3 py-2 text-sm text-ec-danger">{error}</p>}

      <Modal error={error}
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
            <th className="w-[34px]"></th>
            <th className="cursor-pointer" onClick={() => sort.toggle('코드')}>코드 {sort.mark('코드')}</th>
            <th>역할명</th>
            <th>설명</th>
            <th className="text-center">사용자</th>
            <th className="text-center">접근 메뉴</th>
            <th className="text-center">관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : roles.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            sort.sorted.map((r, idx) => {
              const isAdmin = r.name === 'ADMIN'
              return (
                <tr key={r.id}>
                  <td className="text-center text-ec-hint">{idx + 1}</td>
                  <td>
                    {r.name}
                    {r.system && <span className="ml-[6px] text-[10.5px] text-ec-hint">기본</span>}
                  </td>
                  <td>{r.displayName}</td>
                  <td className="text-ec-muted">{r.description ?? ''}</td>
                  <td className="text-center">{r.userCount ?? 0}</td>
                  <td className="text-center">
                    {isAdmin
                      ? <span className="text-ec-blue font-bold">전체(관리자)</span>
                      : `${r.permissionCodes?.length ?? 0}개`}
                  </td>
                  <td className="text-center">
                    <button onClick={() => setEditing(r)} className="ec-btn" style={{ height: 20, padding: '0 8px' }}>편집</button>
                    {!r.system && (
                      <button onClick={() => remove(r)} className="no-ec" style={{ marginLeft: 8, border: 'none', background: 'none', color: 'var(--ec-danger)', cursor: 'pointer', fontSize: 12 }}>삭제</button>
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
          <label className="mb-1 block text-sm text-ec-label">역할 코드 *</label>
          <input
            className={inputCls}
            value={name}
            disabled={isEdit}
            placeholder="예: SALES_TEAM"
            onChange={(e) => setName(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ec-label">역할명 *</label>
          <input className={inputCls} value={displayName} placeholder="예: 영업팀" onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ec-label">설명</label>
          <input className={inputCls} value={description ?? ''} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm text-ec-label">접근 가능한 메뉴(권한)</label>
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
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5, color: 'var(--ec-text)', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #eef1f4' }}>
                    <input type="checkbox" checked={allOn} onChange={() => toggleCategory(items, !allOn)} />
                    {category}
                  </label>
                  <div className="flex flex-col gap-[4px]">
                    {items.map((p) => (
                      <label key={p.code} className="flex items-center gap-[6px] text-[12.5px] text-ec-label">
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

      {error && <p className="ec-alert ec-alert-danger mt-[10px]">{error}</p>}

      <div className="mt-[12px] flex justify-end gap-[8px]">
        <button type="button" onClick={onCancel} className="ec-btn">취소</button>
        <button type="submit" disabled={submitting} className="ec-btn ec-btn-primary">
          {submitting ? '저장 중…' : isEdit ? '수정' : '등록'}
        </button>
      </div>
    </form>
  )
}

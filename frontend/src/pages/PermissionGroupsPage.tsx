import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../api/client'
import EcListShell from '../components/EcListShell'
import { ecAlert, ecConfirm } from '../components/EcDialog'
import Modal from '../components/Modal'
import type { Role, User } from '../types/api'
import WorkPermissionWindow from '../features/auth/components/WorkPermissionWindow'

/**
 * Self-Customizing › 사용자관리 › 권한그룹 설정 — 원본 영상 0082 · 0083 · 2021.
 * [신규] → 권한코드 · 권한명 저장 → 그룹 오른쪽 업무권한 [설정](개별권한설정과 같은 창) → 사용자등록 [권한] 탭 기본권한에서 그룹을 고른다.
 * [사용자 보기] 는 그 그룹을 쓰는 사용자. 마스터(ADMIN)는 그룹이 아니라 목록에 없다.
 */
export default function PermissionGroupsPage() {
  const [groups, setGroups] = useState<Role[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState('')
  const [worksOf, setWorksOf] = useState<Role | null>(null)
  const [usersOf, setUsersOf] = useState<Role | null>(null)

  async function load() {
    try {
      const [r, u] = await Promise.all([api.get<Role[]>('/roles'), api.get<User[]>('/users')])
      setGroups(r.data.filter((g) => g.name !== 'ADMIN'))
      setUsers(u.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  useEffect(() => { void load() }, [])

  async function remove(g: Role) {
    if (!(await ecConfirm(`'${g.displayName}' 권한그룹을 삭제하시겠습니까?`))) return
    try {
      await api.delete(`/roles/${g.id}`)
      void load()
    } catch (e) {
      void ecAlert(extractErrorMessage(e))
    }
  }

  const members = (g: Role) => users.filter((u) => !u.master && u.basePermission === 'GROUP' && u.roles.includes(g.name))

  return (
    <EcListShell
      title="권한그룹 설정"
      formTitle="권한그룹 등록"
      formWidth={420}
      renderForm={(close) => <NewGroupForm onSaved={() => { close(); void load() }} />}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[6px]">{error}</p>}
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[140px]">권한코드</th>
            <th>권한명</th>
            <th className="w-[90px] text-right">사용자수</th>
            <th className="w-[90px] text-center">업무권한</th>
            <th className="w-[90px] text-center">사용자 보기</th>
            <th className="w-[70px] text-center">삭제</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.map((g, i) => (
            <tr key={g.id} data-group={g.name}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{g.name}</td>
              <td>{g.displayName}</td>
              <td className="text-right">{members(g).length}</td>
              <td className="text-center">
                <button type="button" className="ec-btn ec-btn-sm" aria-label={`${g.displayName} 업무권한 설정`} onClick={() => setWorksOf(g)}>설정</button>
              </td>
              <td className="text-center">
                <button type="button" className="ec-btn ec-btn-sm" onClick={() => setUsersOf(g)}>보기</button>
              </td>
              <td className="text-center">
                {!g.system && <button type="button" className="ec-btn ec-btn-sm" onClick={() => void remove(g)}>삭제</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {worksOf && <WorkPermissionWindow target="group" id={worksOf.id} onClose={() => setWorksOf(null)} onSaved={() => void load()} />}
      {usersOf && (
        <Modal open title={`사용자 보기 - ${usersOf.displayName}`} onClose={() => setUsersOf(null)} width={420}>
          <table className="w-full">
            <thead><tr><th>아이디</th><th>이름</th></tr></thead>
            <tbody>
              {members(usersOf).length === 0 ? <tr><td colSpan={2} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                : members(usersOf).map((u) => <tr key={u.id}><td>{u.username}</td><td>{u.name}</td></tr>)}
            </tbody>
          </table>
        </Modal>
      )}
    </EcListShell>
  )
}

function NewGroupForm({ onSaved }: { onSaved: () => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      // 새 그룹은 업무권한이 하나도 없이 시작한다(전부 권한없음) — 업무권한 [설정] 에서 준다.
      await api.post('/roles', { name: code.trim(), displayName: name.trim(), permissionCodes: [] })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  return (
    <form onSubmit={submit} className="ec-form">
      <label className="block mb-[4px]" htmlFor="grp-code">권한코드</label>
      <input id="grp-code" className="ec-input w-full mb-[8px]" value={code} onChange={(e) => setCode(e.target.value)} maxLength={50} />
      <label className="block mb-[4px]" htmlFor="grp-name">권한명</label>
      <input id="grp-name" className="ec-input w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      {error && <p className="ec-alert ec-alert-danger mt-[8px]">{error}</p>}
      <div className="mt-[10px]"><button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button></div>
    </form>
  )
}

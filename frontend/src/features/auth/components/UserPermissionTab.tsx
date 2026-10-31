import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { ecAlert } from '../../../components/EcDialog'
import type { Role, User } from '../../../types/api'
import { BASE_LABEL, modeLabel, type BasePermission, type UserWorks } from '../workPermissions'
import WorkPermissionWindow from './WorkPermissionWindow'
import CodePickerField from '../../../components/codepicker/CodePickerField'

/**
 * 사용자등록 › 아이디 › [권한] 탭 — 기본권한(업무모든권한 · 업무권한없음 · 권한그룹 ▾) + 업무권한 [설정](개별권한설정 창).
 * 원본 도움말 '사용자 ID별 업무 권한 설정 방법' · 영상 0082 · 2932. 마스터는 모든 권한이라 고칠 것이 없다.
 */
export function UserPermissionWindow({ user, roles, onClose, onSaved }: {
  user: User
  roles: Role[]
  onClose: () => void
  onSaved: () => void
}) {
  const [data, setData] = useState<UserWorks | null>(null)
  const [base, setBase] = useState<BasePermission>('GROUP')
  const [groupId, setGroupId] = useState<string>('')
  const [error, setError] = useState('')
  const [works, setWorks] = useState(false)
  const groups = roles.filter((r) => r.name !== 'ADMIN')

  const load = () => api.get<UserWorks>(`/work-permissions/users/${user.id}`)
    .then((r) => { setData(r.data); setBase(r.data.basePermission); setGroupId(r.data.groupId ? String(r.data.groupId) : '') })
    .catch((e) => setError(extractErrorMessage(e)))
  useEffect(() => { void load() }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveBase() {
    setError('')
    if (base === 'GROUP' && !groupId) { setError('권한그룹을 고르세요.'); return }
    try {
      await api.put(`/work-permissions/users/${user.id}/base`, { basePermission: base, groupId: base === 'GROUP' ? Number(groupId) : null })
      await ecAlert('저장되었습니다.')
      onSaved()
      void load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const individual = data?.works.filter((w) => w.individual && !w.masterOnly) ?? []

  return (
    <Modal open title={`사용자등록 - ${user.name}(${user.username})`} onClose={onClose} width={560} error={error}>
      <div className="ec-pills mb-[8px]"><button type="button" className="ec-pill active">권한</button></div>
      {data?.master ? (
        <p className="ec-alert">마스터(관리자설정)는 모든 업무 권한을 가집니다. 권한을 나누려면 관리자설정에서 마스터를 해제하세요.</p>
      ) : (
        <div className="ec-form">
          <table className="w-full">
            <tbody>
              <tr>
                <th className="w-[110px] text-left">기본권한</th>
                <td>
                  <div className="flex gap-[4px] items-center">
                    <select className="ec-input w-[140px]" aria-label="기본권한" value={base}
                            onChange={(e) => setBase(e.target.value as BasePermission)}>
                      {(['ALL', 'NONE', 'GROUP'] as BasePermission[]).map((b) => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}
                    </select>
                    {base === 'GROUP' && (
                      <select className="ec-input w-[160px]" aria-label="권한그룹" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                        <option value="">선택</option>
                        {groups.map((g) => <option key={g.id} value={g.id}>{g.displayName}</option>)}
                      </select>
                    )}
                    <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveBase()}>저장</button>
                  </div>
                </td>
              </tr>
              <tr>
                <th className="text-left">업무권한</th>
                <td>
                  <button type="button" className="ec-btn" aria-label="업무권한 설정" onClick={() => setWorks(true)}>설정</button>
                  <span className="ml-[8px] text-ec-hint">
                    {individual.length === 0 ? '개별권한 없음(기본권한을 따름)'
                      : individual.map((w) => `${w.workName} ${modeLabel(w)}`).join(', ')}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-[10px]"><button type="button" className="ec-btn" onClick={onClose}>닫기</button></div>
      {works && <WorkPermissionWindow target="user" id={user.id} onClose={() => setWorks(false)} onSaved={() => { void load(); onSaved() }} />}
    </Modal>
  )
}

/** [권한복사] — 원본대상 한 명의 권한을 복사대상 여러 명에게(영상 1104). 마스터 여부는 옮기지 않는다. */
export function PermissionCopyWindow({ users, onClose, onDone }: { users: User[]; onClose: () => void; onDone: () => void }) {
  const [source, setSource] = useState('')
  const [targets, setTargets] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  async function save() {
    setError('')
    try {
      await api.post('/work-permissions/copy', { sourceUserId: source ? Number(source) : null, targetUserIds: [...targets] })
      await ecAlert('권한을 복사했습니다.')
      onDone()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  return (
    <Modal open title="권한복사" onClose={onClose} width={460} error={error}>
      <div className="ec-form">
        <label className="block mb-[4px]">원본대상</label>
        <div className="mb-[10px]">
          <CodePickerField label="원본대상" hideLabel fill placeholder="원본대상" value={source} onChange={setSource}
                           items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name }))} />
        </div>
        <label className="block mb-[4px]">복사대상</label>
        <div className="max-h-[220px] overflow-auto">
          {users.filter((u) => String(u.id) !== source).map((u) => (
            <label key={u.id} className="block">
              <input type="checkbox" aria-label={`복사대상 ${u.username}`} checked={targets.has(u.id)}
                     onChange={(e) => setTargets((s) => { const n = new Set(s); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n })} />
              {' '}{u.name}({u.username})
            </label>
          ))}
        </div>
      </div>
      <div className="mt-[10px] flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

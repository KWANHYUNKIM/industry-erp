import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../api/client'
import EcListShell from '../components/EcListShell'
import { ecAlert, ecConfirm } from '../components/EcDialog'
import type { User } from '../types/api'
import { useAuth } from '../features/auth/AuthContext'
import CodePickerField from '../components/CodePickerField'

interface Master { id: number; username: string; name: string }

/**
 * Self-Customizing › 사용자관리 › 관리자설정 — 원본 영상 2531. 마스터(전권 · 아이디 등록 · 권한 설정 · 관리자 지정)를 여러 명 둔다.
 * 원본은 [설정] → 돋보기로 아이디 고르기 → [적용] · 이름 옆 (−) 로 빼기 → [저장](마스터는 확인 문구 + [변경]).
 * 설정 관리자 · 보안 관리자는 아직 없다(마스터만). 확인 문구 입력 대신 확인 창을 띄운다(가정).
 */
export default function MastersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [masters, setMasters] = useState<Master[]>([])
  const [pick, setPick] = useState('')
  const [error, setError] = useState('')

  async function load() {
    try {
      const [m, u] = await Promise.all([api.get<Master[]>('/work-permissions/masters'), api.get<User[]>('/users')])
      setMasters(m.data)
      setUsers(u.data.filter((x) => x.enabled))
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  useEffect(() => { void load() }, [])

  function add() {
    const u = users.find((x) => String(x.id) === pick)
    if (!u || masters.some((m) => m.id === u.id)) return
    setMasters((ms) => [...ms, { id: u.id, username: u.username, name: u.name }])
    setPick('')
  }

  async function save() {
    if (!(await ecConfirm('마스터를 변경하시겠습니까?\n마스터는 모든 업무 권한과 사용자 · 권한 설정 권한을 가집니다.'))) return
    try {
      setMasters((await api.put<Master[]>('/work-permissions/masters', { userIds: masters.map((m) => m.id) })).data)
      await ecAlert('저장되었습니다.')
    } catch (e) {
      void ecAlert(extractErrorMessage(e))
    }
  }

  return (
    <EcListShell title="관리자설정" searchable={false} actions={[{ label: '저장(F8)', primary: true, onClick: () => void save() }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[6px]">{error}</p>}
      <table className="w-full">
        <thead>
          <tr><th className="w-[120px]">관리자 구분</th><th>사용자</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>마스터</td>
            <td>
              <div className="flex flex-wrap gap-[6px] items-center mb-[6px]">
                {masters.map((m) => (
                  <span key={m.id} className="ec-master-chip" data-master={m.username}>
                    {m.name}({m.username})
                    {m.username !== user?.username && (
                      <button type="button" className="x" aria-label={`${m.username} 빼기`}
                              onClick={() => setMasters((ms) => ms.filter((x) => x.id !== m.id))}>−</button>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex gap-[4px]">
                <div className="w-[240px]">
                  <CodePickerField label="마스터로 둘 사용자" hideLabel fill placeholder="사용자" value={pick} onChange={setPick}
                                   items={users.filter((u) => !masters.some((m) => m.id === u.id))
                                     .map((u) => ({ value: String(u.id), code: u.username, name: u.name }))} />
                </div>
                <button type="button" className="ec-btn" onClick={add}>적용</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </EcListShell>
  )
}

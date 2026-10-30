import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { ecAlert } from '../../../components/EcDialog'
import {
  ACTIONS, menusOfWork, toSave,
  type GroupWorks, type SaveWorkRow, type UserWorks, type WorkRow,
} from '../workPermissions'

/**
 * 개별권한설정 창 — 사용자등록 [권한] 탭 업무권한 [설정] · 권한그룹 설정의 업무권한 [설정] 이 같이 쓴다.
 * 원본(도움말 '사용자 ID별 업무 권한 설정 방법' · 영상 2932): 줄 = 업무, [권한구분] 기본권한/개별권한(사용자만),
 * 권한있음/권한없음, 오른쪽 예외(행위) [설정] · 예외(메뉴) [설정]. 예외는 권한있음일 때만 걸 수 있다.
 * 원본 창의 정확한 칸 모양은 마스터 화면이라 실측하지 못했다 — 영상 설명대로 짠 것(가정).
 */
export default function WorkPermissionWindow({ target, id, onClose, onSaved }: {
  target: 'user' | 'group'
  id: number
  onClose: () => void
  onSaved?: () => void
}) {
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<WorkRow[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionOf, setActionOf] = useState<string | null>(null)
  const [menuOf, setMenuOf] = useState<string | null>(null)

  useEffect(() => {
    const url = target === 'user' ? `/work-permissions/users/${id}` : `/work-permissions/groups/${id}`
    api.get<UserWorks | GroupWorks>(url)
      .then((r) => {
        setRows(r.data.works.filter((w) => !w.masterOnly))
        setTitle(target === 'user' ? `${(r.data as UserWorks).name}(${(r.data as UserWorks).username})` : (r.data as GroupWorks).name)
      })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [target, id])

  const patch = (code: string, p: Partial<WorkRow>) =>
    setRows((rs) => rs.map((r) => (r.workCode === code ? { ...r, ...p } : r)))

  function setMode(r: WorkRow, allow: boolean) {
    patch(r.workCode, allow
      ? { mode: 'ALLOW', create: true, update: true, delete: true, export: true, individual: true }
      : { mode: 'DENY', create: false, update: false, delete: false, export: false, menus: {}, individual: true })
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const send: SaveWorkRow[] = rows.filter((r) => target === 'group' || r.individual).map(toSave)
      const url = target === 'user' ? `/work-permissions/users/${id}/works` : `/work-permissions/groups/${id}/works`
      await api.put(url, { rows: send })
      await ecAlert('저장되었습니다.')
      onSaved?.()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const actionRow = rows.find((r) => r.workCode === actionOf)
  const menuRow = rows.find((r) => r.workCode === menuOf)

  return (
    <Modal open title={`개별권한설정${title ? ` - ${title}` : ''}`} onClose={onClose} width={760} error={error}>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full ec-work-perm">
          <thead>
            <tr>
              <th className="w-[70px]">구분</th>
              <th>업무</th>
              {target === 'user' && <th className="w-[100px]">권한구분</th>}
              <th className="w-[170px]">권한</th>
              <th className="w-[130px]">예외(행위)</th>
              <th className="w-[130px]">예외(메뉴)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const locked = target === 'user' && !r.individual
              const deny = r.mode === 'DENY'
              return (
                <tr key={r.workCode} data-work={r.workCode}>
                  <td className="text-ec-hint">{r.category}</td>
                  <td>{r.workName}</td>
                  {target === 'user' && (
                    <td>
                      <select className="ec-input w-full" aria-label={`${r.workName} 권한구분`} value={r.individual ? 'Y' : 'N'}
                              onChange={(e) => patch(r.workCode, { individual: e.target.value === 'Y' })}>
                        <option value="N">기본권한</option>
                        <option value="Y">개별권한</option>
                      </select>
                    </td>
                  )}
                  <td>
                    <label className="mr-[10px]"><input type="radio" name={`m-${r.workCode}`} disabled={locked} checked={!deny}
                                                       aria-label={`${r.workName} 권한있음`} onChange={() => setMode(r, true)} /> 권한있음</label>
                    <label><input type="radio" name={`m-${r.workCode}`} disabled={locked} checked={deny}
                                  aria-label={`${r.workName} 권한없음`} onChange={() => setMode(r, false)} /> 권한없음</label>
                  </td>
                  <td>
                    <button type="button" className="ec-btn ec-btn-sm" disabled={locked || deny} aria-label={`${r.workName} 예외(행위)`}
                            onClick={() => setActionOf(r.workCode)}>설정</button>
                    {!deny && !(r.create && r.update && r.delete && r.export) && <span className="ml-[4px] text-ec-danger">예외</span>}
                  </td>
                  <td>
                    <button type="button" className="ec-btn ec-btn-sm" disabled={locked || deny} aria-label={`${r.workName} 예외(메뉴)`}
                            onClick={() => setMenuOf(r.workCode)}>설정</button>
                    {!deny && Object.values(r.menus ?? {}).some((v) => v === false) && <span className="ml-[4px] text-ec-danger">예외</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-[6px] text-ec-hint">예외 설정은 업무별 권한보다 항상 우선합니다. 권한구분이 기본권한인 업무는 기본권한(권한그룹)을 따릅니다.</p>
      <div className="mt-[10px] flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void save()}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>

      {actionRow && (
        <ActionExceptionWindow row={actionRow} onClose={() => setActionOf(null)}
                               onApply={(p) => { patch(actionRow.workCode, p); setActionOf(null) }} />
      )}
      {menuRow && (
        <MenuExceptionWindow row={menuRow} onClose={() => setMenuOf(null)}
                             onApply={(menus) => { patch(menuRow.workCode, { menus }); setMenuOf(null) }} />
      )}
    </Modal>
  )
}

/** 예외(행위) — 입력 · 수정 · 삭제 · 외부전송마다 '권한없음' 에 체크하면 그 행위가 막힌다(영상 2932). 조회는 늘 된다. */
export function ActionExceptionWindow({ row, onClose, onApply }: {
  row: Pick<WorkRow, 'workName' | 'create' | 'update' | 'delete' | 'export'>
  onClose: () => void
  onApply: (p: { create: boolean; update: boolean; delete: boolean; export: boolean }) => void
}) {
  const [v, setV] = useState({ create: row.create, update: row.update, delete: row.delete, export: row.export })
  return (
    <Modal open title={`예외(행위) - ${row.workName}`} onClose={onClose} width={360}>
      <table className="w-full">
        <thead><tr><th>행위</th><th className="w-[90px] text-center">권한없음</th></tr></thead>
        <tbody>
          <tr><td>조회</td><td className="text-center text-ec-hint">-</td></tr>
          {ACTIONS.map((a) => (
            <tr key={a.key}>
              <td>{a.label}</td>
              <td className="text-center">
                <input type="checkbox" aria-label={`${a.label} 권한없음`} checked={!v[a.key]}
                       onChange={(e) => setV((x) => ({ ...x, [a.key]: !e.target.checked }))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-[10px] flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => onApply(v)}>적용</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/** 예외(메뉴) — 업무 안의 하위 메뉴마다 '권한없음' 에 체크하면 그 메뉴만 자물쇠 화면이 된다(영상 2932). */
function MenuExceptionWindow({ row, onClose, onApply }: {
  row: WorkRow
  onClose: () => void
  onApply: (menus: Record<string, boolean>) => void
}) {
  const menus = useMemo(() => menusOfWork(row.workCode), [row.workCode])
  const [off, setOff] = useState<Set<string>>(
    () => new Set(Object.entries(row.menus ?? {}).filter(([, v]) => v === false).map(([k]) => k)))
  return (
    <Modal open title={`예외(메뉴) - ${row.workName}`} onClose={onClose} width={520}>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full">
          <thead><tr><th>메뉴</th><th>위치</th><th className="w-[80px] text-center">권한없음</th></tr></thead>
          <tbody>
            {menus.length === 0 ? (
              <tr><td colSpan={3} className="ec-empty">하위 메뉴가 없습니다.</td></tr>
            ) : menus.map((m) => (
              <tr key={m.to}>
                <td>{m.label}</td>
                <td className="text-ec-hint">{m.path}</td>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${m.label} 권한없음`} checked={off.has(m.to)}
                         onChange={(e) => setOff((s) => { const n = new Set(s); if (e.target.checked) n.add(m.to); else n.delete(m.to); return n })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-[10px] flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary"
                onClick={() => onApply(Object.fromEntries([...off].map((k) => [k, false])))}>적용</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}


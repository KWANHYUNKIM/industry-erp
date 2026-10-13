import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { useShortcut } from '../../../utils/useShortcut'

interface UserLite { id: number; name: string; department: string | null }

/**
 * 원본 일정관리등록 [참석자] · [공유자] 의 🔍 '사용자검색'(E070201, 2026-10-13 loginaa 실측).
 * 알약 [조직도](켬) · 격자 [소속부서](부서마다 칸을 합친다) [☐ 전체][성명], 하단 [적용(F8)][닫기].
 * 이미 칸에 든 사람은 체크된 채로 열린다. 적용하면 칸에 이름 칩(⊖ 로 뺀다)이 선다.
 * 원본 알약 [결재라인별] 은 재지 않아 두지 않는다.
 */
export default function UserPickModal({ selected, onApply, onClose }: {
  selected: string[]; onApply: (names: string[]) => void; onClose: () => void
}) {
  const [users, setUsers] = useState<UserLite[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [applied, setApplied] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set(selected))

  useEffect(() => {
    api.get<UserLite[]>('/users').then((r) => setUsers(r.data)).catch((err) => setError(extractErrorMessage(err)))
  }, [])
  const apply = () => onApply(users.map((u) => u.name).filter((n) => picked.has(n)).concat([...picked].filter((n) => !users.some((u) => u.name === n))))
  useShortcut('F8', apply)
  useShortcut('F3', () => setApplied(keyword))

  const shown = users.filter((u) => !applied || u.name.includes(applied) || (u.department ?? '').includes(applied))
  const groups = new Map<string, UserLite[]>()
  for (const u of shown) {
    const d = u.department || '(미지정)'
    groups.set(d, [...(groups.get(d) ?? []), u])
  }
  const allOn = shown.length > 0 && shown.every((u) => picked.has(u.name))
  const toggle = (name: string) => setPicked((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n })

  return (
    <Modal open title="사용자검색" width={420} error={error} onClose={onClose}>
      <div className="flex items-center mb-[8px]">
        <span className="text-[14px] font-bold">사용자검색</span>
        <div className="ml-auto flex gap-[4px]">
          <input className="ec-input w-[110px]" placeholder="입력 후 [Enter]" aria-label="사용자 검색" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setApplied(keyword) }} />
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => setApplied(keyword)}>Search(F3)</button>
        </div>
      </div>
      <div className="ec-pills mb-[8px]"><button type="button" className="ec-pill active">조직도</button></div>
      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full table-fixed">
          <thead>
            <tr>
              <th>소속부서</th>
              <th className="w-[34px]">
                <input type="checkbox" aria-label="전체" checked={allOn}
                       onChange={() => setPicked((s) => { const n = new Set(s); for (const u of shown) { if (allOn) n.delete(u.name); else n.add(u.name) } return n })} />
              </th>
              <th>성명</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : [...groups.entries()].flatMap(([dept, list]) => list.map((u, i) => (
              <tr key={u.id}>
                {i === 0 && <td rowSpan={list.length}>{dept}</td>}
                <td className="text-center">
                  <input type="checkbox" aria-label={u.name} checked={picked.has(u.name)} onChange={() => toggle(u.name)} />
                </td>
                <td className="cursor-pointer" onClick={() => toggle(u.name)}>{u.name}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-[6px] mt-[14px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

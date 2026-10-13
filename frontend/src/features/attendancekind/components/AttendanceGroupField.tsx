import { useEffect, useState } from 'react'
import CodePickerField from '../../../components/CodePickerField'
import Modal from '../../../components/Modal'
import { api, extractErrorMessage } from '../../../api/client'

interface Group { id: number; code: string; name: string }

/**
 * 근태항목등록의 [근태그룹] 칸 — 원본은 코드도움('근태그룹검색': 근태그룹 코드 · 근태그룹 명, [신규] · [수정])이다(2026-10-03 실측).
 * 고르면 그룹 <b>이름</b>을 담는다. 옆 [신규]가 원본 '근태그룹등록' 창(근태그룹 코드 00001 꼴 미리 채움 · 근태그룹 명)을 연다.
 * [수정]은 고른 그룹의 이름을 바꾼다(코드는 막힘) — 그 그룹을 쓰던 근태항목도 서버가 같이 바꾼다.
 */
export default function AttendanceGroupField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)

  const load = () => api.get<Group[]>('/hr/attendance-kind-groups').then((r) => setGroups(r.data)).catch(() => setGroups([]))
  useEffect(() => { load() }, [])

  async function openNew() {
    setError(''); setName(''); setCode(''); setEditId(null); setOpen(true)
    try { setCode((await api.get<{ code: string }>('/hr/attendance-kind-groups/next-code')).data.code) } catch { /* 비우면 서버가 매긴다 */ }
  }
  function openEdit() {
    const g = groups.find((x) => x.name === value)
    if (!g) return
    setError(''); setEditId(g.id); setCode(g.code); setName(g.name); setOpen(true)
  }
  async function save() {
    if (!name.trim()) { setError('근태그룹 명을 입력 바랍니다.'); return }
    try {
      const body = { code: code.trim() || null, name: name.trim() }
      const r = editId ? await api.put<Group>(`/hr/attendance-kind-groups/${editId}`, body) : await api.post<Group>('/hr/attendance-kind-groups', body)
      await load()
      onChange(r.data.name)
      setOpen(false)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const items = groups.map((g) => ({ value: g.name, code: g.code, name: g.name }))
  if (value && !groups.some((g) => g.name === value)) items.push({ value, code: '', name: value })

  return (
    <div className="flex gap-[6px] items-center w-full">
      <div className="flex-1">
        <CodePickerField label="근태그룹" hideLabel fill placeholder="근태그룹" emptyLabel="선택 해제"
                         value={value} onChange={(v) => onChange(v)} items={items} />
      </div>
      <button type="button" className="ec-btn ec-btn-sm" onClick={openNew}>신규</button>
      <button type="button" className="ec-btn ec-btn-sm" disabled={!groups.some((g) => g.name === value)} onClick={openEdit}>수정</button>
      <Modal error={error} open={open} title="근태그룹등록" width={520} onClose={() => setOpen(false)}>
        <ul className="ec-form">
          <li className="wide">
            <span className="title">근태그룹 코드</span>
            <div className="form"><input className="ec-input w-full" value={code} disabled={editId !== null} onChange={(e) => setCode(e.target.value)} /></div>
          </li>
          <li className="wide">
            <span className="title">근태그룹 명</span>
            <div className="form"><input className="ec-input w-full" placeholder="근태그룹 명" value={name} autoFocus onChange={(e) => setName(e.target.value)} /></div>
          </li>
        </ul>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </div>
  )
}

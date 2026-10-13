import { useState } from 'react'
import UserPickModal from './UserPickModal'

const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

/**
 * 원본 일정관리등록 [참석자] · [공유자] 칸(2026-10-13 실측 — 칩 바탕 --ec-blue-light · 글 --ec-blue · 12px 400 · 여백 2.7/4.5/2.7/7.2 · 둥글기 20) — 🔍(사용자검색) · 글자 칸 · 이름 칩(⊖ 로 뺀다) · 오른쪽 끝 ✕(모두 지움).
 * 글자 칸에 이름을 치고 Enter 를 눌러도 칩이 선다. 값은 이름 콤마 구분 글자 그대로 둔다(서버 · 권한 검사가 이 글자를 본다).
 */
export default function NameChips({ label, value, onChange, users }: {
  label: string; value: string; onChange: (v: string) => void; users: { id: number; name: string }[]
}) {
  const [typing, setTyping] = useState('')
  const [picking, setPicking] = useState(false)
  const names = split(value)
  const set = (list: string[]) => onChange([...new Set(list)].join(','))
  const listId = `names-${label}`
  return (
    <div className="flex flex-1 items-center gap-[4px] min-w-0 ec-input h-auto min-h-[26px] flex-wrap">
      <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-icon" aria-label={`${label} 사용자검색`}
              onClick={() => setPicking(true)}>🔍</button>
      <input className="no-ec border-0 outline-none bg-transparent w-[110px]" placeholder={label} aria-label={label} list={listId} value={typing}
             onChange={(e) => setTyping(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Enter' && typing.trim()) { e.preventDefault(); set([...names, typing.trim()]); setTyping('') } }}
             onBlur={() => { if (typing.trim()) { set([...names, typing.trim()]); setTyping('') } }} />
      <datalist id={listId}>{users.map((u) => <option key={u.id} value={u.name} />)}</datalist>
      {names.map((n) => (
        <span key={n} className="inline-flex items-center gap-[3px] pt-[2.7px] pb-[2.7px] pl-[7.2px] pr-[4.5px] rounded-[20px] bg-[var(--ec-blue-light)] text-ec-blue">
          {n}
          <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-blue leading-none" aria-label={`${label} ${n} 빼기`}
                  onClick={() => set(names.filter((x) => x !== n))}>⊖</button>
        </span>
      ))}
      {names.length > 0 && (
        <button type="button" className="no-ec ml-auto bg-transparent border-0 p-0 cursor-pointer text-ec-hint" aria-label={`${label} 모두 지우기`}
                onClick={() => set([])}>✕</button>
      )}
      {picking && <UserPickModal selected={names} onClose={() => setPicking(false)}
                                 onApply={(list) => { set(list); setPicking(false) }} />}
    </div>
  )
}

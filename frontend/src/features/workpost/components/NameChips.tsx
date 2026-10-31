import EcIcon from '../../../components/ui/EcIcon'

/** 전달자 · 참조자 칸 — 🔍(사용자검색) + 고른 이름 칩(× 로 뺀다). 원본 '선택 🔍 [전달자]'. */
export function NameChips({ names, placeholder, onPick, onRemove }: {
  names: string[]; placeholder: string; onPick: () => void; onRemove: (name: string) => void
}) {
  return (
    <div className="flex-1 flex items-center gap-[4px] flex-wrap ec-input min-h-[26px] h-auto">
      <button type="button" aria-label={`${placeholder} 검색`} className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-hint" onClick={onPick}><EcIcon name="search" /></button>
      {names.length === 0 && <span className="text-ec-hint cursor-pointer" onClick={onPick}>{placeholder}</span>}
      {names.map((n) => (
        <span key={n} className="inline-flex items-center px-[6px] rounded-ec bg-ec-blue-wash text-ec-navy">
          {n}
          <button type="button" aria-label={`${n} 빼기`} className="no-ec bg-transparent border-0 p-0 ml-[4px] cursor-pointer" onClick={() => onRemove(n)}>×</button>
        </span>
      ))}
    </div>
  )
}

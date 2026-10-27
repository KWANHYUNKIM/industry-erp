/** 정산 창들이 같이 쓰는 칸 — 숫자 칸은 쉼표로 보이고 숫자로 돌려준다. */
export const toNum = (s: string) => Number(s.replace(/[^0-9-]/g, '')) || 0

export function NumInput({ value, onChange, label, width = 'w-[130px]' }: {
  value: number; onChange: (n: number) => void; label: string; width?: string
}) {
  return (
    <input className={`ec-input ${width} text-right`} aria-label={label}
           value={value ? value.toLocaleString('ko-KR') : ''} onChange={(e) => onChange(toNum(e.target.value))} />
  )
}

export const slash = (d?: string | null) => (d ? d.replace(/-/g, '/') : '')

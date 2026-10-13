/**
 * 원본 번호 칸(form-checkbox-numbered) — 번호가 곧 체크 칸이다. 고르면 파랑(2026-10-14 수령수표조회 실측 '1').
 * 수표 목록 · 수표내역입력 창의 줄 · 정렬/소계/합계 설정 창의 줄이 같은 칸을 쓴다(2026-10-14 실측 — 18 × 17.1 · 둥글기 6 ·
 * 꺼짐 흰 바탕 · ec-icon 글자 + 0.5px ec-bg-chip 테두리, 켜짐 ec-blue 바탕 · 흰 글자). 머리 칸(head)은 번호 없이 전체 선택.
 */
export default function NumCheck({ no, on, onChange, label, head = false, disabled = false }: {
  no: number | ''; on: boolean; onChange: (v: boolean) => void; label: string; head?: boolean; disabled?: boolean
}) {
  return (
    <label className={`relative ${disabled ? 'cursor-default' : 'cursor-pointer'} ${head ? 'block mx-auto w-[18px] h-[18px]' : 'inline-block align-middle'}`}>
      <input type="checkbox" aria-label={label} checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
             className="absolute inset-0 m-0 opacity-0 cursor-pointer disabled:cursor-default" />
      <span className={`inline-block w-[18px] h-[17px] leading-[17px] text-center rounded-[6px] ${
        on ? 'bg-ec-blue text-ec-panel'
          : `outline outline-[0.5px] outline-[var(--ec-bg-chip)] ${disabled ? 'bg-ec-panel text-ec-hint' : 'bg-ec-panel text-ec-icon hover:bg-ec-row-hover'}`}`}>{no}</span>
    </label>
  )
}

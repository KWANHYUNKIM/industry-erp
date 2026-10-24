/**
 * 원본 번호 칸(form-checkbox-numbered) — 번호가 곧 체크 칸이다. 고르면 파랑(2026-10-14 수령수표조회 실측 '1').
 * 머리 칸(head)은 번호 없이 전체 선택. 격자 목록 · 창의 줄이 모두 이 하나를 쓴다(예전엔 14벌 복사본).
 *
 * 줄 높이(2026-10-20 품목 C000029 실측): 원본은 바깥 div(inline-block · 가운데) 안에 칸 div(inline-block · 가운데 ·
 * 18×17.1406)를 둔다 → 바깥 17.5625 · 줄 29.5625(번호칸을 숨기면 28.92 — 우리와 같다). 예전 우리 칸은 h17 · leading 17 ·
 * 아랫선 정렬이라 줄이 30.27 이었다. '가운데' 정렬로 늘어나는 양이 글꼴(원본 돋움 · 우리 맑은 고딕)마다 달라
 * 구조를 베끼면 30.48 이 된다 — 그래서 줄 상자를 원본 줄 높이에서 거꾸로 잡아 위에 붙인다(--ec-numcb-line-h).
 *
 * tone — 칸 테두리 꼴(화면마다 그동안 그려 온 꼴을 그대로 둔다. 원본 값으로 맞추는 건 화면 몫):
 *   outline : 0.5px ec-bg-chip 바깥선(수표 · 비용 · 예산 화면 — 기본)
 *   plain   : 선 없음
 *   line    : 0.5px ec-line 테두리 · 켜지면 파랑(주문서출고처리)
 */
export default function NumCheck({ no, on, onChange, label = '선택', head = false, disabled = false, tone = 'outline', hover = true }: {
  no: number | ''; on: boolean; onChange: (v: boolean) => void; label?: string; head?: boolean; disabled?: boolean
  tone?: 'outline' | 'plain' | 'line'; hover?: boolean
}) {
  const look = on
    ? (tone === 'line' ? 'bg-ec-blue border-ec-blue text-ec-panel' : 'bg-ec-blue text-ec-panel')
    : tone === 'line' ? 'bg-ec-panel border-ec-line text-ec-icon'
      : `${tone === 'outline' ? 'outline outline-[0.5px] outline-[var(--ec-bg-chip)] ' : ''}${
        disabled && tone === 'outline' ? 'bg-ec-panel text-ec-hint' : `bg-ec-panel text-ec-icon${hover && !disabled ? ' hover:bg-ec-row-hover' : ''}`}`
  return (
    <label className={`relative ${disabled ? 'cursor-default' : 'cursor-pointer'} ${head ? 'block mx-auto w-[18px] h-[18px]' : 'inline-flex items-center align-top h-[var(--ec-numcb-line-h)]'}`}>
      <input type="checkbox" aria-label={label} checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
             className="absolute inset-0 m-0 opacity-0 cursor-pointer disabled:cursor-default" />
      <span className={`inline-block w-[var(--ec-grid-cb-w)] h-[var(--ec-numcb-h)] text-center rounded-[6px] ${
        tone === 'line' ? 'border-[length:var(--ec-hair)] ' : ''}${look}`}>{no}</span>
    </label>
  )
}

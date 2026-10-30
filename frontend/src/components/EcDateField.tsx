import EcDateInput from './ui/EcDateInput'

/**
 * 일자칸 — 이카운트 `.wrapper-datepicker`. 값을 문자열(`YYYY-MM-DD`)로 주고받는 옛 이름이다.
 *
 * 모양 · 동작은 `components/ui/EcDateInput` 이 맡는다 — [2026 ▾] / [09 ▾] / [30] [달력], 연 · 월은 원본 같은 목록,
 * 일 칸은 확정(blur/Enter) 때 그 달 말일 안으로 당긴다(치는 중에 "2" 가 "02" 로 튕기지 않게 — 2026-10-27 생산입고 28 → 02).
 */
export default function EcDateField({
  value, onChange, disabled, invalid, max, label,
}: {
  /**
   * 고를 수 있는 마지막 날(YYYY-MM-DD) — 원본 창고별재고현황 기준일자는 오늘까지만이다(2026-10-29 실측). 넘는 날을 치면 이 날로 당긴다.
   */
  max?: string
  /** 빈 필수칸 — 원본 has-error 빨간 테두리(`.ec-invalid`). useRequired 훅의 on(키, 채워졌나). */
  invalid?: boolean
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  /** 연도 목록 범위 — 이제 목록은 앞뒤 10년이라 쓰지 않는다(부르는 쪽 호환으로 남김) */
  yearSpan?: number
  /** 칸 이름(aria-label) — 없으면 '일자' */
  label?: string
}) {
  return (
    <EcDateInput value={value} max={max} disabled={disabled} invalid={invalid} aria-label={label}
                 onChange={(e) => e.target.value && onChange(e.target.value)} />
  )
}

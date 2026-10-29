import { useRef, useState } from 'react'

/**
 * 일자칸 — 이카운트 `.wrapper-datepicker` 를 옮긴 것.
 *
 * 원본은 `<input type="date">` 가 아니라 <b>연 셀렉트 / 월 셀렉트 / 일 텍스트 + 달력버튼</b>
 * 네 조각이다. 전표를 하루씩 옮겨 찍는 일이 잦아서, 일(day) 칸만 키보드로 고쳐 치는 게
 * 브라우저 기본 날짜칸보다 빠르기 때문이다.
 *
 * 값은 바깥과 `YYYY-MM-DD` 로 주고받는다 — API 가 쓰는 형식 그대로다.
 */
export default function EcDateField({
  value, onChange, disabled, yearSpan = 3, invalid, max,
}: {
  /**
   * 고를 수 있는 마지막 날(YYYY-MM-DD) — 원본 창고별재고현황 기준일자는 오늘까지만이다(연은 올해까지, 올해의 월 목록은 이번 달에서 끝난다,
   * 2026-10-29 실측). 넘는 날을 치면 이 날로 당긴다.
   */
  max?: string
  /** 빈 필수칸 — 원본 has-error 빨간 테두리(`.ec-invalid`). useRequired 훅의 on(키, 채워졌나). */
  invalid?: boolean
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  /** 연도 셀렉트에 올릴 앞뒤 범위(기본 ±3년) */
  yearSpan?: number
}) {
  const nativeRef = useRef<HTMLInputElement>(null)
  /** 일 칸에 치는 중인 글자 — 확정(blur/Enter) 전에는 값으로 내보내지 않는다. */
  const [dayDraft, setDayDraft] = useState<string | null>(null)

  const [y, m, d] = (value || '').split('-')
  const year = Number(y) || new Date().getFullYear()
  const month = Number(m) || new Date().getMonth() + 1
  const day = Number(d) || new Date().getDate()

  const thisYear = new Date().getFullYear()
  const years: number[] = []
  const [maxY, maxM] = max ? max.split('-').map(Number) : [0, 0]
  for (let i = thisYear - yearSpan; i <= (max ? Math.min(maxY, thisYear + yearSpan) : thisYear + yearSpan); i += 1) years.push(i)
  if (!years.includes(year)) years.push(year)
  years.sort((a, b) => a - b)

  const pad = (n: number) => String(n).padStart(2, '0')
  const daysIn = (yy: number, mm: number) => new Date(yy, mm, 0).getDate()

  /** 말일을 넘는 일자는 그 달 말일로 당긴다 — 1/31 에서 2월로 바꾸면 2/28 이 된다. */
  const emit = (yy: number, mm: number, dd: number) => {
    const safe = Math.min(Math.max(dd, 1), daysIn(yy, mm))
    const v = `${yy}-${pad(mm)}-${pad(safe)}`
    onChange(max && v > max ? max : v)
  }

  return (
    <div className={invalid ? 'ec-date ec-invalid' : 'ec-date'}>
      <select
        className="ec-input"
        disabled={disabled}
        value={year}
        onChange={(e) => emit(Number(e.target.value), month, day)}
        style={{ width: 64 }}
      >
        {years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
      </select>
      <span>/</span>
      <select
        className="ec-input"
        disabled={disabled}
        value={month}
        onChange={(e) => emit(year, Number(e.target.value), day)}
        style={{ width: 50 }}
      >
        {Array.from({ length: max && year >= maxY ? maxM : 12 }, (_, i) => i + 1).map((mm) => (
          <option key={mm} value={mm}>{pad(mm)}</option>
        ))}
      </select>
      <span>/</span>
      <input
        className="ec-input"
        disabled={disabled}
        value={dayDraft ?? pad(day)}
        inputMode="numeric"
        maxLength={2}
        // 치는 동안 바로 내보내면 "2" 가 "02" 로 튕겨 두 자리(10~31)를 칠 수가 없었다(2026-10-27 생산입고 28 → 02).
        // 치는 글자는 dayDraft 에 두고 확정(blur/Enter) 때만 그 달 말일 안으로 보정해 내보낸다.
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDayDraft(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        onBlur={() => {
          const n = Number(dayDraft)
          if (dayDraft != null && n > 0) emit(year, month, n)
          setDayDraft(null)
        }}
        style={{ width: 34, textAlign: 'center' }}
      />
      {/* 달력 버튼 — 원본 btn-datepicker-toggle. 브라우저 기본 달력을 빌려 쓴다. */}
      <button
        type="button"
        className="ec-btn"
        disabled={disabled}
        title="달력"
        style={{ padding: '0 6px' }}
        onClick={() => {
          const el = nativeRef.current
          if (!el) return
          // showPicker 가 없는 브라우저는 클릭으로 대체
          if (typeof el.showPicker === 'function') el.showPicker()
          else el.click()
        }}
      >
        📅
      </button>
      <input
        ref={nativeRef}
        type="date"
        value={value}
        max={max}
        onChange={(e) => e.target.value && onChange(max && e.target.value > max ? max : e.target.value)}
        tabIndex={-1}
        aria-hidden
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}

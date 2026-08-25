import { useRef } from 'react'

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
  value, onChange, disabled, yearSpan = 3,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  /** 연도 셀렉트에 올릴 앞뒤 범위(기본 ±3년) */
  yearSpan?: number
}) {
  const nativeRef = useRef<HTMLInputElement>(null)

  const [y, m, d] = (value || '').split('-')
  const year = Number(y) || new Date().getFullYear()
  const month = Number(m) || new Date().getMonth() + 1
  const day = Number(d) || new Date().getDate()

  const thisYear = new Date().getFullYear()
  const years: number[] = []
  for (let i = thisYear - yearSpan; i <= thisYear + yearSpan; i += 1) years.push(i)
  if (!years.includes(year)) years.push(year)
  years.sort((a, b) => a - b)

  const pad = (n: number) => String(n).padStart(2, '0')
  const daysIn = (yy: number, mm: number) => new Date(yy, mm, 0).getDate()

  /** 말일을 넘는 일자는 그 달 말일로 당긴다 — 1/31 에서 2월로 바꾸면 2/28 이 된다. */
  const emit = (yy: number, mm: number, dd: number) => {
    const safe = Math.min(Math.max(dd, 1), daysIn(yy, mm))
    onChange(`${yy}-${pad(mm)}-${pad(safe)}`)
  }

  return (
    <div className="ec-date">
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
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => (
          <option key={mm} value={mm}>{pad(mm)}</option>
        ))}
      </select>
      <span>/</span>
      <input
        className="ec-input"
        disabled={disabled}
        value={pad(day)}
        inputMode="numeric"
        maxLength={2}
        // onChange 로 바로 emit 하면 "0"→"01" 로 튕겨서 두 자리를 칠 수가 없다.
        // 확정(blur/Enter) 시점에만 보정한다.
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ''))
          if (Number.isFinite(n) && n > 0) emit(year, month, n)
        }}
        onBlur={() => emit(year, month, day)}
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
        onChange={(e) => e.target.value && onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}

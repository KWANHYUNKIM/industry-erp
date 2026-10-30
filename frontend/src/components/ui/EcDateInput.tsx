import {
  useEffect, useLayoutEffect, useRef, useState,
  type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import EcIcon from './EcIcon'

/**
 * 일자칸 — 원본 `.wrapper-datepicker`(2026-10-30 loginaa 판매조회 조건 판 실측, plans/데이터이관/원본-아이콘-달력.md).
 *
 *   [2026 ▾] / [09 ▾] / [30] [달력]
 *
 * <ul>
 *   <li><b>`<input type="date">` 자리에 그대로 끼운다.</b> 받는 것도 내보내는 것도 `'YYYY-MM-DD'` 이고, 나머지 속성
 *       (aria-label · min · max · disabled · onChange …)은 안에 숨긴 진짜 `<input type="date">` 가 받는다.
 *       그래서 `e.target.value` 를 읽는 화면 코드 · `input[type="date"]` 를 찾는 공용 부품(EcListShell 기간 빠른선택 ·
 *       EcPeriodPicks) · 값을 써 넣는 QA 흐름(네이티브 setter + input 이벤트, `set:input[aria-label="일자"]|2026-10-30`)이
 *       그대로 돈다. 숨긴 칸은 같은 묶음의 맨 앞이라 `querySelector('input')` 가 먼저 찾는다.</li>
 *   <li>연 ▾ · 월 ▾ 는 브라우저 select 가 아니라 원본 같은 목록(현재 값은 파란 띠 + ✓).</li>
 *   <li>일 칸은 키보드로 친다 — 확정(blur · Enter) 때 그 달 말일 안으로 당긴다. 8자리(20261030)나
 *       '2026-10-30' 을 통째로 쳐도 된다. 비우고 나가면 값이 지워진다(required 가 아니면).</li>
 *   <li>달력 단추 — 판에 한 달(기간이면 EcDateRange 가 두 달을 나란히). 일요일 빨강 · 토요일 파랑, 고른 날 파란 동그라미,
 *       '오늘' 앞 주황 점.</li>
 * </ul>
 */
export type EcDateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange'> & {
  value?: string
  defaultValue?: string
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void
  /** 빈 필수칸 — 원본 has-error 빨간 테두리 */
  invalid?: boolean
  /** 달력 단추를 감춘다(EcDateRange 가 끝에 하나만 둔다) */
  noCalendar?: boolean
  ref?: Ref<HTMLInputElement>
}

const pad = (n: number) => String(n).padStart(2, '0')
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate()
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const parse = (v: string | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '')
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null
}
const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

/** 숨긴 칸에 값을 넣고 input 이벤트를 쏜다 — React 가 바뀐 값을 알아채 화면의 onChange 를 부른다(QA 흐름과 같은 길). */
export function writeDate(el: HTMLInputElement | null, v: string) {
  if (!el || el.value === v) return
  valueSetter.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** 판 · 목록을 감싼 칸 아래(모자라면 위)에 띄운다 — 창(Modal)의 overflow 에 안 잘리게 body 에 그린다. */
function Floating({ anchor, onClose, children, className }: {
  anchor: HTMLElement | null; onClose: () => void; children: ReactNode; className: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    /* 자리는 실행 중에 잰다 — 처음엔 CSS 가 감춰 두고(visibility hidden) 잰 뒤 보인다 */
    const place = () => {
      const el = ref.current
      if (!anchor || !el) return
      const a = anchor.getBoundingClientRect()
      const below = a.bottom + 2 + el.offsetHeight <= window.innerHeight || a.top - 2 - el.offsetHeight < 0
      el.style.left = `${Math.max(4, Math.min(a.left, window.innerWidth - el.offsetWidth - 4))}px`
      el.style.top = `${below ? a.bottom + 2 : a.top - 2 - el.offsetHeight}px`
      el.style.visibility = 'visible'
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [anchor])
  useEffect(() => {
    const off = (e: PointerEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !anchor?.contains(t)) onClose()
    }
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('pointerdown', off, true)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc, true) }
  }, [anchor, onClose])
  return createPortal(<div ref={ref} className={`ec-float ${className}`}>{children}</div>, document.body)
}

/** [2026 ▾] · [09 ▾] — 원본 자체 목록. 현재 값은 파란 띠 + ✓, 열면 그 줄이 보이게 굴린다. */
function DropSel({ value, options, onPick, disabled, label, className }: {
  value: number | null; options: { v: number; t: string }[]; onPick: (v: number) => void
  disabled?: boolean; label: string; className: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'center' })
  }, [open])
  const cur = options.find((o) => o.v === value)
  return (
    <>
      <button ref={btn} type="button" className={`ec-input ec-date-sel ${className}`} disabled={disabled}
              aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{cur?.t ?? ''}</span>
        <EcIcon name="caret-down" size={10} />
      </button>
      {open && (
        <Floating anchor={btn.current} className="ec-date-list" onClose={() => setOpen(false)}>
          <ul ref={list} role="listbox" aria-label={label}>
            {options.map((o) => (
              <li key={o.v} role="option" aria-selected={o.v === value} className={o.v === value ? 'on' : undefined}
                  onClick={() => { setOpen(false); onPick(o.v) }}>
                <span className="mark">{o.v === value && <EcIcon name="check" size={10} />}</span>{o.t}
              </li>
            ))}
          </ul>
        </Floating>
      )}
    </>
  )
}

/** 한 달 — 머리 ‹ [연] [월] ›, 요일 줄, 날 칸. */
function Month({ y, m, onNav, sel, from, to, onDay, min, max, prev = true, next = true }: {
  y: number; m: number; onNav: (y: number, m: number) => void
  sel?: string; from?: string; to?: string; onDay: (v: string) => void; min?: string; max?: string
  prev?: boolean; next?: boolean
}) {
  const first = new Date(y, m - 1, 1).getDay()
  const cells: { v: string; d: number; other: boolean; dow: number }[] = []
  const start = new Date(y, m - 1, 1 - first)
  for (let i = 0; i < 42; i += 1) {
    const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({ v: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, d: dt.getDate(), other: dt.getMonth() !== m - 1, dow: dt.getDay() })
  }
  const rows = cells[35].other ? (cells[28].other ? 4 : 5) : 6
  const today = todayStr()
  const go = (dm: number) => { const t = new Date(y, m - 1 + dm, 1); onNav(t.getFullYear(), t.getMonth() + 1) }
  const thisY = new Date().getFullYear()
  const years: number[] = []
  for (let i = Math.min(y, thisY) - 10; i <= Math.max(y, thisY) + 10; i += 1) years.push(i)
  return (
    <div className="ec-cal-month">
      <div className="ec-cal-head">
        <button type="button" className="nav" aria-label="이전 달" onClick={() => go(-1)} hidden={!prev}><EcIcon name="chevron-left" size={12} /></button>
        <select className="ec-cal-sel" aria-label="연" value={y} onChange={(e) => onNav(Number(e.target.value), m)}>
          {years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
        </select>
        <select className="ec-cal-sel" aria-label="월" value={m} onChange={(e) => onNav(y, Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => <option key={mm} value={mm}>{pad(mm)}</option>)}
        </select>
        <button type="button" className="nav" aria-label="다음 달" onClick={() => go(1)} hidden={!next}><EcIcon name="chevron-right" size={12} /></button>
      </div>
      <div className="ec-cal-grid" role="grid">
        {['일', '월', '화', '수', '목', '금', '토'].map((w) => <span key={w} className="wd">{w}</span>)}
        {cells.slice(0, rows * 7).map((c) => {
          const off = (!!min && c.v < min) || (!!max && c.v > max)
          const picked = c.v === sel || c.v === from || c.v === to
          const band = !!from && !!to && c.v > from && c.v < to
          const cls = ['day', c.dow === 0 ? 'sun' : c.dow === 6 ? 'sat' : '', c.other ? 'other' : '',
            picked ? 'on' : '', band ? 'band' : '', c.v === today ? 'today' : ''].filter(Boolean).join(' ')
          return (
            <button key={c.v} type="button" className={cls} disabled={off} aria-label={c.v} aria-pressed={picked}
                    onClick={() => onDay(c.v)}>{c.d}</button>
          )
        })}
      </div>
    </div>
  )
}

/** 달력 판 — 한 달(일자) 또는 두 달 나란히(기간). */
export function EcCalendarPanel({ anchor, onClose, value, from, to, onPick, min, max }: {
  anchor: HTMLElement | null; onClose: () => void
  /** 일자 하나 */
  value?: string
  /** 기간 — 둘 다 주면 두 달 */
  from?: string; to?: string
  onPick: (v: string) => void
  min?: string; max?: string
}) {
  const range = from !== undefined || to !== undefined
  const base = parse(range ? (from || to) : value) ?? parse(todayStr())!
  const [view, setView] = useState({ y: base.y, m: base.m })
  const right = (() => {
    const e = range ? parse(to) : null
    if (e && (e.y > view.y || (e.y === view.y && e.m > view.m))) return { y: e.y, m: e.m }
    const t = new Date(view.y, view.m, 1); return { y: t.getFullYear(), m: t.getMonth() + 1 }
  })()
  const [view2, setView2] = useState(right)
  return (
    <Floating anchor={anchor} className={`ec-cal${range ? ' two' : ''}`} onClose={onClose}>
      <div className="ec-cal-months">
        <Month y={view.y} m={view.m} onNav={(y, m) => setView({ y, m })} sel={range ? undefined : value}
               from={from} to={to} onDay={onPick} min={min} max={max} />
        {range && (
          <Month y={view2.y} m={view2.m} onNav={(y, m) => setView2({ y, m })} from={from} to={to} onDay={onPick} min={min} max={max} />
        )}
      </div>
      <div className="ec-cal-foot">
        <button type="button" className="ec-cal-today" onClick={() => onPick(todayStr())}>오늘</button>
      </div>
    </Floating>
  )
}

/**
 * 겉 칸에 붙은 너비 · ec-input 은 4조각 묶음에 안 맞는다 — 겉 감싸개에는 나머지 클래스만 준다.
 * 화면이 준 style(대개 width: 150)도 같은 까닭으로 버린다 — 원본 일자칸은 폭이 정해져 있다.
 */
function wrapperClass(cls: string | undefined) {
  return (cls ?? '').split(/\s+/).filter((c) => c && c !== 'ec-input' && !/^(?:[a-z]+:)?(?:min-|max-)?w-/.test(c) && !/^flex-1$/.test(c)).join(' ')
}

export default function EcDateInput(props: EcDateInputProps) {
  const {
    value, defaultValue, onChange, invalid, noCalendar, ref, className, style: _style, disabled, readOnly,
    onKeyDown, onKeyUp, autoFocus, min: minP, max: maxP, required, title, 'aria-label': ariaLabel, id,
    ...rest
  } = props
  const min = minP == null ? undefined : String(minP)
  const max = maxP == null ? undefined : String(maxP)
  const native = useRef<HTMLInputElement | null>(null)
  const dayRef = useRef<HTMLInputElement>(null)
  const calBtn = useRef<HTMLButtonElement>(null)
  const [inner, setInner] = useState(defaultValue ?? '')
  const [dayDraft, setDayDraft] = useState<string | null>(null)
  const [cal, setCal] = useState(false)
  const cur = value !== undefined ? (value ?? '') : inner
  const p = parse(cur)
  const now = parse(todayStr())!
  const locked = disabled || readOnly
  const label = ariaLabel ?? title ?? '일자'

  const setRef = (el: HTMLInputElement | null) => {
    native.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as { current: HTMLInputElement | null }).current = el
  }

  const clamp = (v: string) => (min && v < min ? min : max && v > max ? max : v)
  const emit = (y: number, m: number, d: number) => writeDate(native.current, clamp(`${y}-${pad(m)}-${pad(Math.min(Math.max(d, 1), daysIn(y, m)))}`))

  /** 일 칸 확정 — 1~2자리는 그 달의 날, 8자리 · YYYY-MM-DD 는 날짜 통째, 빈칸은 지운다. */
  const commitDay = () => {
    const t = dayDraft
    setDayDraft(null)
    if (t == null) return
    const s = t.trim()
    if (s === '') { if (!required) writeDate(native.current, ''); return }
    const digits = s.replace(/\D/g, '')
    if (digits.length === 8) { emit(Number(digits.slice(0, 4)), Math.min(12, Math.max(1, Number(digits.slice(4, 6)))), Number(digits.slice(6))); return }
    const n = Number(digits)
    if (n > 0) emit(p?.y ?? now.y, p?.m ?? now.m, n)
  }

  const years: { v: number; t: string }[] = []
  const y0 = p?.y ?? now.y
  const maxY = max ? Number(max.slice(0, 4)) : Infinity
  const minY = min ? Number(min.slice(0, 4)) : -Infinity
  for (let i = Math.min(y0, now.y) - 10; i <= Math.max(y0, now.y) + 10; i += 1) if (i <= maxY && i >= minY) years.push({ v: i, t: String(i) })
  const months = Array.from({ length: 12 }, (_, i) => ({ v: i + 1, t: pad(i + 1) }))

  return (
    <span className={`ec-date${invalid ? ' ec-invalid' : ''}${locked ? ' is-locked' : ''} ${wrapperClass(className)}`.trim()}
          role="group" aria-label={label} title={title}>
      <input
        {...rest}
        ref={setRef}
        id={id}
        type="date"
        className="ec-date-native"
        tabIndex={-1}
        aria-label={ariaLabel}
        title={title}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        value={cur}
        onChange={(e) => { if (value === undefined) setInner(e.target.value); onChange?.(e) }}
        onFocus={() => dayRef.current?.focus()}
      />
      <DropSel className="y" label={`${label} 연`} value={p?.y ?? null} options={years} disabled={locked}
               onPick={(y) => emit(y, p?.m ?? now.m, p?.d ?? now.d)} />
      <span className="sep">/</span>
      <DropSel className="m" label={`${label} 월`} value={p?.m ?? null} options={months} disabled={locked}
               onPick={(m) => emit(p?.y ?? now.y, m, p?.d ?? now.d)} />
      <span className="sep">/</span>
      <input
        ref={dayRef}
        className="ec-input ec-date-day"
        aria-label={`${label} 일`}
        inputMode="numeric"
        maxLength={10}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
        value={dayDraft ?? (p ? pad(p.d) : '')}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDayDraft(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') commitDay(); onKeyDown?.(e) }}
        onKeyUp={onKeyUp}
        onBlur={commitDay}
      />
      {!noCalendar && (
        <button ref={calBtn} type="button" className="ec-btn ec-date-cal" aria-label={`${label} 달력`} title="달력"
                disabled={locked} onClick={() => setCal((o) => !o)}>
          <EcIcon name="calendar" size={13} />
        </button>
      )}
      {cal && (
        <EcCalendarPanel anchor={calBtn.current} value={cur} min={min} max={max} onClose={() => setCal(false)}
                         onPick={(v) => { setCal(false); writeDate(native.current, clamp(v)) }} />
      )}
    </span>
  )
}

/**
 * 기간 — `[시작] ~ [끝] [달력]`. 달력은 두 달을 나란히(왼쪽 = 시작 달, 오른쪽 = 끝 달) 띄우고,
 * 처음 누른 날이 시작 · 다음 누른 날이 끝이다(끝이 시작보다 앞이면 둘을 바꾼다).
 * 두 칸은 각자 EcDateInput 이라 화면의 onChange 가 칸마다 따로 불린다(`<input type="date">` 두 개와 같다).
 */
export function EcDateRange({ from, to, className }: { from: EcDateInputProps; to: EcDateInputProps; className?: string }) {
  const a = useRef<HTMLInputElement | null>(null)
  const b = useRef<HTMLInputElement | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const [cal, setCal] = useState(false)
  const [step, setStep] = useState<0 | 1>(0)
  const [fv, setFv] = useState(from.value ?? from.defaultValue ?? '')
  const [tv, setTv] = useState(to.value ?? to.defaultValue ?? '')
  const curF = from.value ?? fv
  const curT = to.value ?? tv
  const join = (r: Ref<HTMLInputElement> | undefined, mine: { current: HTMLInputElement | null }) => (el: HTMLInputElement | null) => {
    mine.current = el
    if (typeof r === 'function') r(el)
    else if (r) (r as { current: HTMLInputElement | null }).current = el
  }
  const locked = from.disabled || from.readOnly
  return (
    <span className={`ec-date-range ${className ?? ''}`.trim()}>
      <EcDateInput {...from} noCalendar ref={join(from.ref, a)}
                   onChange={(e) => { setFv(e.target.value); from.onChange?.(e) }} />
      <span className="sep">~</span>
      <EcDateInput {...to} noCalendar ref={join(to.ref, b)}
                   onChange={(e) => { setTv(e.target.value); to.onChange?.(e) }} />
      <button ref={btn} type="button" className="ec-btn ec-date-cal" aria-label={`${from['aria-label'] ?? '기간'} 달력`} title="달력"
              disabled={locked} onClick={() => { setStep(0); setCal((o) => !o) }}>
        <EcIcon name="calendar" size={13} />
      </button>
      {cal && (
        <EcCalendarPanel anchor={btn.current} from={curF} to={curT} min={from.min == null ? undefined : String(from.min)} max={to.max == null ? undefined : String(to.max)} onClose={() => setCal(false)}
                         onPick={(v) => {
                           if (step === 0) { writeDate(a.current, v); if (curT && v > curT) writeDate(b.current, v); setStep(1); return }
                           if (v < curF) { writeDate(b.current, curF); writeDate(a.current, v) } else writeDate(b.current, v)
                           setCal(false)
                         }} />
      )}
    </span>
  )
}

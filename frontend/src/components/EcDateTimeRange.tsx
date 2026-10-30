import EcDateInput from './ui/EcDateInput'
/**
 * 날짜/시간 범위 칸 — 원본 A/S 관리 입력 창(2026-10-22 실측): `2026 ▾ 10 ▾ 월 22 📅 오전 04 ▾ 05 ▾ ~ 오전 04 ▾ 05 ▾`.
 * 처음 값은 오늘 · 지금 시각(시작 · 끝이 같다). 시 목록은 '오전 00 ~ 오전 11 · 오후 12 ~ 오후 23', 분 목록은 00 ~ 59(1분 단위).
 * 값은 'YYYY-MM-DD HH:mm~HH:mm'. 빈 값이면 처음 값을 보여 준다(저장할 때 defaultRange() 로 채운다).
 */
const pad = (n: number) => String(n).padStart(2, '0')

export function defaultRange(now = new Date()) {
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${t}~${t}`
}

/** 'YYYY-MM-DD HH:mm~HH:mm' → 화면 글자 '2026/10/22 04:05 ~ 04:05'. */
export function rangeText(v: string) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d:\d\d)~(\d\d:\d\d)$/.exec(v)
  return m ? `${m[1]}/${m[2]}/${m[3]} ${m[4]} ~ ${m[5]}` : v
}

const hourLabel = (h: number) => `${h < 12 ? '오전' : '오후'} ${pad(h)}`

export default function EcDateTimeRange({ value, onChange, label = '날짜/시간' }: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const v = /^\d{4}-\d\d-\d\d \d\d:\d\d~\d\d:\d\d$/.test(value) ? value : defaultRange()
  const [y, m, d] = [v.slice(0, 4), v.slice(5, 7), v.slice(8, 10)]
  const [h1, m1, h2, m2] = [Number(v.slice(11, 13)), v.slice(14, 16), Number(v.slice(17, 19)), v.slice(20, 22)]
  const put = (p: { y?: string; m?: string; d?: string; h1?: number; m1?: string; h2?: number; m2?: string }) =>
    onChange(`${p.y ?? y}-${p.m ?? m}-${p.d ?? d} ${pad(p.h1 ?? h1)}:${p.m1 ?? m1}~${pad(p.h2 ?? h2)}:${p.m2 ?? m2}`)
  const hours = Array.from({ length: 24 }, (_, k) => k)
  const mins = Array.from({ length: 60 }, (_, k) => pad(k))
  return (
    <span className="inline-flex items-center gap-[4px] flex-wrap" role="group" aria-label={label}>
      {/* 날짜 — 원본 [2026 ▾] / [10 ▾] / [21] [달력] (components/ui/EcDateInput) */}
      <EcDateInput aria-label={`${label} 일자`} value={`${y}-${m}-${d}`}
                   onChange={(e) => { const v = e.target.value; if (v) put({ y: v.slice(0, 4), m: v.slice(5, 7), d: v.slice(8, 10) }) }} />
      <select className="ec-input w-[84px]" aria-label="시작 시" value={h1} onChange={(e) => put({ h1: Number(e.target.value) })}>
        {hours.map((x) => <option key={x} value={x}>{hourLabel(x)}</option>)}
      </select>
      <select className="ec-input w-[52px]" aria-label="시작 분" value={m1} onChange={(e) => put({ m1: e.target.value })}>
        {mins.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      ~
      <select className="ec-input w-[84px]" aria-label="끝 시" value={h2} onChange={(e) => put({ h2: Number(e.target.value) })}>
        {hours.map((x) => <option key={x} value={x}>{hourLabel(x)}</option>)}
      </select>
      <select className="ec-input w-[52px]" aria-label="끝 분" value={m2} onChange={(e) => put({ m2: e.target.value })}>
        {mins.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </span>
  )
}

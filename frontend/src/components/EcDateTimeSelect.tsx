/**
 * 완료일시 칸 — 원본 간판제작 · 상담 이력관리(2026-10-21 실측): `2026 ▾ / 10 ▾ / 21 📅 오후 11 ▾ : 47 ▾`.
 * 값은 'YYYY-MM-DDTHH:mm'. 빈 값이면 아무것도 고르지 않은 칸.
 */
const pad = (n: number) => String(n).padStart(2, '0')

export default function EcDateTimeSelect({ value, onChange, label = '완료일시' }: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const now = new Date()
  const base = value || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00`
  const [y, m, rest] = [base.slice(0, 4), base.slice(5, 7), base.slice(8)]
  const d = rest.slice(0, 2)
  const hh = Number(base.slice(11, 13))
  const mm = base.slice(14, 16)
  const years = Array.from({ length: 11 }, (_, k) => now.getFullYear() - 5 + k)
  const put = (p: { y?: string; m?: string; d?: string; h?: number; mi?: string }) => {
    const ny = p.y ?? y, nm = p.m ?? m, nd = p.d ?? d, nh = p.h ?? hh, nmi = p.mi ?? mm
    onChange(`${ny}-${nm}-${nd}T${pad(nh)}:${nmi}`)
  }
  const ampm = hh < 12 ? '오전' : '오후'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return (
    <span className="inline-flex items-center gap-[4px] flex-nowrap" role="group" aria-label={label}>
      <select className="ec-input w-[70px]" aria-label="년" value={y} onChange={(e) => put({ y: e.target.value })}>
        {years.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      /
      <select className="ec-input w-[52px]" aria-label="월" value={m} onChange={(e) => put({ m: e.target.value })}>
        {Array.from({ length: 12 }, (_, k) => pad(k + 1)).map((v) => <option key={v} value={v}>{Number(v)}</option>)}
      </select>
      /
      <input className="ec-input w-[40px] text-center" aria-label="일" value={String(Number(d))}
             onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (n >= 1 && n <= 31) put({ d: pad(n) }) }} />
      <input type="date" className="ec-input w-[30px]" aria-label="달력" value={`${y}-${m}-${d}`}
             onChange={(e) => { if (e.target.value) put({ y: e.target.value.slice(0, 4), m: e.target.value.slice(5, 7), d: e.target.value.slice(8, 10) }) }} />
      <select className="ec-input w-[64px]" aria-label="오전오후" value={ampm} onChange={(e) => put({ h: (hh % 12) + (e.target.value === '오후' ? 12 : 0) })}>
        <option>오전</option><option>오후</option>
      </select>
      <select className="ec-input w-[52px]" aria-label="시" value={h12} onChange={(e) => put({ h: (Number(e.target.value) % 12) + (hh >= 12 ? 12 : 0) })}>
        {Array.from({ length: 12 }, (_, k) => k + 1).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      :
      <select className="ec-input w-[52px]" aria-label="분" value={mm} onChange={(e) => put({ mi: e.target.value })}>
        {Array.from({ length: 60 }, (_, k) => pad(k)).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </span>
  )
}

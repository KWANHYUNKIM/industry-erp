import EcDateInput from './ui/EcDateInput'
import { pad2 } from '../utils/periods'
/**
 * 완료일시 칸 — 원본 간판제작 · 상담 이력관리(2026-10-21 실측): `2026 ▾ / 10 ▾ / 21 📅 오후 11 ▾ : 47 ▾`.
 * 값은 'YYYY-MM-DDTHH:mm'. 빈 값이면 아무것도 고르지 않은 칸.
 */

export default function EcDateTimeSelect({ value, onChange, label = '완료일시' }: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const now = new Date()
  const base = value || `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T00:00`
  const [y, m, rest] = [base.slice(0, 4), base.slice(5, 7), base.slice(8)]
  const d = rest.slice(0, 2)
  const hh = Number(base.slice(11, 13))
  const mm = base.slice(14, 16)
  const put = (p: { y?: string; m?: string; d?: string; h?: number; mi?: string }) => {
    const ny = p.y ?? y, nm = p.m ?? m, nd = p.d ?? d, nh = p.h ?? hh, nmi = p.mi ?? mm
    onChange(`${ny}-${nm}-${nd}T${pad2(nh)}:${nmi}`)
  }
  const ampm = hh < 12 ? '오전' : '오후'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return (
    <span className="inline-flex items-center gap-[4px] flex-nowrap" role="group" aria-label={label}>
      {/* 날짜 — 원본 [2026 ▾] / [10 ▾] / [21] [달력] (components/ui/EcDateInput) */}
      <EcDateInput aria-label={`${label} 일자`} value={`${y}-${m}-${d}`}
                   onChange={(e) => { const v = e.target.value; if (v) put({ y: v.slice(0, 4), m: v.slice(5, 7), d: v.slice(8, 10) }) }} />
      <select className="ec-input w-[64px]" aria-label="오전오후" value={ampm} onChange={(e) => put({ h: (hh % 12) + (e.target.value === '오후' ? 12 : 0) })}>
        <option>오전</option><option>오후</option>
      </select>
      <select className="ec-input w-[52px]" aria-label="시" value={h12} onChange={(e) => put({ h: (Number(e.target.value) % 12) + (hh >= 12 ? 12 : 0) })}>
        {Array.from({ length: 12 }, (_, k) => k + 1).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      :
      <select className="ec-input w-[52px]" aria-label="분" value={mm} onChange={(e) => put({ mi: e.target.value })}>
        {Array.from({ length: 60 }, (_, k) => pad2(k)).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </span>
  )
}

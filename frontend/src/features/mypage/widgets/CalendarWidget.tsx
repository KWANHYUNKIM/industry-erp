import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../../api/client'
import { ymd } from '../../../utils/periods'
import type { WidgetBodyProps } from './types'

interface ScheduleEvent { id: number; eventDate: string; title: string; category: string | null; startTime: string | null }

/** 원본 [설정] 상세일정 표시줄수 — 표시안함 · 1~10건, 기본 2건 */
export const DETAIL_ROWS = ['표시안함', ...Array.from({ length: 10 }, (_, i) => `${i + 1}건`)]

/**
 * 일정관리 위젯 — 원본 홈 기본 위젯(0,0,15,10). 머리 '‹ 2026/10 › 일정관리' + 월 달력(일~토),
 * 칸마다 일정 알약(제목). 하루에 보이는 수는 [설정] 상세일정 표시줄수, 넘치면 '+n'.
 */
export default function CalendarWidget({ settings, tick }: WidgetBodyProps) {
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [cursor, setCursor] = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1) })
  const shown = settings.extra?.detail ?? '2건'
  const max = shown === '표시안함' ? 0 : parseInt(shown, 10) || 2

  useEffect(() => {
    api.get<ScheduleEvent[]>('/schedule-events').then((r) => setEvents(r.data)).catch(() => setEvents([]))
  }, [tick])

  const cells = useMemo(() => {
    const start = new Date(cursor)
    start.setDate(1 - cursor.getDay())
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [cursor])
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleEvent[]>()
    for (const e of events) m.set(e.eventDate, [...(m.get(e.eventDate) ?? []), e])
    for (const l of m.values()) l.sort((a, b) => String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')))
    return m
  }, [events])
  const today = ymd(new Date())
  const move = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1))
  const ym = `${cursor.getFullYear()}/${String(cursor.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="ec-wcal">
      <div className="ec-wcal-nav">
        <button type="button" onClick={() => move(-1)} title="이전 달">‹</button>
        <b>{ym}</b>
        <button type="button" onClick={() => move(1)} title="다음 달">›</button>
      </div>
      <div className="ec-wcal-grid">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} className={`ec-wcal-dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{d}</div>
        ))}
        {cells.map((d) => {
          const key = ymd(d)
          const list = byDay.get(key) ?? []
          const out = d.getMonth() !== cursor.getMonth()
          return (
            <div key={key} className={`ec-wcal-day${out ? ' out' : ''}${key === today ? ' today' : ''}${d.getDay() === 0 ? ' sun' : ''}`}>
              <span className="n">{d.getDate()}</span>
              {list.slice(0, max).map((e) => (
                <Link key={e.id} className="ec-wcal-ev" to="/groupware/schedule" title={e.title}>{e.title}</Link>
              ))}
              {list.length > max && max > 0 && <span className="more">+{list.length - max}</span>}
              {max === 0 && list.length > 0 && <span className="more">{list.length}건</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

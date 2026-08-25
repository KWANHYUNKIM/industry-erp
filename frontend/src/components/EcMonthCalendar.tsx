import { useMemo, useState } from 'react'
import { ymd } from './EcPeriodPicks'

/**
 * 월 캘린더 — 이카운트 일정관리 화면 왼쪽의 달력.
 *
 * <p>원본은 일정 화면을 <b>[월 캘린더 | 일정 목록]</b> 2분할로 놓는다. 날짜를 누르면 그날 일정만 목록에 뜬다.
 * 우리 일정관리는 목록만 있어서 "이번 달 언제 뭐가 있나"를 한눈에 볼 수 없었다 —
 * 일정 화면에서 달력은 장식이 아니라 본체다.
 *
 * <p>날짜 계산은 <b>로컬 기준</b>이다(`EcPeriodPicks.ymd` 와 같은 이유 — `toISOString()` 은 UTC 로 밀린다).
 * 주는 원본과 같이 <b>일요일 시작</b>이다(달력 격자는 일~토, 기간 빠른선택의 '주'와는 별개다).
 */
export default function EcMonthCalendar({
  value,
  onPick,
  marks = new Set<string>(),
}: {
  /** 고른 날짜 'YYYY-MM-DD'. 빈 문자열이면 아무 날도 안 고른 상태. */
  value: string
  onPick: (date: string) => void
  /** 일정이 있는 날짜들 — 점으로 표시한다. */
  marks?: Set<string>
}) {
  const todayStr = ymd(new Date())
  const base = value || todayStr
  const [cursor, setCursor] = useState(() => new Date(Number(base.slice(0, 4)), Number(base.slice(5, 7)) - 1, 1))

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first)
    start.setDate(1 - first.getDay())        // 그 주 일요일까지 앞으로
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor])

  const move = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))

  const head: React.CSSProperties = {
    textAlign: 'center', fontSize: 12, color: 'var(--ec-label)', padding: '4px 0',
  }

  return (
    <div style={{ width: 260, flex: '0 0 auto', border: '1px solid var(--ec-border)', background: '#fff', borderRadius: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => move(-1)} aria-label="이전 달">‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12 }}>
          {cursor.getFullYear()} / {String(cursor.getMonth() + 1).padStart(2, '0')}
        </span>
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => move(1)} aria-label="다음 달">›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 6px' }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} style={{ ...head, color: i === 0 ? '#c60a2e' : i === 6 ? 'var(--ec-blue)' : 'var(--ec-label)' }}>
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const s = ymd(d)
          const otherMonth = d.getMonth() !== cursor.getMonth()
          const picked = s === value
          return (
            <button
              key={s}
              type="button"
              className="no-ec"
              onClick={() => {
                // 이전/다음 달 칸(회색)을 누르면 **달력도 그 달로 옮긴다.**
                // 안 그러면 8월 달력을 보면서 7월 일정을 보게 된다 — 실제로 헷갈렸다.
                if (otherMonth) setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
                onPick(picked ? '' : s)   // 같은 날을 다시 누르면 해제 = 전체 보기
              }}
              title={picked ? '눌러서 전체 일정 보기' : s}
              style={{
                position: 'relative', border: 0, cursor: 'pointer', padding: '5px 0',
                fontSize: 12, borderRadius: 4,
                background: picked ? 'var(--ec-blue)' : 'transparent',
                color: picked ? '#fff'
                  : otherMonth ? '#c8ced6'
                  : d.getDay() === 0 ? '#c60a2e'
                  : d.getDay() === 6 ? 'var(--ec-blue)'
                  : '#000',
                fontWeight: s === todayStr && !picked ? 700 : 400,
                outline: s === todayStr && !picked ? '1px solid var(--ec-blue)' : undefined,
              }}
            >
              {d.getDate()}
              {marks.has(s) && (
                <span
                  style={{
                    position: 'absolute', left: '50%', bottom: 2, transform: 'translateX(-50%)',
                    width: 4, height: 4, borderRadius: '50%',
                    background: picked ? '#fff' : '#f0a500',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      <div style={{ padding: '6px 10px 10px' }}>
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => { setCursor(new Date()); onPick(todayStr) }}>
          오늘
        </button>
        {value && (
          <button type="button" className="ec-btn ec-btn-sm" style={{ marginLeft: 4 }} onClick={() => onPick('')}>
            전체 보기
          </button>
        )}
      </div>
    </div>
  )
}

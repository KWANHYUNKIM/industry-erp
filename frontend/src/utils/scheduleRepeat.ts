/**
 * 원본 일정관리 [반복설정] 창(E070201, 2026-10-13 loginaa 실측)의 값과 '요약보기' 글.
 *
 * 반복주기 N + 단위 일 · 주 · 개월 · 년. 주는 요일(일~토), 개월은 기준 일(일자) / 주(1~4번째 · 마지막 + 요일),
 * 년은 월 · 일. 종료는 날짜 / 횟수. 요약보기는 원본 글 그대로:
 *   매일, 2026/10/13 부터 2026/10/13 까지 · 매주, 월요일,수요일, 2026/10/13 부터 0회 까지
 *   매월, 1 일, … · 매월, 1번째, 월요일, … · 매년, 1월 1일, …
 * 반복주기가 2 이상이면 '2일마다' 처럼 쓴다(원본은 1 만 재 봤다 — 2 이상 글은 우리가 정했다).
 */
export type RepeatUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

export interface RepeatRule {
  startDate: string
  interval: number
  unit: RepeatUnit
  /** 0=일 … 6=토 */
  weekdays: number[]
  monthBasis: 'DAY' | 'WEEK'
  monthDay: number
  /** 1~4, 5=마지막 */
  weekOrdinal: number
  yearMonth: number
  yearDay: number
  endType: 'DATE' | 'COUNT'
  endDate: string
  count: number
}

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const
export const UNIT_LABEL: Record<RepeatUnit, string> = { DAY: '일', WEEK: '주', MONTH: '개월', YEAR: '년' }
export const ORDINALS = [[1, '1번째'], [2, '2번째'], [3, '3번째'], [4, '4번째'], [5, '마지막']] as const

/** 원본 창을 열었을 때의 값 — 시작 · 종료일자는 일정 날짜, 1 일, 날짜로 끝, 개월은 1 일, 년은 1월 1일. */
export function defaultRepeat(date: string): RepeatRule {
  return {
    startDate: date, interval: 1, unit: 'DAY', weekdays: [], monthBasis: 'DAY', monthDay: 1,
    weekOrdinal: 1, yearMonth: 1, yearDay: 1, endType: 'DATE', endDate: date, count: 0,
  }
}

const slash = (d: string) => d.replace(/-/g, '/')

export function repeatSummary(r: RepeatRule): string {
  const every = r.interval > 1
    ? `${r.interval}${UNIT_LABEL[r.unit]}마다`
    : ({ DAY: '매일', WEEK: '매주', MONTH: '매월', YEAR: '매년' } as const)[r.unit]
  const days = [...r.weekdays].sort((a, b) => a - b).map((w) => `${WEEKDAYS[w]}요일`).join(',')
  const what = r.unit === 'WEEK' ? `${days}, `
    : r.unit === 'MONTH' ? (r.monthBasis === 'DAY' ? `${r.monthDay} 일, ` : `${ORDINALS.find(([n]) => n === r.weekOrdinal)?.[1] ?? ''}, ${days}, `)
    : r.unit === 'YEAR' ? `${r.yearMonth}월 ${r.yearDay}일, `
    : ''
  const end = r.endType === 'COUNT' ? `${r.count}회` : slash(r.endDate)
  return `${every}, ${what}${slash(r.startDate)} 부터 ${end} 까지`
}

/**
 * [적용] 을 막는 것. 원본은 횟수가 0 이면 그 칸에 '값이 입력되지 않았습니다. / 값을 입력 바랍니다.' 를 띄운다.
 * 날짜로 끝내는데 종료일자가 시작일자와 같으면 원본은 말없이 반복을 안 건다 — null 이 아니라 'none' 을 돌려준다.
 */
export function repeatProblem(r: RepeatRule): string | 'none' | null {
  if (r.endType === 'COUNT' && !(r.count > 0)) return '값이 입력되지 않았습니다.\n값을 입력 바랍니다.'
  if (r.endType === 'DATE' && r.endDate < r.startDate) return '종료일자가 시작일자보다 빠릅니다.'
  if (r.endType === 'DATE' && r.endDate === r.startDate) return 'none'
  return null
}

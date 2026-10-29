/**
 * 작업시간 단위 — 원본 이카운트는 작업내역입력 · 조회 · 현황 모두 <b>시간(H)</b>으로 받고 보인다
 * (2026-10-29 데이터이관 QA 79회: 14H · 26H, 합계 40.00). 서버는 분으로 저장한다
 * (BOR 표준시간 · 효율현황이 분으로 센다) — 화면에서만 바꾼다.
 */

/** 분 → 시간. 소수 둘째 자리에서 맞춘다(0.2H = 12분). */
export function minToHours(min: number | null | undefined): number {
  if (min == null || !Number.isFinite(Number(min))) return 0
  return Math.round((Number(min) / 60) * 100) / 100
}

/** 입력한 시간(문자열) → 분. 빈 칸은 0. */
export function hoursToMin(h: string | number | null | undefined): number {
  if (h == null || h === '') return 0
  const n = Number(h)
  return Number.isFinite(n) ? Math.round(n * 60) : 0
}

/** 원본처럼 소수 둘째 자리까지 찍는다(27.00 · 40.00). */
export function fmt2(n: number): string {
  return n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

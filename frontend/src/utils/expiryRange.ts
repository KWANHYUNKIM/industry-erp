/**
 * 원본 시리얼/로트No. 화면들의 [유효기한] → <b>직접입력</b>을 고르면 채워지는 기본 구간.
 *
 * <p>2026-10-04 loginaa E040619 실측: 기준이 2026/10/04 일 때 <b>2026/10/04 ~ 2031/10/03</b> —
 * 오늘부터 5년 뒤 하루 전까지다. 유효기한은 앞으로 올 날짜라 과거가 아니라 앞쪽으로 편다.
 */
export function expiryDirectRange(today: string): { from: string; to: string } {
  const [y, m, d] = today.split('-').map(Number)
  const end = new Date(Date.UTC(y + 5, m - 1, d))
  end.setUTCDate(end.getUTCDate() - 1)
  return { from: today, to: end.toISOString().slice(0, 10) }
}

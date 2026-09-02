/**
 * 근태·휴가 <b>일수</b> 표기. 원본은 소수 <b>셋째 자리까지 채워</b> 찍는다(사본 실측:
 * 근태현황 [근태] 열 값이 <code>1.250</code>).
 *
 * <p>근태는 반차(0.5)·반반차(0.25)·시간단위(0.125)가 섞여 자리수가 제각각이다.
 * 자리수를 채우지 않으면 <code>1</code> 과 <code>0.5</code> 와 <code>1.25</code> 가
 * 세로로 늘어섰을 때 <b>소수점 자리가 어긋나</b> 눈으로 크기를 못 고른다.
 * 그래서 자릿수를 고정한다.
 *
 * <p>화면마다 달랐던 것을 여기로 모은다 — 근태조회·휴가사용실적은 두 자리(1.00),
 * 근태현황은 아예 안 채우고 있었다(1). 같은 값이 화면마다 다르게 보이면
 * 사람은 그것을 <b>다른 값</b>으로 읽는다.
 */
export function formatDays(n: number, decimals = 3): string {
  const d = Number.isFinite(n) ? n : 0
  return d.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

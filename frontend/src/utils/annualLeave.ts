/**
 * 사원별휴가일수입력 [연차계산] — 원본 연차계산기준 '40시간제'(Z9998)를 2026-10-04 loginaa 에서 돌려 본 값에 맞춘 셈.
 *
 * <ul>
 *   <li>사용기간 시작 해의 <b>바로 앞 해에 입사</b>했으면 그 해에 일한 날만큼 비례:
 *       15 × (입사일 ~ 그해 12/31 날수) / 그해 날수. 2024/10/01 입사 · 2025 사용기간 → 15 × 92 / 366 = 3.770492.</li>
 *   <li>그보다 앞서 입사했으면 근속 해 수 n = 사용기간 해 − 입사 해 로 15 + ⌊(n − 1) / 2⌋, 많아야 25.
 *       2019/01/05 입사 · 2025 사용기간 → n = 6 → 17.</li>
 *   <li>사용기간 해에 입사했으면 0 — 원본에서 재 보지 못했다(그런 사원이 없었다).</li>
 * </ul>
 * 소수는 원본처럼 여섯째 자리까지 둔다.
 */
export function annualLeaveDays(hireDate: string | null | undefined, periodFrom: string): number {
  if (!hireDate) return 0
  const year = Number(periodFrom.slice(0, 4))
  const hy = Number(hireDate.slice(0, 4))
  if (hy >= year) return 0
  if (hy === year - 1) {
    const start = Date.UTC(hy, Number(hireDate.slice(5, 7)) - 1, Number(hireDate.slice(8, 10)))
    const end = Date.UTC(hy, 11, 31)
    const worked = Math.round((end - start) / 86400000) + 1
    const daysInYear = (hy % 4 === 0 && hy % 100 !== 0) || hy % 400 === 0 ? 366 : 365
    return Math.round((15 * worked / daysInYear) * 1e6) / 1e6
  }
  const n = year - hy
  return Math.min(25, 15 + Math.floor((n - 1) / 2))
}

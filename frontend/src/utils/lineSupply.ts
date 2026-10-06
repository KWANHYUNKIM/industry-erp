/**
 * 라인 공급가액 = round(수량 × 단가), 원 단위 반올림 — 백엔드 `VatAllocator.lineSupply` 와 같은 규칙.
 *
 * <p>2026-10-06 loginaa 판매입력·구매입력 실측: 3 × 333.5 = 1,000.5 → <b>1,001</b>,
 * 3 × 333.35 = 1,000.05 → <b>1,000</b>. 부가세도 원 단위 반올림(100.5 → 101, 100.9 → 101).
 *
 * <p>부동소수 곱은 1,000.5 를 1,000.4999… 로 만들 수 있어 소수 6자리에서 한 번 자른 뒤 반올림한다.
 * 음수(반품)는 크기를 반올림해 부호를 붙인다 — Java HALF_UP 과 같다(Math.round(-0.5) 는 -0 이다).
 */
export function lineSupply(quantity: number, unitPrice: number): number {
  return roundWon(quantity * unitPrice)
}

/** 원 단위 반올림(HALF_UP, 0 에서 먼 쪽). */
export function roundWon(v: number): number {
  const exact = Number(v.toFixed(6))
  const r = Math.round(Math.abs(exact))
  return exact < 0 ? -r : r
}

/** 정수 부분에만 천 단위 쉼표를 찍는다 — 소수는 친 그대로(333.5 는 333.5). 빈 값 · 숫자가 아닌 값은 그대로. */
export function withCommas(raw: string): string {
  const m = /^(-?)(\d+)(\.\d*)?$/.exec(raw)
  if (!m) return raw
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[3] ?? '')
}

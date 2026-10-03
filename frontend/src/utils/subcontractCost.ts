/**
 * 생산입고 I·II 격자의 <b>[외주비합계] · [외주비부가세]</b> — 서버(ProductionService.applySubcontract)와 같은 규칙.
 *
 * <p>합계 = 단가 × 수량(원 미만 반올림), 부가세 = 합계의 10%(원 미만 버림 — 0 쪽으로).
 * 서버는 BigDecimal HALF_UP · DOWN 이라 음수(반품 성격)도 0 에서 먼 쪽 반올림 · 0 쪽 버림이다.
 * Math.round(-2.5) 는 -2, Math.floor(-233.3) 은 -234 라 그대로 쓰면 화면이 서버와 1원 어긋난다.
 */
export function subcontractCost(unitPrice: number, qty: number): { amount: number; vat: number } {
  const raw = unitPrice * qty
  /* 333.33 × 7 = 2333.3099999… 처럼 떠 있는 값을 반올림 전에 센트 단위로 바로잡는다. */
  const fixed = Math.round(raw * 1e6) / 1e6
  const amount = Math.sign(fixed) * Math.round(Math.abs(fixed))
  return { amount: amount + 0, vat: subcontractVat(amount) }
}

/** 합계의 10%, 원 미만 버림(0 쪽으로). */
export function subcontractVat(amount: number): number {
  return Math.trunc(Math.round(amount * 0.1 * 1e6) / 1e6) + 0
}

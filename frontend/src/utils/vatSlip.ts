/**
 * 회계전표 한 장에서 <b>공급가액 · 부가세</b>를 읽는다 — 매출(세금)계산서현황 · 매입(세금)계산서현황 ·
 * 매입매출장 · 월별부가세현황이 같이 쓴다.
 *
 * <p>부가세는 부가세 계정(매출 255 부가세예수금 · 매입 135 부가세대급금)의 순액이다.
 * 공급가액은 부가세 줄과 <b>같은 쪽</b>에 선 나머지 줄의 합이다.
 *
 * <p><b>반품은 역분개다</b>(판매반품: 차)매출·부가세예수금 / 대)외상매출금). 예전엔 매출이면 늘 대변,
 * 매입이면 늘 차변만 더해, 반품 전표에서는 <b>외상매출금 · 외상매입금(합계)</b>이 공급가액으로 잡혔다 —
 * 판매반품 −1,000(부가세 −100) 이 공급가액 1,100 · 부가세 −100 · 합계 1,000 으로 찍혀 합계를 거꾸로 부풀렸다.
 * 부가세가 음수면 공급가액도 반대쪽 줄에서 읽어 음수로 낸다.
 */
export type VatSide = '매출' | '매입'

export const VAT_ACCOUNT: Record<VatSide, string> = { 매출: '255', 매입: '135' }

interface Line { accountCode: string; debit: number | string; credit: number | string }

/** 부가세 줄이 없으면 null — 세금계산서 전표가 아니다. */
export function vatSlipAmounts(lines: readonly Line[], side: VatSide): { supply: number; vat: number } | null {
  const code = VAT_ACCOUNT[side]
  const vatLines = lines.filter((l) => l.accountCode === code)
  if (vatLines.length === 0) return null
  const others = lines.filter((l) => l.accountCode !== code)
  /* 정상 방향: 매출은 대변, 매입은 차변. */
  const normal = (l: Line) => Number(side === '매출' ? l.credit : l.debit)
  const opposite = (l: Line) => Number(side === '매출' ? l.debit : l.credit)
  const vat = vatLines.reduce((s, l) => s + normal(l) - opposite(l), 0)
  const supply = vat < 0
    ? -others.reduce((s, l) => s + opposite(l), 0)
    : others.reduce((s, l) => s + normal(l), 0)
  return { supply, vat }
}

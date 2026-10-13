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

/** 출처로 쪽이 정해지는 전표 — 매출전표 I · 판매 회계반영은 매출, 매입전표 I · 구매 회계반영은 매입. */
const SALES_SOURCES = ['VAT_SALES', 'SALES']
const PURCHASE_SOURCES = ['VAT_PURCHASE', 'PURCHASE']

/**
 * 부가세유형을 든 전표가 매출인지 매입인지 — 출처(sourceType)로 먼저 가르고, 그 밖의 출처는 부가세 줄(매출 255 · 매입 135)로.
 * 둘 다 없으면 null. 예전엔 'VAT_SALES 가 아니면 매입' 이라 판매 회계반영 전표에 부가세유형이 붙으면 매입으로 갔다.
 */
export function vatEntrySide(e: { sourceType: string; lines: readonly Line[] }): VatSide | null {
  if (SALES_SOURCES.includes(e.sourceType)) return '매출'
  if (PURCHASE_SOURCES.includes(e.sourceType)) return '매입'
  if (e.lines.some((l) => l.accountCode === VAT_ACCOUNT.매출)) return '매출'
  if (e.lines.some((l) => l.accountCode === VAT_ACCOUNT.매입)) return '매입'
  return null
}

/** 부가세 줄이 없으면 null — 세금계산서 전표가 아니다. */
export function vatSlipAmounts(lines: readonly Line[], side: VatSide): { supply: number; vat: number } | null {
  const code = VAT_ACCOUNT[side]
  const vatLines = lines.filter((l) => l.accountCode === code)
  if (vatLines.length === 0) return null
  const others = withoutFee(lines).filter((l) => l.accountCode !== code)
  /* 정상 방향: 매출은 대변, 매입은 차변. */
  const normal = (l: Line) => Number(side === '매출' ? l.credit : l.debit)
  const opposite = (l: Line) => Number(side === '매출' ? l.debit : l.credit)
  const vat = vatLines.reduce((s, l) => s + normal(l) - opposite(l), 0)
  const supply = vat < 0
    ? -others.reduce((s, l) => s + opposite(l), 0)
    : others.reduce((s, l) => s + normal(l), 0)
  return { supply, vat }
}

/**
 * 매출전표 I · 매입전표 I 의 <b>[수수료]</b> 두 줄을 뺀다 — 차) 지급수수료(831) X / 대) 입금(출금)계좌 X(2026-10-13 loginaa 26/10/13-9 · -11).
 * 빼지 않으면 매출은 입금계좌의 수수료 대변이, 매입은 지급수수료 차변이 공급가액에 더해진다(100,000 + 1,000).
 * 수수료 대변은 <b>같은 계정이 차변(매출) 또는 대변(매입)에 이미 선</b> 줄 — 그 계좌에 X 짜리 줄이 하나 더 있는 것으로 알아본다.
 * 그렇게 짝이 지어질 때만 뺀다(지출결의서의 지급수수료처럼 짝이 없는 831 은 그대로 공급가액이다).
 */
function withoutFee<T extends Line>(lines: readonly T[]): T[] {
  const fees = lines.filter((l) => l.accountCode === '831' && Number(l.debit) > 0)
  if (fees.length === 0) return [...lines]
  const drop = new Set<T>()
  for (const fee of fees) {
    const x = Number(fee.debit)
    const settle = lines.find((l) => !drop.has(l) && l !== fee && Number(l.credit) === x
      && lines.some((m) => m !== l && m.accountCode === l.accountCode && (Number(m.debit) > 0 || Number(m.credit) > 0)))
    if (settle) { drop.add(fee); drop.add(settle) }
  }
  return lines.filter((l) => !drop.has(l))
}

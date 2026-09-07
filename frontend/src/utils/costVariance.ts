/**
 * 원가차이 분해.
 *
 * <p>원본(이카운트) 차이분석의 [구분] 은 원가비교집계표 · 재료비단가차이 · 소모수량차이 ·
 * 노무비/경비/외주비차이 넷이다. 총액 차이 한 줄로는 <b>왜</b> 차이가 났는지 알 수 없다 —
 * 비싸게 산 것인지, 많이 쓴 것인지가 갈려야 손 쓸 곳이 정해진다.
 *
 * <p>부호 약속: <b>양수 = 불리(원가가 늘었다)</b>. 비싸게 샀거나 많이 썼으면 양수다.
 * 회계에서 쓰는 관례를 그대로 따른다. 반대로 잡으면 절감을 낭비로 읽는다.
 *
 * <p>기준(표준)을 모르면 <b>0 이 아니라 null</b> 이다. 0 으로 채우면 "차이가 없다" 와
 * "잴 수 없다" 가 같은 얼굴이 된다 — 구매할인현황에서 이미 같은 결정을 했다.
 */

export interface PriceVariance {
  /** (실제단가 − 표준단가) × 실제수량. 기준이 없으면 null */
  amount: number | null
  stdPrice: number | null
  actualPrice: number | null
  qty: number
}

/**
 * 재료비단가차이 — 표준보다 비싸게 샀는가.
 *
 * @param stdPrice   품목의 기준(구매)단가. 0 이나 null 이면 "기준을 안 정했다" 는 뜻이다.
 * @param actualPrice 그 기간에 실제로 산 단가(가중평균)
 * @param qty        실제 매입수량
 */
export function priceVariance(
  stdPrice: number | null, actualPrice: number | null, qty: number,
): PriceVariance {
  const std = stdPrice != null && stdPrice > 0 ? stdPrice : null
  const act = actualPrice != null && actualPrice > 0 ? actualPrice : null
  return {
    stdPrice: std,
    actualPrice: act,
    qty,
    amount: std == null || act == null ? null : Math.round((act - std) * qty * 100) / 100,
  }
}

export interface QtyVariance {
  /** (실제수량 − 표준수량) × 표준단가. 단가를 모르면 null */
  amount: number | null
  diffQty: number
  stdQty: number
  actualQty: number
}

/**
 * 소모수량차이 — BOM 보다 많이 썼는가.
 *
 * <p>수량 차이는 단가를 몰라도 뜻이 있다(몇 개 더 썼는지). 그래서 금액만 null 이 되고
 * diffQty 는 언제나 나온다.
 */
export function qtyVariance(stdQty: number, actualQty: number, stdPrice: number | null): QtyVariance {
  const diff = Math.round((actualQty - stdQty) * 1000) / 1000
  const std = stdPrice != null && stdPrice > 0 ? stdPrice : null
  return {
    stdQty, actualQty, diffQty: diff,
    amount: std == null ? null : Math.round(diff * std * 100) / 100,
  }
}

/** 실제 − 표준. 노무비·경비처럼 금액만 있는 항목에 쓴다. */
export function amountVariance(standard: number | null, actual: number | null): number | null {
  if (standard == null || actual == null) return null
  return Math.round((actual - standard) * 100) / 100
}

/**
 * 매입 라인들의 가중평균 단가. 수량 합이 0 이면 null 이다 —
 * 단순평균을 쓰면 1개 산 것과 1000개 산 것이 같은 무게가 된다.
 */
export function weightedAvgPrice(lines: { quantity: number; unitPrice: number }[]): number | null {
  let qty = 0
  let amount = 0
  for (const l of lines) {
    qty += l.quantity
    amount += l.quantity * l.unitPrice
  }
  if (qty === 0) return null
  return Math.round((amount / qty) * 100) / 100
}

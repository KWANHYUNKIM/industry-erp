/**
 * 작업지시서효율현황의 계산.
 *
 * <p>원본(이카운트)의 이 화면은 작업지시마다 세 가지를 나란히 놓는다.
 * <ul>
 *   <li><b>생산</b> — 계획수량 · 생산수량 · 차이</li>
 *   <li><b>소모</b> — 표준(BOM 대로 썼다면) · 실제(정말 쓴 것) · 차이, 모두 <b>금액</b></li>
 *   <li><b>시간</b> — 표준 · 실제</li>
 * </ul>
 * 우리 화면에는 수량 축밖에 없어서 "계획만큼 만들었는가"만 보였고,
 * <b>"만드는 데 자재를 얼마나 더 썼는가"</b>는 이 화면에서 알 수 없었다.
 *
 * <p>자재 단가는 <b>구매단가</b>를 쓴다. 판매단가로 평가하면 아직 팔지도 않은 이익이
 * 원가에 섞인다 — 재고자산·이익현황에서 같은 결정을 이미 했다.
 *
 * <p>단가를 모르는 자재는 <b>0으로 세지 않고 빼고 센다.</b> 0으로 채우면 자재를 두 배 썼는데
 * 차이가 0으로 보인다. 대신 몇 건이 빠졌는지 같이 돌려준다.
 */

export interface BomLine {
  componentId: number
  componentName?: string
  /** 제품 1개당 소요량 */
  quantity: number
}

export interface UsedMaterial {
  componentId: number
  componentName?: string
  quantity: number
}

export interface Amount {
  /** 단가를 아는 것만 더한 금액 */
  amount: number
  /** 단가를 몰라 빼놓은 자재 수 */
  unknown: number
}

/** 단가를 모르면 null 을 돌려주는 함수를 받는다. */
export type PriceOf = (componentId: number) => number | null

function sum(rows: { componentId: number; quantity: number }[], priceOf: PriceOf): Amount {
  let amount = 0
  let unknown = 0
  for (const r of rows) {
    const price = priceOf(r.componentId)
    if (price == null) {
      // 수량이 0 이면 금액도 0 이라 단가를 몰라도 문제될 것이 없다.
      if (r.quantity !== 0) unknown += 1
      continue
    }
    amount += r.quantity * price
  }
  return { amount: Math.round(amount * 100) / 100, unknown }
}

/** BOM 대로 만들었다면 들었을 자재 금액. 생산수량이 0 이면 0 이다. */
export function standardConsume(bom: BomLine[], producedQty: number, priceOf: PriceOf): Amount {
  return sum(bom.map((l) => ({ componentId: l.componentId, quantity: l.quantity * producedQty })), priceOf)
}

/** 실제로 투입한 자재 금액. */
export function actualConsume(used: UsedMaterial[], priceOf: PriceOf): Amount {
  return sum(used, priceOf)
}

export interface MaterialDiffRow {
  componentId: number
  componentName: string
  stdQty: number
  actualQty: number
  stdAmount: number | null
  actualAmount: number | null
  /** 표준 − 실제. 양수면 덜 썼다(아낀 것), 음수면 더 썼다. 단가를 모르면 null. */
  diffAmount: number | null
}

/**
 * 하위 자재별 표준 vs 실제. 원본은 작업지시 아래에 이 줄들을 펼쳐 보여 준다.
 *
 * <p>BOM 에 없는데 투입한 자재도, BOM 에 있는데 안 쓴 자재도 모두 한 줄로 나온다 —
 * 어느 쪽이든 알아야 할 차이다.
 */
export function materialDiff(
  bom: BomLine[], used: UsedMaterial[], producedQty: number, priceOf: PriceOf,
): MaterialDiffRow[] {
  const ids = new Map<number, string>()
  for (const l of bom) ids.set(l.componentId, l.componentName ?? '')
  for (const u of used) if (!ids.has(u.componentId) || !ids.get(u.componentId)) ids.set(u.componentId, u.componentName ?? ids.get(u.componentId) ?? '')

  const stdQty = new Map<number, number>()
  for (const l of bom) stdQty.set(l.componentId, (stdQty.get(l.componentId) ?? 0) + l.quantity * producedQty)
  const actQty = new Map<number, number>()
  for (const u of used) actQty.set(u.componentId, (actQty.get(u.componentId) ?? 0) + u.quantity)

  return [...ids.entries()].map(([componentId, componentName]) => {
    const s = stdQty.get(componentId) ?? 0
    const a = actQty.get(componentId) ?? 0
    const price = priceOf(componentId)
    const sAmt = price == null ? null : Math.round(s * price * 100) / 100
    const aAmt = price == null ? null : Math.round(a * price * 100) / 100
    return {
      componentId, componentName,
      stdQty: s, actualQty: a,
      stdAmount: sAmt, actualAmount: aAmt,
      diffAmount: sAmt == null || aAmt == null ? null : Math.round((sAmt - aAmt) * 100) / 100,
    }
  }).sort((x, y) => x.componentName.localeCompare(y.componentName))
}

export interface WorkTimeRow {
  /** 그 작업으로 만든 수량(양품+불량). 표준시간은 만든 수량에 비례한다. */
  qty: number
  /** 실제 걸린 시간(분) */
  minutes: number
  /** 공정의 표준시간(분/개). 모르면 null. */
  stdMinPerUnit: number | null
}

export interface TimeTotals {
  standard: number
  actual: number
  /** 표준시간을 모르는 작업 수 */
  unknown: number
}

/**
 * 표준시간 대 실제시간.
 *
 * <p>표준은 <b>실제로 만든 수량</b>에 공정 표준시간을 곱한다. 계획수량으로 곱하면
 * 절반만 만든 작업지시가 늘 '시간을 아꼈다'고 나온다.
 */
export function workTime(rows: WorkTimeRow[]): TimeTotals {
  let standard = 0
  let actual = 0
  let unknown = 0
  for (const r of rows) {
    actual += r.minutes
    if (r.stdMinPerUnit == null) {
      if (r.qty !== 0) unknown += 1
      continue
    }
    standard += r.stdMinPerUnit * r.qty
  }
  return { standard: Math.round(standard * 100) / 100, actual: Math.round(actual * 100) / 100, unknown }
}

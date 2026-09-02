/**
 * 재고 평가단가를 고르는 규칙.
 *
 * <p>재고자산은 <b>취득원가</b>로 평가한다. 판매단가로 평가하면 아직 팔지도 않은 이익이
 * 재고에 얹혀 자산이 부풀려진다. 실제로 그랬다 — 개발 자료에서 재고금액이
 * 판매단가 기준 <b>184,574,000</b> vs 실제 입고단가 기준 <b>34,908,000</b> 으로 5배 차이였고,
 * 그 숫자가 경영자보고서의 '재고자산' 칸에 그대로 올라갔다.
 *
 * <p>고르는 순서는 <b>구체적인 것부터</b>다. 실제로 얼마에 사 왔는지가 가장 정확하고,
 * 그걸 모를 때 품목에 정해 둔 구매단가를 쓴다. 둘 다 없으면 <b>모른다</b>고 답한다 —
 * 판매단가로 대신 채우면 그게 원가인 줄 알고 그대로 보고서에 올린다.
 */
export interface StockCostSources {
  /** 그 품목을 마지막으로 사 온 단가. 없으면 null. */
  lastInboundPrice: number | null
  /** 품목 마스터의 구매단가. 0 이면 안 정한 것이다. */
  itemPurchasePrice: number | null
}

/** 재고 한 칸의 평가단가. 못 고르면 <b>null</b> — 0 이 아니다. */
export function stockUnitCost(src: StockCostSources): number | null {
  const last = src.lastInboundPrice
  if (last != null && last > 0) return last
  const base = src.itemPurchasePrice
  if (base != null && base > 0) return base
  return null
}

export interface StockValueRow {
  quantity: number
  unitCost: number | null
}

/**
 * 재고금액 합계. 평가단가를 모르는 칸은 <b>합계에서 빼고</b> 몇 칸인지 함께 돌려준다.
 *
 * <p>0 으로 세면 "재고는 있는데 금액은 0" 이 되어 자산이 조용히 줄어든다.
 * 모르는 것은 세지 않고, 몇 칸을 못 셌는지 화면이 밝힐 수 있게 한다.
 */
export function sumStockValue(rows: StockValueRow[]): { value: number; unknown: number } {
  let value = 0
  let unknown = 0
  for (const r of rows) {
    if (r.unitCost == null) {
      // 수량이 0 인 칸은 평가할 것도 없으니 '모르는 칸' 으로 세지 않는다.
      if (r.quantity !== 0) unknown += 1
      continue
    }
    value += r.quantity * r.unitCost
  }
  return { value, unknown }
}

/**
 * 품목별 평가단가 표. 구매전표를 훑어 <b>마지막 입고단가</b>를 뽑고, 없으면 품목 구매단가를 쓴다.
 *
 * <p>화면마다 이 계산을 따로 쓰면 한쪽만 고치는 일이 생긴다 — 실제로 경영자보고서와
 * 재고분석이 각자 판매단가로 평가하고 있었다.
 */
export function stockCostMap(
  items: { id: number; purchasePrice?: number }[],
  purchases: { purchaseDate: string; lines: { itemId: number; unitPrice: number }[] }[],
): Map<number, number | null> {
  const last = new Map<number, { date: string; price: number }>()
  for (const p of purchases) {
    for (const l of p.lines) {
      const cur = last.get(l.itemId)
      if (!cur || p.purchaseDate >= cur.date) last.set(l.itemId, { date: p.purchaseDate, price: l.unitPrice })
    }
  }
  return new Map(items.map((it) => [it.id, stockUnitCost({
    lastInboundPrice: last.get(it.id)?.price ?? null,
    itemPurchasePrice: it.purchasePrice ?? null,
  })]))
}

/**
 * 이익현황의 <b>원가 기준</b>을 고르는 규칙.
 *
 * <p>원본 실측(일별이익현황):
 *   [원가] 선입선출(판매) | 월별원가 | 입고단가(품목) | 입고단가(품목) - VAT 제외
 *
 * <p>화면 안에 두지 않고 따로 뺀 이유는 <b>테스트하려고</b>다. 여기가 틀리면 이익현황이
 * 통째로 틀린 숫자를 보여 주는데, 숫자가 그럴듯해서 눈으로는 안 걸린다. 실제로 그랬다 —
 * '입고단가(품목)' 이 품목의 <b>판매단가</b>를 읽고 있어서, 개발 자료에서 매출 25,794,000 에
 * 원가 99,090,000(매출의 4배)이 잡히고 이익이 −73,296,000 으로 나왔다.
 */
export type CostBasis = '월별원가' | '최종구매가' | '입고단가(품목)'

export interface CostSources {
  /** 그 달의 표준원가. 없으면 null. */
  monthlyCost: number | null
  /** 그 품목의 마지막 매입단가. 없으면 null. */
  lastPurchasePrice: number | null
  /** 품목 마스터의 <b>구매단가</b>. 판매단가가 아니다. 0 이면 안 정한 것이다. */
  itemPurchasePrice: number | null
}

/**
 * 기준에 맞는 원가를 고른다. 못 고르면 <b>null</b> — 0 이 아니다.
 *
 * <p>0 을 돌려주면 "원가가 0원" 이 되어 이익이 매출 전액으로 부풀고, 그 줄이 합계에 섞인다.
 * 모르는 것은 모른다고 해야 화면이 '—' 로 두고 합계에서 뺄 수 있다.
 */
export function costOf(basis: CostBasis, src: CostSources): number | null {
  const pick = basis === '월별원가' ? src.monthlyCost
    : basis === '최종구매가' ? src.lastPurchasePrice
      : src.itemPurchasePrice
  if (pick == null) return null
  // 0 이하는 "기준을 안 정했다" 는 뜻이다. 음수 원가는 애초에 있을 수 없다.
  return pick > 0 ? pick : null
}

/** 원가를 아는 줄만 골라 매출·원가·이익을 더한다. 모르는 줄은 <b>합계에서도 뺀다.</b> */
export function sumProfit(
  rows: { revenue: number; cost: number | null }[],
): { revenue: number; knownRevenue: number; cost: number; profit: number; unknown: number } {
  let revenue = 0
  let knownRevenue = 0
  let cost = 0
  let unknown = 0
  for (const r of rows) {
    revenue += r.revenue
    if (r.cost == null) {
      unknown += 1
      continue
    }
    knownRevenue += r.revenue
    cost += r.cost
  }
  return { revenue, knownRevenue, cost, profit: knownRevenue - cost, unknown }
}

/**
 * <b>판매부대비용</b>을 뺀 이익. 원본 이익현황의 [이익금액(부대비용포함)] 열.
 *
 * <p>부대비용은 전표 합계에 더하지 않는다 — 거래처에 청구한 돈이 아니라 우리가 쓴 돈이다.
 * 그래서 판매액에는 안 들어가고, <b>이익에서는 빠져야</b> 한다. 안 빼면 운반비를 쓸수록
 * 이익이 좋아 보인다.
 *
 * <p>원가를 모르는 줄은 이익을 낼 수 없어 null 이다. 그 줄의 부대비용은 그래도 <b>센다</b> —
 * 실제로 쓴 돈이라 안 세면 부대비용 합계가 거짓이 된다.
 */
export function profitWithExtra(
  profit: number | null,
  extraCost: number,
): number | null {
  return profit === null ? null : profit - extraCost
}

export interface ExtraCostRow {
  profit: number | null
  extraCost: number
}

export interface ExtraCostTotals {
  /** 부대비용 합계. 원가를 모르는 줄의 것도 포함한다 — 실제로 쓴 돈이다. */
  extra: number
  /** 부대비용을 뺀 이익 합계. 원가를 아는 줄만 더한다. */
  profitWithExtra: number
}

export function sumExtraCost(rows: ExtraCostRow[]): ExtraCostTotals {
  let extra = 0
  let profitWithExtra = 0
  for (const r of rows) {
    extra += r.extraCost
    if (r.profit !== null) profitWithExtra += r.profit - r.extraCost
  }
  return { extra, profitWithExtra }
}

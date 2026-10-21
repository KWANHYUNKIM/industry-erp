/**
 * 고정자산 증가 · 감소 전표(원본 E010611 · E010612) — 출력물 다섯이 같은 셈을 쓰게 한 곳에 둔다.
 * 자산 하나에 증가 · 감소가 여러 장이다(원본 2026-10-21 실측: 10/05 증가 10 → 10/15 증가 5 → 10/31 감소 6 → 11/05 감소 9).
 * 서버가 movements 를 안 주는 옛 응답이면 취득 · 처분 칸으로 한 장씩 만든다.
 */
export interface Move {
  id: number
  kind: 'INCREASE' | 'DECREASE'
  slipDate: string
  quantity: number
  /** 증가 = 공급가액, 감소 = 취득원가 몫 */
  amount: number
  /** 감소 전표의 감가상각누계액(원본은 손으로 넣는다) */
  accumAmount: number
  saleAmount: number
  disposalType: 'SALE' | 'SCRAP' | null
  remark: string | null
  /** 수수료(지급수수료(판)) · 거래처 · 처분손익계정(감소) */
  fee?: number
  partnerId?: number | null
  partnerName?: string | null
  gainLossAccountId?: number | null
  gainLossAccountName?: string | null
  gainLoss?: number
  journalDocNo?: string | null
}

export interface AssetMoves {
  id: number
  acquisitionDate: string
  acquisitionCost: number
  accumulatedDepreciation?: number
  quantity?: number
  status: 'IN_USE' | 'DISPOSED'
  disposalDate: string | null
  disposalAmount?: number | null
  remark: string | null
  movements?: Move[]
}

export function movesOf(a: AssetMoves): Move[] {
  if (a.movements && a.movements.length > 0) return a.movements
  const q = Number(a.quantity ?? 1) || 1
  const out: Move[] = [{ id: -a.id, kind: 'INCREASE', slipDate: a.acquisitionDate, quantity: q, amount: Number(a.acquisitionCost),
    accumAmount: 0, saleAmount: 0, disposalType: null, remark: a.remark }]
  if (a.status === 'DISPOSED' && a.disposalDate) {
    out.push({ id: -a.id - 1e9, kind: 'DECREASE', slipDate: a.disposalDate, quantity: q, amount: Number(a.acquisitionCost),
      accumAmount: Number(a.accumulatedDepreciation ?? 0), saleAmount: Number(a.disposalAmount ?? 0),
      disposalType: Number(a.disposalAmount ?? 0) > 0 ? 'SALE' : 'SCRAP', remark: a.remark })
  }
  return out
}

export interface MoveSum { incQty: number; incCost: number; decQty: number; decCost: number; decAccum: number; sale: number }

/** pred 에 드는 전표만 더한다. */
export function sumMoves(a: AssetMoves, pred: (m: Move) => boolean): MoveSum {
  const s: MoveSum = { incQty: 0, incCost: 0, decQty: 0, decCost: 0, decAccum: 0, sale: 0 }
  for (const m of movesOf(a)) {
    if (!pred(m)) continue
    if (m.kind === 'INCREASE') { s.incQty += Number(m.quantity); s.incCost += Number(m.amount) }
    else { s.decQty += Number(m.quantity); s.decCost += Number(m.amount); s.decAccum += Number(m.accumAmount); s.sale += Number(m.saleAmount) }
  }
  return s
}

/** 그날까지(포함) 남은 수량 · 취득가 · 감소 누계. 원본 대장: 남은 수량이 0 이면 줄이 빠진다. */
export function asOf(a: AssetMoves, date: string) {
  const s = sumMoves(a, (m) => m.slipDate <= date)
  return { ...s, qty: s.incQty - s.decQty, cost: s.incCost - s.decCost, held: s.incCost > 0 && s.incCost - s.decCost > 0 }
}

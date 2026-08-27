/**
 * 생산입고/소모현황Ⅰ의 <b>[구분]</b> 집계 — 원본 조건 실측(사본 '생산입고_소모현황 I'):
 * 거래별 · 생산품목별집계 · 소모품목별집계 · 품목별집계 · 생산품목라인별집계.
 *
 * <p>원본 열: 일자-No. · 생산품목코드 · 생산품목명 · 소모품목코드 · 소모품목명 ·
 * 생산수량 · 표준소모수량 · 실제소모수량 · 생산품목단가 · 소모품목단가 · 차이 · 금액.
 *
 * <p><b>수량은 아무 때나 더할 수 없다.</b> 소모품목이 섞인 묶음에서 소모수량을 더하면
 * 'EA 3개 + kg 2' 같은 숫자가 나온다 — 틀린 줄 모르고 읽히는 종류의 숫자다.
 * 그래서 묶음마다 <b>더해도 되는 칸만</b> 더하고 나머지는 비운다. 금액은 언제나 더해도 된다.
 *
 * <p>[품목별집계]와 [생산품목라인별집계]는 만들지 않는다 — 사본에 이름만 있고 줄이 비어 있어
 * 위 셋과 어떻게 다른지를 잴 수가 없다. 이름만 걸어 두면 화면이 거짓말을 한다.
 */

export type ConsumeGroup = '거래별' | '생산품목별집계' | '소모품목별집계'
export const CONSUME_GROUPS: ConsumeGroup[] = ['거래별', '생산품목별집계', '소모품목별집계']

export interface ConsumeRow {
  key: string
  date: string
  prodNo: string
  /** 입고전표 id. 생산수량을 겹쳐 세지 않으려고 든다. */
  productionId: number
  productId: number
  productCode: string
  productName: string
  materialId: number
  materialCode: string
  materialName: string
  producedQty: number
  /** BOM 이 없으면 null — 0 과 구분해야 한다. */
  stdQty: number | null
  actualQty: number
  /** 단가를 모르면 null. 0 으로 채우면 금액 합계가 조용히 작아진다. */
  amount: number | null
}

export interface ConsumeGrouped extends ConsumeRow {
  /** 이 줄이 몇 줄을 접은 것인가. 거래별이면 1. */
  count: number
  /** 단위가 섞여 더할 수 없어 비운 칸인가. */
  qtyMixed: boolean
}

const asRow = (r: ConsumeRow): ConsumeGrouped => ({ ...r, count: 1, qtyMixed: false })

export function rollupConsume(rows: ConsumeRow[], group: ConsumeGroup): ConsumeGrouped[] {
  if (group === '거래별') return rows.map(asRow)

  const byProduct = group === '생산품목별집계'
  const out: ConsumeGrouped[] = []
  const at = new Map<number, ConsumeGrouped>()
  /** 생산수량은 전표 단위다. 같은 전표가 자재 수만큼 나오므로 한 번만 센다. */
  const countedProductions = new Map<number, Set<number>>()

  for (const r of rows) {
    const key = byProduct ? r.productId : r.materialId
    let g = at.get(key)
    if (!g) {
      g = {
        ...r,
        key: (byProduct ? 'P' : 'M') + key,
        // 묶음이 대표하지 않는 칸은 비운다 — 첫 줄 값을 남기면 그 줄만 맞는 것처럼 보인다.
        date: '', prodNo: '',
        productCode: byProduct ? r.productCode : '',
        productName: byProduct ? r.productName : '',
        materialCode: byProduct ? '' : r.materialCode,
        materialName: byProduct ? '' : r.materialName,
        producedQty: 0,
        // 생산품목별로 묶으면 소모품목이 섞인다 — 소모수량을 더할 수 없다.
        stdQty: byProduct ? null : 0,
        actualQty: 0,
        amount: null,
        count: 0,
        qtyMixed: byProduct,
      }
      at.set(key, g)
      out.push(g)
    }
    g.count += 1

    if (byProduct) {
      const seen = countedProductions.get(key) ?? new Set<number>()
      if (!seen.has(r.productionId)) { g.producedQty += r.producedQty; seen.add(r.productionId) }
      countedProductions.set(key, seen)
    } else {
      // 소모품목으로 묶으면 단위가 같다 — 더해도 된다.
      if (r.stdQty != null) g.stdQty = (g.stdQty ?? 0) + r.stdQty
      g.actualQty += r.actualQty
    }

    // 금액은 언제나 더해도 된다. 다만 <b>아는 것만</b> 더한다 — 모르는 것을 0 으로 치면
    // 합계가 조용히 작아지고, 아무도 그 차이를 못 본다.
    if (r.amount != null) g.amount = (g.amount ?? 0) + r.amount
  }
  return out
}

/**
 * 재고변동표 [일별]·[월별] — 수불 줄을 날짜(또는 월)로 묶어 기초·입고·출고·기말을 낸다.
 *
 * 구간별 기초는 '기간 전체의 기초'에서 시작해 앞 구간의 기말을 다음 구간의 기초로 굴린다.
 * 그래야 구간끼리 이어지고 마지막 구간의 기말이 집계 보기의 기말과 맞는다.
 */
export interface BucketTx {
  transactionDate: string
  quantityChange: number
}

export interface StockBucket {
  key: string
  opening: number; inQty: number; outQty: number; closing: number; count: number
}

export function stockBuckets(openingTotal: number, txs: BucketTx[], by: '일별' | '월별'): StockBucket[] {
  const bucketOf = (d: string) => (by === '월별' ? d.slice(0, 7) : d.slice(0, 10))
  const map = new Map<string, { inQty: number; outQty: number; count: number }>()
  for (const t of txs) {
    const k = bucketOf(t.transactionDate)
    const b = map.get(k) ?? { inQty: 0, outQty: 0, count: 0 }
    if (t.quantityChange >= 0) b.inQty += t.quantityChange
    else b.outQty += -t.quantityChange
    b.count += 1
    map.set(k, b)
  }
  let running = openingTotal
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, b]) => {
    const opening = running
    const closing = opening + b.inQty - b.outQty
    running = closing
    return { key, opening, inQty: b.inQty, outQty: b.outQty, closing, count: b.count }
  })
}

/**
 * [일별]·[월별] 표의 합계. <b>그 표의 구간들로</b> 낸다 — 집계 보기의 품목 줄 합계를 갖다 쓰면
 * 집계에서 걸어 둔 품목·검색어 조건(일별에서는 칸이 숨어 안 보인다)이 합계에만 걸려,
 * 위 구간 줄들과 맞지 않는 입고계·출고계가 찍힌다.
 */
export function bucketTotals(buckets: StockBucket[]) {
  return {
    opening: buckets.length ? buckets[0].opening : 0,
    inQty: buckets.reduce((n, b) => n + b.inQty, 0),
    outQty: buckets.reduce((n, b) => n + b.outQty, 0),
    closing: buckets.length ? buckets[buckets.length - 1].closing : 0,
  }
}

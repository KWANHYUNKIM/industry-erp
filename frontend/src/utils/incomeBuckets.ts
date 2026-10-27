/**
 * 손익 계정을 원본 손익계산서의 번호 줄로 나눈다(2026-10-03 실측) — 1. 매출 · 2. 매출원가 · 4. 판매비 및 일반관리비 ·
 * 6. 영업외수익 · 7. 영업외비용 · 9. 법인세비용. 손익계산서와 월별손익분석이 같은 가름을 써야 두 화면의 숫자가 맞는다.
 *
 * <p>우리 계정은 세부분류(detailCategory) 한 칸만 들어 그것으로 가른다 — 매출액 → 매출, 매출원가 · 제조원가 → 매출원가,
 * 영업외수익 · 영업외비용 · 법인세비용은 그대로, 나머지 비용은 판매비 및 일반관리비.
 */
export type IncomeBucket = 'SALES' | 'COGS' | 'SGA' | 'NOI' | 'NOE' | 'TAX'

export function incomeBucketOf(division: string, category: string): IncomeBucket {
  if (division === 'REVENUE') return category === '매출액' ? 'SALES' : 'NOI'
  if (category === '매출원가' || category === '제조원가') return 'COGS'
  if (category === '영업외비용') return 'NOE'
  if (category === '법인세비용') return 'TAX'
  return 'SGA'
}

/** 묶음 합으로 계산 줄(3 · 5 · 8 · 12)을 낸다. */
export function incomeCalc(sum: (b: IncomeBucket) => number) {
  const gross = sum('SALES') - sum('COGS')
  const op = gross - sum('SGA')
  const pre = op + sum('NOI') - sum('NOE')
  return { gross, op, pre, net: pre - sum('TAX') }
}

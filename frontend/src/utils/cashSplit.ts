/** 분개 한 줄 — 계정코드와 차 · 대 금액만 본다. */
export interface SplitLine { accountCode: string; debit: number | string; credit: number | string }
/** 줄마다 현금으로 오간 몫과 대체 몫. */
export interface SplitPart { dCash: number; dTrans: number; cCash: number; cTrans: number }

/**
 * 일/월계표의 현금 · 대체 가름 — 전표 하나에서 현금 계정의 반대편 줄에 <b>현금 금액만큼만</b> '현금'을 나눠 주고
 * 넘치는 몫은 '대체'로 둔다. 예: 차)잡급 200,000 / 대)현금 198,520 · 대)예수금 1,480 이면 잡급은 현금(출금) 198,520 + 대체 1,480,
 * 예수금은 대체 1,480. 예전엔 현금이 든 전표의 반대편 줄을 통째로 현금으로 쳐서 현금 열 합이 현금 계정의 증감과 어긋났다.
 * 같은 쪽 줄이 여럿이면 전표에 적힌 차례대로 현금을 채운다. 현금 계정 자신의 줄은 결과에 넣지 않는다(빈 몫).
 */
export function cashSplit(lines: SplitLine[], cashCode: string): SplitPart[] {
  let cashIn = 0, cashOut = 0
  for (const l of lines) {
    if (l.accountCode !== cashCode) continue
    cashIn += Number(l.debit)
    cashOut += Number(l.credit)
  }
  return lines.map((l) => {
    const part: SplitPart = { dCash: 0, dTrans: 0, cCash: 0, cTrans: 0 }
    if (l.accountCode === cashCode) return part
    const d = Number(l.debit), c = Number(l.credit)
    if (d) { const x = Math.min(d, cashOut); part.dCash = x; part.dTrans = d - x; cashOut -= x }
    if (c) { const x = Math.min(c, cashIn); part.cCash = x; part.cTrans = c - x; cashIn -= x }
    return part
  })
}

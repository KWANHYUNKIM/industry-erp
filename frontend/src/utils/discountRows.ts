import { subtotalBy, type Subtotal } from './subtotalBy.ts'

/**
 * 판매·구매·외주비 할인현황의 줄 만들기 — 원본 한 줄은 <b>일자 × 거래처</b>다.
 *
 * <p><b>창고·담당자·프로젝트·거래유형은 전표 하나하나가 가진 값이다.</b> 예전엔 일자 × 거래처로
 * 먼저 합친 뒤 줄에 <b>첫 전표의</b> 창고·담당자만 남기고 그 값으로 걸렀다. 그래서 같은 날 같은
 * 거래처에 본사창고 전표와 QA창고 전표가 있으면, 창고=QA창고 로 걸면 QA창고 전표가 통째로
 * 사라지고, 창고 소계는 두 전표 금액을 모두 본사창고에 몰아 줬다. 이제 전표 단위로 먼저 거르고
 * 나서 합치며, 소계는 같은 줄 안에서도 창고·담당자별로 다시 나눠 더한다.
 */
export interface DiscountSrc {
  date: string; docNo: string; partnerId: number; partnerName: string
  warehouseId: number | null; warehouseName: string | null
  employeeName: string | null; projectId: number | null; projectName: string | null
  supplyAmount: number; reflected: boolean; remark: string | null; taxable: boolean
}

export interface DiscountRow {
  date: string
  partner: string
  /** 코드도움 조건은 id 로 견준다 — 거래처 이름은 겹칠 수 있다. */
  partnerId: number
  /** 전표 공급가액 합. */
  orgAmount: number
  /** 그중 회계로 넘어간 금액(전표 단위 — 반영됐으면 전액). */
  reflectedAmount: number
  remarks: string[]
  docNos: string[]
  /** 이 줄에 든 전표들 — 소계를 창고·담당자로 다시 나눌 때 쓴다. */
  docs: DiscountSrc[]
}

/** 전표 하나에 거는 조건. 값이 비면 안 건다. */
export interface DiscountDocFilter {
  from: string; to: string
  tradeType?: '전체' | '과세' | '면세'
  /** 창고 id(문자열). */
  warehouse?: string
  /** 사원명(코드도움 값). */
  employee?: string
  /** 프로젝트 id(문자열). */
  project?: string
}

function group(docs: readonly DiscountSrc[], dim?: (d: DiscountSrc) => string): DiscountRow[] {
  const m = new Map<string, DiscountRow>()
  for (const d of docs) {
    const key = `${d.date}|${d.partnerId}|${dim ? dim(d) : ''}`
    let cur = m.get(key)
    if (!cur) {
      cur = { date: d.date, partner: d.partnerName, partnerId: d.partnerId,
        orgAmount: 0, reflectedAmount: 0, remarks: [], docNos: [], docs: [] }
      m.set(key, cur)
    }
    cur.orgAmount += d.supplyAmount
    if (d.reflected) cur.reflectedAmount += d.supplyAmount
    if (d.remark) cur.remarks.push(d.remark)
    cur.docNos.push(d.docNo)
    cur.docs.push(d)
  }
  return [...m.values()]
}

/** 전표를 거른 뒤 일자 × 거래처로 합친다. 최근 일자가 위, 같은 날은 거래처명 순. */
export function discountRows(docs: readonly DiscountSrc[], f: DiscountDocFilter): DiscountRow[] {
  const kept = docs.filter((d) => {
    if (d.date < f.from || d.date > f.to) return false
    if (f.tradeType && f.tradeType !== '전체' && (d.taxable ? '과세' : '면세') !== f.tradeType) return false
    if (f.warehouse && String(d.warehouseId) !== f.warehouse) return false
    if (f.employee && (d.employeeName ?? '') !== f.employee) return false
    if (f.project && String(d.projectId) !== f.project) return false
    return true
  })
  return group(kept).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.partner.localeCompare(b.partner)))
}

/**
 * [정렬/소계기준] 소계. 거래처는 줄 그대로, 창고·담당자는 줄 안의 전표를 그 값으로 다시 나눠 더한다.
 * 건수는 (일자 × 거래처 × 소계값) 줄 수다.
 */
export function discountSubtotals(
  rows: readonly DiscountRow[], by: '거래처' | '창고' | '담당자',
): Subtotal<DiscountRow>[] {
  const value = (d: DiscountSrc) => (by === '창고' ? d.warehouseName : by === '담당자' ? d.employeeName : d.partnerName)
  const split = by === '거래처' ? [...rows] : group(rows.flatMap((r) => r.docs), (d) => value(d) ?? '')
  return subtotalBy(split, (r) => (by === '거래처' ? r.partner : value(r.docs[0])),
    { org: (r) => r.orgAmount, ref: (r) => r.reflectedAmount })
}

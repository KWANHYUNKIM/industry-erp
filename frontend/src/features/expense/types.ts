/** 서버 /api/expenses 응답(ExpenseDtos.ExpenseResponse) — 비용내역입력 · 조회 · 전표별회계반영 · 현황이 같이 쓴다. */
export interface ExpenseRow {
  id: number
  docNo: string
  expenseDate: string
  accountId: number
  accountName: string
  accountGroupName: string | null
  content: string | null
  partnerName: string | null
  partnerId: number | null
  amount: number
  department: string | null
  projectId: number | null
  projectName: string | null
  createdBy: string | null
  useDate: string
  remarks: string | null
  payType: 'PERSONAL' | 'COMPANY' | null
  payTypeName: string | null
  expenseItemId: number | null
  expenseItemCode: string | null
  expenseItemName: string | null
  employeeId: number | null
  expenseGroupId: number | null
  expenseGroupCode: string | null
  expenseGroupName: string | null
  /** 가지급금정산서(회계전표) id — 전표별회계반영 뒤에 채워진다 */
  settledJournalId: number | null
  accountCode: string | null
  /** 전표 번호(같은 값 = 한 전표의 줄) · 줄 차례 — 옛 지출은 docNo · 1 */
  slipDocNo: string
  lineNo: number
  allocAmount: number | null
  amount1: number | null
  amount2: number | null
  memo1: string | null
  memo2: string | null
  memo3: string | null
  bankAccountId: number | null
}

/** 비용내역 전표 한 장 = 같은 slipDocNo 의 줄들(줄 차례대로). 조회 · 전표별회계반영은 한 장을 한 줄로 보인다(원본 2026-10-20). */
export function groupSlips(rows: ExpenseRow[]): ExpenseRow[][] {
  const m = new Map<string, ExpenseRow[]>()
  for (const r of rows) {
    const k = r.slipDocNo ?? r.docNo
    const g = m.get(k)
    if (g) g.push(r)
    else m.set(k, [r])
  }
  return [...m.values()].map((g) => g.sort((a, b) => (a.lineNo ?? 1) - (b.lineNo ?? 1)))
}

/** '2026/10/20 -1' — 원본 [일자-No.]. 우리 번호 EX-20261020-0001 의 끝 일련번호. */
export function slipNo(r: Pick<ExpenseRow, 'expenseDate' | 'docNo'> & { slipDocNo?: string | null }): string {
  const seq = Number((r.slipDocNo ?? r.docNo).split('-')[2])
  return `${r.expenseDate.replace(/-/g, '/')} -${Number.isFinite(seq) ? seq : r.docNo}`
}

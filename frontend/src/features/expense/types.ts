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
}

/** '2026/10/20 -1' — 원본 [일자-No.]. 우리 번호 EX-20261020-0001 의 끝 일련번호. */
export function slipNo(r: Pick<ExpenseRow, 'expenseDate' | 'docNo'>): string {
  const seq = Number(r.docNo.split('-').pop())
  return `${r.expenseDate.replace(/-/g, '/')} -${Number.isFinite(seq) ? seq : r.docNo}`
}

/** 회계 II › 채권관리 · 채무관리 — 채권(채무)내역 보조장부. 서버 BondDtos 와 같은 모양. */
export type BondSide = 'RECEIVABLE' | 'PAYABLE'
export type BondDirection = 'INCREASE' | 'DECREASE'

export interface BondLine {
  id: number
  lineNo: number
  accountId: number
  accountCode: string
  accountName: string
  partnerId: number | null
  partnerCode: string | null
  partnerName: string | null
  bondNo: string
  amount: number
  dueDate: string | null
  departmentId: number | null
  projectId: number | null
  projectName: string | null
  memo: string | null
}

export interface BondEntry {
  id: number
  side: BondSide
  entryDate: string
  entryNo: number
  direction: BondDirection
  directionName: string
  createdBy: string | null
  updatedBy: string | null
  lines: BondLine[]
}

/** 장 · 줄을 펼친 한 줄 — 조회 · 현황 화면은 모두 이것을 센다. */
export interface BondRow extends BondLine {
  entryId: number
  entryDate: string
  entryNo: number
  direction: BondDirection
  createdBy: string | null
  updatedBy: string | null
}

export function flatten(entries: BondEntry[]): BondRow[] {
  return entries.flatMap((e) => e.lines.map((l) => ({
    ...l, entryId: e.id, entryDate: e.entryDate, entryNo: e.entryNo, direction: e.direction,
    createdBy: e.createdBy, updatedBy: e.updatedBy,
  })))
}

/** 화면 글자 — 채권 화면은 '채권', 채무 화면은 '채무'. */
export const sideWord = (side: BondSide) => (side === 'RECEIVABLE' ? '채권' : '채무')

/** 한 채권(같은 계정 · 거래처 · 채권번호)의 열쇠. 원본 거래내역 묶음 줄이 이 셋이다. */
export const bondKey = (r: Pick<BondRow, 'accountId' | 'partnerId' | 'bondNo'>) =>
  `${r.accountId}/${r.partnerId ?? ''}/${r.bondNo}`

/** 증가는 +, 감소는 −. */
export const signed = (r: BondRow) => (r.direction === 'INCREASE' ? Number(r.amount) : -Number(r.amount))

export const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 원본 [일자-No.] — '2026/10/12 -1'. */
export const dateNo = (r: { entryDate: string; entryNo: number }) => `${r.entryDate.replaceAll('-', '/')} -${r.entryNo}`

/**
 * 채권번호 [Fn ▸ 코드생성] — 원본이 만든 번호는 '26101218320704900001'(yyMMddHHmmss + 밀리초 3자리 + 줄 5자리, 2026-10-12 실측).
 */
export function newBondNo(row: number, now = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}${p(now.getMilliseconds(), 3)}${p(row, 5)}`
}

import { ymd } from '../../utils/periods'

/** 일용근로 급여 보고 화면들이 같이 쓰는 줄 — 서버 DailyPayDtos.ReportLine. */
export interface DailyReportLine {
  lineId: number; ledgerId: number; payMonth: string; seq: number; ledgerName: string; paidMonth: string; payDate: string
  confirmed: boolean; workerId: number; workerCode: string; workerName: string; department: string
  lastWorkDate: string | null; days: number; grossPay: number; incomeTax: number; localTax: number; netPay: number
  bankName: string | null; accountNo: string | null; accountHolder: string | null
}

export const won = (n: number) => Number(n).toLocaleString('ko-KR')
export const slashYm = (ym: string) => ym.replace('-', '/')
const ymOf = (d: Date) => ymd(d).slice(0, 7)

/** 귀속연월 빠른선택 — 원본 [전월] [전월+금월] [금년] [전년] [금월]. */
export function monthRange(label: string): { from: string; to: string } {
  const n = new Date()
  const y = n.getFullYear(), m = n.getMonth()
  const prev = ymOf(new Date(y, m - 1, 1))
  switch (label) {
    case '금월': return { from: ymOf(n), to: ymOf(n) }
    case '전월': return { from: prev, to: prev }
    case '금년': return { from: `${y}-01`, to: `${y}-12` }
    case '전년': return { from: `${y - 1}-01`, to: `${y - 1}-12` }
    default: return { from: prev, to: ymOf(n) }
  }
}

export const lastDay = (ym: string) => { const [y, m] = ym.split('-').map(Number); return ymd(new Date(y, m, 0)) }

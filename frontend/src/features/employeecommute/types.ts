import { ymd } from '../../utils/periods'

/** 출/퇴근기록부(사원) 줄 — 서버 EmployeeCommuteDtos.CommuteResponse. 현황 화면들이 같이 쓴다. */
export interface EmployeeCommuteLine {
  id: number; workDate: string; employeeId: number; employeeCode: string; employeeName: string; department: string
  clockIn: string; clockOut: string | null; place: string | null; outside: boolean; morningHalf: boolean; reason: string | null
  workMinutes: number | null; late: boolean; enteredAt: string | null; employeeActive: boolean
}

export const slashDate = (s: string) => s.replace(/-/g, '/')

/** 2026-10-03T20:23:33 → '2026/10/03 오후 8:23:33'(원본 글자) */
export function koreanDateTime(dt: string | null): string {
  if (!dt) return ''
  const [d, t] = dt.split('T')
  const [h, m, s] = t.split(':').map((x) => Number(x.slice(0, 2)))
  return `${slashDate(d)} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}:${String(s || 0).padStart(2, '0')}`
}

/** 토 · 일 이면 휴일(원본 업무일/휴일구분 — 공휴일 달력은 아직 없다). */
export const isHoliday = (date: string) => { const d = new Date(`${date}T00:00:00`).getDay(); return d === 0 || d === 6 }

export const monthToToday = () => { const d = new Date(); return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: ymd(d) } }

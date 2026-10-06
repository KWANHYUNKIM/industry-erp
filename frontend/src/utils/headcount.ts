import { ymd } from './periods.ts'

/** 인원현황(E020609)이 세는 사원 — 입사일자 · 퇴사일자만 본다. */
export interface HeadcountEmp { name: string; hireDate: string | null; resignDate: string | null }
export interface HeadcountRow { key: string; label: string; hired: string[]; resigned: string[]; total: number }

/**
 * 인원현황의 줄을 만든다. 일별은 하루 한 줄(2026/10/01), 월별은 한 달 한 줄(2025/01).
 *
 * <p>총인원은 그날(월별이면 그달 끝, 이번 달은 기간 끝) 다니는 사람 수다 — 입사일자 ≤ 그날이고
 * 퇴사일자가 없거나 그날 뒤. <b>퇴사일 당일은 이미 나간 사람</b>으로 센다(그날 퇴사인원에 잡히므로).
 * 입사일자가 빈 사원은 처음부터 다니던 사람으로 센다 — 비워 둔 채 등록한 사원이 총인원에서 빠지지 않게.
 */
export function headcountRows(emps: HeadcountEmp[], mode: '일별' | '월별', from: string, to: string): HeadcountRow[] {
  const out: HeadcountRow[] = []
  if (!from || !to || from > to) return out
  const at = (d: string) => emps.filter((e) => (!e.hireDate || e.hireDate <= d) && (!e.resignDate || e.resignDate > d)).length
  if (mode === '일별') {
    for (let d = new Date(`${from}T00:00:00`); ymd(d) <= to; d.setDate(d.getDate() + 1)) {
      const s = ymd(d)
      out.push({ key: s, label: s.replace(/-/g, '/'),
        hired: emps.filter((e) => e.hireDate === s).map((e) => e.name),
        resigned: emps.filter((e) => e.resignDate === s).map((e) => e.name), total: at(s) })
    }
  } else {
    for (let m = new Date(`${from.slice(0, 7)}-01T00:00:00`); ymd(m).slice(0, 7) <= to.slice(0, 7); m.setMonth(m.getMonth() + 1)) {
      const ym = ymd(m).slice(0, 7)
      const end = ymd(new Date(m.getFullYear(), m.getMonth() + 1, 0))
      out.push({ key: ym, label: ym.replace('-', '/'),
        hired: emps.filter((e) => e.hireDate?.slice(0, 7) === ym).map((e) => e.name),
        resigned: emps.filter((e) => e.resignDate?.slice(0, 7) === ym).map((e) => e.name),
        total: at(end < to ? end : to) })
    }
  }
  return out
}

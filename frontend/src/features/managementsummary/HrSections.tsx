import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { Attendance } from '../../types/api'
import { headcountRows } from '../../utils/headcount'
import { koreanDateTime, type EmployeeCommuteLine } from '../employeecommute/types'
import { SUB_ROW, SectionHead, slash, useCount, type SectionProps } from './shared'

const two = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const clock = (date: string, t: string | null) => (t ? koreanDateTime(`${date}T${t.length === 5 ? `${t}:00` : t}`) : '')
const mins = (m: number | null) => (m == null ? '' : `${m} 분`)

function CommuteTable({ no, title, from, to, rows }: { no: number; title: string; from: string; to: string; rows: { key: string; date: string; name: string; inAt: string; outAt: string; minutes: number | null }[] }) {
  const total = rows.reduce((s, r) => s + (r.minutes ?? 0), 0)
  return (
    <>
      <SectionHead no={no} title={title} from={from} to={to} />
      <table className="w-full text-left">
        <thead><tr><th className="text-center">일자</th><th>사원명</th><th>출근시간</th><th>퇴근시간</th><th>근무시간(시간단위)</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}><td className="text-center">{slash(r.date)}</td><td>{r.name}</td><td>{r.inAt}</td><td>{r.outAt}</td><td className="text-right">{mins(r.minutes)}</td></tr>
          ))}
          <tr className={SUB_ROW}><td colSpan={4} className="text-center">합계</td><td className="text-right">{mins(total)}</td></tr>
        </tbody>
      </table>
    </>
  )
}

/**
 * 경영요약보고서 › <b>출/퇴근현황(ID)</b>(그룹웨어) — 2026-10-22 loginaa 실측. 일자 · 사원명 · 출근시간('2026/10/06 오후 9:36:17') · 퇴근시간 ·
 * 근무시간(시간단위)('3 분'), 끝 합계(앞 네 칸 묶음). 그룹웨어 API(/attendances)로 프런트에서 그린다.
 */
export function AttendanceIdSection({ from, to, startNo, onCount }: SectionProps) {
  const [list, setList] = useState<Attendance[] | null>(null)
  useEffect(() => {
    api.get<Attendance[]>('/attendances', { params: { from, to } }).then((r) => setList(r.data)).catch(() => setList([]))
  }, [from, to])
  const rows = useMemo(() => (list ?? []).filter((a) => a.clockIn && a.workDate >= from && a.workDate <= to)
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.userName.localeCompare(b.userName))
    .map((a) => ({ key: String(a.id), date: a.workDate, name: a.userName, inAt: clock(a.workDate, a.clockIn), outAt: clock(a.workDate, a.clockOut), minutes: a.workMinutes })), [list, from, to])
  useCount(onCount, rows.length > 0 ? 1 : 0, list !== null)
  if (rows.length === 0) return null
  return <CommuteTable no={startNo} title="출/퇴근현황(ID)" from={from} to={to} rows={rows} />
}

/** 경영요약보고서 › <b>출/퇴근현황(사원)</b>(관리 근태관리) — 출/퇴근기록부(사원) 줄(/hr/employee-commutes)로 같은 꼴. 원본 자료가 없어 열은 (ID) 표와 같게 둠. */
export function EmployeeCommuteSection({ from, to, startNo, onCount }: SectionProps) {
  const [list, setList] = useState<EmployeeCommuteLine[] | null>(null)
  useEffect(() => {
    api.get<EmployeeCommuteLine[]>('/hr/employee-commutes', { params: { from, to } }).then((r) => setList(r.data)).catch(() => setList([]))
  }, [from, to])
  const rows = useMemo(() => [...(list ?? [])].sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeName.localeCompare(b.employeeName))
    .map((r) => ({ key: String(r.id), date: r.workDate, name: r.employeeName, inAt: koreanDateTime(r.clockIn), outAt: koreanDateTime(r.clockOut), minutes: r.workMinutes })), [list])
  useCount(onCount, rows.length > 0 ? 1 : 0, list !== null)
  if (rows.length === 0) return null
  return <CommuteTable no={startNo} title="출/퇴근현황(사원)" from={from} to={to} rows={rows} />
}

interface Emp { id: number; name: string; hireDate: string | null; resignDate: string | null }

/** 경영요약보고서 › <b>인원현황</b>(관리 인사관리) — '일자 | 입사자 | 입사인원 | 퇴사자 | 퇴사인원 | 총인원'을 날마다, 끝 합계(앞 두 칸 묶음 + 빈칸 넷). 인원은 소수 둘째 자리, 0 은 빈칸. */
export function HeadcountSection({ from, to, startNo, onCount }: SectionProps) {
  const [emps, setEmps] = useState<Emp[] | null>(null)
  useEffect(() => { api.get<Emp[]>('/employees/all').then((r) => setEmps(r.data)).catch(() => setEmps([])) }, [])
  const rows = useMemo(() => headcountRows(emps ?? [], '일별', from, to), [emps, from, to])
  useCount(onCount, rows.length > 0 && (emps?.length ?? 0) > 0 ? 1 : 0, emps !== null)
  if (rows.length === 0 || !emps || emps.length === 0) return null
  const cnt = (n: number) => (n === 0 ? '' : two(n))
  return (
    <>
      <SectionHead no={startNo} title="인원현황" from={from} to={to} />
      <table className="w-full text-left">
        <thead><tr><th className="text-center">일자</th><th>입사자</th><th className="text-right">입사인원</th><th>퇴사자</th><th className="text-right">퇴사인원</th><th className="text-right">총인원</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="text-center">{r.label}</td><td>{r.hired.join(', ')}</td><td className="text-right">{cnt(r.hired.length)}</td>
              <td>{r.resigned.join(', ')}</td><td className="text-right">{cnt(r.resigned.length)}</td><td className="text-right">{two(r.total)}</td>
            </tr>
          ))}
          <tr className={SUB_ROW}><td colSpan={2} className="text-center">합계</td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
    </>
  )
}

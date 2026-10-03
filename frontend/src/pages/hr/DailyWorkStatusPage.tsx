import { Fragment, useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks, { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'

interface Line { id: number; slipDate: string; slipNo: number; workDate: string; workerCode: string; workerName: string; payItem: string; quantity: number }

/** 원본 빠른선택: 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 전월+금월 · 금년 · 전년 · 종료일 */
const PICKS = [...STATUS_PICKS, '금년', '전년', '종료일'] as const
const slash = (s: string) => s.replace(/-/g, '/')

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 근무기록 &gt; <b>일용근로 근무현황</b> (원본 E020752).
 *
 * <p>2026-10-03 loginaa 실측: 조건이 펼쳐진 현황 — 구분(라인별 · 달력형 · 사용자지정집계) · 기준일자(금월) · 부서 · 프로젝트 · 사원번호 ·
 * 수당항목. 결과 '근무현황' · 회사명 · 기간, 격자 일자-No. · 근무일자 · 사원번호 · 성명 · 수당항목 · 근무기록 · 프로젝트명,
 * 전표일자 차례(오래된 것이 위)로 날마다 '2026/09/02 계' 소계, 끝에 합계. 구분은 라인별만, 부서 · 프로젝트 · 수당항목 조건 ·
 * 프로젝트명 열 · 달력형 · 사용자지정집계는 없다(근무입력에 프로젝트 칸이 없다).
 */
export default function DailyWorkStatusPage() {
  const month = () => { const d = new Date(); const y = d.getFullYear(), m = d.getMonth(); return { from: periodOf('금월(~오늘)')!.from, to: new Date(y, m + 1, 0).toLocaleDateString('sv-SE') } }
  const [range, setRange] = useState(month)
  const [shown, setShown] = useState(range)
  const [empCond, setEmpCond] = useState('')
  const [rows, setRows] = useState<Line[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<Line[]>('/hr/daily-work-entries', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShown(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const list = rows
    .filter((r) => !empCond || r.workerCode.includes(empCond) || r.workerName.includes(empCond))
    .sort((a, b) => a.slipDate.localeCompare(b.slipDate) || a.slipNo - b.slipNo || b.workerCode.localeCompare(a.workerCode))
  useTableColumnCheck(tableRef, '일용근로 근무현황', [list.length])
  const days = new Map<string, Line[]>()
  for (const r of list) days.set(r.slipDate, [...(days.get(r.slipDate) ?? []), r])
  const qty = (ls: Line[]) => ls.reduce((s, r) => s + Number(r.quantity), 0)

  return (
    <EcListShell title="일용근로 근무현황" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[150px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="date" className="ec-input w-[150px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="사원번호"><input className="ec-input w-full" placeholder="사원번호" value={empCond} onChange={(e) => setEmpCond(e.target.value)} /></EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        <EcPeriodPicks labels={PICKS} currentFrom={range.from} onPick={setRange} />
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="text-center font-bold mb-[2px]">근무현황</div>
      <div className="text-ec-hint mb-[4px]">{slash(shown.from)} ~ {slash(shown.to)}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>일자-No.</th>
            <th className="text-center">근무일자</th>
            <th>사원번호</th>
            <th>성명</th>
            <th>수당항목</th>
            <th className="text-right">근무기록</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {[...days.entries()].map(([d, ls]) => (
                <Fragment key={d}>
                  {ls.map((r) => (
                    <tr key={r.id}>
                      <td>{slash(r.slipDate)} -{r.slipNo}</td>
                      <td className="text-center">{slash(r.workDate)}</td>
                      <td>{r.workerCode}</td>
                      <td>{r.workerName}</td>
                      <td>{r.payItem}</td>
                      <td className="text-right">{Number(r.quantity)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td colSpan={5}>{slash(d)} 계</td>
                    <td className="text-right">{qty(ls)}</td>
                  </tr>
                </Fragment>
              ))}
              <tr className="font-bold">
                <td colSpan={5}>합계</td>
                <td className="text-right">{qty(list)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

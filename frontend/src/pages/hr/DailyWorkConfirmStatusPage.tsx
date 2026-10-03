import { Fragment, useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { lastDay, monthRange, slashYm } from '../../features/dailypay/report'

interface Row { payMonth: string; seq: number; workerCode: string; workerName: string; payItem: string; days: number }

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 급여작업 &gt; <b>일용근로 근무확정현황</b> (원본 E020754, 결과 제목 '근무기록확정현황').
 *
 * <p>2026-10-03 loginaa 실측: 조건 구분(라인별 · 사용자지정집계) · 귀속연월(전월+금월) · 지급연월 · 지급일 · 부서 · 프로젝트 · 사원번호 ·
 * 수당항목. 결과 귀속연월-NO · 성명 · 수당항목명 · 근무기록, 귀속연월마다 '2026/07 계' 와 합계(근무기록 1).
 * 지급연월 · 지급일 · 부서 · 프로젝트 · 수당항목 조건 · 사용자지정집계는 없다.
 */
export default function DailyWorkConfirmStatusPage() {
  const [range, setRange] = useState(monthRange('전월+금월'))
  const [shown, setShown] = useState(range)
  const [empCond, setEmpCond] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<Row[]>('/hr/daily-pay-ledgers/work-confirms', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShown(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const list = rows.filter((r) => !empCond || r.workerCode.includes(empCond) || r.workerName.includes(empCond))
  useTableColumnCheck(tableRef, '일용근로 근무확정현황', [list.length])
  const months = new Map<string, Row[]>()
  for (const r of list) months.set(r.payMonth, [...(months.get(r.payMonth) ?? []), r])
  const total = list.reduce((s, r) => s + Number(r.days), 0)

  return (
    <EcListShell title="일용근로 근무확정현황" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="사원번호"><input className="ec-input w-full" placeholder="사원번호" value={empCond} onChange={(e) => setEmpCond(e.target.value)} /></EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        {['전월', '전월+금월', '금년', '전년', '금월'].map((l) => (
          <button key={l} type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(monthRange(l))}>{l}</button>
        ))}
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="text-center font-bold mb-[2px]">근무기록확정현황</div>
      <div className="text-ec-hint mb-[4px]">{shown.from.replace('-', '/')}/01 ~ {lastDay(shown.to).replace(/-/g, '/')}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>귀속연월-NO</th>
            <th>성명</th>
            <th>수당항목명</th>
            <th className="text-right">근무기록</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {[...months.entries()].map(([m, ls]) => (
                <Fragment key={m}>
                  {ls.map((r, i) => (
                    <tr key={`${m}-${i}`}>
                      <td>{slashYm(r.payMonth)} -{r.seq}</td>
                      <td>{r.workerName}</td>
                      <td>{r.payItem}</td>
                      <td className="text-right">{Number(r.days)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td colSpan={3}>{slashYm(m)} 계</td>
                    <td className="text-right">{ls.reduce((s, r) => s + Number(r.days), 0)}</td>
                  </tr>
                </Fragment>
              ))}
              <tr className="font-bold">
                <td colSpan={3}>합계</td>
                <td className="text-right">{total}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

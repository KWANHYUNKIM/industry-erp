import { Fragment, useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { lastDay, monthRange, slashYm, won, type DailyReportLine } from '../../features/dailypay/report'

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 급여작업 &gt; <b>일용근로 급여현황</b> (원본 E020753).
 *
 * <p>2026-10-03 loginaa 실측: 조건이 펼쳐진 현황 — 구분(라인별 · 급여대장별부서별 · …) · 귀속연월(전월+금월) · 지급연월(사용) ·
 * 지급구분 · 부서 · 사원 · 확정여부(전체 · 미확정 · 확정). 결과 머리 '급여현황' · 회사명 · 기간, 격자 귀속연월-NO · 급여대장명 ·
 * 최종근무일 · 부서명 · 프로젝트명 · 성명 · 지급총액 · 공제총액 · 실지급액, 대장마다 '2026/07-1 계' 소계와 합계.
 * 빠른선택 전월 · 전월+금월 · 금년 · 전년 · 금월. 구분은 라인별만, 지급연월 · 지급구분 · 프로젝트명 · 사용자지정집계는 없다.
 */
export default function DailyPayStatusPage() {
  const [range, setRange] = useState(monthRange('전월+금월'))
  const [shown, setShown] = useState(range)
  const [deptCond, setDeptCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [confirmed, setConfirmed] = useState<'all' | 'no' | 'yes'>('all')
  const [rows, setRows] = useState<DailyReportLine[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<DailyReportLine[]>('/hr/daily-pay-ledgers/lines', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShown(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const list = rows.filter((r) => (!deptCond || r.department.includes(deptCond))
    && (!empCond || r.workerName.includes(empCond) || r.workerCode.includes(empCond))
    && (confirmed === 'all' || (confirmed === 'yes') === r.confirmed))
  useTableColumnCheck(tableRef, '일용근로 급여현황', [list.length])
  const groups = new Map<number, DailyReportLine[]>()
  for (const r of list) groups.set(r.ledgerId, [...(groups.get(r.ledgerId) ?? []), r])
  const sum = (ls: DailyReportLine[]) => ls.reduce((s, r) => ({
    gross: s.gross + Number(r.grossPay), ded: s.ded + Number(r.incomeTax) + Number(r.localTax), net: s.net + Number(r.netPay),
  }), { gross: 0, ded: 0, net: 0 })
  const total = sum(list)

  return (
    <EcListShell title="일용근로 급여현황" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="부서"><input className="ec-input w-full" placeholder="부서" value={deptCond} onChange={(e) => setDeptCond(e.target.value)} /></EcCond>
        <EcCond label="사원"><input className="ec-input w-full" placeholder="사원" value={empCond} onChange={(e) => setEmpCond(e.target.value)} /></EcCond>
        <EcCond label="확정여부">
          {([['all', '전체'], ['no', '미확정'], ['yes', '확정']] as const).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-[4px] mr-[10px]">
              <input type="radio" name="dps-confirmed" checked={confirmed === v} onChange={() => setConfirmed(v)} /> {l}
            </label>
          ))}
        </EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        {['전월', '전월+금월', '금년', '전년', '금월'].map((l) => (
          <button key={l} type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(monthRange(l))}>{l}</button>
        ))}
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="text-center font-bold mb-[2px]">급여현황</div>
      <div className="text-ec-hint mb-[4px]">{shown.from.replace('-', '/')}/01 ~ {lastDay(shown.to).replace(/-/g, '/')}</div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              <th>귀속연월-NO</th>
              <th>급여대장명</th>
              <th className="text-center">최종근무일</th>
              <th>부서명</th>
              <th>성명</th>
              <th className="text-right">지급총액</th>
              <th className="text-right">공제총액</th>
              <th className="text-right">실지급액</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {[...groups.values()].map((ls) => {
                  const s = sum(ls)
                  return (
                    <Fragment key={ls[0].ledgerId}>
                      {ls.map((r) => (
                        <tr key={r.lineId}>
                          <td>{slashYm(r.payMonth)} -{r.seq}</td>
                          <td>{r.ledgerName}</td>
                          <td className="text-center">{r.lastWorkDate?.replace(/-/g, '/') ?? ''}</td>
                          <td>{r.department}</td>
                          <td>{r.workerName}</td>
                          <td className="text-right">{won(r.grossPay)}</td>
                          <td className="text-right">{Number(r.incomeTax) + Number(r.localTax) ? won(Number(r.incomeTax) + Number(r.localTax)) : ''}</td>
                          <td className="text-right">{won(r.netPay)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td colSpan={5}>{slashYm(ls[0].payMonth)}-{ls[0].seq} 계</td>
                        <td className="text-right">{won(s.gross)}</td>
                        <td className="text-right">{s.ded ? won(s.ded) : ''}</td>
                        <td className="text-right">{won(s.net)}</td>
                      </tr>
                    </Fragment>
                  )
                })}
                <tr className="font-bold">
                  <td colSpan={5}>합계</td>
                  <td className="text-right">{won(total.gross)}</td>
                  <td className="text-right">{total.ded ? won(total.ded) : ''}</td>
                  <td className="text-right">{won(total.net)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}

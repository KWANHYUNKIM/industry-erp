import { Fragment, useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { lastDay, monthRange, slashYm } from '../../features/dailypay/report'

interface Row { payMonth: string; seq: number; paidMonth: string; payDate: string | null; workerId: number; workerCode: string; workerName: string; departmentId: number | null; payItem: string; days: number }

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 급여작업 &gt; <b>일용근로 근무확정현황</b> (원본 E020754, 결과 제목 '근무기록확정현황').
 *
 * <p>2026-10-03 loginaa 실측: 조건 구분(라인별 · 사용자지정집계) · 귀속연월(전월+금월) · 지급연월 · 지급일 · 부서 · 프로젝트 · 사원번호 ·
 * 수당항목. 결과 귀속연월-NO · 성명 · 수당항목명 · 근무기록, 귀속연월마다 '2026/07 계' 와 합계(근무기록 1).
 * 지급연월 · 지급일([사용]) · 부서 · 사원번호 · 수당항목(여러 개 고르는 코드도움)을 거른다. 프로젝트 조건 · 사용자지정집계 · 결재방표시는 없다.
 */
export default function DailyWorkConfirmStatusPage() {
  const [range, setRange] = useState(monthRange('전월+금월'))
  const [shown, setShown] = useState(range)
  const [usePaid, setUsePaid] = useState(false)
  const [paidRange, setPaidRange] = useState(range)
  const [usePayDate, setUsePayDate] = useState(false)
  const [payDateRange, setPayDateRange] = useState({ from: `${range.from}-01`, to: lastDay(range.to) })
  const [deptCond, setDeptCond] = useState<string[]>([])
  const [empCond, setEmpCond] = useState<string[]>([])
  const [itemCond, setItemCond] = useState<string[]>([])
  const [workers, setWorkers] = useState<{ id: number; code: string; name: string }[]>([])
  const [depts, setDepts] = useState<{ id: number; code?: string | null; name: string }[]>([])
  useEffect(() => {
    api.get<typeof workers>('/hr/daily-workers').then((r) => setWorkers(r.data)).catch(() => setWorkers([]))
    api.get<typeof depts>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }, [])
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<Row[]>('/hr/daily-pay-ledgers/work-confirms', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShown(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const list = rows.filter((r) => (!usePaid || (r.paidMonth >= paidRange.from && r.paidMonth <= paidRange.to))
    && (!usePayDate || (!!r.payDate && r.payDate >= payDateRange.from && r.payDate <= payDateRange.to))
    && (deptCond.length === 0 || deptCond.includes(String(r.departmentId ?? '')))
    && (empCond.length === 0 || empCond.includes(String(r.workerId)))
    && (itemCond.length === 0 || itemCond.includes(r.payItem)))
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
        <EcCond label="지급연월">
          {usePaid && (
            <>
              <input type="month" className="ec-input w-[140px]" aria-label="지급연월 시작" value={paidRange.from} onChange={(e) => setPaidRange({ ...paidRange, from: e.target.value })} />
              ~
              <input type="month" className="ec-input w-[140px]" aria-label="지급연월 끝" value={paidRange.to} onChange={(e) => setPaidRange({ ...paidRange, to: e.target.value })} />
            </>
          )}
          <label className="inline-flex items-center gap-[4px] ml-[6px]">
            <input type="checkbox" checked={usePaid} onChange={(e) => { setUsePaid(e.target.checked); if (e.target.checked) setPaidRange(range) }} /> 사용
          </label>
        </EcCond>
        <EcCond label="지급일">
          {usePayDate && (
            <>
              <input type="date" className="ec-input w-[150px]" aria-label="지급일 시작" value={payDateRange.from} onChange={(e) => setPayDateRange({ ...payDateRange, from: e.target.value })} />
              ~
              <input type="date" className="ec-input w-[150px]" aria-label="지급일 끝" value={payDateRange.to} onChange={(e) => setPayDateRange({ ...payDateRange, to: e.target.value })} />
            </>
          )}
          <label className="inline-flex items-center gap-[4px] ml-[6px]">
            <input type="checkbox" checked={usePayDate} onChange={(e) => { setUsePayDate(e.target.checked); if (e.target.checked) setPayDateRange({ from: `${range.from}-01`, to: lastDay(range.to) }) }} /> 사용
          </label>
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
                           items={depts.map((d) => ({ value: String(d.id), code: d.code ?? undefined, name: d.name }))} />
        </EcCond>
        <EcCond label="사원번호">
          <CodePickerField label="사원번호" hideLabel fill multiple placeholder="사원번호" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={workers.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
        </EcCond>
        <EcCond label="수당항목">
          <CodePickerField label="수당항목" hideLabel fill multiple placeholder="수당항목" values={itemCond} onChangeMulti={(v) => setItemCond(v)}
                           items={[{ value: '일근무', code: '02', name: '일근무' }]} />
        </EcCond>
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

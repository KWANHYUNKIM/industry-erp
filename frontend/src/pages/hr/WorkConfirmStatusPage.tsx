import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, PayItem } from '../../types/api'

interface ConfirmRow { payMonth: string; employeeId: number; employeeName: string; payItemId: number; payItemName: string; unit: string; quantity: number }

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
function pick(label: string) {
  const n = new Date()
  const y = n.getFullYear(), m = n.getMonth()
  switch (label) {
    case '금월': return { from: ym(n), to: ym(n) }
    case '전월': { const p = ym(new Date(y, m - 1, 1)); return { from: p, to: p } }
    case '금년': return { from: `${y}-01`, to: `${y}-12` }
    case '전년': return { from: `${y - 1}-01`, to: `${y - 1}-12` }
    default: return { from: ym(new Date(y, m - 1, 1)), to: ym(n) }
  }
}
const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))))

/**
 * 관리 &gt; 급여관리 &gt; 급여작업 &gt; <b>근무확정현황</b> (원본 E090116).
 *
 * <p>2026-10-03 loginaa 실측: 조건 판이 펼쳐진 현황 — 구분(라인별 · 사용자지정집계) · 기준월(전월+금월) · 지급연월 · 지급일 ·
 * 급여구분 · 부서 · 프로젝트 · 사원번호 · 수당항목 · 결재방표시 · 정렬/소계기준.
 * 결과: 귀속연월-NO · 성명 · 수당항목명 · 단위 · 근무기록, 귀속월마다 'YYYY/MM 계', 끝에 합계.
 * 보이는 것은 급여계산/대장의 [근무기록확정]에서 확정한 값이다(근무입력 그대로가 아니다).
 *
 * <p>구분은 라인별만, 조건은 기준월 · 부서 · 사원번호 · 수당항목(모두 여러 개 고르는 코드도움)만 만들었다.
 * 지급연월 · 지급일([사용])은 그 귀속월 급여대장의 지급일로 거른다. 급여구분 · 프로젝트 · 결재방표시 · 정렬/소계기준은 없다.
 */
export default function WorkConfirmStatusPage() {
  const [range, setRange] = useState(pick('전월+금월'))
  const [rows, setRows] = useState<ConfirmRow[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [items, setItems] = useState<PayItem[]>([])
  const [depts, setDepts] = useState<{ id: number; code?: string | null; name: string }[]>([])
  const [deptCond, setDeptCond] = useState<string[]>([])
  /** 원본 [지급연월] · [지급일]([사용]) — 그 귀속월 급여대장의 지급일로 거른다. */
  const [ledgers, setLedgers] = useState<{ payMonth: string; payDate: string | null }[]>([])
  const [usePaidMonth, setUsePaidMonth] = useState(false)
  const [paidMonth, setPaidMonth] = useState(range)
  const [usePayDate, setUsePayDate] = useState(false)
  const [payDate, setPayDate] = useState({ from: `${range.from}-01`, to: `${range.to}-28` })
  const [empCond, setEmpCond] = useState<string[]>([])
  const [itemCond, setItemCond] = useState<string[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '근무확정현황', [rows.length])

  function search() {
    setError('')
    api.get<ConfirmRow[]>('/work-records/confirms', { params: { from: range.from, to: range.to } }).then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    search()
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<typeof ledgers>('/pay-ledgers').then((r) => setLedgers(r.data)).catch(() => setLedgers([]))
    api.get<{ id: number; code?: string | null; name: string }[]>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
    api.get<PayItem[]>('/pay-settings/items').then((r) => setItems(r.data.filter((i) => i.kind === 'ALLOWANCE'))).catch(() => setItems([]))
  }, [])

  const deptOf = new Map(employees.map((e) => [e.id, e.departmentId]))
  const shown = rows
    .filter((r) => {
      const d = ledgers.find((l) => l.payMonth === r.payMonth)?.payDate ?? ''
      if (usePaidMonth && !(d && d.slice(0, 7) >= paidMonth.from && d.slice(0, 7) <= paidMonth.to)) return false
      if (usePayDate && !(d && d >= payDate.from && d <= payDate.to)) return false
      return true
    })
    .filter((r) => deptCond.length === 0 || deptCond.includes(String(deptOf.get(r.employeeId) ?? '')))
    .filter((r) => empCond.length === 0 || empCond.includes(String(r.employeeId)))
    .filter((r) => itemCond.length === 0 || itemCond.includes(String(r.payItemId)))
  const months = [...new Set(shown.map((r) => r.payMonth))].sort()
  const total = shown.reduce((s, r) => s + Number(r.quantity), 0)

  return (
    <EcListShell title="근무확정현황" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준월">
          <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="지급연월">
          {usePaidMonth && (
            <>
              <input type="month" className="ec-input w-[140px]" aria-label="지급연월 시작" value={paidMonth.from} onChange={(e) => setPaidMonth({ ...paidMonth, from: e.target.value })} />
              ~
              <input type="month" className="ec-input w-[140px]" aria-label="지급연월 끝" value={paidMonth.to} onChange={(e) => setPaidMonth({ ...paidMonth, to: e.target.value })} />
            </>
          )}
          <label className="inline-flex items-center gap-[4px] ml-[6px]">
            <input type="checkbox" checked={usePaidMonth} onChange={(e) => { setUsePaidMonth(e.target.checked); if (e.target.checked) setPaidMonth(range) }} /> 사용
          </label>
        </EcCond>
        <EcCond label="지급일">
          {usePayDate && (
            <>
              <input type="date" className="ec-input w-[150px]" aria-label="지급일 시작" value={payDate.from} onChange={(e) => setPayDate({ ...payDate, from: e.target.value })} />
              ~
              <input type="date" className="ec-input w-[150px]" aria-label="지급일 끝" value={payDate.to} onChange={(e) => setPayDate({ ...payDate, to: e.target.value })} />
            </>
          )}
          <label className="inline-flex items-center gap-[4px] ml-[6px]">
            <input type="checkbox" checked={usePayDate} onChange={(e) => setUsePayDate(e.target.checked)} /> 사용
          </label>
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
                           items={depts.map((x) => ({ value: String(x.id), code: x.code ?? undefined, name: x.name }))} />
        </EcCond>
        <EcCond label="사원번호">
          <CodePickerField label="사원번호" hideLabel fill multiple placeholder="사원번호" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="수당항목">
          <CodePickerField label="수당항목" hideLabel fill multiple placeholder="수당항목" values={itemCond} onChangeMulti={(v) => setItemCond(v)}
                           items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        {['금월', '전월', '전월+금월', '금년', '전년'].map((l) => (
          <button key={l} type="button" className="ec-btn" onClick={() => setRange(pick(l))}>{l}</button>
        ))}
        {/* 원본 끝 단추 [종료월] — 시작은 그대로 두고 끝을 이번 달로 */}
        <button type="button" className="ec-btn" onClick={() => setRange({ ...range, to: pick('금월').to })}>종료월</button>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>귀속연월-NO</th>
            <th>성명</th>
            <th>수당항목명</th>
            <th>단위</th>
            <th className="text-right">근무기록</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {months.map((m) => {
                const rs = shown.filter((r) => r.payMonth === m)
                return (
                  <MonthRows key={m} month={m} rows={rs} />
                )
              })}
              <tr className="font-bold">
                <td colSpan={4}>합계</td>
                <td className="text-right">{qty(total)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

function MonthRows({ month, rows }: { month: string; rows: ConfirmRow[] }) {
  const label = month.replace('-', '/')
  return (
    <>
      {rows.map((r) => (
        <tr key={`${r.employeeId}-${r.payItemId}`}>
          <td>{label} -1</td>
          <td>{r.employeeName}</td>
          <td>{r.payItemName}</td>
          <td>{r.unit}</td>
          <td className="text-right">{qty(Number(r.quantity))}</td>
        </tr>
      ))}
      <tr className="font-bold">
        <td colSpan={4}>{label} 계</td>
        <td className="text-right">{qty(rows.reduce((s, r) => s + Number(r.quantity), 0))}</td>
      </tr>
    </>
  )
}

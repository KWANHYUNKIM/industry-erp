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
 * <p>구분은 라인별만, 조건은 기준월 · 사원번호 · 수당항목만 만들었다.
 */
export default function WorkConfirmStatusPage() {
  const [range, setRange] = useState(pick('전월+금월'))
  const [rows, setRows] = useState<ConfirmRow[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [items, setItems] = useState<PayItem[]>([])
  const [empCond, setEmpCond] = useState('')
  const [itemCond, setItemCond] = useState('')
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
    api.get<PayItem[]>('/pay-settings/items').then((r) => setItems(r.data.filter((i) => i.kind === 'ALLOWANCE'))).catch(() => setItems([]))
  }, [])

  const shown = rows
    .filter((r) => !empCond || String(r.employeeId) === empCond)
    .filter((r) => !itemCond || String(r.payItemId) === itemCond)
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
        <EcCond label="사원번호">
          <CodePickerField label="사원번호" hideLabel placeholder="사원번호" value={empCond} onChange={(v) => setEmpCond(v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="수당항목">
          <CodePickerField label="수당항목" hideLabel placeholder="수당항목" value={itemCond} onChange={(v) => setItemCond(v)}
                           items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        {['금월', '전월', '전월+금월', '금년', '전년'].map((l) => (
          <button key={l} type="button" className="ec-btn" onClick={() => setRange(pick(l))}>{l}</button>
        ))}
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

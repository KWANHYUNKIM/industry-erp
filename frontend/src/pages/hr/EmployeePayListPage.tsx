import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, Payslip } from '../../types/api'

interface DeptRow { id: number; name: string; code?: string | null }

const won = (n: number) => (n ? Number(n).toLocaleString('ko-KR') : '')
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
/** 원본 기본 기간 = 전월+금월 (2026/09 ~ 2026/10). */
const defaultRange = () => {
  const now = new Date()
  return { from: ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ym(now) }
}

/**
 * 관리 &gt; 급여관리 &gt; 급여작업 &gt; <b>사원별급여조회</b> (원본 E090110).
 *
 * <p>2026-10-03 loginaa 실측: [전체] 알약 · 기간 전월+금월 · 격자 귀속연월 · 급여구분 · 사원코드 · 사원명 · 기본급 ·
 * (그 기간에 금액이 있는 수당 항목들) · 지급총액 · (공제 항목들) · 공제총액 · 실지급액. 버튼 Email · 인쇄 · 선택삭제 · Excel.
 * 조건([Search(F3)]): 급여대장 · 귀속연월 · 급여구분 · 지급구분 · 사원 · 부서 · 프로젝트.
 *
 * <p>공제 열 이름은 우리 명세 줄 이름이다(원본 주민세 · 장기요양 = 우리 지방소득세 · 장기요양보험).
 * 급여구분은 '급여' 하나다. 급여대장 · 급여구분 · 지급구분 · 프로젝트 조건과 Email · 미발송은 아직 없다.
 * [선택삭제]는 확정 안 된 명세만 지운다(서버가 막는다).
 */
export default function EmployeePayListPage() {
  const nav = useNavigate()
  const [range, setRange] = useState(defaultRange())
  const [rows, setRows] = useState<Payslip[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [depts, setDepts] = useState<DeptRow[]>([])
  const [empCond, setEmpCond] = useState('')
  const [deptCond, setDeptCond] = useState('')
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)

  function load() {
    setError('')
    api.get<Payslip[]>('/payslips/range', { params: range })
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [range.from, range.to])
  useEffect(() => {
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<DeptRow[]>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }, [])

  const deptName = depts.find((d) => String(d.id) === deptCond)?.name
  const shown = rows
    .filter((p) => !empCond || String(p.employeeId) === empCond)
    .filter((p) => !deptName || p.department === deptName)

  // 원본처럼 그 기간에 금액이 있는 항목만 열로 세운다 — 수당은 기본급 다음, 공제는 지급총액 다음
  const { allowanceCols, deductionCols } = useMemo(() => {
    const a: string[] = []
    const d: string[] = []
    for (const p of shown) for (const l of p.lines) {
      if (!Number(l.amount)) continue
      const bucket = l.kind === 'ALLOWANCE' ? a : d
      if (!bucket.includes(l.name)) bucket.push(l.name)
    }
    return { allowanceCols: a, deductionCols: d }
  }, [shown])
  useTableColumnCheck(tableRef, '사원별급여조회', [allowanceCols.length, deductionCols.length, shown.length])

  const amountOf = (p: Payslip, name: string) =>
    p.lines.filter((l) => l.name === name).reduce((s, l) => s + Number(l.amount), 0)

  async function deleteChecked() {
    if (checked.size === 0 || !window.confirm('삭제하시겠습니까?')) return
    try {
      for (const id of checked) await api.delete(`/payslips/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const allChecked = shown.length > 0 && shown.every((p) => checked.has(p.id))

  return (
    <EcListShell
      title="사원별급여조회"
      collapseConditions
      searchable={false}
      actions={[
        { label: '인쇄' },
        { label: '선택삭제', onClick: deleteChecked, disabled: checked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel placeholder="사원" value={empCond} onChange={(v) => setEmpCond(v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="부서">
          <CodePickerField label="부서" hideLabel placeholder="부서" value={deptCond} onChange={(v) => setDeptCond(v)}
                           items={depts.map((x) => ({ value: String(x.id), code: x.code ?? undefined, name: x.name }))} />
        </EcCond>
      </ul>
      <div className="text-right mb-[4px] text-ec-hint">{range.from.replace('-', '/')}/01 ~ {range.to.replace('-', '/')}</div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left whitespace-nowrap">
          <thead>
            <tr>
              <th className="w-[34px] text-center">
                <input type="checkbox" checked={allChecked}
                       onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((p) => p.id)))} />
              </th>
              <th>귀속연월</th>
              <th>급여구분</th>
              <th>사원코드</th>
              <th>사원명</th>
              <th className="text-right">기본급</th>
              {allowanceCols.map((c) => <th key={`a-${c}`} className="text-right">{c}</th>)}
              <th className="text-right">지급총액</th>
              {deductionCols.map((c) => <th key={`d-${c}`} className="text-right">{c}</th>)}
              <th className="text-right">공제총액</th>
              <th className="text-right">실지급액</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={9 + allowanceCols.length + deductionCols.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((p) => (
              <tr key={p.id}>
                <td className="text-center">
                  <input type="checkbox" checked={checked.has(p.id)}
                         onChange={() => {
                           const next = new Set(checked)
                           if (next.has(p.id)) next.delete(p.id); else next.add(p.id)
                           setChecked(next)
                         }} />
                </td>
                <td>
                  <a href="#" onClick={(e) => { e.preventDefault(); nav(`/hr/payroll/ledger?month=${p.payMonth}`) }}>
                    {p.payMonth.replace('-', '/')}
                  </a>
                </td>
                <td>급여</td>
                <td>{p.employeeCode}</td>
                <td>{p.employeeName}</td>
                <td className="text-right">{won(p.baseSalary)}</td>
                {allowanceCols.map((c) => <td key={`a-${c}`} className="text-right">{won(amountOf(p, c))}</td>)}
                <td className="text-right">{won(p.grossPay)}</td>
                {deductionCols.map((c) => <td key={`d-${c}`} className="text-right">{won(amountOf(p, c))}</td>)}
                <td className="text-right">{won(p.deductionTotal)}</td>
                <td className="text-right">{won(p.netPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}

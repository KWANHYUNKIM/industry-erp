import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, PayItem, Payslip } from '../../types/api'

interface DeptRow { id: number; name: string; code?: string | null }

/**
 * 공제 열 — 원본은 공제리스트의 항목을 금액이 없어도 <b>모두</b> 세운다(2026-10-03 실측: 소득세 · 주민세 · 국민연금 ·
 * 건강보험 · 고용보험 · 장기요양 · 연말정산 · 사우회비 · 공제항목 추가가능, 뒤 셋은 전부 빈칸). 우리 법정 공제는 급여계산이
 * 직접 셈해 항목이 아니므로 앞 여섯을 고정하고, 명세 줄 이름을 원본 이름으로 읽는다.
 */
const STATUTORY: [string, string[]][] = [
  ['소득세', ['소득세']], ['주민세', ['지방소득세', '주민세']], ['국민연금', ['국민연금']],
  ['건강보험', ['건강보험']], ['고용보험', ['고용보험']], ['장기요양', ['장기요양보험', '장기요양']],
]
const colOf = (name: string) => STATUTORY.find(([, from]) => from.includes(name))?.[0] ?? name

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
 * <p>수당 열은 그 기간에 금액이 있는 항목만, 표시순서대로(원본 수당리스트 13줄 중 금액이 있는 넷만 섰다).
 * 공제 열은 STATUTORY + 사용 중인 공제항목 전부.
 * 급여구분은 '급여' 하나다. 급여대장 · 사원 · 부서는 여러 개 고르는 코드도움. 급여구분 · 지급구분 · 프로젝트 조건과 Email · 미발송은 아직 없다.
 * [선택삭제]는 확정 안 된 명세만 지운다(서버가 막는다).
 */
export default function EmployeePayListPage() {
  const nav = useNavigate()
  /** 급여계산/대장 [명세서 조회]에서 오면 ?ledger=YYYY-MM — 원본처럼 그 대장 한 달로 연다(2026-10-04 실측: 2026/10/01 ~ 2026/10/31). */
  const [params] = useSearchParams()
  const fromLedger = params.get('ledger')
  const [range, setRange] = useState(fromLedger ? { from: fromLedger, to: fromLedger } : defaultRange())
  const [rows, setRows] = useState<Payslip[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [depts, setDepts] = useState<DeptRow[]>([])
  const [items, setItems] = useState<PayItem[]>([])
  /** [급여대장] — 대장은 귀속월마다 하나라 귀속월로 거른다. */
  const [ledgerCond, setLedgerCond] = useState<string[]>(fromLedger ? [fromLedger] : [])
  const [ledgers, setLedgers] = useState<{ payMonth: string; name: string }[]>([])
  const [empCond, setEmpCond] = useState<string[]>([])
  const [deptCond, setDeptCond] = useState<string[]>([])
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
    api.get<{ payMonth: string; name: string }[]>('/pay-ledgers').then((r) => setLedgers(r.data)).catch(() => setLedgers([]))
    api.get<PayItem[]>('/pay-settings/items').then((r) => setItems(r.data)).catch(() => setItems([]))
  }, [])

  const deptNames = depts.filter((d) => deptCond.includes(String(d.id))).map((d) => d.name)
  const shown = rows
    .filter((p) => ledgerCond.length === 0 || ledgerCond.includes(p.payMonth))
    .filter((p) => empCond.length === 0 || empCond.includes(String(p.employeeId)))
    .filter((p) => deptNames.length === 0 || deptNames.includes(p.department ?? ''))

  const { allowanceCols, deductionCols } = useMemo(() => {
    const order = (kind: string) => items.filter((i) => i.kind === kind && i.active)
      .sort((x, y) => x.sortOrder - y.sortOrder).map((i) => i.name)
    const a: string[] = []
    const d: string[] = [...STATUTORY.map(([c]) => c), ...order('DEDUCTION').filter((n) => !STATUTORY.some(([c]) => c === n))]
    for (const p of shown) for (const l of p.lines) {
      if (!Number(l.amount)) continue
      const bucket = l.kind === 'ALLOWANCE' ? a : d
      const c = l.kind === 'ALLOWANCE' ? l.name : colOf(l.name)
      if (!bucket.includes(c)) bucket.push(c)
    }
    const ao = order('ALLOWANCE')
    const rank = (n: string) => (ao.indexOf(n) < 0 ? 1e9 : ao.indexOf(n))
    return { allowanceCols: [...a].sort((x, y) => rank(x) - rank(y)), deductionCols: d }
  }, [shown, items])
  useTableColumnCheck(tableRef, '사원별급여조회', [allowanceCols.length, deductionCols.length, shown.length])

  const amountOf = (p: Payslip, col: string, kind: 'ALLOWANCE' | 'DEDUCTION') =>
    p.lines.filter((l) => l.kind === kind && (kind === 'ALLOWANCE' ? l.name : colOf(l.name)) === col).reduce((s, l) => s + Number(l.amount), 0)

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
        <EcCond label="급여대장">
          <CodePickerField label="급여대장" hideLabel fill multiple placeholder="급여대장" values={ledgerCond} onChangeMulti={(v) => setLedgerCond(v)}
                           items={ledgers.map((l) => ({ value: l.payMonth, code: l.payMonth.replace('-', '/'), name: l.name }))} />
        </EcCond>
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="부서">
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
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
                {allowanceCols.map((c) => <td key={`a-${c}`} className="text-right">{won(amountOf(p, c, 'ALLOWANCE'))}</td>)}
                <td className="text-right">{won(p.grossPay)}</td>
                {deductionCols.map((c) => <td key={`d-${c}`} className="text-right">{won(amountOf(p, c, 'DEDUCTION'))}</td>)}
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

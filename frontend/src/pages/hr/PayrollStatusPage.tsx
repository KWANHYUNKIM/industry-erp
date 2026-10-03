import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, PayItem, Payslip } from '../../types/api'

interface DeptRow { id: number; name: string; code?: string | null }
interface Ledger { payMonth: string; name: string }
type Mode = '라인별' | '급여대장별'
type Confirm = '전체' | '미확정' | '확정'

const won = (n: number) => (n ? Number(n).toLocaleString('ko-KR') : '')
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
/** 원본 [귀속연월] 빠른선택 — 금월 · 전월 · 전월+금월(기본) · 금년 · 전년. */
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
/** 우리 급여계산이 자동으로 넣는 법정 공제 — 원본 공제리스트의 앞 여섯과 같은 자리(이름은 우리 명세 이름). */
const STATUTORY = ['소득세', '지방소득세', '국민연금', '건강보험', '고용보험', '장기요양보험']

interface Row {
  key: string
  label: string                 // 귀속연월-NO
  ledgerName: string
  department: string
  employeeName: string
  amounts: Map<string, number>
  gross: number
  deduction: number
  net: number
}

/**
 * 관리 &gt; 급여관리 &gt; 급여작업 &gt; <b>급여현황</b> (원본 E090115).
 *
 * <p>2026-10-03 loginaa 실측: 조건 판이 펼쳐진 현황 화면. [구분] 라인별 · 급여대장별 · 급여대장별부서별 ·
 * 급여대장프로젝트별 · 급여대장별부서별라인별 · 사용자지정집계, [귀속연월] 전월+금월, 지급연월 · 지급일 · 급여구분 ·
 * 지급구분 · 부서 · 프로젝트 · 사원 · 확정여부(전체 · 미확정 · 확정) · 결재방표시 · 정렬/소계기준.
 * 결과(라인별): 귀속연월-NO · 급여대장명 · 부서명 · 프로젝트명 · 성명 · 수당 항목 전부 · 공제 항목 전부 · 지급총액 ·
 * 공제총액 · 실지급액, 성명 가나다 순, 사원마다 '성명 계', 끝에 합계. 급여대장별은 대장마다 한 줄이고 부서명 · 성명은
 * 그 대장 첫 사원 것이다(원본 그대로).
 *
 * <p>구분은 라인별 · 급여대장별만 만들었다. 지급연월 · 지급일 · 급여구분 · 지급구분 · 프로젝트 · 정렬/소계기준 조건은 없다.
 */
export default function PayrollStatusPage() {
  const [mode, setMode] = useState<Mode>('라인별')
  const [range, setRange] = useState(pick('전월+금월'))
  const [confirmCond, setConfirmCond] = useState<Confirm>('전체')
  const [empCond, setEmpCond] = useState('')
  const [deptCond, setDeptCond] = useState('')
  const [slips, setSlips] = useState<Payslip[]>([])
  const [items, setItems] = useState<PayItem[]>([])
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [depts, setDepts] = useState<DeptRow[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<Payslip[]>('/payslips/range', { params: range }).then((r) => setSlips(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    search()
    api.get<PayItem[]>('/pay-settings/items').then((r) => setItems(r.data)).catch(() => setItems([]))
    api.get<Ledger[]>('/pay-ledgers').then((r) => setLedgers(r.data)).catch(() => setLedgers([]))
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<DeptRow[]>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }, [])

  const deptName = depts.find((d) => String(d.id) === deptCond)?.name
  const filtered = slips
    .filter((p) => !empCond || String(p.employeeId) === empCond)
    .filter((p) => !deptName || p.department === deptName)
    .filter((p) => confirmCond === '전체' || (confirmCond === '확정' ? p.status === 'CONFIRMED' : p.status !== 'CONFIRMED'))

  // 원본은 수당 · 공제 항목을 금액과 상관없이 모두 열로 세운다(표시순서)
  const { allowanceCols, deductionCols } = useMemo(() => {
    const byOrder = (k: string) => items.filter((i) => i.kind === k && i.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)).map((i) => i.name)
    const a = ['기본급', ...byOrder('ALLOWANCE')]
    const d = [...STATUTORY, ...byOrder('DEDUCTION').filter((n) => !STATUTORY.includes(n))]
    for (const p of filtered) for (const l of p.lines) {
      const bucket = l.kind === 'ALLOWANCE' ? a : d
      if (!bucket.includes(l.name)) bucket.push(l.name)
    }
    return { allowanceCols: a, deductionCols: d }
  }, [items, filtered])
  useTableColumnCheck(tableRef, '급여현황', [allowanceCols.length, deductionCols.length, mode])

  const ledgerName = (m: string) => ledgers.find((l) => l.payMonth === m)?.name ?? `${m.replace('-', '/')} 급여`
  const toRow = (p: Payslip): Row => {
    const amounts = new Map<string, number>([['기본급', Number(p.baseSalary)]])
    for (const l of p.lines) amounts.set(l.name, (amounts.get(l.name) ?? 0) + Number(l.amount))
    return {
      key: String(p.id), label: `${p.payMonth.replace('-', '/')} -1`, ledgerName: ledgerName(p.payMonth),
      department: p.department ?? '', employeeName: p.employeeName, amounts,
      gross: Number(p.grossPay), deduction: Number(p.deductionTotal), net: Number(p.netPay),
    }
  }
  const sumRows = (rs: Row[], base: Omit<Row, 'amounts' | 'gross' | 'deduction' | 'net'>): Row => {
    const amounts = new Map<string, number>()
    for (const r of rs) for (const [k, v] of r.amounts) amounts.set(k, (amounts.get(k) ?? 0) + v)
    return { ...base, amounts, gross: rs.reduce((s, r) => s + r.gross, 0), deduction: rs.reduce((s, r) => s + r.deduction, 0), net: rs.reduce((s, r) => s + r.net, 0) }
  }

  // 라인별: 명세 한 장이 한 줄 · 급여대장별: 귀속월(대장)마다 한 줄, 부서 · 성명은 그 대장 첫 사원
  const lines: Row[] = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'ko') || a.payMonth.localeCompare(b.payMonth))
    if (mode === '라인별') return sorted.map(toRow)
    const byMonth = new Map<string, Payslip[]>()
    for (const p of sorted) byMonth.set(p.payMonth, [...(byMonth.get(p.payMonth) ?? []), p])
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, ps]) => {
      const first = ps[0]
      return sumRows(ps.map(toRow), { key: m, label: `${m.replace('-', '/')} -1`, ledgerName: ledgerName(m), department: first.department ?? '', employeeName: first.employeeName })
    })
  }, [filtered, mode, ledgers])

  // 성명 가나다 순으로 이름이 바뀔 때마다 '성명 계'
  const groups: { name: string; rows: Row[] }[] = []
  for (const r of [...lines].sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'ko'))) {
    const g = groups[groups.length - 1]
    if (g && g.name === r.employeeName) g.rows.push(r); else groups.push({ name: r.employeeName, rows: [r] })
  }
  const total = sumRows(lines, { key: 'total', label: '합계', ledgerName: '', department: '', employeeName: '' })

  const cells = (r: Row) => (
    <>
      {allowanceCols.map((c) => <td key={`a-${c}`} className="text-right">{won(r.amounts.get(c) ?? 0)}</td>)}
      {deductionCols.map((c) => <td key={`d-${c}`} className="text-right">{won(r.amounts.get(c) ?? 0)}</td>)}
      <td className="text-right">{won(r.gross)}</td>
      <td className="text-right">{won(r.deduction)}</td>
      <td className="text-right">{won(r.net)}</td>
    </>
  )

  return (
    <EcListShell title="급여현황" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          {(['라인별', '급여대장별'] as Mode[]).map((m) => (
            <label key={m} className="mr-[10px]"><input type="radio" name="pay-status-mode" checked={mode === m} onChange={() => setMode(m)} /> {m}</label>
          ))}
        </EcCond>
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="부서">
          <CodePickerField label="부서" hideLabel placeholder="부서" value={deptCond} onChange={(v) => setDeptCond(v)}
                           items={depts.map((x) => ({ value: String(x.id), code: x.code ?? undefined, name: x.name }))} />
        </EcCond>
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel placeholder="사원" value={empCond} onChange={(v) => setEmpCond(v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="확정여부">
          {(['전체', '미확정', '확정'] as Confirm[]).map((c) => (
            <label key={c} className="mr-[10px]"><input type="radio" name="pay-status-confirm" checked={confirmCond === c} onChange={() => setConfirmCond(c)} /> {c}</label>
          ))}
        </EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        {['금월', '전월', '전월+금월', '금년', '전년'].map((l) => (
          <button key={l} type="button" className="ec-btn" onClick={() => setRange(pick(l))}>{l}</button>
        ))}
      </div>
      <div className="text-center font-bold mb-[2px]">급여현황</div>
      <div className="text-ec-hint mb-[4px]">{range.from.replace('-', '/')}/01 ~ {range.to.replace('-', '/')}</div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left whitespace-nowrap">
          <thead>
            <tr>
              <th>귀속연월-NO</th>
              <th>급여대장명</th>
              <th>부서명</th>
              <th>프로젝트명</th>
              <th>성명</th>
              {allowanceCols.map((c) => <th key={`a-${c}`} className="text-right">{c}</th>)}
              {deductionCols.map((c) => <th key={`d-${c}`} className="text-right">{c}</th>)}
              <th className="text-right">지급총액</th>
              <th className="text-right">공제총액</th>
              <th className="text-right">실지급액</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan={8 + allowanceCols.length + deductionCols.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {groups.map((g) => (
                  <GroupRows key={g.name} g={g} cells={cells} subtotal={sumRows(g.rows, { key: `s-${g.name}`, label: `${g.name} 계`, ledgerName: '', department: '', employeeName: '' })} />
                ))}
                <tr className="font-bold">
                  <td colSpan={5}>합계</td>
                  {cells(total)}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}

function GroupRows({ g, cells, subtotal }: { g: { name: string; rows: Row[] }; cells: (r: Row) => React.ReactNode; subtotal: Row }) {
  return (
    <>
      {g.rows.map((r) => (
        <tr key={r.key}>
          <td>{r.label}</td>
          <td>{r.ledgerName}</td>
          <td>{r.department}</td>
          <td></td>
          <td>{r.employeeName}</td>
          {cells(r)}
        </tr>
      ))}
      <tr className="font-bold">
        <td colSpan={5}>{subtotal.label}</td>
        {cells(subtotal)}
      </tr>
    </>
  )
}

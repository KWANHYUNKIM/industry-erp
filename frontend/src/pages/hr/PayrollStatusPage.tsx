import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import EcSortSubtotalModal, { withSubtotals, type SortSubtotal } from '../../components/EcSortSubtotalModal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, PayItem, Payslip } from '../../types/api'
import { CustomAggregateConds, CustomAggregateTable, EMPTY_AGG, type AggDim, type AggRecord, type AggState, type AggTarget } from '../../features/payroll/components/CustomAggregate'
import { EcDateRange } from '../../components/ui/EcDateInput'

interface DeptRow { id: number; name: string; code?: string | null }
interface Ledger { payMonth: string; name: string; payDate: string | null }
type Mode = '라인별' | '급여대장별' | '급여대장별부서별' | '급여대장별프로젝트별' | '급여대장별부서별라인별' | '사용자지정집계'
const MODES: Mode[] = ['라인별', '급여대장별', '급여대장별부서별', '급여대장별프로젝트별', '급여대장별부서별라인별', '사용자지정집계']
/**
 * 원본 사용자지정집계 '집계조건검색'(2026-10-12 실측) — 귀속연월(월별 · 연별) · 급여정보(급여대장 · 부서 · 프로젝트 · 사원 · 지급구분) ·
 * 사원정보(직위/직급 · 지급구분 · 직책 · 입사구분) · 기타설정(사원)(사원구분 · 세무신고사업장 · 외국인여부 · 비거주자여부).
 * 우리 명세 · 사원에 없는 프로젝트 · 지급구분 · 기타설정(사원)은 뺐다.
 */
const AGG_DIMS: AggDim[] = [
  { key: 'month', label: '월별', group: '귀속연월' }, { key: 'year', label: '연별', group: '귀속연월' },
  { key: 'ledger', label: '급여대장', group: '급여정보' }, { key: 'dept', label: '부서', group: '급여정보' }, { key: 'emp', label: '사원', group: '급여정보' },
  { key: 'jobTitle', label: '직위/직급', group: '사원정보' }, { key: 'duty', label: '직책', group: '사원정보' }, { key: 'hireKind', label: '입사구분', group: '사원정보' },
]
const DUTY: Record<string, string> = { '100': '팀원', '200': '팀장' }
const HIRE_KIND: Record<string, string> = { '100': '신입', '200': '경력' }
type Confirm = '전체' | '미확정' | '확정'
/**
 * [정렬/소계기준] [설정] — '정렬/소계/합계 설정' 창(2026-10-21 원본 E090115 실측). 기준 고르기: 없음 · 귀속연월-NO · 급여대장명 ·
 * 부서명 · 부서코드 · 프로젝트명 · 프로젝트코드 · 성명 · 사원번호 · 지급총액 · 공제총액 · 실지급액.
 * 처음 값: 1 성명 소계 ◉표시 · 2 귀속연월-NO ◉표시안함 · 3 없음, 합계영역 ◉표시 — 지금까지 고정으로 그리던 '성명 계' · 합계와 같다.
 */
const SORT_KEYS = ['귀속연월-NO', '급여대장명', '부서명', '부서코드', '프로젝트명', '프로젝트코드', '성명', '사원번호', '지급총액', '공제총액', '실지급액']
const DEFAULT_SORT: SortSubtotal = {
  lines: [{ key: '성명', desc: false, subtotal: true }, { key: '귀속연월-NO', desc: false, subtotal: false }, { key: '', desc: false, subtotal: false }],
  total: true,
}
/** [양식] — 원본 기본(수정불가) · 부서별(2026-10-21 실측: 부서별도 같은 열 · 같은 '성명 계' 줄을 냈다). */
const FORMS = ['기본(수정불가)', '부서별'] as const

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
/**
 * 우리 급여계산이 자동으로 넣는 법정 공제 — 원본 공제리스트의 앞 여섯(2026-10-03 실측 열 이름). 우리 명세 줄 이름
 * 지방소득세 · 장기요양보험은 원본 이름 주민세 · 장기요양 열로 읽는다(사원별급여조회와 같다).
 */
const STATUTORY = ['소득세', '주민세', '국민연금', '건강보험', '고용보험', '장기요양']
const RENAME: Record<string, string> = { 지방소득세: '주민세', 장기요양보험: '장기요양' }
const colOf = (l: { kind: string; name: string }) => (l.kind === 'ALLOWANCE' ? l.name : RENAME[l.name] ?? l.name)

interface Row {
  key: string
  label: string                 // 귀속연월-NO
  ledgerName: string
  department: string
  employeeName: string
  employeeCode?: string
  deptCode?: string
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
 * 그 대장 첫 사원 것이다(원본 그대로). 급여대장별부서별 · 급여대장별부서별라인별은 대장 × 부서마다 한 줄이고 성명은
 * 그 부서 첫 사원(가나다)이다 — 원본에서 둘이 같은 줄을 냈다(2026-10-03 실측, 경영지원본부 변종호 6,400,000 = 두 사원 기본급 합).
 * 급여대장별프로젝트별은 명세에 프로젝트가 없어 급여대장별과 같다(프로젝트명 빈칸).
 *
 * <p>[사용자지정집계](2026-10-12 실측): 집계조건1~5 · 집계대상(수당금액(전체) · 지급총액 · 공제금액(전체) · 공제총액 · 실지급액) ·
 * 기타 비율표시 · 코드포함 — features/payroll CustomAggregate. 부서 · 사원 / 지급총액 · 실지급액이면 부서마다 사원 줄과 '부서 계', 끝에 합계.
 * 지급연월 · 지급일([사용])은 그 귀속월 급여대장의 지급일로 거른다. 급여구분 · 지급구분 · 프로젝트 · 정렬/소계기준 조건은 없다.
 */
export default function PayrollStatusPage() {
  const [mode, setMode] = useState<Mode>('라인별')
  const [range, setRange] = useState(pick('전월+금월'))
  const [confirmCond, setConfirmCond] = useState<Confirm>('전체')
  /** 원본 [지급연월] · [지급일]([사용]) — 그 귀속월 급여대장의 지급일로 거른다. */
  const [usePaidMonth, setUsePaidMonth] = useState(false)
  const [paidMonth, setPaidMonth] = useState(range)
  const [usePayDate, setUsePayDate] = useState(false)
  const [payDate, setPayDate] = useState({ from: `${range.from}-01`, to: `${range.to}-28` })
  const [agg, setAgg] = useState<AggState>(EMPTY_AGG)
  const [empCond, setEmpCond] = useState<string[]>([])
  const [deptCond, setDeptCond] = useState<string[]>([])
  const [slips, setSlips] = useState<Payslip[]>([])
  const [items, setItems] = useState<PayItem[]>([])
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [depts, setDepts] = useState<DeptRow[]>([])
  const [error, setError] = useState('')
  const [form, setForm] = useState<(typeof FORMS)[number]>('기본(수정불가)')
  /** 원본 기타 [결재방표시] — 켜면 출력물 위에 결재란(인쇄용결재라인(관리)). 처음은 꺼짐. */
  const [signBox, setSignBox] = useState(false)
  const [sortCfg, setSortCfg] = useState<SortSubtotal>(DEFAULT_SORT)
  const [sortOpen, setSortOpen] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)

  function search(r = range) {
    setError('')
    api.get<Payslip[]>('/payslips/range', { params: r }).then((r) => setSlips(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    search()
    api.get<PayItem[]>('/pay-settings/items').then((r) => setItems(r.data)).catch(() => setItems([]))
    api.get<Ledger[]>('/pay-ledgers').then((r) => setLedgers(r.data)).catch(() => setLedgers([]))
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<DeptRow[]>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }, [])

  const deptNames = depts.filter((d) => deptCond.includes(String(d.id))).map((d) => d.name)
  const filtered = slips
    .filter((p) => empCond.length === 0 || empCond.includes(String(p.employeeId)))
    .filter((p) => deptNames.length === 0 || deptNames.includes(p.department ?? ''))
    .filter((p) => {
      const d = ledgers.find((l) => l.payMonth === p.payMonth)?.payDate ?? ''
      if (usePaidMonth && !(d && d.slice(0, 7) >= paidMonth.from && d.slice(0, 7) <= paidMonth.to)) return false
      if (usePayDate && !(d && d >= payDate.from && d <= payDate.to)) return false
      return true
    })
    .filter((p) => confirmCond === '전체' || (confirmCond === '확정' ? p.status === 'CONFIRMED' : p.status !== 'CONFIRMED'))

  // 원본은 수당 · 공제 항목을 금액과 상관없이 모두 열로 세운다(표시순서)
  const { allowanceCols, deductionCols } = useMemo(() => {
    const byOrder = (k: string) => items.filter((i) => i.kind === k && i.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)).map((i) => i.name)
    const a = ['기본급', ...byOrder('ALLOWANCE')]
    const d = [...STATUTORY, ...byOrder('DEDUCTION').filter((n) => !STATUTORY.includes(n))]
    for (const p of filtered) for (const l of p.lines) {
      const bucket = l.kind === 'ALLOWANCE' ? a : d
      if (!bucket.includes(colOf(l))) bucket.push(colOf(l))
    }
    return { allowanceCols: a, deductionCols: d }
  }, [items, filtered])
  useTableColumnCheck(tableRef, '급여현황', [allowanceCols.length, deductionCols.length, mode])

  const ledgerName = (m: string) => ledgers.find((l) => l.payMonth === m)?.name ?? `${m.replace('-', '/')} 급여`
  const toRow = (p: Payslip): Row => {
    const amounts = new Map<string, number>([['기본급', Number(p.baseSalary)]])
    for (const l of p.lines) amounts.set(colOf(l), (amounts.get(colOf(l)) ?? 0) + Number(l.amount))
    return {
      key: String(p.id), label: `${p.payMonth.replace('-', '/')} -1`, ledgerName: ledgerName(p.payMonth),
      department: p.department ?? '', employeeName: p.employeeName, employeeCode: p.employeeCode,
      deptCode: depts.find((d) => d.name === p.department)?.code ?? '', amounts,
      gross: Number(p.grossPay), deduction: Number(p.deductionTotal), net: Number(p.netPay),
    }
  }
  const sumRows = (rs: Row[], base: Omit<Row, 'amounts' | 'gross' | 'deduction' | 'net'>): Row => {
    const amounts = new Map<string, number>()
    for (const r of rs) for (const [k, v] of r.amounts) amounts.set(k, (amounts.get(k) ?? 0) + v)
    return { ...base, amounts, gross: rs.reduce((s, r) => s + r.gross, 0), deduction: rs.reduce((s, r) => s + r.deduction, 0), net: rs.reduce((s, r) => s + r.net, 0) }
  }

  const aggTargets: AggTarget[] = [
    { key: 'allow', label: '수당금액(전체)', cols: allowanceCols }, { key: 'gross', label: '지급총액' },
    { key: 'deduct', label: '공제금액(전체)', cols: deductionCols }, { key: 'deductTotal', label: '공제총액' }, { key: 'net', label: '실지급액' },
  ]
  const aggRecords: AggRecord[] = filtered.map((p) => {
    const r = toRow(p)
    const e = employees.find((x) => x.id === p.employeeId)
    const dept = depts.find((d) => d.name === p.department)
    const values: Record<string, number> = { 지급총액: r.gross, 공제총액: r.deduction, 실지급액: r.net }
    for (const [k, v] of r.amounts) values[k] = v
    return {
      dims: {
        month: { code: p.payMonth, name: p.payMonth.replace('-', '/') },
        year: { code: p.payMonth.slice(0, 4), name: p.payMonth.slice(0, 4) },
        ledger: { code: p.payMonth, name: r.ledgerName },
        dept: { code: dept?.code ?? p.department ?? '', name: p.department ?? '' },
        emp: { code: p.employeeCode, name: p.employeeName },
        jobTitle: { code: e?.jobTitle ?? '', name: e?.jobTitle ?? '' },
        duty: { code: e?.duty ?? '', name: DUTY[e?.duty ?? ''] ?? e?.duty ?? '' },
        hireKind: { code: e?.hireKind ?? '', name: HIRE_KIND[e?.hireKind ?? ''] ?? e?.hireKind ?? '' },
      },
      values,
    }
  })

  // 라인별: 명세 한 장이 한 줄 · 급여대장별: 귀속월(대장)마다 한 줄, 부서 · 성명은 그 대장 첫 사원
  const lines: Row[] = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'ko') || a.payMonth.localeCompare(b.payMonth))
    if (mode === '라인별') return sorted.map(toRow)
    // 대장(귀속월)마다 · 부서별이면 대장 × 부서마다 한 줄. 프로젝트별은 명세에 프로젝트가 없어 대장별과 같다.
    const byDept = mode === '급여대장별부서별' || mode === '급여대장별부서별라인별'
    const groupsBy = new Map<string, Payslip[]>()
    for (const p of sorted) {
      const k = byDept ? `${p.payMonth}|${p.department ?? ''}` : p.payMonth
      groupsBy.set(k, [...(groupsBy.get(k) ?? []), p])
    }
    return [...groupsBy.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, ps]) => {
      const first = ps[0]
      const m = first.payMonth
      return sumRows(ps.map(toRow), { key: k, label: `${m.replace('-', '/')} -1`, ledgerName: ledgerName(m), department: first.department ?? '', employeeName: first.employeeName })
    })
  }, [filtered, mode, ledgers])

  // [정렬/소계기준] — 기준 차례로 줄을 세우고, 소계 ◉표시 기준이 바뀔 때마다 '<값> 계'(처음 값은 성명 → '성명 계')
  const sortValue = (r: Row, key: string): string | number => {
    switch (key) {
      case '귀속연월-NO': return r.label
      case '급여대장명': return r.ledgerName
      case '부서명': return r.department
      case '부서코드': return r.deptCode ?? ''
      case '성명': return r.employeeName
      case '사원번호': return r.employeeCode ?? ''
      case '지급총액': return r.gross
      case '공제총액': return r.deduction
      case '실지급액': return r.net
      default: return ''   // 프로젝트명 · 프로젝트코드 — 명세에 프로젝트가 없다
    }
  }
  const sortLabel = (r: Row, key: string) => { const v = sortValue(r, key); return typeof v === 'number' ? won(v) : v }
  const out = withSubtotals(lines, sortCfg, sortValue, sortLabel)
  const total = sumRows(lines, { key: 'total', label: '합계', ledgerName: '', department: '', employeeName: '' })

  const cells = (r: Row) => (
    <>
      {allowanceCols.map((c) => <td key={`a-${c}`} className="text-right">{won(r.amounts.get(c) ?? 0)}</td>)}
      <td></td>
      {deductionCols.map((c) => <td key={`d-${c}`} className="text-right">{won(r.amounts.get(c) ?? 0)}</td>)}
      <td></td>
      <td className="text-right">{won(r.gross)}</td>
      <td className="text-right">{won(r.deduction)}</td>
      <td className="text-right">{won(r.net)}</td>
    </>
  )

  return (
    <EcListShell title="급여현황" searchable={false} collapseConditions={false} signLine={signBox} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          {MODES.map((m) => (
            <label key={m} className="mr-[10px]"><input type="radio" name="pay-status-mode" checked={mode === m} onChange={() => setMode(m)} /> {m}</label>
          ))}
          {mode === '사용자지정집계' && <CustomAggregateConds dims={AGG_DIMS} targets={aggTargets} value={agg} onChange={setAgg} />}
        </EcCond>
        <EcCond label="귀속연월">
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
              <EcDateRange from={{ className: "ec-input w-[150px]", 'aria-label': "지급일 시작", value: payDate.from, onChange: (e) => setPayDate({ ...payDate, from: e.target.value }) }} to={{ className: "ec-input w-[150px]", 'aria-label': "지급일 끝", value: payDate.to, onChange: (e) => setPayDate({ ...payDate, to: e.target.value }) }} />
            </>
          )}
          <label className="inline-flex items-center gap-[4px] ml-[6px]">
            <input type="checkbox" checked={usePayDate} onChange={(e) => setUsePayDate(e.target.checked)} /> 사용
          </label>
        </EcCond>
        <EcCond label="부서">
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
                           items={depts.map((x) => ({ value: String(x.id), code: x.code ?? undefined, name: x.name }))} />
        </EcCond>
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="확정여부">
          {(['전체', '미확정', '확정'] as Confirm[]).map((c) => (
            <label key={c} className="mr-[10px]"><input type="radio" name="pay-status-confirm" checked={confirmCond === c} onChange={() => setConfirmCond(c)} /> {c}</label>
          ))}
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[4px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
          </label>
        </EcCond>
        <EcCond label="정렬/소계기준">
          <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy text-[12px]"
                  onClick={() => setSortOpen(true)}>설정</button>
        </EcCond>
      </ul>
      {/* 원본 아래 줄(2026-10-21 실측): [양식 ▾] [검색(F8)] 금월 · 전월 · 전월+금월 · 금년 · 전년 · 종료월 · 설정 [다시 작성].
          빠른선택은 귀속연월을 바꾸고 바로 찾는다. 종료월 = 시작을 끝 달로(2026/09~10 → 2026/10~10). [설정] 은 원본도 권한없음 창이라 두지 않는다. */}
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <select className="ec-input w-auto" aria-label="양식" value={form} onChange={(e) => setForm(e.target.value as (typeof FORMS)[number])}>
          {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => search()}>검색(F8)</button>
        {['금월', '전월', '전월+금월', '금년', '전년'].map((l) => (
          <button key={l} type="button" className="ec-btn" onClick={() => { const r = pick(l); setRange(r); search(r) }}>{l}</button>
        ))}
        <button type="button" className="ec-btn" onClick={() => { const r = { from: range.to, to: range.to }; setRange(r); search(r) }}>종료월</button>
      </div>
      {/* 원본은 출력물 머리(제목 24px · 회사명 · 기간) — 2026-10-13 실측 */}
      <EcReportHead title="급여현황" sign={signBox} period={reportPeriod(`${range.from}-01`, range.to.replace('-', '/'))} />
      {mode === '사용자지정집계' ? (
        <CustomAggregateTable name="급여현황" dims={AGG_DIMS} targets={aggTargets} records={aggRecords} agg={agg} />
      ) : (
      <div className="overflow-x-auto">
        <table ref={tableRef} className="ec-report w-full text-left whitespace-nowrap">
          <thead>
            <tr>
              {/* 원본(2026-10-22 실측): 칸 폭 99 · 140 · 80 · 90 · 80 · 수당 91 · 공제 105 · 합계 85, 머리 글자는 줄바꿈('수당항목 추가가능' 두 줄 → 44.3) */}
              <th className="whitespace-normal min-w-[99px]">귀속연월-NO</th>
              <th className="whitespace-normal min-w-[140px]">급여대장명</th>
              <th className="whitespace-normal min-w-[80px]">부서명</th>
              <th className="whitespace-normal min-w-[90px]">프로젝트명</th>
              <th className="whitespace-normal min-w-[80px]">성명</th>
              {allowanceCols.map((c) => <th key={`a-${c}`} className="text-right whitespace-normal min-w-[91px]">{c}</th>)}
              <th className="text-right whitespace-normal min-w-[91px]">수당항목 추가가능</th>
              {deductionCols.map((c) => <th key={`d-${c}`} className="text-right whitespace-normal min-w-[105px]">{c}</th>)}
              <th className="text-right whitespace-normal min-w-[105px]">공제항목 추가가능</th>
              <th className="text-right">지급총액</th>
              <th className="text-right">공제총액</th>
              <th className="text-right">실지급액</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan={10 + allowanceCols.length + deductionCols.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {out.map((o) => (o.kind === 'row' ? <LineRow key={o.row.key} r={o.row} cells={cells} /> : (
                  // 원본 '성명 계' · 합계 줄(2026-10-13 실측): ec-total(700 · 칸마다 rgb 243) · 이름 칸 가운데(colSpan 5)
                  <tr key={`s-${o.key}`} className="ec-total">
                    <td colSpan={5} className="text-center">{o.label} 계</td>
                    {cells(sumRows(o.list, { key: `s-${o.key}`, label: '', ledgerName: '', department: '', employeeName: '' }))}
                  </tr>
                )))}
                {sortCfg.total && (
                  <tr className="ec-total">
                    <td colSpan={5} className="text-center">합계</td>
                    {cells(total)}
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      )}
      {sortOpen && (
        <EcSortSubtotalModal keys={SORT_KEYS} value={sortCfg} onApply={(v) => { setSortCfg(v); setSortOpen(false) }} onClose={() => setSortOpen(false)} />
      )}
    </EcListShell>
  )
}

/** 격자는 출력물(ec-report) — 머리 700 · 6px 3px 3px · 선 1px · 본문 3px · 24.1 */
function LineRow({ r, cells }: { r: Row; cells: (r: Row) => React.ReactNode }) {
  return (
    <tr>
      <td>{r.label}</td>
      <td>{r.ledgerName}</td>
      <td>{r.department}</td>
      <td></td>
      <td>{r.employeeName}</td>
      {cells(r)}
    </tr>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, PayItem, Payslip } from '../../types/api'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

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

const pad2 = (n: number) => String(n).padStart(2, '0')
const MONTH_PICKS = ['금월', '전월', '전월+금월', '금년', '전년', '종료월'] as const
/** 원본 빠른선택 — 귀속연월(YYYY-MM) 범위. 종료월은 지금 끝 달 한 달. */
function monthPick(label: (typeof MONTH_PICKS)[number], cur: { from: string; to: string }) {
  const now = new Date()
  const y = now.getFullYear()
  const thisM = ym(now)
  const prevM = ym(new Date(y, now.getMonth() - 1, 1))
  switch (label) {
    case '금월': return { from: thisM, to: thisM }
    case '전월': return { from: prevM, to: prevM }
    case '전월+금월': return { from: prevM, to: thisM }
    case '금년': return { from: `${y}-01`, to: `${y}-12` }
    case '전년': return { from: `${y - 1}-01`, to: `${y - 1}-12` }
    case '종료월': return { from: cur.to, to: cur.to }
  }
}

/** 원본 [귀속연월] 한 쪽 — 연도 · 월 고르기 둘(원본 '2026' · '09' 단추). 값은 'YYYY-MM'. */
function YmSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const y = Number(value.slice(0, 4)) || new Date().getFullYear()
  const m = value.slice(5, 7) || '01'
  const now = new Date().getFullYear()
  const years = Array.from(new Set([now + 1, now, now - 1, now - 2, now - 3, y])).sort((a, b) => b - a)
  return (
    <>
      <select className="ec-input w-[54.8px]" aria-label={`${label} 연도`} value={y} onChange={(e) => onChange(`${e.target.value}-${m}`)}>
        {years.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <select className="ec-input w-[47.5px]" aria-label={`${label} 월`} value={m} onChange={(e) => onChange(`${y}-${e.target.value}`)}>
        {Array.from({ length: 12 }, (_, i) => pad2(i + 1)).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </>
  )
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
  const [condTab, setCondTab] = useState<'기본' | '전체'>('기본')
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

  /**
   * 원본 [선택삭제](2026-10-13 실측) — 고른 줄이 없으면 '리스트에 선택된 자료가 없습니다. …' 알림, 있으면 '삭제하겠습니까?' →
   * 안내 없이 줄이 사라진다(급여대장 인원 · 지급총액도 그만큼 준다). 확정된 대장의 명세는 지우지 않고
   * '아래의 경우 처리가 불가능합니다.' 창에 [구분 사원코드 · 사유 '확정처리된 급여입니다. 확정취소 후 처리바랍니다.'] 로 알린다.
   */
  async function deleteChecked() {
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    const picked = shown.filter((p) => checked.has(p.id))
    const blocked = picked.filter((p) => p.status === 'CONFIRMED')
    let failed = ''
    try {
      for (const p of picked.filter((x) => x.status !== 'CONFIRMED')) await api.delete(`/payslips/${p.id}`)
    } catch (e) {
      failed = extractErrorMessage(e)
    }
    setChecked(new Set())
    load()
    if (failed) setError(failed)
    if (blocked.length > 0) {
      void ecAlert('아래의 경우 처리가 불가능합니다.\n자세한 내용은 아래의 사항을 참고하시기 바랍니다.\n아래 사항을 수정 후 다시 진행하시기 바랍니다.\n\n'
        + blocked.map((p) => `${p.employeeCode}  확정처리된 급여입니다. 확정취소 후 처리바랍니다.`).join('\n'))
    }
  }

  const allChecked = shown.length > 0 && shown.every((p) => checked.has(p.id))

  return (
    <EcListShell
      title="사원별급여조회"
      collapseConditions
      searchable={false}
      actions={[
        { label: 'Email' },
        { label: '인쇄' },
        { label: '선택삭제', onClick: deleteChecked, selected: checked.size },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        {/* 원본 조건 판 위 탭 [기본] [전체] — 두 탭 모두 같은 칸 일곱(2026-10-21 실측) */}
        <li className="full">
          <div className="flex border-0 border-b border-solid border-ec-line" role="tablist" aria-label="조건 탭">
            {(['기본', '전체'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={condTab === t} onClick={() => setCondTab(t)}
                      className={`no-ec bg-transparent border-0 border-b-[1.5px] border-solid cursor-pointer text-[12px] py-[9.9px] px-[11.7px] ${condTab === t ? 'border-ec-blue text-ec-blue font-bold' : 'border-transparent text-[var(--ec-pill-text)]'}`}>{t}</button>
            ))}
          </div>
        </li>
        <EcCond label="급여대장">
          <CodePickerField label="급여대장" hideLabel fill multiple placeholder="급여대장" values={ledgerCond} onChangeMulti={(v) => setLedgerCond(v)}
                           items={ledgers.map((l) => ({ value: l.payMonth, code: l.payMonth.replace('-', '/'), name: l.name }))} />
        </EcCond>
        <EcCond label="귀속연월">
          <div className="flex items-center gap-[4px]">
            <YmSelect value={range.from} onChange={(v) => setRange({ ...range, from: v })} label="시작" />
            ~
            <YmSelect value={range.to} onChange={(v) => setRange({ ...range, to: v })} label="끝" />
          </div>
        </EcCond>
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="부서">
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
                           items={depts.map((x) => ({ value: String(x.id), code: x.code ?? undefined, name: x.name }))} />
        </EcCond>
        {/* 원본 [검색(F8)] 옆 빠른선택(2026-10-21 실측): 누르면 귀속연월을 바꾸고 바로 찾으며 판이 접힌다.
            종료월 = 시작을 끝 달로(2026/09~10 → 2026/10~10). [설정] 은 원본도 권한없음 창이라 두지 않는다. 셸이 ▾ 로 모은다. */}
        <li className="full">
          {MONTH_PICKS.map((l) => (
            <button key={l} type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(monthPick(l, range))}>{l}</button>
          ))}
        </li>
      </ul>
      <div className="text-right mb-[4px] text-ec-hint">{range.from.replace('-', '/')}/01 ~ {range.to.replace('-', '/')}</div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left whitespace-nowrap ec-report-head400">
          <thead>
            <tr>
              <th className="w-[34px] text-center">
                <input type="checkbox" checked={allChecked}
                       onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((p) => p.id)))} />
              </th>
              <th className="text-center">귀속연월</th>
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
            ) : shown.map((p, i) => (
              <tr key={p.id}>
                <td className="text-center whitespace-nowrap">
                  <input type="checkbox" checked={checked.has(p.id)}
                         onChange={() => {
                           const next = new Set(checked)
                           if (next.has(p.id)) next.delete(p.id); else next.add(p.id)
                           setChecked(next)
                         }} /> {i + 1}
                </td>
                <td className="text-center">
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

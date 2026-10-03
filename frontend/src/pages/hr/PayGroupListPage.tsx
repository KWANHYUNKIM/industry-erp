import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { EmployeeMaster, PayGroup, PayGroupEmployee, PayItem, PayslipLineKind } from '../../types/api'

/** 원본 그룹 폼은 수당 · 공제 격자마다 빈 줄 세 개로 시작한다. */
const BLANK_LINES = 3

interface LineRow { payItemId: string; amount: string }
interface EmpRow { employeeId: string; rate: string }

const blankLines = (n = BLANK_LINES): LineRow[] => Array.from({ length: n }, () => ({ payItemId: '', amount: '' }))
const blankEmps = (n = BLANK_LINES): EmpRow[] => Array.from({ length: n }, () => ({ employeeId: '', rate: '' }))

/**
 * 관리 &gt; 급여관리 &gt; 기본사항등록 &gt; <b>수당/공제그룹등록</b> (원본 E090104).
 *
 * <p>2026-10-03 loginaa 에서 그룹을 만들고 적용사원 창을 연 뒤 지워 본 그대로:
 * <ul>
 *   <li>목록: 수당/공제그룹코드 · 수당/공제그룹명 · 사원([등록]). 버튼 신규(F2) · 사용중단/재사용 ▲ · Excel.</li>
 *   <li>[신규(F2)] 창: 그룹코드(00001 꼴 미리 채움) · 그룹명, [수당] 격자와 [공제] 격자 — 항목코드 · 항목명 · 단위 · 내역.
 *       항목코드를 넣으면 항목명과 단위('금액')가 채워진다. 버튼 저장(F8) · 다시 작성 · 닫기.</li>
 *   <li>[사원 등록] → '적용사원등록' 창: 사원번호 · 성명 · 부서 · 지급율(%). 여기 든 사원은 급여계산 때
 *       이 그룹의 수당 · 공제를 지급율만큼 받는다(서버 PayrollService).</li>
 *   <li>[사용중단/재사용 ▲] 은 사용중단 · 삭제 · 재사용. 삭제는 '한번 지워진 자료는 복구될 수 없습니다.' 를 묻는다.</li>
 * </ul>
 * 웹자료올리기 · 격자 [찾기(F3)] · [정렬] 은 아직 없다.
 */
export default function PayGroupListPage() {
  const [groups, setGroups] = useState<PayGroup[]>([])
  const [items, setItems] = useState<PayItem[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [includeInactive, setIncludeInactive] = useState(false)
  const [quick, setQuick] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  // 그룹 폼
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [allowances, setAllowances] = useState<LineRow[]>(blankLines())
  const [deductions, setDeductions] = useState<LineRow[]>(blankLines())

  // 적용사원 창
  const [empGroup, setEmpGroup] = useState<PayGroup | null>(null)
  const [empRows, setEmpRows] = useState<EmpRow[]>(blankEmps())
  const [empError, setEmpError] = useState('')

  function load() {
    setError('')
    api.get<PayGroup[]>('/pay-settings/groups').then((r) => setGroups(r.data)).catch((e) => setError(extractErrorMessage(e)))
    api.get<PayItem[]>('/pay-settings/items').then((r) => setItems(r.data.filter((i) => i.active))).catch(() => setItems([]))
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
  }
  useEffect(() => { load() }, [])

  const itemsOf = (kind: PayslipLineKind) => items.filter((i) => i.kind === kind)

  async function openNew() {
    setEditId(null); setFormError(''); setName(''); setCode('')
    setAllowances(blankLines()); setDeductions(blankLines())
    setFormOpen(true)
    // 원본처럼 다음 그룹코드를 미리 채운다 — 숫자 코드 중 가장 큰 것 + 1
    const max = groups.map((g) => Number(g.code)).filter((n) => Number.isFinite(n)).reduce((a, b) => Math.max(a, b), 0)
    setCode(String(max + 1).padStart(5, '0'))
  }

  function openEdit(g: PayGroup) {
    setEditId(g.id); setFormError(''); setCode(g.code); setName(g.name)
    const rows = (kind: PayslipLineKind) => {
      const got = g.lines.filter((l) => l.kind === kind).map((l) => ({ payItemId: String(l.payItemId), amount: String(l.amount) }))
      return [...got, ...blankLines(Math.max(1, BLANK_LINES - got.length))]
    }
    setAllowances(rows('ALLOWANCE')); setDeductions(rows('DEDUCTION'))
    setFormOpen(true)
  }

  async function saveGroup(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!name.trim()) { setFormError('수당/공제그룹명을 입력 바랍니다.'); return }
    const lines = [...allowances, ...deductions]
      .filter((l) => l.payItemId)
      .map((l) => ({ payItemId: Number(l.payItemId), amount: l.amount === '' ? null : Number(l.amount.replace(/,/g, '')) }))
    const cur = groups.find((g) => g.id === editId)
    const body = { code: code.trim() || null, name: name.trim(), remark: cur?.remark ?? null, active: cur?.active ?? true, lines }
    try {
      if (editId) await api.put(`/pay-settings/groups/${editId}`, body)
      else await api.post('/pay-settings/groups', body)
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function openEmployees(g: PayGroup) {
    setEmpError('')
    setEmpGroup(g)
    try {
      const r = await api.get<PayGroupEmployee[]>(`/pay-settings/groups/${g.id}/employees`)
      const got = r.data.map((a) => ({ employeeId: String(a.employeeId), rate: String(a.rate) }))
      setEmpRows([...got, ...blankEmps(Math.max(1, BLANK_LINES - got.length))])
    } catch (e) {
      setEmpError(extractErrorMessage(e))
    }
  }

  async function saveEmployees() {
    if (!empGroup) return
    const body = empRows.filter((r) => r.employeeId)
      .map((r) => ({ employeeId: Number(r.employeeId), rate: r.rate === '' ? null : Number(r.rate) }))
    try {
      await api.put(`/pay-settings/groups/${empGroup.id}/employees`, body)
      setEmpGroup(null)
      load()
    } catch (e) {
      setEmpError(extractErrorMessage(e))
    }
  }

  // ── 사용중단 · 삭제 · 재사용 ──
  const [menuOpen, setMenuOpen] = useState(false)
  async function applyToChecked(op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false)
    if (op === '삭제' && !window.confirm('한번 지워진 자료는 복구될 수 없습니다.\n\n삭제하겠습니까?')) return
    try {
      for (const g of groups.filter((x) => checked.has(x.id))) {
        if (op === '삭제') await api.delete(`/pay-settings/groups/${g.id}`)
        else {
          await api.put(`/pay-settings/groups/${g.id}`, {
            code: g.code, name: g.name, remark: g.remark, active: op === '재사용',
            lines: g.lines.map((l) => ({ payItemId: l.payItemId, amount: l.amount })),
          })
        }
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const shownRows = groups
    .filter((g) => includeInactive || g.active)
    .filter((g) => !quick || g.code.includes(quick) || g.name.includes(quick))
  const sort = useTableSort(shownRows, {
    '수당/공제그룹코드': (g) => g.code,
    '수당/공제그룹명': (g) => g.name,
  })
  const shown = sort.sorted
  useTableColumnCheck(tableRef, '수당/공제그룹등록', [shown.length])
  const allChecked = shown.length > 0 && shown.every((g) => checked.has(g.id))

  const lineGrid = (kind: PayslipLineKind, rows: LineRow[], setRows: (r: LineRow[]) => void) => (
    <table className="w-full mb-[8px]">
      <thead>
        <tr>
          <th className="w-[34px]"></th>
          <th className="w-[30%]">항목코드</th>
          <th>항목명</th>
          <th className="w-[80px] text-center">단위</th>
          <th className="w-[25%] text-right">내역</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const it = items.find((x) => String(x.id) === r.payItemId)
          const set = (patch: Partial<LineRow>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)))
          return (
            <tr key={i}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>
                <select className="ec-input w-full" value={r.payItemId} onChange={(e) => set({ payItemId: e.target.value })}>
                  <option value=""></option>
                  {itemsOf(kind).map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}
                </select>
              </td>
              <td>{it?.name ?? ''}</td>
              <td className="text-center">{it ? '금액' : ''}</td>
              <td>
                <input className="ec-input w-full text-right" inputMode="numeric" value={r.amount}
                       onChange={(e) => set({ amount: e.target.value.replace(/[^0-9]/g, '') })} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  return (
    <EcListShell
      title="수당/공제그룹등록"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={openNew}
      actions={[
        { label: '사용중단/재사용 ▲', onClick: () => setMenuOpen((v) => !v), disabled: checked.size === 0 },
        { label: includeInactive ? '사용중단제외' : '사용중단포함', onClick: () => setIncludeInactive((v) => !v) },
        { label: 'Excel' },
      ]}
    >
      {menuOpen && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
          <div className="ec-menu fixed top-auto right-auto bottom-[44px] left-[300px] mobile:left-[16px]">
            {(['사용중단', '삭제', '재사용'] as const).map((op) => (
              <button key={op} type="button" onClick={() => applyToChecked(op)}>{op}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((g) => g.id)))} />
            </th>
            <th className="cursor-pointer" onClick={() => sort.toggle('수당/공제그룹코드')}>수당/공제그룹코드 {sort.mark('수당/공제그룹코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('수당/공제그룹명')}>수당/공제그룹명 {sort.mark('수당/공제그룹명')}</th>
            <th className="w-[160px] text-center">사원</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((g) => (
            <tr key={g.id} className={g.active ? undefined : 'text-ec-hint'}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(g.id)}
                       onChange={() => {
                         const next = new Set(checked)
                         if (next.has(g.id)) next.delete(g.id); else next.add(g.id)
                         setChecked(next)
                       }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(g) }}>{g.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(g) }}>{g.name}</a></td>
              <td className="text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); openEmployees(g) }}>
                  {g.employeeCount > 0 ? `${g.employeeCount}명` : '등록'}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={formOpen} title="수당/공제그룹등록" width={760} onClose={() => setFormOpen(false)}>{(
        <form onSubmit={saveGroup}>
          <ul className="ec-form mb-[10px]">
            <li>
              <span className="title">수당/공제그룹코드</span>
              <div className="form">
                {editId ? <span>{code}</span> : <input className="ec-input w-full" value={code} onChange={(e) => setCode(e.target.value)} />}
              </div>
            </li>
            <li>
              <span className="title">수당/공제그룹명</span>
              <div className="form">
                <input className="ec-input w-full" value={name} placeholder="수당/공제그룹명" autoFocus onChange={(e) => setName(e.target.value)} />
              </div>
            </li>
          </ul>
          <div className="ec-pills mb-[6px]"><span className="ec-pill active">수당</span></div>
          {lineGrid('ALLOWANCE', allowances, setAllowances)}
          <div className="ec-pills mb-[6px]"><span className="ec-pill active">공제</span></div>
          {lineGrid('DEDUCTION', deductions, setDeductions)}
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn"
                    onClick={() => { const g = groups.find((x) => x.id === editId); if (g) openEdit(g); else openNew() }}>
              다시 작성
            </button>
            <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>

      <Modal error={empError} open={!!empGroup} title="적용사원등록" width={720} onClose={() => setEmpGroup(null)}>{(
        <>
          <ul className="ec-form mb-[10px]">
            <li><span className="title">수당/공제그룹코드</span><div className="form">{empGroup?.code}</div></li>
            <li><span className="title">수당/공제그룹명</span><div className="form">{empGroup?.name}</div></li>
          </ul>
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th className="w-[34%]">사원번호</th>
                <th>성명</th>
                <th>부서</th>
                <th className="w-[110px] text-right">지급율(%)</th>
              </tr>
            </thead>
            <tbody>
              {empRows.map((r, i) => {
                const e = employees.find((x) => String(x.id) === r.employeeId)
                const set = (patch: Partial<EmpRow>) => setEmpRows(empRows.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                return (
                  <tr key={i}>
                    <td className="text-center text-ec-hint">{i + 1}</td>
                    <td>
                      <select className="ec-input w-full" value={r.employeeId}
                              onChange={(ev) => {
                                const next = empRows.map((x, j) => (j === i ? { ...x, employeeId: ev.target.value } : x))
                                // 마지막 줄을 채우면 빈 줄을 하나 더 둔다
                                setEmpRows(next.every((x) => x.employeeId) ? [...next, ...blankEmps(1)] : next)
                              }}>
                        <option value=""></option>
                        {employees.map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
                      </select>
                    </td>
                    <td>{e?.name ?? ''}</td>
                    <td>{e?.department ?? ''}</td>
                    <td>
                      <input className="ec-input w-full text-right" inputMode="decimal" value={r.rate} placeholder={e ? '100' : ''}
                             onChange={(ev) => set({ rate: ev.target.value.replace(/[^0-9.]/g, '') })} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={saveEmployees}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => empGroup && openEmployees(empGroup)}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setEmpGroup(null)}>닫기</button>
          </div>
        </>
      )}</Modal>
    </EcListShell>
  )
}


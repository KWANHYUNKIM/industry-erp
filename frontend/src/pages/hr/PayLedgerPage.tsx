import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../utils/periods'
import type { EmployeeMaster, PayItem } from '../../types/api'
import PayslipBulkEdit from '../../features/payroll/components/PayslipBulkEdit'
import DirectAmountInput from '../../features/payroll/components/DirectAmountInput'
import LedgerLabelMenu from '../../features/payroll/components/LedgerLabelMenu'
import PayrollSlipCreate from '../../features/payroll/components/PayrollSlipCreate'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EcDateInput from '../../components/ui/EcDateInput'

interface Ledger { id: number; payMonth: string; name: string; payDate: string; headcount: number; grossTotal: number; confirmedCount: number; workConfirmCount: number; directAmountCount: number }
interface ConfirmRow { employeeId: number; employeeCode: string; employeeName: string; payItemId: number; payItemName: string; quantity: number }

const won = (n: number) => Number(n).toLocaleString('ko-KR')
const slash = (s: string) => s.replace(/-/g, '/')

/**
 * 관리 &gt; 급여관리 &gt; 급여작업 &gt; <b>급여계산/대장</b> (원본 E090106).
 *
 * <p>2026-10-03 loginaa 에서 대장을 만들고 계산 · 삭제해 본 그대로:
 * <ul>
 *   <li>목록: 신고귀속(2026/10 -1) · 급여구분 · 지급구분 · 대장명칭 · 지급일 · 지급연월 · 급여계산 · 인원수 · 급여대장 · 지급총액.</li>
 *   <li>[신규(F2)] '급여정보입력': 귀속연월 · 지급일 · 급여대장명칭. 같은 기간 대장이 있으면 '동일기간에 이미 생성된 급여가 있습니다.'</li>
 *   <li>[전체계산]: '기존 자료를 삭제하고 다시 계산합니다. 급여대장에서 직접 수정한 내역은 유지되지 않습니다.' — 지급총액 0 이하 제외.</li>
 *   <li>급여대장 [조회] 는 사원별 명세표, [확정] 은 대장 전체 확정, [삭제] 는 '급여가 전체 삭제됩니다. 삭제된 급여는 복구할 수 없습니다.'</li>
 * </ul>
 * [사전작업] '근무기록확정[n]' 창은 사원 × 변동수당(시간 · 일) 격자 — [근무기록]이 근무입력의 그 달 합계를 불러오고,
 * [저장]한 값만 급여계산에 들어간다(원본 계산식 '야근수당(근무기록확정)'). n 은 확정한 사원 수다.
 * 우리는 사원 · 귀속월에 명세가 하나라 대장도 귀속월에 하나다(원본은 -1, -2 …) — 신고귀속은 늘 '-1'.
 * 급여구분은 '급여', 지급구분은 '1차수' 하나다(상여 · 차수가 없다).
 * [명세서] 조회는 그 대장 한 달의 사원별급여조회로 연다(원본과 같다). 개인별계산의 [항목선택계산] · 명세서 Email 은 아직 없다.
 * [사전작업] 금액직접입력은 features/payroll/components/DirectAmountInput.
 * 급여대장 [일괄수정]은 features/payroll/components/PayslipBulkEdit(대상자 선택 → 급여내역수정 격자).
 * [개인별계산]은 사원(퇴사자 포함) 목록에서 체크한 사원만 지우고 다시 셈하고, 끝나면 그 대장의 급여대장을 띄운다(2026-10-12 실측).
 *
 * <p>2026-10-13 원본에 시험 대장(QA관리-시험대장)을 만들어 신규 → 전체계산 → 확정 → 확정취소 → 삭제를 해 본 그대로:
 * 미확정 대장은 칸마다 링크(명세서 칸은 인원이 없어도 '조회 · Email'), [전체계산]이 끝나면 급여대장 창이 뜬다.
 * [확정]은 확인 창 · 안내 없이 바로, 확정 대장은 칸이 알약 + 펼침 메뉴(LedgerLabelMenu)로 바뀐다 —
 * 사전작업 ▸ 근무기록확정 · 금액직접입력 / 계산/수정('확정처리된 급여입니다. 확정취소 후 처리 바랍니다.') /
 * 급여대장 ▸ 조회 · 확정취소('확정취소 하겠습니까?', 안내 없음) · 전표생성 / 명세서 ▸ 조회.
 * [삭제]는 '2026/10 -2 급여가 전체 삭제됩니다. …' → 안내 없이 줄이 사라진다.
 */
export default function PayLedgerPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState<Ledger[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const today = ymd(new Date())
  const [form, setForm] = useState({ payMonth: today.slice(0, 7), payDate: today, name: '' })
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '급여계산/대장', [rows.length])

  // ── 사전작업 [근무기록확정] 창: 사원 × 변동수당(시간 · 일) 격자 ──
  const [confirmFor, setConfirmFor] = useState<Ledger | null>(null)
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [varItems, setVarItems] = useState<PayItem[]>([])
  const [grid, setGrid] = useState<Map<string, string>>(new Map())
  const [confirmError, setConfirmError] = useState('')
  const cellKey = (e: number, i: number) => `${e}#${i}`
  const fill = (rows: ConfirmRow[]) => setGrid(new Map(rows.map((r) => [cellKey(r.employeeId, r.payItemId), String(r.quantity)])))

  async function openConfirm(l: Ledger) {
    setConfirmError('')
    setConfirmFor(l)
    try {
      const [e, it, rows] = await Promise.all([
        api.get<EmployeeMaster[]>('/employees'),
        api.get<PayItem[]>('/pay-settings/items'),
        api.get<ConfirmRow[]>('/work-records/confirms', { params: { from: l.payMonth, to: l.payMonth } }),
      ])
      // 원본(2026-10-14 실측): 창에 오르는 사원은 [급여구분] 변동급뿐이다(고정급 천우석 · QA세무-퇴직은 없음,
      // 새 사원을 변동급으로 바꾸자 바로 첫 줄에 나옴) — 사원번호 차례.
      setEmployees(e.data.filter((x) => x.payType === 'VARIABLE').sort((a, b) => a.code.localeCompare(b.code)))
      setVarItems(it.data.filter((i) => i.active && i.kind === 'ALLOWANCE' && (i.payMethod === 'HOURLY' || i.payMethod === 'DAILY')))
      fill(rows.data)
    } catch (err) {
      setConfirmError(extractErrorMessage(err))
    }
  }

  /** 원본 [근무기록] — 근무입력에서 그 귀속월 근무일자의 기록을 불러와 칸을 채운다(저장 전). */
  async function loadRecords() {
    if (!confirmFor) return
    try {
      fill((await api.get<ConfirmRow[]>(`/work-records/confirms/${confirmFor.payMonth}/load`)).data)
    } catch (err) {
      setConfirmError(extractErrorMessage(err))
    }
  }

  async function saveConfirm() {
    if (!confirmFor) return
    // [근무기록]은 고정급 사원의 근무도 불러오지만 창에 없는 사원은 저장하지 않는다(원본도 창에 보이는 줄만 확정).
    const shown = new Set(employees.map((x) => x.id))
    const cells = [...grid.entries()].filter(([, v]) => v !== '' && Number(v) !== 0).map(([k, v]) => {
      const [employeeId, payItemId] = k.split('#').map(Number)
      return { employeeId, payItemId, quantity: Number(v) }
    }).filter((c) => shown.has(c.employeeId))
    try {
      await api.put(`/work-records/confirms/${confirmFor.payMonth}`, cells)
      setConfirmFor(null)
      load()
    } catch (err) {
      setConfirmError(extractErrorMessage(err))
    }
  }

  async function deleteConfirm() {
    if (!confirmFor || !(await ecConfirm('삭제하시겠습니까?'))) return
    try {
      await api.delete(`/work-records/confirms/${confirmFor.payMonth}`)
      setConfirmFor(null)
      load()
    } catch (err) {
      setConfirmError(extractErrorMessage(err))
    }
  }

  function load() {
    setError('')
    api.get<Ledger[]>('/pay-ledgers').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3000) }

  async function create(ev?: React.FormEvent) {
    ev?.preventDefault()
    try {
      await api.post('/pay-ledgers', { payMonth: form.payMonth, payDate: form.payDate || null, name: form.name.trim() || null })
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  // ── 원본 [전체계산] · [개인별계산] ──
  // 개인별계산: 사원(퇴사자 포함, 사원번호 순) 목록에서 체크 → [계산처리] → 확인 창('지급총액 0 이하 제외') → 급여대장 조회.
  const [pickFor, setPickFor] = useState<Ledger | null>(null)
  const [allEmployees, setAllEmployees] = useState<EmployeeMaster[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [pickQuery, setPickQuery] = useState('')
  const [pickError, setPickError] = useState('')
  /** 원본 [사전작업] 금액직접입력 — 사원 · 항목마다 손으로 정한 금액(다시 계산할 때 그 항목의 셈 대신 쓴다) */
  const [directFor, setDirectFor] = useState<Ledger | null>(null)
  /** 원본 급여대장 [일괄수정] — 대상자 선택 → 급여내역수정 격자 */
  const [bulkFor, setBulkFor] = useState<Ledger | null>(null)
  /** 확정 대장 [급여대장 ▸ 전표생성] */
  const [slipFor, setSlipFor] = useState<Ledger | null>(null)
  const [calcAsk, setCalcAsk] = useState<{ ledger: Ledger; ids: number[] | null } | null>(null)
  const [excludeZero, setExcludeZero] = useState(true)

  async function openPick(l: Ledger) {
    setPickError(''); setChecked(new Set()); setPickQuery(''); setPickFor(l)
    try {
      const r = await api.get<EmployeeMaster[]>('/employees/all')
      setAllEmployees([...r.data].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)))
    } catch (e) {
      setPickError(extractErrorMessage(e))
    }
  }
  const pickRows = allEmployees.filter((e) => !pickQuery || [e.code, e.name, e.department ?? ''].some((v) => v.includes(pickQuery)))

  function askPicked() {
    if (!pickFor) return
    if (checked.size === 0) { void ecAlert('선택된 사원이 없습니다.\n\n계산처리할 사원에 체크한 후 다시 시도 바랍니다.'); return }
    setExcludeZero(true)
    setCalcAsk({ ledger: pickFor, ids: [...checked] })
  }

  function calculate(l: Ledger) {
    setExcludeZero(true)
    setCalcAsk({ ledger: l, ids: null })
  }

  async function runCalculate() {
    if (!calcAsk) return
    const { ledger: l, ids } = calcAsk
    setCalcAsk(null)
    try {
      const r = await api.post<{ calculated: number; skipped: number; failures: string }>(`/pay-ledgers/${l.id}/calculate`,
        { employeeIds: ids, excludeNonPositive: excludeZero })
      if (r.data.failures) setError(`계산 못 한 사원: ${r.data.failures}`)
      if (ids) {
        // 원본은 개인별계산이 끝나면 그 대장의 급여대장(사원 전부)을 띄운다.
        setPickFor(null)
        nav(`/hr/payroll/ledger?month=${l.payMonth}&view=report`)
        return
      }
      // 원본 [전체계산]도 끝나면 그 대장의 급여대장 창을 띄운다(2026-10-13 실측).
      if (r.data.calculated > 0 && !r.data.failures) {
        nav(`/hr/payroll/ledger?month=${l.payMonth}&view=report`)
        return
      }
      flash(`${r.data.calculated}명 계산${r.data.skipped ? ` · 지급총액 0 이하 ${r.data.skipped}명 제외` : ''}`)
      load()
    } catch (e) {
      if (ids) setPickError(extractErrorMessage(e)); else setError(extractErrorMessage(e))
    }
  }

  async function confirm(l: Ledger) {
    try { await api.post(`/pay-ledgers/${l.id}/confirm`); load() } catch (e) { setError(extractErrorMessage(e)) }
  }

  async function unconfirm(l: Ledger) {
    if (!(await ecConfirm('확정취소 하겠습니까?'))) return
    try { await api.post(`/pay-ledgers/${l.id}/unconfirm`); load() } catch (e) { setError(extractErrorMessage(e)) }
  }

  /** 원본 확정 대장 [계산/수정] · 미확정에만 있는 동작을 확정 뒤에 고르면 */
  const lockedAlert = () => ecAlert('확정처리된 급여입니다.\n\n확정취소 후 처리 바랍니다.')
  const isConfirmed = (l: Ledger) => l.headcount > 0 && l.confirmedCount >= l.headcount

  async function remove(l: Ledger) {
    if (!(await ecConfirm(`${slash(l.payMonth)} -1 급여가 전체 삭제됩니다.\n\n삭제된 급여는 복구할 수 없습니다.\n\n삭제하겠습니까?`))) return
    try { await api.delete(`/pay-ledgers/${l.id}`); load() } catch (e) { setError(extractErrorMessage(e)) }
  }

  return (
    <EcListShell
      title="급여계산/대장"
      searchable={false}
      onNew={() => { setFormError(''); setForm({ payMonth: today.slice(0, 7), payDate: today, name: '' }); setFormOpen(true) }}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>신고귀속</th>
            <th>급여구분</th>
            <th>지급구분</th>
            <th>대장명칭</th>
            <th className="text-center">지급일</th>
            <th className="text-center">지급연월</th>
            <th className="text-center">사전작업</th>
            <th className="text-center">급여계산</th>
            <th className="text-right">인원수</th>
            <th className="text-center">급여대장</th>
            {/* 원본 [명세서] 조회 · Email — 조회는 그 대장 한 달의 사원별급여조회를 연다. Email 은 바깥 발송이라 없다. */}
            <th className="text-center">명세서</th>
            <th className="text-right">지급총액</th>
            <th className="text-right">상여지급률(액)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={13} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((l) => (
            <tr key={l.id}>
              <td>{slash(l.payMonth)} -1</td>
              <td>급여</td>
              <td>1차수</td>
              <td>{l.name}</td>
              <td className="text-center">{slash(l.payDate)}</td>
              <td className="text-center">{slash(l.payMonth)}</td>
              {isConfirmed(l) ? (
                <>
                  <td className="text-center">
                    <LedgerLabelMenu label="사전작업" tone="default" items={[
                      // 원본도 확정 대장에서 근무기록확정 창(저장(F8) · 삭제 그대로)을 연다(2026-10-13 실측)
                      { label: `근무기록확정${l.workConfirmCount ? `[${l.workConfirmCount}]` : ''}`, onClick: () => openConfirm(l) },
                      { label: `금액직접입력${l.directAmountCount ? `[${l.directAmountCount}]` : ''}`, onClick: () => setDirectFor(l) },
                    ]} />
                  </td>
                  <td className="text-center"><LedgerLabelMenu label="계산/수정" tone="default" onClick={lockedAlert} /></td>
                  <td className="text-right">{l.headcount || ''}</td>
                  <td className="text-center">
                    <LedgerLabelMenu label="급여대장" tone="primary" items={[
                      { label: '조회', onClick: () => nav(`/hr/payroll/ledger?month=${l.payMonth}&view=report`) },
                      { label: '확정취소', onClick: () => unconfirm(l) },
                      { label: '전표생성', onClick: () => setSlipFor(l) },
                    ]} />
                  </td>
                  <td className="text-center">
                    {/* 원본 명세서 ▸ 조회 · Email — Email 은 바깥 발송이라 없다 */}
                    <LedgerLabelMenu label="명세서" tone="primary" items={[
                      { label: '조회', onClick: () => nav(`/hr/payroll/by-employee?ledger=${l.payMonth}`) },
                    ]} />
                  </td>
                </>
              ) : (
                <>
              <td className="text-center">
                <div className="flex flex-col items-center">
                  <a href="#" onClick={(e) => { e.preventDefault(); openConfirm(l) }}>
                    근무기록확정{l.workConfirmCount ? `[${l.workConfirmCount}]` : ''}
                  </a>
                  <a href="#" onClick={(e) => { e.preventDefault(); setDirectFor(l) }}>
                    금액직접입력{l.directAmountCount ? `[${l.directAmountCount}]` : ''}
                  </a>
                </div>
              </td>
              <td className="text-center">
                <div className="flex flex-col items-center">
                  <a href="#" onClick={(e) => { e.preventDefault(); calculate(l) }}>전체계산</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); openPick(l) }}>개인별계산</a>
                </div>
              </td>
              <td className="text-right">{l.headcount || ''}</td>
              <td className="text-center">
                <div className="flex flex-col items-center">
                  <a href="#" onClick={(e) => { e.preventDefault(); nav(`/hr/payroll/ledger?month=${l.payMonth}&view=report`) }}>조회</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); setBulkFor(l) }}>일괄수정</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); confirm(l) }}>확정</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); remove(l) }}>삭제</a>
                </div>
              </td>
              <td className="text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); nav(`/hr/payroll/by-employee?ledger=${l.payMonth}`) }}>조회</a>
              </td>
                </>
              )}
              <td className="text-right">{l.headcount ? won(l.grossTotal) : ''}</td>
              {/* 급여구분이 '급여' 하나라(상여 대장 없음) 늘 빈칸 — 원본 급여 대장도 빈칸이다. */}
              <td className="text-right"></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={confirmError} open={!!confirmFor} title="근무기록확정" width={820} onClose={() => setConfirmFor(null)}>{(
        <>
          <div className="flex gap-[6px] mb-[8px]">
            <button type="button" className="ec-btn" onClick={loadRecords}>근무기록</button>
            <span className="text-ec-hint self-center">{confirmFor && `${slash(confirmFor.payMonth)} -1 ${confirmFor.name}`}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr>
                  <th></th>
                  <th>사원번호</th>
                  <th>사원명</th>
                  <th>부서명</th>
                  {varItems.map((i) => <th key={i.id} className="text-right">{i.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 && (
                  <tr><td colSpan={4 + varItems.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                )}
                {employees.map((e, n) => (
                  <tr key={e.id}>
                    <td className="text-center">{n + 1}</td>
                    <td>{e.code}</td>
                    <td>{e.name}</td>
                    <td>{e.department}</td>
                    {varItems.map((i) => (
                      <td key={i.id}>
                        <input className="ec-input w-full text-right" inputMode="decimal"
                               value={grid.get(cellKey(e.id, i.id)) ?? ''}
                               onChange={(ev) => {
                                 const next = new Map(grid)
                                 next.set(cellKey(e.id, i.id), ev.target.value.replace(/[^0-9.]/g, ''))
                                 setGrid(next)
                               }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={saveConfirm}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setConfirmFor(null)}>닫기</button>
            <button type="button" className="ec-btn" onClick={deleteConfirm}>삭제</button>
          </div>
        </>
      )}</Modal>

      <Modal error={pickError} open={!!pickFor} title="개인별계산" width={780} onClose={() => setPickFor(null)}>{(
        <>
          <div className="flex items-center justify-between mb-[8px]">
            <b>개인별계산</b>
            <form className="flex gap-[4px]" onSubmit={(e) => { e.preventDefault() }}>
              <input className="ec-input w-[180px]" placeholder="입력 후 [Enter]" aria-label="개인별계산 검색" value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} />
              <button type="submit" className="ec-btn ec-btn-primary">Search(F3)</button>
            </form>
          </div>
          <div className="overflow-y-auto max-h-[420px]">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr>
                  <th className="w-[30px] text-center">
                    <input type="checkbox" aria-label="전체선택" checked={pickRows.length > 0 && pickRows.every((e) => checked.has(e.id))}
                           onChange={(ev) => setChecked(ev.target.checked ? new Set(pickRows.map((e) => e.id)) : new Set())} />
                  </th>
                  <th>사원번호</th>
                  <th>성명</th>
                  <th>부서명</th>
                  <th className="text-center">입사일자</th>
                  <th className="text-center">퇴사일자</th>
                </tr>
              </thead>
              <tbody>
                {pickRows.length === 0 ? (
                  <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : pickRows.map((e) => (
                  <tr key={e.id}>
                    <td className="text-center">
                      <input type="checkbox" aria-label={`${e.name} 선택`} checked={checked.has(e.id)} onChange={(ev) => {
                        const next = new Set(checked)
                        if (ev.target.checked) next.add(e.id); else next.delete(e.id)
                        setChecked(next)
                      }} />
                    </td>
                    <td>{e.code}</td>
                    <td>{e.name}</td>
                    <td>{e.department}</td>
                    <td className="text-center">{e.hireDate ? slash(e.hireDate) : ''}</td>
                    <td className="text-center">{e.resignDate ? slash(e.resignDate) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={askPicked}>계산처리</button>
            <button type="button" className="ec-btn" onClick={() => setPickFor(null)}>닫기</button>
          </div>
        </>
      )}</Modal>

      <DirectAmountInput ledger={directFor} onClose={() => setDirectFor(null)} onChanged={load} />

      <PayrollSlipCreate ledger={slipFor} onClose={() => setSlipFor(null)} onSaved={flash} />

      <PayslipBulkEdit ledger={bulkFor} onClose={() => setBulkFor(null)} onSaved={() => { flash('저장되었습니다.'); load() }} />

      <Modal error={error} open={!!calcAsk} title="알림" width={460} onClose={() => setCalcAsk(null)}>{(
        <>
          <p className="whitespace-pre-line mb-[10px]">
            {calcAsk?.ids
              ? '선택한 사원의 기존 자료를 삭제하고 다시 계산합니다.\n\n급여대장에서 직접 수정한 내역은 유지되지 않습니다.\n\n개인별 계산을 진행하겠습니까?'
              : '기존 자료를 삭제하고 다시 계산합니다.\n\n급여대장에서 직접 수정한 내역은 유지되지 않습니다.\n\n전체 계산을 진행하시겠습니까?'}
          </p>
          <label className="inline-flex items-center gap-[4px]">
            <input type="checkbox" checked={excludeZero} onChange={(e) => setExcludeZero(e.target.checked)} /> 지급총액 0 이하 제외
          </label>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={runCalculate}>확인</button>
            <button type="button" className="ec-btn" onClick={() => setCalcAsk(null)}>취소</button>
          </div>
        </>
      )}</Modal>

      <Modal error={formError} open={formOpen} title="급여정보입력" width={640} onClose={() => setFormOpen(false)}>{(
        <form onSubmit={create}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">귀속연월</span>
              <div className="form"><input type="month" className="ec-input w-[160px]" value={form.payMonth} onChange={(e) => setForm({ ...form, payMonth: e.target.value })} /></div>
            </li>
            <li className="wide">
              <span className="title">지급일</span>
              <div className="form"><EcDateInput className="ec-input w-[160px]" value={form.payDate} onChange={(e) => setForm({ ...form, payDate: e.target.value })} /></div>
            </li>
            <li className="wide">
              <span className="title">급여대장명칭</span>
              <div className="form"><input className="ec-input w-full" placeholder="급여대장명칭" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            </li>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}

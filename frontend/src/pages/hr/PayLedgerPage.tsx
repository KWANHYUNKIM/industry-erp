import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../utils/periods'
import type { EmployeeMaster, PayItem } from '../../types/api'

interface Ledger { id: number; payMonth: string; name: string; payDate: string; headcount: number; grossTotal: number; confirmedCount: number; workConfirmCount: number }
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
 * 급여구분은 '급여', 지급구분은 '1차수' 하나다(상여 · 차수가 없다). 사전작업의 금액직접입력 ·
 * [명세서] 조회는 그 대장 한 달의 사원별급여조회로 연다(원본과 같다). 개인별계산 · 금액직접입력 · 일괄수정 · 명세서 Email 은 아직 없다.
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
      setEmployees(e.data)
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
    const cells = [...grid.entries()].filter(([, v]) => v !== '' && Number(v) !== 0).map(([k, v]) => {
      const [employeeId, payItemId] = k.split('#').map(Number)
      return { employeeId, payItemId, quantity: Number(v) }
    })
    try {
      await api.put(`/work-records/confirms/${confirmFor.payMonth}`, cells)
      setConfirmFor(null)
      load()
    } catch (err) {
      setConfirmError(extractErrorMessage(err))
    }
  }

  async function deleteConfirm() {
    if (!confirmFor || !window.confirm('삭제하시겠습니까?')) return
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

  async function calculate(l: Ledger) {
    if (!window.confirm('기존 자료를 삭제하고 다시 계산합니다.\n\n급여대장에서 직접 수정한 내역은 유지되지 않습니다.\n\n전체 계산을 진행하시겠습니까?')) return
    try {
      const r = await api.post<{ calculated: number; skipped: number; failures: string }>(`/pay-ledgers/${l.id}/calculate`)
      if (r.data.failures) setError(`계산 못 한 사원: ${r.data.failures}`)
      flash(`${r.data.calculated}명 계산${r.data.skipped ? ` · 지급총액 0 이하 ${r.data.skipped}명 제외` : ''}`)
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function confirm(l: Ledger) {
    try { await api.post(`/pay-ledgers/${l.id}/confirm`); load() } catch (e) { setError(extractErrorMessage(e)) }
  }

  async function remove(l: Ledger) {
    if (!window.confirm(`${slash(l.payMonth)} -1 급여가 전체 삭제됩니다.\n\n삭제된 급여는 복구할 수 없습니다.\n\n삭제하겠습니까?`)) return
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
              <td className="text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); openConfirm(l) }}>
                  근무기록확정{l.workConfirmCount ? `[${l.workConfirmCount}]` : ''}
                </a>
              </td>
              <td className="text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); calculate(l) }}>전체계산</a>
              </td>
              <td className="text-right">{l.headcount || ''}</td>
              <td className="text-center">
                <div className="flex flex-col items-center">
                  <a href="#" onClick={(e) => { e.preventDefault(); nav(`/hr/payroll/ledger?month=${l.payMonth}&view=report`) }}>조회</a>
                  {l.headcount > l.confirmedCount && (
                    <a href="#" onClick={(e) => { e.preventDefault(); confirm(l) }}>확정</a>
                  )}
                  <a href="#" onClick={(e) => { e.preventDefault(); remove(l) }}>삭제</a>
                </div>
              </td>
              <td className="text-center">
                {l.headcount > 0 && <a href="#" onClick={(e) => { e.preventDefault(); nav(`/hr/payroll/by-employee?ledger=${l.payMonth}`) }}>조회</a>}
              </td>
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
                  <th>사원번호</th>
                  <th>사원명</th>
                  <th>부서명</th>
                  {varItems.map((i) => <th key={i.id} className="text-right">{i.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id}>
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

      <Modal error={formError} open={formOpen} title="급여정보입력" width={640} onClose={() => setFormOpen(false)}>{(
        <form onSubmit={create}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">귀속연월</span>
              <div className="form"><input type="month" className="ec-input w-[160px]" value={form.payMonth} onChange={(e) => setForm({ ...form, payMonth: e.target.value })} /></div>
            </li>
            <li className="wide">
              <span className="title">지급일</span>
              <div className="form"><input type="date" className="ec-input w-[160px]" value={form.payDate} onChange={(e) => setForm({ ...form, payDate: e.target.value })} /></div>
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

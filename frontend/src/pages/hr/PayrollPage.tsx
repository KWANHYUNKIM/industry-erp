import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, PayGroup, PayItem, Payslip } from '../../types/api'
import PayLedgerReport from '../../features/payroll/components/PayLedgerReport'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => n.toLocaleString('ko-KR')
const thisMonth = () => ymd(new Date()).slice(0, 7)

/** 급여대장 — 급여계산/대장 목록의 [조회]. 귀속월의 사원별 급여명세. 미작성 사원은 계산, 작성분은 상세/확정. */
export default function PayrollPage() {
  // 급여계산/대장 목록의 [조회] 가 ?month= 로 그 대장의 귀속월을 연다
  const [params] = useSearchParams()
  const [month, setMonth] = useState(params.get('month') ?? thisMonth())
  /*
   * 원본 급여계산/대장 [급여대장 조회]는 항목별 보고서(급여대장 창)를 연다 — ?view=report 면 그 보고서, 아니면 명세를 만들고 확정하는 작업 화면.
   * 보고서 아래 버튼: 인쇄 · Excel · 사원별 조회 · 작업 화면(우리에게만) · 닫기.
   */
  const nav = useNavigate()
  const [view, setView] = useState(params.get('view') === 'report' ? 'report' : 'work')
  const [items, setItems] = useState<PayItem[]>([])
  const [companyName, setCompanyName] = useState('')
  const [payDate, setPayDate] = useState<string | null>(null)
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [groups, setGroups] = useState<PayGroup[]>([])
  // 급여계산 시 적용할 수당/공제 그룹. 비우면 기본급 + 4대보험만 계산한다.
  const [payGroupId, setPayGroupId] = useState('')
  const [detail, setDetail] = useState<Payslip | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch((e) => setError(extractErrorMessage(e)))
    api.get<Payslip[]>('/payslips', { params: { month } }).then((r) => setPayslips(r.data)).catch((e) => setError(extractErrorMessage(e)))
    api.get<PayGroup[]>('/pay-settings/groups').then((r) => setGroups(r.data.filter((g) => g.active))).catch(() => {})
    api.get<PayItem[]>('/pay-settings/items').then((r) => setItems(r.data)).catch(() => setItems([]))
    api.get<{ name: string }>('/company').then((r) => setCompanyName(r.data.name)).catch(() => setCompanyName(''))
    api.get<{ payMonth: string; payDate: string | null }[]>('/pay-ledgers')
      .then((r) => setPayDate(r.data.find((l) => l.payMonth === month)?.payDate ?? null)).catch(() => setPayDate(null))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const byEmp = useMemo(() => new Map(payslips.map((p) => [p.employeeId, p])), [payslips])

  async function calc(emp: EmployeeMaster) {
    try {
      await api.post('/payslips', { employeeId: emp.id, payMonth: month, payGroupId: payGroupId ? Number(payGroupId) : undefined, lines: [] })
      flash(`${emp.name} 급여명세를 생성했습니다.`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function calcAll() {
    const targets = employees.filter((e) => !byEmp.has(e.id))
    if (targets.length === 0) return flash('모든 사원의 급여명세가 이미 있습니다.')
    if (!window.confirm(`미작성 ${targets.length}명의 급여명세를 일괄 생성할까요?`)) return
    /*
     * 개별 실패는 멈추지 않고 넘어가되 <b>센다</b>. 예전엔 실패를 버리고 늘 'N명 급여계산 완료' 라고 해서,
     * 기본급이 없는 사원 등에서 실패해도 다 된 줄 알았다(QA 18회차).
     */
    const failed: string[] = []
    for (const e of targets) {
      try { await api.post('/payslips', { employeeId: e.id, payMonth: month, payGroupId: payGroupId ? Number(payGroupId) : undefined, lines: [] }) }
      catch (err) { failed.push(`${e.name}(${extractErrorMessage(err)})`) }
    }
    const done = targets.length - failed.length
    if (failed.length) setError(`${done}명 계산, ${failed.length}명 실패 — ${failed.join(', ')}`)
    else flash(`${done}명 급여계산 완료`)
    load()
  }

  async function confirm(p: Payslip) {
    try { await api.post(`/payslips/${p.id}/confirm`); flash(`${p.employeeName} 확정`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function remove(p: Payslip) {
    if (!window.confirm(`${p.employeeName} ${p.payMonth} 급여명세를 삭제할까요?`)) return
    try { await api.delete(`/payslips/${p.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const totals = payslips.reduce((a, p) => ({
    gross: a.gross + p.grossPay, deduction: a.deduction + p.deductionTotal, net: a.net + p.netPay,
  }), { gross: 0, deduction: 0, net: 0 })

  if (view === 'report') {
    return (
      <EcListShell title="급여대장" searchable={false} actions={[
        { label: '인쇄', primary: true },  // 셸의 기본 인쇄 — 보고서 표를 찍는다
        { label: 'Excel' },
        { label: '사원별 조회', onClick: () => nav(`/hr/payroll/by-employee?ledger=${month}`) },
        { label: '작업 화면', onClick: () => setView('work') },
        { label: '닫기', onClick: () => nav('/hr/payroll') },
      ]}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <PayLedgerReport month={month} payDate={payDate} companyName={companyName} payslips={payslips} employees={employees} items={items} />
      </EcListShell>
    )
  }

  return (
    <EcListShell title="급여대장" actions={[{ label: 'Excel' }, { label: '인쇄' }, { label: '급여대장 보기', onClick: () => setView('report') }]}>
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px] text-ec-label">
        <span>귀속월</span>
        <input type="month" className="ec-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 150 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회(F8)</button>
        <span className="ml-[8px]">수당/공제 그룹</span>
        <select className="ec-input" value={payGroupId} onChange={(e) => setPayGroupId(e.target.value)} style={{ width: 180 }}>
          <option value="">적용 안함</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button className="ec-btn" onClick={calcAll}>미작성 일괄계산</button>
        <span className="ml-[8px] text-ec-hint">사원 {employees.length}명 · 작성 {payslips.length}건 · 4대보험 자동공제</span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th>사번</th><th>성명</th><th>부서</th>
            <th className="text-right">기본급</th><th className="text-right">수당</th>
            <th className="text-right">지급총액</th><th className="text-right">공제</th><th className="text-right">실지급액</th>
            <th className="text-center">상태</th><th className="text-center">처리</th>
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : employees.map((e, i) => {
            const p = byEmp.get(e.id)
            return (
              <tr key={e.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{e.code}</td>
                <td>{p ? <a onClick={() => setDetail(p)} className="text-ec-blue cursor-pointer">{e.name}</a> : e.name}</td>
                <td>{e.department}</td>
                <td className="text-right">{won(p ? p.baseSalary : e.baseSalary)}</td>
                <td className="text-right">{p ? won(p.allowanceTotal) : ''}</td>
                <td className="text-right font-semibold">{p ? won(p.grossPay) : ''}</td>
                <td style={{ textAlign: 'right', color: '#a5561b' }}>{p ? won(p.deductionTotal) : ''}</td>
                <td className="text-right font-bold text-ec-navy">{p ? won(p.netPay) : ''}</td>
                <td className="text-center">
                  {p ? <span style={{ color: p.status === 'CONFIRMED' ? 'var(--ec-success)' : 'var(--ec-text-hint)' }}>{p.statusName}</span> : <span className="text-ec-off">미작성</span>}
                </td>
                <td className="text-center">
                  {!p ? (
                    <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => calc(e)}>계산</button>
                  ) : p.status === 'DRAFT' ? (
                    <div className="inline-flex gap-[3px]">
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => confirm(p)}>확정</button>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => remove(p)}>삭제</button>
                    </div>
                  ) : (
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setDetail(p)}>명세</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={6} className="text-right">합계 (작성 {payslips.length}건)</td>
            <td className="text-right">{won(totals.gross)}</td>
            <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(totals.deduction)}</td>
            <td className="text-right text-ec-navy">{won(totals.net)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>

      {detail && <PayslipModal p={detail} onClose={() => setDetail(null)} />}
    </EcListShell>
  )
}

function PayslipModal({ p, onClose }: { p: Payslip; onClose: () => void }) {
  const allowances = p.lines.filter((l) => l.kind === 'ALLOWANCE')
  const deductions = p.lines.filter((l) => l.kind === 'DEDUCTION')
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 560, maxWidth: '92vw', maxHeight: '88vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">급여명세서 · {p.employeeName} ({p.payMonth})</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          <table className="w-full text-left mb-[12px]">
            <tbody>
              <tr><th className="w-[90px] bg-ec-page">사번</th><td>{p.employeeCode}</td><th className="w-[90px] bg-ec-page">부서</th><td>{p.department}</td></tr>
              <tr><th className="bg-ec-page">귀속월</th><td>{p.payMonth}</td><th className="bg-ec-page">상태</th><td style={{ color: p.status === 'CONFIRMED' ? 'var(--ec-success)' : 'var(--ec-text-hint)', fontWeight: 700 }}>{p.statusName}</td></tr>
            </tbody>
          </table>

          <div className="flex gap-[16px] flex-wrap">
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1a4d8f', marginBottom: 4 }}>지급</div>
              <table className="w-full text-left">
                <tbody>
                  <tr><td>기본급</td><td className="text-right">{won(p.baseSalary)}</td></tr>
                  {allowances.map((l) => <tr key={l.id}><td>{l.name}</td><td className="text-right">{won(l.amount)}</td></tr>)}
                  <tr className="font-bold bg-ec-page"><td>지급총액</td><td className="text-right">{won(p.grossPay)}</td></tr>
                </tbody>
              </table>
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: '#a5561b', marginBottom: 4 }}>공제 (4대보험 자동)</div>
              <table className="w-full text-left">
                <tbody>
                  {deductions.map((l) => <tr key={l.id}><td>{l.name}{l.auto && <span className="text-[10px] text-ec-hint ml-[4px]">자동</span>}</td><td className="text-right">{won(l.amount)}</td></tr>)}
                  <tr className="font-bold bg-ec-page"><td>공제총액</td><td className="text-right">{won(p.deductionTotal)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-[14px] py-[14px] px-[18px] border border-ec-line border-solid bg-ec-success-bg flex items-center justify-between">
            <span style={{ fontSize: 12.5, color: '#1c6b32' }}>실지급액 (지급총액 − 공제총액)</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#2f8401' }}>{won(p.netPay)} <span className="text-[13px] font-normal">원</span></span>
          </div>
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

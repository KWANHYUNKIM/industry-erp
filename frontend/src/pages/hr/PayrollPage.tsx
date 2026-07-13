import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, Payslip } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const thisMonth = () => new Date().toISOString().slice(0, 7)

/** 급여계산/대장 — 귀속월의 사원별 급여명세. 미작성 사원은 계산, 작성분은 상세/확정. */
export default function PayrollPage() {
  const [month, setMonth] = useState(thisMonth())
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [detail, setDetail] = useState<Payslip | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch((e) => setError(extractErrorMessage(e)))
    api.get<Payslip[]>('/payslips', { params: { month } }).then((r) => setPayslips(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const byEmp = useMemo(() => new Map(payslips.map((p) => [p.employeeId, p])), [payslips])

  async function calc(emp: EmployeeMaster) {
    try {
      await api.post('/payslips', { employeeId: emp.id, payMonth: month, lines: [] })
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
    for (const e of targets) {
      try { await api.post('/payslips', { employeeId: e.id, payMonth: month, lines: [] }) } catch { /* 개별 실패 무시 */ }
    }
    flash(`${targets.length}명 급여계산 완료`)
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

  return (
    <EcListShell title="급여계산/대장" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>귀속월</span>
        <input type="month" className="ec-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 150 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회(F8)</button>
        <button className="ec-btn" onClick={calcAll}>미작성 일괄계산</button>
        <span style={{ marginLeft: 8, color: '#9aa1ab' }}>사원 {employees.length}명 · 작성 {payslips.length}건 · 4대보험 자동공제</span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>사번</th><th>성명</th><th>부서</th>
            <th style={{ textAlign: 'right' }}>기본급</th><th style={{ textAlign: 'right' }}>수당</th>
            <th style={{ textAlign: 'right' }}>지급총액</th><th style={{ textAlign: 'right' }}>공제</th><th style={{ textAlign: 'right' }}>실지급액</th>
            <th style={{ textAlign: 'center' }}>상태</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>사원이 없습니다.</td></tr>
          ) : employees.map((e, i) => {
            const p = byEmp.get(e.id)
            return (
              <tr key={e.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{e.code}</td>
                <td>{p ? <a onClick={() => setDetail(p)} style={{ color: 'var(--ec-blue)', cursor: 'pointer' }}>{e.name}</a> : e.name}</td>
                <td>{e.department}</td>
                <td style={{ textAlign: 'right' }}>{won(p ? p.baseSalary : e.baseSalary)}</td>
                <td style={{ textAlign: 'right' }}>{p ? won(p.allowanceTotal) : '-'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{p ? won(p.grossPay) : '-'}</td>
                <td style={{ textAlign: 'right', color: '#a5561b' }}>{p ? won(p.deductionTotal) : '-'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>{p ? won(p.netPay) : '-'}</td>
                <td style={{ textAlign: 'center' }}>
                  {p ? <span style={{ color: p.status === 'CONFIRMED' ? '#1c7c3c' : '#8a929c' }}>{p.statusName}</span> : <span style={{ color: '#c9ced6' }}>미작성</span>}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {!p ? (
                    <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => calc(e)}>계산</button>
                  ) : p.status === 'DRAFT' ? (
                    <div style={{ display: 'inline-flex', gap: 3 }}>
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => confirm(p)}>확정</button>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(p)}>삭제</button>
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
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={6} style={{ textAlign: 'right' }}>합계 (작성 {payslips.length}건)</td>
            <td style={{ textAlign: 'right' }}>{won(totals.gross)}</td>
            <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(totals.deduction)}</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{won(totals.net)}</td>
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
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>급여명세서 · {p.employeeName} ({p.payMonth})</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          <table className="w-full text-left" style={{ marginBottom: 12 }}>
            <tbody>
              <tr><th style={{ width: 90, background: '#f5f7fa' }}>사번</th><td>{p.employeeCode}</td><th style={{ width: 90, background: '#f5f7fa' }}>부서</th><td>{p.department}</td></tr>
              <tr><th style={{ background: '#f5f7fa' }}>귀속월</th><td>{p.payMonth}</td><th style={{ background: '#f5f7fa' }}>상태</th><td style={{ color: p.status === 'CONFIRMED' ? '#1c7c3c' : '#8a929c', fontWeight: 700 }}>{p.statusName}</td></tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1a4d8f', marginBottom: 4 }}>지급</div>
              <table className="w-full text-left">
                <tbody>
                  <tr><td>기본급</td><td style={{ textAlign: 'right' }}>{won(p.baseSalary)}</td></tr>
                  {allowances.map((l) => <tr key={l.id}><td>{l.name}</td><td style={{ textAlign: 'right' }}>{won(l.amount)}</td></tr>)}
                  <tr style={{ fontWeight: 700, background: '#f7f9fb' }}><td>지급총액</td><td style={{ textAlign: 'right' }}>{won(p.grossPay)}</td></tr>
                </tbody>
              </table>
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: '#a5561b', marginBottom: 4 }}>공제 (4대보험 자동)</div>
              <table className="w-full text-left">
                <tbody>
                  {deductions.map((l) => <tr key={l.id}><td>{l.name}{l.auto && <span style={{ fontSize: 10, color: '#9aa1ab', marginLeft: 4 }}>자동</span>}</td><td style={{ textAlign: 'right' }}>{won(l.amount)}</td></tr>)}
                  <tr style={{ fontWeight: 700, background: '#f7f9fb' }}><td>공제총액</td><td style={{ textAlign: 'right' }}>{won(p.deductionTotal)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 14, padding: '14px 18px', border: '1px solid var(--ec-border)', background: '#f4faf5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, color: '#1c6b32' }}>실지급액 (지급총액 − 공제총액)</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#2f8401' }}>{won(p.netPay)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

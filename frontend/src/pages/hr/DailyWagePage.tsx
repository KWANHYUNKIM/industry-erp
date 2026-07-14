import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { DailyWork, DailyWorkSummary, EmployeeMaster } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const thisMonth = () => new Date().toISOString().slice(0, 7)
const today = () => new Date().toISOString().slice(0, 10)

/**
 * 관리 > 일용근로급여관리 — 출역(근무일) 단위 등록과 월별 급여대장.
 * 일용근로소득세는 (일당 − 15만원) × 2.7%, 1,000원 미만은 소액부징수로 0원.
 */
export default function DailyWagePage() {
  const [month, setMonth] = useState(thisMonth())
  const [data, setData] = useState<DailyWorkSummary | null>(null)
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load(m = month) {
    setError('')
    setSelected([])
    try {
      const [d, e] = await Promise.all([
        api.get<DailyWorkSummary>('/daily-works', { params: { month: m } }),
        api.get<EmployeeMaster[]>('/employees'),
      ])
      setData(d.data)
      setEmployees(e.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load(month) }, [month])

  const rows = data?.rows ?? []
  const unpaid = useMemo(() => rows.filter((r) => !r.paid), [rows])

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function pay() {
    if (selected.length === 0) return
    const total = rows.filter((r) => selected.includes(r.id)).reduce((a, r) => a + r.netPay, 0)
    if (!window.confirm(`선택한 ${selected.length}건을 지급 처리할까요?\n실지급액 합계: ${won(total)}원`)) return
    try {
      await api.post('/daily-works/pay', { ids: selected, paidDate: today() })
      flash(`${selected.length}건 지급 완료`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function remove(r: DailyWork) {
    if (!window.confirm(`${r.employeeName} ${r.workDate} 출역을 삭제할까요?`)) return
    try {
      await api.delete(`/daily-works/${r.id}`)
      flash('출역을 삭제했습니다.')
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="일용근로급여관리" actions={[{ label: '새로고침', onClick: () => load() }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <label style={{ fontSize: 12.5 }}>귀속월</label>
        <input type="month" className="ec-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 140 }} />
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 출역 등록(F2)</button>
        <button className="ec-btn" onClick={pay} disabled={selected.length === 0}>
          지급 처리{selected.length > 0 ? ` (${selected.length})` : ''}
        </button>
        <span style={{ marginLeft: 4, fontSize: 12, color: '#9aa1ab' }}>
          일용근로소득세 = (일당 − 15만원) × 2.7%, 1,000원 미만은 소액부징수(0원).
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <Box label="인원 / 출역일수" value={`${data?.headcount ?? 0}명 / ${data?.workDays ?? 0}일`} color="var(--ec-blue-dark)" bg="#f7f9fb" />
        <Box label="일당 합계" value={`${won(data?.totalWage ?? 0)} 원`} color="var(--ec-blue)" bg="#f7f9ff" />
        <Box label="원천징수 (소득세+지방세)" value={`${won((data?.totalIncomeTax ?? 0) + (data?.totalLocalIncomeTax ?? 0))} 원`} color="#c60a2e" bg="#fdf6f6" />
        <Box label="미지급 실지급액" value={`${won(data?.unpaidNetPay ?? 0)} 원`} color="#2f8401" bg="#f4faf5" />
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 30, textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={unpaid.length > 0 && selected.length === unpaid.length}
                onChange={(e) => setSelected(e.target.checked ? unpaid.map((r) => r.id) : [])}
              />
            </th>
            <th>근무일</th>
            <th>사번</th>
            <th>성명</th>
            <th>부서</th>
            <th style={{ textAlign: 'center' }}>시간</th>
            <th style={{ textAlign: 'right' }}>일당</th>
            <th style={{ textAlign: 'right' }}>소득세</th>
            <th style={{ textAlign: 'right' }}>지방소득세</th>
            <th style={{ textAlign: 'right' }}>실지급액</th>
            <th style={{ textAlign: 'center' }}>지급</th>
            <th style={{ textAlign: 'center', width: 50 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>{month} 출역 기록이 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id} style={{ background: selected.includes(r.id) ? '#eef5ff' : undefined }}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} disabled={r.paid} />
              </td>
              <td>{r.workDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.employeeCode}</td>
              <td style={{ fontWeight: 600 }}>{r.employeeName}</td>
              <td>{r.department || '-'}</td>
              <td style={{ textAlign: 'center' }}>{r.workHours}h</td>
              <td style={{ textAlign: 'right' }}>{won(r.dailyWage)}</td>
              <td style={{ textAlign: 'right', color: r.incomeTax > 0 ? '#c60a2e' : '#c3c8cf' }}>{won(r.incomeTax)}</td>
              <td style={{ textAlign: 'right', color: r.localIncomeTax > 0 ? '#c60a2e' : '#c3c8cf' }}>{won(r.localIncomeTax)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.netPay)}</td>
              <td style={{ textAlign: 'center' }}>
                {r.paid
                  ? <span style={{ color: '#1c7c3c' }}>지급 {r.paidDate}</span>
                  : <span style={{ color: '#8a929c' }}>미지급</span>}
              </td>
              <td style={{ textAlign: 'center' }}>
                {!r.paid && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(r)}>삭제</button>}
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={6} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계 ({data?.workDays}일)</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right' }}>{won(data?.totalWage ?? 0)}</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#c60a2e' }}>{won(data?.totalIncomeTax ?? 0)}</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#c60a2e' }}>{won(data?.totalLocalIncomeTax ?? 0)}</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right' }}>{won(data?.totalNetPay ?? 0)}</td>
              <td colSpan={2} style={{ border: '1px solid var(--ec-border)' }}></td>
            </tr>
          </tfoot>
        )}
      </table>

      {showForm && (
        <DailyWorkForm
          employees={employees}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('출역을 등록했습니다.'); load() }}
        />
      )}
    </EcListShell>
  )
}

function Box({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: bg, padding: '10px 14px' }}>
      <div style={{ fontSize: 12, color: '#5a626e' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function DailyWorkForm({ employees, onClose, onSaved }: {
  employees: EmployeeMaster[]
  onClose: () => void
  onSaved: () => void
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [workDate, setWorkDate] = useState(today())
  const [dailyWage, setDailyWage] = useState('150000')
  const [workHours, setWorkHours] = useState('8')
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 화면에서도 같은 식으로 세액을 미리 보여준다 (확정 계산은 서버가 한다)
  const wage = Number(dailyWage) || 0
  const taxable = Math.max(wage - 150_000, 0)
  const rawTax = Math.floor(taxable * 0.027)
  const incomeTax = rawTax < 1000 ? 0 : rawTax
  const localTax = Math.floor(incomeTax * 0.1)
  const net = wage - incomeTax - localTax

  async function save() {
    setError('')
    if (!employeeId) return setError('사원을 선택하세요.')
    if (wage <= 0) return setError('일당을 입력하세요.')
    setSaving(true)
    try {
      await api.post('/daily-works', {
        employeeId: Number(employeeId),
        workDate,
        dailyWage: wage,
        workHours: Number(workHours) || 8,
        remark: remark.trim() || null,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 520, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>일용직 출역 등록</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>사원<span style={{ color: '#c60a2e' }}>*</span></th>
                <td colSpan={3}>
                  <select className="ec-input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={{ width: 240 }}>
                    <option value="">재직 사원 선택</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.code} {e.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>근무일</th>
                <td><input type="date" className="ec-input" value={workDate} onChange={(e) => setWorkDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={{ width: 80, background: '#f5f7fa' }}>근무시간</th>
                <td><input className="ec-input" type="number" value={workHours} onChange={(e) => setWorkHours(e.target.value)} style={{ width: 70, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>일당<span style={{ color: '#c60a2e' }}>*</span></th>
                <td colSpan={3}><input className="ec-input" type="number" value={dailyWage} onChange={(e) => setDailyWage(e.target.value)} style={{ width: 150, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>비고</th>
                <td colSpan={3}><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 10, padding: 10, background: '#f7f9fb', border: '1px solid var(--ec-border)', fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>과세대상 (일당 − 15만원)</span><span>{won(taxable)} 원</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c60a2e' }}>
              <span>소득세 (2.7%){incomeTax === 0 && taxable > 0 ? ' · 소액부징수' : ''}</span><span>− {won(incomeTax)} 원</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c60a2e' }}>
              <span>지방소득세 (소득세의 10%)</span><span>− {won(localTax)} 원</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '1px solid var(--ec-border)', marginTop: 6, paddingTop: 6 }}>
              <span>실지급액</span><span style={{ color: 'var(--ec-blue-dark)' }}>{won(net)} 원</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

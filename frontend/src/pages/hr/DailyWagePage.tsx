import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { BankAccountRow, DailyWork, DailyWorkSummary, EmployeeMaster } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const won = (n: number) => n.toLocaleString('ko-KR')
const thisMonth = () => ymd(new Date()).slice(0, 7)
const today = () => ymd(new Date())

/**
 * 관리 > 일용근로급여관리 — 출역(근무일) 단위 등록과 월별 급여대장.
 * 일용근로소득세는 (일당 − 15만원) × 2.7%, 1,000원 미만은 소액부징수로 0원.
 */
export default function DailyWagePage() {
  const [month, setMonth] = useState(thisMonth())
  const [data, setData] = useState<DailyWorkSummary | null>(null)
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [accounts, setAccounts] = useState<BankAccountRow[]>([])
  /** 지급수단 — '' 이면 현금. 지급하면 차)잡급 / 대)예수금·현금(또는 계좌) 분개가 생긴다(QA 69회차). */
  const [payAccountId, setPayAccountId] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load(m = month) {
    setError('')
    setSelected([])
    try {
      const [d, e, b] = await Promise.all([
        api.get<DailyWorkSummary>('/daily-works', { params: { month: m } }),
        api.get<EmployeeMaster[]>('/employees'),
        api.get<BankAccountRow[]>('/bank-cards/accounts'),
      ])
      setData(d.data)
      setEmployees(e.data)
      setAccounts(b.data.filter((a) => a.active))
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
    const via = accounts.find((a) => String(a.id) === payAccountId)
    const viaText = via ? `${via.bankName} ${via.accountNo}` : '현금'
    if (!window.confirm(`선택한 ${selected.length}건을 지급 처리할까요?\n실지급액 합계: ${won(total)}원 (${viaText})\n회계전표: 차)잡급 / 대)예수금·${via ? '예금' : '현금'}`)) return
    try {
      await api.post('/daily-works/pay', { ids: selected, paidDate: today(), bankAccountId: via ? via.id : null })
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
      <div className="flex items-center gap-[6px] mb-[8px]">
        <label className="text-[12.5px]">귀속월</label>
        <input type="month" className="ec-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 140 }} />
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 출역 등록(F2)</button>
        <select className="ec-input" value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)} style={{ width: 170 }} title="지급수단">
          <option value="">현금 지급</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} {a.accountNo}</option>)}
        </select>
        <button className="ec-btn" onClick={pay} disabled={selected.length === 0}>
          지급 처리{selected.length > 0 ? ` (${selected.length})` : ''}
        </button>
        <span className="ml-[4px] text-[12px] text-ec-hint">
          일용근로소득세 = (일당 − 15만원) × 2.7%, 1,000원 미만은 소액부징수(0원).
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <div className="flex gap-[10px] mb-[10px]">
        <Box label="인원 / 출역일수" value={`${data?.headcount ?? 0}명 / ${data?.workDays ?? 0}일`} color="var(--ec-blue-dark)" bg="var(--ec-bg-page)" />
        <Box label="일당 합계" value={`${won(data?.totalWage ?? 0)} 원`} color="var(--ec-blue)" bg="var(--ec-blue-wash)" />
        <Box label="원천징수 (소득세+지방세)" value={`${won((data?.totalIncomeTax ?? 0) + (data?.totalLocalIncomeTax ?? 0))} 원`} color="var(--ec-danger)" bg="var(--ec-danger-bg)" />
        <Box label="미지급 실지급액" value={`${won(data?.unpaidNetPay ?? 0)} 원`} color="#2f8401" bg="var(--ec-success-bg)" />
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[30px] text-center">
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
            <th className="text-center">시간</th>
            <th className="text-right">일당</th>
            <th className="text-right">소득세</th>
            <th className="text-right">지방소득세</th>
            <th className="text-right">실지급액</th>
            <th className="text-center">지급</th>
            <th className="text-center w-[50px]"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id} style={{ background: selected.includes(r.id) ? 'var(--ec-blue-wash)' : undefined }}>
              <td className="text-center">
                <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} disabled={r.paid} />
              </td>
              <td>{dateText(r.workDate)}</td>
              <td>{r.employeeCode}</td>
              <td className="font-semibold">{r.employeeName}</td>
              <td>{r.department || ''}</td>
              <td className="text-center">{r.workHours}h</td>
              <td className="text-right">{won(r.dailyWage)}</td>
              <td style={{ textAlign: 'right', color: r.incomeTax > 0 ? 'var(--ec-danger)' : 'var(--ec-text-off)' }}>{won(r.incomeTax)}</td>
              <td style={{ textAlign: 'right', color: r.localIncomeTax > 0 ? 'var(--ec-danger)' : 'var(--ec-text-off)' }}>{won(r.localIncomeTax)}</td>
              <td className="text-right font-bold">{won(r.netPay)}</td>
              <td className="text-center">
                {r.paid
                  ? <span style={{ color: 'var(--ec-success)' }} title={r.journalNo ? `회계전표 ${r.journalNo}` : undefined}>지급 {r.paidDate}{r.journalNo ? ` · ${r.journalNo}` : ''}</span>
                  : <span className="text-ec-hint">미지급</span>}
              </td>
              <td className="text-center">
                {!r.paid && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => remove(r)}>삭제</button>}
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={6} className="border border-ec-line border-solid py-[5px] px-[8px]">합계 ({data?.workDays}일)</td>
              <td className="border border-ec-line border-solid py-[5px] px-[8px] text-right">{won(data?.totalWage ?? 0)}</td>
              <td className="border border-ec-line border-solid py-[5px] px-[8px] text-right text-ec-danger">{won(data?.totalIncomeTax ?? 0)}</td>
              <td className="border border-ec-line border-solid py-[5px] px-[8px] text-right text-ec-danger">{won(data?.totalLocalIncomeTax ?? 0)}</td>
              <td className="border border-ec-line border-solid py-[5px] px-[8px] text-right">{won(data?.totalNetPay ?? 0)}</td>
              <td colSpan={2} className="border border-ec-line border-solid"></td>
            </tr>
          </tfoot>
        )}
      </table>

      <Modal error={error} open={showForm} title="일용근로급여 등록" onClose={() => setShowForm(false)}>{(
        <DailyWorkForm
          employees={employees}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('출역을 등록했습니다.'); load() }}
        />
      )}</Modal>
    </EcListShell>
  )
}

function Box({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: bg, padding: '10px 14px' }}>
      <div className="text-[12px] text-ec-label">{label}</div>
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
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">일용직 출역 등록</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th className="w-[90px] bg-ec-page">사원<span className="text-ec-danger">*</span></th>
                <td colSpan={3}>
                  {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */}
                  <CodePickerField label="사원" hideLabel width={240} placeholder="사원" emptyLabel="선택 해제"
                                   value={employeeId} onChange={setEmployeeId}
                                   items={employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name, sub: e.department || null }))} />
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">근무일</th>
                <td><input type="date" className="ec-input" value={workDate} onChange={(e) => setWorkDate(e.target.value)} style={{ width: 150 }} /></td>
                <th className="w-[80px] bg-ec-page">근무시간</th>
                <td><input className="ec-input" type="number" value={workHours} onChange={(e) => setWorkHours(e.target.value)} style={{ width: 70, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">일당<span className="text-ec-danger">*</span></th>
                <td colSpan={3}><input className="ec-input" type="number" value={dailyWage} onChange={(e) => setDailyWage(e.target.value)} style={{ width: 150, textAlign: 'right' }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">비고</th>
                <td colSpan={3}><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>

          <div className="mt-[10px] p-[10px] bg-ec-page border border-ec-line border-solid text-[12.5px]">
            <div className="flex justify-between">
              <span>과세대상 (일당 − 15만원)</span><span>{won(taxable)} 원</span>
            </div>
            <div className="flex justify-between text-ec-danger">
              <span>소득세 (2.7%){incomeTax === 0 && taxable > 0 ? ' · 소액부징수' : ''}</span><span>− {won(incomeTax)} 원</span>
            </div>
            <div className="flex justify-between text-ec-danger">
              <span>지방소득세 (소득세의 10%)</span><span>− {won(localTax)} 원</span>
            </div>
            <div className="flex justify-between font-extrabold border-t border-t-ec-line border-solid mt-[6px] pt-[6px]">
              <span>실지급액</span><span className="text-ec-navy">{won(net)} 원</span>
            </div>
          </div>
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../utils/periods'

interface Ledger { id: number; payMonth: string; name: string; payDate: string; headcount: number; grossTotal: number; confirmedCount: number }

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
 * 우리는 사원 · 귀속월에 명세가 하나라 대장도 귀속월에 하나다(원본은 -1, -2 …) — 신고귀속은 늘 '-1'.
 * 급여구분은 '급여', 지급구분은 '1차수' 하나다(상여 · 차수가 없다). 사전작업(근무기록확정 · 금액직접입력) ·
 * 개인별계산 · 일괄수정 · 명세서 Email · 상여지급률은 아직 없다.
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
            <th className="text-center">급여계산</th>
            <th className="text-right">인원수</th>
            <th className="text-center">급여대장</th>
            <th className="text-right">지급총액</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((l) => (
            <tr key={l.id}>
              <td>{slash(l.payMonth)} -1</td>
              <td>급여</td>
              <td>1차수</td>
              <td>{l.name}</td>
              <td className="text-center">{slash(l.payDate)}</td>
              <td className="text-center">{slash(l.payMonth)}</td>
              <td className="text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); calculate(l) }}>전체계산</a>
              </td>
              <td className="text-right">{l.headcount || ''}</td>
              <td className="text-center">
                <div className="flex flex-col items-center">
                  <a href="#" onClick={(e) => { e.preventDefault(); nav(`/hr/payroll/ledger?month=${l.payMonth}`) }}>조회</a>
                  {l.headcount > l.confirmedCount && (
                    <a href="#" onClick={(e) => { e.preventDefault(); confirm(l) }}>확정</a>
                  )}
                  <a href="#" onClick={(e) => { e.preventDefault(); remove(l) }}>삭제</a>
                </div>
              </td>
              <td className="text-right">{l.headcount ? won(l.grossTotal) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

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

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../utils/periods'

interface Ledger {
  id: number; payMonth: string; seq: number; name: string; paidMonth: string; payDate: string
  periodFrom: string; periodTo: string; confirmed: boolean; workConfirmCount: number; headcount: number; grossTotal: number
}
interface ConfirmRow { workerId: number; workerCode: string; workerName: string; lastWorkDate: string | null; department: string; days: number }
interface Line { id: number; workerCode: string; workerName: string; days: number; dailyWage: number | null; grossPay: number; incomeTax: number; localTax: number; netPay: number }

const won = (n: number) => Number(n).toLocaleString('ko-KR')
const slash = (s: string) => s.replace(/-/g, '/')
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return ymd(new Date(y, m, 0)) }

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 급여작업 &gt; <b>일용근로 급여계산/대장</b> (원본 E020139).
 *
 * <p>2026-10-03 loginaa 에서 대장을 만들고 계산 · 삭제해 본 그대로:
 * <ul>
 *   <li>목록: 귀속연월(2026/10 -1) · 지급구분 · 대장명칭 · 지급연월 · 지급일 · 원천세신고 사업자번호 · 사전작업(근무기록확정[n] ·
 *       금액직접입력) · 급여계산(전체계산 · 개인별계산) · 급여대장(조회 · 일괄수정 · 확정 · 삭제) · 명세서(조회 · Email) · 인원수.</li>
 *   <li>[신규(F2)] '급여정보입력': 귀속연월 · 지급구분(1차수) · 원천세신고 사업자번호 · 대상기간(그 달 1일 ~ 말일) · 지급일(오늘) ·
 *       지급연월 · 급여대장명칭 · 대상프로젝트. 저장하면 '2026/10 1차수 (급여)' 대장이 목록 위에 붙는다.</li>
 *   <li>근무기록확정: 사원번호 · 사원명 · 최종근무일 · 부서명 · 프로젝트 · 일근무 · 근로일수(일근무를 넣으면 같은 값). 저장하면 [n].</li>
 *   <li>전체계산: '기존 자료를 삭제하고 다시 계산합니다. 급여대장에서 직접 수정한 내역은 유지되지 않습니다. 전체 계산을 진행하시겠습니까?'
 *       (□ 지급총액 0 이하 제외 — 켜짐) → 급여대장 창: 성명 · 최종근무일 · 일근무(일수 · 금액) · 지급총액 · 소득세 · 지방소득세 ·
 *       공제총액 · 실지급액, 총합계. 일근무 150,000 × 2 → 300,000 · 세금 0 · 실지급 300,000.
 *       세금은 원본 공제등록 계산식 R( 소득세(급여지급사항) , 0 ) 대로 사원의 월정공제 금액 그대로다.</li>
 *   <li>삭제: '2026/10 -1 급여가 전체 삭제됩니다. 삭제된 급여는 복구할 수 없습니다. 삭제하겠습니까?'</li>
 * </ul>
 * [근무기록] 은 대상기간 근무입력을 사원마다 더해 채운다(저장 전까지는 창에만). 원천세신고 사업자번호 · 금액직접입력 · 개인별계산 ·
 * 일괄수정 · 명세서 · 대상프로젝트 · 프로젝트 열은 없다.
 */
export default function DailyPayLedgerPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState<Ledger[]>([])
  /** 원본 [원천세신고 사업자번호](2026-10-04 실측 220-12-34567) — 사업장이 하나라 회사정보의 사업자등록번호를 모든 대장에 찍는다. */
  const [bizRegNo, setBizRegNo] = useState('')
  const [companyName, setCompanyName] = useState('')
  useEffect(() => {
    api.get<{ name: string; bizRegNo: string | null }>('/company')
      .then((r) => { setBizRegNo(r.data.bizRegNo ?? ''); setCompanyName(r.data.name ?? '') })
      .catch(() => { setBizRegNo(''); setCompanyName('') })
  }, [])
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const today = ymd(new Date())
  const blankForm = () => ({ payMonth: today.slice(0, 7), periodFrom: `${today.slice(0, 7)}-01`, periodTo: monthEnd(today.slice(0, 7)), payDate: today, paidMonth: today.slice(0, 7), name: '' })
  const [form, setForm] = useState(blankForm())
  const [confirmFor, setConfirmFor] = useState<Ledger | null>(null)
  const [cells, setCells] = useState<ConfirmRow[]>([])
  const [confirmError, setConfirmError] = useState('')
  const [calcFor, setCalcFor] = useState<Ledger | null>(null)
  const [view, setView] = useState<{ ledger: Ledger; lines: Line[] } | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const confirmRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일용근로 급여계산/대장', [rows.length])
  useTableColumnCheck(confirmRef, '근무기록확정', [cells.length])

  function load() {
    setError('')
    api.get<Ledger[]>('/hr/daily-pay-ledgers').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  async function create() {
    setFormError('')
    try {
      await api.post('/hr/daily-pay-ledgers', { ...form, name: form.name.trim() || null })
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function openConfirm(l: Ledger) {
    setConfirmError('')
    try {
      setCells((await api.get<ConfirmRow[]>(`/hr/daily-pay-ledgers/${l.id}/work-confirms`)).data)
      setConfirmFor(l)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  async function loadEntries() {
    if (!confirmFor) return
    try {
      setCells((await api.get<ConfirmRow[]>(`/hr/daily-pay-ledgers/${confirmFor.id}/work-confirms/load`)).data)
    } catch (e) {
      setConfirmError(extractErrorMessage(e))
    }
  }
  async function saveConfirm() {
    if (!confirmFor) return
    try {
      await api.put(`/hr/daily-pay-ledgers/${confirmFor.id}/work-confirms`, cells.map((c) => ({ workerId: c.workerId, days: c.days })))
      setConfirmFor(null)
      load()
    } catch (e) {
      setConfirmError(extractErrorMessage(e))
    }
  }
  async function deleteConfirm() {
    if (!confirmFor || !window.confirm('삭제하시겠습니까?')) return
    try {
      await api.delete(`/hr/daily-pay-ledgers/${confirmFor.id}/work-confirms`)
      setConfirmFor(null)
      load()
    } catch (e) {
      setConfirmError(extractErrorMessage(e))
    }
  }

  async function openView(l: Ledger) {
    try {
      setView({ ledger: l, lines: (await api.get<Line[]>(`/hr/daily-pay-ledgers/${l.id}/lines`)).data })
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  async function calculate() {
    if (!calcFor) return
    const l = calcFor
    setCalcFor(null)
    try {
      await api.post(`/hr/daily-pay-ledgers/${l.id}/calculate`)
      load()
      openView(l)   // 원본은 계산이 끝나면 급여대장 창을 띄운다
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  async function toggleConfirmed(l: Ledger) {
    try { await api.post(`/hr/daily-pay-ledgers/${l.id}/confirm`); load() } catch (e) { setError(extractErrorMessage(e)) }
  }
  async function remove(l: Ledger) {
    if (!window.confirm(`${slash(l.payMonth)} -${l.seq} 급여가 전체 삭제됩니다.\n\n삭제된 급여는 복구할 수 없습니다.\n\n삭제하겠습니까?`)) return
    try { await api.delete(`/hr/daily-pay-ledgers/${l.id}`); load() } catch (e) { setError(extractErrorMessage(e)) }
  }

  const link = (label: string, on: () => void, active = false) => (
    <a href="#" className={active ? 'font-bold text-ec-danger' : undefined} onClick={(e) => { e.preventDefault(); on() }}>{label}</a>
  )
  const totals = view ? view.lines.reduce((s, l) => ({
    days: s.days + Number(l.days), gross: s.gross + Number(l.grossPay), tax: s.tax + Number(l.incomeTax),
    local: s.local + Number(l.localTax), net: s.net + Number(l.netPay),
  }), { days: 0, gross: 0, tax: 0, local: 0, net: 0 }) : null

  return (
    <EcListShell title="일용근로 급여계산/대장" searchable={false}
                 onNew={() => { setForm(blankForm()); setFormError(''); setFormOpen(true) }}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              <th className="text-center">귀속연월</th>
              <th>지급구분</th>
              <th>대장명칭</th>
              <th className="text-center">지급연월</th>
              <th className="text-center">지급일</th>
              <th className="text-center">원천세신고 사업자번호</th>
              <th className="text-center">사전작업</th>
              <th className="text-center">급여계산</th>
              <th className="text-center">급여대장</th>
              {/* 원본 [명세서] 조회 · Email — 조회는 그 대장의 일용근로 사원별급여조회를 연다. Email 은 바깥 발송이라 없다. */}
              <th className="text-center">명세서</th>
              <th className="text-right">인원수</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((l) => (
              <tr key={l.id}>
                <td className="text-center">{slash(l.payMonth)} -{l.seq}</td>
                <td>{l.seq}차수</td>
                <td>{l.name}</td>
                <td className="text-center">{slash(l.paidMonth)}</td>
                <td className="text-center">{slash(l.payDate)}</td>
                <td className="text-center">{bizRegNo}</td>
                <td className="text-center">{link(`근무기록확정${l.workConfirmCount ? `[${l.workConfirmCount}]` : ''}`, () => openConfirm(l), l.workConfirmCount > 0)}</td>
                <td className="text-center">{link('전체계산', () => setCalcFor(l))}</td>
                <td className="text-center">
                  <div className="flex flex-col items-center">
                    {link('조회', () => openView(l))}
                    {link(l.confirmed ? '확정취소' : '확정', () => toggleConfirmed(l))}
                    {link('삭제', () => remove(l))}
                  </div>
                </td>
                <td className="text-center">
                  {l.headcount > 0 && link('조회', () => nav(`/hr/daily-payroll/by-worker?ledger=${l.id}&month=${l.payMonth}`))}
                </td>
                <td className="text-right">{l.headcount || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal error={formError} open={formOpen} title="급여정보입력" width={720} onClose={() => setFormOpen(false)}>
        <ul className="ec-form">
          <li className="wide">
            <span className="title">귀속연월</span>
            <div className="form">
              <input type="month" className="ec-input w-[150px]" value={form.payMonth}
                     onChange={(e) => setForm({ ...form, payMonth: e.target.value, periodFrom: `${e.target.value}-01`, periodTo: monthEnd(e.target.value), paidMonth: e.target.value })} />
            </div>
          </li>
          <li className="wide"><span className="title">지급구분</span><div className="form">1차수</div></li>
          <li className="wide">
            <span className="title">대상기간</span>
            <div className="form flex items-center gap-[6px]">
              <input type="date" className="ec-input w-[150px]" value={form.periodFrom} onChange={(e) => setForm({ ...form, periodFrom: e.target.value })} />
              ~
              <input type="date" className="ec-input w-[150px]" value={form.periodTo} onChange={(e) => setForm({ ...form, periodTo: e.target.value })} />
            </div>
          </li>
          <li className="wide">
            <span className="title">지급일</span>
            <div className="form"><input type="date" className="ec-input w-[150px]" value={form.payDate} onChange={(e) => setForm({ ...form, payDate: e.target.value })} /></div>
          </li>
          <li className="wide">
            <span className="title">지급연월</span>
            <div className="form"><input type="month" className="ec-input w-[150px]" value={form.paidMonth} onChange={(e) => setForm({ ...form, paidMonth: e.target.value })} /></div>
          </li>
          <li className="wide">
            <span className="title">급여대장명칭</span>
            <div className="form"><input className="ec-input w-full" placeholder="급여대장명칭" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </li>
        </ul>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={create}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal error={confirmError} open={!!confirmFor} title="근무기록확정" width={900} onClose={() => setConfirmFor(null)}>
        <div className="flex items-center gap-[6px] mb-[8px]">
          <button type="button" className="ec-btn ec-btn-sm" onClick={loadEntries}>근무기록</button>
          <span className="text-ec-hint">{confirmFor ? `${slash(confirmFor.periodFrom)} ~ ${slash(confirmFor.periodTo)}` : ''}</span>
        </div>
        <table ref={confirmRef} className="w-full text-left">
          <thead>
            <tr>
              <th>사원번호</th>
              <th>사원명</th>
              <th className="text-center">최종근무일</th>
              <th>부서명</th>
              <th className="w-[120px] text-right">일근무</th>
              <th className="w-[120px] text-right">근로일수</th>
            </tr>
          </thead>
          <tbody>
            {cells.length === 0 ? (
              <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : cells.map((c, i) => (
              <tr key={c.workerId}>
                <td>{c.workerCode}</td>
                <td>{c.workerName}</td>
                <td className="text-center">{c.lastWorkDate ? slash(c.lastWorkDate) : ''}</td>
                <td>{c.department}</td>
                <td>
                  <input className="ec-input w-full text-right" inputMode="decimal" value={c.days ? String(c.days) : ''}
                         onChange={(e) => setCells(cells.map((x, j) => (j === i ? { ...x, days: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 } : x)))} />
                </td>
                <td className="text-right">{c.days ? Number(c.days).toFixed(2) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={saveConfirm}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmFor(null)}>닫기</button>
          <button type="button" className="ec-btn" onClick={deleteConfirm}>삭제</button>
        </div>
      </Modal>

      <Modal error={error} open={!!calcFor} title="알림" width={560} onClose={() => setCalcFor(null)}>
        <p>기존 자료를 삭제하고 다시 계산합니다.</p>
        <p className="my-[8px]">급여대장에서 직접 수정한 내역은 유지되지 않습니다.</p>
        <p>전체 계산을 진행하시겠습니까?</p>
        <label className="flex items-center gap-[6px] my-[12px]">
          <input type="checkbox" checked readOnly /> 지급총액 0 이하 제외
        </label>
        <div className="flex gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={calculate}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setCalcFor(null)}>닫기</button>
        </div>
      </Modal>

      <Modal error={error} open={!!view} title="급여대장" width={980} onClose={() => setView(null)}>
        {view && totals && (
          <>
            {/*
              원본 급여대장(2026-10-04 실측): 가운데 '2026/07 1차수 (급여)', 왼쪽 회사명, 오른쪽 인원수 · 지급연월. 사원마다 두 줄(성명 / 주민등록번호),
              열 최종근무일 · 일근무(일수 | 금액) · 지급총액 · 공제(전체 — 소득세 / 지방소득세를 위아래로) · 공제총액 · 실지급액, 끝에 총합계.
              우리 대장 줄에는 최종근무일 · 주민등록번호가 없어 그 칸은 비워 둔다.
            */}
            <div className="text-center font-bold text-[18px] mb-[4px]">{view.ledger.name}</div>
            <div className="flex justify-between items-end mb-[4px]">
              <span>회사명 : {companyName}</span>
              <span className="text-right">인원수 : {view.lines.length}<br />지급연월 : {slash(view.ledger.paidMonth)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="ec-report w-full">
                <thead>
                  <tr>
                    <th>성명</th>
                    <th rowSpan={2}>최종근무일</th>
                    <th colSpan={2}>일근무</th>
                    <th rowSpan={2}>지급총액</th>
                    <th>공제(전체)</th>
                    <th rowSpan={2}>공제총액</th>
                    <th rowSpan={2}>실지급액</th>
                  </tr>
                  <tr>
                    <th>주민등록번호</th>
                    <th></th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {view.lines.length === 0 ? (
                    <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                  ) : view.lines.flatMap((l) => [
                    <tr key={`${l.id}-a`}>
                      <td>{l.workerName}</td>
                      <td rowSpan={2} className="text-center"></td>
                      <td className="text-right">{Number(l.days)}</td>
                      <td className="text-right">{won(l.grossPay)}</td>
                      <td rowSpan={2} className="text-right">{won(l.grossPay)}</td>
                      <td className="text-right">{Number(l.incomeTax) ? won(l.incomeTax) : ''}</td>
                      <td rowSpan={2} className="text-right">{Number(l.incomeTax) + Number(l.localTax) ? won(Number(l.incomeTax) + Number(l.localTax)) : ''}</td>
                      <td rowSpan={2} className="text-right">{won(l.netPay)}</td>
                    </tr>,
                    <tr key={`${l.id}-b`}>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td className="text-right">{Number(l.localTax) ? won(l.localTax) : ''}</td>
                    </tr>,
                  ])}
                  <tr className="font-bold">
                    <td colSpan={2} className="text-center">총합계</td>
                    <td className="text-right">{totals.days || ''}</td>
                    <td className="text-right">{won(totals.gross)}</td>
                    <td className="text-right">{won(totals.gross)}</td>
                    <td className="text-right">{totals.tax + totals.local ? won(totals.tax + totals.local) : ''}</td>
                    <td className="text-right">{totals.tax + totals.local ? won(totals.tax + totals.local) : ''}</td>
                    <td className="text-right">{won(totals.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex gap-[6px] mt-[12px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
              <button type="button" className="ec-btn">Excel</button>
              <button type="button" className="ec-btn" onClick={() => setView(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>
    </EcListShell>
  )
}

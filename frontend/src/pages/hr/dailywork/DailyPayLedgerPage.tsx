import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../../components/EcListShell'
import Modal from '../../../components/Modal'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import { ymd } from '../../../utils/periods'
import DailyDirectAmount, { type DailyWorkerRow } from '../../../features/dailypay/components/DailyDirectAmount'
import DailyPayBulkEdit, { type DailyPayLineRow } from '../../../features/dailypay/components/DailyPayBulkEdit'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import EcDateInput, { EcDateRange } from '../../../components/ui/EcDateInput'
import { fmtNumberOf } from '../../../utils/format'

interface Ledger {
  id: number; payMonth: string; seq: number; name: string; paidMonth: string; payDate: string
  periodFrom: string; periodTo: string; confirmed: boolean; workConfirmCount: number; headcount: number; grossTotal: number
  directAmountCount: number
}
interface ConfirmRow {
  workerId: number; workerCode: string; workerName: string; lastWorkDate: string | null; department: string; days: number; amount: number; workDays: number | null
  items: { itemId: number; days: number; amount?: number | null }[]
}
/** 일용근로 수당등록에서 더한 변동 수당 — 근무기록확정 창에 열 하나씩(원본 2026-10-21 '일근무 | QA관리-야간 | 근로일수'). */
interface PayItem { id: number; name: string; payMethod: string | null; builtin: boolean }
type Line = DailyPayLineRow
type LineItem = NonNullable<Line['items']>[number]
/** 대장 줄들에 나온 항목(수당 · 공제) — 표시순서대로 열이 된다. */
function itemColumns(lines: Line[], kind: 'ALLOWANCE' | 'DEDUCTION') {
  const seen = new Map<number, LineItem>()
  for (const l of lines) for (const i of l.items ?? []) if (i.kind === kind && !seen.has(i.itemId)) seen.set(i.itemId, i)
  return [...seen.values()].sort((a, b) => a.sortOrder - b.sortOrder || (a.code < b.code ? -1 : 1))
}
interface Slot { itemId: number | null; name: string }
const itemOf = (l: Line, id: number) => (l.items ?? []).find((i) => i.itemId === id)

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
 *   <li>근무기록확정: 사원번호 · 사원명 · 최종근무일 · 부서명 · 프로젝트 · 일근무 · (숨은 일근무 금액) · 근로일수. 저장하면 [n].
 *       2026-10-14 다시 잼: [근무기록] 은 '일별근무기록불러오기' 창(⊙ 입력한 근무기록이 나타나지 않는 경우 · 수당명 ( 근무기록방법 ) '일근무 (일)'
 *       체크 · [적용] [닫기]) → [적용] '해당 항목에 이미 등록된 근무기록자료는 삭제된 후 불러온 근태관리자료로 대체됩니다. 진행 하겠습니까?'
 *       → 잠깐만 1 · 1 · 0.5 · 1 · 1 이 일근무 4.50 · 근로일수 <b>5.00</b>(근무한 날의 수) · 숨은 일근무 금액 675,000, 근무 없는 사원은 빈칸.
 *       저장하면 근로일수도 남는다(다시 열어도 5.00).</li>
 *   <li>전체계산: '기존 자료를 삭제하고 다시 계산합니다. 급여대장에서 직접 수정한 내역은 유지되지 않습니다. 전체 계산을 진행하시겠습니까?'
 *       (□ 지급총액 0 이하 제외 — 켜짐) → 급여대장 창: 성명 · 최종근무일 · 일근무(일수 · 금액) · 지급총액 · 소득세 · 지방소득세 ·
 *       공제총액 · 실지급액, 총합계. 일근무 150,000 × 2 → 300,000 · 세금 0 · 실지급 300,000.
 *       세금은 원본 공제등록 계산식 R( 소득세(급여지급사항) , 0 ) 대로 사원의 월정공제 금액 그대로다.</li>
 *   <li>삭제: '2026/10 -1 급여가 전체 삭제됩니다. 삭제된 급여는 복구할 수 없습니다. 삭제하겠습니까?'</li>
 * </ul>
 * [근무기록] 은 대상기간 근무입력을 사원마다 더해 채운다(저장 전까지는 창에만).
 * 2026-10-12 실측으로 더한 것: [개인별계산](일용근로 사원 목록에서 체크한 사원만 지우고 다시 셈 → 급여대장 창, 확인 창
 * '선택한 사원의 기존 자료를 삭제하고 다시 계산합니다 … 개인별 계산을 진행하겠습니까?' + 지급총액 0 이하 제외),
 * [금액직접입력[n]](features/dailypay DailyDirectAmount), 급여대장 [일괄수정](DailyPayBulkEdit). 직접입력으로 셈한 일근무 칸은
 * 원본처럼 모서리에 붉은 표시가 붙는다. 대상프로젝트 · 프로젝트 열 · 명세서 Email 은 없다.
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
  const [confirmItems, setConfirmItems] = useState<PayItem[]>([])
  useEffect(() => {
    api.get<PayItem[]>('/hr/daily-pay-items', { params: { kind: 'ALLOWANCE' } })
      .then((r) => setConfirmItems(r.data.filter((i) => !i.builtin && i.payMethod !== '고정')))
      .catch(() => setConfirmItems([]))
  }, [])
  const cellDays = (c: ConfirmRow, id: number) => c.items?.find((x) => x.itemId === id)?.days ?? 0
  const cellAmt = (c: ConfirmRow, id: number) => c.items?.find((x) => x.itemId === id)?.amount ?? null
  /** 원본(2026-10-21): [근무기록] 으로 불러온 창은 0 을 '0.00' · 금액 '0' 으로, 저장 뒤 다시 연 창은 0 을 빈칸으로 보인다. */
  const [loaded, setLoaded] = useState(false)
  /** 근무기록 칸 — 고치는 동안만 친 글자, 아니면 '4.00' 꼴 */
  const [numFocus, setNumFocus] = useState('')
  const dayText = (key: string, n: number) => (numFocus === key ? (n ? String(n) : '') : n ? Number(n).toFixed(2) : loaded ? '0.00' : '')
  /** 근로일수 칸 — 고치는 동안만 친 글자, 아니면 '1.00' 꼴(원본) */
  const [wdFocus, setWdFocus] = useState<number | null>(null)
  const [confirmError, setConfirmError] = useState('')
  const [loadAsk, setLoadAsk] = useState(false)
  const [calcAsk, setCalcAsk] = useState<{ ledger: Ledger; ids: number[] | null } | null>(null)
  const [excludeZero, setExcludeZero] = useState(true)
  const [pickFor, setPickFor] = useState<Ledger | null>(null)
  const [pickWorkers, setPickWorkers] = useState<DailyWorkerRow[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [pickQuery, setPickQuery] = useState('')
  const [pickError, setPickError] = useState('')
  const [directFor, setDirectFor] = useState<Ledger | null>(null)
  const [bulkFor, setBulkFor] = useState<Ledger | null>(null)
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
      setLoaded(false)
      setConfirmFor(l)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  async function loadEntries() {
    if (!confirmFor) return
    try {
      setCells((await api.get<ConfirmRow[]>(`/hr/daily-pay-ledgers/${confirmFor.id}/work-confirms/load`)).data)
      setLoaded(true)
    } catch (e) {
      setConfirmError(extractErrorMessage(e))
    }
  }
  async function saveConfirm() {
    if (!confirmFor) return
    try {
      await api.put(`/hr/daily-pay-ledgers/${confirmFor.id}/work-confirms`, cells.map((c) => ({ workerId: c.workerId, days: c.days, workDays: c.workDays, items: c.items ?? [] })))
      setConfirmFor(null)
      load()
    } catch (e) {
      setConfirmError(extractErrorMessage(e))
    }
  }
  async function deleteConfirm() {
    if (!confirmFor || !(await ecConfirm('삭제하시겠습니까?'))) return
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
      /* 급여대장 줄은 성명 순(원본 2026-10-14: QA관리-순서 00000 · 나일당 00002 · 잠깐만 00001) — 글자 코드 순 */
      const lines = (await api.get<Line[]>(`/hr/daily-pay-ledgers/${l.id}/lines`)).data
      setView({ ledger: l, lines: [...lines].sort((a, b) => (a.workerName < b.workerName ? -1 : a.workerName > b.workerName ? 1 : 0)) })
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  async function openPick(l: Ledger) {
    setPickError(''); setPicked(new Set()); setPickQuery(''); setPickFor(l)
    try {
      const r = await api.get<DailyWorkerRow[]>('/hr/daily-workers')
      setPickWorkers([...r.data].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)))
    } catch (e) {
      setPickError(extractErrorMessage(e))
    }
  }
  const pickRows = pickWorkers.filter((w) => !pickQuery || [w.code, w.name, w.department ?? ''].some((v) => v.includes(pickQuery)))
  function askPicked() {
    if (!pickFor) return
    if (picked.size === 0) { void ecAlert('선택된 사원이 없습니다.\n\n계산처리할 사원에 체크한 후 다시 시도 바랍니다.'); return }
    setExcludeZero(true)
    setCalcAsk({ ledger: pickFor, ids: [...picked] })
  }
  async function calculate() {
    if (!calcAsk) return
    const { ledger: l, ids } = calcAsk
    setCalcAsk(null)
    try {
      await api.post(`/hr/daily-pay-ledgers/${l.id}/calculate`, { workerIds: ids, excludeNonPositive: excludeZero })
      setPickFor(null)
      load()
      openView(l)   // 원본은 계산이 끝나면(전체 · 개인별) 급여대장 창을 띄운다
    } catch (e) {
      if (ids) setPickError(extractErrorMessage(e)); else setError(extractErrorMessage(e))
    }
  }
  async function toggleConfirmed(l: Ledger) {
    try { await api.post(`/hr/daily-pay-ledgers/${l.id}/confirm`); load() } catch (e) { setError(extractErrorMessage(e)) }
  }
  async function remove(l: Ledger) {
    if (!(await ecConfirm(`${slash(l.payMonth)} -${l.seq} 급여가 전체 삭제됩니다.\n\n삭제된 급여는 복구할 수 없습니다.\n\n삭제하겠습니까?`))) return
    try { await api.delete(`/hr/daily-pay-ledgers/${l.id}`); load() } catch (e) { setError(extractErrorMessage(e)) }
  }

  const link = (label: string, on: () => void, active = false) => (
    <a href="#" className={active ? 'font-bold text-ec-danger' : undefined} onClick={(e) => { e.preventDefault(); on() }}>{label}</a>
  )
  const totals = view ? view.lines.reduce((s, l) => ({
    days: s.days + Number(l.days), gross: s.gross + Number(l.grossPay), tax: s.tax + Number(l.incomeTax),
    local: s.local + Number(l.localTax), net: s.net + Number(l.netPay),
    dayPay: s.dayPay + Number(l.dayPay ?? l.grossPay), ded: s.ded + Number(l.deductionTotal ?? Number(l.incomeTax) + Number(l.localTax)),
  }), { days: 0, gross: 0, tax: 0, local: 0, net: 0, dayPay: 0, ded: 0 }) : null
  const allowCols = view ? itemColumns(view.lines, 'ALLOWANCE') : []
  const dedCols = view ? itemColumns(view.lines, 'DEDUCTION') : []
  /** 소득세 · 지방소득세 칸('공제(전체)') — 더한 공제만 있고 세금이 모두 0 이면 원본처럼 그 항목 열만 둔다(2026-10-21). */
  const taxCol = !!totals && (dedCols.length === 0 || totals.tax + totals.local !== 0)
  /** 대장 수당 칸 — 일근무(itemId null) 다음 더한 수당, 두 개씩 한 줄(원본 2026-10-21). */
  const slots: Slot[] = [{ itemId: null, name: '일근무' }, ...allowCols.map((c) => ({ itemId: c.itemId, name: c.name }))]
  const slotRows: (Slot | null)[][] = []
  for (let k = 0; k < slots.length; k += 2) slotRows.push([slots[k], slots[k + 1] ?? null])
  const itemSum = (id: number, f: (i: LineItem) => number) => (view?.lines ?? []).reduce((s, l) => s + (itemOf(l, id) ? f(itemOf(l, id)!) : 0), 0)

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
                <td className="text-center">
                  <div className="flex flex-col items-center">
                    {link(`근무기록확정${l.workConfirmCount ? `[${l.workConfirmCount}]` : ''}`, () => openConfirm(l), l.workConfirmCount > 0)}
                    {link(`금액직접입력${l.directAmountCount ? `[${l.directAmountCount}]` : ''}`, () => setDirectFor(l), l.directAmountCount > 0)}
                  </div>
                </td>
                <td className="text-center">
                  <div className="flex flex-col items-center">
                    {link('전체계산', () => { setExcludeZero(true); setCalcAsk({ ledger: l, ids: null }) })}
                    {link('개인별계산', () => openPick(l))}
                  </div>
                </td>
                <td className="text-center">
                  <div className="flex flex-col items-center">
                    {link('조회', () => openView(l))}
                    {link('일괄수정', () => setBulkFor(l))}
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
              <EcDateRange from={{ className: "ec-input w-[150px]", value: form.periodFrom, onChange: (e) => setForm({ ...form, periodFrom: e.target.value }) }} to={{ className: "ec-input w-[150px]", value: form.periodTo, onChange: (e) => setForm({ ...form, periodTo: e.target.value }) }} />
            </div>
          </li>
          <li className="wide">
            <span className="title">지급일</span>
            <div className="form"><EcDateInput className="ec-input w-[150px]" value={form.payDate} onChange={(e) => setForm({ ...form, payDate: e.target.value })} /></div>
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
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setLoadAsk(true)}>근무기록</button>
          <span className="text-ec-hint">{confirmFor ? `${slash(confirmFor.periodFrom)} ~ ${slash(confirmFor.periodTo)}` : ''}</span>
        </div>
        <table ref={confirmRef} className="w-full text-left">
          <thead>
            <tr>
              <th>사원번호</th>
              <th>사원명</th>
              <th className="text-center">최종근무일</th>
              <th>부서명</th>
              <th>프로젝트</th>
              <th className="w-[120px] text-right">일근무</th>
              {confirmItems.map((it) => <th key={it.id} className="w-[120px] text-right">{it.name}</th>)}
              {/* 원본(2026-10-21): 근무기록 열 뒤에 '일근무 금액 | 수당 금액 …' — 변동(직접입력) 은 근무입력 금액의 합(근무기록확정(금액)) */}
              <th className="w-[120px] text-right">일근무 금액</th>
              {confirmItems.map((it) => <th key={`${it.id}-amt`} className="w-[120px] text-right">{it.name} 금액</th>)}
              <th className="w-[120px] text-right">근로일수</th>
            </tr>
          </thead>
          <tbody>
            {cells.length === 0 ? (
              <tr><td colSpan={8 + confirmItems.length * 2} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : cells.map((c, i) => (
              <tr key={c.workerId}>
                <td>{c.workerCode}</td>
                <td>{c.workerName}</td>
                <td className="text-center">{c.lastWorkDate ? slash(c.lastWorkDate) : ''}</td>
                <td>{c.department}</td>
                <td />
                <td>
                  {/* 원본(2026-10-14): 일근무를 고치면 근로일수가 같은 값으로 따라온다(2 → 2.00, 0.5 → 0.50, 2 → 4 면 4.00).
                      근로일수를 고쳐도 일근무는 그대로(4.00 · 근로일수 1 로 저장되고 다시 열어도 그대로) */}
                  <input className="ec-input w-full text-right" inputMode="decimal" aria-label={`${c.workerName} 일근무`} value={dayText(`${c.workerId}-d`, c.days)}
                         onFocus={() => setNumFocus(`${c.workerId}-d`)} onBlur={() => setNumFocus('')}
                         onChange={(e) => {
                           const days = Number(e.target.value.replace(/[^0-9.]/g, '')) || 0
                           setCells(cells.map((x, j) => (j === i ? { ...x, days, workDays: days || null } : x)))
                         }} />
                </td>
                {confirmItems.map((it) => (
                  <td key={it.id}>
                    <input className="ec-input w-full text-right" inputMode="decimal" aria-label={`${c.workerName} ${it.name}`}
                           value={dayText(`${c.workerId}-${it.id}`, cellDays(c, it.id))}
                           onFocus={() => setNumFocus(`${c.workerId}-${it.id}`)} onBlur={() => setNumFocus('')}
                           onChange={(e) => {
                             const d = Number(e.target.value.replace(/[^0-9.]/g, '')) || 0
                             setCells(cells.map((x, j) => (j === i
                               ? { ...x, items: [...(x.items ?? []).filter((y) => y.itemId !== it.id), ...(d || cellAmt(x, it.id) ? [{ itemId: it.id, days: d, amount: cellAmt(x, it.id) }] : [])] } : x)))
                           }} />
                  </td>
                ))}
                <td className="text-right">{Number(c.amount) ? fmtNumberOf(c.amount) : loaded ? '0' : ''}</td>
                {confirmItems.map((it) => it.payMethod === '변동(직접입력)' ? (
                  <td key={`${it.id}-amt`}>
                    <input className="ec-input w-full text-right" inputMode="numeric" aria-label={`${c.workerName} ${it.name} 금액`}
                           value={cellAmt(c, it.id) != null ? fmtNumberOf(Number(cellAmt(c, it.id))) : loaded ? '0' : ''}
                           onChange={(e) => {
                             const raw = e.target.value.replace(/[^0-9]/g, '')
                             const a = raw === '' ? null : Number(raw)
                             setCells(cells.map((x, j) => (j === i
                               ? { ...x, items: [...(x.items ?? []).filter((y) => y.itemId !== it.id), ...(a || cellDays(x, it.id) ? [{ itemId: it.id, days: cellDays(x, it.id), amount: a }] : [])] } : x)))
                           }} />
                  </td>
                ) : (
                  <td key={`${it.id}-amt`} className="text-right">{loaded ? (cellDays(c, it.id) ? '' : '0') : (c.items?.some((x) => x.itemId === it.id) ? '0' : '')}</td>
                ))}
                <td>
                  <input className="ec-input w-full text-right" inputMode="decimal" aria-label={`${c.workerName} 근로일수`}
                         value={c.workDays == null ? '' : wdFocus === c.workerId ? String(c.workDays) : Number(c.workDays).toFixed(2)}
                         onFocus={() => setWdFocus(c.workerId)}
                         onChange={(e) => {
                           const raw = e.target.value.replace(/[^0-9.]/g, '')
                           setCells(cells.map((x, j) => (j === i ? { ...x, workDays: raw === '' ? null : Number(raw) } : x)))
                         }}
                         onBlur={() => setWdFocus(null)} />
                </td>
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

      <Modal error={error} open={loadAsk} title="일별근무기록불러오기" width={760} onClose={() => setLoadAsk(false)}>
        <b className="block mb-[12px]">일별근무기록불러오기</b>
        <p className="text-ec-danger mb-[6px]">⊙ 입력한 근무기록이 나타나지 않는 경우</p>
        <table className="w-full text-left">
          <thead><tr><th className="w-[34px] text-center"><input type="checkbox" checked readOnly aria-label="전체 선택" /></th><th className="text-center">수당명 ( 근무기록방법 )</th></tr></thead>
          <tbody>
            <tr><td className="text-center"><input type="checkbox" checked readOnly aria-label="일근무 선택" /></td><td>일근무 (일)</td></tr>
            {/* 원본(2026-10-21): 'QA관리-시간 (시간)' · 'QA관리-률 (지급률)' · 직접입력은 괄호 없이 'QA관리-직접' */}
            {confirmItems.map((it) => (
              <tr key={it.id}><td className="text-center"><input type="checkbox" checked readOnly aria-label={`${it.name} 선택`} /></td>
                <td>{it.payMethod === '변동(직접입력)' ? it.name : `${it.name} (${(it.payMethod ?? '변동(일)').replace(/^변동\((.*)\)$/, '$1')})`}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={async () => {
            if (!(await ecConfirm('해당 항목에 이미 등록된 근무기록자료는 삭제된 후 불러온 근태관리자료로 대체됩니다.\n진행 하겠습니까?'))) return
            setLoadAsk(false)
            loadEntries()
          }}>적용</button>
          <button type="button" className="ec-btn" onClick={() => setLoadAsk(false)}>닫기</button>
        </div>
      </Modal>

      <Modal error={pickError} open={!!pickFor} title="개인별계산" width={780} onClose={() => setPickFor(null)}>
        <div className="flex items-center justify-between mb-[8px]">
          <b>개인별계산</b>
          <div className="flex gap-[4px]">
            <input className="ec-input w-[180px]" placeholder="입력 후 [Enter]" aria-label="개인별계산 검색" value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} />
            <button type="button" className="ec-btn ec-btn-primary">Search(F3)</button>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[420px]">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr>
                <th className="w-[30px] text-center">
                  <input type="checkbox" aria-label="전체선택" checked={pickRows.length > 0 && pickRows.every((w) => picked.has(w.id))}
                         onChange={(ev) => setPicked(ev.target.checked ? new Set(pickRows.map((w) => w.id)) : new Set())} />
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
              ) : pickRows.map((w) => (
                <tr key={w.id}>
                  <td className="text-center">
                    <input type="checkbox" aria-label={`${w.name} 선택`} checked={picked.has(w.id)} onChange={(ev) => {
                      const next = new Set(picked)
                      if (ev.target.checked) next.add(w.id); else next.delete(w.id)
                      setPicked(next)
                    }} />
                  </td>
                  <td>{w.code}</td>
                  <td>{w.name}</td>
                  <td>{w.department}</td>
                  <td className="text-center">{w.hireDate ? slash(w.hireDate) : ''}</td>
                  <td className="text-center">{w.resignDate ? slash(w.resignDate) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={askPicked}>계산처리</button>
          <button type="button" className="ec-btn" onClick={() => setPickFor(null)}>닫기</button>
        </div>
      </Modal>

      <Modal error={error} open={!!calcAsk} title="알림" width={560} onClose={() => setCalcAsk(null)}>
        <p className="whitespace-pre-line">
          {calcAsk?.ids
            ? '선택한 사원의 기존 자료를 삭제하고 다시 계산합니다.\n\n급여대장에서 직접 수정한 내역은 유지되지 않습니다.\n\n개인별 계산을 진행하겠습니까?'
            : '기존 자료를 삭제하고 다시 계산합니다.\n\n급여대장에서 직접 수정한 내역은 유지되지 않습니다.\n\n전체 계산을 진행하시겠습니까?'}
        </p>
        <label className="flex items-center gap-[6px] my-[12px]">
          <input type="checkbox" checked={excludeZero} onChange={(e) => setExcludeZero(e.target.checked)} /> 지급총액 0 이하 제외
        </label>
        <div className="flex gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={calculate}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setCalcAsk(null)}>취소</button>
        </div>
      </Modal>

      <DailyDirectAmount ledger={directFor} onClose={() => setDirectFor(null)} onChanged={load} />
      <DailyPayBulkEdit ledger={bulkFor} bizRegNo={bizRegNo} onClose={() => setBulkFor(null)}
                        onSaved={() => { setBulkFor(null); load() }} />

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
                {/*
                  원본(2026-10-21 QA관리-지급: 일근무 · 고정 · 시간 · 지급률 · 직접입력): 수당 칸은 두 개씩 한 줄에 놓이고 넘치면 다음 줄로 —
                  머리 '성명 | 최종근무일 | 일근무 | QA관리-고정 | 지급총액 | 공제(전체) | 공제총액 | 실지급액' / 'QA관리-시간 | QA관리-률' /
                  'QA관리-직접 |' / '주민등록번호'. 사원 줄 · 총합계 줄도 같은 줄 수(총합계 수당 칸은 금액만).
                  수당 하나는 <b>한 칸</b>이다(2026-10-21 다시 잼 — 칸 안에 table-virtual 로 일수 '3' · 금액 '1,000' 이 나란히,
                  일수 칸은 글자 폭 · 금액 칸이 나머지, 둘 사이 세로선 1px(머리카락 색) · 여백 3px). 전에는 두 칸으로 그렸다.
                */}
                <thead>
                  {slotRows.map((pair, k) => (
                    <tr key={k}>
                      {k === 0 && <th rowSpan={slotRows.length}>성명</th>}
                      {k === 0 && <th rowSpan={slotRows.length + 1}>최종근무일</th>}
                      {pair.map((sl, m) => <th key={m}>{sl ? sl.name : ''}</th>)}
                      {k === 0 && <th rowSpan={slotRows.length + 1}>지급총액</th>}
                      {taxCol && <th>{k === 0 ? '공제(전체)' : ''}</th>}
                      {k === 0 && dedCols.map((c) => <th key={c.itemId} rowSpan={slotRows.length}>{c.name}</th>)}
                      {k === 0 && <th rowSpan={slotRows.length + 1}>공제총액</th>}
                      {k === 0 && <th rowSpan={slotRows.length + 1}>실지급액</th>}
                    </tr>
                  ))}
                  <tr>
                    <th>주민등록번호</th>
                    <th></th><th></th>
                    {taxCol && <th></th>}
                    {dedCols.map((c) => <th key={c.itemId}></th>)}
                  </tr>
                </thead>
                <tbody>
                  {view.lines.length === 0 ? (
                    <tr><td colSpan={7 + dedCols.length + (taxCol ? 1 : 0)} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                  ) : view.lines.flatMap((l) => {
                    const ded = Number(l.deductionTotal ?? Number(l.incomeTax) + Number(l.localTax))
                    const taxText = (k: number) => (k === 0 ? (Number(l.incomeTax) ? fmtNumberOf(l.incomeTax) : '') : k === 1 ? (Number(l.localTax) ? fmtNumberOf(l.localTax) : '') : '')
                    /** 수당 한 칸 = 일수 | 금액(원본 table-virtual). */
                    const pairCell = (key: string, q: string, a: ReactNode, extra?: ReactNode, title?: string) => (
                      <td key={key} className="relative text-right" title={title}>
                        {extra}
                        <div className="flex">
                          <span className="px-[3px]">{q}</span>
                          <span className="flex-1 px-[3px] border-l border-solid border-ec-line">{a}</span>
                        </div>
                      </td>
                    )
                    const slotCells = (sl: Slot | null, key: string) => {
                      if (!sl) return [<td key={key}></td>]
                      if (sl.itemId == null) return [pairCell(key, Number(l.days) ? String(Number(l.days)) : '',
                        Number(l.dayPay ?? l.grossPay) || l.direct ? fmtNumberOf(l.dayPay ?? l.grossPay) : '',
                        l.direct ? <i aria-hidden className="absolute left-0 top-0 border-t-[6px] border-r-[6px] border-t-ec-danger border-r-transparent" /> : undefined,
                        l.direct ? '금액직접입력' : undefined)]
                      const it = itemOf(l, sl.itemId)
                      return [pairCell(key, it?.quantity != null ? String(Number(it.quantity)) : '', it ? fmtNumberOf(it.amount) : '')]
                    }
                    return [
                      ...slotRows.map((pair, k) => (
                        <tr key={`${l.id}-${k}`}>
                          {k === 0 && <td rowSpan={slotRows.length}>{l.workerName}</td>}
                          {k === 0 && <td rowSpan={slotRows.length + 1} className="text-center"></td>}
                          {pair.flatMap((sl, m) => slotCells(sl, String(m)))}
                          {k === 0 && <td rowSpan={slotRows.length + 1} className="text-right">{fmtNumberOf(l.grossPay)}</td>}
                          {taxCol && <td className="text-right">{taxText(k)}</td>}
                          {k === 0 && dedCols.map((c) => <td key={c.itemId} rowSpan={slotRows.length + 1} className="text-right">{itemOf(l, c.itemId) ? fmtNumberOf(itemOf(l, c.itemId)!.amount) : ''}</td>)}
                          {k === 0 && <td rowSpan={slotRows.length + 1} className="text-right">{ded ? fmtNumberOf(ded) : ''}</td>}
                          {k === 0 && <td rowSpan={slotRows.length + 1} className="text-right">{fmtNumberOf(l.netPay)}</td>}
                        </tr>
                      )),
                      <tr key={`${l.id}-b`}>
                        <td></td>
                        <td></td><td></td>
                        {taxCol && <td className="text-right">{taxText(slotRows.length)}</td>}
                      </tr>,
                    ]
                  })}
                  {slotRows.map((pair, k) => (
                    <tr key={`sum-${k}`} className="font-bold">
                      {k === 0 && <td colSpan={2} rowSpan={slotRows.length + 1} className="text-center">총합계</td>}
                      {pair.map((sl, m) => <td key={m} className="text-right">{!sl ? '' : sl.itemId == null ? fmtNumberOf(totals.dayPay) : fmtNumberOf(itemSum(sl.itemId, (i) => Number(i.amount)))}</td>)}
                      {k === 0 && <td rowSpan={slotRows.length + 1} className="text-right">{fmtNumberOf(totals.gross)}</td>}
                      {taxCol && <td className="text-right">{k === 0 && totals.tax + totals.local ? fmtNumberOf(totals.tax + totals.local) : ''}</td>}
                      {k === 0 && dedCols.map((c) => <td key={c.itemId} rowSpan={slotRows.length + 1} className="text-right">{fmtNumberOf(itemSum(c.itemId, (i) => Number(i.amount)))}</td>)}
                      {k === 0 && <td rowSpan={slotRows.length + 1} className="text-right">{totals.ded ? fmtNumberOf(totals.ded) : ''}</td>}
                      {k === 0 && <td rowSpan={slotRows.length + 1} className="text-right">{fmtNumberOf(totals.net)}</td>}
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td></td><td></td>
                    {taxCol && <td></td>}
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

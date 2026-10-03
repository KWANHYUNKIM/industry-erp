import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { RetirementPay, RetirementPayCalculation } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number | null | undefined) => (n ? Number(n).toLocaleString('ko-KR') : '')
const slash = (d?: string | null) => (d ? d.replace(/-/g, '/') : '')
type Emp = { id: number; code: string; name: string; hireDate?: string | null; resignDate?: string | null }

type Form = {
  id?: number
  employeeId: string
  withholdingMonth: string
  payDate: string
  startDate: string
  retireDate: string
  retireReason: string
  executive: boolean
  extraPay: string
  retirementPay: string
  nonTaxable: string
}

/**
 * 퇴직금계산 (원본 세무 › 원천징수 › 퇴직정산 E030117, 2026-10-03 loginaa 실측).
 *
 * 목록: 퇴직일자(귀속) · 원천징수연월 · 사번 · 성명 · 부서 · 입사일자 · 기산일 · 퇴사일 · 지급일 · 퇴직금 ·
 * 소득세 · 지방소득세 · 농어촌특별세 · 공제총액 · 실지급액 · 인쇄. 기간 기본값은 작년 1월 1일 ~ 이번 달 말일.
 *
 * [신규]는 사원을 고르면 최근 3개월 급여 · 1년 상여로 평균임금 → 퇴직산출액(ⓖ × 30 × 재직일수 / 365)을 내고
 * 퇴직소득세를 셈한다. 퇴직급여 칸을 고치면 세금만 다시 센다(원본 '(15)퇴직급여 최종란에 금액 입력 후 Enter').
 */
export default function RetirementPayPage() {
  const today = ymd(new Date())
  const [from, setFrom] = useState(`${Number(today.slice(0, 4)) - 1}-01-01`)
  const [to, setTo] = useState(() => {
    const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)
    return ymd(d)
  })
  const [rows, setRows] = useState<RetirementPay[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [emps, setEmps] = useState<Emp[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [calc, setCalc] = useState<RetirementPayCalculation | null>(null)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setError('')
    api.get<RetirementPay[]>('/retirement-pays', { params: { from, to } })
      .then((r) => { setRows(r.data); setPicked(new Set()) })
      .catch((e) => { setRows([]); setError(extractErrorMessage(e)) })
  }
  useEffect(() => {
    load()
    api.get<Emp[]>('/employees/all').then((r) => setEmps(r.data)).catch(() => setEmps([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const body = (f: Form, withPay: boolean) => ({
    employeeId: Number(f.employeeId), withholdingMonth: f.withholdingMonth, payDate: f.payDate,
    startDate: f.startDate, retireDate: f.retireDate, retireReason: f.retireReason || null, executive: f.executive,
    extraPay: f.extraPay ? Number(f.extraPay.replace(/,/g, '')) : null,
    retirementPay: withPay && f.retirementPay ? Number(f.retirementPay.replace(/,/g, '')) : null,
    nonTaxable: f.nonTaxable ? Number(f.nonTaxable.replace(/,/g, '')) : null,
  })

  async function recalc(f: Form, withPay: boolean) {
    if (!f.employeeId || !f.startDate || !f.retireDate || !f.payDate) return
    setFormError('')
    try {
      const c = (await api.post<RetirementPayCalculation>('/retirement-pays/calculate', body(f, withPay))).data
      setCalc(c)
      setForm({ ...f, retirementPay: won(c.retirementPay) })
    } catch (e) {
      setCalc(null); setFormError(extractErrorMessage(e))
    }
  }

  function pickEmployee(id: string) {
    const e = emps.find((x) => String(x.id) === id)
    const retire = e?.resignDate ?? today
    const f: Form = {
      employeeId: id, withholdingMonth: retire.slice(0, 7), payDate: retire,
      startDate: e?.hireDate ?? retire, retireDate: retire, retireReason: '', executive: false,
      extraPay: '', retirementPay: '', nonTaxable: '',
    }
    setForm(f)
    recalc(f, false)
  }

  function openEdit(r: RetirementPay) {
    const f: Form = {
      id: r.id, employeeId: String(r.employeeId), withholdingMonth: r.withholdingMonth, payDate: r.payDate,
      startDate: r.startDate, retireDate: r.retireDate, retireReason: r.retireReason ?? '', executive: r.executive,
      extraPay: won(r.extraPay), retirementPay: won(r.retirementPay), nonTaxable: won(r.nonTaxable),
    }
    setFormError(''); setForm(f); recalc(f, true)
  }

  async function save() {
    if (!form) return
    setFormError('')
    try {
      if (form.id) await api.put(`/retirement-pays/${form.id}`, body(form, true))
      else await api.post('/retirement-pays', body(form, true))
      setForm(null); setCalc(null); load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function doDelete() {
    setConfirmDelete(false)
    try {
      await api.post('/retirement-pays/delete', [...picked])
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const allPicked = rows.length > 0 && picked.size === rows.length
  const set = (patch: Partial<Form>) => form && setForm({ ...form, ...patch })

  return (
    <EcListShell
      title="퇴직금계산"
      onSearch={load}
      onNew={() => { setFormError(''); setCalc(null); setForm({ employeeId: '', withholdingMonth: today.slice(0, 7), payDate: today, startDate: '', retireDate: today, retireReason: '', executive: false, extraPay: '', retirementPay: '', nonTaxable: '' }) }}
      actions={[
        { label: '인쇄' },
        { label: '선택삭제', onClick: () => setConfirmDelete(true), disabled: picked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="퇴직일자">
          <input type="date" className="ec-input w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>~</span>
          <input type="date" className="ec-input w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="ec-btn ec-btn-primary" onClick={load}>검색(F8)</button>
        </EcCond>
      </ul>

      <table className="w-full text-center">
        <thead>
          <tr>
            <th className="w-[47px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
            </th>
            <th>퇴직일자(귀속)</th><th>원천징수연월</th><th>사번</th><th>성명</th><th>부서</th>
            <th>입사일자</th><th>기산일</th><th>퇴사일</th><th>지급일</th>
            <th className="text-right">퇴직금</th><th className="text-right">소득세</th><th className="text-right">지방소득세</th>
            <th className="text-right">농어촌특별세</th><th className="text-right">공제총액</th><th className="text-right">실지급액</th><th>인쇄</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={17} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                <input type="checkbox" aria-label={`${r.employeeName} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{slash(r.retireDate)}</a></td>
              <td>{r.withholdingMonth.replace('-', '/')}</td>
              <td>{r.employeeCode}</td>
              <td>{r.employeeName}</td>
              <td>{r.department}</td>
              <td>{slash(r.hireDate)}</td>
              <td>{slash(r.startDate)}</td>
              <td>{slash(r.retireDate)}</td>
              <td>{slash(r.payDate)}</td>
              <td className="text-right">{won(r.retirementPay)}</td>
              <td className="text-right">{won(r.incomeTax)}</td>
              <td className="text-right">{won(r.localIncomeTax)}</td>
              <td className="text-right"></td>
              <td className="text-right">{won(r.deductionTotal)}</td>
              <td className="text-right">{won(r.netPay)}</td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <Modal open error={formError} title="퇴직금 계산" onClose={() => { setForm(null); setCalc(null) }} width={980}>
          <ul className="ec-form mb-[8px]">
            <li>
              <div className="title">사원</div>
              <div className="form">
                <CodePickerField label="사원" hideLabel value={form.employeeId} disabled={Boolean(form.id)} emptyLabel=""
                                 onChange={(v) => pickEmployee(v)}
                                 items={emps.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))} />
              </div>
            </li>
            <li>
              <div className="title">원천징수년월</div>
              <div className="form"><input type="month" className="ec-input w-[150px]" value={form.withholdingMonth} onChange={(e) => set({ withholdingMonth: e.target.value })} /></div>
            </li>
            <li>
              <div className="title">기산일</div>
              <div className="form"><input type="date" className="ec-input w-[150px]" value={form.startDate}
                                           onChange={(e) => set({ startDate: e.target.value })} onBlur={() => recalc(form, false)} /></div>
            </li>
            <li>
              <div className="title">퇴사일</div>
              <div className="form"><input type="date" className="ec-input w-[150px]" value={form.retireDate}
                                           onChange={(e) => set({ retireDate: e.target.value })} onBlur={() => recalc(form, false)} /></div>
            </li>
            <li>
              <div className="title">지급일자</div>
              <div className="form"><input type="date" className="ec-input w-[150px]" value={form.payDate} onChange={(e) => set({ payDate: e.target.value })} /></div>
            </li>
            <li>
              <div className="title">퇴직사유</div>
              <div className="form">
                {/* 원본은 고르는 칸이다(김은빈 건 '정리해고'). 목록 전체를 못 재서 글자로 받는다. */}
                <input className="ec-input w-[150px]" value={form.retireReason} onChange={(e) => set({ retireReason: e.target.value })} />
              </div>
            </li>
            <li>
              <div className="title">임원퇴직</div>
              <div className="form">
                <label><input type="checkbox" checked={form.executive} onChange={(e) => set({ executive: e.target.checked })} /> 임원</label>
              </div>
            </li>
            <li>
              <div className="title">ⓓ추가급여</div>
              <div className="form"><input className="ec-input w-[150px] text-right" value={form.extraPay}
                                           onChange={(e) => set({ extraPay: e.target.value })} onBlur={() => recalc(form, false)} /></div>
            </li>
          </ul>

          {calc && (
            <>
              <p className="text-[12px] font-bold mb-[4px]">퇴직금계산 내역</p>
              <table className="w-full ec-report mb-[8px]">
                <tbody>
                  <tr><th className="w-[300px]">급 여 계산기간 : {calc.wageFrom.replace('-', '.')}~{calc.wageTo.replace('-', '.')}</th><td></td></tr>
                  {calc.wages.map((m) => <tr key={`w${m.month}`}><td>{m.month.replace('-', '.')}</td><td className="text-right">{Number(m.amount).toLocaleString('ko-KR')}</td></tr>)}
                  <tr><th>ⓐ3개월동안의 급여</th><td className="text-right">{Number(calc.wage3m).toLocaleString('ko-KR')}</td></tr>
                  <tr><th>상 여 계산기간 : {calc.bonusFrom.replace('-', '.')}~{calc.bonusTo.replace('-', '.')}</th><td></td></tr>
                  {calc.bonuses.map((m) => <tr key={`b${m.month}`}><td>{m.month.replace('-', '.')}</td><td className="text-right">{Number(m.amount).toLocaleString('ko-KR')}</td></tr>)}
                  <tr><th>ⓑ1년 상여합계</th><td className="text-right">{Number(calc.bonus1y).toLocaleString('ko-KR')}</td></tr>
                  <tr><th>ⓒ3개월로 환산(ⓑ*3/12)</th><td className="text-right">{Number(calc.bonus3m).toLocaleString('ko-KR')}</td></tr>
                  <tr><th>ⓓ추가급여(3개월로 환산한 금액)</th><td className="text-right">{Number(calc.extraPay).toLocaleString('ko-KR')}</td></tr>
                  <tr><th>ⓔ3개월 임금총액 (ⓐ+ⓒ+ⓓ)</th><td className="text-right">{Number(calc.total3m).toLocaleString('ko-KR')}</td></tr>
                  <tr><th>ⓕ3개월 근무일수</th><td className="text-right">{calc.workDays3m}</td></tr>
                  <tr><th>ⓖ1일 평균 임금(ⓔ/ⓕ)</th><td className="text-right">{Number(calc.dailyWage).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</td></tr>
                  <tr><th>ⓗ재직일수</th><td className="text-right">{calc.serviceDays}</td></tr>
                  <tr><th>ⓘ퇴직산출액 (ⓖ*30일*ⓗ/365) (윤년일 경우 366일)</th><td className="text-right">{Number(calc.computedPay).toLocaleString('ko-KR')}</td></tr>
                </tbody>
              </table>

              <table className="w-full ec-report">
                <tbody>
                  <tr>
                    <th className="w-[300px]">(15)퇴 직 급 여</th>
                    <td><input className="ec-input w-[160px] text-right" value={form.retirementPay}
                               onChange={(e) => set({ retirementPay: e.target.value })}
                               onKeyDown={(e) => { if (e.key === 'Enter') recalc(form, true) }}
                               onBlur={() => recalc(form, true)} /></td>
                  </tr>
                  <tr>
                    <th>(16)비과세 퇴직급여</th>
                    <td><input className="ec-input w-[160px] text-right" value={form.nonTaxable}
                               onChange={(e) => set({ nonTaxable: e.target.value })} onBlur={() => recalc(form, true)} /></td>
                  </tr>
                  <tr><th>근속월수 · (27)근속연수</th><td>{calc.serviceMonths} · {calc.serviceYears}</td></tr>
                  <tr><th>(28)퇴직소득 ((17))</th><td className="text-right">{won(calc.tax.income)}</td></tr>
                  <tr><th>(29)근속연수공제</th><td className="text-right">{won(calc.tax.serviceDeduction)}</td></tr>
                  <tr><th>(30)환산급여 [((28)-(29))×12배/정산근속연수]</th><td className="text-right">{won(calc.tax.converted)}</td></tr>
                  <tr><th>(31)환산급여별공제</th><td className="text-right">{won(calc.tax.convertedDeduction)}</td></tr>
                  <tr><th>(32)퇴직소득과세표준 ((30)-(31))</th><td className="text-right">{won(calc.tax.taxBase)}</td></tr>
                  <tr><th>(33)환산산출세액 ((32)×세율)</th><td className="text-right">{won(calc.tax.convertedTax)}</td></tr>
                  <tr><th>(34)퇴직소득 산출세액 ((33)×정산근속연수/12배)</th><td className="text-right">{won(calc.tax.computedTax)}</td></tr>
                  <tr><th>(46)차감원천징수세액 소득세 · 지방소득세</th><td className="text-right">{won(calc.tax.incomeTax)} · {won(calc.tax.localIncomeTax)}</td></tr>
                </tbody>
              </table>
            </>
          )}

          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={save} disabled={!calc}>저장(F8)</button>
            <button className="ec-btn" onClick={() => form && recalc(form, false)}>퇴직금재계산</button>
            <button className="ec-btn" onClick={() => { setForm(null); setCalc(null) }}>닫기</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal open error={error} title="알림" onClose={() => setConfirmDelete(false)} width={420}>
          <p className="text-[12px] mb-[12px]">삭제한 데이터는 복구되지 않습니다.<br />삭제하겠습니까?</p>
          <div className="flex gap-[6px]">
            <button className="ec-btn ec-btn-primary" onClick={doDelete}>확인</button>
            <button className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
          </div>
        </Modal>
      )}
    </EcListShell>
  )
}

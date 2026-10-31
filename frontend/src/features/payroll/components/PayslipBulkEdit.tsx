import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../../../components/Modal'
import EcNumInput from '../../../components/EcNumInput'
import { api, extractErrorMessage } from '../../../api/client'
import type { EmployeeMaster, PayItem, Payslip } from '../../../types/api'
import { ecAlert } from '../../../components/EcDialog'
import { fmtNumberOf } from '../../../utils/format'

const slash = (s: string) => s.replace(/-/g, '/')
/** 원본 머리 이름 — 우리 법정 공제 이름과 다른 것만(급여대장 보고서 · 급여현황과 같다) */
const LABEL: Record<string, string> = { 지방소득세: '주민세', 장기요양보험: '장기요양' }
const STATUTORY = ['소득세', '지방소득세', '국민연금', '건강보험', '고용보험', '장기요양보험']

interface Col { kind: 'ALLOWANCE' | 'DEDUCTION'; name: string }
interface Ledger { payMonth: string; name: string; payDate: string }
const BASE = '기본급'
const key = (c: Col) => `${c.kind}#${c.name}`

/**
 * 관리 &gt; 급여계산/대장 &gt; 급여대장 <b>[일괄수정]</b> (원본 E090106, 2026-10-12 실측).
 *
 * <p>① '급여수정 대상자 선택' — 그 대장에 명세가 있는 사원(사원번호 · 성명 · 부서명 · 입사일자 · 퇴사일자)에 체크하고 [적용].
 * ② '급여내역수정' — 머리 귀속연월 'YYYY/MM - 1' · 지급구분 1차수 · 지급일 · 대상기간(그 달 1일 ~ 말일) · 급여대장명칭,
 * 격자는 사원마다 두 줄: 윗줄 지급총액 · 기본급 · 수당항목, 아랫줄 공제총액 · 공제항목(소득세 · 주민세 …), 실지급액은 두 줄을 차지한다.
 * 칸을 고치면 그 칸이 붉어지고 지급총액 · 공제총액 · 실지급액만 합으로 바뀐다(세금을 다시 셈하지 않는다).
 * [저장(F8)] 확인 창: '금액을 직접 수정할 경우 해당 급여대장에만 적용되며 재계산시 수정내역이 유지되지 않습니다 …' + [사원정보 설정].
 *
 * <p>원본 변동수당 칸 앞의 수량(9.5 시간)은 우리 명세 줄에 수량이 없어 금액만 고친다. [사전작업▲] · [삭제] 는 아직 없다.
 */
export default function PayslipBulkEdit({ ledger, onClose, onSaved }: { ledger: Ledger | null; onClose: () => void; onSaved: () => void }) {
  const nav = useNavigate()
  const [slips, setSlips] = useState<Payslip[]>([])
  const [items, setItems] = useState<PayItem[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Payslip[] | null>(null)
  /** 고친 값 — `${payslipId}|${kind}#${name}` → 원 단위 숫자 글자 */
  const [vals, setVals] = useState<Map<string, string>>(new Map())
  const [ask, setAsk] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ledger) return
    setError(''); setChecked(new Set()); setQuery(''); setEditing(null); setVals(new Map())
    Promise.all([
      api.get<Payslip[]>('/payslips', { params: { month: ledger.payMonth } }),
      api.get<PayItem[]>('/pay-settings/items'),
      api.get<EmployeeMaster[]>('/employees/all'),
    ]).then(([p, i, e]) => {
      setSlips([...p.data].sort((a, b) => (a.employeeCode < b.employeeCode ? -1 : a.employeeCode > b.employeeCode ? 1 : 0)))
      setItems(i.data); setEmployees(e.data)
    }).catch((e) => setError(extractErrorMessage(e)))
  }, [ledger])

  const emp = (id: number) => employees.find((e) => e.id === id)
  const pickRows = slips.filter((p) => !query || [p.employeeCode, p.employeeName, p.department ?? ''].some((v) => v.includes(query)))

  // 원본 열: 윗줄 기본급 + 수당항목(표시순서), 아랫줄 법정 공제 + 공제항목. 명세에만 있는 이름은 끝에 붙인다.
  const { allow, deduct } = useMemo(() => {
    const master = (k: 'ALLOWANCE' | 'DEDUCTION') => items.filter((i) => i.kind === k && i.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)).map((i) => i.name)
    const a = [BASE, ...master('ALLOWANCE').filter((n) => n !== BASE)]
    const d = [...STATUTORY, ...master('DEDUCTION').filter((n) => !STATUTORY.includes(n))]
    for (const p of editing ?? []) for (const l of p.lines) {
      const list = l.kind === 'ALLOWANCE' ? a : d
      if (!list.includes(l.name)) list.push(l.name)
    }
    return { allow: a.map((name): Col => ({ kind: 'ALLOWANCE', name })), deduct: d.map((name): Col => ({ kind: 'DEDUCTION', name })) }
  }, [items, editing])
  const width = Math.max(allow.length, deduct.length)

  const original = (p: Payslip, c: Col) => c.kind === 'ALLOWANCE' && c.name === BASE
    ? Number(p.baseSalary)
    : p.lines.filter((l) => l.kind === c.kind && l.name === c.name).reduce((s, l) => s + Number(l.amount), 0)
  const cellKey = (p: Payslip, c: Col) => `${p.id}|${key(c)}`
  const value = (p: Payslip, c: Col) => {
    const v = vals.get(cellKey(p, c))
    return v === undefined ? original(p, c) : Number(v || 0)
  }
  const changed = (p: Payslip, c: Col) => vals.has(cellKey(p, c)) && value(p, c) !== original(p, c)
  const gross = (p: Payslip) => allow.reduce((s, c) => s + value(p, c), 0)
  const deduction = (p: Payslip) => deduct.reduce((s, c) => s + value(p, c), 0)

  function apply() {
    const picked = slips.filter((p) => checked.has(p.id))
    if (picked.length === 0) { void ecAlert('선택된 사원이 없습니다.'); return }
    setVals(new Map())
    setEditing(picked)
  }

  async function save() {
    if (!editing) return
    setAsk(false)
    const edits = editing.map((p) => ({
      payslipId: p.id,
      baseSalary: value(p, allow[0]),
      cells: [...allow.slice(1), ...deduct].filter((c) => changed(p, c)).map((c) => ({ kind: c.kind, name: c.name, amount: value(p, c) })),
    }))
    try {
      await api.put('/payslips/amounts', { edits })
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const cell = (p: Payslip, c: Col | undefined, i: number) => (
    <td key={i} className={c && changed(p, c) ? 'bg-ec-danger-bg' : undefined}>
      {c && (
        <EcNumInput className="ec-input w-full text-right" aria-label={`${p.employeeName} ${LABEL[c.name] ?? c.name}`}
                    value={vals.get(cellKey(p, c)) ?? String(original(p, c) || '')}
                    onValue={(raw) => setVals(new Map(vals).set(cellKey(p, c), raw))} />
      )}
    </td>
  )

  return (
    <>
      <Modal error={error} open={!!ledger && !editing} title="급여수정 대상자 선택" width={780} onClose={onClose}>{(
        <>
          <div className="flex justify-end gap-[4px] mb-[8px]">
            <input className="ec-input w-[180px]" placeholder="입력 후 [Enter]" aria-label="급여수정 대상자 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="button" className="ec-btn ec-btn-primary">Search(F3)</button>
          </div>
          <div className="overflow-y-auto max-h-[420px]">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr>
                  <th className="w-[30px] text-center">
                    <input type="checkbox" aria-label="전체선택" checked={pickRows.length > 0 && pickRows.every((p) => checked.has(p.id))}
                           onChange={(ev) => setChecked(ev.target.checked ? new Set(pickRows.map((p) => p.id)) : new Set())} />
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
                ) : pickRows.map((p) => {
                  const e = emp(p.employeeId)
                  return (
                    <tr key={p.id}>
                      <td className="text-center">
                        <input type="checkbox" aria-label={`${p.employeeName} 선택`} checked={checked.has(p.id)} onChange={(ev) => {
                          const next = new Set(checked)
                          if (ev.target.checked) next.add(p.id); else next.delete(p.id)
                          setChecked(next)
                        }} />
                      </td>
                      <td>{p.employeeCode}</td>
                      <td>{p.employeeName}</td>
                      <td>{p.department}</td>
                      <td className="text-center">{e?.hireDate ? slash(e.hireDate) : ''}</td>
                      <td className="text-center">{e?.resignDate ? slash(e.resignDate) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용</button>
            <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          </div>
        </>
      )}</Modal>

      <Modal error={error} open={!!ledger && !!editing} title="급여내역수정" width={1200} onClose={onClose}>{(
        <>
          {ledger && (
            <ul className="ec-form mb-[8px]">
              <li><span className="title">귀속연월</span><div className="form">{slash(ledger.payMonth)} - 1</div></li>
              <li><span className="title">지급구분</span><div className="form">1차수</div></li>
              <li><span className="title">지급일</span><div className="form">{slash(ledger.payDate)}</div></li>
              <li>
                <span className="title">대상기간</span>
                <div className="form">
                  {slash(ledger.payMonth)}/01 ~ {slash(ledger.payMonth)}/{String(new Date(Number(ledger.payMonth.slice(0, 4)), Number(ledger.payMonth.slice(5, 7)), 0).getDate()).padStart(2, '0')}
                </div>
              </li>
              <li><span className="title">급여대장명칭</span><div className="form">{ledger.name}</div></li>
            </ul>
          )}
          <div className="overflow-auto max-h-[460px]">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr>
                  <th rowSpan={2}>사원번호</th>
                  <th rowSpan={2}>사원명</th>
                  <th rowSpan={2} className="text-right">실지급액</th>
                  <th className="text-right">지급총액</th>
                  {Array.from({ length: width }, (_, i) => <th key={i}>{allow[i] ? (LABEL[allow[i].name] ?? allow[i].name) : ''}</th>)}
                </tr>
                <tr>
                  <th className="text-right">공제총액</th>
                  {Array.from({ length: width }, (_, i) => <th key={i}>{deduct[i] ? (LABEL[deduct[i].name] ?? deduct[i].name) : ''}</th>)}
                </tr>
              </thead>
              <tbody>
                {(editing ?? []).map((p) => (
                  <PayRows key={p.id} p={p} net={gross(p) - deduction(p)} gross={gross(p)} deduction={deduction(p)}
                           top={Array.from({ length: width }, (_, i) => cell(p, allow[i], i))}
                           bottom={Array.from({ length: width }, (_, i) => cell(p, deduct[i], i))} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setAsk(true)}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setVals(new Map())}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          </div>
        </>
      )}</Modal>

      <Modal error={error} open={ask} title="알림" width={520} onClose={() => setAsk(false)}>{(
        <>
          <p className="whitespace-pre-line">
            {'금액을 직접 수정할 경우 해당 급여대장에만 적용되며 재계산시 수정내역이 유지되지 않습니다.\n\n사원의 급여가 변경되었다면, 하단 [사원정보 설정]를 클릭하여 사원정보를 수정하시기 바랍니다.\n\n저장하겠습니까?'}
          </p>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={save}>확인</button>
            <button type="button" className="ec-btn" onClick={() => setAsk(false)}>취소</button>
            <button type="button" className="ec-btn" onClick={() => nav('/hr/employees')}>사원정보 설정</button>
          </div>
        </>
      )}</Modal>
    </>
  )
}

function PayRows({ p, net, gross, deduction, top, bottom }: {
  p: Payslip; net: number; gross: number; deduction: number; top: ReactNode[]; bottom: ReactNode[]
}) {
  return (
    <>
      <tr>
        <td rowSpan={2}>{p.employeeCode}</td>
        <td rowSpan={2}>{p.employeeName}</td>
        <td rowSpan={2} className="text-right">{fmtNumberOf(net)}</td>
        <td className="text-right">{fmtNumberOf(gross)}</td>
        {top}
      </tr>
      <tr>
        <td className="text-right">{fmtNumberOf(deduction)}</td>
        {bottom}
      </tr>
    </>
  )
}

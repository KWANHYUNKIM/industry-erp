import { Fragment, useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { yearEndApi, type Settlement } from '../../features/yearend/api'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

type Emp = { id: number; code: string; name: string; department?: string | null; hireDate?: string | null; resignDate?: string | null }
type Company = { name?: string; bizRegNo?: string }
type Who = '전체' | '재직자' | '퇴사자'

/** 0 은 빈칸 — 원본 검토표 II 합계줄이 자료 없을 때 빈칸이다. */
const num = (n: number | null | undefined) => (n == null || Number(n) === 0 ? '' : Number(n).toLocaleString('ko-KR'))
const ymd = (d?: string | null) => (d ? d.replace(/-/g, '/') : '')

/**
 * 연말정산검토표 I (E030111) · II (E030112) — 세무 › 원천징수 › 출력물(2026-10-14 loginaa 실측).
 *
 * <p>조건(펼친 채 시작, [검색(F8)] 하면 접히고 머리에 Search(F3)): 귀속연도(기본 작년, 2026 · 2025 · 2024) ·
 * 원천세신고 사업자등록번호 · 부서 · 사원번호 · I [퇴사구분] / II [인쇄구분] ◉전체 ○재직자 ○퇴사자. 하단 [인쇄 · Excel],
 * II 는 [비과세 코드별 도움말] 이 더 있다.
 *
 * <p>원본은 정산내역(연말정산 · 중도정산)이 있는 사원만 찍는다 — 2026 급여대장이 있어도 정산이 없으면 II 는 빈 합계줄 하나,
 * I 은 '등록된 데이터가 없습니다.'. 원본 사원 30명이 모두 주민번호오류로 대상자추가가 잠겨 있어(사용자 결정 대기)
 * 자료가 든 줄은 원본에서 못 쟀다 — 줄은 머리 다섯 줄과 같은 차례로 사원 하나에 네 줄을 찍는다.
 *
 * <p>II: ⓐ 급여대장총지급액 = 주(현) 지급총액, ⓑ 제출비과세 = 0(우리 비과세는 모두 미제출 — 식대 · 자가운전), ⓒ 미제출비과세 = 주(현) 비과세,
 * ⓓ · ⓔ 종(전) 과세 · 비과세, ⓕ · ⓖ 연말 · 중도정산 총급여 + 제출비과세. 끝 열은 (ⓐ-ⓒ)+ⓓ+ⓔ-(ⓕ+ⓖ).
 */
export default function YearEndReviewPage({ part }: { part: 1 | 2 }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear - 1)
  const [dept, setDept] = useState('')
  const [empCode, setEmpCode] = useState('')
  const [who, setWho] = useState<Who>('전체')
  const [emps, setEmps] = useState<Emp[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [rows, setRows] = useState<Settlement[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Emp[]>('/employees/all').then((r) => setEmps(r.data)).catch(() => setEmps([]))
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  const emp = (id: number) => emps.find((e) => e.id === id)

  async function search() {
    setError('')
    try {
      const [ye, mid] = await Promise.all([yearEndApi.list(year, 'YEAR_END'), yearEndApi.list(year, 'MID_TERM')])
      const all = [...ye, ...mid].filter((s) => {
        const e = emp(s.employeeId)
        if (dept && (e?.department ?? '') !== dept) return false
        if (empCode && !(e?.code ?? '').includes(empCode)) return false
        if (who === '재직자' && e?.resignDate) return false
        if (who === '퇴사자' && !e?.resignDate) return false
        return true
      })
      all.sort((a, b) => (emp(a.employeeId)?.code ?? '').localeCompare(emp(b.employeeId)?.code ?? ''))
      setRows(all)
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }

  function reset() { setYear(thisYear - 1); setDept(''); setEmpCode(''); setWho('전체') }

  const depts = [...new Set(emps.map((e) => e.department).filter((d): d is string => !!d))]
  const list = rows ?? []

  return (
    <EcListShell title={`연말정산검토표${part}`} onSearch={search} option={false} collapseConditions={rows !== null} onReset={reset}
                 actions={rows ? [{ label: '인쇄', primary: true }, { label: 'Excel' }, ...(part === 2 ? [{ label: '비과세 코드별 도움말' }] : [])] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연도" span="full">
          <select className="ec-input w-full" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </EcCond>
        <EcCond label="원천세신고 사업자등록번호" span="full">
          <select className="ec-input w-full" disabled value=""><option value="">{company?.name ?? ''} {company?.bizRegNo ?? ''}</option></select>
        </EcCond>
        <EcCond label="부서" span="full">
          <select className="ec-input w-full" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">부서</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </EcCond>
        <EcCond label="사원번호" span="full">
          <input className="ec-input w-full" placeholder="사원번호" value={empCode} onChange={(e) => setEmpCode(e.target.value)} />
        </EcCond>
        <EcCond label={part === 1 ? '퇴사구분' : '인쇄구분'} span="full">
          {(['전체', '재직자', '퇴사자'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name={`yer-who-${part}`} checked={who === v} onChange={() => setWho(v)} /> {v}
            </label>
          ))}
        </EcCond>
        {rows === null && (
          <li className="full">
            <div className="form">
              <button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
            </div>
          </li>
        )}
      </ul>

      {rows && part === 1 && <ReviewOne list={list} emp={emp} />}
      {rows && part === 2 && <ReviewTwo list={list} emp={emp} />}
    </EcListShell>
  )
}

/** 검토표 I — 머리 다섯 줄(묶음 + 네 줄), 18열. 사원 하나에 네 줄. */
function ReviewOne({ list, emp }: { list: Settlement[]; emp: (id: number) => Emp | undefined }) {
  const head: string[][] = [
    ['급·상여합계', '근로소득공제', '부양가족', '한부모', '장기주택저당', '소기업소상공인', '장기집합', '근로소득', '보장성보험', '표준세액', '월세', '종합한도초과액', '결정소득', '결정지방소득', '결정농어촌'],
    ['제출비과세계', '근로소득금액', '경로우대', '연금보험료', '개인연금저축', '투자조합출자 등', '청년형장기집합', '혼인', '의료비', '납세조합', '', '과세표준', '소득세(종)', '지방소득세(종)', '농어촌(종)'],
    ['감면소득계', '본 인', '장애인', '건강고용보험료', '주택마련저축', '우리사주(출연금)', '', '자녀', '교육비', '주택차입금', '', '산출세액', '소득세(현)', '지방소득세(현)', '농어촌(현)'],
    ['총급여', '배우자', '부녀자', '주택임차', '신용카드등', '고용유지', '', '연금계좌', '기부금', '외국납부', '', '세액감면', '차감소득', '차감지방소득', '차감농어촌'],
  ]
  const lead = [['사번'], ['성명'], ['부양', '경', '장'], ['부녀', '한', '자']]
  const ref = useRef<HTMLTableElement>(null)
  useTableColumnCheck(ref, '연말정산검토표 I', [list.length])
  return (
    <table ref={ref} className="w-full ec-report ec-report-head400">
      <thead>
        <tr><th colSpan={4}>기본사항</th><th colSpan={6}>소득공제</th><th colSpan={4}>세액공제</th><th colSpan={4}>계산내역</th></tr>
        {head.map((line, i) => (
          <tr key={i}>
            {lead[i].length === 1 ? <th colSpan={3}>{lead[i][0]}</th> : lead[i].map((t) => <th key={t}>{t}</th>)}
            {line.map((t, j) => <th key={j}>{t}</th>)}
          </tr>
        ))}
      </thead>
      <tbody>
        {list.length === 0 ? (
          <tr><td colSpan={18} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
        ) : list.map((s) => {
          const e = emp(s.employeeId)
          const r = s.receipt
          const dependents = Math.max(0, s.basicDeductionCount - 1)
          const cells: (string | number)[][] = [
            [s.totalPay, s.earnedIncomeDeduction, dependents * 1_500_000, 0, 0, 0, 0, r?.earnedIncomeTaxCredit ?? 0, r?.insuranceCredit ?? 0, s.standardTaxCredit, 0, 0, s.decidedIncomeTax, s.decidedLocalTax, s.decidedRuralTax],
            [0, s.earnedIncomeAmount, 0, r?.pensionDeduction ?? 0, 0, 0, 0, 0, r?.medicalCredit ?? 0, 0, '', s.taxBase, s.prevIncomeTax, s.prevLocalTax, 0],
            [0, 1_500_000, 0, r?.specialIncomeDeduction ?? 0, 0, 0, '', r?.childTaxCredit ?? 0, 0, 0, '', s.computedTax, s.currentIncomeTax, s.currentLocalTax, 0],
            [s.totalSalary, 0, 0, 0, r?.otherIncomeDeduction ?? 0, 0, '', 0, 0, 0, '', s.taxReduction, s.balanceIncomeTax, s.balanceLocalTax, 0],
          ]
          const leadCells = [
            [<td key="c" colSpan={3} className="text-center">{e?.code ?? ''}</td>],
            [<td key="n" colSpan={3} className="text-center">{e?.name ?? ''}</td>],
            [<td key="a" className="text-center">{num(dependents)}</td>, <td key="b" />, <td key="c" />],
            [<td key="a" />, <td key="b" />, <td key="c" />],
          ]
          return (
            <Fragment key={s.id}>
              {cells.map((line, i) => (
                <tr key={i}>
                  {leadCells[i]}
                  {line.map((v, j) => <td key={j} className="text-right">{typeof v === 'number' ? num(v) : v}</td>)}
                </tr>
              ))}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

/** 검토표 II — 사원 한 줄 14열, 끝에 합계줄(사원 넷 칸 묶음). */
function ReviewTwo({ list, emp }: { list: Settlement[]; emp: (id: number) => Emp | undefined }) {
  // 같은 사원의 연말 · 중도정산을 한 줄로
  const byEmp = new Map<number, Settlement[]>()
  for (const s of list) byEmp.set(s.employeeId, [...(byEmp.get(s.employeeId) ?? []), s])
  const lines = [...byEmp.entries()].map(([empId, ss]) => {
    let a = 0, c = 0, d = 0, ee = 0, f = 0, g = 0
    for (const s of ss) {
      const prevTaxable = s.prevEmployers.reduce((t, p) => t + Number(p.taxablePay ?? 0), 0)
      const prevNonTax = s.prevEmployers.reduce((t, p) => t + Number(p.nonTaxable ?? 0), 0)
      const cur = s.totalPay - prevTaxable
      a += cur
      c += s.calculatedAt ? Math.max(0, s.totalPay - s.totalSalary) : 0
      d += prevTaxable
      ee += prevNonTax
      const income = s.totalSalary + prevNonTax
      if (s.kind === 'YEAR_END') f += income; else g += income
    }
    const target = a - c + d + ee
    return { empId, a, b: 0, c, d, e: ee, target, f, g, diff: target - (f + g) }
  })
  const sum = (k: 'a' | 'b' | 'c' | 'd' | 'e' | 'target' | 'f' | 'g' | 'diff') => lines.reduce((t, l) => t + l[k], 0)
  const ref = useRef<HTMLTableElement>(null)
  useTableColumnCheck(ref, '연말정산검토표 II', [lines.length])
  return (
    <table ref={ref} className="w-full ec-report ec-report-head400">
      <thead>
        <tr>
          <th rowSpan={2}>사원번호</th><th rowSpan={2}>성명</th><th rowSpan={2}>입사일자</th><th rowSpan={2}>퇴사일자</th>
          <th colSpan={3}>주(현)</th><th colSpan={2}>종(전)</th>
          <th rowSpan={2}>연말정산대상금액(ⓐ-ⓒ)+ⓓ+ⓔ</th><th rowSpan={2}>연말정산총소득ⓕ</th><th rowSpan={2}>중도정산총소득ⓖ</th>
          <th rowSpan={2}>연말정산대상금액-정산총소득(ⓐ-ⓒ)+ⓓ+ⓔ-(ⓕ+ⓖ)</th>
        </tr>
        <tr><th>급여대장총지급액ⓐ</th><th>제출비과세ⓑ</th><th>미제출비과세ⓒ</th><th>과세ⓓ</th><th>제출비과세ⓔ</th></tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const e = emp(l.empId)
          return (
            <tr key={l.empId}>
              <td className="text-center">{e?.code ?? ''}</td><td className="text-center">{e?.name ?? ''}</td>
              <td className="text-center">{ymd(e?.hireDate)}</td><td className="text-center">{ymd(e?.resignDate)}</td>
              {[l.a, l.b, l.c, l.d, l.e, l.target, l.f, l.g, l.diff].map((v, i) => <td key={i} className="text-right">{num(v)}</td>)}
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4} className="text-center">합계</td>
          <td className="text-right">{num(sum('a'))}</td><td className="text-right">{num(sum('b'))}</td><td className="text-right">{num(sum('c'))}</td>
          <td className="text-right">{num(sum('d'))}</td><td className="text-right">{num(sum('e'))}</td><td className="text-right">{num(sum('target'))}</td>
          <td className="text-right">{num(sum('f'))}</td><td className="text-right">{num(sum('g'))}</td><td className="text-right">{num(sum('diff'))}</td>
        </tr>
      </tfoot>
    </table>
  )
}

import type { EmployeeMaster, PayItem, Payslip } from '../../../types/api'
import { fmtNumberNz } from '../../../utils/format'

/** 원본 급여대장 머리 이름 — 우리 법정 공제 이름과 다른 것만 */
const LABEL: Record<string, string> = { 지방소득세: '주민세', 장기요양보험: '장기요양' }
const STATUTORY = ['소득세', '지방소득세', '국민연금', '건강보험', '고용보험', '장기요양보험']
const PER_ROW = 5

function chunk<T>(xs: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += PER_ROW) out.push(xs.slice(i, i + PER_ROW))
  return out.length ? out : [[]]
}

/**
 * 급여계산/대장 [급여대장] 조회 보고서(원본 E090106, 2026-10-04 실측).
 * 가운데 제목 'YYYY/MM 급여', 왼쪽 회사명 · 오른쪽 지급일자. 사원마다 여러 줄:
 * 첫 줄 성명 · 부서명, 마지막 줄 사원번호 · 직위/직급, 수당항목은 한 줄에 다섯(기본급 · 야근수당 …), 공제항목도 다섯(소득세 · 주민세 · 국민연금 …),
 * 지급총액 · 공제총액 · 실지급액은 그 사원 줄을 다 차지한다. 원본은 변동 수당 칸에 수량(9.5)을 같이 찍는데 우리 명세 줄에는 수량이 없어 금액만.
 *
 * <p>2026-10-13 다시 잼: 머리는 3줄(수당 두 줄 · 공제 두 줄 + 사원번호 · 직위/직급명 줄) — 항목이 끝난 다음 칸에
 * '수당항목 추가가능' · '공제항목 추가가능'. 끝에 [총합계] 줄(성명 · 부서명 두 칸을 합친 칸, 굵게 · 회색).
 * 칸: 12px · 선 1px --ec-line-ledger · 여백 없음(숫자 오른쪽 2px · 글자 왼쪽 2px) · 줄 높이 20 · 머리와 총합계 --ec-bg-ledger-head 700.
 * 출력물 공통(.ec-report) 칸 여백(머리 6 3 3 · 본문 3)과 달라 no-ec 로 공통 격자 규칙을 끄고 여기서만 그린다.
 */
const TBL = 'no-ec w-full whitespace-nowrap border-collapse text-[12px] [&_th]:h-[20px] [&_td]:h-[20px] [&_th]:p-0 [&_td]:py-0 ' +
  '[&_th]:border [&_td]:border [&_th]:border-solid [&_td]:border-solid [&_th]:border-[var(--ec-line-ledger)] [&_td]:border-[var(--ec-line-ledger)] ' +
  '[&_th]:bg-[var(--ec-bg-ledger-head)] [&_th]:font-bold [&_th]:text-center [&_th]:align-middle [&_td]:align-middle'
const NUM = 'text-right pr-[2px] pl-0'
const TXT = 'text-left pl-[2px] pr-0'
const SUM = 'bg-[var(--ec-bg-ledger-head)] font-bold'

export default function PayLedgerReport({ month, title, payDate, companyName, payslips, employees, items }: {
  month: string
  /** 대장명칭 — 원본 창 제목. 비면 'YYYY/MM 급여' */
  title?: string
  payDate: string | null
  companyName: string
  payslips: Payslip[]
  employees: EmployeeMaster[]
  items: PayItem[]
}) {
  const order = (kind: 'ALLOWANCE' | 'DEDUCTION') => {
    const used = new Set(payslips.flatMap((p) => p.lines.filter((l) => l.kind === kind).map((l) => l.name)))
    const master = items.filter((i) => i.kind === kind).map((i) => i.name)
    const head = kind === 'ALLOWANCE' ? ['기본급'] : STATUTORY
    const names = [...head, ...master.filter((n) => !head.includes(n))]
    return [...names.filter((n) => used.has(n) || head.includes(n)), ...[...used].filter((n) => !names.includes(n))]
  }
  const allowCols = chunk(order('ALLOWANCE'))
  const deductCols = chunk(order('DEDUCTION'))
  const bands = Math.max(allowCols.length, deductCols.length)
  const rows = bands + 1
  const cellsOf = (cols: string[][], band: number) => Array.from({ length: PER_ROW }, (_, i) => cols[band]?.[i] ?? null)
  /** 원본 머리: 마지막 항목 다음 칸 하나에 '수당항목 추가가능' · '공제항목 추가가능' */
  const headOf = (cols: string[][], band: number, hint: string) => {
    const flat = cols.flat()
    return cellsOf(cols, band).map((n, i) => n ? (LABEL[n] ?? n) : band * PER_ROW + i === flat.length ? hint : '')
  }
  const sumOf = (name: string, kind: 'ALLOWANCE' | 'DEDUCTION') => payslips.reduce((s, p) => s + amount(p, name, kind), 0)
  const total = payslips.reduce((a, p) => ({ gross: a.gross + p.grossPay, ded: a.ded + p.deductionTotal, net: a.net + p.netPay }), { gross: 0, ded: 0, net: 0 })
  const amount = (p: Payslip, name: string, kind: string) => {
    if (kind === 'ALLOWANCE' && name === '기본급') return p.baseSalary
    return p.lines.filter((l) => l.kind === kind && l.name === name).reduce((s, l) => s + Number(l.amount), 0)
  }

  return (
    <div className="overflow-x-auto">
      <div className="text-center text-[18px] font-bold mb-[8px]">{title || `${month.replace('-', '/')} 급여`}</div>
      <div className="flex justify-between mb-[4px]">
        <span>회사명 : {companyName}</span>
        <span>지급일자 : {payDate ? payDate.replace(/-/g, '/') : ''}</span>
      </div>
      <table className={TBL}>
        <thead>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {r === 0 && <><th rowSpan={bands}>성명</th><th rowSpan={bands}>부서명</th></>}
              {r === bands && <><th>사원번호</th><th>직위/직급명</th></>}
              {headOf(allowCols, r, '수당항목 추가가능').map((n, i) => <th key={`a${i}`}>{n}</th>)}
              {r === 0 && <th rowSpan={rows}>지급총액</th>}
              {headOf(deductCols, r, '공제항목 추가가능').map((n, i) => <th key={`d${i}`}>{n}</th>)}
              {r === 0 && <><th rowSpan={rows}>공제총액</th><th rowSpan={rows}>실지급액</th></>}
            </tr>
          ))}
        </thead>
        <tbody>
          {payslips.length === 0 ? (
            <tr><td colSpan={2 + PER_ROW * 2 + 3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : payslips.map((p) => {
            const e = employees.find((x) => x.id === p.employeeId)
            return Array.from({ length: rows }, (_, r) => (
              <tr key={`${p.id}-${r}`}>
                {r === 0 && <><td rowSpan={bands} className={TXT}>{p.employeeName}</td><td rowSpan={bands} className={TXT}>{p.department ?? ''}</td></>}
                {r === bands && <><td className={TXT}>{p.employeeCode}</td><td className={TXT}>{e?.jobTitle ?? ''}</td></>}
                {cellsOf(allowCols, r).map((n, i) => <td key={`a${i}`} className={NUM}>{n ? fmtNumberNz(amount(p, n, 'ALLOWANCE')) : ''}</td>)}
                {r === 0 && <td rowSpan={rows} className={NUM}>{fmtNumberNz(p.grossPay)}</td>}
                {cellsOf(deductCols, r).map((n, i) => <td key={`d${i}`} className={NUM}>{n ? fmtNumberNz(amount(p, n, 'DEDUCTION')) : ''}</td>)}
                {r === 0 && <><td rowSpan={rows} className={NUM}>{fmtNumberNz(p.deductionTotal)}</td><td rowSpan={rows} className={NUM}>{fmtNumberNz(p.netPay)}</td></>}
              </tr>
            ))
          })}
          {payslips.length > 0 && Array.from({ length: rows }, (_, r) => (
            <tr key={`sum-${r}`}>
              {r === 0 && <td rowSpan={rows} colSpan={2} className={`${SUM} text-center`}>총합계</td>}
              {cellsOf(allowCols, r).map((n, i) => <td key={`a${i}`} className={`${SUM} ${NUM}`}>{n ? fmtNumberNz(sumOf(n, 'ALLOWANCE')) : ''}</td>)}
              {r === 0 && <td rowSpan={rows} className={`${SUM} ${NUM}`}>{fmtNumberNz(total.gross)}</td>}
              {cellsOf(deductCols, r).map((n, i) => <td key={`d${i}`} className={`${SUM} ${NUM}`}>{n ? fmtNumberNz(sumOf(n, 'DEDUCTION')) : ''}</td>)}
              {r === 0 && <><td rowSpan={rows} className={`${SUM} ${NUM}`}>{fmtNumberNz(total.ded)}</td><td rowSpan={rows} className={`${SUM} ${NUM}`}>{fmtNumberNz(total.net)}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

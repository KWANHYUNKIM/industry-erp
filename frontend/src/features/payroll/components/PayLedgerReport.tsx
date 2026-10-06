import type { EmployeeMaster, PayItem, Payslip } from '../../../types/api'

const won = (n: number) => (n ? n.toLocaleString('ko-KR') : '')
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
 */
export default function PayLedgerReport({ month, payDate, companyName, payslips, employees, items }: {
  month: string
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
  const amount = (p: Payslip, name: string, kind: string) => {
    if (kind === 'ALLOWANCE' && name === '기본급') return p.baseSalary
    return p.lines.filter((l) => l.kind === kind && l.name === name).reduce((s, l) => s + Number(l.amount), 0)
  }

  return (
    <div className="overflow-x-auto">
      <div className="text-center text-[18px] font-bold mb-[8px]">{month.replace('-', '/')} 급여</div>
      <div className="flex justify-between mb-[4px]">
        <span>회사명 : {companyName}</span>
        <span>지급일자 : {payDate ? payDate.replace(/-/g, '/') : ''}</span>
      </div>
      <table className="ec-report w-full whitespace-nowrap">
        <thead>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {r === 0 && <><th rowSpan={bands}>성명</th><th rowSpan={bands}>부서명</th></>}
              {r === bands && <><th>사원번호</th><th>직위/직급명</th></>}
              {cellsOf(allowCols, r).map((n, i) => <th key={`a${i}`}>{n ? (LABEL[n] ?? n) : ''}</th>)}
              {r === 0 && <th rowSpan={rows}>지급총액</th>}
              {cellsOf(deductCols, r).map((n, i) => <th key={`d${i}`}>{n ? (LABEL[n] ?? n) : ''}</th>)}
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
                {r === 0 && <><td rowSpan={bands}>{p.employeeName}</td><td rowSpan={bands}>{p.department ?? ''}</td></>}
                {r === bands && <><td>{p.employeeCode}</td><td>{e?.jobTitle ?? ''}</td></>}
                {cellsOf(allowCols, r).map((n, i) => <td key={`a${i}`} className="text-right">{n ? won(amount(p, n, 'ALLOWANCE')) : ''}</td>)}
                {r === 0 && <td rowSpan={rows} className="text-right">{won(p.grossPay)}</td>}
                {cellsOf(deductCols, r).map((n, i) => <td key={`d${i}`} className="text-right">{n ? won(amount(p, n, 'DEDUCTION')) : ''}</td>)}
                {r === 0 && <><td rowSpan={rows} className="text-right">{won(p.deductionTotal)}</td><td rowSpan={rows} className="text-right">{won(p.netPay)}</td></>}
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}

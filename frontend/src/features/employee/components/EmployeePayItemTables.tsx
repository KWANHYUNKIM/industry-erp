import EcNumInput from '../../../components/EcNumInput'
import type { PayItem } from '../../../types/api'
import { fmtNumber } from '../../../utils/format'

const num = (s: string) => Number(String(s).replace(/,/g, '')) || 0

/**
 * 사원등록 [급여지급사항] 의 금액 표들 (원본 E090101, 2026-10-12 실측 — 2019-002 변종호).
 *
 * <p>&gt; 고정수당(기본급 + 지급유형 '고정' 수당, 끝 줄에 합계) · &gt; 일급수당(변동(일)) · &gt; 시급수당(변동(시간)) ·
 * &gt; 월정공제(공제항목). 머리는 '수당항목명 | 내역' · 공제는 '공제항목명 | 금액'. 빈 칸은 0 으로 보지 않고 비워 둔다 —
 * 급여계산이 그 항목을 그룹 · 기본금액대로 셈한다. 일급 · 시급수당 칸은 단가다(근무기록확정 × 단가).
 * 원본 '수당항목 추가가능' · '공제항목 추가가능' 자리는 수당항목등록 · 공제항목등록에서 항목을 늘리면 줄이 는다.
 */
export default function EmployeePayItemTables({ items, baseSalary, onBaseSalary, vals, onVal }: {
  items: PayItem[]
  baseSalary: string
  onBaseSalary: (raw: string) => void
  vals: Map<number, string>
  onVal: (id: number, raw: string) => void
}) {
  const active = items.filter((i) => i.active).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
  const fixed = active.filter((i) => i.kind === 'ALLOWANCE' && i.payMethod === 'FIXED' && i.name !== '기본급')
  const daily = active.filter((i) => i.kind === 'ALLOWANCE' && i.payMethod === 'DAILY')
  const hourly = active.filter((i) => i.kind === 'ALLOWANCE' && i.payMethod === 'HOURLY')
  const deduct = active.filter((i) => i.kind === 'DEDUCTION')
  const fixedTotal = num(baseSalary) + fixed.reduce((s, i) => s + num(vals.get(i.id) ?? ''), 0)

  const cell = (i: PayItem) => (
    <tr key={i.id}>
      <td>{i.name}</td>
      <td>
        <EcNumInput className="ec-input w-full text-right" aria-label={`${i.name} 금액`} value={vals.get(i.id) ?? ''}
                    onValue={(raw) => onVal(i.id, raw)} />
      </td>
    </tr>
  )
  const section = (title: string, head: string, col: string, list: PayItem[]) => (
    <>
      <p className="font-bold mt-[10px] mb-[4px]">&gt; {title}</p>
      <table className="w-full">
        <thead><tr><th>{head}</th><th className="w-[45%]">{col}</th></tr></thead>
        <tbody>
          {list.length === 0
            ? <tr><td colSpan={2} className="ec-empty">등록된 항목이 없습니다.</td></tr>
            : list.map(cell)}
        </tbody>
      </table>
    </>
  )

  return (
    <>
      <p className="font-bold mb-[4px]">&gt; 고정수당</p>
      <table className="w-full">
        <thead><tr><th>수당항목명</th><th className="w-[45%]">내역</th></tr></thead>
        <tbody>
          <tr>
            <td>기본급</td>
            <td>
              <EcNumInput className="ec-input w-full text-right" aria-label="기본급 금액" value={baseSalary} onValue={onBaseSalary} />
            </td>
          </tr>
          {fixed.map(cell)}
          <tr>
            <td></td>
            <td className="text-right font-bold">{fmtNumber(fixedTotal)}</td>
          </tr>
        </tbody>
      </table>
      {section('일급수당', '수당항목명', '내역', daily)}
      {section('시급수당', '수당항목명', '내역', hourly)}
      {section('월정공제', '공제항목명', '금액', deduct)}
    </>
  )
}

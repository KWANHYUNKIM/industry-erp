import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import { distribute, won } from '../types'

/**
 * 월별예산입력 창 — 원본 E020201 [예산] 칸 링크(2026-10-14 loginaa 실측).
 * 판: 기준년도 · 계정코드 · 부서 · 프로젝트 · 적요 / 연간예산총액 [액 ▾] [배분] / 1~12월 칸 + 분기 · 반기 · 예산총액 합.
 * [적용(F8)] 은 예산입력 창의 그 줄에만 넣는다(저장은 예산입력 창이 한다).
 */
export default function BudgetMonthModal({ open, year, accountLabel, deptLabel, projectLabel, months, remark, onApply, onClose }: {
  open: boolean
  year: number
  accountLabel: string
  deptLabel: string
  projectLabel: string
  months: number[]
  remark: string
  onApply: (months: number[], remark: string) => void
  onClose: () => void
}) {
  const [cells, setCells] = useState<string[]>([])
  const [memo, setMemo] = useState('')
  const [annual, setAnnual] = useState('0')
  const [mode, setMode] = useState<'AMT' | 'PCT'>('AMT')
  const reset = () => {
    setCells(months.map((m) => (m ? won(m) : '')))
    setMemo(remark)
    setAnnual('0')
    setMode('AMT')
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) reset() }, [open])

  const num = (s: string) => Number((s ?? '').replace(/[^0-9]/g, '')) || 0
  const vals = cells.map(num)
  const sum = (from: number, n: number) => vals.slice(from, from + n).reduce((s, v) => s + v, 0)
  const apply = () => onApply(vals, memo)

  const monthCell = (i: number) => (
    <>
      <th className="text-center w-[60px]">{i + 1}월</th>
      <td>
        <input className="ec-input w-full text-right" aria-label={`${i + 1}월`} value={cells[i] ?? ''}
               onChange={(e) => setCells((c) => c.map((v, j) => (j === i ? e.target.value.replace(/[^0-9,]/g, '') : v)))}
               onBlur={() => setCells((c) => c.map((v, j) => (j === i ? (num(v) ? won(num(v)) : '') : v)))} />
      </td>
    </>
  )

  return (
    <Modal open={open} title="월별예산입력" width={900} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); apply() } }}>
        <ul className="ec-form mb-[8px]">
          <li className="flex items-center gap-[6px] mb-[4px]"><span className="w-[110px] font-bold">기준년도</span><span>{year}</span></li>
          <li className="flex items-center gap-[6px] mb-[4px]"><span className="w-[110px] font-bold">계정코드</span><span>{accountLabel}</span></li>
          <li className="flex items-center gap-[6px] mb-[4px]"><span className="w-[110px] font-bold">부서</span><span>{deptLabel}</span></li>
          <li className="flex items-center gap-[6px] mb-[4px]"><span className="w-[110px] font-bold">프로젝트</span><span>{projectLabel}</span></li>
          <li className="flex items-center gap-[6px]">
            <span className="w-[110px] font-bold">적요</span>
            <input className="ec-input w-[420px]" placeholder="적요" aria-label="적요" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </li>
        </ul>
        <div className="flex items-center gap-[4px] mb-[6px]">
          <span className="font-bold mr-[6px]">연간예산총액</span>
          <input className="ec-input w-[140px] text-right" aria-label="연간예산총액" value={annual}
                 onChange={(e) => setAnnual(e.target.value.replace(/[^0-9,]/g, ''))} />
          <select className="ec-input w-[60px]" aria-label="배분 방법" value={mode} onChange={(e) => setMode(e.target.value as 'AMT' | 'PCT')}>
            <option value="AMT">액</option>
            <option value="PCT">%</option>
          </select>
          <button type="button" className="ec-btn" disabled={mode === 'PCT'}
                  onClick={() => setCells(distribute(num(annual)).map((v) => (v ? won(v) : '')))}>배분</button>
        </div>
        <table className="w-full text-left">
          <tbody>
            {[0, 1, 2, 3].map((q) => (
              <tr key={q}>
                {monthCell(q * 3)}
                {monthCell(q * 3 + 1)}
                {monthCell(q * 3 + 2)}
                <th className="text-center">{q + 1}/4분기기준</th>
                <td className="text-right w-[110px]">{won(sum(q * 3, 3))}</td>
                {q % 2 === 0 && (
                  <>
                    <th rowSpan={2} className="text-center">{q === 0 ? '상반기' : '하반기'}</th>
                    <td rowSpan={2} className="text-right w-[110px]">{won(sum(q * 3, 6))}</td>
                  </>
                )}
              </tr>
            ))}
            <tr className="ec-total">
              <td colSpan={8} className="text-center">예산총액</td>
              <td colSpan={2} className="text-right">{won(sum(0, 12))}</td>
            </tr>
          </tbody>
        </table>
        <div className="flex gap-[5px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}

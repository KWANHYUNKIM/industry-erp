import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../../../components/Modal'
import { api, extractErrorMessage } from '../../../api/client'
import type { EmployeeMaster, Payslip } from '../../../types/api'

interface ConfirmRow { employeeId: number; employeeCode: string; employeeName: string; payItemName: string; quantity: number }
interface Missing { code: string; name: string; item: string }
interface Late { code: string; name: string; hireDate: string; item: string }

const slash = (s: string) => s.replace(/-/g, '/')
const LATE_ITEMS = ['국민연금', '건강보험', '장기요양보험']

/**
 * 급여대장 창 [급여계산이 안되는 경우] (원본 E090106, 2026-10-13 실측 — 문구 그대로).
 * 1. 변동수당(일급 · 시급 · 지급률수당) — 근무기록확정에 수량이 있는데 명세에 그 수당이 없는(0) 사원.
 *    원본 열: 사원번호 · 사원명 · 수당명 · 급여지급사항 · 사원정보 수정. 우리는 [급여지급사항] 단가를 이 창에서 읽지 않아 그 칸은 비운다.
 * 2. 기타설정 및 입사일자 — 그 달 1일 이후 입사자(국민연금 · 건강보험 · 장기요양보험이 자동계산되지 않는다).
 *    원본 열: 사원번호 · 사원명 · 입사일자 · 공제명 · 기타설정 · 사원정보 수정. 기타설정 칸은 우리가 이 창에서 읽지 않아 비운다.
 */
export default function PayCalcHelp({ month, open, onClose, payslips, employees }: {
  month: string; open: boolean; onClose: () => void; payslips: Payslip[]; employees: EmployeeMaster[]
}) {
  const nav = useNavigate()
  const [missing, setMissing] = useState<Missing[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    api.get<ConfirmRow[]>('/work-records/confirms', { params: { from: month, to: month } })
      .then((r) => {
        const amountOf = (empId: number, item: string) => payslips.find((p) => p.employeeId === empId)?.lines
          .filter((l) => l.kind === 'ALLOWANCE' && l.name === item).reduce((s, l) => s + Number(l.amount), 0) ?? 0
        setMissing(r.data.filter((c) => Number(c.quantity) !== 0 && amountOf(c.employeeId, c.payItemName) === 0)
          .map((c) => ({ code: c.employeeCode, name: c.employeeName, item: c.payItemName })))
      })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [open, month, payslips])

  const first = `${month}-01`
  const late: Late[] = employees.filter((e) => e.hireDate && e.hireDate > first && e.hireDate.slice(0, 7) === month)
    .flatMap((e) => LATE_ITEMS.map((item) => ({ code: e.code, name: e.name, hireDate: e.hireDate as string, item })))
  const edit = <a href="#" onClick={(ev) => { ev.preventDefault(); nav('/hr/employees') }}>사원정보 수정</a>
  const empty = (n: number) => <tr><td colSpan={n} className="ec-empty">등록된 데이터가 없습니다.</td></tr>

  return (
    <Modal error={error} open={open} title="급여계산이 안되는 경우" width={760} onClose={onClose}>{(
      <>
        <p className="mb-[8px]">사원정보 수정 후, 재계산 해야 반영됩니다.</p>
        <p className="font-bold mb-[4px]">1. 변동수당 (일급, 시급, 지급률수당) 입력 확인 (사원등록 &gt; [급여지급사항탭])</p>
        <table className="w-full mb-[12px]">
          <thead><tr><th>사원번호</th><th>사원명</th><th>수당명</th><th>급여지급사항</th><th>사원정보 수정</th></tr></thead>
          <tbody>
            {missing.length === 0 ? empty(5) : missing.map((m, i) => (
              <tr key={i}><td>{m.code}</td><td>{m.name}</td><td>{m.item}</td><td></td><td className="text-center">{edit}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="font-bold mb-[4px]">2. 기타설정 및 입사일자 확인</p>
        <p className="mb-[4px]">- 당월 1일 이후 입사자는 해당월 국민연금, 건강보험, 장기요양보험은 자동계산되지 않습니다.</p>
        <table className="w-full">
          <thead><tr><th>사원번호</th><th>사원명</th><th>입사일자</th><th>공제명</th><th>기타설정</th><th>사원정보 수정</th></tr></thead>
          <tbody>
            {late.length === 0 ? empty(6) : late.map((m, i) => (
              <tr key={i}><td>{m.code}</td><td>{m.name}</td><td className="text-center">{slash(m.hireDate)}</td><td>{m.item}</td><td></td><td className="text-center">{edit}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </>
    )}</Modal>
  )
}

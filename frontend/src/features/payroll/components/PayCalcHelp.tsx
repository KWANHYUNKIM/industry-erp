import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../../../components/Modal'
import { api, extractErrorMessage } from '../../../api/client'
import type { EmployeeMaster, Payslip } from '../../../types/api'

interface ConfirmRow { employeeId: number; employeeCode: string; employeeName: string; payItemName: string; quantity: number }
interface Missing { code: string; name: string; item: string }
interface Late { id: number; code: string; name: string; hireDate: string }
interface Setting { healthMode: string; pensionMode: string; employmentMode: string; longTermCare: boolean }

const slash = (s: string) => s.replace(/-/g, '/')
/**
 * 원본 2번 표 — 한 사원에 네 줄(국민연금 · 건강보험 · 고용보험 · 장기요양), 사원번호 · 사원명 · 입사일자 · [수정] 은 네 줄을 합친 칸.
 * 기타설정 칸은 그 사원의 값(2026-10-14 loginaa 실측: '기준소득월액' · '안함' · '자동계산' · '가입'). 보수월액기준 · 미가입 글자는 재지 못해 라디오 이름 그대로.
 */
const mode = (m?: string) => (m === 'NONE' ? '안함' : m === 'BASE' ? '보수월액기준' : '자동계산')
const lateItems = (s?: Setting): [string, string][] => [
  ['국민연금', s?.pensionMode === 'NONE' ? '안함' : '기준소득월액'],
  ['건강보험', mode(s?.healthMode)],
  ['고용보험', mode(s?.employmentMode)],
  ['장기요양', s && !s.longTermCare ? '미가입' : '가입'],
]

/**
 * 급여대장 창 [급여계산이 안되는 경우] (원본 E090106, 2026-10-13 실측 — 문구 그대로).
 * 1. 변동수당(일급 · 시급 · 지급률수당) — 근무기록확정에 수량이 있는데 명세에 그 수당이 없는(0) 사원.
 *    원본 열: 사원번호 · 사원명 · 수당명 · 급여지급사항 · 사원정보 수정. 우리는 [급여지급사항] 단가를 이 창에서 읽지 않아 그 칸은 비운다.
 * 2. 기타설정 및 입사일자 — 그 달 2일 이후 입사자. 문구는 연금 · 건강 · 장기요양만 말하지만 원본은 고용보험까지 넷 다 셈하지 않는다
 *    (2026-10-14 실측, PayrollService.joinedAfterFirst). 원본 열: 사원번호 · 사원명 · 입사일자 · 공제명 · 기타설정 · 사원정보 수정.
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
        // 원본(2026-10-24 실측): 대장에 없는 사원(급여 대상 아님 — 홍재혁 야근 1)은 근무기록확정에 수량이 있어도 1번 표에 안 나온다.
        const inLedger = (empId: number) => payslips.some((p) => p.employeeId === empId)
        setMissing(r.data.filter((c) => Number(c.quantity) !== 0 && inLedger(c.employeeId) && amountOf(c.employeeId, c.payItemName) === 0)
          .map((c) => ({ code: c.employeeCode, name: c.employeeName, item: c.payItemName })))
      })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [open, month, payslips])

  const first = `${month}-01`
  const late: Late[] = employees.filter((e) => e.hireDate && e.hireDate > first && e.hireDate.slice(0, 7) === month)
    .map((e) => ({ id: e.id, code: e.code, name: e.name, hireDate: e.hireDate as string }))
  const lateKey = late.map((l) => l.id).join(',')
  const [settings, setSettings] = useState<Map<number, Setting>>(new Map())
  useEffect(() => {
    if (!open || !lateKey) return
    Promise.all(lateKey.split(',').map((id) => api.get<Setting>(`/pay-settings/employees/${id}/settings`)
      .then((r) => [Number(id), r.data] as const)))
      .then((rs) => setSettings(new Map(rs)))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [open, lateKey])
  const edit = <a href="#" onClick={(ev) => { ev.preventDefault(); nav('/hr/employees') }}>수정</a>
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
            {late.length === 0 ? empty(6) : late.flatMap((m) => lateItems(settings.get(m.id)).map(([item, value], i) => (
              <tr key={`${m.id}-${item}`}>
                {i === 0 && <><td rowSpan={4}>{m.code}</td><td rowSpan={4}>{m.name}</td><td rowSpan={4} className="text-center">{slash(m.hireDate)}</td></>}
                <td>{item}</td><td>{value}</td>
                {i === 0 && <td rowSpan={4} className="text-center">{edit}</td>}
              </tr>
            )))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </>
    )}</Modal>
  )
}

import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, Payslip } from '../../types/api'

const won = (n: number) => Number(n).toLocaleString('ko-KR')
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
function pick(label: string) {
  const n = new Date()
  const y = n.getFullYear(), m = n.getMonth()
  switch (label) {
    case '금월': return { from: ym(n), to: ym(n) }
    case '전월': { const p = ym(new Date(y, m - 1, 1)); return { from: p, to: p } }
    case '금년': return { from: `${y}-01`, to: `${y}-12` }
    case '전년': return { from: `${y - 1}-01`, to: `${y - 1}-12` }
    default: return { from: ym(new Date(y, m - 1, 1)), to: ym(n) }
  }
}

/**
 * 관리 &gt; 급여관리 &gt; 급여작업 &gt; <b>급여이체현황</b> (원본 E090117).
 *
 * <p>2026-10-03 loginaa 실측: 조건 판이 펼쳐진 현황 — 귀속연월(전월+금월) · 지급연월 · 급여대장 · 이체은행 · 정렬/소계기준.
 * 결과: 회사명 · 기간 머리 + 은행코드 · 은행명 · 계좌번호 · 예금주명 · 실지급액, 명세마다 한 줄(합계줄 없음). 버튼 인쇄 · Excel.
 * 은행 정보는 사원등록 [급여통장]에서 온다 — 비어 있으면 원본처럼 빈칸으로 찍는다.
 * 지급연월 · 급여대장 · 정렬/소계기준은 아직 없다.
 */
export default function PayTransferStatusPage() {
  const [range, setRange] = useState(pick('전월+금월'))
  const [bankCond, setBankCond] = useState('')
  const [slips, setSlips] = useState<Payslip[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '급여이체현황', [slips.length])

  function search() {
    setError('')
    api.get<Payslip[]>('/payslips/range', { params: { from: range.from, to: range.to } })
      .then((r) => setSlips(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    search()
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
  }, [])

  const byId = new Map(employees.map((e) => [e.id, e]))
  const shown = slips
    .map((p) => ({ p, e: byId.get(p.employeeId) }))
    .filter(({ e }) => !bankCond || (e?.bankName ?? '').includes(bankCond) || (e?.bankCode ?? '') === bankCond)

  return (
    <EcListShell title="급여이체현황" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="이체은행">
          <input className="ec-input w-[200px]" placeholder="이체은행" value={bankCond} onChange={(e) => setBankCond(e.target.value)} />
        </EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        {['금월', '전월', '전월+금월', '금년', '전년'].map((l) => (
          <button key={l} type="button" className="ec-btn" onClick={() => setRange(pick(l))}>{l}</button>
        ))}
      </div>
      <div className="text-center font-bold mb-[2px]">급여이체현황</div>
      <div className="text-ec-hint mb-[4px]">{range.from.replace('-', '/')}/01 ~ {range.to.replace('-', '/')}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>은행코드</th>
            <th>은행명</th>
            <th>계좌번호</th>
            <th>예금주명</th>
            <th className="text-right">실지급액</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map(({ p, e }) => (
            <tr key={p.id}>
              <td>{e?.bankCode ?? ''}</td>
              <td>{e?.bankName ?? ''}</td>
              <td>{e?.accountNo ?? ''}</td>
              <td>{e?.accountHolder ?? ''}</td>
              <td className="text-right">{won(p.netPay)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

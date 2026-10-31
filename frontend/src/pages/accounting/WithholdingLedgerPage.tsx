import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/codepicker/CodePickerField'
import QuickSearchSettingModal from '../../components/QuickSearchSettingModal'
import { EcCond, EcCondTabs } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { WithholdingLedgerEmployee } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { fmtNumberBlank } from '../../utils/format'

type Company = { name?: string; bizRegNo?: string; address?: string; addressDetail?: string }
type Status = '전체' | '재직자' | '퇴사자'

/**
 * 원천징수부 (원본 세무 › 원천징수 › 세무신고 E020116, 2026-10-03 loginaa 실측).
 *
 * 조건 [기준연월 · 사원 · 재직구분(전체 · 재직자 · 퇴사자)] → 목록 [사원번호 · 사원명 · 인쇄].
 * [인쇄]는 사원 한 사람의 <b>소득자별 근로소득 원천징수부</b>(별지 제25호 서식(1)) — 기준연월의 연도 1월부터
 * 기준연월까지 달마다 지급연월 · 총급여 · 계 · 소득세 · 지방소득세를 찍고 남은 달은 비운다.
 * 원본 예: 2026/10 기준 변종호 2026.01~10 급여 4,259,000 · 소득세 228,000 · 지방 22,800, 계 42,590,000 · 2,280,000 · 228,000.
 * 비과세(Ⅱ쪽, 식대 · 자가운전보조금 …)는 총급여에 넣지 않고 따로 적는다.
 * (31) 급여구간은 그 달 과세급여가 든 간이세액표 구간(원본 4,259,000 → 4,240,000~4,260,000, 2026-10-12).
 */
export default function WithholdingLedgerPage() {
  const [month, setMonth] = useState(ymd(new Date()).slice(0, 7))
  const [employee, setEmployee] = useState('')
  const [status, setStatus] = useState<Status>('재직자')   // 원본 기본 ◉재직자 (2026-10-13)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [all, setAll] = useState<WithholdingLedgerEmployee[]>([])
  const [rows, setRows] = useState<WithholdingLedgerEmployee[] | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [viewing, setViewing] = useState<WithholdingLedgerEmployee | null>(null)
  const [error, setError] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)

  useEffect(() => {
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  async function search(m = month) {
    setError('')
    try {
      const data = (await api.get<WithholdingLedgerEmployee[]>('/withholding/ledger', { params: { month: m } })).data
      setPicked(new Set())
      setAll(data)
      setRows(data.filter((e) =>
        (!employee || String(e.employeeId) === employee)
        && (status === '전체' || (status === '재직자') === !e.resignDate)))
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }

  const today = new Date()
  const ym = (y: number, mo: number) => `${y}-${String(mo).padStart(2, '0')}`
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const quick: [string, string][] = [
    ['금월(~오늘)', ym(today.getFullYear(), today.getMonth() + 1)],
    ['전월', ym(prev.getFullYear(), prev.getMonth() + 1)],
    ['금년', ym(today.getFullYear(), 12)],
    ['전년', ym(today.getFullYear() - 1, 12)],
  ]
  const list = rows ?? []
  const allPicked = list.length > 0 && picked.size === list.length
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <EcListShell title="원천징수부" searchable={false} collapseConditions={false} onSearch={() => search()} actions={[{ label: 'Email', disabled: true }, { label: '인쇄' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <QuickSearchSettingModal open={quickOpen} target="기준연월" onClose={() => setQuickOpen(false)} />

      <ul className="ec-cond mb-[8px]">
        {/* 원본(2026-10-22 실측): 판 맨 위 탭 [기본] [전체] [+], 처음엔 판이 펼쳐져 있고 [검색(F8)] 을 누르면 접히며 머리에 [Search(F3)] 가 남는다 */}
        <EcCondTabs />
        <EcCond label="기준연월">
          <input type="month" className="ec-input w-[150px]" value={month} onChange={(e) => setMonth(e.target.value)} />
        </EcCond>
        <EcCond label="사원" pick>
          <CodePickerField label="사원" hideLabel value={employee} onChange={setEmployee}
                           items={all.map((e) => ({ value: String(e.employeeId), code: e.employeeCode, name: e.employeeName }))} />
        </EcCond>
        <EcCond label="재직구분">
          {(['전체', '재직자', '퇴사자'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="whl-status" checked={status === v} onChange={() => setStatus(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={() => search()}>검색(F8)</button>
            {/* 원본 빠른선택 — 누르면 기준연월을 바꾸고 바로 조회한다(금월 2026/10 · 전월 2026/09 · 금년 2026/12 · 전년 2025/12) */}
            {quick.map(([label, m]) => (
              <button key={label} className="ec-btn" onClick={() => { setMonth(m); void search(m) }}>{label}</button>
            ))}
            <button className="ec-btn" onClick={() => setQuickOpen(true)}>설정</button>
            <button className="ec-btn" onClick={() => { setMonth(ymd(new Date()).slice(0, 7)); setEmployee(''); setStatus('재직자') }}>다시 작성</button>
          </div>
        </li>
      </ul>

      {rows && (
        <table className="w-full text-center">
          <thead>
            <tr><th className="w-[47px]"><input type="checkbox" aria-label="전체 선택" checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((e) => e.employeeId)))} /></th><th>사원번호</th><th>사원명</th><th>인쇄</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((e, i) => (
              <tr key={e.employeeId}>
                <td className="whitespace-nowrap">
                  <input type="checkbox" aria-label={`${e.employeeName} 선택`} checked={picked.has(e.employeeId)} onChange={() => toggle(e.employeeId)} />
                  {' '}{i + 1}
                </td>
                <td>{e.employeeCode}</td>
                <td>{e.employeeName}</td>
                <td><a href="#" onClick={(ev) => { ev.preventDefault(); setViewing(e) }}>인쇄</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewing && <LedgerModal emp={viewing} month={month} company={company} onClose={() => setViewing(null)} />}
    </EcListShell>
  )
}

function LedgerModal({ emp, month, company, onClose }: {
  emp: WithholdingLedgerEmployee; month: string; company: Company | null; onClose: () => void
}) {
  const year = month.slice(0, 4)
  const byMonth = new Map(emp.months.map((m) => [m.payMonth, m]))
  const slots = Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, '0')}`
    return { no: i + 1, ym, m: ym <= month ? byMonth.get(ym) : undefined }
  })
  const sum = (k: 'taxablePay' | 'nonTaxablePay' | 'incomeTax' | 'localIncomeTax') =>
    emp.months.reduce((t, m) => t + Number(m[k]), 0)
  const dot = (d?: string | null) => (d ? d.replace(/-/g, '.') : '')

  return (
    <Modal open title="원천징수부" onClose={onClose} width={960}>
      <table className="w-full ec-report mb-[8px]">
        <tbody>
          <tr><th>① 귀속연도</th><td colSpan={3}>{year}</td><th colSpan={2}>소 득 자 별 근 로 소 득 원 천 징 수 부</th></tr>
          <tr>
            <th rowSpan={2}>징수의무자</th>
            <th>② 법인명(상호)</th><td>{company?.name ?? ''}</td>
            <th>③ 사업자등록번호</th><td colSpan={2}>{company?.bizRegNo ?? ''}</td>
          </tr>
          <tr><th>④ 근무처</th><td colSpan={4}>{[company?.address, company?.addressDetail].filter(Boolean).join(' ')}</td></tr>
          <tr>
            <th>소 득 자</th>
            <th>⑤ 성명</th><td>{emp.employeeName}</td>
            <th>⑦ 입사일 · 퇴사일</th><td colSpan={2}>{dot(emp.hireDate)}{emp.resignDate ? ` · ${dot(emp.resignDate)}` : ''}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-[12px] font-bold mb-[4px]">Ⅰ. 근 로 소 득 지 급 명 세</p>
      <table className="w-full ec-report">
        <thead>
          <tr>
            <th rowSpan={2}>월별</th>
            <th rowSpan={2}>(15) 지급연월</th>
            <th colSpan={3}>1. 총 급 여</th>
            <th rowSpan={2}>(31) 급여구간</th>
            <th colSpan={2}>2. 징수세액</th>
            <th rowSpan={2}>비과세 합계<br />(Ⅱ쪽)</th>
          </tr>
          <tr>
            <th>(16) 급여</th><th>(17) 상여</th><th>(30) 계</th>
            <th>(34) 소득세계</th><th>(35) 지방소득세</th>
          </tr>
        </thead>
        <tbody>
          {slots.map(({ no, ym, m }) => (
            <tr key={no}>
              <td className="text-center">{no}</td>
              <td className="text-center">{m ? ym.replace('-', '.') : ''}</td>
              <td className="text-right">{m ? fmtNumberBlank(m.taxablePay) : ''}</td>
              <td className="text-right"></td>
              <td className="text-right">{m ? fmtNumberBlank(m.taxablePay) : ''}</td>
              <td className="text-center whitespace-nowrap">{m?.payBracket ?? ''}</td>
              <td className="text-right">{m ? fmtNumberBlank(m.incomeTax) : ''}</td>
              <td className="text-right">{m ? fmtNumberBlank(m.localIncomeTax) : ''}</td>
              <td className="text-right">{m ? fmtNumberBlank(m.nonTaxablePay) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={2} className="text-center">계</td>
            <td className="text-right">{fmtNumberBlank(sum('taxablePay'))}</td>
            <td className="text-right"></td>
            <td className="text-right">{fmtNumberBlank(sum('taxablePay'))}</td>
            <td></td>
            <td className="text-right">{fmtNumberBlank(sum('incomeTax'))}</td>
            <td className="text-right">{fmtNumberBlank(sum('localIncomeTax'))}</td>
            <td className="text-right">{fmtNumberBlank(sum('nonTaxablePay'))}</td>
          </tr>
        </tfoot>
      </table>
      <div className="flex gap-[6px] mt-[12px]">
        <button className="ec-btn" onClick={() => window.print()}>인쇄</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

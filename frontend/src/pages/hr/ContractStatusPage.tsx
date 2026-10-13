import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { ContractStatus, EmploymentContract } from '../../types/api'
import { ymd } from '../../utils/periods'

type Pill = '전체' | '진행중' | '취소' | '완료'
/** 원본 진행상태 — 우리 발송 = 진행중, 해지 = 취소, 서명완료 = 완료. 작성(발송 전)은 이 현황에 없다. */
const PILL_STATUS: Record<Exclude<Pill, '전체'>, ContractStatus> = { 진행중: 'SENT', 취소: 'TERMINATED', 완료: 'SIGNED' }
const STATUS_NAME: Partial<Record<ContractStatus, string>> = { SENT: '진행중', TERMINATED: '취소', SIGNED: '완료' }
const slash = (s: string) => s.replace(/-/g, '/')
const dt = (s: string | null) => (s ? `${slash(s.slice(0, 10))} ${s.slice(11, 16)}` : '')
/** 원본 [Search(F3)] 빠른선택(2026-10-04 실측) — 끝의 [3개월]은 석 달 전 1일 ~ 오늘(처음 기간과 같다). */
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일', '최근7일'] as const
const threeMonths = () => { const d = new Date(); return { from: ymd(new Date(d.getFullYear(), d.getMonth() - 3, 1)), to: ymd(d) } }

/**
 * 관리 &gt; 전자근로계약 &gt; <b>근로계약현황</b> (원본 E061104).
 *
 * <p>2026-10-03 loginaa 실측: [전체] · [진행중] · [취소] · [완료] 알약, 기간 석 달 전 1일 ~ 오늘(2026/07/01 ~ 2026/10/03),
 * 격자 요청일시 · 계약서명 · 진행상태 · 최종수정일자 · 만료일 · 요청기능 · 문서 · 구분명. 버튼 선택삭제 · Excel.
 * 원본은 [요청]한 계약만 여기 뜬다 — 우리는 발송 · 서명완료 · 해지 계약(작성은 근로계약서진행단계에만).
 * 계약서명은 '계약번호 사원명 근로계약서', 만료일은 계약 종료일, 구분명은 정규직 · 계약직 · 일용직.
 * 원본 [요청]은 사원에게 메일 · 문자로 서명을 청한다(바깥 발송이라 원본에서 누르지 않았다) — 우리 발송은 상태만 바꾼다.
 * 요청기능(요청취소 · 재요청) · 선택삭제는 근로계약서진행단계에서 한다.
 * 조건 판은 접혀 있고 [Search(F3)]로 편다 — 기준일자(요청일) · 계약서명. 최초작성자 · 최종수정자는 계약에 작성자를 담지 않아 없다.
 */
export default function ContractStatusPage() {
  const nav = useNavigate()
  const [pill, setPill] = useState<Pill>('전체')
  const [range, setRange] = useState(threeMonths())
  const [nameCond, setNameCond] = useState('')
  const [rows, setRows] = useState<EmploymentContract[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  useEffect(() => {
    api.get<EmploymentContract[]>('/employment-contracts').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [])

  const shown = rows
    .filter((r) => r.status !== 'DRAFT' && r.sentAt)
    .filter((r) => pill === '전체' || r.status === PILL_STATUS[pill])
    .filter((r) => r.sentAt!.slice(0, 10) >= range.from && r.sentAt!.slice(0, 10) <= range.to)
    .filter((r) => !nameCond || `${r.contractNo} ${r.employeeName} 근로계약서`.includes(nameCond))
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))
  useTableColumnCheck(tableRef, '근로계약현황', [shown.length])

  return (
    <EcListShell title="근로계약현황" searchable={false} collapseConditions actions={[{ label: 'Excel' }]}>
      <div className="ec-pills mb-[8px]">
        {(['전체', '진행중', '취소', '완료'] as const).map((p) => (
          <button key={p} type="button" className={`ec-pill${pill === p ? ' active' : ''}`} onClick={() => setPill(p)}>{p}</button>
        ))}
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[150px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="date" className="ec-input w-[150px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="계약서명"><input className="ec-input w-full" placeholder="계약서명" value={nameCond} onChange={(e) => setNameCond(e.target.value)} /></EcCond>
        <li className="flex flex-wrap items-center gap-[6px]">
          <EcPeriodPicks labels={PICKS} currentFrom={range.from} onPick={setRange} />
          <button type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(threeMonths())}>3개월</button>
        </li>
      </ul>
      <div className="text-right text-ec-hint mb-[6px]">{slash(range.from)} ~ {slash(range.to)}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">요청일시</th>
            <th>계약서명</th>
            <th className="text-center">진행상태</th>
            <th className="text-center">최종수정일자</th>
            <th className="text-center">만료일</th>
            <th className="text-center">문서</th>
            <th>구분명</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">{dt(r.sentAt)}</td>
              <td>{r.contractNo} {r.employeeName} 근로계약서</td>
              <td className="text-center">{STATUS_NAME[r.status] ?? r.statusName}</td>
              <td className="text-center">{dt(r.updatedAt)}</td>
              <td className="text-center">{r.endDate ? slash(r.endDate) : ''}</td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); nav('/hr/contracts') }}>보기</a></td>
              <td>{r.typeName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

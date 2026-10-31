import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../../components/EcListShell'
import EcPeriodPicks from '../../../components/EcPeriodPicks'
import { EcCond } from '../../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import type { BusinessContract, BusinessContractStatus } from '../../../types/api'
import { ymd } from '../../../utils/periods'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import { ECONTRACT_LINK_NEEDED } from './EContractProgressPage'
import { EcDateRange } from '../../../components/ui/EcDateInput'

type Pill = '전체' | '진행중' | '취소' | '완료'
/** 원본 진행상태 — 우리 서명요청 = 진행중, 해지 = 취소, 서명완료 = 완료. 작성(요청 전)은 계약서진행단계에만. */
const PILL_STATUS: Record<Exclude<Pill, '전체'>, BusinessContractStatus> = { 진행중: 'SENT', 취소: 'TERMINATED', 완료: 'SIGNED' }
const STATUS_NAME: Partial<Record<BusinessContractStatus, string>> = { SENT: '진행중', TERMINATED: '취소', SIGNED: '완료' }
const slash = (s: string) => s.replace(/-/g, '/')
const dt = (s: string | null) => (s ? `${slash(s.slice(0, 10))} ${s.slice(11, 16)}` : '')
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일', '최근7일'] as const
/** 원본 처음 기간 — 석 달 전 1일 ~ 오늘(2026-10-20 실측 2026/07/01 ~ 2026/10/20). */
const threeMonths = () => { const d = new Date(); return { from: ymd(new Date(d.getFullYear(), d.getMonth() - 3, 1)), to: ymd(d) } }

/**
 * 회계 II &gt; 전자계약 &gt; <b>계약서현황</b> (원본 E061102).
 *
 * <p>2026-10-20 loginaa 실측: [전체] · [진행중] · [취소] · [완료] 알약, 기간 석 달 전 1일 ~ 오늘,
 * 격자 □ · 요청일시 · 계약서명 · 진행상태 · 최종수정일자 · 만료일 · 요청기능 · 문서 · 구분명, 아래 선택삭제 · Excel(원본 자료 없음).
 * 관리 &gt; 근로계약현황(E061104)과 같은 엔진이라 그 화면 꼴을 따랐다.
 * 요청기능(요청취소 · 재요청)은 바깥 발송이라 '연동 필요' 안내만 띄운다. [선택삭제]는 서명 · 해지된 계약을 서버가 막는다.
 */
export default function EContractStatusPage() {
  const nav = useNavigate()
  const [pill, setPill] = useState<Pill>('전체')
  const [range, setRange] = useState(threeMonths())
  const [nameCond, setNameCond] = useState('')
  const [rows, setRows] = useState<BusinessContract[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)

  const load = () => {
    api.get<BusinessContract[]>('/contracts').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(load, [])

  async function deleteChecked() {
    if (checked.size === 0 || !(await ecConfirm('삭제하겠습니까?'))) return
    setError('')
    try {
      for (const id of checked) await api.delete(`/contracts/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const shown = rows
    .filter((r) => r.status !== 'DRAFT' && r.sentAt)
    .filter((r) => pill === '전체' || r.status === PILL_STATUS[pill])
    .filter((r) => r.sentAt!.slice(0, 10) >= range.from && r.sentAt!.slice(0, 10) <= range.to)
    .filter((r) => !nameCond || r.title.includes(nameCond))
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))
  useTableColumnCheck(tableRef, '계약서현황', [shown.length])

  return (
    <EcListShell title="계약서현황" searchable={false} collapseConditions actions={[{ label: '선택삭제', onClick: deleteChecked, selected: checked.size }, { label: 'Excel' }]}>
      <div className="ec-pills mb-[8px]">
        {(['전체', '진행중', '취소', '완료'] as const).map((p) => (
          <button key={p} type="button" className={`ec-pill${pill === p ? ' active' : ''}`} onClick={() => setPill(p)}>{p}</button>
        ))}
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[150px]", value: range.from, onChange: (e) => setRange({ ...range, from: e.target.value }) }} to={{ className: "ec-input w-[150px]", value: range.to, onChange: (e) => setRange({ ...range, to: e.target.value }) }} />
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
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} />
            </th>
            <th className="text-center">요청일시</th>
            <th>계약서명</th>
            <th className="text-center">진행상태</th>
            <th className="text-center">최종수정일자</th>
            <th className="text-center">만료일</th>
            <th className="text-center">요청기능</th>
            <th className="text-center">문서</th>
            <th>구분명</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)}
                       onChange={(e) => { const n = new Set(checked); if (e.target.checked) n.add(r.id); else n.delete(r.id); setChecked(n) }} />
              </td>
              <td className="text-center">{dt(r.sentAt)}</td>
              <td>{r.title}<span className="text-ec-hint">_{r.partnerName}</span></td>
              <td className="text-center">{STATUS_NAME[r.status] ?? r.statusName}</td>
              <td className="text-center">{dt(r.updatedAt)}</td>
              <td className="text-center">{slash(r.endDate)}</td>
              <td className="text-center">
                <span className="inline-flex gap-[6px]">
                  {(['요청취소', '재요청'] as const).map((l) => (
                    <a key={l} href="#" className="text-ec-hint" onClick={(e) => { e.preventDefault(); void ecAlert(ECONTRACT_LINK_NEEDED) }}>{l}</a>
                  ))}
                </span>
              </td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); nav('/accounting/contracts') }}>보기</a></td>
              <td>{r.typeName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

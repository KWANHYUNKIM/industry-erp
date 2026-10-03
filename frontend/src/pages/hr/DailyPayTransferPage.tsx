import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { lastDay, monthRange, won, type DailyReportLine } from '../../features/dailypay/report'

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 급여작업 &gt; <b>일용근로 급여이체현황</b> (원본 E020133).
 *
 * <p>2026-10-03 loginaa 실측: 조건 귀속연월(금월 2026/10 ~ 2026/10) · 지급연월(사용) · 급여대장 · 이체은행 · 정렬/소계기준,
 * 빠른선택 전월 · 금년 · 전년 · 금월 · 금년(~오늘). 결과 '급여이체현황' · 회사명 · 기간, 격자 급여통장 은행코드 · 급여통장 은행명 ·
 * 계좌번호 · 예금주 · 실지급액(줄마다, 합계 없음). 은행 정보는 일용근로 사원등록 [급여통장]에서 온다(비면 빈칸 — 원본도 그랬다).
 * 은행코드 · 지급연월 · 급여대장 조건 · 정렬/소계기준은 없다.
 */
export default function DailyPayTransferPage() {
  const [range, setRange] = useState(monthRange('금월'))
  const [shown, setShown] = useState(range)
  const [bankCond, setBankCond] = useState('')
  const [rows, setRows] = useState<DailyReportLine[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<DailyReportLine[]>('/hr/daily-pay-ledgers/lines', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShown(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const list = rows.filter((r) => !bankCond || (r.bankName ?? '').includes(bankCond))
  useTableColumnCheck(tableRef, '일용근로 급여이체현황', [list.length])
  const ytd = () => { const r = monthRange('금년'); return { from: r.from, to: new Date().toISOString().slice(0, 7) } }

  return (
    <EcListShell title="일용근로 급여이체현황" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="이체은행"><input className="ec-input w-[200px]" placeholder="이체은행" value={bankCond} onChange={(e) => setBankCond(e.target.value)} /></EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        {['전월', '금년', '전년', '금월'].map((l) => (
          <button key={l} type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(monthRange(l))}>{l}</button>
        ))}
        <button type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(ytd())}>금년(~오늘)</button>
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="text-center font-bold mb-[2px]">급여이체현황</div>
      <div className="text-ec-hint mb-[4px]">{shown.from.replace('-', '/')}/01 ~ {lastDay(shown.to).replace(/-/g, '/')}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>급여통장 은행명</th>
            <th>계좌번호</th>
            <th>예금주</th>
            <th className="text-right">실지급액</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : list.map((r) => (
            <tr key={r.lineId}>
              <td>{r.bankName ?? ''}</td>
              <td>{r.accountNo ?? ''}</td>
              <td>{r.accountHolder ?? ''}</td>
              <td className="text-right">{won(r.netPay)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

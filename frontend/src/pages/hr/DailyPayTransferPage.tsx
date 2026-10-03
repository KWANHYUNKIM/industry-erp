import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import { BANK_CODES } from '../../utils/bankCodes'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { lastDay, monthRange, won, type DailyReportLine } from '../../features/dailypay/report'

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 급여작업 &gt; <b>일용근로 급여이체현황</b> (원본 E020133).
 *
 * <p>2026-10-03 loginaa 실측: 조건 귀속연월(금월 2026/10 ~ 2026/10) · 지급연월(사용) · 급여대장 · 이체은행 · 정렬/소계기준,
 * 빠른선택 전월 · 금년 · 전년 · 금월 · 금년(~오늘). 결과 '급여이체현황' · 회사명 · 기간, 격자 급여통장 은행코드 · 급여통장 은행명 ·
 * 계좌번호 · 예금주 · 실지급액(줄마다, 합계 없음). 은행 정보는 일용근로 사원등록 [급여통장]에서 온다(비면 빈칸 — 원본도 그랬다).
 * 지급연월([사용]) · 급여대장 · 이체은행은 여러 개 고르는 코드도움. 일용 사원은 은행 이름만 들고 있어 은행코드는 원본 은행코드표
 * (utils/bankCodes)에서 이름으로 찾아 찍는다(표에 없는 이름이면 빈칸). 정렬/소계기준은 없다.
 */
export default function DailyPayTransferPage() {
  const [range, setRange] = useState(monthRange('금월'))
  const [shown, setShown] = useState(range)
  const [usePaid, setUsePaid] = useState(false)
  const [paidRange, setPaidRange] = useState(range)
  const [ledgerCond, setLedgerCond] = useState<string[]>([])
  const [bankCond, setBankCond] = useState<string[]>([])
  const [rows, setRows] = useState<DailyReportLine[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<DailyReportLine[]>('/hr/daily-pay-ledgers/lines', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShown(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const codeOf = (name: string | null) => BANK_CODES.find(([, n]) => n === name)?.[0] ?? ''
  const ledgers = [...new Map(rows.map((r) => [r.ledgerId, r])).values()]
  const list = rows.filter((r) => (!usePaid || (r.paidMonth >= paidRange.from && r.paidMonth <= paidRange.to))
    && (ledgerCond.length === 0 || ledgerCond.includes(String(r.ledgerId)))
    && (bankCond.length === 0 || bankCond.includes(codeOf(r.bankName))))
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
        <EcCond label="지급연월">
          {usePaid && (
            <>
              <input type="month" className="ec-input w-[140px]" aria-label="지급연월 시작" value={paidRange.from} onChange={(e) => setPaidRange({ ...paidRange, from: e.target.value })} />
              ~
              <input type="month" className="ec-input w-[140px]" aria-label="지급연월 끝" value={paidRange.to} onChange={(e) => setPaidRange({ ...paidRange, to: e.target.value })} />
            </>
          )}
          <label className="inline-flex items-center gap-[4px] ml-[6px]">
            <input type="checkbox" checked={usePaid} onChange={(e) => { setUsePaid(e.target.checked); if (e.target.checked) setPaidRange(range) }} /> 사용
          </label>
        </EcCond>
        <EcCond label="급여대장">
          <CodePickerField label="급여대장" hideLabel fill multiple placeholder="급여대장" values={ledgerCond} onChangeMulti={(v) => setLedgerCond(v)}
                           items={ledgers.map((r) => ({ value: String(r.ledgerId), code: `${r.payMonth.replace('-', '/')}-${r.seq}`, name: r.ledgerName }))} />
        </EcCond>
        <EcCond label="이체은행">
          <CodePickerField label="이체은행" hideLabel fill multiple placeholder="이체은행" values={bankCond} onChangeMulti={(v) => setBankCond(v)}
                           items={BANK_CODES.map(([code, name]) => ({ value: code, code, name }))} />
        </EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        {['전월', '금년', '전년', '금월'].map((l) => (
          <button key={l} type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(monthRange(l))}>{l}</button>
        ))}
        <button type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(ytd())}>금년(~오늘)</button>
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <EcReportHead title="급여이체현황" period={reportPeriod(`${shown.from}-01`, lastDay(shown.to))} />
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>급여통장 은행코드</th>
            <th>급여통장 은행명</th>
            <th>계좌번호</th>
            <th>예금주</th>
            <th className="text-right">실지급액</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : list.map((r) => (
            <tr key={r.lineId}>
              <td>{codeOf(r.bankName)}</td>
              <td>{r.bankName ?? ''}</td>
              <td>{r.accountNo ?? ''}</td>
              <td>{r.accountHolder ?? ''}</td>
              <td className="text-right">{won(r.netPay)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <EcReportFoot />
    </EcListShell>
  )
}

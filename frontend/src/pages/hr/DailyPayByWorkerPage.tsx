import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dedTotal, deductionColumns, lastDay, monthRange, slashYm, won, type DailyReportLine } from '../../features/dailypay/report'
import { ecConfirm } from '../../components/EcDialog'
import Modal from '../../components/Modal'
import DailyPayBulkEdit from '../../features/dailypay/components/DailyPayBulkEdit'
import NumCheck from '../../components/NumCheck'

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 급여작업 &gt; <b>일용근로 사원별급여조회</b> (원본 E020135).
 *
 * <p>2026-10-03 loginaa 실측: [전체] · [미발송] 알약, 기간 전월+금월(2026/09/01 ~ 2026/10/31), 격자 귀속연월 · 사원코드 · 성명 ·
 * 지급총액 · 공제(전체) · 공제총액 · 실지급액 · 인쇄. 버튼 Email · 인쇄 · 선택삭제 · Excel. 빈 목록 '등록된 데이터가 없습니다.'
 * 공제(전체)는 소득세 · 지방소득세를 잇는다. [미발송] · Email · 명세서 인쇄는 없다(명세 메일을 보내지 않는다).
 * 조건 판은 접혀 있고 [Search(F3)]로 편다(원본 실측) — 급여대장 · 귀속연월 · 지급연월([사용]) · 사원,
 * 빠른선택 전월 · 전월+금월 · 금년 · 전년 · 종료월 · 금월. 급여대장 · 사원은 여러 개 고르는 코드도움.
 *
 * <p>2026-10-14 원본 재측: 줄은 사원코드 순(00000 QA관리-순서 · 00001 잠깐만 · 00002 나일당), [귀속연월]은 'YYYY/MM' 링크 —
 * 그 사원 한 줄만 '급여내역수정'(대장 일괄수정과 같은 창)을 연다. 끝 열 [인쇄] 링크 → '급여명세서' 창(대장 이름 · 회사 ·
 * 지급일 · 사원번호 · 성명, 과세총액 · 비과세총액, 수당항목명 · 최종근무일 · 근무기록 · 금액 · 산출방법, 지급총액,
 * '지급총액 - 공제총액 = 실지급액 : n'). [선택삭제] 확인 문구 '삭제하겠습니까?' → 안내 없이 사라짐(근무기록확정은 남는다).
 */
export default function DailyPayByWorkerPage() {
  /** 일용근로 급여계산/대장 [명세서 조회]에서 오면 ?ledger=대장id&month=YYYY-MM — 그 대장 한 달로 연다(원본과 같다). */
  const [params] = useSearchParams()
  const fromLedger = params.get('ledger')
  const fromMonth = params.get('month')
  const [range, setRange] = useState(fromMonth ? { from: fromMonth, to: fromMonth } : monthRange('전월+금월'))
  const [shownRange, setShownRange] = useState(range)
  const [ledgerCond, setLedgerCond] = useState<string[]>(fromLedger ? [fromLedger] : [])
  const [usePaid, setUsePaid] = useState(false)
  const [paidRange, setPaidRange] = useState(range)
  const [workerCond, setWorkerCond] = useState<string[]>([])
  const [workers, setWorkers] = useState<{ id: number; code: string; name: string }[]>([])
  useEffect(() => {
    api.get<typeof workers>('/hr/daily-workers').then((r) => setWorkers(r.data)).catch(() => setWorkers([]))
  }, [])
  const [rows, setRows] = useState<DailyReportLine[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [editLine, setEditLine] = useState<DailyReportLine | null>(null)
  const [slip, setSlip] = useState<DailyReportLine | null>(null)
  const [company, setCompany] = useState<{ name: string; bizRegNo: string }>({ name: '', bizRegNo: '' })
  useEffect(() => {
    api.get<{ name: string; bizRegNo: string | null }>('/company')
      .then((r) => setCompany({ name: r.data.name ?? '', bizRegNo: r.data.bizRegNo ?? '' })).catch(() => {})
  }, [])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일용근로 사원별급여조회', [rows.length, ledgerCond.length, workerCond.length])

  function load() {
    setError('')
    api.get<DailyReportLine[]>('/hr/daily-pay-ledgers/lines', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShownRange(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])
  const ledgers = [...new Map(rows.map((r) => [r.ledgerId, r])).values()]
  const shown = rows.filter((r) => (ledgerCond.length === 0 || ledgerCond.includes(String(r.ledgerId)))
    && (!usePaid || (r.paidMonth >= paidRange.from && r.paidMonth <= paidRange.to))
    && (workerCond.length === 0 || workerCond.includes(String(r.workerId))))

  async function deleteChecked() {
    if (checked.size === 0 || !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const id of checked) await api.delete(`/hr/daily-pay-ledgers/lines/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.lineId))
  const dedCols = deductionColumns(shown)
  /** 소득세 · 지방소득세 칸 — 더한 공제만 있고 세금이 모두 0 이면 원본처럼 그 항목 열만(2026-10-21). */
  const taxCol = dedCols.length === 0 || shown.some((r) => Number(r.incomeTax) + Number(r.localTax) !== 0)

  return (
    <EcListShell title="일용근로 사원별급여조회" searchable={false} collapseConditions
                 actions={[{ label: '인쇄' }, { label: '선택삭제', onClick: deleteChecked, selected: checked.size }, { label: 'Excel' }]}>
      <div className="ec-pills mb-[8px]"><button type="button" className="ec-pill active">전체</button></div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="급여대장">
          <CodePickerField label="급여대장" hideLabel fill multiple placeholder="급여대장" values={ledgerCond} onChangeMulti={(v) => setLedgerCond(v)}
                           items={ledgers.map((r) => ({ value: String(r.ledgerId), code: `${r.payMonth.replace('-', '/')}-${r.seq}`, name: r.ledgerName }))} />
        </EcCond>
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
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={workerCond} onChangeMulti={(v) => setWorkerCond(v)}
                           items={workers.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
        </EcCond>
        <li className="flex flex-wrap items-center gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={load}>검색(F8)</button>
          {['전월', '전월+금월', '금년', '전년'].map((l) => (
            <button key={l} type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(monthRange(l))}>{l}</button>
          ))}
          <button type="button" className="ec-btn ec-btn-pick" onClick={() => setRange({ ...range, to: monthRange('금월').to })}>종료월</button>
          <button type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(monthRange('금월'))}>금월</button>
        </li>
      </ul>
      <div className="text-right text-ec-hint mb-[6px]">{shownRange.from.replace('-', '/')}/01 ~ {lastDay(shownRange.to).replace(/-/g, '/')}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <NumCheck head no="" label="전체 선택" on={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((r) => r.lineId)))} />
            </th>
            <th className="text-center">귀속연월</th>
            <th>사원코드</th>
            <th>성명</th>
            <th className="text-right">지급총액</th>
            {taxCol && <th className="text-right">공제(전체)</th>}
            {dedCols.map((c) => <th key={c.itemId} className="text-right">{c.name}</th>)}
            <th className="text-right">공제총액</th>
            <th className="text-right">실지급액</th>
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8 + dedCols.length + (taxCol ? 1 : 0)} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const tax = Number(r.incomeTax) + Number(r.localTax)
            const ded = dedTotal(r)
            return (
              <tr key={r.lineId}>
                <td className="text-center">
                  <NumCheck no={i + 1} label="선택" on={checked.has(r.lineId)}
                            onChange={() => { const n = new Set(checked); if (n.has(r.lineId)) n.delete(r.lineId); else n.add(r.lineId); setChecked(n) }} />
                </td>
                <td className="text-center">
                  <a href="#" onClick={(e) => { e.preventDefault(); setEditLine(r) }}>{slashYm(r.payMonth)}</a>
                </td>
                <td>{r.workerCode}</td>
                <td>{r.workerName}</td>
                <td className="text-right">{won(r.grossPay)}</td>
                {taxCol && <td className="text-right">{tax ? `소득세 ${won(r.incomeTax)} · 지방소득세 ${won(r.localTax)}` : ''}</td>}
                {dedCols.map((c) => {
                  const it = (r.items ?? []).find((x) => x.itemId === c.itemId)
                  return <td key={c.itemId} className="text-right">{it ? won(it.amount) : ''}</td>
                })}
                <td className="text-right">{ded ? won(ded) : ''}</td>
                <td className="text-right">{won(r.netPay)}</td>
                <td className="text-center">
                  <a href="#" onClick={(e) => { e.preventDefault(); setSlip(r) }}>인쇄</a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <DailyPayBulkEdit ledger={editLine ? { id: editLine.ledgerId, payMonth: editLine.payMonth, seq: editLine.seq, paidMonth: editLine.paidMonth } : null}
                        lineIds={editLine ? [editLine.lineId] : undefined} bizRegNo={company.bizRegNo}
                        onClose={() => setEditLine(null)} onSaved={() => { setEditLine(null); load() }} />
      <Modal error={error} open={!!slip} title="급여명세서" width={760} onClose={() => setSlip(null)}>
        {slip && (
          <div>
            <div className="text-center font-bold mb-[6px]">{slip.ledgerName}</div>
            <div className="text-center mb-[6px]">{company.name}</div>
            <div className="flex justify-between mb-[6px]">
              <span>지급일 : {slip.payDate.replace(/-/g, '/')}</span><span>사원번호 : {slip.workerCode}</span><span>성명 : {slip.workerName}</span>
            </div>
            <table className="ec-report w-full mb-[6px]">
              <tbody>
                <tr><th>과세총액</th><td className="text-right">{won(slip.grossPay)}</td><th>비과세총액</th><td className="text-right">0</td></tr>
              </tbody>
            </table>
            <table className="ec-report w-full mb-[6px]">
              <thead><tr><th>수당항목명</th><th className="text-center">최종근무일</th><th className="text-right">근무기록</th><th className="text-right">금액</th><th>산출방법</th></tr></thead>
              <tbody>
                <tr>
                  <td>일근무</td><td className="text-center">{slip.lastWorkDate?.replace(/-/g, '/') ?? ''}</td>
                  <td className="text-right">{Number(slip.days).toFixed(2)}</td>
                  <td className="text-right">{Number(slip.grossPay).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</td><td />
                </tr>
                <tr className="font-bold"><td>지급총액</td><td colSpan={4} className="text-right">{Number(slip.grossPay).toLocaleString('ko-KR', { minimumFractionDigits: 1 })}</td></tr>
              </tbody>
            </table>
            <div className="text-right font-bold">지급총액 - 공제총액 = 실지급액 : {won(slip.netPay)}</div>
            <div className="flex gap-[6px] mt-[12px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
              <button type="button" className="ec-btn" onClick={() => setSlip(null)}>닫기</button>
            </div>
          </div>
        )}
      </Modal>
    </EcListShell>
  )
}

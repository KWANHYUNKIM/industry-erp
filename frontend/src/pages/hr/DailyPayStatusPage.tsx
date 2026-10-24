import { Fragment, useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dedTotal, lastDay, monthRange, slashYm, won, type DailyReportLine } from '../../features/dailypay/report'
import { SortTh, sortRows, type SortState } from '../../features/dailypay/components/SortTh'
import { CustomAggregateConds, CustomAggregateTable, EMPTY_AGG, type AggDim, type AggRecord, type AggState, type AggTarget } from '../../features/payroll/components/CustomAggregate'

type Mode = '라인별' | '급여대장별부서별' | '급여대장별부서별라인별' | '사용자지정집계'
const MODES: Mode[] = ['라인별', '급여대장별부서별', '급여대장별부서별라인별', '사용자지정집계']
/* 원본은 성명 순(2026-10-14: QA관리-순서 · 나일당 · 잠깐만 — 사원번호 00000 · 00002 · 00001). 글자 코드 순이라 영문이 한글보다 앞 */
const byName = (a: { workerName: string }, b: { workerName: string }) => (a.workerName < b.workerName ? -1 : a.workerName > b.workerName ? 1 : 0)
/** 원본 급여대장별부서별 · …라인별의 실지급액은 '500,000.00' 꼴(2026-10-13 실측) */
const won2 = (n: number | string) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/**
 * 원본 사용자지정집계 '집계조건검색'(2026-10-13 실측) — 귀속연월(월별 · 연별) · 급여정보(급여대장 · 부서 · 사원 · 프로젝트 · 지급구분) ·
 * 사원정보(부서 · 프로젝트). 급여대장의 코드 열은 '귀속연월-NO'(2026/10-1), 지급구분은 00001 · 1차수, 월별은 코드 열이 없다.
 * 일용 급여 줄에 프로젝트가 없어 프로젝트는 뺐다. 급여정보 부서 · 사원정보 부서는 둘 다 일용근로 사원의 지금 부서다.
 */
const AGG_DIMS: AggDim[] = [
  { key: 'month', label: '월별', group: '귀속연월', codeLabel: null }, { key: 'year', label: '연별', group: '귀속연월', codeLabel: null },
  { key: 'ledger', label: '급여대장', group: '급여정보', codeLabel: '귀속연월-NO' }, { key: 'dept', label: '부서', group: '급여정보' },
  { key: 'emp', label: '사원', group: '급여정보' }, { key: 'payKind', label: '지급구분', group: '급여정보' },
  { key: 'empDept', label: '부서', group: '사원정보' },
]
const days2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 급여작업 &gt; <b>일용근로 급여현황</b> (원본 E020753).
 *
 * <p>2026-10-03 loginaa 실측: 조건이 펼쳐진 현황 — 구분(라인별 · 급여대장별부서별 · …) · 귀속연월(전월+금월) · 지급연월(사용) ·
 * 지급구분 · 부서 · 사원 · 확정여부(전체 · 미확정 · 확정). 결과 머리 '급여현황' · 회사명 · 기간, 격자 귀속연월-NO · 급여대장명 ·
 * 최종근무일 · 부서명 · 프로젝트명 · 성명 · 지급총액 · 공제총액 · 실지급액, 대장마다 '2026/07-1 계' 소계와 합계.
 * 빠른선택 전월 · 전월+금월 · 금년 · 전년 · 금월. 지급연월([사용]) · 부서 · 사원(여러 개 고르는 코드도움)을 거른다.
 * 지급구분 · 결재방표시는 없다. 프로젝트명 열은 원본처럼 두지만 일용 급여 줄에 프로젝트가 없어 늘 비어 있다.
 *
 * <p>[급여대장별부서별] · [급여대장별부서별라인별](2026-10-13 실측 — QA관리-일용대장 2026/10-1 에 잠깐만(00001) 300,000 ·
 * 나일당(00002) 200,000, 둘 다 부서 없음, 재고 지움): 열은 라인별과 같다.
 * 부서별은 대장 × 부서마다 한 줄 '2026/10 -1 · QA관리-일용대장 · · · · 잠깐만 · 500,000 · · 500,000.00'(성명은 그 부서의 첫 사원),
 * 소계 '2026/10 계'(차수 없음) · 합계. 부서별라인별은 사원마다 한 줄, 성명 가나다(나일당 → 잠깐만), 소계 '2026/10-1 계' · 합계.
 * 두 구분 모두 실지급액이 '500,000.00' 꼴이다.
 *
 * <p>[사용자지정집계](2026-10-13 loginaa 실측 — 일용 대장 2026/10-1 에 잠깐만 2일 300,000 · 나일당 3일 300,000):
 * 집계대상 수당금액(전체) · 지급총액 · 공제금액(전체) · 공제총액 · 실지급액 · <b>총근무일수</b>(급여현황에 없는 것, 2.00 꼴).
 * 수당금액(전체)는 수당항목 열 '일근무', 공제금액(전체)는 값이 있는 공제 항목만(그날은 세금이 0 이라 열이 없었다).
 * 사원 / 전부 · 비율 · 코드포함 → 사원코드 · 사원 · 일근무 · 일근무비율 · 지급총액 … 총근무일수비율(40 · 60), 합계 600,000 · 100 · 5.00.
 * 결과 머리 제목은 '일용근로 급여현황'(라인별은 '급여현황').
 */
export default function DailyPayStatusPage() {
  const [mode, setMode] = useState<Mode>('라인별')
  const [agg, setAgg] = useState<AggState>(EMPTY_AGG)
  const [range, setRange] = useState(monthRange('전월+금월'))
  const [shown, setShown] = useState(range)
  const [usePaid, setUsePaid] = useState(false)
  const [paidRange, setPaidRange] = useState(range)
  const [deptCond, setDeptCond] = useState<string[]>([])
  const [empCond, setEmpCond] = useState<string[]>([])
  const [workers, setWorkers] = useState<{ id: number; code: string; name: string }[]>([])
  const [depts, setDepts] = useState<{ id: number; code?: string | null; name: string }[]>([])
  useEffect(() => {
    api.get<typeof workers>('/hr/daily-workers').then((r) => setWorkers(r.data)).catch(() => setWorkers([]))
    api.get<typeof depts>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }, [])
  const [confirmed, setConfirmed] = useState<'all' | 'no' | 'yes'>('all')
  const [rows, setRows] = useState<DailyReportLine[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  const [sort, setSort] = useState<SortState | null>(null)

  function search() {
    setError('')
    api.get<DailyReportLine[]>('/hr/daily-pay-ledgers/lines', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShown(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const list = rows.filter((r) => (!usePaid || (r.paidMonth >= paidRange.from && r.paidMonth <= paidRange.to))
    && (deptCond.length === 0 || deptCond.includes(r.department))
    && (empCond.length === 0 || empCond.includes(String(r.workerId)))
    && (confirmed === 'all' || (confirmed === 'yes') === r.confirmed))
  useTableColumnCheck(tableRef, '일용근로 급여현황', [list.length])
  const groups = new Map<number, DailyReportLine[]>()
  for (const r of [...list].sort((a, b) => a.payMonth.localeCompare(b.payMonth) || a.seq - b.seq || byName(a, b))) groups.set(r.ledgerId, [...(groups.get(r.ledgerId) ?? []), r])
  const sum = (ls: DailyReportLine[]) => ls.reduce((s, r) => ({
    gross: s.gross + Number(r.grossPay), ded: s.ded + dedTotal(r), net: s.net + Number(r.netPay),
  }), { gross: 0, ded: 0, net: 0 })
  const total = sum(list)

  /* 수당등록에서 더한 수당도 '수당금액(전체)' 열 — 전에는 일근무 하나에 지급총액을 통째로 실었다(2026-10-21) */
  const allowItems = (r: DailyReportLine) => (r.items ?? []).filter((i) => i.kind === 'ALLOWANCE')
  const allowNames = [...new Map(list.flatMap(allowItems).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => [i.itemId, i.name])).values()]
  const deductCols = (['소득세', '지방소득세'] as const).filter((c) => list.some((r) => Number(c === '소득세' ? r.incomeTax : r.localTax)))
  const aggTargets: AggTarget[] = [
    { key: 'allow', label: '수당금액(전체)', cols: ['일근무', ...allowNames] }, { key: 'gross', label: '지급총액' },
    { key: 'deduct', label: '공제금액(전체)', cols: deductCols }, { key: 'deductTotal', label: '공제총액' },
    { key: 'net', label: '실지급액' }, { key: 'days', label: '총근무일수', format: days2 },
  ]
  const deptCode = (name: string) => depts.find((d) => d.name === name)?.code ?? name
  const aggRecords: AggRecord[] = list.map((r) => {
    const dept = { code: deptCode(r.department), name: r.department }
    return {
      dims: {
        month: { code: r.payMonth, name: slashYm(r.payMonth) },
        year: { code: r.payMonth.slice(0, 4), name: r.payMonth.slice(0, 4) },
        ledger: { code: `${slashYm(r.payMonth)}-${r.seq}`, name: r.ledgerName },
        dept, empDept: dept,
        emp: { code: r.workerCode, name: r.workerName },
        payKind: { code: String(r.seq).padStart(5, '0'), name: `${r.seq}차수` },
      },
      values: {
        일근무: Number(r.grossPay) - allowItems(r).reduce((t, i) => t + Number(i.amount), 0), 지급총액: Number(r.grossPay),
        ...Object.fromEntries(allowNames.map((n) => [n, allowItems(r).filter((i) => i.name === n).reduce((t, i) => t + Number(i.amount), 0)])), 소득세: Number(r.incomeTax), 지방소득세: Number(r.localTax),
        공제총액: dedTotal(r), 실지급액: Number(r.netPay), 총근무일수: Number(r.days),
      },
    }
  })

  return (
    <EcListShell title="일용근로 급여현황" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          {MODES.map((m) => (
            <label key={m} className="mr-[10px]"><input type="radio" name="dps-mode" checked={mode === m} onChange={() => setMode(m)} /> {m}</label>
          ))}
          {mode === '사용자지정집계' && <CustomAggregateConds dims={AGG_DIMS} targets={aggTargets} value={agg} onChange={setAgg} />}
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
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
                           items={depts.map((d) => ({ value: d.name, code: d.code ?? undefined, name: d.name }))} />
        </EcCond>
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={workers.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
        </EcCond>
        <EcCond label="확정여부">
          {([['all', '전체'], ['no', '미확정'], ['yes', '확정']] as const).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-[4px] mr-[10px]">
              <input type="radio" name="dps-confirmed" checked={confirmed === v} onChange={() => setConfirmed(v)} /> {l}
            </label>
          ))}
        </EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        {['전월', '전월+금월', '금년', '전년', '금월'].map((l) => (
          <button key={l} type="button" className="ec-btn ec-btn-pick" onClick={() => setRange(monthRange(l))}>{l}</button>
        ))}
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {mode === '사용자지정집계' ? (
        <>
        <EcReportHead title="일용근로 급여현황" period={reportPeriod(`${shown.from}-01`, lastDay(shown.to))} />
        <CustomAggregateTable name="일용근로 급여현황" dims={AGG_DIMS} targets={aggTargets} records={aggRecords} agg={agg} />
        </>
      ) : (
      <div className="overflow-x-auto">
        <div className="ec-report-frame">
        <EcReportHead title="급여현황" period={reportPeriod(`${shown.from}-01`, lastDay(shown.to))} />
        {/* 출력물 격자 — 원본 E020753 (2026-10-20 실측): table-layout fixed 900 = 99 + 100 × 8, 머리 700 · 6px 3px 3px · 선 1px,
            본문 3px · 24.1 · 줄무늬 없음. 전에는 목록 격자(머리 34.3 · 9px 2.7px 7.2px)로 그렸다. */}
        <table ref={tableRef} className="text-left ec-report ec-report-fixed">
          <colgroup>
            <col className="w-[99px]" />
            {Array.from({ length: 8 }, (_, i) => <col key={i} className="w-[100px]" />)}
          </colgroup>
          <thead>
            <tr>
              <SortTh label="귀속연월-NO" k="no" wrap sort={sort} onSort={setSort} />
              <SortTh label="급여대장명" k="ledger" sort={sort} onSort={setSort} />
              <SortTh label="최종근무일" k="last" sort={sort} onSort={setSort} />
              <SortTh label="부서명" k="dept" sort={sort} onSort={setSort} />
              <SortTh label="프로젝트명" k="project" sort={sort} onSort={setSort} />
              <SortTh label="성명" k="name" sort={sort} onSort={setSort} />
              <SortTh label="지급총액" k="gross" sort={sort} onSort={setSort} />
              <SortTh label="공제총액" k="ded" sort={sort} onSort={setSort} />
              <SortTh label="실지급액" k="net" sort={sort} onSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              <>
                {[...groups.values()].map((ls) => {
                  const s = sum(ls)
                  const ym = slashYm(ls[0].payMonth)
                  const net = won2 /* 원본 라인별도 실지급액 '50,000.00' (2026-10-14) */
                  /* 부서별: 부서마다 한 줄(첫 사원 이름 · 합). 부서별라인별: 부서 · 성명 가나다. 라인별: 대장 순서 그대로 */
                  const lines: DailyReportLine[] = mode === '급여대장별부서별'
                    ? [...new Map(ls.map((r) => [r.department, r])).keys()].map((d) => {
                        const inDept = ls.filter((r) => r.department === d)
                        const t = sum(inDept)
                        return { ...inDept[0], lineId: -inDept[0].lineId, grossPay: t.gross, incomeTax: t.ded, localTax: 0, netPay: t.net, lastWorkDate: null }
                      })
                    : mode === '급여대장별부서별라인별'
                      ? [...ls].sort((a, b) => a.department.localeCompare(b.department, 'ko') || a.workerName.localeCompare(b.workerName, 'ko'))
                      : ls
                  return (
                    <Fragment key={ls[0].ledgerId}>
                      {sortRows(lines, sort, (r, k) => ({
                        no: r.seq, ledger: r.ledgerName, last: r.lastWorkDate, dept: r.department, project: '', name: r.workerName,
                        gross: Number(r.grossPay), ded: dedTotal(r), net: Number(r.netPay),
                      } as Record<string, string | number | null>)[k]).map((r) => (
                        <tr key={r.lineId}>
                          <td className="text-center">{ym} -{r.seq}</td>
                          <td>{r.ledgerName}</td>
                          <td className="text-center">{r.lastWorkDate?.replace(/-/g, '/') ?? ''}</td>
                          <td>{r.department}</td>
                          <td></td>
                          <td>{r.workerName}</td>
                          <td className="text-right">{won(r.grossPay)}</td>
                          <td className="text-right">{dedTotal(r) ? won(dedTotal(r)) : ''}</td>
                          <td className="text-right">{net(r.netPay)}</td>
                        </tr>
                      ))}
                      <tr className="ec-total">
                        <td colSpan={6} className="text-center">{mode === '급여대장별부서별' ? `${ym} 계` : `${ym}-${ls[0].seq} 계`}</td>
                        <td className="text-right">{won(s.gross)}</td>
                        <td className="text-right">{s.ded ? won(s.ded) : ''}</td>
                        <td className="text-right">{net(s.net)}</td>
                      </tr>
                    </Fragment>
                  )
                })}
                <tr className="ec-total">
                  <td colSpan={6} className="text-center">합계</td>
                  <td className="text-right">{won(total.gross)}</td>
                  <td className="text-right">{total.ded ? won(total.ded) : ''}</td>
                  <td className="text-right">{won2(total.net)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
        </div>
      </div>
      )}
      <EcReportFoot />
    </EcListShell>
  )
}

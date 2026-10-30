import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks, { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcSortSubtotalModal, { withSubtotals, type SortSubtotal } from '../../components/EcSortSubtotalModal'
import { CustomAggregateConds, CustomAggregateTable, EMPTY_AGG, type AggDim, type AggRecord, type AggState, type AggTarget } from '../../features/payroll/components/CustomAggregate'
import { api, extractErrorMessage } from '../../api/client'
import { EcDateRange } from '../../components/ui/EcDateInput'

interface Line { id: number; slipDate: string; slipNo: number; workDate: string; workerId: number; workerCode: string; workerName: string; payItem: string; quantity: number; amount: number }

/** 원본 빠른선택: 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 전월+금월 · 금년 · 전년 · 종료일 · 금월 */
const PICKS = [...STATUS_PICKS, '금년', '전년', '종료일', '금월'] as const
const slash = (s: string) => s.replace(/-/g, '/')
const MODES = ['라인별', '달력형', '사용자지정집계'] as const
type Mode = (typeof MODES)[number]
/** 정렬/소계기준 창의 기준(2026-10-22 실측): 없음 · 일자-No. · 근무일자 · 사원번호 · 성명 · 수당항목 · 근무기록 · 프로젝트명. */
const SORT_KEYS = ['일자-No.', '근무일자', '사원번호', '성명', '수당항목', '근무기록', '프로젝트명']
/** 처음 값(실측): 1 일자-No.(소계 표시) · 2 성명(소계 표시안함) · 3 없음, 합계 표시. */
const DEFAULT_SORT: SortSubtotal = {
  lines: [{ key: '일자-No.', desc: false, subtotal: true }, { key: '성명', desc: false, subtotal: false }, { key: '', desc: false, subtotal: false }],
  total: true,
}
/** 집계조건검색 창(2026-10-22 실측): 기준일자 · 근무일자 일별/월별/연별, 근무기록 사원 · 수당항목 · 프로젝트 · 부서, 사원정보 부서 · 프로젝트 · 지급구분. */
const AGG_DIMS: AggDim[] = [
  { key: 'slipDay', label: '일별', group: '기준일자', codeLabel: null }, { key: 'slipMonth', label: '월별', group: '기준일자', codeLabel: null }, { key: 'slipYear', label: '연별', group: '기준일자', codeLabel: null },
  { key: 'workDay', label: '일별', group: '근무일자', codeLabel: null }, { key: 'workMonth', label: '월별', group: '근무일자', codeLabel: null }, { key: 'workYear', label: '연별', group: '근무일자', codeLabel: null },
  { key: 'emp', label: '사원', group: '근무기록' }, { key: 'item', label: '수당항목', group: '근무기록' }, { key: 'project', label: '프로젝트', group: '근무기록' }, { key: 'dept', label: '부서', group: '근무기록' },
  { key: 'empDept', label: '부서', group: '사원정보' }, { key: 'empProject', label: '프로젝트', group: '사원정보' }, { key: 'payKind', label: '지급구분', group: '사원정보' },
]
/** 집계대상(실측): 근무기록 · 금액 — 둘 다 '4.50' · '675,000.00' 처럼 소수 둘째 자리까지. */
const dec2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const AGG_TARGETS: AggTarget[] = [{ key: 'qty', label: '근무기록', format: dec2 }, { key: 'amount', label: '금액', format: dec2 }]
const ymd = (d: Date) => d.toLocaleDateString('sv-SE')

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 근무기록 &gt; <b>일용근로 근무현황</b> (원본 E020752).
 *
 * <p>2026-10-03 loginaa 실측: 조건이 펼쳐진 현황 — 구분(라인별 · 달력형 · 사용자지정집계) · 기준일자(금월) · 부서 · 프로젝트 · 사원번호 ·
 * 수당항목. 결과 '근무현황' · 회사명 · 기간, 격자 일자-No. · 근무일자 · 사원번호 · 성명 · 수당항목 · 근무기록 · 프로젝트명,
 * 전표일자 차례(오래된 것이 위)로 날마다 '2026/09/02 계' 소계, 끝에 합계. 부서 · 사원번호 · 수당항목은 여러 개 고르는 코드도움.
 * 구분은 라인별만, 프로젝트 조건 · 달력형 · 사용자지정집계 · 결재방표시는 없다(근무입력에 프로젝트 칸이 없다).
 * 2026-10-14 다시 잼: 격자는 출력물 값(머리 6px 3px 3px · 27.6 / 본문 3px · 24.1 · 선 1px), 일자-No. 가운데, 소계 · 합계줄은
 * 회색(243) · 굵게 · 이름 칸 colSpan 5 가운데, 끝에 [프로젝트명] 열(근무 전표에 프로젝트가 없어 원본도 빈칸). 소계는 전표일자로 묶는다
 * (10/14 전표의 근무일자가 다른 줄도 '2026/10/14 계' 에 든다). 같은 날 줄은 사원번호 내림차순(00002 나일당 → 00001 잠깐만).
 */
export default function DailyWorkStatusPage() {
  const month = () => { const d = new Date(); const y = d.getFullYear(), m = d.getMonth(); return { from: periodOf('금월(~오늘)')!.from, to: new Date(y, m + 1, 0).toLocaleDateString('sv-SE') } }
  const [range, setRange] = useState(month)
  const [shown, setShown] = useState(range)
  const [empCond, setEmpCond] = useState<string[]>([])
  const [deptCond, setDeptCond] = useState<string[]>([])
  const [itemCond, setItemCond] = useState<string[]>([])
  const [workers, setWorkers] = useState<{ id: number; code: string; name: string; departmentId: number | null }[]>([])
  const [depts, setDepts] = useState<{ id: number; code?: string | null; name: string }[]>([])
  useEffect(() => {
    api.get<typeof workers>('/hr/daily-workers').then((r) => setWorkers(r.data)).catch(() => setWorkers([]))
    api.get<typeof depts>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }, [])
  const [rows, setRows] = useState<Line[]>([])
  const [error, setError] = useState('')
  const [signBox, setSignBox] = useState(false)
  const [mode, setMode] = useState<Mode>('라인별')
  const [agg, setAgg] = useState<AggState>(EMPTY_AGG)
  const [sortCfg, setSortCfg] = useState<SortSubtotal>(DEFAULT_SORT)
  const [sortOpen, setSortOpen] = useState(false)
  /** 달력형 — 보이는 달(그 달 1일)과 그 달의 근무 줄, 눌러서 연 날짜. */
  const [calMonth, setCalMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [calRows, setCalRows] = useState<Line[]>([])
  const [dayOpen, setDayOpen] = useState<string | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  function loadMonth(first: Date) {
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
    api.get<Line[]>('/hr/daily-work-entries', { params: { from: ymd(first), to: ymd(last) } })
      .then((r) => { setCalRows(r.data); setCalMonth(first); setDayOpen(null) }).catch((e) => setError(extractErrorMessage(e)))
  }
  function search() {
    setError('')
    if (mode === '달력형') { const f = new Date(range.from + 'T00:00:00'); loadMonth(new Date(f.getFullYear(), f.getMonth(), 1)); setShown(range); return }
    api.get<Line[]>('/hr/daily-work-entries', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShown(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const filt = (ls: Line[]) => ls
    .filter((r) => empCond.length === 0 || empCond.includes(String(r.workerId)))
    .filter((r) => deptCond.length === 0 || deptCond.includes(String(workers.find((w) => w.id === r.workerId)?.departmentId ?? '')))
    .filter((r) => itemCond.length === 0 || itemCond.includes(r.payItem))
  const list = filt(rows)
  useTableColumnCheck(tableRef, '일용근로 근무현황', [list.length, mode, sortCfg])
  const sortValue = (r: Line, key: string): string | number => {
    switch (key) {
      case '일자-No.': return `${r.slipDate}|${String(r.slipNo).padStart(6, '0')}`
      case '근무일자': return r.workDate
      case '사원번호': return r.workerCode
      case '성명': return r.workerName
      case '수당항목': return r.payItem
      case '근무기록': return Number(r.quantity)
      default: return ''
    }
  }
  /** 소계 이름 — 일자-No. 는 날짜만('2026/10/14 계', 같은 날 전표가 여럿이어도 한 묶음). */
  const sortLabel = (r: Line, key: string) => {
    if (key === '일자-No.') return slash(r.slipDate)
    if (key === '근무일자') return slash(r.workDate)
    const v = sortValue(r, key); return typeof v === 'number' ? dec2(v) : String(v)
  }
  const out = withSubtotals(list, sortCfg, sortValue, sortLabel)
  const qty = (ls: Line[]) => ls.reduce((s, r) => s + Number(r.quantity), 0)
  const deptOf = (r: Line) => depts.find((d) => d.id === workers.find((w) => w.id === r.workerId)?.departmentId)
  const aggRecords: AggRecord[] = list.map((r) => {
    const d = deptOf(r)
    const dept = { code: d?.code ?? d?.name ?? '', name: d?.name ?? '' }
    const day = (v: string, n: number) => ({ code: v.slice(0, n), name: slash(v.slice(0, n)) })
    return {
      dims: {
        slipDay: day(r.slipDate, 10), slipMonth: day(r.slipDate, 7), slipYear: day(r.slipDate, 4),
        workDay: day(r.workDate, 10), workMonth: day(r.workDate, 7), workYear: day(r.workDate, 4),
        emp: { code: r.workerCode, name: r.workerName }, item: { code: r.payItem, name: r.payItem },
        project: { code: '', name: '' }, dept, empDept: dept, empProject: { code: '', name: '' }, payKind: { code: '', name: '' },
      },
      values: { 근무기록: Number(r.quantity), 금액: Number(r.amount) },
    }
  })
  /** 달력형 — 그 달의 날짜 칸. 앞 · 뒤 빈 칸은 회색. */
  const calList = filt(calRows)
  const monthLast = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate()
  const lead = calMonth.getDay()
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: monthLast }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const dayKey = (d: number) => ymd(new Date(calMonth.getFullYear(), calMonth.getMonth(), d))
  const dayLines = (d: number) => calList.filter((r) => r.workDate === dayKey(d)).sort((a, b) => a.workerName.localeCompare(b.workerName, 'ko'))
  const todayKey = ymd(new Date())

  return (
    <EcListShell title="일용근로 근무현황" searchable={false} collapseConditions={false} signLine={signBox} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        {/* 원본(2026-10-22 실측): [구분] 라인별 · 달력형 · 사용자지정집계 — 사용자지정집계면 집계조건1·2 · 집계대상 · 가로보기 · 비율표시 · 코드포함. */}
        <EcCond label="구분">
          {MODES.map((m) => (
            <label key={m} className="mr-[10px]"><input type="radio" name="dws-mode" checked={mode === m} onChange={() => setMode(m)} /> {m}</label>
          ))}
          {mode === '사용자지정집계' && <CustomAggregateConds dims={AGG_DIMS} targets={AGG_TARGETS} value={agg} onChange={setAgg} />}
        </EcCond>
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[150px]", value: range.from, onChange: (e) => setRange({ ...range, from: e.target.value }) }} to={{ className: "ec-input w-[150px]", value: range.to, onChange: (e) => setRange({ ...range, to: e.target.value }) }} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
                           items={depts.map((d) => ({ value: String(d.id), code: d.code ?? undefined, name: d.name }))} />
        </EcCond>
        <EcCond label="사원번호">
          <CodePickerField label="사원번호" hideLabel fill multiple placeholder="사원번호" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={workers.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
        </EcCond>
        <EcCond label="수당항목">
          <CodePickerField label="수당항목" hideLabel fill multiple placeholder="수당항목" values={itemCond} onChangeMulti={(v) => setItemCond(v)}
                           items={[{ value: '일근무', code: '02', name: '일근무' }]} />
        </EcCond>
        {/* 원본 끝 두 칸(2026-10-21 실측): 기타 [결재방표시] · 정렬/소계기준 [설정]. */}
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[4px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
          </label>
        </EcCond>
        <EcCond label="정렬/소계기준">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setSortOpen(true)}>설정</button>
        </EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
        <EcPeriodPicks labels={PICKS} currentFrom={range.from} onPick={setRange} />
        <button type="button" className="ec-btn" onClick={() => { setDeptCond([]); setEmpCond([]); setItemCond([]); setSignBox(false); setMode('라인별'); setAgg(EMPTY_AGG); setSortCfg(DEFAULT_SORT) }}>다시 작성</button>
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {mode === '달력형' ? (
        <div>
          <EcReportHead title="근무현황" sign={signBox} period="" />
          <div className="flex items-center justify-between w-[572px] mb-[2px]">
            <div className="inline-flex items-center gap-[10px] border border-ec-line rounded-ec px-[10px] h-[30px]">
              <button type="button" className="bg-transparent border-0 cursor-pointer" onClick={() => loadMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}>&lt; 이전</button>
              <button type="button" className="bg-transparent border-0 cursor-pointer" onClick={() => { const t = new Date(); loadMonth(new Date(t.getFullYear(), t.getMonth(), 1)) }}>오늘</button>
              <button type="button" className="bg-transparent border-0 cursor-pointer" onClick={() => loadMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}>다음 &gt;</button>
            </div>
            <span>{calMonth.getFullYear()}/{String(calMonth.getMonth() + 1).padStart(2, '0')}</span>
          </div>
          <table className="w-[572px] table-fixed border-collapse ec-calendar">
            <thead><tr>{['일', '월', '화', '수', '목', '금', '토'].map((w) => <th key={w} className="text-center">{w}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: cells.length / 7 }, (_, wi) => (
                <tr key={wi}>
                  {cells.slice(wi * 7, wi * 7 + 7).map((d, ci) => {
                    if (d == null) return <td key={ci} className="h-[65px] bg-ec-disabled" />
                    const ls = dayLines(d)
                    const k = dayKey(d)
                    return (
                      <td key={ci} className={'h-[65px] align-top text-right relative' + (k === todayKey ? ' bg-ec-blue-wash font-bold' : '')}>
                        <div>{d}</div>
                        {ls.length > 0 && (
                          <button type="button" className="ec-btn ec-btn-primary ec-btn-sm" onClick={() => setDayOpen(dayOpen === k ? null : k)}>+{ls.length}</button>
                        )}
                        {dayOpen === k && (
                          <div className="absolute left-0 top-[24px] z-10 min-w-[180px] text-left bg-ec-panel rounded-ec border border-ec-line p-[8px]">
                            <div className="flex justify-between font-bold mb-[4px]"><span>{slash(k)}</span><button type="button" className="bg-transparent border-0 cursor-pointer" aria-label="닫기" onClick={() => setDayOpen(null)}>×</button></div>
                            {ls.map((r) => <div key={r.id} className="text-ec-navy">[{r.workerName}]{r.payItem} {Number(r.quantity)}</div>)}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : mode === '사용자지정집계' ? (
        <>
          <EcReportHead title="근무현황" sign={signBox} period={reportPeriod(shown.from, shown.to)} />
          <CustomAggregateTable name="근무현황" dims={AGG_DIMS} targets={AGG_TARGETS} records={aggRecords} agg={agg} />
        </>
      ) : (
        <>
      <EcReportHead title="근무현황" sign={signBox} period={reportPeriod(shown.from, shown.to)} />
      <table ref={tableRef} className="w-full text-left ec-report">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th>
            <th className="text-center">근무일자</th>
            <th>사원번호</th>
            <th>성명</th>
            <th>수당항목</th>
            <th className="text-right">근무기록</th>
            <th>프로젝트명</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {out.map((o) => (o.kind === 'row' ? (
                <tr key={o.row.id}>
                  <td className="text-center">{slash(o.row.slipDate)} -{o.row.slipNo}</td>
                  <td className="text-center">{slash(o.row.workDate)}</td>
                  <td>{o.row.workerCode}</td>
                  <td>{o.row.workerName}</td>
                  <td>{o.row.payItem}</td>
                  <td className="text-right">{Number(o.row.quantity)}</td>
                  <td />
                </tr>
              ) : (
                <tr key={`s-${o.key}`} className="ec-total">
                  <td colSpan={5} className="text-center">{o.label} 계</td>
                  <td className="text-right">{qty(o.list)}</td>
                  <td />
                </tr>
              )))}
              {sortCfg.total && (
                <tr className="ec-total">
                  <td colSpan={5} className="text-center">합계</td>
                  <td className="text-right">{qty(list)}</td>
                  <td />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
      <EcReportFoot />
        </>
      )}
      {sortOpen && (
        <EcSortSubtotalModal keys={SORT_KEYS} value={sortCfg} onApply={(v) => { setSortCfg(v); setSortOpen(false) }} onClose={() => setSortOpen(false)} />
      )}
    </EcListShell>
  )
}

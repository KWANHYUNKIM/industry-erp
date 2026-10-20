import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { EcReportHead, EcReportFoot } from '../../components/EcReportFrame'
import { ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

/** 서버 한 칸 — 프로젝트 · 항목 · 달 하나의 예상(계획)과 실적(전표 집계). */
interface Cell {
  projectId: number; projectCode: string; projectName: string
  startDate: string | null; endDate: string | null
  item: string; month: string; plan: number; actual: number
}

type Period = 'M' | 'Q' | 'H' | 'Y' | 'T'
type Agg = 'item' | '1' | '2' | '3' | '4'
const AGGS: { v: Agg; label: string }[] = [
  { v: 'item', label: '항목별' }, { v: '1', label: '집계기준 1' }, { v: '2', label: '집계기준 2' }, { v: '3', label: '집계기준 3' }, { v: '4', label: '집계기준 4' },
]
const PERIODS: { v: Period; label: string }[] = [
  { v: 'M', label: '월별' }, { v: 'Q', label: '분기별' }, { v: 'H', label: '반기별' }, { v: 'Y', label: '연별' }, { v: 'T', label: '집계' },
]
/* 원본 계획구분 · 항목 차례 — 수익(판매) · 비용(구매 · 노무비 · 경비). */
const GROUPS: { name: string; items: string[] }[] = [
  { name: '수익', items: ['판매'] },
  { name: '비용', items: ['구매', '노무비', '경비'] },
]

/* 원본 [기간구분] 칸 글자(2026-10-13 실측): 월별 '2026.09' · 분기별 '2026[3분기]' · 반기별 '2026[하반기]' · 연별 '2026'. */
function periodKey(month: string, p: Period) {
  const y = month.slice(0, 4)
  const m = Number(month.slice(5, 7))
  if (p === 'M') return `${y}.${month.slice(5, 7)}`
  if (p === 'Q') return `${y}[${Math.ceil(m / 3)}분기]`
  if (p === 'H') return `${y}[${m <= 6 ? '상' : '하'}반기]`
  if (p === 'Y') return y
  return ''
}

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
/* 실적이 없으면 원본은 실적 · 비율 칸을 비운다(0 을 찍지 않는다). 차이는 늘 찍는다(= 실적 − 예상). */
const blankWon = (n: number) => (n ? won(n) : '')
const rate = (actual: number, plan: number) =>
  (actual && plan ? (Math.round((actual / plan) * 10000) / 100).toLocaleString('ko-KR') : '')
const ymText = (ym: string) => ym.replace('-', '/')
const dotDate = (d: string | null) => (d ? d.slice(0, 10).replace(/-/g, '.') : '')
const slashDate = (d: string | null) => (d ? d.slice(0, 10).replace(/-/g, '/') : '')

interface Sum { plan: number; actual: number }
const add = (a: Sum, b: Sum): Sum => ({ plan: a.plan + b.plan, actual: a.actual + b.actual })
const ZERO: Sum = { plan: 0, actual: 0 }

/**
 * 재고 II &gt; 계획관리 &gt; 프로젝트계획 &gt; <b>프로젝트계획/실적현황</b>(E040637) — 2026-10-13 loginaa 실측.
 *
 * <p>조건: 검색구분 ○프로젝트 상세(프로젝트 하나) / ○프로젝트 집계(여럿) · 기간구분(월별 · 분기별 · 반기별 · 연별 · 집계) ·
 * 프로젝트(필수) · 기준일자(년/월 ~ 년/월, 기본 최근 4개월 — 프로젝트를 고르면 그 프로젝트 기간의 달로 바뀐다) · 기타 비율(켜짐).
 *
 * <p>상세 판 '프로젝트 계획/실적 상세 현황': 프로젝트 | 계획구분 | 항목 | 월별 | 예상금액 | 실적금액 | 차이금액 | 비율(%).
 * 항목마다 기간 줄 + '[판매] 소계', 계획구분마다 '[수익] 소계', 끝에 '[프로젝트] 손익'(수익 − 비용).
 * 20260901A: 판매 2026.09 20,000,000 · 구매 10,000,000 → 손익 10,000,000, 차이 −20,000,000 처럼 <b>실적 − 예상</b>.
 * 기간구분 [집계]는 기간 열과 항목 소계를 뺀다.
 *
 * <p>집계 판: 프로젝트 | 프로젝트기간 | 계획구분 | 집계기준 | 예상금액 · 실적금액 · 차이금액 · 비율(%),
 * 프로젝트마다 '[수익] 소계' · '[비용] 소계' · '[프로젝트] 손익', 끝에 '총이익'.
 *
 * <p>아직 없는 것: 집계기준 1~4(계획을 거래처 · 품목 … 별로 나눠 적는 칸이 우리 계획에 없다) · 표시방법 [횡] ·
 * [결재방표시](인쇄 판) · [천단위](원본 단위 글자를 못 쟀다). 비율은 실적 ÷ 예상 × 100 으로 두었는데 원본 실적이 든 판은 아직 못 쟀다.
 */
export default function ProjectPlanStatusPage() {
  const pickers = useCondPickers(['projects'])
  const now = ymd(new Date()).slice(0, 7)
  const back3 = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 3); return ymd(d).slice(0, 7) })()
  const prev = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return ymd(d).slice(0, 7) })()
  const [mode, setMode] = useState<'detail' | 'sum'>('detail')
  const [period, setPeriod] = useState<Period>('M')
  const [project, setProjectRaw] = useState('')
  const setProject = (v: string) => { setProjectRaw(v); if (v) setMissing(false) }
  const [projectsMulti, setProjectsMulti] = useState<string[]>([])
  const [from, setFrom] = useState(back3)
  const [to, setTo] = useState(now)
  const [withRate, setWithRate] = useState(true)
  /* 원본 [집계기준] ○항목별 ○집계기준 1 ~ 4 · 기타 ☐결재방표시 ☐천단위(2026-10-20 실측). */
  const [agg, setAgg] = useState<Agg>('item')
  const [signLine, setSignLine] = useState(false)
  const [thousand, setThousand] = useState(false)
  const [cells, setCells] = useState<Cell[]>([])
  const [shown, setShown] = useState<{ mode: 'detail' | 'sum'; period: Period; from: string; to: string; agg: Agg; thousand: boolean } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)

  const ids = mode === 'detail' ? (project ? [project] : []) : projectsMulti

  async function load() {
    setError('')
    /* 원본은 프로젝트가 비면 글자 없이 프로젝트 칸만 빨갛게 두르고 검색하지 않는다(2026-10-13 실측). */
    if (ids.length === 0) { setMissing(true); return }
    setMissing(false)
    setLoading(true)
    try {
      const r = await api.get<Cell[]>('/project-plans/status', { params: { projectIds: ids.join(','), from, to } })
      setCells(r.data)
      setShown({ mode, period: mode === 'sum' ? 'T' : period, from, to, agg, thousand })
    } catch (err) { setError(extractErrorMessage(err)); setCells([]) }
    finally { setLoading(false) }
  }

  /* 프로젝트를 고르면 기준일자가 그 프로젝트 기간의 달로 바뀐다(원본 도움말: 시작월 · 종료월로 자동 설정 —
     20260901A 를 고르자 2026/07 ~ 2026/10 이 2026/09 ~ 2026/09 로 바뀌었다). */
  const [periods, setPeriods] = useState<Map<string, { start: string | null; end: string | null }>>(new Map())
  useEffect(() => {
    api.get<{ id: number; startDate: string | null; endDate: string | null }[]>('/projects')
      .then((r) => setPeriods(new Map(r.data.map((x) => [String(x.id), { start: x.startDate, end: x.endDate }]))))
      .catch(() => setPeriods(new Map()))
  }, [])
  function pickProject(v: string) {
    setProject(v)
    const hit = periods.get(v)
    if (hit?.start) setFrom(hit.start.slice(0, 7))
    if (hit?.end) setTo(hit.end.slice(0, 7))
  }

  function reset() {
    setMode('detail'); setPeriod('M'); setProjectRaw(''); setProjectsMulti([]); setFrom(back3); setTo(now)
    setAgg('item'); setSignLine(false); setWithRate(true); setThousand(false); setMissing(false)
  }

  /* 프로젝트 → 항목 → 기간 → 합 */
  const view = useMemo(() => {
    const p = shown?.period ?? 'M'
    const byProject = new Map<number, { code: string; name: string; start: string | null; end: string | null; items: Map<string, Map<string, Sum>> }>()
    for (const c of cells) {
      let pr = byProject.get(c.projectId)
      if (!pr) { pr = { code: c.projectCode, name: c.projectName, start: c.startDate, end: c.endDate, items: new Map() }; byProject.set(c.projectId, pr) }
      let it = pr.items.get(c.item)
      if (!it) { it = new Map(); pr.items.set(c.item, it) }
      const k = periodKey(c.month, p)
      it.set(k, add(it.get(k) ?? ZERO, { plan: c.plan, actual: c.actual }))
    }
    return [...byProject.values()]
  }, [cells, shown])

  const isDetail = shown?.mode !== 'sum'
  const hasPeriod = isDetail && shown?.period !== 'T'
  const periodLabel = PERIODS.find((x) => x.v === shown?.period)?.label ?? '월별'
  /* 집계기준 1 ~ 4 를 고르면 [항목] 뒤에 그 열이 선다 — 우리 계획 줄엔 집계기준 값이 없어 칸은 비어 있다(원본 계획도 '해당없음'). */
  const aggCol = isDetail && !!shown && shown.agg !== 'item'
  const keyCols = isDetail ? 3 + (aggCol ? 1 : 0) + (hasPeriod ? 1 : 0) : 4
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '프로젝트계획/실적현황', [cells.length, keyCols, withRate])

  /* 천단위: 원본 20,000,000 → 20,000 · 단위 '원 (천단위)'(2026-10-20 실측). */
  const unit = shown?.thousand ? 1000 : 1
  const amounts = (s: Sum) => (
    <>
      <td className="text-right">{blankWon(s.plan / unit)}</td>
      <td className="text-right">{blankWon(s.actual / unit)}</td>
      {/* 계획 기간 안인데 계획도 실적도 없는 달은 원본이 차이까지 비운다('2026.12 | | | |', 2026-10-14 실측). */}
      <td className="text-right">{s.plan || s.actual ? won((s.actual - s.plan) / unit) : ''}</td>
      {withRate && <td className="text-right">{rate(s.actual, s.plan)}</td>}
    </>
  )

  const first = view[0]
  const sub = first ? `${first.name}${view.length > 1 ? ' 외' : ''}` : ''
  const metaLines = shown ? [
    `기준일자: ${ymText(shown.from)} ~ ${ymText(shown.to)}`,
    ...(isDetail && first ? [`프로젝트기간: ${slashDate(first.start)} ~ ${slashDate(first.end)}`] : []),
    shown.thousand ? '단위: 원 (천단위)' : '단위: 원',
  ] : []

  let total = ZERO
  const body: ReactNode[] = []
  view.forEach((pr, pi) => {
    let firstRowOfProject = true
    /* 집계기준 열을 켜면 원본은 프로젝트의 마지막 항목 소계 앞에 '[] 소계'(빈 집계기준 값의 소계 — 항목을 가리지 않고 다 더한 것)를 낸다
       (20240701A: 판매 20,000,000 · 구매 10,000,000 → 구매 기간 줄 다음 '[] 소계 30,000,000', 2026-10-20 실측). */
    const lastItem = GROUPS.flatMap((g) => g.items).filter((i) => pr.items.has(i)).pop()
    const allSum = [...pr.items.values()].flatMap((m) => [...m.values()]).reduce(add, ZERO)
    let revenue = ZERO
    let cost = ZERO
    for (const g of GROUPS) {
      const items = g.items.filter((i) => pr.items.has(i))
      if (items.length === 0) continue
      let groupSum = ZERO
      let firstRowOfGroup = true
      for (const item of items) {
        const periods = [...pr.items.get(item)!.entries()]
        const itemSum = periods.reduce((s, [, v]) => add(s, v), ZERO)
        groupSum = add(groupSum, itemSum)
        if (isDetail) {
          periods.forEach(([k, v], idx) => {
            body.push(
              <tr key={`${pi}-${item}-${k}`}>
                <td>{firstRowOfProject ? pr.name : ''}</td>
                <td>{firstRowOfGroup ? g.name : ''}</td>
                <td>{idx === 0 ? item : ''}</td>
                {aggCol && <td></td>}
                {hasPeriod && <td>{k}</td>}
                {amounts(v)}
              </tr>,
            )
            firstRowOfProject = false; firstRowOfGroup = false
          })
          if (aggCol && item === lastItem) {
            body.push(
              <tr key={`${pi}-agg-sub`} className="ec-total">
                <td></td><td></td><td></td>
                <td colSpan={keyCols - 3} className="text-right">[] 소계</td>
                {amounts(allSum)}
              </tr>,
            )
          }
          if (hasPeriod || aggCol) {
            body.push(
              <tr key={`${pi}-${item}-sub`} className="ec-total">
                <td></td><td></td>
                <td colSpan={keyCols - 2} className="text-right">[{item}] 소계</td>
                {amounts(itemSum)}
              </tr>,
            )
          }
        } else {
          body.push(
            <tr key={`${pi}-${item}`}>
              <td>{firstRowOfProject ? pr.name : ''}</td>
              <td>{firstRowOfProject ? `${dotDate(pr.start)}~${dotDate(pr.end)}` : ''}</td>
              <td>{firstRowOfGroup ? g.name : ''}</td>
              <td>{item}</td>
              {amounts(itemSum)}
            </tr>,
          )
          firstRowOfProject = false; firstRowOfGroup = false
        }
      }
      body.push(
        <tr key={`${pi}-${g.name}-sub`} className="ec-total">
          {isDetail ? <td></td> : <><td></td><td></td></>}
          <td colSpan={isDetail ? keyCols - 1 : 2} className="text-right">[{g.name}] 소계</td>
          {amounts(groupSum)}
        </tr>,
      )
      if (g.name === '수익') revenue = add(revenue, groupSum)
      else cost = add(cost, groupSum)
    }
    const profit = { plan: revenue.plan - cost.plan, actual: revenue.actual - cost.actual }
    total = add(total, profit)
    body.push(
      <tr key={`${pi}-profit`} className="ec-total">
        {isDetail
          ? <td colSpan={keyCols} className="text-right">[{pr.name}] 손익</td>
          : <><td className="text-right">[{pr.name}] 손익</td><td colSpan={3}></td></>}
        {amounts(profit)}
      </tr>,
    )
  })

  return (
    <EcListShell
      title="프로젝트계획/실적현황"
      onSearch={load}
      searchable={false}
      signLine={signLine}
      /* 원본 하단은 [인쇄] [Excel] 둘 — [검색(F8)] 은 조건 판 아래 줄에 있다(2026-10-20 실측). */
      actions={[{ label: '인쇄' }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="검색구분" span="full">
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="radio" name="pps-mode" checked={mode === 'detail'} onChange={() => setMode('detail')} /> 프로젝트 상세
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px] ml-[8px]">
            <input type="radio" name="pps-mode" checked={mode === 'sum'} onChange={() => setMode('sum')} /> 프로젝트 집계
          </label>
          {mode === 'detail' && (
            <span className="ml-[12px] flex items-center gap-[6px]">
              <span className="ec-badge">기간구분</span>
              {PERIODS.map((x) => (
                <label key={x.v} className="flex items-center gap-[3px] text-[12.5px]">
                  <input type="radio" name="pps-period" checked={period === x.v} onChange={() => setPeriod(x.v)} /> {x.label}
                </label>
              ))}
            </span>
          )}
        </EcCond>
        {/* 원본 차례: 검색구분 · 집계기준 · 프로젝트 · 기준일자 · 기타(plans/재고2/E040636.md 4) */}
        <EcCond label="집계기준" span="full">
          {AGGS.map((x) => (
            <label key={x.v} className="flex items-center gap-[3px] text-[12.5px] mr-[8px]">
              <input type="radio" name="pps-agg" checked={agg === x.v} onChange={() => setAgg(x.v)} /> {x.label}
            </label>
          ))}
        </EcCond>
        <EcCond label="프로젝트" pick span={2}>
          <span className={missing ? 'rounded-ec outline outline-1 outline-ec-danger' : undefined}>
          {mode === 'detail'
            ? <CodePickerField label="프로젝트" hideLabel width={260} emptyLabel="" value={project} onChange={pickProject} items={pickers.projects} />
            : <CodePickerField label="프로젝트" hideLabel width={360} multiple values={projectsMulti} onChangeMulti={(v) => { setProjectsMulti(v); if (v.length) setMissing(false) }} items={pickers.projects} />}
          </span>
        </EcCond>
        <EcCond label="기준일자" span={2}>
          <input type="month" className="ec-input w-[130px]" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="month" className="ec-input w-[130px]" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </EcCond>
        <EcCond label="기타">
          <label className="flex items-center gap-[3px] text-[12.5px] mr-[8px]">
            <input type="checkbox" checked={signLine} onChange={(e) => setSignLine(e.target.checked)} /> 결재방표시
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px] mr-[8px]">
            <input type="checkbox" checked={withRate} onChange={(e) => setWithRate(e.target.checked)} /> 비율
          </label>
          <label className="flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={thousand} onChange={(e) => setThousand(e.target.checked)} /> 천단위
          </label>
        </EcCond>
        {/* 원본 판 아래 줄: [검색(F8)] [금월(~오늘)] [전월] [3개월] [설정] [다시 작성] — 기간 단추는 기준일자만 바꾼다
            (금월 2026/10 ~ 2026/10 · 전월 2026/09 ~ 2026/09 · 3개월 2026/07 ~ 2026/10, 2026-10-20 실측).
            [설정] 은 원본에서 '권한없음 (프로젝트계획)' 창이 떠 못 쟀다. */}
        <li className="flex gap-[4px] w-full">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void load()}>검색(F8)</button>
          <button type="button" className="ec-btn ec-btn-pick" onClick={() => { setFrom(now); setTo(now) }}>금월(~오늘)</button>
          <button type="button" className="ec-btn ec-btn-pick" onClick={() => { setFrom(prev); setTo(prev) }}>전월</button>
          <button type="button" className="ec-btn ec-btn-pick" onClick={() => { setFrom(back3); setTo(now) }}>3개월</button>
          <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
        </li>
      </ul>

      {shown && (
        <>
          <EcReportHead
            title={isDetail ? '프로젝트 계획/실적 상세 현황' : '프로젝트 계획/실적 현황'}
            period={metaLines}
            sub={sub}
          />
          {/* 원본 격자는 이 화면만 작다(2026-10-14 실측): 머리 11px 400 · 본문 11px · 소계 · 손익 12px 700 — 같은 묶음 매출계획비교표는 12px. */}
          <table ref={tableRef} className="ec-report ec-report-head400 ec-report-11 w-full text-left">
            <thead>
              <tr>
                <th>프로젝트</th>
                {!isDetail && <th>프로젝트기간</th>}
                <th>계획구분</th>
                <th>{isDetail ? '항목' : '집계기준'}</th>
                {aggCol && <th>{AGGS.find((x) => x.v === shown?.agg)?.label}</th>}
                {hasPeriod && <th>{periodLabel}</th>}
                <th className="text-right">예상금액</th>
                <th className="text-right">실적금액</th>
                <th className="text-right">차이금액</th>
                {withRate && <th className="text-right">비율(%)</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={keyCols + 4} className="ec-empty">불러오는 중…</td></tr>}
              {!loading && body.length === 0 && <tr><td colSpan={keyCols + 4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
              {!loading && body.map((r, i) => <Fragment key={i}>{r}</Fragment>)}
            </tbody>
            {!loading && !isDetail && body.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={keyCols} className="text-right">총이익</td>
                  {amounts(total)}
                </tr>
              </tfoot>
            )}
          </table>
          <EcReportFoot />
        </>
      )}
    </EcListShell>
  )
}

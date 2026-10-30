import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { ymd } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import { fetchFundPlans, useFundPlanMasters } from '../../features/fundplan/api'
import type { FundPlan } from '../../features/fundplan/types'
import { bankLabel } from '../../utils/bankLabel'
import {
  amt, fetchActualMoves, filterPlans, monthEnd, planDec, planInc, slash, type ActualMove, type PlanFilter,
} from '../../features/fundplan/forecast'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'

/**
 * 회계 II › 자금계획 › 출력물 › <b>추정자금월보</b>(E020521) · <b>추정자금연보</b>(E020522) — 2026-10-12 loginaa 실측.
 *
 * <p>조건(둘 다 같다): 조회일자(월보 YYYY/MM ~ YYYY/MM 기본 <b>금월</b>, 빠른선택 금월 · 전월 / 연보 YYYY ~ YYYY 기본 <b>금년</b>,
 * 빠른선택 금년 · 전년) · 실적기준일(기본 오늘) · 부서 · 프로젝트 · 계획포함(전체 · 출금 · 입금 + 입력구분 자금 · 수금 · 지급 · 어음 ·
 * 채권 · 채무 + 자금구분 전체 · 예금(현금) · 어음 · 기타) · 기타 [v]실적기준일의 계획전표 포함하기.
 *
 * <p><b>월보</b> 표: 일자 · 적요 · 거래처 · 증가 · 감소 · 잔액. 첫 줄 '전월이월'(적요 칸 굵게, 잔액만), 실적 줄(거래처 = 통장, 예: 기업은행-1122) →
 * 'YYYY/MM 합계' → '실적 합계', 계획 줄 → 'YYYY/MM 합계' → '계획 합계', 끝 '계'. 합계 줄은 일자 · 적요 · 거래처 세 칸을 합쳐 가운데,
 * 회색 굵게(ec-total), 잔액 칸은 비운다. 잔액은 이월부터 줄마다 이어 간다. 줄이 하나도 없으면 '등록된 데이터가 없습니다.'(이월 줄도 없음).
 * <br>흐름(실적기준일 10/12, 이월 921,424,000): 계획 입금 30,000(10/20) → 921,454,000 · 출금 50,000(10/25) → 921,404,000,
 * 계획 합계 30,000 / 50,000. 기준일을 10/22 로 옮기면 10/13 · 10/21 예금 거래가 실적으로 들고 10/20 계획은 빠진다.
 *
 * <p><b>연보</b> 표: 구분 · 달마다 한 열(2026/01 … 2026/12). 줄 전월이월 · 회계증가 · 자금증가 · 수금증가 · 받을어음증가 · 채권증가 ·
 * ①자금의증가계 · 회계감소 · 자금감소 · 지급증가 · 지급어음증가 · 채무증가 · ②자금의감소계 · 순증가액(①-②) · 월말잔액. 모두 보통 줄(굵기 · 바탕 없음),
 * 0 은 빈칸, 순증가액은 음수면 '-'(10월 -20,000). 회계 = 실적기준일까지의 회계전표, 자금 = 계획전표(어음이어도 자금).
 *
 * <p><b>추정자금일보</b>(E020520) — 조회일자 구간(기본 <b>금일</b>, 빠른선택 금일 · 전일). '회사명 : …' 아래 표가 <b>자료가 있는 것만</b> 차례로
 * 번호를 달고 선다(2026-10-12 실측: 계획 입금 30,000 하나면 '1. 추정자금현황' · '2. 계획의 증가' 둘만). 표마다 오른쪽에 기간, 아래에 출력 시각.
 * 1. 추정자금현황(계정명 · 거래처명 · 이월잔액[외화] · 증가[외화] · 감소[외화] · 금일잔액[외화]) — 계정마다 통장 줄(계정명은 첫 줄에만,
 * 통장 없는 분개는 거래처명 빈칸) · '보통예금 계', 계좌 없는 계획은 '계좌 미지정건' · '계좌 미지정건 계', 끝 '합계'. 그 뒤 자금의 증가 · 자금의 감소
 * (일자 · 상대계정명 · 상대거래처명 · 적요 · 금액) · 자금의 계좌간이동(일자 · 이동계좌 'A → B' · 적요 · 금액) · 계획의 증가 · 계획의 감소
 * (일자 · 상대계정명 · 거래처명 · 적요 · 금액). 실측 흐름: 이월 보통예금 921,424,000 + 계좌 미지정건 증가 30,000 → 합계 921,454,000.
 *
 * <p>수금 · 지급 · 어음 · 채권 · 채무 계획은 다른 전표에서 오는 계획이라 우리에게 자료가 없어 그 줄은 늘 빈칸이다.
 * 부서 · 프로젝트는 계획전표에만 있다(회계전표 실적에는 걸리지 않는다). [양식](적용양식)은 두지 않는다.
 * [결재방표시]는 일보 [기타] 줄 맨 앞 · 월보/연보 [양식구분] 줄(처음 꺼짐) — 켜면 인쇄에 결재란.
 */
const KINDS = ['자금', '수금', '지급', '어음', '채권', '채무'] as const

export default function FundForecastPage({ variant }: { variant: 'daily' | 'monthly' | 'yearly' }) {
  const yearly = variant === 'yearly'
  const daily = variant === 'daily'
  const title = daily ? '추정자금일보' : yearly ? '추정자금연보' : '추정자금월보'
  const { companyName } = useAuth()
  const masters = useFundPlanMasters()
  const today = ymd(new Date())
  const initFrom = daily ? today : yearly ? today.slice(0, 4) : today.slice(0, 7)
  const [from, setFrom] = useState(initFrom)
  const [to, setTo] = useState(initFrom)
  const [base, setBase] = useState(today)
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [dir, setDir] = useState<'' | 'OUT' | 'IN'>('')
  const [kinds, setKinds] = useState<Set<string>>(new Set(KINDS))
  const [method, setMethod] = useState<'' | 'DEPOSIT' | 'NOTE' | 'ETC'>('')
  const [includeBaseDay, setIncludeBaseDay] = useState(true)
  /** 원본 [결재방표시] — 일보는 [기타] 줄 맨 앞, 월보 · 연보는 [양식구분] 줄(2026-10-14 실측, 처음 꺼짐). */
  const [signLine, setSignLine] = useState(false)
  const [actuals, setActuals] = useState<ActualMove[]>([])
  const [plans, setPlans] = useState<FundPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 조회 구간(날짜) — 월보는 첫 달 1일 ~ 끝 달 말일, 연보는 첫 해 1/1 ~ 끝 해 12/31. */
  const start = daily ? from : yearly ? `${from}-01-01` : `${from}-01`
  const end = daily ? to : yearly ? `${to}-12-31` : monthEnd(to)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [a, p] = await Promise.all([fetchActualMoves(base < end ? base : end), fetchFundPlans(base < start ? base : start, end)])
      setActuals(a)
      setPlans(p)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const filter: PlanFilter = {
    dir, method: method === 'ETC' ? 'DEPOSIT' : method, fundKind: kinds.has('자금') && method !== 'ETC', dept, project, includeBaseDay,
  }
  const shownPlans = useMemo(() => filterPlans(plans, base, filter).filter((p) => p.planDate >= start && p.planDate <= end),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, base, dir, method, kinds, dept, project, includeBaseDay, start, end])
  const carry = actuals.filter((m) => m.date < start).reduce((s, m) => s + m.inc - m.dec, 0)
  const inActual = actuals.filter((m) => m.date >= start && m.date <= end && m.date <= base)

  function reset() {
    setFrom(initFrom); setTo(initFrom); setBase(today); setDept(''); setProject(''); setDir('')
    setKinds(new Set(KINDS)); setMethod(''); setIncludeBaseDay(true); setSignLine(false)
  }
  const toggleKind = (k: string, on: boolean) => setKinds((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n })
  const radio = <T extends string>(name: string, value: T, cur: T, label: string, on: (v: T) => void) => (
    <label key={value} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="radio" name={name} checked={cur === value} onChange={() => on(value)} /> {label}
    </label>
  )
  const years = Array.from({ length: 11 }, (_, i) => String(Number(today.slice(0, 4)) - 8 + i))

  return (
    <EcListShell
      title={title}
      searchable={false}
      signLine={signLine}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="조회일자">
          {daily ? (
            <>
              <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "조회 시작일", value: from, onChange: (e) => e.target.value && setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "조회 끝일", value: to, onChange: (e) => e.target.value && setTo(e.target.value) }} />
            </>
          ) : yearly ? (
            <>
              <select className="ec-input w-[90px]" aria-label="조회 시작년도" value={from} onChange={(e) => setFrom(e.target.value)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="my-0 mx-[4px]">~</span>
              <select className="ec-input w-[90px]" aria-label="조회 끝년도" value={to} onChange={(e) => setTo(e.target.value)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          ) : (
            <>
              <input type="month" className="ec-input w-[130px]" aria-label="조회 시작월" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              <span className="my-0 mx-[4px]">~</span>
              <input type="month" className="ec-input w-[130px]" aria-label="조회 끝월" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </>
          )}
          <span className="ml-[6px]">
            <EcPeriodPicks labels={daily ? ['금일', '전일'] : yearly ? ['금년', '전년'] : ['금월', '전월']} currentFrom={start}
                           onPick={(r) => { const n = daily ? 10 : yearly ? 4 : 7; setFrom(r.from.slice(0, n)); setTo(r.to.slice(0, n)) }} />
          </span>
        </EcCond>
        <EcCond label="실적기준일">
          <EcDateInput className="ec-input w-[145px]" aria-label="실적기준일" value={base} onChange={(e) => e.target.value && setBase(e.target.value)} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} value={dept} onChange={setDept} items={masters.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} value={project} onChange={setProject} items={masters.projects} />
        </EcCond>
        <EcCond label="계획포함" span="full">
          <div className="flex flex-col gap-[4px]">
            <span>{([['', '전체'], ['OUT', '출금'], ['IN', '입금']] as const).map(([v, l]) => radio(`${variant}-dir`, v, dir, l, setDir))}</span>
            <span>
              <span className="bg-ec-disabled rounded-ec px-[4px] mr-[6px]">입력구분</span>
              <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
                <input type="checkbox" checked={kinds.size === KINDS.length}
                       onChange={(e) => setKinds(e.target.checked ? new Set(KINDS) : new Set())} /> 전체
              </label>
              {KINDS.map((k) => (
                <label key={k} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
                  <input type="checkbox" checked={kinds.has(k)} onChange={(e) => toggleKind(k, e.target.checked)} /> {k}
                </label>
              ))}
            </span>
            <span>
              <span className="bg-ec-disabled rounded-ec px-[4px] mr-[6px]">자금구분</span>
              {([['', '전체'], ['DEPOSIT', '예금(현금)'], ['NOTE', '어음'], ['ETC', '기타']] as const).map(([v, l]) => radio(`${variant}-method`, v, method, l, setMethod))}
            </span>
          </div>
        </EcCond>
        <EcCond label="기타">
          {variant === 'daily' && (
            <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="checkbox" checked={signLine} onChange={(e) => setSignLine(e.target.checked)} /> 결재방표시
            </label>
          )}
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={includeBaseDay} onChange={(e) => setIncludeBaseDay(e.target.checked)} /> 실적기준일의 계획전표 포함하기
          </label>
        </EcCond>
        {variant !== 'daily' && (
          <EcCond label="양식구분">
            <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="checkbox" checked={signLine} onChange={(e) => setSignLine(e.target.checked)} /> 결재방표시
            </label>
          </EcCond>
        )}
      </ul>

      <div className="ec-report-head">
        <h2 className="ec-report-title">{title}</h2>
        <div className="ec-report-meta">
          <span>회사명 : {companyName ?? ''}</span>
          <span>{daily ? '' : yearly ? `${from} ~ ${to}` : `${slash(from)} ~ ${slash(to)}`}</span>
        </div>
        {loading ? (
          <p className="ec-empty">불러오는 중…</p>
        ) : daily ? (
          <DailyReport from={start} to={end} base={base} actuals={actuals} plans={shownPlans}
                       bankOf={(id) => { const b = masters.banks.find((x) => x.id === id); return b ? bankLabel(b) : '' }}
                       carryPlans={filterPlans(plans, base, filter).filter((p) => p.planDate < start)} />
        ) : yearly ? (
          <YearlyTable fromYear={Number(from)} toYear={Number(to)} base={base} carry={carry} actuals={actuals} plans={shownPlans} />
        ) : (
          <MonthlyTable carry={carry} actuals={inActual} plans={shownPlans} />
        )}
      </div>
    </EcListShell>
  )
}

interface Line { key: string; date: string; text: string; partner: string; inc: number; dec: number }

function MonthlyTable({ carry, actuals, plans }: { carry: number; actuals: ActualMove[]; plans: FundPlan[] }) {
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '추정자금월보', [actuals.length, plans.length])
  const planLines: Line[] = plans.map((p) => ({ key: `p${p.id}`, date: p.planDate, text: p.memo ?? '', partner: p.partnerName ?? '', inc: planInc(p), dec: planDec(p) }))
  let bal = carry
  const total = [...actuals, ...planLines].reduce((s, l) => ({ inc: s.inc + l.inc, dec: s.dec + l.dec }), { inc: 0, dec: 0 })
  const section = (lines: Line[], label: string) => {
    if (lines.length === 0) return null
    const months = [...new Set(lines.map((l) => l.date.slice(0, 7)))]
    const sum = { inc: 0, dec: 0 }
    return (
      <>
        {months.map((m) => {
          const ls = lines.filter((l) => l.date.slice(0, 7) === m)
          const ms = ls.reduce((s, l) => ({ inc: s.inc + l.inc, dec: s.dec + l.dec }), { inc: 0, dec: 0 })
          sum.inc += ms.inc; sum.dec += ms.dec
          return (
            <Fragment key={label + m}>
              {ls.map((l) => {
                bal += l.inc - l.dec
                return (
                  <tr key={l.key}>
                    <td className="text-center">{slash(l.date)}</td>
                    <td>{l.text}</td>
                    <td>{l.partner}</td>
                    <td className="text-right">{amt(l.inc)}</td>
                    <td className="text-right">{amt(l.dec)}</td>
                    <td className="text-right">{amt(bal)}</td>
                  </tr>
                )
              })}
              <tr className="ec-total">
                <td colSpan={3} className="text-center">{slash(m)} 합계</td>
                <td className="text-right">{amt(ms.inc)}</td>
                <td className="text-right">{amt(ms.dec)}</td>
                <td />
              </tr>
            </Fragment>
          )
        })}
        <tr className="ec-total">
          <td colSpan={3} className="text-center">{label} 합계</td>
          <td className="text-right">{amt(sum.inc)}</td>
          <td className="text-right">{amt(sum.dec)}</td>
          <td />
        </tr>
      </>
    )
  }
  const empty = actuals.length === 0 && plans.length === 0
  return (
    <table ref={tableRef} className="ec-report w-full text-left">
      <thead>
        <tr>
          <th className="text-center">일자</th>
          <th>적요</th>
          <th>거래처</th>
          <th className="text-right">증가</th>
          <th className="text-right">감소</th>
          <th className="text-right">잔액</th>
        </tr>
      </thead>
      <tbody>
        {empty ? (
          <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
        ) : (
          <>
            <tr>
              <td className="text-center" />
              <td className="font-bold">전월이월</td>
              <td />
              <td className="text-right" />
              <td className="text-right" />
              <td className="text-right">{amt(carry)}</td>
            </tr>
            {section(actuals, '실적')}
            {section(planLines, '계획')}
            <tr className="ec-total">
              <td colSpan={3} className="text-center">계</td>
              <td className="text-right">{amt(total.inc)}</td>
              <td className="text-right">{amt(total.dec)}</td>
              <td />
            </tr>
          </>
        )}
      </tbody>
    </table>
  )
}

const YEAR_ROWS = [
  '전월이월', '회계증가', '자금증가', '수금증가', '받을어음증가', '채권증가', '①자금의증가계',
  '회계감소', '자금감소', '지급증가', '지급어음증가', '채무증가', '②자금의감소계', '순증가액(①-②)', '월말잔액',
] as const

function YearlyTable({ fromYear, toYear, base, carry, actuals, plans }: {
  fromYear: number; toYear: number; base: string; carry: number; actuals: ActualMove[]; plans: FundPlan[]
}) {
  const tableRef = useRef<HTMLTableElement>(null)
  const months: string[] = []
  for (let y = fromYear; y <= toYear; y++) for (let m = 1; m <= 12; m++) months.push(`${y}-${String(m).padStart(2, '0')}`)
  useTableColumnCheck(tableRef, '추정자금연보', [months.length])
  const cols = useMemo(() => {
    let bal = carry
    return months.map((m) => {
      const acts = actuals.filter((a) => a.date.slice(0, 7) === m && a.date <= base)
      const ps = plans.filter((p) => p.planDate.slice(0, 7) === m)
      const v: Record<string, number> = {}
      v['전월이월'] = bal
      v['회계증가'] = acts.reduce((s, a) => s + a.inc, 0)
      v['자금증가'] = ps.reduce((s, p) => s + planInc(p), 0)
      v['①자금의증가계'] = v['회계증가'] + v['자금증가']
      v['회계감소'] = acts.reduce((s, a) => s + a.dec, 0)
      v['자금감소'] = ps.reduce((s, p) => s + planDec(p), 0)
      v['②자금의감소계'] = v['회계감소'] + v['자금감소']
      v['순증가액(①-②)'] = v['①자금의증가계'] - v['②자금의감소계']
      bal += v['순증가액(①-②)']
      v['월말잔액'] = bal
      return v
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carry, actuals, plans, base, fromYear, toYear])
  return (
    <table ref={tableRef} className="ec-report w-full text-left">
      <thead>
        <tr>
          <th className="text-center">구분</th>
          {months.map((m) => <th key={m} className="text-center">{slash(m)}</th>)}
        </tr>
      </thead>
      <tbody>
        {YEAR_ROWS.map((r) => (
          <tr key={r}>
            <td>{r}</td>
            {cols.map((v, i) => <td key={months[i]} className="text-right">{amt(v[r] ?? 0)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface Book { label: string; carry: number; inc: number; dec: number }
interface Group { name: string; order: string; books: Map<string, Book> }
interface Move { key: string; date: string; counter: string; partner: string; text: string; amount: number }

/** 원본 출력 시각 — '2026/10/12 오후 11:37:08'. */
const printedAt = () => { const d = new Date(); return `${slash(ymd(d))} ${d.toLocaleTimeString('ko-KR')}` }

function DailyReport({ from, to, base, actuals, plans, carryPlans, bankOf }: {
  from: string; to: string; base: string; actuals: ActualMove[]; plans: FundPlan[]; carryPlans: FundPlan[]
  /** 계획전표 통장 → 장부 이름(실적 줄과 같은 '은행명-끝4자리'). */
  bankOf: (id: number) => string
}) {
  const at = useMemo(printedAt, [actuals, plans])
  const { groups, incs, decs, moves, planIncs, planDecs } = useMemo(() => {
    const gm = new Map<string, Group>()
    const book = (gKey: string, gName: string, order: string, bKey: string, bLabel: string) => {
      if (!gm.has(gKey)) gm.set(gKey, { name: gName, order, books: new Map() })
      const g = gm.get(gKey)!
      if (!g.books.has(bKey)) g.books.set(bKey, { label: bLabel, carry: 0, inc: 0, dec: 0 })
      return g.books.get(bKey)!
    }
    const incs: Move[] = [], decs: Move[] = []
    const moves: { key: string; date: string; route: string; text: string; amount: number }[] = []
    const byEntry = new Map<number, ActualMove[]>()
    for (const a of actuals) {
      if (a.date > base || a.date > to) continue
      const b = book(a.accountName, a.accountName, a.accountCode, a.bookKey, a.bookLabel === '[ ]' ? '' : a.bookLabel)
      if (a.date < from) { b.carry += a.inc - a.dec; continue }
      b.inc += a.inc; b.dec += a.dec
      if (a.transfer) { byEntry.set(a.entryId, [...(byEntry.get(a.entryId) ?? []), a]); continue }
      const m = { key: a.key, date: a.date, counter: a.counter, partner: a.entryPartner, text: a.text }
      if (a.inc) incs.push({ ...m, amount: a.inc })
      if (a.dec) decs.push({ ...m, amount: a.dec })
    }
    /* 계좌간이동 — 자금 계정끼리만 오간 전표. 나간 쪽 → 들어온 쪽. */
    const where = (a: ActualMove) => a.bookLabel !== '[ ]' ? a.bookLabel : a.accountName
    for (const [id, ls] of byEntry) {
      const out = ls.filter((l) => l.dec), inn = ls.filter((l) => l.inc)
      moves.push({ key: `t${id}`, date: ls[0].date, route: `${out.map(where).join(', ')} → ${inn.map(where).join(', ')}`,
        text: ls[0].text, amount: inn.reduce((s, l) => s + l.inc, 0) })
    }
    const planBook = (p: FundPlan) => p.bankAccountId
      ? book(p.bankGlAccountName ?? '', p.bankGlAccountName ?? '', `~${p.bankGlAccountName}`, `#${bankOf(p.bankAccountId)}`, bankOf(p.bankAccountId))
      : book('\uffff', '계좌 미지정건', '\uffff', 'none', '')
    for (const p of carryPlans) planBook(p).carry += planInc(p) - planDec(p)
    const planIncs: Move[] = [], planDecs: Move[] = []
    for (const p of plans) {
      const b = planBook(p)
      b.inc += planInc(p); b.dec += planDec(p)
      const m = { key: `p${p.id}`, date: p.planDate, counter: p.counterAccountName ?? '', partner: p.partnerName ?? '', text: p.memo ?? '' }
      if (planInc(p)) planIncs.push({ ...m, amount: planInc(p) })
      if (planDec(p)) planDecs.push({ ...m, amount: planDec(p) })
    }
    const groups = [...gm.values()]
      .map((g) => ({ ...g, books: [...g.books.values()].filter((b) => b.carry || b.inc || b.dec).sort((x, y) => x.label.localeCompare(y.label, 'ko')) }))
      .filter((g) => g.books.length > 0)
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
    return { groups, incs, decs, moves, planIncs, planDecs }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, base, actuals, plans, carryPlans])

  const sum = (bs: Book[]) => bs.reduce((s, b) => ({ carry: s.carry + b.carry, inc: s.inc + b.inc, dec: s.dec + b.dec }), { carry: 0, inc: 0, dec: 0 })
  const tot = sum(groups.flatMap((g) => g.books))
  const range = `${slash(from)} ~ ${slash(to)}`
  const head = (n: number, t: string) => (
    <div className="flex justify-between font-bold mt-[14px] mb-[4px]"><span>{n}. {t}</span><span className="font-normal">{range}</span></div>
  )
  const foot = <div className="ec-report-foot">{at}</div>
  const moveTable = (n: number, t: string, ms: Move[], partnerHead: string) => (
    <Fragment key={t}>
      {head(n, t)}
      <table className="ec-report w-full text-left">
        <thead>
          <tr><th className="text-center">일자</th><th>상대계정명</th><th>{partnerHead}</th><th>적요</th><th className="text-right">금액</th></tr>
        </thead>
        <tbody>
          {ms.map((m) => (
            <tr key={m.key}>
              <td className="text-center">{slash(m.date)}</td><td>{m.counter}</td><td>{m.partner}</td><td>{m.text}</td>
              <td className="text-right">{amt(m.amount)}</td>
            </tr>
          ))}
          <tr className="ec-total"><td colSpan={4} className="text-center">합계</td><td className="text-right">{amt(ms.reduce((s, m) => s + m.amount, 0))}</td></tr>
        </tbody>
      </table>
      {foot}
    </Fragment>
  )
  /* 자료가 있는 표만 차례로 번호를 단다. */
  const parts: React.ReactNode[] = []
  let n = 1
  if (incs.length) parts.push(moveTable(++n, '자금의 증가', incs, '상대거래처명'))
  if (decs.length) parts.push(moveTable(++n, '자금의 감소', decs, '상대거래처명'))
  if (moves.length) {
    const k = ++n
    parts.push(
      <Fragment key="moves">
        {head(k, '자금의 계좌간이동')}
        <table className="ec-report w-full text-left">
          <thead><tr><th className="text-center">일자</th><th>이동계좌</th><th>적요</th><th className="text-right">금액</th></tr></thead>
          <tbody>
            {moves.map((m) => (
              <tr key={m.key}><td className="text-center">{slash(m.date)}</td><td>{m.route}</td><td>{m.text}</td><td className="text-right">{amt(m.amount)}</td></tr>
            ))}
            <tr className="ec-total"><td colSpan={3} className="text-center">합계</td><td className="text-right">{amt(moves.reduce((s, m) => s + m.amount, 0))}</td></tr>
          </tbody>
        </table>
        {foot}
      </Fragment>,
    )
  }
  if (planIncs.length) parts.push(moveTable(++n, '계획의 증가', planIncs, '거래처명'))
  if (planDecs.length) parts.push(moveTable(++n, '계획의 감소', planDecs, '거래처명'))

  return (
    <>
      {head(1, '추정자금현황')}
      <table className="ec-report w-full text-left">
        <thead>
          <tr>
            <th>계정명</th><th>거래처명</th>
            <th className="text-right">이월잔액[외화]</th><th className="text-right">증가[외화]</th>
            <th className="text-right">감소[외화]</th><th className="text-right">금일잔액[외화]</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
          {groups.map((g) => {
            const s = sum(g.books)
            return (
              <Fragment key={g.name}>
                {g.books.map((b, i) => (
                  <tr key={b.label + i}>
                    <td>{i === 0 ? g.name : ''}</td><td>{b.label}</td>
                    <td className="text-right">{amt(b.carry)}</td><td className="text-right">{amt(b.inc)}</td>
                    <td className="text-right">{amt(b.dec)}</td><td className="text-right">{amt(b.carry + b.inc - b.dec)}</td>
                  </tr>
                ))}
                <tr className="ec-total">
                  <td colSpan={2} className="text-center">{g.name} 계</td>
                  <td className="text-right">{amt(s.carry)}</td><td className="text-right">{amt(s.inc)}</td>
                  <td className="text-right">{amt(s.dec)}</td><td className="text-right">{amt(s.carry + s.inc - s.dec)}</td>
                </tr>
              </Fragment>
            )
          })}
          <tr className="ec-total">
            <td colSpan={2} className="text-center">합계</td>
            <td className="text-right">{amt(tot.carry)}</td><td className="text-right">{amt(tot.inc)}</td>
            <td className="text-right">{amt(tot.dec)}</td><td className="text-right">{amt(tot.carry + tot.inc - tot.dec)}</td>
          </tr>
        </tbody>
      </table>
      {foot}
      {parts}
    </>
  )
}

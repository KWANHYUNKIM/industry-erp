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
import {
  amt, fetchActualMoves, filterPlans, monthEnd, planDec, planInc, slash, type ActualMove, type PlanFilter,
} from '../../features/fundplan/forecast'

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
 * <p>수금 · 지급 · 어음 · 채권 · 채무 계획은 다른 전표에서 오는 계획이라 우리에게 자료가 없어 그 줄은 늘 빈칸이다.
 * 부서 · 프로젝트는 계획전표에만 있다(회계전표 실적에는 걸리지 않는다). [양식] · [결재방표시]는 두지 않는다.
 */
const KINDS = ['자금', '수금', '지급', '어음', '채권', '채무'] as const

export default function FundForecastPage({ variant }: { variant: 'monthly' | 'yearly' }) {
  const yearly = variant === 'yearly'
  const title = yearly ? '추정자금연보' : '추정자금월보'
  const { companyName } = useAuth()
  const masters = useFundPlanMasters()
  const today = ymd(new Date())
  const initFrom = yearly ? today.slice(0, 4) : today.slice(0, 7)
  const [from, setFrom] = useState(initFrom)
  const [to, setTo] = useState(initFrom)
  const [base, setBase] = useState(today)
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [dir, setDir] = useState<'' | 'OUT' | 'IN'>('')
  const [kinds, setKinds] = useState<Set<string>>(new Set(KINDS))
  const [method, setMethod] = useState<'' | 'DEPOSIT' | 'NOTE' | 'ETC'>('')
  const [includeBaseDay, setIncludeBaseDay] = useState(true)
  const [actuals, setActuals] = useState<ActualMove[]>([])
  const [plans, setPlans] = useState<FundPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 조회 구간(날짜) — 월보는 첫 달 1일 ~ 끝 달 말일, 연보는 첫 해 1/1 ~ 끝 해 12/31. */
  const start = yearly ? `${from}-01-01` : `${from}-01`
  const end = yearly ? `${to}-12-31` : monthEnd(to)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [a, p] = await Promise.all([fetchActualMoves(base < end ? base : end), fetchFundPlans(start, end)])
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
    setKinds(new Set(KINDS)); setMethod(''); setIncludeBaseDay(true)
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
          {yearly ? (
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
            <EcPeriodPicks labels={yearly ? ['금년', '전년'] : ['금월', '전월']} currentFrom={start}
                           onPick={(r) => { const n = yearly ? 4 : 7; setFrom(r.from.slice(0, n)); setTo(r.to.slice(0, n)) }} />
          </span>
        </EcCond>
        <EcCond label="실적기준일">
          <input type="date" className="ec-input w-[145px]" aria-label="실적기준일" value={base} onChange={(e) => e.target.value && setBase(e.target.value)} />
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
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={includeBaseDay} onChange={(e) => setIncludeBaseDay(e.target.checked)} /> 실적기준일의 계획전표 포함하기
          </label>
        </EcCond>
      </ul>

      <div className="ec-report-head">
        <h2 className="ec-report-title">{title}</h2>
        <div className="ec-report-meta">
          <span>회사명 : {companyName ?? ''}</span>
          <span>{yearly ? `${from} ~ ${to}` : `${slash(from)} ~ ${slash(to)}`}</span>
        </div>
        {loading ? (
          <p className="ec-empty">불러오는 중…</p>
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

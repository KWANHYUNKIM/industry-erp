import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { useAuth } from '../../features/auth/AuthContext'
import { useBondMasters } from '../../features/bond/api'
import { fetchBudgetReport } from '../../features/budget/api'
import type { BudgetActualLine, BudgetReportPlan } from '../../features/budget/types'
import { dateNo } from '../../utils/dateNo'
import { pad2 } from '../../utils/periods'

/**
 * 회계 II › 예산관리 › 출력물 다섯 — 2026-10-14 loginaa 실측(plans/회계2/E020201.md 3장).
 *
 * <ul>
 * <li><b>예산현황</b>(E020202) — 표시방법 집계 · 월별(기본 월별): 계정코드 · 계정명 · 합계 · 달마다 한 열, 끝 '합계'.</li>
 * <li><b>예산-실적비교표</b>(E020203) · <b>통제예산-실적비교표</b>(E020206) — 예산기준 월 · 분기 · 반기 · 연, 열마다 예산 · 실적 · 예산-실적
 *   ([비율(실적/예산)] 켜면 정수 %), 맨 앞 '계'. 통제 쪽은 3칸째 이름이 '통제예산-실적', [0값 포함] 이 없다(숫자는 같았다).</li>
 * <li><b>예산-실적대장</b>(E020205) — 표가 좌우 둘: 왼쪽 달마다 '[YYYY/MM 예산]' 줄 → '계정명 예산 계', 오른쪽 전표 줄(적요 = 줄 적요,
 *   거래처 = 줄 거래처) → '계정명 / YYYY/MM 실적 계'(연별이면 'YYYY/') → '계정명 실적 계'. 전표번호를 누르면 일반전표.</li>
 * <li><b>통제예산-실적대장</b>(E020204) — 원본도 '등록된 데이터가 없습니다.'(통제 계정을 켜는 [예산계정설정] 이 권한 없음).
 *   우리에게 통제 설정이 없어 늘 빈 목록이다.</li>
 * </ul>
 * 실적 = 그 달 그 계정 전표 금액(비용 · 자산 차 − 대, 나머지 대 − 차). 음수는 그대로 '-'.
 */
export type BudgetReportVariant = 'status' | 'compare' | 'controlLedger' | 'ledger' | 'controlCompare'

const TITLES: Record<BudgetReportVariant, string> = {
  status: '예산현황', compare: '예산-실적비교표', controlLedger: '통제예산-실적대장',
  ledger: '예산-실적대장', controlCompare: '통제예산-실적비교표',
}
type Basis = 'M' | 'Q' | 'H' | 'Y'
const BASIS: [Basis, string][] = [['M', '월별'], ['Q', '분기별'], ['H', '반기별'], ['Y', '연별']]

const fmt = (n: number, thousand = false) => {
  const v = thousand ? Math.round(n / 1000) : Math.round(n)
  return v.toLocaleString('ko-KR')
}
/** 달 'YYYY-MM' 이 든 구간 열쇠 — 월 'YYYY/MM' · 분기 'YYYY/n분기' · 반기 'YYYY/상반기' · 연 'YYYY' */
function bucketOf(ym: string, basis: Basis): string {
  const y = ym.slice(0, 4)
  const m = Number(ym.slice(5, 7))
  if (basis === 'M') return `${y}/${pad2(m)}`
  if (basis === 'Q') return `${y}/${Math.ceil(m / 3)}분기`
  if (basis === 'H') return `${y}/${m <= 6 ? '상반기' : '하반기'}`
  return y
}
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7))
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7))
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad2(m)}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

interface AccountRow { accountId: number; code: string; name: string; budget: Map<string, number>; actual: Map<string, number> }

export default function BudgetReportPage({ variant }: { variant: BudgetReportVariant }) {
  const title = TITLES[variant]
  const ledger = variant === 'ledger' || variant === 'controlLedger'
  const compare = variant === 'compare' || variant === 'controlCompare'
  const { companyName } = useAuth()
  const masters = useBondMasters()
  const navigate = useNavigate()
  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = `${thisYear}-${pad2(now.getMonth() + 1)}`
  const [from, setFrom] = useState(`${thisYear}-01`)
  const [to, setTo] = useState(`${thisYear}-12`)
  const [display, setDisplay] = useState<'SUM' | 'DEPT' | 'PROJECT'>('SUM')
  const [monthly, setMonthly] = useState(true)
  const [basis, setBasis] = useState<Basis>(ledger ? 'Y' : 'M')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [account, setAccount] = useState('')
  const [signLine, setSignLine] = useState(false)
  const [thousand, setThousand] = useState(false)
  const [ratio, setRatio] = useState(false)
  const [zeros, setZeros] = useState(false)
  const [plans, setPlans] = useState<BudgetReportPlan[]>([])
  const [actuals, setActuals] = useState<BudgetActualLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetchBudgetReport(Number(from.slice(0, 4)), Number(to.slice(0, 4)))
      setPlans(r.plans)
      setActuals(r.actuals)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const months = useMemo(() => monthsBetween(from, to), [from, to])
  const keep = (a: { accountId: number; departmentId: number | null; projectId: number | null }) =>
    (!account || String(a.accountId) === account) && (!dept || String(a.departmentId ?? '') === dept) && (!project || String(a.projectId ?? '') === project)
  const shownActuals = useMemo(() => actuals.filter((l) => keep(l) && months.includes(l.date.slice(0, 7))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actuals, account, dept, project, months])
  const rows = useMemo(() => {
    const map = new Map<number, AccountRow>()
    const row = (id: number, code: string, name: string) => {
      let r = map.get(id)
      if (!r) { r = { accountId: id, code, name, budget: new Map(), actual: new Map() }; map.set(id, r) }
      return r
    }
    const names = new Map(plans.map((p) => [p.accountId, p]))
    for (const p of plans) {
      if (!keep(p)) continue
      const r = row(p.accountId, p.accountCode, p.accountName)
      p.months.forEach((v, i) => {
        const ym = `${p.year}-${pad2(i + 1)}`
        if (months.includes(ym)) r.budget.set(ym, (r.budget.get(ym) ?? 0) + Number(v))
      })
    }
    for (const l of shownActuals) {
      const p = names.get(l.accountId)
      if (!p) continue
      const r = row(l.accountId, p.accountCode, p.accountName)
      const ym = l.date.slice(0, 7)
      r.actual.set(ym, (r.actual.get(ym) ?? 0) + Number(l.amount))
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, shownActuals, account, dept, project, months])

  function reset() {
    setFrom(`${thisYear}-01`); setTo(`${thisYear}-12`); setDisplay('SUM'); setMonthly(true); setBasis(ledger ? 'Y' : 'M')
    setDept(''); setProject(''); setAccount(''); setSignLine(false); setThousand(false); setRatio(false); setZeros(false)
  }
  const pick = (label: string, f: string, t: string) => (
    <button key={label} type="button" className="ec-btn-pick" onClick={() => { setFrom(f); setTo(t) }}>{label}</button>
  )
  const prevMonth = (() => { const d = new Date(thisYear, now.getMonth() - 1, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}` })()
  const picks = ledger ? [
    pick('금월(~오늘)', thisMonth, thisMonth), pick('금년', `${thisYear}-01`, `${thisYear}-12`),
    pick('1분기', `${thisYear}-01`, `${thisYear}-03`), pick('2분기', `${thisYear}-04`, `${thisYear}-06`),
    pick('3분기', `${thisYear}-07`, `${thisYear}-09`), pick('4분기', `${thisYear}-10`, `${thisYear}-12`),
    pick('상반기', `${thisYear}-01`, `${thisYear}-06`), pick('하반기', `${thisYear}-07`, `${thisYear}-12`),
  ] : [
    pick('금월(~오늘)', thisMonth, thisMonth), pick('전월', prevMonth, prevMonth), pick('금년', `${thisYear}-01`, `${thisYear}-12`),
    pick('이번기수', `${thisYear}-01`, `${thisYear}-12`), pick('직전기수', `${thisYear - 1}-01`, `${thisYear - 1}-12`),
  ]
  const years = Array.from({ length: 11 }, (_, i) => String(thisYear - 8 + i))
  const ymSelect = (v: string, set: (s: string) => void, which: string) => (
    <>
      <select className="ec-input w-[80px]" aria-label={`${which}년도`} value={v.slice(0, 4)} onChange={(e) => set(`${e.target.value}-${v.slice(5, 7)}`)}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      {!(ledger && basis === 'Y') && (
        <select className="ec-input w-[60px] ml-[2px]" aria-label={`${which}월`} value={v.slice(5, 7)} onChange={(e) => set(`${v.slice(0, 4)}-${e.target.value}`)}>
          {Array.from({ length: 12 }, (_, i) => pad2(i + 1)).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
    </>
  )
  const radio = <T extends string | boolean>(name: string, value: T, cur: T, label: string, on: (v: T) => void) => (
    <label key={String(value)} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="radio" name={`${variant}-${name}`} checked={cur === value} onChange={() => on(value)} /> {label}
    </label>
  )
  const box = (label: string, v: boolean, set: (b: boolean) => void) => (
    <label key={label} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )
  const period = ledger && basis === 'Y' ? `${from.slice(0, 4)} ~ ${to.slice(0, 4)}` : `${from.replace('-', '/')} ~ ${to.replace('-', '/')}`

  return (
    <EcListShell
      title={title}
      searchable={false}
      signLine={signLine}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void load() },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        {!ledger && (
          <EcCond label="표시방법">
            {radio('display', 'SUM', display, '집계', setDisplay)}
            {radio('display', 'DEPT', display, '부서', setDisplay)}
            {radio('display', 'PROJECT', display, '프로젝트', setDisplay)}
          </EcCond>
        )}
        {variant === 'status' && (
          <EcCond label="표시방법">
            {radio('monthly', false, monthly, '집계', setMonthly)}
            {radio('monthly', true, monthly, '월별', setMonthly)}
          </EcCond>
        )}
        {variant !== 'status' && (
          <EcCond label={variant === 'controlLedger' ? '예산관리계정' : '예산기준'}>
            {BASIS.map(([v, l]) => radio('basis', v, basis, l, setBasis))}
          </EcCond>
        )}
        <EcCond label="일자">
          {ymSelect(from, setFrom, '시작')}
          <span className="my-0 mx-[4px]">~</span>
          {ymSelect(to, setTo, '끝')}
          <span className="ml-[6px]">{picks}</span>
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} value={dept} onChange={setDept} items={masters.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} value={project} onChange={setProject} items={masters.projects} />
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} value={account} onChange={setAccount} items={masters.accounts} />
        </EcCond>
        <EcCond label="기타">
          {box('결재방표시', signLine, setSignLine)}
          {!ledger && box('천단위', thousand, setThousand)}
          {compare && box('비율(실적/예산)', ratio, setRatio)}
          {variant === 'compare' && box('0값 포함', zeros, setZeros)}
        </EcCond>
      </ul>

      <div className="ec-report-head">
        <h2 className="ec-report-title">{title}</h2>
        <div className="ec-report-meta">
          <span>회사명 : {companyName ?? ''}</span>
          <span>{period}</span>
        </div>
        {loading ? (
          <p className="ec-empty">불러오는 중…</p>
        ) : variant === 'status' ? (
          <StatusTable rows={rows} months={months} monthly={monthly} thousand={thousand} />
        ) : compare ? (
          <CompareTable rows={rows} months={months} basis={basis} ratio={ratio} zeros={variant === 'compare' && zeros}
                        thousand={thousand} diffLabel={variant === 'controlCompare' ? '통제예산-실적' : '예산-실적'} title={title} />
        ) : variant === 'ledger' ? (
          <LedgerTables rows={rows} months={months} basis={basis} lines={shownActuals.filter((l) => rows.some((r) => r.accountId === l.accountId))}
                        onOpen={(id) => navigate(`/accounting/journal-entry?journal=${id}`)} />
        ) : (
          <ControlLedgerTable />
        )}
      </div>
    </EcListShell>
  )
}

const sumOf = (m: Map<string, number>, keys: string[]) => keys.reduce((s, k) => s + (m.get(k) ?? 0), 0)

function StatusTable({ rows, months, monthly, thousand }: { rows: AccountRow[]; months: string[]; monthly: boolean; thousand: boolean }) {
  const ref = useRef<HTMLTableElement>(null)
  useTableColumnCheck(ref, '예산현황', [rows.length, months.length, monthly])
  const cols = monthly ? months : []
  const total = (ks: string[]) => rows.reduce((s, r) => s + sumOf(r.budget, ks), 0)
  return (
    <table ref={ref} className="ec-report w-full text-left">
      <thead>
        <tr>
          <th>계정코드</th>
          <th>계정명</th>
          <th className="text-right">합계</th>
          {cols.map((m) => <th key={m} className="text-right">{m.replace('-', '/')}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={3 + cols.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
        ) : rows.map((r) => (
          <tr key={r.accountId}>
            <td className="text-left">{r.code}</td>
            <td className="text-left">{r.name}</td>
            <td className="text-right">{fmt(sumOf(r.budget, months), thousand)}</td>
            {cols.map((m) => <td key={m} className="text-right">{fmt(r.budget.get(m) ?? 0, thousand)}</td>)}
          </tr>
        ))}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr className="ec-total">
            <td colSpan={2} className="text-center">합계</td>
            <td className="text-right">{fmt(total(months), thousand)}</td>
            {cols.map((m) => <td key={m} className="text-right">{fmt(total([m]), thousand)}</td>)}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

function CompareTable({ rows, months, basis, ratio, zeros, thousand, diffLabel, title }: {
  rows: AccountRow[]; months: string[]; basis: Basis; ratio: boolean; zeros: boolean; thousand: boolean; diffLabel: string; title: string
}) {
  const ref = useRef<HTMLTableElement>(null)
  const buckets = [...new Set(months.map((m) => bucketOf(m, basis)))]
  const keysOf = (b: string) => months.filter((m) => bucketOf(m, basis) === b)
  const shown = zeros ? rows : rows.filter((r) => sumOf(r.budget, months) !== 0 || sumOf(r.actual, months) !== 0)
  const n = ratio ? 4 : 3
  useTableColumnCheck(ref, title, [shown.length, buckets.length, n])
  const cells = (budget: number, actual: number, key: string) => (
    <Fragment key={key}>
      <td className="text-right">{fmt(budget, thousand)}</td>
      <td className="text-right">{fmt(actual, thousand)}</td>
      <td className="text-right">{fmt(budget - actual, thousand)}</td>
      {ratio && <td className="text-right">{budget ? Math.round(actual / budget * 100) : 0}%</td>}
    </Fragment>
  )
  const head = (key: string) => (
    <Fragment key={key}>
      <th className="text-right">예산</th>
      <th className="text-right">실적</th>
      <th className="text-right">{diffLabel}</th>
      {ratio && <th className="text-right">비율(실적/예산)</th>}
    </Fragment>
  )
  const tot = (ks: string[], side: 'budget' | 'actual') => shown.reduce((s, r) => s + sumOf(r[side], ks), 0)
  return (
    <table ref={ref} className="ec-report w-full text-left">
      <thead>
        <tr>
          <th rowSpan={2}>계정코드</th>
          <th rowSpan={2}>계정명</th>
          <th colSpan={n} className="text-center">계</th>
          {buckets.map((b) => <th key={b} colSpan={n} className="text-center">{b}</th>)}
        </tr>
        <tr>
          {head('all')}
          {buckets.map((b) => head(b))}
        </tr>
      </thead>
      <tbody>
        {shown.length === 0 ? (
          <tr><td colSpan={2 + n * (1 + buckets.length)} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
        ) : shown.map((r) => (
          <tr key={r.accountId}>
            <td className="text-left">{r.code}</td>
            <td className="text-left">{r.name}</td>
            {cells(sumOf(r.budget, months), sumOf(r.actual, months), 'all')}
            {buckets.map((b) => cells(sumOf(r.budget, keysOf(b)), sumOf(r.actual, keysOf(b)), b))}
          </tr>
        ))}
      </tbody>
      {shown.length > 0 && (
        <tfoot>
          <tr className="ec-total">
            <td colSpan={2} className="text-center">계</td>
            {cells(tot(months, 'budget'), tot(months, 'actual'), 'all')}
            {buckets.map((b) => cells(tot(keysOf(b), 'budget'), tot(keysOf(b), 'actual'), b))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

function LedgerHead() {
  return (
    <thead>
      <tr>
        <th>계정코드</th>
        <th>계정명</th>
        <th>전표번호</th>
        <th>적요</th>
        <th>거래처명</th>
        <th className="text-right">금액</th>
      </tr>
    </thead>
  )
}

function LedgerTables({ rows, months, basis, lines, onOpen }: {
  rows: AccountRow[]; months: string[]; basis: Basis; lines: BudgetActualLine[]; onOpen: (journalId: number) => void
}) {
  const left = useRef<HTMLTableElement>(null)
  const right = useRef<HTMLTableElement>(null)
  useTableColumnCheck(left, '예산-실적대장 예산', [rows.length])
  useTableColumnCheck(right, '예산-실적대장 실적', [lines.length])
  /** 원본 소계 이름 — 월별 'YYYY/MM', 연별 'YYYY/'(원본 글자 그대로 빗금이 남는다) */
  const label = (ym: string) => (basis === 'Y' ? `${ym.slice(0, 4)}/` : bucketOf(ym, basis))
  const empty = rows.length === 0
  return (
    <div className="flex gap-[10px] items-start">
      <table ref={left} className="ec-report w-1/2 text-left">
        <LedgerHead />
        <tbody>
          {empty ? <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr> : rows.map((r) => (
            <Fragment key={r.accountId}>
              {months.filter((m) => (r.budget.get(m) ?? 0) !== 0).map((m) => (
                <tr key={m}>
                  <td className="text-left">{r.code}</td>
                  <td className="text-left">{r.name}</td>
                  <td />
                  <td className="text-left">[{m.replace('-', '/')} 예산]</td>
                  <td />
                  <td className="text-right">{fmt(r.budget.get(m) ?? 0)}</td>
                </tr>
              ))}
              <tr className="ec-total">
                <td colSpan={5} className="text-center">{r.name} 예산 계</td>
                <td className="text-right">{fmt(sumOf(r.budget, months))}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <table ref={right} className="ec-report w-1/2 text-left">
        <LedgerHead />
        <tbody>
          {empty ? <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr> : rows.map((r) => {
            const mine = lines.filter((l) => l.accountId === r.accountId)
            const groups = [...new Set(mine.map((l) => label(l.date.slice(0, 7))))]
            return (
              <Fragment key={r.accountId}>
                {groups.map((g) => {
                  const ls = mine.filter((l) => label(l.date.slice(0, 7)) === g)
                  return (
                    <Fragment key={g}>
                      {ls.map((l, i) => (
                        <tr key={`${l.journalId}-${i}`}>
                          <td className="text-left">{r.code}</td>
                          <td className="text-left">{r.name}</td>
                          <td className="text-left"><button type="button" className="ec-link" onClick={() => onOpen(l.journalId)}>{dateNo(l.date, l.docNo)}</button></td>
                          <td className="text-left">{l.description ?? ''}</td>
                          <td className="text-left">{l.partnerName ?? ''}</td>
                          <td className="text-right">{fmt(Number(l.amount))}</td>
                        </tr>
                      ))}
                      <tr className="ec-total">
                        <td colSpan={5} className="text-center">{r.name} / {g} 실적 계</td>
                        <td className="text-right">{fmt(ls.reduce((s, l) => s + Number(l.amount), 0))}</td>
                      </tr>
                    </Fragment>
                  )
                })}
                <tr className="ec-total">
                  <td colSpan={5} className="text-center">{r.name} 실적 계</td>
                  <td className="text-right">{fmt(sumOf(r.actual, months))}</td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** 통제예산-실적대장 — 통제 계정 설정이 없어(원본도 권한 없음) 늘 빈 목록. */
function ControlLedgerTable() {
  const ref = useRef<HTMLTableElement>(null)
  useTableColumnCheck(ref, '통제예산-실적대장', [])
  return (
    <table ref={ref} className="ec-report w-full text-left">
      <thead>
        <tr>
          <th>계정코드</th>
          <th>계정명</th>
          <th>전표번호</th>
          <th>적요</th>
          <th>거래처명</th>
          <th className="text-right">예산</th>
          <th className="text-right">실적</th>
          <th className="text-right">잔액</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
      </tbody>
    </table>
  )
}

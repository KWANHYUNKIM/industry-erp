import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INCOME_STATEMENT_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../features/auth/AuthContext'
import type { TrialBalance } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import CodePickerField from '../../components/CodePickerField'
import {
  fetchSplit, groupsOf, HorizontalStatementTable, ShowModeRadios, StatementTable, toTrialBalance, useShowModes,
  type SLine, type Split, type SplitBy,
} from '../../features/statement/showMode'
import { pad2 } from '../../utils/periods'

const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad2(new Date(y, m, 0).getDate())}` }
const dayBefore = (d: string) => { const t = new Date(`${d}T00:00:00`); t.setDate(t.getDate() - 1); return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}` }
const shiftYear = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`

/**
 * 원본 [구분] — 제품제조(5018) · 용역(6018) · 기타(7018). 숫자는 그 명세서의 당기제품제조원가 계정이고,
 * 원가 계정의 코드 앞자리(5 · 6 · 7)가 명세서를 가른다(2026-10-03 실측).
 */
const KINDS = [['제품제조 5018', '5'], ['용역 6018', '6'], ['기타 7018', '7']] as const
type Compare = '직전기수' | '전기동일기간' | '직접입력' | '선택안함'
const COMPARES: Compare[] = ['직전기수', '전기동일기간', '직접입력', '선택안함']
/** 재공품 계정(표준 169). 기초 · 기말재공품재고액은 이 계정의 기간 앞 · 끝 잔액이다. */
const WIP_CODE = '1699'

/** 원가 계정을 원본의 Ⅰ. 재료비 · Ⅱ. 노무비 · Ⅲ. 경비로 — 우리 계정은 이 구분을 들지 않아 계정명으로 가른다. */
type Bucket = '재료비' | '노무비' | '경비'
const bucketOf = (name: string): Bucket =>
  /재료/.test(name) ? '재료비' : /임금|급여|상여|퇴직|잡급|수당/.test(name) ? '노무비' : '경비'
const ROMAN: Record<Bucket, string> = { 재료비: 'Ⅰ. 재료비', 노무비: 'Ⅱ. 노무비', 경비: 'Ⅲ. 경비' }

interface Amounts { [code: string]: { name: string; amt: number } }
interface CostData { cost: Amounts; wipOpen: number; wipClose: number }
/** 부서(프로젝트)마다 나눈 세 기간(당기 · 기초 전날까지 · 기말까지)의 계정 합. */
interface SplitTbs { period: Split; open: Split; close: Split; from: string; to: string }

/**
 * 회계 I &gt; 출력물 &gt; 주요재무제표 &gt; <b>원가명세서</b>(E010816) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 구분(<b>제품제조 5018</b> · 용역 6018 · 기타 7018) · 부서표시방법 · 프로젝트표시방법(<b>집계</b> · 종 · 횡) ·
 * 기준일자(달 구간, 기본 기수 첫 달 ~ 이번 달) 옆에 비교(<b>직전기수</b> · 전기동일기간 · 당기누계 · 직접입력 · 선택안함) ·
 * 부서 · 프로젝트 · 기타([천단위] · [잔액0포함] · [내역없는부서/프로젝트제외] · [전표발생계정], 다 꺼짐).
 *
 * <p>표는 손익계산서와 같은 꼴(재무제표표시명 | 기준 두 칸 | 비교 두 칸). 줄은 Ⅰ. 재료비 · Ⅱ. 노무비 · Ⅲ. 경비(계정이 있는 것만) ·
 * Ⅳ. 당기총비용합계 · 기초재공품재고액 · 합 계 · 기말재공품재고액 · 타계정대체액 · 당기제품제조원가.
 * 원가 계정은 코드 앞자리(5 · 6 · 7)로 고르고, 재료비 · 노무비 · 경비는 계정명으로 가른다(우리 계정은 그 구분을 들지 않는다).
 * 재공품은 169 계정 잔액. 타계정대체액은 원가를 다른 계정으로 넘긴 분개를 가려 낼 표지가 우리 전표에 없어 비운다.
 * [당기누계]는 아직 없고, [부서] · [프로젝트]는 회계전표 줄의 것(V343)으로 거른다.
 * [부서표시방법] · [프로젝트표시방법] 종 · 횡은 features/statement/showMode(손익계산서에서 잰 규칙)로 그린다.
 */
export default function CostStatementPage() {
  /* 원본 조건 [부서] · [프로젝트] — 서버가 회계전표 줄의 것(V343)으로 거른다. */
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const dp = { departmentId: dept || undefined, projectId: project || undefined }
  const { companyName } = useAuth()
  const now = new Date()
  const thisYm = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const startYm = (fs: number) => `${now.getMonth() + 1 >= fs ? now.getFullYear() : now.getFullYear() - 1}-${pad2(fs)}`
  const [fiscalStart, setFiscalStart] = useState(1)
  const [kind, setKind] = useState<string>('5')
  const [fromYm, setFromYm] = useState(startYm(1))
  const [toYm, setToYm] = useState(thisYm)
  const [compare, setCompare] = useState<Compare>('직전기수')
  const [cmpFromYm, setCmpFromYm] = useState(startYm(1))
  const [cmpToYm, setCmpToYm] = useState(thisYm)
  const [thousand, setThousand] = useState(false)
  const [base, setBase] = useState<CostData | null>(null)
  const [cmp, setCmp] = useState<CostData | null>(null)
  const [error, setError] = useState('')
  const modes = useShowModes(() => setCompare('선택안함'))
  const [splitBase, setSplitBase] = useState<SplitTbs | null>(null)
  const [splitCmp, setSplitCmp] = useState<SplitTbs | null>(null)

  useEffect(() => {
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) { setFiscalStart(m); setFromYm(startYm(m)) } })
      .catch(() => { /* 못 받으면 1월 기수로 본다 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const from = `${fromYm}-01`
  const to = monthEnd(toYm)
  const cmpRange = useMemo(() => {
    if (compare === '선택안함') return null
    if (compare === '전기동일기간') return { from: shiftYear(from, -1), to: monthEnd(shiftYear(toYm, -1)) }
    if (compare === '직접입력') return { from: `${cmpFromYm}-01`, to: monthEnd(cmpToYm) }
    const y = Number(fromYm.slice(0, 4)) - (Number(fromYm.slice(5)) >= fiscalStart ? 1 : 2)
    const e = new Date(y + 1, fiscalStart - 1, 0)
    return { from: `${y}-${pad2(fiscalStart)}-01`, to: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}` }
  }, [compare, from, toYm, cmpFromYm, cmpToYm, fromYm, fiscalStart])

  /** 한 기간의 원가 계정 금액(차 − 대)과 재공품 기초 · 기말 잔액. */
  async function fetchOne(r: { from: string; to: string }) {
    const tb = (f: string, t: string) => api.get<TrialBalance>('/journals/trial-balance', { params: { ...dp, from: f, to: t } }).then((x) => x.data)
    const [period, open, close] = await Promise.all([tb(r.from, r.to), tb('1900-01-01', dayBefore(r.from)), tb('1900-01-01', r.to)])
    return costOf(period, open, close)
  }
  async function fetchSplitTbs(by: SplitBy, r: { from: string; to: string }): Promise<SplitTbs> {
    const [period, open, close] = await Promise.all([
      fetchSplit(by, r, dp), fetchSplit(by, { from: '1900-01-01', to: dayBefore(r.from) }, dp), fetchSplit(by, { from: '1900-01-01', to: r.to }, dp),
    ])
    return { period, open, close, ...r }
  }
  const groupCost = (s: SplitTbs, key: string) => costOf(toTrialBalance(s.period.get(key) ?? [], s.from, s.to),
    toTrialBalance(s.open.get(key) ?? [], '', ''), toTrialBalance(s.close.get(key) ?? [], '', ''))
  /** 세 시산표 → 원가 계정 금액(차 − 대) · 재공품 기초 · 기말 잔액. */
  function costOf(period: TrialBalance, open: TrialBalance, close: TrialBalance): CostData {
    const cost: Amounts = {}
    for (const row of period.rows) {
      if (row.division !== 'EXPENSE' || !row.accountCode.startsWith(kind)) continue
      cost[row.accountCode] = { name: row.accountName, amt: Number(row.debit) - Number(row.credit) }
    }
    const wip = (x: TrialBalance) => { const w = x.rows.find((row) => row.accountCode === WIP_CODE); return w ? Number(w.debit) - Number(w.credit) : 0 }
    return { cost, wipOpen: wip(open), wipClose: wip(close) }
  }

  function load() {
    setError('')
    Promise.all([
      fetchOne({ from, to }), cmpRange ? fetchOne(cmpRange) : Promise.resolve(null),
      modes.by ? fetchSplitTbs(modes.by, { from, to }) : Promise.resolve(null),
      modes.by && modes.mode === '종' && cmpRange ? fetchSplitTbs(modes.by, cmpRange) : Promise.resolve(null),
    ])
      .then(([b, c, sb, sc]) => { setBase(b); setCmp(c); setSplitBase(sb); setSplitCmp(sc) })
      .catch((err) => setError(extractErrorMessage(err)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [dept, project, from, to, cmpRange, kind, modes.by, modes.mode])

  /** 한 장의 줄 — 집계는 전체, 종은 부서(프로젝트)마다, 횡은 열마다 같은 셈을 쓴다. */
  const linesOf = (bs: CostData | null, cs: CostData | null): SLine[] => {
    const codes = [...new Set([...Object.keys(bs?.cost ?? {}), ...Object.keys(cs?.cost ?? {})])].sort()
    const lines = codes.map((code) => {
      const name = bs?.cost[code]?.name ?? cs?.cost[code]?.name ?? ''
      return { code, name, bucket: bucketOf(name), b: bs?.cost[code]?.amt ?? 0, c: cs?.cost[code]?.amt ?? 0 }
    })
    const sum = (side: 'b' | 'c', bucket?: Bucket) => lines.filter((l) => !bucket || l.bucket === bucket).reduce((s, l) => s + l[side], 0)
    const calc = (side: 'b' | 'c', x: CostData | null) => {
      const total = sum(side)
      const open = x?.wipOpen ?? 0, close = x?.wipClose ?? 0
      return { total, open, all: total + open, close, made: total + open - close }
    }
    const b = calc('b', bs), c = calc('c', cs)
    const out: SLine[] = []
    const push = (key: string, label: string, left: SLine['left'], right: SLine['right'], bold = false) => out.push({ key, label, left, right, bold })
    for (const k of ['재료비', '노무비', '경비'] as Bucket[]) {
      const ls = lines.filter((l) => l.bucket === k)
      if (ls.length === 0) continue
      push(`g:${k}`, ROMAN[k], [null, sum('b', k)], [null, sum('c', k)], true)
      ls.forEach((l) => push(`a:${l.code}`, l.name, [l.b, null], [l.c, null]))
    }
    push('total', 'Ⅳ. 당기총비용합계', [null, b.total], [null, c.total], true)
    push('open', '기초재공품재고액', [null, b.open], [null, c.open], true)
    push('all', '합 계', [null, b.all], [null, c.all], true)
    push('close', '기말재공품재고액', [null, b.close], [null, c.close], true)
    push('transfer', '타계정대체액', [null, null], [null, null])
    push('made', '당기제품제조원가', [null, b.made], [null, c.made], true)
    return out
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mainLines = useMemo(() => linesOf(base, cmp), [base, cmp])
  const groups = useMemo(() => {
    if (!modes.by || !splitBase) return []
    const items = modes.by === 'department' ? deptProject.departments : deptProject.projects
    const present = new Set(splitBase.period.keys())
    return groupsOf(modes.mode, modes.by, items, present)
  }, [modes.by, modes.mode, splitBase, deptProject])

  const fmt = (n: number | null) => (n == null || n === 0 ? '' : Math.round(thousand ? n / 1000 : n).toLocaleString('ko-KR'))
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '원가명세서', [mainLines.length, compare, modes.mode, groups.length])

  const heads: [string, string] = [`${fromYm.slice(0, 4)}년 (기준)`, cmpRange ? `${cmpRange.from.slice(0, 4)}년 (비교)` : '(비교)']
  const head = (suffix?: string) => (
    <>
      <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[12px]">원가명세서</h3>
      {/* 원본 머리(2026-10-20 실측): 제목 아래 가운데 '제 17기 2026/01/01 부터 2026/10/31 까지' · 비교 기간 한 줄 더, 왼쪽 회사명 · 오른쪽 '단위 : 원'. 우리는 기수 번호를 들지 않아 날짜만. */}
      <p className="text-center text-[12px] m-0">{from.replace(/-/g, '/')} 부터 {to.replace(/-/g, '/')} 까지</p>
      {cmpRange && <p className="text-center text-[12px] m-0">{cmpRange.from.replace(/-/g, '/')} 부터 {cmpRange.to.replace(/-/g, '/')} 까지</p>}
      <div className="flex justify-between text-[12px] mt-0 mx-0 mb-[4px]">
        <span>회사명 : {companyName ?? ''}{suffix ? ` / ${suffix}` : ''}</span>
        <span>단위 : {thousand ? '천원' : '원'}</span>
      </div>
    </>
  )

  return (
    <EcListShell
      title="원가명세서"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setDept(''); setProject(''); modes.reset(); setKind('5'); setFromYm(startYm(fiscalStart)); setToYm(thisYm); setCompare('직전기수'); setThousand(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          {KINDS.map(([l, v]) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="cs-kind" checked={kind === v} onChange={() => setKind(v)} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="부서표시방법"><ShowModeRadios m={modes} which="dept" name="cs" /></EcCond>
        <EcCond label="프로젝트표시방법"><ShowModeRadios m={modes} which="proj" name="cs" /></EcCond>
        <EcCond label="기준일자">
          <input type="month" className="ec-input" value={fromYm} onChange={(e) => e.target.value && setFromYm(e.target.value)} style={{ width: 130 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="month" className="ec-input" value={toYm} onChange={(e) => e.target.value && setToYm(e.target.value)} style={{ width: 130, marginRight: 10 }} />
          {COMPARES.map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="cs-compare" checked={compare === v} onChange={() => setCompare(v)} /> {v}
            </label>
          ))}
          {compare === '직접입력' && (
            <>
              <input type="month" className="ec-input" value={cmpFromYm} onChange={(e) => e.target.value && setCmpFromYm(e.target.value)} style={{ width: 130 }} />
              <span className="my-0 mx-[4px]">~</span>
              <input type="month" className="ec-input" value={cmpToYm} onChange={(e) => e.target.value && setCmpToYm(e.target.value)} style={{ width: 130 }} />
            </>
          )}
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INCOME_STATEMENT_PICKS} currentFrom={from} fiscalStart={fiscalStart}
                           onPick={(r) => { setFromYm(r.from.slice(0, 7)); setToYm(r.to.slice(0, 7)) }} />
          </span>
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="checkbox" checked={thousand} onChange={(e) => setThousand(e.target.checked)} /> 천단위
          </label>
        </EcCond>
      </ul>

      {base && (!modes.by || modes.mode === '집계') && (
        <>
          {head()}
          <StatementTable ref={tableRef} lines={mainLines} heads={heads} showCmp={!!cmp} fmt={fmt} />
        </>
      )}
      {base && modes.by && splitBase && modes.mode === '횡' && (
        <>
          {head()}
          <HorizontalStatementTable ref={tableRef} total={linesOf(base, null)} fmt={fmt}
            cols={groups.map((g) => ({ head: g.head, lines: linesOf(groupCost(splitBase, g.key), null) }))} />
        </>
      )}
      {base && modes.by && splitBase && modes.mode === '종' && groups.map((g, i) => (
        <div key={g.key} className={i > 0 ? 'mt-[24px]' : undefined}>
          {head(g.label)}
          <StatementTable ref={i === 0 ? tableRef : undefined} heads={heads} showCmp={!!splitCmp} fmt={fmt}
            lines={linesOf(groupCost(splitBase, g.key), splitCmp ? groupCost(splitCmp, g.key) : null)} />
        </div>
      ))}
    </EcListShell>
  )
}

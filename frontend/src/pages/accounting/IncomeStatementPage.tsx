import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcPrintedAt from '../../components/ui/EcPrintedAt'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INCOME_STATEMENT_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../features/auth/AuthContext'
import type { IncomeStatement, StatementRow } from '../../types/api'
import { incomeBucketOf, type IncomeBucket } from '../../utils/incomeBuckets'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import CodePickerField from '../../components/codepicker/CodePickerField'
import {
  fetchSplit, groupsOf, HorizontalStatementTable, ShowModeRadios, StatementTable, toIncomeStatement, useShowModes,
  type SLine, type Split,
} from '../../features/statement/showMode'
import { pad2 } from '../../utils/periods'

const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad2(new Date(y, m, 0).getDate())}` }
const shiftYear = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`

type Compare = '직전기수' | '전기동일기간' | '직접입력' | '선택안함'
const COMPARES: Compare[] = ['직전기수', '전기동일기간', '직접입력', '선택안함']

/**
 * 원본 손익계산서의 차례(2026-10-03 실측) — 1. 매출 · 2. 매출원가 · 3. 매출총이익 · 4. 판매비 및 일반관리비 · 5. 영업손익 ·
 * 6. 영업외수익 · 7. 영업외비용 · 8. 법인세비용차감전순손익 · 9. 법인세비용 · 12. 당기순이익. 계정 묶음(1 · 2 · 4 · 6 · 7 · 9)은
 * 계정이 없으면 원본도 줄을 빼고(그날 6이 없었다), 계산 줄(3 · 5 · 8 · 12)은 늘 찍는다.
 */
type Bucket = IncomeBucket
const BUCKET_OF = incomeBucketOf

interface AccountOpt { code: string; detailCategory: string | null; division: string }

/**
 * 회계 I &gt; 출력물 &gt; 주요재무제표 &gt; <b>손익계산서</b>(E010812) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 부서표시방법 · 프로젝트표시방법(<b>집계</b> · 종 · 횡) · 기준일자(달 구간, 기본 기수 첫 달 ~ <b>이번 달</b> = 2026/01 ~ 10,
 * 빠른선택 금월(~오늘) · 전월 · 이번기수 · 직전기수) 옆에 비교(<b>직전기수</b> · 전기동일기간 · 당기누계 · 직접입력 · 선택안함) ·
 * 부서 · 프로젝트 · 기타([천단위] · [잔액0포함] · [내역없는부서/프로젝트제외] · [전표발생계정] · [사용중단/삭제포함] ·
 * [기초,당기,기말표시], 다 꺼짐) · 적용양식.
 *
 * <p>표는 재무상태표와 같은 꼴 — 재무제표표시명 | 제 N 기 (기준) 두 칸 | 제 N-1 기 (비교) 두 칸(왼 = 계정, 오른 = 묶음 · 계산 줄).
 * 묶음 · 계산 줄이 굵다. 계정은 세부분류로 묶음에 넣는다(매출액 → 매출, 매출원가 · 제조원가 → 매출원가, 영업외수익 · 영업외비용,
 * 나머지 비용 → 판매비 및 일반관리비). 기수 번호가 없어 머리는 'YYYY년'. [당기누계] · [기초,당기,기말표시]는 원가 계정 쪽 표시라
 * 아직 두지 않았고, [부서] · [프로젝트]는 회계전표 줄의 것(V343)으로 거른다. [부서표시방법] · [프로젝트표시방법] 종 · 횡은
 * features/statement/showMode 가 부서(프로젝트)마다 나눈 계정 합으로 같은 판을 여러 장(종) · 여러 열(횡)로 그린다.
 */
export default function IncomeStatementPage() {
  /* 원본 조건 [부서] · [프로젝트] — 서버가 회계전표 줄의 것(V343)으로 거른다. */
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const dp = { departmentId: dept || undefined, projectId: project || undefined }
  const { companyName } = useAuth()
  const [fiscalStart, setFiscalStart] = useState(1)
  const now = new Date()
  const thisYm = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const startYm = (fs: number) => `${now.getMonth() + 1 >= fs ? now.getFullYear() : now.getFullYear() - 1}-${pad2(fs)}`
  const [fromYm, setFromYm] = useState(startYm(1))
  const [toYm, setToYm] = useState(thisYm)
  const [compare, setCompare] = useState<Compare>('직전기수')
  const [cmpFromYm, setCmpFromYm] = useState(startYm(1))
  const [cmpToYm, setCmpToYm] = useState(thisYm)
  const [signBox, setSignBox] = useState(false)   // 원본 [기타] 결재방표시 — 꺼짐으로 시작
  const [thousand, setThousand] = useState(false)
  const [withZero, setWithZero] = useState(false)
  const [hideIdle, setHideIdle] = useState(false)
  const [accounts, setAccounts] = useState<(AccountOpt & { name: string })[]>([])
  const [base, setBase] = useState<IncomeStatement | null>(null)
  const [cmp, setCmp] = useState<IncomeStatement | null>(null)
  const [error, setError] = useState('')
  const modes = useShowModes(() => setCompare('선택안함'))
  const [splitBase, setSplitBase] = useState<Split | null>(null)
  const [splitCmp, setSplitCmp] = useState<Split | null>(null)

  useEffect(() => {
    api.get<(AccountOpt & { name: string })[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => {
        const m = Number(r.data?.fiscalStart)
        if (m >= 1 && m <= 12) { setFiscalStart(m); setFromYm(startYm(m)) }
      })
      .catch(() => { /* 못 받으면 1월 기수로 본다 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const from = `${fromYm}-01`
  const to = monthEnd(toYm)
  /** 비교 기간 — 직전기수는 지난 기수 열두 달, 전기동일기간은 한 해 앞 같은 달들. */
  const cmpRange = useMemo(() => {
    if (compare === '선택안함') return null
    if (compare === '전기동일기간') return { from: shiftYear(from, -1), to: monthEnd(shiftYear(toYm, -1)) }
    if (compare === '직접입력') return { from: `${cmpFromYm}-01`, to: monthEnd(cmpToYm) }
    const y = Number(fromYm.slice(0, 4)) - (Number(fromYm.slice(5)) >= fiscalStart ? 1 : 2)
    const s = `${y}-${pad2(fiscalStart)}`
    const e = new Date(y + 1, fiscalStart - 1, 0)
    return { from: `${s}-01`, to: `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}` }
  }, [compare, from, toYm, cmpFromYm, cmpToYm, fromYm, fiscalStart])

  function load() {
    setError('')
    Promise.all([
      api.get<IncomeStatement>('/journals/income-statement', { params: { ...dp, from, to } }),
      cmpRange ? api.get<IncomeStatement>('/journals/income-statement', { params: { ...cmpRange, ...dp } }) : Promise.resolve(null),
      modes.by ? fetchSplit(modes.by, { from, to }, dp) : Promise.resolve(null),
      modes.by && modes.mode === '종' && cmpRange ? fetchSplit(modes.by, cmpRange, dp) : Promise.resolve(null),
    ])
      .then(([b, c, sb, sc]) => { setBase(b.data); setCmp(c ? c.data : null); setSplitBase(sb); setSplitCmp(sc) })
      .catch((err) => setError(extractErrorMessage(err)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [dept, project, from, to, cmpRange, modes.by, modes.mode])

  const catOf = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts])
  /** 한 장의 줄 — 집계는 전체, 종은 부서(프로젝트)마다, 횡은 열마다 같은 셈을 쓴다. */
  const linesOf = (bs: IncomeStatement | null, cs: IncomeStatement | null): SLine[] => {
    const all = new Map<string, { code: string; name: string; bucket: Bucket; b: number; c: number }>()
    const put = (rows: StatementRow[], side: 'b' | 'c') => rows.forEach((r) => {
      const a = catOf.get(r.accountCode)
      const bucket = BUCKET_OF(r.division, a?.detailCategory ?? '')
      if (!all.has(r.accountCode)) all.set(r.accountCode, { code: r.accountCode, name: r.accountName, bucket, b: 0, c: 0 })
      all.get(r.accountCode)![side] += Number(r.amount)
    })
    if (bs) { put(bs.revenues, 'b'); put(bs.expenses, 'b') }
    if (cs) { put(cs.revenues, 'c'); put(cs.expenses, 'c') }
    if (withZero) accounts.filter((a) => a.division === 'REVENUE' || a.division === 'EXPENSE').forEach((a) => {
      if (!all.has(a.code)) all.set(a.code, { code: a.code, name: a.name, bucket: BUCKET_OF(a.division, a.detailCategory ?? ''), b: 0, c: 0 })
    })
    const lines = [...all.values()].sort((x, y) => x.code.localeCompare(y.code))
    const of = (k: Bucket) => lines.filter((l) => l.bucket === k)
    const sum = (k: Bucket, side: 'b' | 'c') => of(k).reduce((s, l) => s + l[side], 0)
    const calc = (side: 'b' | 'c') => {
      const gross = sum('SALES', side) - sum('COGS', side)
      const op = gross - sum('SGA', side)
      const pre = op + sum('NOI', side) - sum('NOE', side)
      return { gross, op, pre, net: pre - sum('TAX', side) }
    }
    const b = calc('b'), c = calc('c')
    const out: SLine[] = []
    const push = (key: string, label: string, left: SLine['left'], right: SLine['right'], bold = false) => out.push({ key, label, left, right, bold })
    const group = (label: string, k: Bucket) => {
      const ls = of(k)
      if (ls.length === 0) return
      push(`g:${k}`, label, [null, sum(k, 'b')], [null, sum(k, 'c')], true)
      ls.forEach((l) => push(`a:${l.code}`, l.name, [l.b, null], [l.c, null]))
    }
    group('1. 매출', 'SALES')
    group('2. 매출원가', 'COGS')
    push('gross', '3. 매출총이익', [null, b.gross], [null, c.gross], true)
    group('4. 판매비 및 일반관리비', 'SGA')
    push('op', '5. 영업손익', [null, b.op], [null, c.op], true)
    group('6. 영업외수익', 'NOI')
    group('7. 영업외비용', 'NOE')
    push('pre', '8. 법인세비용차감전순손익', [null, b.pre], [null, c.pre], true)
    group('9. 법인세비용', 'TAX')
    push('net', '12. 당기순이익', [null, b.net], [null, c.net], true)
    return out
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mainLines = useMemo(() => linesOf(base, cmp), [base, cmp, catOf, withZero, accounts])
  const groups = useMemo(() => {
    if (!modes.by || !splitBase) return []
    const items = modes.by === 'department' ? deptProject.departments : deptProject.projects
    return groupsOf(modes.mode, modes.by, items, new Set(splitBase.keys()), hideIdle)
  }, [modes.by, modes.mode, splitBase, deptProject, hideIdle])
  const groupIs = (s: Split | null, key: string, f: string, t: string) => toIncomeStatement(s?.get(key) ?? [], f, t)

  const fmt = (n: number | null) => (n == null || n === 0 ? '' : Math.round(thousand ? n / 1000 : n).toLocaleString('ko-KR'))
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '손익계산서', [base ? 1 : 0, compare, modes.mode, groups.length])

  const heads: [string, string] = [`${fromYm.slice(0, 4)}년 (기준)`, cmpRange ? `${cmpRange.from.slice(0, 4)}년 (비교)` : '(비교)']
  const head = (suffix?: string) => (
    <>
      <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[12px]">손익계산서</h3>
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
      title="손익계산서"
      searchable={false}
      signLine={signBox}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setDept(''); setProject(''); modes.reset(); setFromYm(startYm(fiscalStart)); setToYm(thisYm); setCompare('직전기수'); setThousand(false); setWithZero(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="부서표시방법"><ShowModeRadios m={modes} which="dept" name="is" /></EcCond>
        <EcCond label="프로젝트표시방법"><ShowModeRadios m={modes} which="proj" name="is" /></EcCond>
        <EcCond label="기준일자">
          <input type="month" className="ec-input" value={fromYm} onChange={(e) => e.target.value && setFromYm(e.target.value)} style={{ width: 130 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="month" className="ec-input" value={toYm} onChange={(e) => e.target.value && setToYm(e.target.value)} style={{ width: 130, marginRight: 10 }} />
          {COMPARES.map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="is-compare" checked={compare === v} onChange={() => setCompare(v)} /> {v}
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
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
          </label>
          {([['천단위', thousand, setThousand], ['잔액0포함', withZero, setWithZero], ['내역없는부서/프로젝트제외', hideIdle, setHideIdle]] as const).map(([l, v, set]) => (
            <label key={l} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {l}
            </label>
          ))}
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
            cols={groups.map((g) => ({ head: g.head, lines: linesOf(groupIs(splitBase, g.key, from, to), null) }))} />
        </>
      )}
      {base && modes.by && splitBase && modes.mode === '종' && groups.map((g, i) => (
        <div key={g.key} className={i > 0 ? 'mt-[24px]' : undefined}>
          {head(g.label)}
          <StatementTable ref={i === 0 ? tableRef : undefined} heads={heads} showCmp={!!splitCmp} fmt={fmt}
            lines={linesOf(groupIs(splitBase, g.key, from, to), splitCmp && cmpRange ? groupIs(splitCmp, g.key, cmpRange.from, cmpRange.to) : null)} />
        </div>
      ))}
      {base && <EcPrintedAt />}
    </EcListShell>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../features/auth/AuthContext'
import type { BalanceSheet, StatementRow } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import CodePickerField from '../../components/CodePickerField'
import {
  fetchSplit, groupsOf, HorizontalStatementTable, ShowModeRadios, StatementTable, toBalanceSheet, useShowModes,
  type SLine, type Split,
} from '../../features/statement/showMode'

/** 달(YYYY-MM)의 말일. */
const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 0)
  return `${ym}-${String(d.getDate()).padStart(2, '0')}`
}
const thisMonth = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}` }

type Compare = '직전기수' | '전기동일기간' | '직접입력' | '선택안함'
const COMPARES: Compare[] = ['직전기수', '전기동일기간', '직접입력', '선택안함']

interface AccountOpt { code: string; detailCategory: string | null }
/** 재무제표의 한 칸 묶음 — 원본의 "1) 유동자산 &gt; (1) 당좌자산" 같은 두 층. */
interface Sub { label: string; rows: StatementRow[] }
interface Part { label: string; subs: Sub[] }

/**
 * 계정의 세부분류를 원본 재무상태표의 두 층(대분류 · 중분류)으로 놓는다. 원본(2026-10-03 실측)은
 * 1. 자산 &gt; 1) 유동자산 &gt; (1) 당좌자산 · (2) 재고자산, 2) 비유동자산 &gt; (2) 유형자산 …, 2. 부채 &gt; 1) 유동부채,
 * 3. 자본 &gt; 5) 이익잉여금 &gt; 미처분이익잉여금 · (당기순이익) 차례다.
 */
function placeOf(division: 'ASSET' | 'LIABILITY' | 'EQUITY', cat: string): [string, string] {
  if (division === 'ASSET') {
    if (cat === '재고자산') return ['1)  유동자산', '(2) 재고자산']
    if (cat === '유동자산' || cat === '매출채권' || cat === '') return ['1)  유동자산', '(1) 당좌자산']
    if (cat === '유형자산') return ['2)  비유동자산', '(2) 유형자산']
    if (cat === '무형자산') return ['2)  비유동자산', '(3) 무형자산']
    return ['2)  비유동자산', '(4) 기타비유동자산']
  }
  if (division === 'LIABILITY') return cat === '비유동부채' ? ['2) 비유동부채', ''] : ['1) 유동부채', '']
  return cat === '자본금' ? ['1) 자본금', ''] : ['5) 이익잉여금', '']
}

function build(rows: StatementRow[], division: 'ASSET' | 'LIABILITY' | 'EQUITY', catOf: Map<string, string>): Part[] {
  const parts: Part[] = []
  const sorted = [...rows].sort((a, b) => a.accountCode.localeCompare(b.accountCode))
  for (const r of sorted) {
    const [p, s] = placeOf(division, catOf.get(r.accountCode) ?? '')
    let part = parts.find((x) => x.label === p)
    if (!part) { part = { label: p, subs: [] }; parts.push(part) }
    let sub = part.subs.find((x) => x.label === s)
    if (!sub) { sub = { label: s, rows: [] }; part.subs.push(sub) }
    sub.rows.push(r)
  }
  parts.sort((a, b) => a.label.localeCompare(b.label))
  parts.forEach((p) => p.subs.sort((a, b) => a.label.localeCompare(b.label)))
  return parts
}

/**
 * 회계 I &gt; 출력물 &gt; 주요재무제표 &gt; <b>재무상태표</b>(E010813) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 부서표시방법(<b>집계</b> · 종 · 횡) · 프로젝트표시방법(같음) · 기준일자(<b>달</b> 하나, 기본 이번 달) 옆에 비교 기간
 * (<b>직전기수</b> · 전기동일기간 · 당기누계 · 직접입력 · 선택안함) · 부서 · 프로젝트 · 기타([천단위] · [잔액0포함] ·
 * [내역없는부서/프로젝트제외] · [전표발생계정] · [사용중단/삭제포함], 다 꺼짐) · 적용양식.
 *
 * <p>표는 재무제표표시명 | 제 N 기 (기준) 두 칸 | 제 N-1 기 (비교) 두 칸 — 왼 칸은 계정, 오른 칸은 묶음 합.
 * 1. 자산 &gt; 1) 유동자산 &gt; (1) 당좌자산 처럼 묶음 줄과 자산총계 · 부채총계 · 자본총계 · 부채와자본총계 줄이 굵다.
 * 비교 쪽이 비면 원본은 '-' 를 찍지만 우리는 빈 칸 규칙(ui-check '없음을 줄표로 그리는 칸이 없다')을 따라 비운다. 원본은 묶음 아래를 '현금 및 현금성자산 · 매출채권' 같은 표시 항목으로 찍는데 우리 계정은 그 항목을 들지 않아
 * 계정을 그대로 한 줄씩 찍는다. 회사 기수 번호를 들지 않아 머리는 'YYYY년 (기준)' 이다.
 * [당기누계]는 손익 쪽 비교라 재무상태표에서 뜻을 못 쟀고, [부서] · [프로젝트]는 회계전표 줄의 것(V343)으로 거른다.
 * [부서표시방법] · [프로젝트표시방법] 종 · 횡은 features/statement/showMode(손익계산서에서 잰 규칙)로 그린다.
 */
export default function BalanceSheetPage() {
  /* 원본 조건 [부서] · [프로젝트] — 서버가 회계전표 줄의 것(V343)으로 거른다. */
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const dp = { departmentId: dept || undefined, projectId: project || undefined }
  const { companyName } = useAuth()
  const [month, setMonth] = useState(thisMonth())
  const [compare, setCompare] = useState<Compare>('직전기수')
  const [compareMonth, setCompareMonth] = useState(thisMonth())
  const [fiscalStart, setFiscalStart] = useState(1)
  const [thousand, setThousand] = useState(false)
  const [withZero, setWithZero] = useState(false)
  const [accounts, setAccounts] = useState<(AccountOpt & { name: string; division: string })[]>([])
  const [base, setBase] = useState<BalanceSheet | null>(null)
  const [cmp, setCmp] = useState<BalanceSheet | null>(null)
  const [error, setError] = useState('')
  const modes = useShowModes(() => setCompare('선택안함'))
  const [splitBase, setSplitBase] = useState<Split | null>(null)
  const [splitCmp, setSplitCmp] = useState<Split | null>(null)

  useEffect(() => {
    api.get<(AccountOpt & { name: string; division: string })[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => { /* 못 받으면 1월 기수로 본다 */ })
  }, [])

  /** 비교 기준일 — 직전기수는 지난 기수 말일, 전기동일기간은 한 해 전 같은 달 말일. */
  const compareAsOf = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    if (compare === '선택안함') return null
    if (compare === '전기동일기간') return monthEnd(`${y - 1}-${String(m).padStart(2, '0')}`)
    if (compare === '직접입력') return monthEnd(compareMonth)
    const startYear = m >= fiscalStart ? y : y - 1
    const d = new Date(startYear, fiscalStart - 1, 0)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [month, compare, compareMonth, fiscalStart])

  function load() {
    setError('')
    Promise.all([
      api.get<BalanceSheet>('/journals/balance-sheet', { params: { ...dp, asOf: monthEnd(month) } }),
      compareAsOf ? api.get<BalanceSheet>('/journals/balance-sheet', { params: { ...dp, asOf: compareAsOf } }) : Promise.resolve(null),
      modes.by ? fetchSplit(modes.by, { to: monthEnd(month) }, dp) : Promise.resolve(null),
      modes.by && modes.mode === '종' && compareAsOf ? fetchSplit(modes.by, { to: compareAsOf }, dp) : Promise.resolve(null),
    ])
      .then(([b, c, sb, sc]) => { setBase(b.data); setCmp(c ? c.data : null); setSplitBase(sb); setSplitCmp(sc) })
      .catch((err) => setError(extractErrorMessage(err)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [dept, project, month, compareAsOf, modes.by, modes.mode])

  const catOf = useMemo(() => new Map(accounts.map((a) => [a.code, a.detailCategory ?? ''])), [accounts])
  /** [잔액0포함]이면 잔액이 없는 재무상태표 계정도 0 으로 세운다. */
  const pad = (rows: StatementRow[], division: string) => withZero
    ? [...rows, ...accounts.filter((a) => a.division === division && !rows.some((r) => r.accountCode === a.code))
        .map((a) => ({ accountCode: a.code, accountName: a.name, division: a.division, amount: 0 }) as StatementRow)]
    : rows

  const fmt = (n: number | null) => (n == null ? '' : n === 0 ? '' : Math.round(thousand ? n / 1000 : n).toLocaleString('ko-KR'))
  const tot = (s: BalanceSheet | null, k: 'A' | 'L' | 'E') => {
    if (!s) return null
    if (k === 'A') return Number(s.totalAssets)
    if (k === 'L') return Number(s.totalLiabilities)
    return Number(s.totalEquity) + Number(s.netIncome)
  }

  /** 한 장의 줄 — 집계는 전체, 종은 부서(프로젝트)마다, 횡은 열마다 같은 셈을 쓴다. */
  const linesOf = (bs: BalanceSheet, cs: BalanceSheet | null): SLine[] => {
    const val = (sheet: BalanceSheet | null, code: string) => {
      if (!sheet) return null
      const r = [...sheet.assets, ...sheet.liabilities, ...sheet.equity].find((x) => x.accountCode === code)
      return r ? Number(r.amount) : 0
    }
    const out: SLine[] = []
    const push = (key: string, label: string, left: SLine['left'], right: SLine['right'], bold = false) => out.push({ key, label, left, right, bold })
    for (const [label, division, rows, totalLabel] of [
      ['1. 자산', 'ASSET', pad(bs.assets, 'ASSET'), '자산총계'],
      ['2. 부채', 'LIABILITY', pad(bs.liabilities, 'LIABILITY'), '부채총계'],
      ['3. 자본', 'EQUITY', pad([...bs.equity], 'EQUITY'), '자본총계'],
    ] as const) {
      const v = (code: string) => [Number(rows.find((r) => r.accountCode === code)?.amount ?? 0), val(cs, code)] as const
      const sum = (side: 0 | 1, rs: StatementRow[]) =>
        side === 0 ? rs.reduce((t, r) => t + v(r.accountCode)[0], 0) : cs ? rs.reduce((t, r) => t + (v(r.accountCode)[1] ?? 0), 0) : null
      const k = division === 'ASSET' ? 'A' : division === 'LIABILITY' ? 'L' : 'E'
      push(`d:${division}`, label, [null, null], [null, null], true)
      for (const p of build(rows, division, catOf)) {
        const all = p.subs.flatMap((x) => x.rows)
        push(`p:${division}:${p.label}`, p.label, [null, sum(0, all)], [null, sum(1, all)], true)
        for (const sub of p.subs) {
          if (sub.label) push(`s:${division}:${p.label}:${sub.label}`, sub.label, [null, sum(0, sub.rows)], [null, sum(1, sub.rows)], true)
          for (const r of sub.rows) { const [b, c] = v(r.accountCode); push(`a:${r.accountCode}`, r.accountName, [b, null], [c, null]) }
        }
      }
      if (division === 'EQUITY') push('ni', '(당기순이익)', [Number(bs.netIncome), null], [cs ? Number(cs.netIncome) : null, null])
      push(`t:${division}`, totalLabel, [null, tot(bs, k)], [null, tot(cs, k)], true)
    }
    push('le', '부채와자본총계', [null, (tot(bs, 'L') ?? 0) + (tot(bs, 'E') ?? 0)],
      [null, cs ? (tot(cs, 'L') ?? 0) + (tot(cs, 'E') ?? 0) : null], true)
    return out
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mainLines = useMemo(() => (base ? linesOf(base, cmp) : []), [base, cmp, catOf, withZero, accounts])
  const groups = useMemo(() => {
    if (!modes.by || !splitBase) return []
    const items = modes.by === 'department' ? deptProject.departments : deptProject.projects
    return groupsOf(modes.mode, modes.by, items, new Set(splitBase.keys()))
  }, [modes.by, modes.mode, splitBase, deptProject])
  const groupBs = (s: Split | null, key: string, asOf: string) => toBalanceSheet(s?.get(key) ?? [], asOf)

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '재무상태표', [mainLines.length, compare, modes.mode, groups.length])

  const yearOf = (d: string | null) => (d ? `${d.slice(0, 4)}년` : '')
  const heads: [string, string] = [`${yearOf(base?.asOf ?? null)} (기준)`, cmp ? `${yearOf(cmp.asOf)} (비교)` : '(비교)']
  const head = (suffix?: string) => (
    <>
      <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[12px]">재무상태표</h3>
      <div className="flex justify-between text-[12px] mt-0 mx-0 mb-[4px]">
        <span>회사명 : {companyName ?? ''}{suffix ? ` / ${suffix}` : ''}</span>
        <span>{month.replace('-', '/')} 현재{thousand ? ' (단위 : 천원)' : ''}</span>
      </div>
    </>
  )

  return (
    <EcListShell
      title="재무상태표"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setDept(''); setProject(''); modes.reset(); setMonth(thisMonth()); setCompare('직전기수'); setThousand(false); setWithZero(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="부서표시방법"><ShowModeRadios m={modes} which="dept" name="bs" /></EcCond>
        <EcCond label="프로젝트표시방법"><ShowModeRadios m={modes} which="proj" name="bs" /></EcCond>
        <EcCond label="기준일자">
          <input type="month" className="ec-input" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: 130, marginRight: 10 }} />
          {COMPARES.map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="bs-compare" checked={compare === v} onChange={() => setCompare(v)} /> {v}
            </label>
          ))}
          {compare === '직접입력' && (
            <input type="month" className="ec-input" value={compareMonth} onChange={(e) => e.target.value && setCompareMonth(e.target.value)} style={{ width: 130 }} />
          )}
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="기타">
          {([['천단위', thousand, setThousand], ['잔액0포함', withZero, setWithZero]] as const).map(([l, v, set]) => (
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
            cols={groups.map((g) => ({ head: g.head, lines: linesOf(groupBs(splitBase, g.key, base.asOf), null) }))} />
        </>
      )}
      {base && modes.by && splitBase && modes.mode === '종' && groups.map((g, i) => (
        <div key={g.key} className={i > 0 ? 'mt-[24px]' : undefined}>
          {head(g.label)}
          <StatementTable ref={i === 0 ? tableRef : undefined} heads={heads} showCmp={!!splitCmp} fmt={fmt}
            lines={linesOf(groupBs(splitBase, g.key, base.asOf), splitCmp && compareAsOf ? groupBs(splitCmp, g.key, compareAsOf) : null)} />
        </div>
      ))}
    </EcListShell>
  )
}

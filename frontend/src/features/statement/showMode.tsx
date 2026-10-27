import { Fragment, useState, type ReactNode, type RefObject } from 'react'
import { api } from '../../api/client'
import type { CodeItem } from '../../components/CodePickerField'
import type { AccountDivision, BalanceSheet, IncomeStatement, StatementRow, TrialBalance } from '../../types/api'

/**
 * 재무상태표 · 손익계산서 · 원가명세서의 [부서표시방법] · [프로젝트표시방법](집계 · 종 · 횡) — 2026-10-13 loginaa 손익계산서 실측.
 *
 * <ul>
 *   <li><b>집계</b>: 한 장(지금까지의 판).</li>
 *   <li><b>종</b>: 부서(프로젝트)마다 한 장씩 아래로 잇는다. 자료가 있는 부서만, 부서 없는 줄이 먼저 '00(기타부서)'.
 *       머리의 회사명 뒤에 ' / 100(영업교육팀)' 처럼 붙는다.</li>
 *   <li><b>횡</b>: 한 장에 열을 늘어놓는다 — 재무제표표시명 | 합계 | 등록된 부서 전부(자료가 없어도) | 기타. 칸마다 두 칸(계정 · 묶음).
 *       비교 기간 열은 없다.</li>
 *   <li>둘 중 하나만 고를 수 있다 — 한쪽을 종 · 횡으로 바꾸면 다른 쪽이 집계로, 비교가 '선택안함'으로 돌아간다.</li>
 * </ul>
 */
export type ShowMode = '집계' | '종' | '횡'
const MODES: ShowMode[] = ['집계', '종', '횡']
export type SplitBy = 'department' | 'project'

export function useShowModes(onSplit: () => void) {
  const [deptMode, setDept] = useState<ShowMode>('집계')
  const [projMode, setProj] = useState<ShowMode>('집계')
  const setDeptMode = (m: ShowMode) => { setDept(m); if (m !== '집계') { setProj('집계'); onSplit() } }
  const setProjMode = (m: ShowMode) => { setProj(m); if (m !== '집계') { setDept('집계'); onSplit() } }
  const by: SplitBy | null = deptMode !== '집계' ? 'department' : projMode !== '집계' ? 'project' : null
  const mode: ShowMode = deptMode !== '집계' ? deptMode : projMode
  const reset = () => { setDept('집계'); setProj('집계') }
  return { deptMode, projMode, setDeptMode, setProjMode, by, mode, reset }
}

/** [부서표시방법] · [프로젝트표시방법] 라디오 셋 — 화면이 <EcCond label="부서표시방법"> 안에 둔다. */
export function ShowModeRadios({ m, which, name }: { m: ReturnType<typeof useShowModes>; which: 'dept' | 'proj'; name: string }) {
  const value = which === 'dept' ? m.deptMode : m.projMode
  const set = which === 'dept' ? m.setDeptMode : m.setProjMode
  return (
    <>
      {MODES.map((v) => (
        <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
          <input type="radio" name={`${name}-${which}`} checked={value === v} onChange={() => set(v)} /> {v}
        </label>
      ))}
    </>
  )
}

/** 서버 /journals/account-sums-by 한 줄 — groupId 가 null 이면 부서(프로젝트) 없는 줄. */
export interface GroupedAccountSum {
  groupId: number | null
  accountId: number
  accountCode: string
  accountName: string
  division: AccountDivision
  debit: number
  credit: number
}
/** 부서(프로젝트) id 문자열 → 그 계정 합. 부서 없는 줄은 ''. */
export type Split = Map<string, GroupedAccountSum[]>

export async function fetchSplit(by: SplitBy, range: { from?: string; to: string }, dp: object): Promise<Split> {
  const r = await api.get<GroupedAccountSum[]>('/journals/account-sums-by', { params: { ...dp, ...range, by } })
  const out: Split = new Map()
  for (const row of r.data) {
    const k = row.groupId == null ? '' : String(row.groupId)
    if (!out.has(k)) out.set(k, [])
    out.get(k)!.push(row)
  }
  return out
}

const debitSide = (d: AccountDivision) => d === 'ASSET' || d === 'EXPENSE'

/** 서버 trialBalance 와 같은 셈. */
export function toTrialBalance(rows: GroupedAccountSum[], from: string, to: string): TrialBalance {
  const out = rows.map((r) => ({
    accountId: r.accountId, accountCode: r.accountCode, accountName: r.accountName, division: r.division,
    debit: Number(r.debit), credit: Number(r.credit),
    balance: debitSide(r.division) ? Number(r.debit) - Number(r.credit) : Number(r.credit) - Number(r.debit),
  }))
  const totalDebit = out.reduce((s, r) => s + r.debit, 0)
  const totalCredit = out.reduce((s, r) => s + r.credit, 0)
  return { from, to, totalDebit, totalCredit, balanced: totalDebit === totalCredit, rows: out }
}

/** 서버 balanceSheet 와 같은 셈(처음부터 asOf 까지 누적 합을 받는다). */
export function toBalanceSheet(rows: GroupedAccountSum[], asOf: string): BalanceSheet {
  const bs: BalanceSheet = { asOf, assets: [], totalAssets: 0, liabilities: [], totalLiabilities: 0, equity: [], totalEquity: 0, netIncome: 0, balanced: true }
  let revenue = 0, expense = 0
  for (const r of rows) {
    const signed = debitSide(r.division) ? Number(r.debit) - Number(r.credit) : Number(r.credit) - Number(r.debit)
    const row: StatementRow = { accountCode: r.accountCode, accountName: r.accountName, division: r.division, amount: signed }
    if (r.division === 'ASSET') { bs.assets.push(row); bs.totalAssets += signed }
    else if (r.division === 'LIABILITY') { bs.liabilities.push(row); bs.totalLiabilities += signed }
    else if (r.division === 'EQUITY') { bs.equity.push(row); bs.totalEquity += signed }
    else if (r.division === 'REVENUE') revenue += signed
    else if (r.division === 'EXPENSE') expense += signed
  }
  bs.netIncome = revenue - expense
  bs.balanced = bs.totalAssets === bs.totalLiabilities + bs.totalEquity + bs.netIncome
  return bs
}

/** 서버 incomeStatement 와 같은 셈. */
export function toIncomeStatement(rows: GroupedAccountSum[], from: string, to: string): IncomeStatement {
  const is: IncomeStatement = { from, to, revenues: [], totalRevenue: 0, expenses: [], totalExpense: 0, netIncome: 0 }
  for (const r of rows) {
    if (r.division === 'REVENUE') {
      const amount = Number(r.credit) - Number(r.debit)
      is.revenues.push({ accountCode: r.accountCode, accountName: r.accountName, division: r.division, amount })
      is.totalRevenue += amount
    } else if (r.division === 'EXPENSE') {
      const amount = Number(r.debit) - Number(r.credit)
      is.expenses.push({ accountCode: r.accountCode, accountName: r.accountName, division: r.division, amount })
      is.totalExpense += amount
    }
  }
  is.netIncome = is.totalRevenue - is.totalExpense
  return is
}

/** 종 · 횡으로 펼칠 한 칸(한 장). key 는 Split 의 키. */
export interface SplitGroup { key: string; label: string; head: string }

const byCode = (a: CodeItem, b: CodeItem) => (a.code ?? '').localeCompare(b.code ?? '')

/**
 * 횡: 등록된 부서(프로젝트) 전부 + 기타(원본은 자료가 없는 부서도 열을 세운다).
 * 종: 자료가 있는 것만, 부서 없는 줄이 먼저 — 원본 머리 '00(기타부서)'. 프로젝트 쪽 이름은 횡의 '기타'를 쓴다.
 */
export function groupsOf(mode: ShowMode, by: SplitBy, items: CodeItem[], present: Set<string>, hideIdle = false): SplitGroup[] {
  /* 기타 [내역없는부서/프로젝트제외] — 횡에서도 자료가 있는 것만(2026-10-13 손익계산서 횡: 열 11개 + 기타 → 영업교육팀 · 기타). */
  const sorted = [...items].sort(byCode).filter((i) => !hideIdle || present.has(i.value))
  const rest: SplitGroup = { key: '', label: by === 'department' ? '00(기타부서)' : '기타', head: '기타' }
  const one = (i: CodeItem): SplitGroup => ({ key: i.value, label: i.code ? `${i.code}(${i.name})` : i.name, head: i.name })
  if (mode === '횡') return [...sorted.map(one), rest]
  return [...(present.has('') ? [rest] : []), ...sorted.filter((i) => present.has(i.value)).map(one)]
}

/** 재무제표 한 줄 — 왼 두 칸(기준: 계정 · 묶음), 오른 두 칸(비교). key 로 횡 열끼리 맞춘다. */
export interface SLine {
  key: string
  label: ReactNode
  bold?: boolean
  left: [number | null, number | null]
  right: [number | null, number | null]
}

/** 집계 · 종 한 장의 표. */
export function StatementTable({ lines, heads, showCmp, fmt, ref }: {
  lines: SLine[]; heads: [string, string]; showCmp: boolean; fmt: (n: number | null) => string
  ref?: RefObject<HTMLTableElement | null>
}) {
  return (
    <table ref={ref} className="w-full text-left">
      <thead>
        <tr>
          <th>재무제표표시명</th>
          <th colSpan={2} className="text-center">{heads[0]}</th>
          <th colSpan={2} className="text-center">{heads[1]}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.key} className={l.bold ? 'font-bold' : undefined}>
            <td>{l.label}</td>
            <td className="text-right">{fmt(l.left[0])}</td>
            <td className="text-right">{fmt(l.left[1])}</td>
            <td className="text-right">{showCmp ? fmt(l.right[0]) : ''}</td>
            <td className="text-right">{showCmp ? fmt(l.right[1]) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 횡 — 줄 차례는 합계 칸의 것, 열은 합계 · 부서들 · 기타(칸마다 계정 · 묶음 두 칸). */
export function HorizontalStatementTable({ total, cols, fmt, ref }: {
  total: SLine[]; cols: { head: string; lines: SLine[] }[]; fmt: (n: number | null) => string
  ref?: RefObject<HTMLTableElement | null>
}) {
  const maps = cols.map((c) => new Map(c.lines.map((l) => [l.key, l])))
  return (
    <div className="overflow-x-auto">
      <table ref={ref} className="text-left whitespace-nowrap">
        <thead>
          <tr>
            <th>재무제표표시명</th>
            <th colSpan={2} className="text-center">합계</th>
            {cols.map((c, i) => <th key={i} colSpan={2} className="text-center">{c.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {total.map((l) => (
            <tr key={l.key} className={l.bold ? 'font-bold' : undefined}>
              <td>{l.label}</td>
              <td className="text-right">{fmt(l.left[0])}</td>
              <td className="text-right">{fmt(l.left[1])}</td>
              {maps.map((m, i) => {
                const g = m.get(l.key)
                return (
                  <Fragment key={i}>
                    <td className="text-right">{g ? fmt(g.left[0]) : ''}</td>
                    <td className="text-right">{g ? fmt(g.left[1]) : ''}</td>
                  </Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

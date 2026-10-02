import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INCOME_STATEMENT_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../features/auth/AuthContext'
import type { IncomeStatement, StatementRow } from '../../types/api'
import { incomeBucketOf, type IncomeBucket } from '../../utils/incomeBuckets'

const BOLD: React.CSSProperties = { fontWeight: 700 }
const pad2 = (n: number) => String(n).padStart(2, '0')
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
 * 아직 두지 않았고, 부서 · 프로젝트(와 표시방법)는 회계전표에 없다.
 */
export default function IncomeStatementPage() {
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
  const [thousand, setThousand] = useState(false)
  const [withZero, setWithZero] = useState(false)
  const [accounts, setAccounts] = useState<(AccountOpt & { name: string })[]>([])
  const [base, setBase] = useState<IncomeStatement | null>(null)
  const [cmp, setCmp] = useState<IncomeStatement | null>(null)
  const [error, setError] = useState('')

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
      api.get<IncomeStatement>('/journals/income-statement', { params: { from, to } }),
      cmpRange ? api.get<IncomeStatement>('/journals/income-statement', { params: cmpRange }) : Promise.resolve(null),
    ])
      .then(([b, c]) => { setBase(b.data); setCmp(c ? c.data : null) })
      .catch((err) => setError(extractErrorMessage(err)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to, cmpRange])

  const catOf = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts])
  const sheet = useMemo(() => {
    const all = new Map<string, { code: string; name: string; bucket: Bucket; b: number; c: number }>()
    const put = (rows: StatementRow[], side: 'b' | 'c') => rows.forEach((r) => {
      const a = catOf.get(r.accountCode)
      const bucket = BUCKET_OF(r.division, a?.detailCategory ?? '')
      if (!all.has(r.accountCode)) all.set(r.accountCode, { code: r.accountCode, name: r.accountName, bucket, b: 0, c: 0 })
      all.get(r.accountCode)![side] += Number(r.amount)
    })
    if (base) { put(base.revenues, 'b'); put(base.expenses, 'b') }
    if (cmp) { put(cmp.revenues, 'c'); put(cmp.expenses, 'c') }
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
    return { of, sum, b: calc('b'), c: calc('c') }
  }, [base, cmp, catOf, withZero, accounts])

  const fmt = (n: number | null) => (n == null || n === 0 ? '' : Math.round(thousand ? n / 1000 : n).toLocaleString('ko-KR'))
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '손익계산서', [base ? 1 : 0, compare])

  const row = (label: string, left: [number | null, number | null], right: [number | null, number | null], bold = false) => (
    <tr style={bold ? BOLD : undefined}>
      <td>{label}</td>
      <td style={{ textAlign: 'right' }}>{fmt(left[0])}</td>
      <td style={{ textAlign: 'right' }}>{fmt(left[1])}</td>
      <td style={{ textAlign: 'right' }}>{cmp ? fmt(right[0]) : ''}</td>
      <td style={{ textAlign: 'right' }}>{cmp ? fmt(right[1]) : ''}</td>
    </tr>
  )
  const group = (label: string, k: Bucket) => {
    const ls = sheet.of(k)
    if (ls.length === 0) return null
    return (
      <Fragment key={label}>
        {row(label, [null, sheet.sum(k, 'b')], [null, sheet.sum(k, 'c')], true)}
        {ls.map((l) => <Fragment key={l.code}>{row(l.name, [l.b, null], [l.c, null])}</Fragment>)}
      </Fragment>
    )
  }

  return (
    <EcListShell
      title="손익계산서"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFromYm(startYm(fiscalStart)); setToYm(thisYm); setCompare('직전기수'); setThousand(false); setWithZero(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="month" className="ec-input" value={fromYm} onChange={(e) => e.target.value && setFromYm(e.target.value)} style={{ width: 130 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="month" className="ec-input" value={toYm} onChange={(e) => e.target.value && setToYm(e.target.value)} style={{ width: 130, marginRight: 10 }} />
          {COMPARES.map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="is-compare" checked={compare === v} onChange={() => setCompare(v)} /> {v}
            </label>
          ))}
          {compare === '직접입력' && (
            <>
              <input type="month" className="ec-input" value={cmpFromYm} onChange={(e) => e.target.value && setCmpFromYm(e.target.value)} style={{ width: 130 }} />
              <span style={{ margin: '0 4px' }}>~</span>
              <input type="month" className="ec-input" value={cmpToYm} onChange={(e) => e.target.value && setCmpToYm(e.target.value)} style={{ width: 130 }} />
            </>
          )}
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={INCOME_STATEMENT_PICKS} currentFrom={from} fiscalStart={fiscalStart}
                           onPick={(r) => { setFromYm(r.from.slice(0, 7)); setToYm(r.to.slice(0, 7)) }} />
          </span>
        </EcCond>
        <EcCond label="기타">
          {([['천단위', thousand, setThousand], ['잔액0포함', withZero, setWithZero]] as const).map(([l, v, set]) => (
            <label key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {l}
            </label>
          ))}
        </EcCond>
      </ul>

      {base && (
        <>
          <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 12px' }}>손익계산서</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '0 0 4px' }}>
            <span>회사명 : {companyName ?? ''}</span>
            <span>{fromYm.replace('-', '/')} ~ {toYm.replace('-', '/')}{thousand ? ' (단위 : 천원)' : ''}</span>
          </div>
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>
                <th>재무제표표시명</th>
                <th colSpan={2} style={{ textAlign: 'center' }}>{fromYm.slice(0, 4)}년 (기준)</th>
                <th colSpan={2} style={{ textAlign: 'center' }}>{cmpRange ? `${cmpRange.from.slice(0, 4)}년 (비교)` : '(비교)'}</th>
              </tr>
            </thead>
            <tbody>
              {group('1. 매출', 'SALES')}
              {group('2. 매출원가', 'COGS')}
              {row('3. 매출총이익', [null, sheet.b.gross], [null, sheet.c.gross], true)}
              {group('4. 판매비 및 일반관리비', 'SGA')}
              {row('5. 영업손익', [null, sheet.b.op], [null, sheet.c.op], true)}
              {group('6. 영업외수익', 'NOI')}
              {group('7. 영업외비용', 'NOE')}
              {row('8. 법인세비용차감전순손익', [null, sheet.b.pre], [null, sheet.c.pre], true)}
              {group('9. 법인세비용', 'TAX')}
              {row('12. 당기순이익', [null, sheet.b.net], [null, sheet.c.net], true)}
            </tbody>
          </table>
        </>
      )}
    </EcListShell>
  )
}

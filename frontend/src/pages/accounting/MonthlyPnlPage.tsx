import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INCOME_STATEMENT_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../features/auth/AuthContext'
import { incomeBucketOf, incomeCalc, type IncomeBucket } from '../../utils/incomeBuckets'
import type { IncomeStatement } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const BOLD: React.CSSProperties = { fontWeight: 700 }
const pad2 = (n: number) => String(n).padStart(2, '0')
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad2(new Date(y, m, 0).getDate())}` }
/** from ~ to 의 달 목록(YYYY-MM). */
function monthsBetween(fromYm: string, toYm: string): string[] {
  const out: string[] = []
  let [y, m] = fromYm.split('-').map(Number)
  const [ty, tm] = toYm.split('-').map(Number)
  while ((y < ty || (y === ty && m <= tm)) && out.length < 24) {
    out.push(`${y}-${pad2(m)}`)
    m += 1; if (m > 12) { m = 1; y += 1 }
  }
  return out
}

interface AccountOpt { code: string; detailCategory: string | null; division: string }
interface Line { code: string; name: string; bucket: IncomeBucket; byMonth: Record<string, number> }

const GROUPS: [string, IncomeBucket][] = [
  ['1. 매출', 'SALES'], ['2. 매출원가', 'COGS'], ['4. 판매비 및 일반관리비', 'SGA'], ['6. 영업외수익', 'NOI'], ['7. 영업외비용', 'NOE'], ['9. 법인세비용', 'TAX'],
]

/**
 * 회계 I &gt; 경영자료 &gt; <b>월별손익분석</b>(E010819) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(달 구간, 기본 기수 첫 달 ~ 이번 달 = 2026/01 ~ 10, 빠른선택 금월(~오늘) · 전월 · 이번기수 · 직전기수) · 부서 · 프로젝트 ·
 * 기타([결재방표시] · [기초,당기,기말표시]).
 *
 * <p>손익계산서와 같은 번호 줄(1. 매출 … 12. 당기순이익)을 달마다 한 열씩 — 계정명 · YYYY년 M월 … · 집계. 묶음 · 계산 줄이 굵다.
 * 계정을 묶음에 넣는 가름은 손익계산서와 같은 utils/incomeBuckets 를 쓴다. 원본은 끝에 숨은 열(0 · 계정코드)이 둘 더 있는데 화면에 안 보여 두지 않았다.
 * [기초,당기,기말표시]는 원가 계정 쪽 표시라 손익계산서처럼 아직 없고, 결재방표시는 우리 인쇄가 결재 칸을 그리지 않는다. 부서 · 프로젝트는 회계전표에 없다.
 */
export default function MonthlyPnlPage() {
  const { companyName } = useAuth()
  const now = new Date()
  const thisYm = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const startYm = (fs: number) => `${now.getMonth() + 1 >= fs ? now.getFullYear() : now.getFullYear() - 1}-${pad2(fs)}`
  const [fiscalStart, setFiscalStart] = useState(1)
  const [fromYm, setFromYm] = useState(startYm(1))
  const [toYm, setToYm] = useState(thisYm)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [byMonth, setByMonth] = useState<Record<string, IncomeStatement>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) { setFiscalStart(m); setFromYm(startYm(m)) } })
      .catch(() => { /* 못 받으면 1월 기수로 본다 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const months = useMemo(() => monthsBetween(fromYm, toYm), [fromYm, toYm])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const rs = await Promise.all(months.map((ym) =>
        api.get<IncomeStatement>('/journals/income-statement', { params: { from: `${ym}-01`, to: monthEnd(ym) } }).then((r) => [ym, r.data] as const)))
      setByMonth(Object.fromEntries(rs))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [months.join()])

  const catOf = useMemo(() => new Map(accounts.map((a) => [a.code, a.detailCategory ?? ''])), [accounts])
  const lines = useMemo(() => {
    const m = new Map<string, Line>()
    for (const [ym, st] of Object.entries(byMonth)) {
      for (const r of [...st.revenues, ...st.expenses]) {
        if (!m.has(r.accountCode)) m.set(r.accountCode, { code: r.accountCode, name: r.accountName, bucket: incomeBucketOf(r.division, catOf.get(r.accountCode) ?? ''), byMonth: {} })
        const l = m.get(r.accountCode)!
        l.byMonth[ym] = (l.byMonth[ym] ?? 0) + Number(r.amount)
      }
    }
    return [...m.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [byMonth, catOf])
  const sumOf = (b: IncomeBucket, ym?: string) => lines.filter((l) => l.bucket === b)
    .reduce((s, l) => s + (ym ? l.byMonth[ym] ?? 0 : Object.values(l.byMonth).reduce((t, v) => t + v, 0)), 0)
  const calc = (ym?: string) => incomeCalc((b) => sumOf(b, ym))

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '월별손익분석', [months.length, lines.length])

  const label = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`
  const row = (name: string, cell: (ym?: string) => number, bold: boolean, key: string) => (
    <tr key={key} style={bold ? BOLD : undefined}>
      <td>{name}</td>
      {months.map((ym) => <td key={ym} className="text-right">{won(cell(ym))}</td>)}
      <td className="text-right">{won(cell())}</td>
    </tr>
  )

  return (
    <EcListShell
      title="월별손익분석"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFromYm(startYm(fiscalStart)); setToYm(thisYm) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="month" className="ec-input" value={fromYm} onChange={(e) => e.target.value && setFromYm(e.target.value)} style={{ width: 130 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="month" className="ec-input" value={toYm} onChange={(e) => e.target.value && setToYm(e.target.value)} style={{ width: 130 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INCOME_STATEMENT_PICKS} currentFrom={`${fromYm}-01`} fiscalStart={fiscalStart}
                           onPick={(r) => { setFromYm(r.from.slice(0, 7)); setToYm(r.to.slice(0, 7)) }} />
          </span>
        </EcCond>
      </ul>

      <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[4px]">월별손익분석</h3>
      <div className="text-[12px] mb-[4px]">회사명 : {companyName ?? ''}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>계정명</th>
            {months.map((ym) => <th key={ym} className="text-right">{label(ym)}</th>)}
            <th className="text-right">집계</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={months.length + 2} className="ec-empty">불러오는 중…</td></tr>
          ) : (
            <>
              {GROUPS.slice(0, 2).map(([n, b]) => group(n, b))}
              {row('3. 매출총이익', (ym) => calc(ym).gross, true, 'gross')}
              {group(GROUPS[2][0], GROUPS[2][1])}
              {row('5. 영업손익', (ym) => calc(ym).op, true, 'op')}
              {GROUPS.slice(3, 5).map(([n, b]) => group(n, b))}
              {row('8. 법인세비용차감전순손익', (ym) => calc(ym).pre, true, 'pre')}
              {group(GROUPS[5][0], GROUPS[5][1])}
              {row('12. 당기순이익', (ym) => calc(ym).net, true, 'net')}
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )

  /** 계정 묶음 — 계정이 없으면 원본처럼 줄을 뺀다. */
  function group(name: string, b: IncomeBucket) {
    const ls = lines.filter((l) => l.bucket === b)
    if (ls.length === 0) return null
    return (
      <Fragment key={b}>
        {row(name, (ym) => sumOf(b, ym), true, `g${b}`)}
        {ls.map((l) => row(l.name, (ym) => (ym ? l.byMonth[ym] ?? 0 : Object.values(l.byMonth).reduce((t, v) => t + v, 0)), false, l.code))}
      </Fragment>
    )
  }
}

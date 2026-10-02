import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INCOME_STATEMENT_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../features/auth/AuthContext'
import type { TrialBalance } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const BOLD: React.CSSProperties = { fontWeight: 700 }
const pad2 = (n: number) => String(n).padStart(2, '0')
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad2(new Date(y, m, 0).getDate())}` }
const dayBefore = (d: string) => { const t = new Date(`${d}T00:00:00`); t.setDate(t.getDate() - 1); return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}` }
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

/** 원가명세서와 같은 [구분] — 원가 계정 코드 앞자리(5 · 6 · 7). */
const KINDS = [['제품제조 5018', '5'], ['용역 6018', '6'], ['기타 7018', '7']] as const
/** 재공품 계정(표준 169) — 원가명세서와 같다. */
const WIP_CODE = '169'
type Bucket = '재료비' | '노무비' | '경비'
const bucketOf = (name: string): Bucket =>
  /재료/.test(name) ? '재료비' : /임금|급여|상여|퇴직|잡급|수당/.test(name) ? '노무비' : '경비'
const ROMAN: Record<Bucket, string> = { 재료비: 'Ⅰ. 재료비', 노무비: 'Ⅱ. 노무비', 경비: 'Ⅲ. 경비' }

interface Month { cost: Record<string, { name: string; amt: number }>; wipOpen: number; wipClose: number }

/**
 * 회계 I &gt; 경영자료 &gt; <b>월별원가분석</b>(E010824) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(달 구간, 기본 기수 첫 달 ~ 이번 달, 빠른선택 금월(~오늘) · 전월 · 이번기수 · 직전기수) · 부서 · 프로젝트 ·
 * 구분(<b>제품제조 5018</b> · 용역 6018 · 기타 7018) · 기타([결재방표시] · [기초,당기,기말표시]).
 *
 * <p>원가명세서 줄을 달마다 한 열씩 — 계정명 · YYYY년 M월 … · <b>합계</b>(월별손익분석은 '집계'). 줄 이름에 번호가 붙는다 —
 * Ⅲ. 경비 · IV. 당기총비용합계 · V. 기초재공품재고액 · VI. 합계 · VII. 기말재공품재고액 · VIII. 타계정대체액 · IX. 당기제품제조원가(모두 굵게).
 * 계정 고르기 · 재료비/노무비/경비 가름 · 재공품(169)은 원가명세서와 같다. 합계 열의 기초재공품은 첫 달 기초, 기말재공품은 끝 달 기말이다.
 * 타계정대체액은 원가명세서처럼 가릴 표지가 없어 비운다. 부서 · 프로젝트는 회계전표에 없다.
 */
export default function MonthlyCostPage() {
  const { companyName } = useAuth()
  const now = new Date()
  const thisYm = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const startYm = (fs: number) => `${now.getMonth() + 1 >= fs ? now.getFullYear() : now.getFullYear() - 1}-${pad2(fs)}`
  const [fiscalStart, setFiscalStart] = useState(1)
  const [kind, setKind] = useState<string>('5')
  const [fromYm, setFromYm] = useState(startYm(1))
  const [toYm, setToYm] = useState(thisYm)
  const [data, setData] = useState<Record<string, Month>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) { setFiscalStart(m); setFromYm(startYm(m)) } })
      .catch(() => { /* 못 받으면 1월 기수로 본다 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const months = useMemo(() => monthsBetween(fromYm, toYm), [fromYm, toYm])

  async function load() {
    setLoading(true)
    setError('')
    const tb = (f: string, t: string) => api.get<TrialBalance>('/journals/trial-balance', { params: { from: f, to: t } }).then((x) => x.data)
    const wip = (x: TrialBalance) => { const w = x.rows.find((row) => row.accountCode === WIP_CODE); return w ? Number(w.debit) - Number(w.credit) : 0 }
    try {
      const firstOpen = await tb('1900-01-01', dayBefore(`${months[0]}-01`))
      const rs = await Promise.all(months.map(async (ym) => {
        const [period, close] = await Promise.all([tb(`${ym}-01`, monthEnd(ym)), tb('1900-01-01', monthEnd(ym))])
        const cost: Month['cost'] = {}
        for (const row of period.rows) {
          if (row.division !== 'EXPENSE' || !row.accountCode.startsWith(kind)) continue
          cost[row.accountCode] = { name: row.accountName, amt: Number(row.debit) - Number(row.credit) }
        }
        return [ym, { cost, wipOpen: 0, wipClose: wip(close) } as Month] as [string, Month]
      }))
      /* 기초재공품은 앞 달 기말이다 — 첫 달만 따로 잰다. */
      rs.forEach(([, m], i) => { m.wipOpen = i === 0 ? wip(firstOpen) : rs[i - 1][1].wipClose })
      setData(Object.fromEntries(rs))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [months.join(), kind])

  const lines = useMemo(() => {
    const m = new Map<string, { code: string; name: string; bucket: Bucket; by: Record<string, number> }>()
    for (const [ym, mo] of Object.entries(data)) {
      for (const [code, c] of Object.entries(mo.cost)) {
        if (!m.has(code)) m.set(code, { code, name: c.name, bucket: bucketOf(c.name), by: {} })
        m.get(code)!.by[ym] = c.amt
      }
    }
    return [...m.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [data])
  const total = (by: Record<string, number>) => Object.values(by).reduce((s, v) => s + v, 0)
  const costOf = (ym: string, b?: Bucket) => lines.filter((l) => !b || l.bucket === b).reduce((s, l) => s + (l.by[ym] ?? 0), 0)
  const calc = (ym?: string) => {
    if (ym) {
      const mo = data[ym]
      const t = costOf(ym), open = mo?.wipOpen ?? 0, close = mo?.wipClose ?? 0
      return { t, open, all: t + open, close, made: t + open - close }
    }
    const t = months.reduce((s, m) => s + costOf(m), 0)
    const open = data[months[0]]?.wipOpen ?? 0, close = data[months[months.length - 1]]?.wipClose ?? 0
    return { t, open, all: t + open, close, made: t + open - close }
  }

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '월별원가분석', [months.length, lines.length])

  const label = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`
  const row = (name: string, cell: (ym?: string) => number | null, bold: boolean, key: string) => (
    <tr key={key} style={bold ? BOLD : undefined}>
      <td>{name}</td>
      {months.map((ym) => { const v = cell(ym); return <td key={ym} style={{ textAlign: 'right' }}>{v == null ? '' : won(v)}</td> })}
      <td style={{ textAlign: 'right' }}>{(() => { const v = cell(); return v == null ? '' : won(v) })()}</td>
    </tr>
  )

  return (
    <EcListShell
      title="월별원가분석"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setKind('5'); setFromYm(startYm(fiscalStart)); setToYm(thisYm) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="month" className="ec-input" value={fromYm} onChange={(e) => e.target.value && setFromYm(e.target.value)} style={{ width: 130 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="month" className="ec-input" value={toYm} onChange={(e) => e.target.value && setToYm(e.target.value)} style={{ width: 130 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={INCOME_STATEMENT_PICKS} currentFrom={`${fromYm}-01`} fiscalStart={fiscalStart}
                           onPick={(r) => { setFromYm(r.from.slice(0, 7)); setToYm(r.to.slice(0, 7)) }} />
          </span>
        </EcCond>
        <EcCond label="구분">
          {KINDS.map(([l, v]) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="mc-kind" checked={kind === v} onChange={() => setKind(v)} /> {l}
            </label>
          ))}
        </EcCond>
      </ul>

      <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 4px' }}>월별원가분석</h3>
      <div style={{ fontSize: 12, marginBottom: 4 }}>회사명 : {companyName ?? ''}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>계정명</th>
            {months.map((ym) => <th key={ym} style={{ textAlign: 'right' }}>{label(ym)}</th>)}
            <th style={{ textAlign: 'right' }}>합계</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={months.length + 2} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</td></tr>
          ) : (
            <>
              {(['재료비', '노무비', '경비'] as Bucket[]).map((b) => {
                const ls = lines.filter((l) => l.bucket === b)
                if (ls.length === 0) return null
                return (
                  <Fragment key={b}>
                    {row(ROMAN[b], (ym) => (ym ? costOf(ym, b) : months.reduce((s, m) => s + costOf(m, b), 0)), true, b)}
                    {ls.map((l) => row(l.name, (ym) => (ym ? l.by[ym] ?? 0 : total(l.by)), false, l.code))}
                  </Fragment>
                )
              })}
              {row('IV. 당기총비용합계', (ym) => calc(ym).t, true, 't')}
              {row('V. 기초재공품재고액', (ym) => calc(ym).open, true, 'open')}
              {row('VI. 합계', (ym) => calc(ym).all, true, 'all')}
              {row('VII. 기말재공품재고액', (ym) => calc(ym).close, true, 'close')}
              {row('VIII. 타계정대체액', () => null, true, 'trans')}
              {row('IX. 당기제품제조원가', (ym) => calc(ym).made, true, 'made')}
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

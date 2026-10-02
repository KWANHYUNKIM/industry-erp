import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { TRIAL_BALANCE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../features/auth/AuthContext'
import type { AccountDivision, TrialBalance } from '../../types/api'

/** 원본 묶음 줄 · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243). 묶음은 보통 굵기, [합계]만 굵게. */
const GROUP_ROW: React.CSSProperties = { background: 'rgb(243, 243, 243)' }
const TOTAL_ROW: React.CSSProperties = { background: 'rgb(243, 243, 243)', fontWeight: 700 }
/** 원본 계정명 칸 — 가운데 정렬 · 남색 rgb(25,53,140). */
const NAME_CELL: React.CSSProperties = { textAlign: 'center', color: 'rgb(25, 53, 140)' }
const slash = (d: string) => d.slice(0, 7).replace(/-/g, '/')

interface AccountOpt { id: number; code: string; name: string; division: AccountDivision; detailCategory: string | null }
/** 원본 계정 차례 — 자산 · 부채 · 자본 · 수익 · 비용. */
const DIV_ORDER: AccountDivision[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
const debitNormal = (d: AccountDivision) => d === 'ASSET' || d === 'EXPENSE'
/** 잔액을 쌓는 것은 재무상태표 계정뿐이다 — 원본도 매출 · 비용 줄의 기말잔액 칸을 비운다. */
const isBalanceSheet = (d: AccountDivision) => d === 'ASSET' || d === 'LIABILITY' || d === 'EQUITY'

interface Line { id: number; code: string; name: string; division: AccountDivision; group: string; pd: number; pc: number; bal: number }

/**
 * 회계 I &gt; 출력물 &gt; 주요재무제표 &gt; <b>합계잔액시산표</b>(E010811) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 조회일자(<b>달</b> 구간, 기본 2026/01 ~ 2026/09 = <b>이번기수(~전월)</b>, 빠른선택 금월(~오늘) · 이번기수(~전월) · 전월 · 직전기수) ·
 * 부서 · 프로젝트 · 기타([결재방표시] · [천단위] · [잔액0포함] · [전표발생계정] 꺼짐 · [결산후] 켜짐).
 * [결산후]는 결산 분개를 넣고 볼지 고르는 칸인데 우리는 결산 분개를 따로 두지 않아(JournalSourceType 에 결산이 없다) 두지 않았다.
 *
 * <p>열은 다섯 — 기말잔액(차변) · 기말금액(차변) · 계정명 · 기말금액(대변) · 기말잔액(대변). 기말금액은 기간 안 차 · 대 합,
 * 기말잔액은 처음부터 기간 끝까지 쌓은 잔액을 계정의 제 쪽(자산 → 차변, 부채 · 자본 → 대변)에 부호째 찍는다.
 * 원본은 유동자산 &gt; 당좌자산 &gt; 현금및현금성자산 &gt; 보통예금처럼 여러 층으로 묶고 매출총이익 · 영업이익 같은 계산 줄을 끼운다.
 * 우리 계정은 구분(자산 …)과 세부분류(유동자산 · 매출채권 …) 한 층만 들어 <b>세부분류 묶음 한 층</b>만 세우고, 계산 줄은 아직 없다.
 * 끝 [합계](굵게). 부서 · 프로젝트는 회계전표에 없다.
 */
export default function TrialBalancePage() {
  const { companyName } = useAuth()
  const init = periodOf('이번기수(~전월)', new Date(), undefined) ?? periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [fiscalStart, setFiscalStart] = useState<number | undefined>(undefined)
  const [thousand, setThousand] = useState(false)
  const [withZero, setWithZero] = useState(false)
  const [usedOnly, setUsedOnly] = useState(false)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [period, setPeriod] = useState<TrialBalance | null>(null)
  const [cumul, setCumul] = useState<TrialBalance | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => { /* 못 받으면 기수 버튼만 안 눌린다 */ })
  }, [])

  /* 시작월을 받으면 원본 기본 기간([이번기수(~전월)])으로 한 번 다시 건다. */
  const applied = useRef(false)
  useEffect(() => {
    if (applied.current || !fiscalStart) return
    const r = periodOf('이번기수(~전월)', new Date(), fiscalStart)
    if (r) { applied.current = true; setFrom(r.from); setTo(r.to) }
  }, [fiscalStart])

  function load() {
    setError('')
    Promise.all([
      api.get<TrialBalance>('/journals/trial-balance', { params: { from, to } }),
      api.get<TrialBalance>('/journals/trial-balance', { params: { from: '1900-01-01', to } }),
    ])
      .then(([p, c]) => { setPeriod(p.data); setCumul(c.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  const groups = useMemo(() => {
    if (!period || !cumul) return []
    const accById = new Map(accounts.map((a) => [a.id, a]))
    const pBy = new Map(period.rows.map((r) => [r.accountId, r]))
    const cBy = new Map(cumul.rows.map((r) => [r.accountId, r]))
    const ids = new Set([...pBy.keys(), ...cBy.keys(), ...(withZero ? accounts.map((a) => a.id) : [])])
    const lines: Line[] = []
    for (const id of ids) {
      const p = pBy.get(id), c = cBy.get(id), a = accById.get(id)
      const division = (p ?? c)?.division ?? a?.division
      if (!division) continue
      const pd = Number(p?.debit ?? 0), pc = Number(p?.credit ?? 0)
      const cd = Number(c?.debit ?? 0), cc = Number(c?.credit ?? 0)
      const bal = isBalanceSheet(division) ? (debitNormal(division) ? cd - cc : cc - cd) : 0
      if (usedOnly && pd === 0 && pc === 0) continue
      if (!withZero && pd === 0 && pc === 0 && bal === 0) continue
      lines.push({ id, code: (p ?? c)?.accountCode ?? a?.code ?? '', name: (p ?? c)?.accountName ?? a?.name ?? '', division,
        group: a?.detailCategory ?? '', pd, pc, bal })
    }
    lines.sort((x, y) => DIV_ORDER.indexOf(x.division) - DIV_ORDER.indexOf(y.division) || x.code.localeCompare(y.code))
    const out: { key: string; name: string; division: AccountDivision; lines: Line[] }[] = []
    for (const l of lines) {
      const key = `${l.division}|${l.group}`
      const last = out[out.length - 1]
      if (last && last.key === key) last.lines.push(l)
      else out.push({ key, name: l.group, division: l.division, lines: [l] })
    }
    return out
  }, [period, cumul, accounts, withZero, usedOnly])

  const all = groups.flatMap((g) => g.lines)
  const total = {
    db: all.filter((l) => debitNormal(l.division)).reduce((s, l) => s + l.bal, 0),
    pd: all.reduce((s, l) => s + l.pd, 0),
    pc: all.reduce((s, l) => s + l.pc, 0),
    cb: all.filter((l) => !debitNormal(l.division)).reduce((s, l) => s + l.bal, 0),
  }
  const fmt = (n: number) => (n === 0 ? '' : Math.round(thousand ? n / 1000 : n).toLocaleString('ko-KR'))
  /** 기말잔액은 계정의 제 쪽에만 찍는다. */
  const cells = (division: AccountDivision, bal: number, pd: number, pc: number, name: React.ReactNode, isBS: boolean) => (
    <>
      <td style={{ textAlign: 'right' }}>{isBS && debitNormal(division) ? fmt(bal) : ''}</td>
      <td style={{ textAlign: 'right' }}>{fmt(pd)}</td>
      <td style={NAME_CELL}>{name}</td>
      <td style={{ textAlign: 'right' }}>{fmt(pc)}</td>
      <td style={{ textAlign: 'right' }}>{isBS && !debitNormal(division) ? fmt(bal) : ''}</td>
    </>
  )

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '합계잔액시산표', [all.length])

  const reset = () => {
    const r = periodOf('이번기수(~전월)', new Date(), fiscalStart) ?? periodOf('금월(~오늘)')!
    setFrom(r.from); setTo(r.to); setThousand(false); setWithZero(false); setUsedOnly(false)
  }
  const check = (label: string, v: boolean, set: (b: boolean) => void) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title="합계잔액시산표"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="조회일자">
          <input type="month" className="ec-input" value={from.slice(0, 7)} onChange={(e) => e.target.value && setFrom(`${e.target.value}-01`)} style={{ width: 130 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="month" className="ec-input" value={to.slice(0, 7)}
                 onChange={(e) => { if (!e.target.value) return; const [y, m] = e.target.value.split('-').map(Number); const d = new Date(y, m, 0); setTo(`${e.target.value}-${String(d.getDate()).padStart(2, '0')}`) }}
                 style={{ width: 130 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={TRIAL_BALANCE_PICKS} currentFrom={from} fiscalStart={fiscalStart} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="기타">
          {check('천단위', thousand, setThousand)}
          {check('잔액0포함', withZero, setWithZero)}
          {check('전표발생계정', usedOnly, setUsedOnly)}
        </EcCond>
      </ul>

      {period && cumul && (
        <>
          <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 12px' }}>합계잔액시산표</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '0 0 4px' }}>
            <span>회사명 : {companyName ?? ''}</span>
            <span>{slash(from)} ~{slash(to)}</span>
          </div>
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>
                <th style={{ textAlign: 'right' }}>기말잔액(차변)</th>
                <th style={{ textAlign: 'right' }}>기말금액(차변)</th>
                <th style={{ textAlign: 'center' }}>계정명</th>
                <th style={{ textAlign: 'right' }}>기말금액(대변)</th>
                <th style={{ textAlign: 'right' }}>기말잔액(대변)</th>
              </tr>
            </thead>
            <tbody>
              {all.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>}
              {groups.map((g) => {
                const bs = isBalanceSheet(g.division)
                const bal = g.lines.reduce((s, l) => s + l.bal, 0)
                const pd = g.lines.reduce((s, l) => s + l.pd, 0)
                const pc = g.lines.reduce((s, l) => s + l.pc, 0)
                return (
                  <Fragment key={g.key}>
                    {g.name && <tr style={GROUP_ROW}>{cells(g.division, bal, pd, pc, g.name, bs)}</tr>}
                    {g.lines.map((l) => <tr key={l.id}>{cells(l.division, l.bal, l.pd, l.pc, l.name, bs)}</tr>)}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={TOTAL_ROW}>
                <td style={{ textAlign: 'right' }}>{fmt(total.db)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(total.pd)}</td>
                <td style={{ textAlign: 'center' }}>합계</td>
                <td style={{ textAlign: 'right' }}>{fmt(total.pc)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(total.cb)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </EcListShell>
  )
}

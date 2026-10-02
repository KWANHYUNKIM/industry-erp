import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [소계] 줄은 바탕 rgb(243,243,243) · 굵게, [기초잔액] · [기말잔액]은 굵게만(2026-10-03 실측). */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const BOLD: React.CSSProperties = { fontWeight: 700 }
const slash = (d: string) => d.replace(/-/g, '/')
/** 자금 계정 — 현금 · 당좌예금 · 보통예금(StandardAccounts). 자금일보와 같다. */
const FUND_CODES = ['101', '102', '103']
const shiftDay = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00`); t.setDate(t.getDate() + n)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
/** 한 기간의 자금 흐름 — 기초잔액, 상대계정별 증가 · 감소. */
interface Flow { open: number; inc: Map<string, number>; dec: Map<string, number> }

function flowOf(entries: JournalEntry[], from: string, to: string): Flow {
  const f: Flow = { open: 0, inc: new Map(), dec: new Map() }
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
  for (const e of entries) {
    if (e.entryDate > to) continue
    const fund = e.lines.filter((l) => FUND_CODES.includes(l.accountCode))
    if (fund.length === 0) continue
    if (e.entryDate < from) { f.open += fund.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0); continue }
    /*
     * 자금 쪽 순증감을 자금이 아닌 줄의 계정으로 가른다 — 자금이 들어오면 대변 줄 계정이 '증가', 나가면 차변 줄 계정이 '감소'.
     * 현금 ↔ 예금처럼 자금끼리만 오간 전표는 남는 줄이 없어 흐름에 안 잡힌다(원본도 자금 계정끼리의 이동은 흐름이 아니다).
     */
    for (const l of e.lines) {
      if (FUND_CODES.includes(l.accountCode)) continue
      if (Number(l.credit)) add(f.inc, l.accountName, Number(l.credit))
      if (Number(l.debit)) add(f.dec, l.accountName, Number(l.debit))
    }
  }
  return f
}

/**
 * 회계 I &gt; 경영자료 &gt; <b>현금흐름(입출금내역)</b>(E010805) — 2026-10-03 loginaa 실측(자료가 든 판, 전월).
 *
 * <p>조건: 기준일자(구간, 기본 <b>금일</b>, 빠른선택 전일동일기간 · 금일 … 전월 · 이번기수 · 직전기수 · 종료일) · 부서 · 프로젝트 · 기타([결재방표시]).
 * 표는 구분 · 계정명 · [고른 기간] · [하루 앞당긴 같은 길이 기간] — 원본 머리가 '2026/09/01 ~ 2026/09/30 | 2026/08/31 ~ 2026/09/29' 였다
 * (그래서 빠른선택 맨 앞의 이름이 '전일동일기간'). 줄은 기초잔액 · 증가(상대계정마다) · 소계 · 감소(상대계정마다) · 소계 · 기말잔액.
 *
 * <p>자금 계정은 현금 · 당좌 · 보통예금(101 · 102 · 103). 증가 · 감소는 자금 분개의 상대 줄 계정으로 가른다.
 * 결재방표시는 우리 장부 인쇄가 결재 칸을 그리지 않아 두지 않았고, 부서 · 프로젝트는 회계전표에 없다.
 */
export default function CashFlowListPage() {
  const { companyName } = useAuth()
  const init = periodOf('금일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from: '1900-01-01', to, all: true } })
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const prevFrom = shiftDay(from, -1), prevTo = shiftDay(to, -1)
  const cur = useMemo(() => flowOf(entries, from, to), [entries, from, to])
  const prev = useMemo(() => flowOf(entries, prevFrom, prevTo), [entries, prevFrom, prevTo])
  const keys = (k: 'inc' | 'dec') => [...new Set([...cur[k].keys(), ...prev[k].keys()])].sort((a, b) => (cur[k].get(b) ?? 0) - (cur[k].get(a) ?? 0))
  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0)
  const close = (f: Flow) => f.open + sum(f.inc) - sum(f.dec)

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '현금흐름(입출금내역)', [cur.inc.size, cur.dec.size])

  return (
    <EcListShell
      title="현금흐름(입출금내역)"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={SETTLE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
      </ul>

      {truncated && <p style={{ fontSize: 12, color: '#c07a00', marginBottom: 6 }}>전표가 많아 앞부분만 받았습니다.</p>}
      <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 4px' }}>현금흐름</h3>
      <div style={{ fontSize: 12, marginBottom: 4 }}>회사명 : {companyName ?? ''}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>구분</th>
            <th>계정명</th>
            <th style={{ textAlign: 'right' }}>{slash(from)}  ~ {slash(to)}</th>
            <th style={{ textAlign: 'right' }}>{slash(prevFrom)}  ~ {slash(prevTo)}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : (
            <>
              <tr style={BOLD}>
                <td colSpan={2} style={{ textAlign: 'center' }}>기초잔액</td>
                <td style={{ textAlign: 'right' }}>{won(cur.open)}</td>
                <td style={{ textAlign: 'right' }}>{won(prev.open)}</td>
              </tr>
              {(['inc', 'dec'] as const).map((k) => (
                <Fragment key={k}>
                  {keys(k).map((name) => (
                    <tr key={`${k}${name}`}>
                      <td style={{ textAlign: 'center' }}>{k === 'inc' ? '증가' : '감소'}</td>
                      <td>{name}</td>
                      <td style={{ textAlign: 'right' }}>{won(cur[k].get(name) ?? 0)}</td>
                      <td style={{ textAlign: 'right' }}>{won(prev[k].get(name) ?? 0)}</td>
                    </tr>
                  ))}
                  <tr style={SUB_ROW}>
                    <td colSpan={2} style={{ textAlign: 'center' }}>소계</td>
                    <td style={{ textAlign: 'right' }}>{won(sum(cur[k]))}</td>
                    <td style={{ textAlign: 'right' }}>{won(sum(prev[k]))}</td>
                  </tr>
                </Fragment>
              ))}
              <tr style={BOLD}>
                <td colSpan={2} style={{ textAlign: 'center' }}>기말잔액</td>
                <td style={{ textAlign: 'right' }}>{won(close(cur))}</td>
                <td style={{ textAlign: 'right' }}>{won(close(prev))}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

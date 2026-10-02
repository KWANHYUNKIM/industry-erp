import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [계정 계] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')
/** 자금 계정 — 현금 · 당좌예금 · 보통예금(StandardAccounts). */
const FUND_CODES = ['101', '102', '103']

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface Fund { code: string; name: string; carry: number; inc: number; dec: number }
interface Move { key: string; date: string; counter: string; partner: string; text: string; amount: number }

/**
 * 회계 I &gt; 경영자료 &gt; <b>자금일보</b>(E010830) — 2026-10-03 loginaa 실측(자료가 든 판, 전월).
 *
 * <p>조건: 기준일자(구간, 기본 <b>금일</b>, 빠른선택 금일 … 전월 · 종료일) · 부서 · 프로젝트 · 기타([결재방표시]).
 * 표는 셋 — <b>1 . 자금 현황</b>(계정명 · 거래처명 · 이월잔액[외화] · 증가[외화] · 감소[외화] · 금일잔액[외화] · 계정코드 · 거래처코드,
 * 계정마다 [계정 계], 끝 [합계]) · <b>2 . 자금의 증가</b> · <b>3 . 자금의 감소</b>(일자 · 상대계정명 · 상대거래처명 · 적요 · 금액 · 거래처코드,
 * 같은 날의 둘째 줄부터 일자를 비움, 끝 [합계]).
 *
 * <p>자금 계정은 현금 · 당좌 · 보통예금(101 · 102 · 103). 원본은 예금 계정을 통장(거래처, 예: 기업은행-1122)마다 갈라 [거래처명] ·
 * [거래처코드]에 찍는데 우리 자금 분개는 통장을 들지 않아 '[ ]' 한 줄이다. 외화는 회계전표가 외화 금액을 들지 않아 원화만.
 * 상대계정명은 같은 전표의 다른 줄 계정(둘 이상이면 '첫 계정 외 n'), 상대거래처명은 전표의 거래처. 부서 · 프로젝트는 회계전표에 없다.
 */
export default function FundDailyPage() {
  const { companyName } = useAuth()
  const init = periodOf('금일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 이월잔액을 내려고 처음부터 기간 끝까지 받는다. */
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

  const { funds, incs, decs } = useMemo(() => {
    const fm = new Map<string, Fund>()
    const incs: Move[] = [], decs: Move[] = []
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      for (const l of e.lines) {
        if (!FUND_CODES.includes(l.accountCode)) continue
        if (!fm.has(l.accountCode)) fm.set(l.accountCode, { code: l.accountCode, name: l.accountName, carry: 0, inc: 0, dec: 0 })
        const f = fm.get(l.accountCode)!
        const d = Number(l.debit), c = Number(l.credit)
        if (e.entryDate < from) { f.carry += d - c; continue }
        f.inc += d; f.dec += c
        const others = [...new Set(e.lines.filter((o) => o !== l && !FUND_CODES.includes(o.accountCode)).map((o) => o.accountName))]
        const counter = others.length === 0 ? '' : others.length === 1 ? others[0] : `${others[0]} 외 ${others.length - 1}`
        const m = { key: `${e.id}-${l.id}`, date: e.entryDate, counter, partner: e.partnerName ?? '', text: l.description ?? e.description ?? '' }
        if (d) incs.push({ ...m, amount: d })
        if (c) decs.push({ ...m, amount: c })
      }
    }
    return { funds: [...fm.values()].filter((f) => f.carry || f.inc || f.dec).sort((a, b) => a.code.localeCompare(b.code)), incs, decs }
  }, [entries, from])
  const tot = funds.reduce((s, f) => ({ carry: s.carry + f.carry, inc: s.inc + f.inc, dec: s.dec + f.dec }), { carry: 0, inc: 0, dec: 0 })

  const tableRef = useRef<HTMLTableElement>(null)
  const incRef = useRef<HTMLTableElement>(null)
  const decRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '자금일보', [funds.length])
  useTableColumnCheck(incRef, '자금일보', [incs.length])
  useTableColumnCheck(decRef, '자금일보', [decs.length])

  const section = (t: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, margin: '14px 0 4px' }}>
      <span>{t}</span>
      <span style={{ fontWeight: 400 }}>{slash(from)} ~ {slash(to)}</span>
    </div>
  )
  const moveHead = (
    <thead>
      <tr>
        <th style={{ textAlign: 'center' }}>일자</th>
        <th>상대계정명</th>
        <th>상대거래처명</th>
        <th>적요</th>
        <th style={{ textAlign: 'right' }}>금액</th>
        <th>거래처코드</th>
      </tr>
    </thead>
  )
  const moveBody = (ms: Move[]) => (
    <tbody>
      {ms.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 14 }}>등록된 데이터가 없습니다.</td></tr>}
      {ms.map((m, i) => (
        <tr key={m.key}>
          <td style={{ textAlign: 'center' }}>{i > 0 && ms[i - 1].date === m.date ? '' : slash(m.date)}</td>
          <td>{m.counter}</td>
          <td>{m.partner}</td>
          <td>{m.text}</td>
          <td style={{ textAlign: 'right' }}>{won(m.amount)}</td>
          <td></td>
        </tr>
      ))}
      <tr style={SUB_ROW}>
        <td colSpan={4} style={{ textAlign: 'center' }}>합계</td>
        <td style={{ textAlign: 'right' }}>{won(ms.reduce((s, m) => s + m.amount, 0))}</td>
        <td></td>
      </tr>
    </tbody>
  )

  return (
    <EcListShell
      title="자금일보"
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
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
      </ul>

      {truncated && <p style={{ fontSize: 12, color: '#c07a00', marginBottom: 6 }}>전표가 많아 앞부분만 받았습니다.</p>}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
      ) : (
        <>
          <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 4px' }}>자금일보</h3>
          <div style={{ fontSize: 12 }}>회사명 : {companyName ?? ''}</div>
          {section('1 . 자금 현황')}
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>
                <th>계정명</th>
                <th>거래처명</th>
                <th style={{ textAlign: 'right' }}>이월잔액[외화]</th>
                <th style={{ textAlign: 'right' }}>증가[외화]</th>
                <th style={{ textAlign: 'right' }}>감소[외화]</th>
                <th style={{ textAlign: 'right' }}>금일잔액[외화]</th>
                <th>계정코드</th>
                <th>거래처코드</th>
              </tr>
            </thead>
            <tbody>
              {funds.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 14 }}>등록된 데이터가 없습니다.</td></tr>}
              {funds.map((f) => (
                <Fragment key={f.code}>
                  <tr>
                    <td>{f.name}</td>
                    <td>[ ]</td>
                    <td style={{ textAlign: 'right' }}>{won(f.carry)}</td>
                    <td style={{ textAlign: 'right' }}>{won(f.inc)}</td>
                    <td style={{ textAlign: 'right' }}>{won(f.dec)}</td>
                    <td style={{ textAlign: 'right' }}>{won(f.carry + f.inc - f.dec)}</td>
                    <td>{f.code}</td>
                    <td>[ ]</td>
                  </tr>
                  <tr style={SUB_ROW}>
                    <td colSpan={2} style={{ textAlign: 'center' }}>{f.name} 계</td>
                    <td style={{ textAlign: 'right' }}>{won(f.carry)}</td>
                    <td style={{ textAlign: 'right' }}>{won(f.inc)}</td>
                    <td style={{ textAlign: 'right' }}>{won(f.dec)}</td>
                    <td style={{ textAlign: 'right' }}>{won(f.carry + f.inc - f.dec)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </Fragment>
              ))}
              <tr style={SUB_ROW}>
                <td colSpan={2} style={{ textAlign: 'center' }}>합계</td>
                <td style={{ textAlign: 'right' }}>{won(tot.carry)}</td>
                <td style={{ textAlign: 'right' }}>{won(tot.inc)}</td>
                <td style={{ textAlign: 'right' }}>{won(tot.dec)}</td>
                <td style={{ textAlign: 'right' }}>{won(tot.carry + tot.inc - tot.dec)}</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
          {section('2 . 자금의 증가')}
          <table ref={incRef} className="w-full text-left">{moveHead}{moveBody(incs)}</table>
          {section('3 . 자금의 감소')}
          <table ref={decRef} className="w-full text-left">{moveHead}{moveBody(decs)}</table>
        </>
      )}
    </EcListShell>
  )
}

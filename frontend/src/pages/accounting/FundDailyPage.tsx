import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INQUIRY_PICKS, SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [계정 계] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')
/** 자금 계정 — 현금 · 당좌예금 · 보통예금(StandardAccounts). */
const FUND_CODES = ['101', '102', '103']
/** 자금증감내역 원본 빠른선택 — 결산 묶음 뒤에 최근30일(기본). */
const FLOW_PICKS = [...SETTLE_PICKS, '최근30일'] as const

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface Book { label: string; no: string; carry: number; inc: number; dec: number }
interface Fund { code: string; name: string; carry: number; inc: number; dec: number; books: Map<string, Book> }
interface BankTxn { journalEntryId: number | null; bankAccountId: number }
interface BankAccount { id: number; name: string | null; bankName: string | null; accountNo: string | null }
/** 통장 이름 — 등록한 통장명, 없으면 원본 모양 '은행명-계좌끝4자리'(원본 예: 기업은행-1122). */
const bookLabel = (a: BankAccount) => a.name || `${a.bankName ?? ''}-${(a.accountNo ?? '').replace(/\D/g, '').slice(-4)}`
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
 * [거래처코드]에 찍는다 — 우리도 계좌 입출금(/bank-cards/transactions)이 가리키는 회계전표로 통장을 찾아 가른다(통장명이 없으면
 * '은행명-계좌끝4자리', 거래처코드 자리는 계좌번호). 통장 없이 잡힌 분개(수표 입금 등)는 '[ ]' 줄이다. 외화는 회계전표가 외화 금액을 들지 않아 원화만.
 * 상대계정명은 같은 전표의 다른 줄 계정(둘 이상이면 '첫 계정 외 n'), 상대거래처명은 전표의 거래처. 부서 · 프로젝트는 회계전표에 없다.
 *
 * <p><b>자금증감내역</b>(E010815, variant="flow") — 같은 날 실측. 자금일보의 증가 · 감소 두 표만 있다(번호가 <b>1 . 자금의 증가 · 2 . 자금의 감소</b>로
 * 당겨진다). 기본 기간 <b>최근30일</b>(빠른선택 … 이번기수 · 직전기수 · 종료일 · 최근30일), 일자는 줄마다 찍고 거래처코드 열이 없다.
 */
export default function FundDailyPage({ variant = 'daily' }: { variant?: 'daily' | 'flow' }) {
  const flow = variant === 'flow'
  const title = flow ? '자금증감내역' : '자금일보'
  const { companyName } = useAuth()
  const init = flow ? periodOf('최근30일')! : periodOf('금일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  /* 회계전표 → 그 전표를 만든 통장. 원본은 예금 계정을 통장(거래처명 자리)마다 가른다. */
  const [bookOf, setBookOf] = useState<Map<number, { label: string; no: string }>>(new Map())
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 이월잔액을 내려고 처음부터 기간 끝까지 받는다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, t, a] = await Promise.all([
        api.get<JournalList>('/journals', { params: { from: '1900-01-01', to, all: true } }),
        api.get<{ rows: BankTxn[] }>('/bank-cards/transactions', { params: { all: true, from: '1900-01-01', to } }).catch(() => ({ data: { rows: [] as BankTxn[] } })),
        api.get<BankAccount[]>('/bank-cards/accounts').catch(() => ({ data: [] as BankAccount[] })),
      ])
      const acc = new Map(a.data.map((x) => [x.id, x]))
      setBookOf(new Map(t.data.rows.filter((x) => x.journalEntryId != null && acc.has(x.bankAccountId))
        .map((x) => { const b = acc.get(x.bankAccountId)!; return [x.journalEntryId!, { label: bookLabel(b), no: b.accountNo ?? '' }] })))
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
        if (!fm.has(l.accountCode)) fm.set(l.accountCode, { code: l.accountCode, name: l.accountName, carry: 0, inc: 0, dec: 0, books: new Map() })
        const f = fm.get(l.accountCode)!
        /* 현금은 통장이 없다. 예금 줄은 그 전표를 만든 통장으로, 통장 없이 잡힌 분개는 '[ ]' 줄로. */
        const bk = l.accountCode === '101' ? undefined : bookOf.get(e.id)
        const key = bk ? bk.label : '[ ]'
        if (!f.books.has(key)) f.books.set(key, { label: key, no: bk ? bk.no : '[ ]', carry: 0, inc: 0, dec: 0 })
        const b = f.books.get(key)!
        const d = Number(l.debit), c = Number(l.credit)
        if (e.entryDate < from) { f.carry += d - c; b.carry += d - c; continue }
        f.inc += d; f.dec += c; b.inc += d; b.dec += c
        const others = [...new Set(e.lines.filter((o) => o !== l && !FUND_CODES.includes(o.accountCode)).map((o) => o.accountName))]
        const counter = others.length === 0 ? '' : others.length === 1 ? others[0] : `${others[0]} 외 ${others.length - 1}`
        const m = { key: `${e.id}-${l.id}`, date: e.entryDate, counter, partner: e.partnerName ?? '', text: l.description ?? e.description ?? '' }
        if (d) incs.push({ ...m, amount: d })
        if (c) decs.push({ ...m, amount: c })
      }
    }
    return { funds: [...fm.values()].filter((f) => f.carry || f.inc || f.dec).sort((a, b) => a.code.localeCompare(b.code)), incs, decs }
  }, [entries, from, bookOf])
  const tot = funds.reduce((s, f) => ({ carry: s.carry + f.carry, inc: s.inc + f.inc, dec: s.dec + f.dec }), { carry: 0, inc: 0, dec: 0 })

  const tableRef = useRef<HTMLTableElement>(null)
  const incRef = useRef<HTMLTableElement>(null)
  const decRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [funds.length])
  useTableColumnCheck(incRef, title, [incs.length])
  useTableColumnCheck(decRef, title, [decs.length])

  const section = (t: string) => (
    <div className="flex justify-between text-[12.5px] font-bold mt-[14px] mx-0 mb-[4px]">
      <span>{t}</span>
      <span className="font-normal">{slash(from)} ~ {slash(to)}</span>
    </div>
  )
  const moveHead = (
    <thead>
      <tr>
        <th className="text-center">일자</th>
        <th>상대계정명</th>
        <th>상대거래처명</th>
        <th>적요</th>
        <th className="text-right">금액</th>
        {!flow && <th>거래처코드</th>}
      </tr>
    </thead>
  )
  const moveBody = (ms: Move[]) => (
    <tbody>
      {ms.length === 0 && <tr><td colSpan={flow ? 5 : 6} className="text-center text-ec-hint p-[14px]">등록된 데이터가 없습니다.</td></tr>}
      {ms.map((m, i) => (
        <tr key={m.key}>
          <td className="text-center">{!flow && i > 0 && ms[i - 1].date === m.date ? '' : slash(m.date)}</td>
          <td>{m.counter}</td>
          <td>{m.partner}</td>
          <td>{m.text}</td>
          <td className="text-right">{won(m.amount)}</td>
          {!flow && <td></td>}
        </tr>
      ))}
      <tr style={SUB_ROW}>
        <td colSpan={4} className="text-center">합계</td>
        <td className="text-right">{won(ms.reduce((s, m) => s + m.amount, 0))}</td>
        {!flow && <td></td>}
      </tr>
    </tbody>
  )

  return (
    <EcListShell
      title={flow ? '자금증감내역' : '자금일보'}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={flow ? FLOW_PICKS : INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">전표가 많아 앞부분만 받았습니다.</p>}
      {loading ? (
        <p className="ec-empty">불러오는 중…</p>
      ) : (
        <>
          <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[4px]">{flow ? '자금증감내역' : '자금일보'}</h3>
          <div className="text-[12px]">회사명 : {companyName ?? ''}</div>
          {!flow && (
            <>
          {section('1 . 자금 현황')}
              <table ref={tableRef} className="w-full text-left">
                <thead>
                  <tr>
                    <th>계정명</th>
                    <th>거래처명</th>
                    <th className="text-right">이월잔액[외화]</th>
                    <th className="text-right">증가[외화]</th>
                    <th className="text-right">감소[외화]</th>
                    <th className="text-right">금일잔액[외화]</th>
                    <th>계정코드</th>
                    <th>거래처코드</th>
                  </tr>
                </thead>
                <tbody>
                  {funds.length === 0 && <tr><td colSpan={8} className="text-center text-ec-hint p-[14px]">등록된 데이터가 없습니다.</td></tr>}
                  {funds.map((f) => (
                    <Fragment key={f.code}>
                      {[...f.books.values()].filter((b) => b.carry || b.inc || b.dec).sort((x, y) => (x.label === '[ ]' ? -1 : y.label === '[ ]' ? 1 : x.label.localeCompare(y.label, 'ko'))).map((b) => (
                        <tr key={b.label}>
                          <td>{f.name}</td>
                          <td>{b.label}</td>
                          <td className="text-right">{won(b.carry)}</td>
                          <td className="text-right">{won(b.inc)}</td>
                          <td className="text-right">{won(b.dec)}</td>
                          <td className="text-right">{won(b.carry + b.inc - b.dec)}</td>
                          <td>{f.code}</td>
                          <td>{b.no}</td>
                        </tr>
                      ))}
                      <tr style={SUB_ROW}>
                        <td colSpan={2} className="text-center">{f.name} 계</td>
                        <td className="text-right">{won(f.carry)}</td>
                        <td className="text-right">{won(f.inc)}</td>
                        <td className="text-right">{won(f.dec)}</td>
                        <td className="text-right">{won(f.carry + f.inc - f.dec)}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    </Fragment>
                  ))}
                  <tr style={SUB_ROW}>
                    <td colSpan={2} className="text-center">합계</td>
                    <td className="text-right">{won(tot.carry)}</td>
                    <td className="text-right">{won(tot.inc)}</td>
                    <td className="text-right">{won(tot.dec)}</td>
                    <td className="text-right">{won(tot.carry + tot.inc - tot.dec)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          {section(flow ? '1 . 자금의 증가' : '2 . 자금의 증가')}
          <table ref={incRef} className="w-full text-left">{moveHead}{moveBody(incs)}</table>
          {section(flow ? '2 . 자금의 감소' : '3 . 자금의 감소')}
          <table ref={decRef} className="w-full text-left">{moveHead}{moveBody(decs)}</table>
        </>
      )}
    </EcListShell>
  )
}

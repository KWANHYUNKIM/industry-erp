import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { bankLabel } from '../../utils/bankLabel'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INQUIRY_PICKS, SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { JournalEntry } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { scopeEntries } from '../../utils/deptProject'
import CodePickerField from '../../components/CodePickerField'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/* 원본 [계정 계] · [합계] 줄(2026-10-03 실측): 바탕 회색 243 · 굵게 — 출력물 합계줄 토큰 --ec-report-stripe 로 그린다. */
const slash = (d: string) => d.replace(/-/g, '/')
/** 자금 계정 — 현금 · 당좌예금 · 보통예금(StandardAccounts). */
const FUND_CODES = ['1019', '1029', '1039']
/** 자금증감내역 원본 빠른선택 — 결산 묶음 뒤에 최근30일(기본). */
const FLOW_PICKS = [...SETTLE_PICKS, '최근30일'] as const

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface Book { label: string; no: string; carry: number; inc: number; dec: number }
interface Fund { code: string; name: string; carry: number; inc: number; dec: number; books: Map<string, Book> }
interface BankTxn { journalEntryId: number | null; bankAccountId: number; deposit: boolean }
interface BankAccount { id: number; name: string | null; bankName: string | null; accountNo: string | null }
interface Move { key: string; date: string; counter: string; partner: string; text: string; amount: number }
/** 원본 [계좌간이동] 표 한 줄 — 자금 계정끼리만 오간 전표(이동계좌 'A → B'). */
interface Xfer { key: string; date: string; route: string; text: string; amount: number }

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
 * 상대계정명은 같은 전표의 다른 줄 계정(둘 이상이면 '첫 계정 외 n'), 상대거래처명은 전표의 거래처. [부서] · [프로젝트]는 회계전표 줄의 것(V343)으로 거른다.
 *
 * <p><b>자금증감내역</b>(E010815, variant="flow") — 같은 날 실측. 자금일보의 증가 · 감소 두 표만 있다(번호가 <b>1 . 자금의 증가 · 2 . 자금의 감소</b>로
 * 당겨진다). 기본 기간 <b>최근30일</b>(빠른선택 … 이번기수 · 직전기수 · 종료일 · 최근30일), 일자는 줄마다 찍고 거래처코드 열이 없다.
 */
/** 경영요약보고서(E010821)가 [자금증감내역] 표들을 이어 그릴 때 쓰는 끼움 모드 — 조건 판 · 머리 없이 표만, 번호는 startNo 부터 '3. 자금의 증가'. */
export interface FundEmbed { from: string; to: string; startNo: number; onCount: (n: number) => void }

export default function FundDailyPage({ variant = 'daily', embed }: { variant?: 'daily' | 'flow'; embed?: FundEmbed }) {
  const flow = variant === 'flow'
  const title = flow ? '자금증감내역' : '자금일보'
  const { companyName } = useAuth()
  const init = flow ? periodOf('최근30일')! : periodOf('금일')!
  const [from, setFrom] = useState(embed?.from ?? init.from)
  const [to, setTo] = useState(embed?.to ?? init.to)
  useEffect(() => { if (embed) { setFrom(embed.from); setTo(embed.to) } }, [embed?.from, embed?.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const [allEntries, setEntries] = useState<JournalEntry[]>([])
  /* 원본 조건 [부서] · [프로젝트] — 회계전표 줄의 것(V343)으로 좁힌다. */
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const entries = useMemo(() => scopeEntries(allEntries, dept, project), [allEntries, dept, project])
  /* 회계전표 → 그 전표를 만든 통장. 원본은 예금 계정을 통장(거래처명 자리)마다 가른다. */
  /* 키는 `전표id:d`(입금 통장) · `전표id:c`(출금 통장) — 계좌간이동 한 장에 통장이 둘 붙는다. */
  const [bookOf, setBookOf] = useState<Map<string, { id: number; label: string; no: string }>>(new Map())
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
        .map((x) => { const b = acc.get(x.bankAccountId)!; return [`${x.journalEntryId}:${x.deposit ? 'd' : 'c'}`, { id: b.id, label: bankLabel(b), no: b.accountNo ?? '' }] })))
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

  const { funds, incs, decs, xfers } = useMemo(() => {
    const fm = new Map<string, Fund>()
    const incs: Move[] = [], decs: Move[] = [], xfers: Xfer[] = []
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      /* 원본(2026-10-20 실측): 자금 계정끼리만 오간 전표(계좌간이동)는 [자금 현황] 증가 · 감소에는 들고,
         [자금의 증가] · [자금의 감소] 대신 끝의 [계좌간이동] 표에 '출금통장 → 입금통장' 한 줄로 나온다. */
      const isXfer = e.lines.every((o) => FUND_CODES.includes(o.accountCode))
        && e.lines.some((o) => Number(o.debit)) && e.lines.some((o) => Number(o.credit))
      /* 원본(2026-10-22 실측): 수수료가 붙은 계좌간이동(차 입금통장 10,000 · 차 지급수수료 50 / 대 출금통장 10,050)도 [계좌간이동] 표에
         '출금통장 → 입금통장 · 이동금액' 한 줄이고, 수수료 줄은 [자금의 감소] 에 '지급수수료(판) | 출금통장 | 적요 | 50' 으로 간다. */
      const fundLines = e.lines.filter((o) => FUND_CODES.includes(o.accountCode))
      const restLines = e.lines.filter((o) => !FUND_CODES.includes(o.accountCode))
      const feeXfer = !isXfer && fundLines.length === 2 && fundLines.filter((o) => Number(o.debit)).length === 1 && fundLines.filter((o) => Number(o.credit)).length === 1
        && restLines.length > 0 && restLines.every((o) => Number(o.debit) > 0)
      const bookFor = (l: JournalEntry['lines'][number]) => {
        if (l.accountCode === '1019') return undefined
        const [a, b] = Number(l.debit) ? ['d', 'c'] : ['c', 'd']
        return bookOf.get(`${e.id}:${a}`) ?? bookOf.get(`${e.id}:${b}`)
      }
      for (const l of e.lines) {
        if (!FUND_CODES.includes(l.accountCode)) continue
        if (!fm.has(l.accountCode)) fm.set(l.accountCode, { code: l.accountCode, name: l.accountName, carry: 0, inc: 0, dec: 0, books: new Map() })
        const f = fm.get(l.accountCode)!
        /* 현금은 통장이 없어 거래처명이 빈칸(원본). 예금 줄은 그 전표를 만든 통장으로, 통장 없이 잡힌 분개는 '[ ]' 줄로. */
        const cash = l.accountCode === '1019'
        const bk = bookFor(l)
        /* 통장 번호로 묶는다 — 끝 네 자리가 같은 두 통장(이름이 같게 보이는 통장)이 한 줄로 합쳐지지 않게. */
        const key = cash ? '' : bk ? `#${bk.id}` : '[ ]'
        if (!f.books.has(key)) f.books.set(key, { label: cash ? '' : bk ? bk.label : '[ ]', no: cash ? '' : bk ? bk.no : '[ ]', carry: 0, inc: 0, dec: 0 })
        const b = f.books.get(key)!
        const d = Number(l.debit), c = Number(l.credit)
        if (e.entryDate < from) { f.carry += d - c; b.carry += d - c; continue }
        f.inc += d; f.dec += c; b.inc += d; b.dec += c
        if (isXfer || feeXfer) continue
        const others = [...new Set(e.lines.filter((o) => o !== l && !FUND_CODES.includes(o.accountCode)).map((o) => o.accountName))]
        const counter = others.length === 0 ? '' : others.length === 1 ? others[0] : `${others[0]} 외 ${others.length - 1}`
        const m = { key: `${e.id}-${l.id}`, date: e.entryDate, counter, partner: e.partnerName ?? '', text: l.description ?? e.description ?? '' }
        if (d) incs.push({ ...m, amount: d })
        if (c) decs.push({ ...m, amount: c })
      }
      if ((isXfer || feeXfer) && e.entryDate >= from) {
        const name = (l: JournalEntry['lines'][number]) => bookFor(l)?.label ?? l.accountName
        const outL = (feeXfer ? fundLines : e.lines).find((o) => Number(o.credit))!
        const inL = (feeXfer ? fundLines : e.lines).find((o) => Number(o.debit))!
        xfers.push({
          key: String(e.id), date: e.entryDate, route: `${name(outL)} → ${name(inL)}`,
          text: inL.description ?? e.description ?? '', amount: feeXfer ? Number(inL.debit) : e.lines.reduce((s, o) => s + Number(o.debit), 0),
        })
        if (feeXfer) {
          for (const r of restLines) {
            decs.push({ key: `${e.id}-${r.id}`, date: e.entryDate, counter: r.accountName, partner: name(outL), text: r.description ?? e.description ?? '', amount: Number(r.debit) })
          }
        }
      }
    }
    return { funds: [...fm.values()].filter((f) => f.carry || f.inc || f.dec).sort((a, b) => a.code.localeCompare(b.code)), incs, decs, xfers }
  }, [entries, from, bookOf])
  const tot = funds.reduce((s, f) => ({ carry: s.carry + f.carry, inc: s.inc + f.inc, dec: s.dec + f.dec }), { carry: 0, inc: 0, dec: 0 })

  const tableRef = useRef<HTMLTableElement>(null)
  const incRef = useRef<HTMLTableElement>(null)
  const decRef = useRef<HTMLTableElement>(null)
  const xferRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [funds.length])
  useTableColumnCheck(incRef, title, [incs.length])
  useTableColumnCheck(decRef, title, [decs.length])
  useTableColumnCheck(xferRef, title, [xfers.length])

  const section = (t: string) => (
    <div data-ms-head className="flex justify-between text-[12.5px] font-bold mt-[14px] mx-0 mb-[4px]">
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
      </tr>
    </thead>
  )
  const moveBody = (ms: Move[]) => (
    <tbody>
      {ms.map((m, i) => (
        <tr key={m.key}>
          <td className="text-center">{!flow && i > 0 && ms[i - 1].date === m.date ? '' : slash(m.date)}</td>
          <td>{m.counter}</td>
          <td>{m.partner}</td>
          <td>{m.text}</td>
          <td className="text-right">{won(m.amount)}</td>
        </tr>
      ))}
      <tr className="font-bold bg-[var(--ec-report-stripe)]">
        <td colSpan={4} className="text-center">합계</td>
        <td className="text-right">{won(ms.reduce((s, m) => s + m.amount, 0))}</td>
      </tr>
    </tbody>
  )

  const nTables = (incs.length > 0 ? 1 : 0) + (decs.length > 0 ? 1 : 0) + (xfers.length > 0 ? 1 : 0)
  const onCount = embed?.onCount
  useEffect(() => { if (!loading) onCount?.(nTables) }, [loading, nTables, onCount])
  const titleNo = (kind: 'inc' | 'dec' | 'xfer', plain: string) => {
    if (!embed) return plain
    const idx = kind === 'inc' ? 0 : kind === 'dec' ? (incs.length > 0 ? 1 : 0) : (incs.length > 0 ? 1 : 0) + (decs.length > 0 ? 1 : 0)
    return `${embed.startNo + idx}. ${kind === 'inc' ? '자금의 증가' : kind === 'dec' ? '자금의 감소' : '계좌간이동'}`
  }

  const movesBlock = (
    <>
      {/* 원본(2026-10-20): 자료가 없는 표는 제목째 빠지고 번호는 그대로(일보 2 · 3 · 4 / 증감내역 1 · 2 · 3). */}
      {incs.length > 0 && <>
        {section(titleNo('inc', flow ? '1 . 자금의 증가' : '2 . 자금의 증가'))}
        <table ref={incRef} className="w-full text-left">{moveHead}{moveBody(incs)}</table>
      </>}
      {decs.length > 0 && <>
        {section(titleNo('dec', flow ? '2 . 자금의 감소' : '3 . 자금의 감소'))}
        <table ref={decRef} className="w-full text-left">{moveHead}{moveBody(decs)}</table>
      </>}
      {xfers.length > 0 && <>
        {section(titleNo('xfer', flow ? '3 . 계좌간이동' : '4 . 계좌간이동'))}
        <table ref={xferRef} className="w-full text-left">
          <thead>
            <tr>
              <th className="text-center">일자</th>
              <th>이동계좌</th>
              <th>적요</th>
              <th className="text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            {xfers.map((x, i) => (
              <tr key={x.key}>
                <td className="text-center">{!flow && i > 0 && xfers[i - 1].date === x.date ? '' : slash(x.date)}</td>
                <td>{x.route}</td>
                <td>{x.text}</td>
                <td className="text-right">{won(x.amount)}</td>
              </tr>
            ))}
            <tr className="font-bold bg-[var(--ec-report-stripe)]">
              <td colSpan={3} className="text-center">합계</td>
              <td className="text-right">{won(xfers.reduce((s, x) => s + x.amount, 0))}</td>
            </tr>
          </tbody>
        </table>
      </>}
    </>
  )
  if (embed) return loading ? null : movesBlock

  return (
    <EcListShell
      title={flow ? '자금증감내역' : '자금일보'}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setDept(''); setProject(''); setFrom(init.from); setTo(init.to) } },
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
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
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
                  </tr>
                </thead>
                <tbody>
                  {funds.length === 0 && <tr><td colSpan={6} className="text-center text-ec-hint p-[14px]">등록된 데이터가 없습니다.</td></tr>}
                  {funds.map((f) => (
                    <Fragment key={f.code}>
                      {/* 계정명은 계정의 첫 줄에만(원본). */}
                      {[...f.books.values()].filter((b) => b.carry || b.inc || b.dec).sort((x, y) => (x.label === '[ ]' ? -1 : y.label === '[ ]' ? 1 : x.label.localeCompare(y.label, 'ko') || x.no.localeCompare(y.no))).map((b, bi) => (
                        <tr key={b.no + b.label}>
                          <td>{bi === 0 ? f.name : ''}</td>
                          <td>{b.label}</td>
                          <td className="text-right">{won(b.carry)}</td>
                          <td className="text-right">{won(b.inc)}</td>
                          <td className="text-right">{won(b.dec)}</td>
                          <td className="text-right">{won(b.carry + b.inc - b.dec)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold bg-[var(--ec-report-stripe)]">
                        <td colSpan={2} className="text-center">{f.name} 계</td>
                        <td className="text-right">{won(f.carry)}</td>
                        <td className="text-right">{won(f.inc)}</td>
                        <td className="text-right">{won(f.dec)}</td>
                        <td className="text-right">{won(f.carry + f.inc - f.dec)}</td>
                      </tr>
                    </Fragment>
                  ))}
                  <tr className="font-bold bg-[var(--ec-report-stripe)]">
                    <td colSpan={2} className="text-center">합계</td>
                    <td className="text-right">{won(tot.carry)}</td>
                    <td className="text-right">{won(tot.inc)}</td>
                    <td className="text-right">{won(tot.dec)}</td>
                    <td className="text-right">{won(tot.carry + tot.inc - tot.dec)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          {movesBlock}
          {flow && incs.length + decs.length + xfers.length === 0 && <p className="ec-empty">등록된 데이터가 없습니다.</p>}
        </>
      )}
    </EcListShell>
  )
}

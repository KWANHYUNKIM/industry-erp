import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import { bankLabel } from '../../utils/bankLabel'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, fiscalYearStartOf, periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import type { AccountDivision, JournalEntry } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { lineInDeptProject } from '../../utils/deptProject'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const slash = (d: string) => d.replace(/-/g, '/')
/** 예금 계정 — 이 줄의 거래처명 자리는 전표의 거래처가 아니라 통장이다(원본: 기업은행-1122). 자금일보와 같은 가름. */
const DEPOSIT_CODES = ['102', '103']
type Mode = '건별' | '일별' | '월별' | '계정별집계'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface AccountOpt { id: number; code: string; name: string; division: AccountDivision }
interface BankTxn { journalEntryId: number | null; bankAccountId: number }
interface BankAccount { id: number; name: string | null; bankName: string | null; accountNo: string | null }
interface Row { key: string; date: string; no: string; text: string; partner: string; d: number; c: number }
interface Book { id: number; code: string; name: string; debitSide: boolean; carry: number; rows: Row[] }

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>계정별원장</b>(E010807) — 2026-10-03 loginaa 실측(자료가 든 판, 전월, 보통예금).
 *
 * <p>조건: 구분(<b>건별</b> | 일별 | 월별 | 계정별집계) · 기준일자(구간, 기본 <b>전월</b>, 빠른선택 금일 … 전월 · 이번기수 · 직전기수 · 종료일) ·
 * 부서 · 프로젝트 · 계정(비우면 전체 — 원본은 오래 걸린다고 한 번 묻는다) · 기타([전월이월포함] 켜짐 · [거래내역없는거래처제외]) ·
 * 적용양식 · 양식구분([결재방표시]) · 데이터 보기형식.
 *
 * <p>계정마다 한 판 — 머리 '회사명 : … / 1039(보통예금)'와 기간, 열 일자-No. · 적요 · 거래처명 · 차변금액 · 대변금액 · 잔액.
 * 첫 줄 [이월잔액](두 칸 묶음, 금액을 차변(대변 계정이면 대변) 칸과 잔액에), 줄마다 잔액, 달마다 [YYYY/MM 계](차 · 대 합, 잔액 비움),
 * 끝 [합계] — 차변은 이월 + 기간 차변(원본 1,470,451,000 = 이월 530,380,000 + 940,071,000), 대변은 기간 대변, 잔액은 끝 잔액.
 * 잔액은 계정 구분의 증가 쪽(자산 · 비용은 차 − 대, 나머지는 대 − 차)으로 쌓고, 수익 · 비용 계정의 이월은 기수 첫날부터만 센다.
 * 예금 줄의 거래처명은 그 전표를 만든 계좌 입출금의 통장 이름이다. 일별 · 월별은 하루 · 한 달을 한 줄로 묶는다.
 * 2026-10-22 원본 실측: 일별은 열 다섯(일자 · 적요 '일계' · 차변 · 대변 · 잔액, 거래처 열 없음, 'YYYY/MM 계' 줄), 월별은 'YYYY/MM · 월계' 한 줄(계 줄 없음)이고
 * <b>월별 · 계정별집계는 기준일자를 달 단위로 넓힌다</b>(시작일 → 그 달 1일, 끝일 → 그 달 말일 — 22일까지 봐도 28일 전표가 든다). 계정별집계는 계정마다 한 줄
 * (계정코드 · 계정명 · 이월잔액 · 차변 · 대변 · 잔액) + 합계. [거래내역없는거래처제외]는 아직 없다. 부서 · 프로젝트는 회계전표 줄의 것(V343)으로 거른다 — 이월잔액도 그 줄만 센다.
 */
export default function AccountLedgerPage() {
  const init = periodOf('전월')!
  const [mode, setMode] = useState<Mode>('건별')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [accountId, setAccountId] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const [withCarry, setWithCarry] = useState(true)
  /** 원본 조건 [양식구분 ☐결재방표시](2026-10-21 실측) — 켜면 출력물 머리에 결재 칸. */
  const [signBox, setSignBox] = useState(false)
  const [fiscalStart, setFiscalStart] = useState<number | null>(null)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [bookOf, setBookOf] = useState<Map<number, string>>(new Map())
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => setFiscalStart(null))
  }, [])

  /* 이월잔액을 내려고 처음부터 기간 끝까지 받는다. 기간 두 칸을 잇달아 바꾸면 읽기가 둘 뜬다 — 늦게 온 옛 응답이 새 것을 덮지 않게 마지막 것만 쓴다. */
  const seq = useRef(0)
  /* 월별 · 계정별집계는 달 단위로 넓힌다(원본 실측) */
  const wide = mode === '월별' || mode === '계정별집계'
  const effFrom = wide && from ? `${from.slice(0, 7)}-01` : from
  const effTo = wide && to ? `${to.slice(0, 7)}-${String(new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0).getDate()).padStart(2, '0')}` : to
  async function load() {
    const my = ++seq.current
    setLoading(true)
    setError('')
    try {
      const [r, t, a] = await Promise.all([
        api.get<JournalList>('/journals', { params: { from: '1900-01-01', to: effTo, all: true } }),
        api.get<{ rows: BankTxn[] }>('/bank-cards/transactions', { params: { all: true, from: '1900-01-01', to: effTo } }).catch(() => ({ data: { rows: [] as BankTxn[] } })),
        api.get<BankAccount[]>('/bank-cards/accounts').catch(() => ({ data: [] as BankAccount[] })),
      ])
      if (my !== seq.current) return
      const acc = new Map(a.data.map((x) => [x.id, x]))
      setBookOf(new Map(t.data.rows.filter((x) => x.journalEntryId != null && acc.has(x.bankAccountId))
        .map((x) => [x.journalEntryId!, bankLabel(acc.get(x.bankAccountId)!)])))
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      if (my === seq.current) setError(extractErrorMessage(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, wide])

  const plCut = fiscalStart ? fiscalYearStartOf(effFrom, fiscalStart) : null
  const books = useMemo(() => {
    const accById = new Map(accounts.map((a) => [a.id, a]))
    const m = new Map<number, Book>()
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      for (const l of e.lines) {
        if (accountId && String(l.accountId) !== accountId) continue
        if (!lineInDeptProject(l, dept, project)) continue
        const acc = accById.get(l.accountId)
        const debitSide = !acc || acc.division === 'ASSET' || acc.division === 'EXPENSE'
        const pl = acc?.division === 'REVENUE' || acc?.division === 'EXPENSE'
        if (!m.has(l.accountId)) m.set(l.accountId, { id: l.accountId, code: l.accountCode, name: l.accountName, debitSide, carry: 0, rows: [] })
        const b = m.get(l.accountId)!
        const d = Number(l.debit), c = Number(l.credit)
        if (e.entryDate < effFrom) {
          /* 지난 기수의 손익은 이익잉여금으로 넘어갔다 — 수익 · 비용 계정의 이월은 기수 첫날부터만. */
          if (withCarry && !(pl && plCut && e.entryDate < plCut)) b.carry += debitSide ? d - c : c - d
          continue
        }
        const partner = DEPOSIT_CODES.includes(l.accountCode) ? bookOf.get(e.id) ?? '' : e.partnerName ?? ''
        b.rows.push({ key: `${e.id}-${l.id}`, date: e.entryDate, no: e.docNo, text: l.description ?? e.description ?? '', partner, d, c })
      }
    }
    return [...m.values()].filter((b) => b.rows.length > 0 || b.carry !== 0).sort((a, b) => a.code.localeCompare(b.code))
  }, [entries, accounts, accountId, dept, project, withCarry, effFrom, plCut, bookOf])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '계정별원장', [books.length, mode])

  const reset = () => { setMode('건별'); setFrom(init.from); setTo(init.to); setAccountId(''); setDept(''); setProject(''); setWithCarry(true) }

  function bookTable(b: Book) {
    const unit = mode === '월별' ? 7 : 10
    const groups: { key: string; rows: Row[] }[] = []
    for (const r of b.rows) {
      const k = mode === '건별' ? r.key : r.date.slice(0, unit)
      const last = groups[groups.length - 1]
      if (mode !== '건별' && last && last.key === k) last.rows.push(r)
      else groups.push({ key: k, rows: [r] })
    }
    const sum = (rs: Row[]) => rs.reduce((s, r) => ({ d: s.d + r.d, c: s.c + r.c }), { d: 0, c: 0 })
    const step = (x: { d: number; c: number }) => (b.debitSide ? x.d - x.c : x.c - x.d)
    const months = [...new Set(b.rows.map((r) => r.date.slice(0, 7)))]
    const s = sum(b.rows)
    /* 건별은 일자 · 적요 · 거래처 세 칸을, 일별 · 월별은 일자 · 적요 두 칸을 이월 · 계 · 합계 줄 앞에 합친다. */
    const lead = mode === '건별' ? 3 : 2
    let bal = b.carry
    return (
      <Fragment key={b.id}>
        <p className="mt-3 mb-1 font-bold">{b.code}({b.name})</p>
        <table ref={tableRef} className="ec-report w-full text-left">
          <thead>
            <tr>
              <th>{mode === '건별' ? '일자-No.' : '일자'}</th>
              <th>적요</th>
              {mode === '건별' && <th>거래처명</th>}
              <th className="text-right">{mode === '건별' ? '차변금액' : '차변'}</th>
              <th className="text-right">{mode === '건별' ? '대변금액' : '대변'}</th>
              <th className="text-right">잔액</th>
            </tr>
          </thead>
          <tbody>
            {withCarry && (
              <tr>
                <td colSpan={lead} className="text-center">이월잔액</td>
                <td className="text-right">{b.debitSide ? won(b.carry) : ''}</td>
                <td className="text-right">{b.debitSide ? '' : won(b.carry)}</td>
                <td className="text-right">{won(b.carry)}</td>
              </tr>
            )}
            {months.map((mo) => {
              const gs = groups.filter((g) => g.rows[0].date.slice(0, 7) === mo)
              const ms = sum(gs.flatMap((g) => g.rows))
              return (
                <Fragment key={mo}>
                  {gs.map((g) => {
                    const x = sum(g.rows)
                    bal += step(x)
                    const r = g.rows[0]
                    return (
                      <tr key={g.key}>
                        <td className={mode === '건별' ? 'text-ec-blue' : ''}>{mode === '건별' ? dateNo(r.date, r.no) : slash(g.key)}</td>
                        <td>{mode === '건별' ? r.text : mode === '일별' ? '일계' : '월계'}</td>
                        {mode === '건별' && <td>{r.partner}</td>}
                        <td className="text-right">{won(x.d)}</td>
                        <td className="text-right">{won(x.c)}</td>
                        <td className="text-right">{won(bal)}</td>
                      </tr>
                    )
                  })}
                  {mode !== '월별' && (
                    <tr className="ec-total">
                      <td colSpan={lead} className="text-center">{slash(mo)} 계</td>
                      <td className="text-right">{won(ms.d)}</td>
                      <td className="text-right">{won(ms.c)}</td>
                      <td className="text-right"></td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            <tr className="ec-total">
              <td colSpan={lead} className="text-center">합계</td>
              <td className="text-right">{won((b.debitSide ? b.carry : 0) + s.d)}</td>
              <td className="text-right">{won((b.debitSide ? 0 : b.carry) + s.c)}</td>
              <td className="text-right">{won(b.carry + step(s))}</td>
            </tr>
          </tbody>
        </table>
      </Fragment>
    )
  }

  /** 원본 계정별집계(2026-10-22 실측): 계정마다 한 줄 — 계정코드 · 계정명 · 이월잔액 · 차변 · 대변 · 잔액, 끝 [합계](앞 두 칸을 합침). */
  function summaryTable() {
    const rows = books.map((b) => {
      const s = b.rows.reduce((t, r) => ({ d: t.d + r.d, c: t.c + r.c }), { d: 0, c: 0 })
      return { b, d: s.d, c: s.c, bal: b.carry + (b.debitSide ? s.d - s.c : s.c - s.d) }
    })
    const tot = rows.reduce((t, x) => ({ carry: t.carry + x.b.carry, d: t.d + x.d, c: t.c + x.c, bal: t.bal + x.bal }), { carry: 0, d: 0, c: 0, bal: 0 })
    return (
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            <th>계정코드</th>
            <th>계정명</th>
            <th className="text-right">이월잔액</th>
            <th className="text-right">차변</th>
            <th className="text-right">대변</th>
            <th className="text-right">잔액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.b.id}>
              <td>{x.b.code}</td>
              <td>{x.b.name}</td>
              <td className="text-right">{won(x.b.carry)}</td>
              <td className="text-right">{won(x.d)}</td>
              <td className="text-right">{won(x.c)}</td>
              <td className="text-right">{won(x.bal)}</td>
            </tr>
          ))}
          <tr className="ec-total">
            <td colSpan={2} className="text-center">합계</td>
            <td className="text-right">{won(tot.carry)}</td>
            <td className="text-right">{won(tot.d)}</td>
            <td className="text-right">{won(tot.c)}</td>
            <td className="text-right">{won(tot.bal)}</td>
          </tr>
        </tbody>
      </table>
    )
  }

  return (
    <EcListShell
      signLine={signBox}
      title="계정별원장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-error">{error}</p>}
      <ul className="ec-cond mb-2">
        <EcCond label="구분">
          {(['건별', '일별', '월별', '계정별집계'] as Mode[]).map((v) => (
            <label key={v} className="mr-2.5 inline-flex items-center gap-[3px]">
              <input type="radio" name="al-mode" checked={mode === v} onChange={() => setMode(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-1">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-1.5">
            <EcPeriodPicks labels={SETTLE_PICKS} currentFrom={from} fiscalStart={fiscalStart ?? undefined} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} emptyLabel="전체" value={accountId} onChange={setAccountId}
                           items={accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />
        </EcCond>
        <EcCond label="기타">
          <label className="mr-2.5 inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={withCarry} onChange={(e) => setWithCarry(e.target.checked)} /> 전월이월포함
          </label>
        </EcCond>
        <EcCond label="양식구분">
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
          </label>
        </EcCond>
      </ul>

      {truncated && <p className="ec-error">전표가 많아 앞부분만 받았습니다.</p>}
      <EcReportHead title="계정별원장" period={reportPeriod(from, to)} />
      {loading ? (
        <p className="p-5 text-center text-[var(--ec-text-hint)]">불러오는 중…</p>
      ) : books.length === 0 ? (
        <p className="p-5 text-center text-[var(--ec-text-hint)]">등록된 데이터가 없습니다.</p>
      ) : mode === '계정별집계' ? summaryTable() : books.map(bookTable)}
    </EcListShell>
  )
}

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const slash = (d: string) => d.replace(/-/g, '/')
const PICKS = [...SETTLE_PICKS, '최근30일'] as const
/** 돈이 드나드는 계정 — 현금 · 당좌예금 · 보통예금. 지출결의서이체리스트와 같은 가름. */
const OUT_CODES = ['101', '102', '103']
type Side = '지출' | '입금'
/** 보고서에 해당하는 우리 전표 — 지출은 지출 · 수금·지급, 입금은 수금·지급 · 계좌입금 · 현금입금(수입) · 간편전표. */
const SOURCES: Record<Side, string[]> = { 지출: ['EXPENSE', 'SETTLEMENT'], 입금: ['SETTLEMENT', 'BANK', 'MANUAL', 'VOUCHER'] }
/** 부가세 — 지출은 부가세대급금(135, 차변), 입금은 부가세예수금(255, 대변)을 [부가세] 칸으로 뺀다. */
const VAT_CODE: Record<Side, string> = { 지출: '135', 입금: '255' }
type Unit = '라인별' | '계좌별계정별집계' | '계정별집계'
const UNITS: Unit[] = ['라인별', '계좌별계정별집계', '계정별집계']

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface BankTxn { journalEntryId: number | null; bankAccountId: number }
interface BankAccount { id: number; name: string }
interface Row { key: string; date: string; no: string; bank: string; account: string; partner: string; text: string; amount: number; vat: number }

/**
 * 회계 I &gt; 경영자료 &gt; <b>지출결의서집계</b>(E010835) — 2026-10-03 loginaa 실측(자료가 든 판, 최근30일).
 *
 * <p>조건: 구분(<b>내역</b> | 집계) — 내역이면 <b>라인별</b> · 계좌별계정별집계 · 계정별집계 — · 기준일자(구간, 기본 <b>최근30일</b>) ·
 * 회계전표No. · 거래처 · 계정 · 부서 · 프로젝트 · 출금계좌 · 적용양식 · 기타([결재방표시]) · 데이터 보기형식.
 *
 * <p>라인별: 일자-No. · 출금계좌명 · 계정명 · 거래처명 · 적요 · 금액 · 수수료 · 부가세, 달마다 [YYYY/MM 계], 끝 [합계](앞 다섯 칸 묶음).
 * 지출결의서이체리스트와 같은 전표(지출 · 수금·지급에서 현금 · 예금 대변)를 쓰고, 한 줄은 돈이 나간 상대 계정(차변 줄) 하나다.
 * 출금계좌명은 그 전표를 만든 계좌 입출금의 통장 이름(없으면 돈이 나간 계정명). 부가세대급금(135) 줄은 [부가세] 칸에 둔다.
 * 수수료는 우리 지출이 따로 들지 않아 비운다. 계좌별계정별집계 · 계정별집계 판은 원본을 못 재 출금계좌 · 계정으로 묶은 합만 찍는다.
 * [집계](○집계 판)는 아직 없고, 부서 · 프로젝트는 회계전표에 없다.
 *
 * <p><b>입금보고서집계</b>(E010836) — 같은 날 실측. 조건 · 기본값 · 열이 같고 [출금계좌] 자리만 <b>입금계좌</b>다.
 * 원본 라인별은 외상매출금 수금이 한 줄씩(입금계좌명 '기업은행-1122', 적요 '매출대금수금') 찍힌다.
 * 우리는 현금 · 예금이 차변인 전표에서 상대 대변 줄 하나가 한 줄이고, 부가세예수금(255)은 [부가세] 칸이다.
 */
export default function ExpenseSlipSummaryPage({ side = '지출' }: { side?: Side }) {
  const title = side === '지출' ? '지출결의서집계' : '입금보고서집계'
  const init = periodOf('최근30일')!
  const [unit, setUnit] = useState<Unit>('라인별')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [partner, setPartner] = useState('')
  const [account, setAccount] = useState('')
  const [outAccount, setOutAccount] = useState('')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [bankOf, setBankOf] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [j, t, a] = await Promise.all([
        api.get<JournalList>('/journals', { params: { from, to, all: true } }),
        api.get<{ rows: BankTxn[] }>('/bank-cards/transactions', { params: { all: true, from, to } }).catch(() => ({ data: { rows: [] as BankTxn[] } })),
        api.get<BankAccount[]>('/bank-cards/accounts').catch(() => ({ data: [] as BankAccount[] })),
      ])
      const names = new Map(a.data.map((b) => [b.id, b.name]))
      setBankOf(new Map(t.data.rows.filter((x) => x.journalEntryId != null).map((x) => [x.journalEntryId!, names.get(x.bankAccountId) ?? ''])))
      setEntries(j.data.rows)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const lines = useMemo(() => {
    const out: Row[] = []
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      if (!SOURCES[side].includes(e.sourceType)) continue
      const amt = (l: { debit: number | string; credit: number | string }) => Number(side === '지출' ? l.debit : l.credit)
      const outLine = e.lines.find((l) => OUT_CODES.includes(l.accountCode) && Number(side === '지출' ? l.credit : l.debit) > 0)
      if (!outLine) continue
      if (docNo && !e.docNo.includes(docNo)) continue
      if (partner && (e.partnerName ?? '') !== partner) continue
      const bank = bankOf.get(e.id) || outLine.accountName
      if (outAccount && bank !== outAccount) continue
      const vat = e.lines.filter((l) => l.accountCode === VAT_CODE[side]).reduce((s, l) => s + amt(l), 0)
      const debits = e.lines.filter((l) => amt(l) > 0 && !OUT_CODES.includes(l.accountCode) && l.accountCode !== VAT_CODE[side])
      debits.forEach((l, i) => {
        if (account && l.accountName !== account) return
        out.push({ key: `${e.id}-${l.id}`, date: e.entryDate, no: e.docNo, bank, account: l.accountName, partner: e.partnerName ?? '',
          text: l.description ?? e.description ?? '', amount: amt(l), vat: i === 0 ? vat : 0 })
      })
    }
    return out
  }, [entries, bankOf, docNo, partner, account, outAccount, side])

  const groups = useMemo(() => {
    if (unit === '라인별') return []
    const m = new Map<string, { bank: string; account: string; amount: number; vat: number }>()
    for (const r of lines) {
      const k = unit === '계정별집계' ? r.account : `${r.bank}␟${r.account}`
      if (!m.has(k)) m.set(k, { bank: r.bank, account: r.account, amount: 0, vat: 0 })
      const g = m.get(k)!
      g.amount += r.amount; g.vat += r.vat
    }
    return [...m.values()].sort((a, b) => a.bank.localeCompare(b.bank, 'ko') || a.account.localeCompare(b.account, 'ko'))
  }, [lines, unit])

  const months = [...new Set(lines.map((r) => r.date.slice(0, 7)))]
  const sum = (rs: { amount: number; vat: number }[]) => rs.reduce((s, r) => ({ amount: s.amount + r.amount, vat: s.vat + r.vat }), { amount: 0, vat: 0 })
  const tot = sum(lines)
  const partners = useMemo(() => [...new Set(entries.map((e) => e.partnerName).filter(Boolean) as string[])].sort(), [entries])
  const accounts = useMemo(() => [...new Set(entries.flatMap((e) => e.lines.map((l) => l.accountName)))].sort(), [entries])
  const banks = useMemo(() => [...new Set([...bankOf.values()].filter(Boolean))].sort(), [bankOf])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [lines.length, unit])

  const lead = unit === '라인별' ? 5 : unit === '계좌별계정별집계' ? 2 : 1
  const cols = lead + 3

  return (
    <EcListShell
      title={side === '지출' ? '지출결의서집계' : '입금보고서집계'}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setUnit('라인별'); setFrom(init.from); setTo(init.to); setDocNo(''); setPartner(''); setAccount(''); setOutAccount('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-error">{error}</p>}
      <ul className="ec-cond mb-2">
        <EcCond label="구분">
          <label className="mr-2.5 inline-flex items-center gap-[3px]"><input type="radio" name="es-kind" checked readOnly /> 내역</label>
          <label className="mr-4 inline-flex items-center gap-[3px] text-[var(--ec-text-hint)]" title="원본의 ○집계 판 — 아직 만들지 않았다">
            <input type="radio" name="es-kind" disabled /> 집계
          </label>
          {UNITS.map((v) => (
            <label key={v} className="mr-2.5 inline-flex items-center gap-[3px]">
              <input type="radio" name="es-unit" checked={unit === v} onChange={() => setUnit(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-1">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-1.5">
            <EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input w-[180px]" value={docNo} onChange={(e) => setDocNo(e.target.value)} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners.map((p) => ({ value: p, name: p }))} />
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={200} emptyLabel="전체" value={account} onChange={setAccount} items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        {side === '지출' ? (
        <EcCond label="출금계좌">
          <select className="ec-input w-[180px]" value={outAccount} onChange={(e) => setOutAccount(e.target.value)}>
            <option value="">전체</option>
            {banks.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </EcCond>
        ) : (
        <EcCond label="입금계좌">
          <select className="ec-input w-[180px]" value={outAccount} onChange={(e) => setOutAccount(e.target.value)}>
            <option value="">전체</option>
            {banks.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </EcCond>
        )}
      </ul>

      <EcReportHead title={side === '지출' ? '지출결의서집계' : '입금보고서집계'} period={reportPeriod(from, to)} />
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            {unit === '라인별' && <th>일자-No.</th>}
            {unit !== '계정별집계' && side === '지출' && <th>출금계좌명</th>}
            {unit !== '계정별집계' && side === '입금' && <th>입금계좌명</th>}
            <th>계정명</th>
            {unit === '라인별' && <th>거래처명</th>}
            {unit === '라인별' && <th>적요</th>}
            <th className="text-right">금액</th>
            <th className="text-right">수수료</th>
            <th className="text-right">부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols} className="p-5 text-center text-[var(--ec-text-hint)]">불러오는 중…</td></tr>
          ) : lines.length === 0 ? (
            <tr><td colSpan={cols} className="p-5 text-center text-[var(--ec-text-hint)]">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {unit === '라인별' ? months.map((mo) => {
                const ms = lines.filter((r) => r.date.slice(0, 7) === mo)
                const s = sum(ms)
                return (
                  <Fragment key={mo}>
                    {ms.map((r) => (
                      <tr key={r.key}>
                        <td className="text-[var(--ec-navy)]">{slash(r.date)} -{r.no}</td>
                        <td>{r.bank}</td>
                        <td>{r.account}</td>
                        <td>{r.partner}</td>
                        <td>{r.text}</td>
                        <td className="text-right">{won(r.amount)}</td>
                        <td className="text-right"></td>
                        <td className="text-right">{won(r.vat)}</td>
                      </tr>
                    ))}
                    <tr className="ec-total">
                      <td colSpan={lead} className="text-center">{slash(mo)}  계</td>
                      <td className="text-right">{won(s.amount)}</td>
                      <td className="text-right"></td>
                      <td className="text-right">{won(s.vat)}</td>
                    </tr>
                  </Fragment>
                )
              }) : groups.map((g) => (
                <tr key={`${g.bank}${g.account}`}>
                  {unit === '계좌별계정별집계' && <td>{g.bank}</td>}
                  <td>{g.account}</td>
                  <td className="text-right">{won(g.amount)}</td>
                  <td className="text-right"></td>
                  <td className="text-right">{won(g.vat)}</td>
                </tr>
              ))}
              <tr className="ec-total">
                <td colSpan={lead} className="text-center">합계</td>
                <td className="text-right">{won(tot.amount)}</td>
                <td className="text-right"></td>
                <td className="text-right">{won(tot.vat)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

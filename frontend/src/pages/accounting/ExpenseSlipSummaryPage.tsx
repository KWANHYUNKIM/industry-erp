import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, reportPeriod } from '../../components/EcReportFrame'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const slash = (d: string) => d.replace(/-/g, '/')
/** 원본 [일자-No.]는 '2026/09/28 -9' — 우리 전표번호 'GL-20260714-0009' 의 끝 일련번호만 붙인다(판매조회와 같은 방식). */
const seqOf = (no: string) => { const s = no.split('-').pop() ?? ''; return Number(s) || s }
const PICKS = [...SETTLE_PICKS, '최근30일'] as const
type Side = '지출' | '입금' | '가지급금'
/** FastEntry 간편전표의 종류 — 이 보고서들은 회계 I &gt; FastEntry 에서 쓴 전표를 줄마다 모은다. */
const TYPE: Record<Side, string> = { 지출: 'EXPENSE_REPORT', 입금: 'DEPOSIT_REPORT', 가지급금: 'ADVANCE_SETTLEMENT' }
const TITLE: Record<Side, string> = { 지출: '지출결의서집계', 입금: '입금보고서집계', 가지급금: '가지급금정산서집계' }
type Unit = '라인별' | '계좌별계정별집계' | '대상자별계정별집계' | '계정별집계'

interface VoucherLine { id: number; accountName: string; amount: number; description: string | null }
interface Voucher {
  id: number; voucherNo: string; voucherDate: string; methodName: string; bankAccountName: string | null
  partnerName: string | null; journalDocNo: string | null; description: string | null; lines: VoucherLine[]
}
interface VoucherList { rows: Voucher[]; totalRows: number; truncated: boolean }
interface Row { key: string; date: string; no: string; bank: string; account: string; partner: string; text: string; amount: number; vat: number }

/**
 * 회계 I &gt; 경영자료 &gt; <b>지출결의서집계</b>(E010835) · <b>입금보고서집계</b>(E010836) · <b>가지급금정산서집계</b>(E010840)
 * — 2026-10-03 loginaa 실측. 셋 다 회계 I &gt; FastEntry 의 같은 이름 전표를 줄마다 모은 판이다.
 *
 * <p>조건: 구분(<b>내역</b> | 집계) — 내역이면 <b>라인별</b> · 계좌별계정별집계(가지급금은 대상자별계정별집계) · 계정별집계 — ·
 * 기준일자(구간, 기본 <b>최근30일</b>) · 회계전표No. · 거래처 · 계정 · 부서 · 프로젝트 · 출금계좌(입금은 입금계좌, 가지급금은 사원) ·
 * 적용양식 · 기타([결재방표시]) · 데이터 보기형식.
 *
 * <p>라인별: 일자-No. · 출금계좌명(입금계좌명 · 사원명) · 계정명 · 거래처명 · 적요 · 금액 · 수수료 · 부가세, 달마다 [YYYY/MM 계],
 * 끝 [합계](앞 다섯 칸 묶음). 한 줄은 간편전표(/vouchers?type=…)의 내역 한 줄이다. 계좌명은 그 전표의 계좌(없으면 결제수단 이름).
 * 간편전표에는 수수료 · 부가세 · 사원이 없어 그 칸은 비운다 — 사원명이 비므로 가지급금의 [사원] 조건도 두지 않는다.
 * 계좌별계정별집계 · 계정별집계 판은 원본을 못 재 계좌 · 계정으로 묶은 합만 찍는다.
 * [집계](○집계 판)는 아직 없고, 부서 · 프로젝트는 간편전표에 없다.
 */
export default function ExpenseSlipSummaryPage({ side = '지출' }: { side?: Side }) {
  const title = TITLE[side]
  const UNITS: Unit[] = ['라인별', side === '가지급금' ? '대상자별계정별집계' : '계좌별계정별집계', '계정별집계']
  const init = periodOf('최근30일')!
  const [unit, setUnit] = useState<Unit>('라인별')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [partner, setPartner] = useState('')
  const [account, setAccount] = useState('')
  const [outAccount, setOutAccount] = useState('')
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<VoucherList>('/vouchers', { params: { type: TYPE[side], from, to, all: true } })
      setVouchers(r.data.rows)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, side])

  const bankOf = (v: Voucher) => (side === '가지급금' ? '' : v.bankAccountName || v.methodName)
  const lines = useMemo(() => {
    const out: Row[] = []
    const sorted = [...vouchers].sort((a, b) => (a.voucherDate < b.voucherDate ? -1 : a.voucherDate > b.voucherDate ? 1 : a.voucherNo.localeCompare(b.voucherNo)))
    for (const v of sorted) {
      const no = v.journalDocNo ?? v.voucherNo
      if (docNo && !no.includes(docNo)) continue
      if (partner && (v.partnerName ?? '') !== partner) continue
      const bank = bankOf(v)
      if (outAccount && bank !== outAccount) continue
      for (const l of v.lines) {
        if (account && l.accountName !== account) continue
        out.push({ key: `${v.id}-${l.id}`, date: v.voucherDate, no, bank, account: l.accountName, partner: v.partnerName ?? '',
          text: l.description ?? v.description ?? '', amount: Number(l.amount), vat: 0 })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vouchers, docNo, partner, account, outAccount, side])

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
  const partners = useMemo(() => [...new Set(vouchers.map((v) => v.partnerName).filter(Boolean) as string[])].sort(), [vouchers])
  const accounts = useMemo(() => [...new Set(vouchers.flatMap((v) => v.lines.map((l) => l.accountName)))].sort(), [vouchers])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const banks = useMemo(() => [...new Set(vouchers.map(bankOf).filter(Boolean))].sort(), [vouchers, side])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [lines.length, unit])

  const lead = unit === '라인별' ? 5 : unit === '계정별집계' ? 1 : 2
  const cols = lead + 3

  return (
    <EcListShell
      title={TITLE[side]}
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
        ) : side === '입금' ? (
        <EcCond label="입금계좌">
          <select className="ec-input w-[180px]" value={outAccount} onChange={(e) => setOutAccount(e.target.value)}>
            <option value="">전체</option>
            {banks.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </EcCond>
        ) : null}
      </ul>

      <EcReportHead title={TITLE[side]} period={reportPeriod(from, to)} />
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            {unit === '라인별' && <th>일자-No.</th>}
            {unit !== '계정별집계' && side === '지출' && <th>출금계좌명</th>}
            {unit !== '계정별집계' && side === '입금' && <th>입금계좌명</th>}
            {unit !== '계정별집계' && side === '가지급금' && <th>사원명</th>}
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
                        <td className="text-[var(--ec-navy)]">{slash(r.date)} -{seqOf(r.no)}</td>
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
                  {unit !== '계정별집계' && <td>{g.bank}</td>}
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

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { bankLabel } from '../../utils/bankLabel'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, reportPeriod } from '../../components/EcReportFrame'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

interface BankAccount { id: number; code: string; name: string | null; bankName: string; accountNo: string; glAccountName: string | null; active: boolean }
interface BankTxn { id: number; txnDate: string; bankAccountId: number; deposit: boolean; amount: number }
interface BankTxnList { rows: BankTxn[] }
/** 원본 [종류] 코드도움에서 기본으로 잡힌 보고서. 다른 종류는 원본 판에서 못 쟀다. */
const KINDS = ['통장잔액비교표'] as const

/**
 * 회계 I &gt; 경영자료 &gt; <b>경영요약보고서</b>(E010821) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 조회일자(구간, 기본 <b>금일</b>, 빠른선택 금일 … 전월 · 이번기수 · 직전기수 · 종료일) · 종류(코드도움, 기본 <b>통장잔액비교표</b>) ·
 * 기타([결재방표시]). 표는 '1. 통장잔액비교표' — 계정명 · 계좌명 · 이월잔액[외화] · 증가[외화] · 감소[외화] · 금일잔액[외화] ·
 * 실제통장잔액[외화] · 차이[외화] · 연결여부, 끝 [합계](두 칸 묶음). 통장마다 한 줄.
 *
 * <p>우리 통장(BankAccount)과 계좌 입출금(BankTransaction)으로 셈한다 — 이월은 기간 앞 입금 − 출금, 증가 · 감소는 기간 안 입금 · 출금.
 * 실제통장잔액 · 차이는 은행과 연결(원본 '연결여부')해 받아 오는 값이라 우리는 비우고 연결여부는 늘 No(원본 판도 No · 빈칸이었다).
 * 외화는 원화만. [종류]의 다른 보고서는 원본에서 못 쟀다.
 * 이 화면은 인라인 style · 색 값을 쓰지 않는다(style-check 래칫, 새 파일 기준 0).
 */
export default function ManagementSummaryPage() {
  const init = periodOf('금일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [kind, setKind] = useState<string>(KINDS[0])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [txns, setTxns] = useState<BankTxn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [a, t] = await Promise.all([
        api.get<BankAccount[]>('/bank-cards/accounts'),
        api.get<BankTxnList>('/bank-cards/transactions', { params: { all: true, to } }),
      ])
      setAccounts(a.data)
      setTxns(t.data.rows)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const rows = useMemo(() => accounts.map((a) => {
    let carry = 0, inc = 0, dec = 0
    for (const t of txns) {
      if (t.bankAccountId !== a.id || t.txnDate > to) continue
      const v = Number(t.amount)
      if (t.txnDate < from) carry += t.deposit ? v : -v
      else if (t.deposit) inc += v
      else dec += v
    }
    return { a, carry, inc, dec, bal: carry + inc - dec }
  }).filter((r) => r.a.active || r.carry || r.inc || r.dec), [accounts, txns, from, to])
  const tot = rows.reduce((s, r) => ({ carry: s.carry + r.carry, inc: s.inc + r.inc, dec: s.dec + r.dec, bal: s.bal + r.bal }), { carry: 0, inc: 0, dec: 0, bal: 0 })

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '경영요약보고서', [rows.length])

  return (
    <EcListShell
      title="경영요약보고서"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setKind(KINDS[0]) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-error">{error}</p>}
      <ul className="ec-cond mb-2">
        <EcCond label="조회일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-1">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-1.5">
            <EcPeriodPicks labels={SETTLE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="종류">
          <select className="ec-input w-[180px]" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
      </ul>

      <EcReportHead title="경영요약보고서" period={reportPeriod(from, to)} />
      <div className="mb-1 font-bold">1. {kind}</div>
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            <th>계정명</th>
            <th>계좌명</th>
            <th className="text-right">이월잔액[외화]</th>
            <th className="text-right">증가[외화]</th>
            <th className="text-right">감소[외화]</th>
            <th className="text-right">금일잔액[외화]</th>
            <th className="text-right">실제통장잔액[외화]</th>
            <th className="text-right">차이[외화]</th>
            <th className="text-center">연결여부</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="p-5 text-center text-[var(--ec-text-hint)]">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={9} className="p-5 text-center text-[var(--ec-text-hint)]">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {rows.map((r) => (
                <tr key={r.a.id}>
                  <td>{r.a.glAccountName ?? ''}</td>
                  <td>{bankLabel(r.a)}</td>
                  <td className="text-right">{won(r.carry)}</td>
                  <td className="text-right">{won(r.inc)}</td>
                  <td className="text-right">{won(r.dec)}</td>
                  <td className="text-right">{won(r.bal)}</td>
                  <td className="text-right"></td>
                  <td className="text-right"></td>
                  <td className="text-center">No</td>
                </tr>
              ))}
              <tr className="ec-total">
                <td colSpan={2} className="text-center">합계</td>
                <td className="text-right">{won(tot.carry)}</td>
                <td className="text-right">{won(tot.inc)}</td>
                <td className="text-right">{won(tot.dec)}</td>
                <td className="text-right">{won(tot.bal)}</td>
                <td className="text-right"></td>
                <td className="text-right"></td>
                <td></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

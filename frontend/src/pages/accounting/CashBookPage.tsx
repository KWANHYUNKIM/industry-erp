import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import type { AccountLedger, LedgerRow } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

interface AccountOpt { id: number; code: string; name: string }
/** 현금 계정과 [예금포함]으로 더하는 예금 계정(StandardAccounts — 101 현금 · 102 당좌예금 · 103 보통예금). */
const CASH = '101'
const DEPOSITS = ['102', '103']

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>현금출납장</b>(E010801) — 2026-10-03 loginaa 실측(빈 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일</b>, 빠른선택 금일 … 전월 · 이번기수 · 직전기수 · 종료일 · 최근30일) · 부서 · 프로젝트 ·
 * 기타([예금포함], 기본 꺼짐). 열: 일자-No. · 상대계정명 · 상대거래처명 · 적요 · 차변금액 · 대변금액 · 잔액.
 *
 * <p>현금(101) 계정의 원장이다. [예금포함]을 켜면 당좌 · 보통예금까지 한 장부로 합쳐 날짜 차례로 잔액을 다시 쌓는다.
 * 상대계정명은 같은 전표의 다른 줄 계정(둘 이상이면 '첫 계정 외 n'), 상대거래처명은 전표의 거래처다.
 * 잔액은 기간 첫날부터 쌓는다(계정별원장과 같다 — 전기이월 줄은 원본 판이 비어 모양을 못 쟀다).
 * 부서 · 프로젝트는 회계전표가 들지 않는다.
 */
export default function CashBookPage() {
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [withDeposit, setWithDeposit] = useState(false)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [ledgers, setLedgers] = useState<AccountLedger[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  }, [])

  async function load() {
    const codes = withDeposit ? [CASH, ...DEPOSITS] : [CASH]
    const ids = accounts.filter((a) => codes.includes(a.code)).map((a) => a.id)
    if (ids.length === 0) { setLedgers([]); setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const rs = await Promise.all(ids.map((accountId) => api.get<AccountLedger>('/journals/ledger', { params: { accountId, from, to } })))
      setLedgers(rs.map((r) => r.data))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (accounts.length) void load() }, [accounts, from, to, withDeposit])

  /* 여러 계정을 합칠 때는 날짜 · 전표번호 차례로 다시 늘어놓고 잔액(차변 − 대변)을 새로 쌓는다. */
  const rows = useMemo(() => {
    const all: LedgerRow[] = ledgers.flatMap((l) => l.rows)
    all.sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    let bal = 0
    return all.map((r, i) => {
      bal += Number(r.debit) - Number(r.credit)
      return { key: `${r.docNo}-${i}`, r, bal }
    })
  }, [ledgers])
  const totalDebit = rows.reduce((s, x) => s + Number(x.r.debit), 0)
  const totalCredit = rows.reduce((s, x) => s + Number(x.r.credit), 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '현금출납장', [rows.length])

  return (
    <EcListShell
      title="현금출납장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setWithDeposit(false) } },
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
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="기타">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={withDeposit} onChange={(e) => setWithDeposit(e.target.checked)} /> 예금포함
          </label>
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>일자-No.</th>
            <th>상대계정명</th>
            <th>상대거래처명</th>
            <th>적요</th>
            <th style={{ textAlign: 'right' }}>차변금액</th>
            <th style={{ textAlign: 'right' }}>대변금액</th>
            <th style={{ textAlign: 'right' }}>잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : rows.map(({ key, r, bal }) => (
            <tr key={key}>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(r.entryDate)} {r.docNo}</td>
              <td>{r.counterAccountName ?? ''}</td>
              <td>{r.partnerName ?? ''}</td>
              <td>{r.description ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{won(Number(r.debit))}</td>
              <td style={{ textAlign: 'right' }}>{won(Number(r.credit))}</td>
              <td style={{ textAlign: 'right' }}>{Math.round(bal).toLocaleString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'rgb(243, 243, 243)' }}>
              <td colSpan={4}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(totalDebit)}</td>
              <td style={{ textAlign: 'right' }}>{won(totalCredit)}</td>
              <td style={{ textAlign: 'right' }}>{Math.round(totalDebit - totalCredit).toLocaleString('ko-KR')}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

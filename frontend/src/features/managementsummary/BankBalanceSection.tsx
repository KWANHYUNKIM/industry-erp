import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { bankLabel } from '../../utils/bankLabel'
import { SUB_ROW, SectionHead, useCount, type SectionProps } from './shared'
import { fmtAmountBlank } from '../../utils/format'

interface BankAccount { id: number; code: string; name: string | null; bankName: string; accountNo: string; glAccountName: string | null; active: boolean }
interface BankTxn { id: number; txnDate: string; bankAccountId: number; deposit: boolean; amount: number }

/**
 * 경영요약보고서 › <b>통장잔액비교표</b>(회계 I 자금) — 계정명 · 계좌명 · 이월잔액[외화] · 증가[외화] · 감소[외화] · 금일잔액[외화] · 실제통장잔액[외화] · 차이[외화] · 연결여부, 끝 [합계](두 칸 묶음).
 * 통장마다 한 줄. 이월은 기간 앞 입금 − 출금. 실제통장잔액 · 차이는 은행 연결 값이라 비우고 연결여부는 늘 No(원본 판도 No · 빈칸). 외화는 원화만.
 */
export default function BankBalanceSection({ from, to, startNo, onCount }: SectionProps) {
  const [data, setData] = useState<{ a: BankAccount[]; t: BankTxn[] } | null>(null)
  useEffect(() => {
    Promise.all([
      api.get<BankAccount[]>('/bank-cards/accounts'),
      api.get<{ rows: BankTxn[] }>('/bank-cards/transactions', { params: { all: true, to } }),
    ]).then(([a, t]) => setData({ a: a.data, t: t.data.rows })).catch(() => setData({ a: [], t: [] }))
  }, [to])
  const rows = useMemo(() => (data?.a ?? []).map((a) => {
    let carry = 0, inc = 0, dec = 0
    for (const t of data?.t ?? []) {
      if (t.bankAccountId !== a.id || t.txnDate > to) continue
      const v = Number(t.amount)
      if (t.txnDate < from) carry += t.deposit ? v : -v
      else if (t.deposit) inc += v
      else dec += v
    }
    return { a, carry, inc, dec, bal: carry + inc - dec }
  }).filter((r) => r.a.active || r.carry || r.inc || r.dec), [data, from, to])
  useCount(onCount, rows.length > 0 ? 1 : 0, data !== null)
  if (rows.length === 0) return null
  const tot = rows.reduce((s, r) => ({ carry: s.carry + r.carry, inc: s.inc + r.inc, dec: s.dec + r.dec, bal: s.bal + r.bal }), { carry: 0, inc: 0, dec: 0, bal: 0 })
  return (
    <>
      <SectionHead no={startNo} title="통장잔액비교표" from={from} to={to} />
      <table className="ec-report w-full text-left">
        <thead>
          <tr>
            <th>계정명</th><th>계좌명</th><th className="text-right">이월잔액[외화]</th><th className="text-right">증가[외화]</th><th className="text-right">감소[외화]</th>
            <th className="text-right">금일잔액[외화]</th><th className="text-right">실제통장잔액[외화]</th><th className="text-right">차이[외화]</th><th className="text-center">연결여부</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.a.id}>
              <td>{r.a.glAccountName ?? ''}</td><td>{bankLabel(r.a)}</td>
              <td className="text-right">{fmtAmountBlank(r.carry)}</td><td className="text-right">{fmtAmountBlank(r.inc)}</td><td className="text-right">{fmtAmountBlank(r.dec)}</td><td className="text-right">{fmtAmountBlank(r.bal)}</td>
              <td className="text-right"></td><td className="text-right"></td><td className="text-center">No</td>
            </tr>
          ))}
          <tr className={SUB_ROW}>
            <td colSpan={2} className="text-center">합계</td>
            <td className="text-right">{fmtAmountBlank(tot.carry)}</td><td className="text-right">{fmtAmountBlank(tot.inc)}</td><td className="text-right">{fmtAmountBlank(tot.dec)}</td><td className="text-right">{fmtAmountBlank(tot.bal)}</td>
            <td className="text-right"></td><td className="text-right"></td><td></td>
          </tr>
        </tbody>
      </table>
    </>
  )
}

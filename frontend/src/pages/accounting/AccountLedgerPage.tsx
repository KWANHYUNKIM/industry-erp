import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { AccountLedger } from '../../api/types'
import { INQUIRY_FULL_PICKS, ymd } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'

interface AccountOpt { id: number; code: string; name: string }

const won = (n: number) => n.toLocaleString('ko-KR')
const firstOfYear = () => `${new Date().getFullYear()}-01-01`
const today = () => ymd(new Date())

/**
 * 회계 > 계정별원장 — 한 계정의 기간 내 분개 이력과 누적 잔액.
 *
 * 조건이 날짜 칸 두 개짜리 한 줄이었다. 원본 현황 화면들은 전부 같은 모양의 조건 판을 쓰고
 * 기간 빠른선택([금월(~오늘)][전월] …)이 붙어 있다 — 원장은 "지난달 것"을 보는 일이 잦아
 * 빠른선택이 없으면 매번 날짜를 두 번 고쳐야 한다. 실측한 EcStatusPanel 로 맞춘다.
 */
export default function AccountLedgerPage() {
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [from, setFrom] = useState(firstOfYear())
  const [to, setTo] = useState(today())
  const [data, setData] = useState<AccountLedger | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts')
      .then((r) => {
        setAccounts(r.data)
        if (r.data.length && accountId === null) setAccountId(r.data[0].id)
      })
      .catch((err) => setError(extractErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function load() {
    if (accountId === null) return
    setError('')
    api.get<AccountLedger>('/journals/ledger', { params: { accountId, from, to } })
      .then((r) => setData(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }

  useEffect(() => {
    if (accountId !== null) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  const reset = () => { setFrom(firstOfYear()); setTo(today()) }

  return (
    <EcListShell
      title="계정별원장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_FULL_PICKS}
        dateLabel="기간"
      >
        <EcCond label="계정" pick>
          <select className="ec-input" value={accountId ?? ''}
                  onChange={(e) => setAccountId(Number(e.target.value))} style={{ width: 260 }}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {data && (
        <>
          <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            {data.accountCode} {data.accountName}
            <span style={{ marginLeft: 12, fontWeight: 400, color: '#5a626e' }}>
              차변합 {won(data.totalDebit)} · 대변합 {won(data.totalCredit)} · 마감잔액 <b style={{ color: '#1a4d8f' }}>{won(data.closingBalance)}</b>
            </span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>일자</th><th>전표번호</th><th>적요</th><th>거래처</th>
                <th style={{ textAlign: 'right' }}>차변</th><th style={{ textAlign: 'right' }}>대변</th><th style={{ textAlign: 'right' }}>잔액</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>해당 기간 거래가 없습니다.</td></tr>
              ) : data.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.entryDate}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
                  <td>{r.description}</td>
                  <td>{r.partnerName ?? ''}</td>
                  <td style={{ textAlign: 'right', color: r.debit > 0 ? '#1a4d8f' : '#c9ced6' }}>{r.debit > 0 ? won(r.debit) : '-'}</td>
                  <td style={{ textAlign: 'right', color: r.credit > 0 ? '#a5561b' : '#c9ced6' }}>{r.credit > 0 ? won(r.credit) : '-'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </EcListShell>
  )
}

import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel from '../../components/EcStatusPanel'
import { INQUIRY_FULL_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { TrialBalance } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => n.toLocaleString('ko-KR')
const firstOfYear = () => `${new Date().getFullYear()}-01-01`
const today = () => ymd(new Date())

const DIV_NAME: Record<string, string> = {
  ASSET: '자산', LIABILITY: '부채', EQUITY: '자본', REVENUE: '수익', EXPENSE: '비용',
}

/** 합계잔액시산표 — 전 계정의 차변합·대변합. 총 차변합 = 총 대변합이면 장부가 맞다. */
export default function TrialBalancePage() {
  const [from, setFrom] = useState(firstOfYear())
  const [to, setTo] = useState(today())
  const [data, setData] = useState<TrialBalance | null>(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    api.get<TrialBalance>('/journals/trial-balance', { params: { from, to } })
      .then((r) => setData(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = () => { setFrom(firstOfYear()); setTo(today()) }

  return (
    <EcListShell
      title="합계잔액시산표"
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
      />

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {data && (
        <>
          <div style={{ marginBottom: 8, padding: '8px 12px', fontSize: 12.5, borderRadius: 3, background: data.balanced ? '#f4faf5' : '#fdecec', color: data.balanced ? '#1c6b32' : '#c60a2e' }}>
            {data.balanced
              ? `대차평형 ✓  총 차변합 ${won(data.totalDebit)} = 총 대변합 ${won(data.totalCredit)}`
              : `대차불일치 ✗  차변합 ${won(data.totalDebit)} ≠ 대변합 ${won(data.totalCredit)}`}
          </div>
          <table className="w-full text-left" style={{ maxWidth: 820 }}>
            <thead>
              <tr>
                <th>계정코드</th><th>계정과목</th><th>구분</th>
                <th style={{ textAlign: 'right' }}>차변합</th><th style={{ textAlign: 'right' }}>대변합</th><th style={{ textAlign: 'right' }}>잔액</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>해당 기간 회계전표가 없습니다.</td></tr>
              ) : data.rows.map((r) => (
                <tr key={r.accountId}>
                  <td style={{ fontFamily: 'monospace' }}>{r.accountCode}</td>
                  <td>{r.accountName}</td>
                  <td style={{ color: '#8a929c', fontSize: 11.5 }}>{DIV_NAME[r.division]}</td>
                  <td style={{ textAlign: 'right' }}>{won(r.debit)}</td>
                  <td style={{ textAlign: 'right' }}>{won(r.credit)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
                <td style={{ textAlign: 'right' }}>{won(data.totalDebit)}</td>
                <td style={{ textAlign: 'right' }}>{won(data.totalCredit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </EcListShell>
  )
}

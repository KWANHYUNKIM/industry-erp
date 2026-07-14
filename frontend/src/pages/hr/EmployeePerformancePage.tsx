import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { PerformanceSummary } from '../../api/types'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => today().slice(0, 8) + '01'

/**
 * 담당자별 실적 — 전표에 붙은 담당 사원으로 판매·구매를 집계한다.
 * 입력 계정이 아니라 담당자로 센다. 담당자가 없는 전표는 '미지정'으로 따로 보여준다.
 */
export default function EmployeePerformancePage() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [summary, setSummary] = useState<PerformanceSummary | null>(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    api.get<PerformanceSummary>('/employees/performance', { params: { from, to } })
      .then((r) => setSummary(r.data))
      .catch((e) => { setSummary(null); setError(extractErrorMessage(e)) })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const rows = summary?.rows ?? []

  return (
    <EcListShell title="담당자별 실적" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
        <span style={{ color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>
          전표의 <b>담당 사원</b> 기준입니다(전표를 입력한 계정이 아닙니다). 담당자를 지정하지 않은 전표는 '미지정'으로 모입니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {summary && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Tile label="총 매출" value={won(summary.totalSales)} strong />
          <Tile label="총 매입" value={won(summary.totalPurchase)} />
          <Tile label="담당자 수" value={`${rows.filter((r) => r.employeeId !== null).length}명`} />
        </div>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 90 }}>사번</th><th style={{ width: 110 }}>담당자</th><th style={{ width: 110 }}>부서</th>
            <th style={{ width: 70, textAlign: 'right' }}>판매건</th>
            <th style={{ textAlign: 'right' }}>매출액</th>
            <th style={{ width: 160 }}>비중</th>
            <th style={{ width: 70, textAlign: 'right' }}>구매건</th>
            <th style={{ textAlign: 'right' }}>매입액</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              해당 기간에 전표가 없습니다.
            </td></tr>
          ) : rows.map((r, i) => {
            const unassigned = r.employeeId === null
            return (
              <tr key={r.employeeId ?? 'none'} style={{ background: unassigned ? '#fafbfc' : undefined }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{unassigned ? '' : i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{r.employeeCode}</td>
                <td style={{ fontWeight: unassigned ? 400 : 700, color: unassigned ? '#8a929c' : undefined }}>
                  {r.employeeName}
                </td>
                <td>{r.department ?? ''}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.salesCount}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.salesAmount)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, height: 8, background: '#eef1f4', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(r.salesShare, 100)}%`, height: '100%',
                        background: unassigned ? '#c9d1da' : 'var(--ec-blue)',
                      }} />
                    </div>
                    <span style={{ fontSize: 11.5, width: 44, textAlign: 'right', color: '#5a626e' }}>{r.salesShare}%</span>
                  </div>
                </td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.purchaseCount}</td>
                <td style={{ textAlign: 'right' }}>{won(r.purchaseAmount)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', borderRadius: 3, padding: '8px 10px', background: strong ? '#eef5ff' : '#fff' }}>
      <div style={{ fontSize: 11.5, color: '#8a929c' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: strong ? 'var(--ec-blue-dark)' : '#2b3440' }}>{value}</div>
    </div>
  )
}

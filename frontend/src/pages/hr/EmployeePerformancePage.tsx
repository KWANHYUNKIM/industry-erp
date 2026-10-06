import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { PerformanceSummary } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const today = () => ymd(new Date())
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
      <div className="flex items-center gap-[6px] mb-[8px]">
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
        <span className="text-ec-hint">~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        <span className="ml-[8px] text-[12px] text-ec-hint">
          전표의 <b>담당 사원</b> 기준입니다(전표를 입력한 계정이 아닙니다). 담당자를 지정하지 않은 전표는 '미지정'으로 모입니다.
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {summary && (
        <div className="flex gap-[8px] mb-[10px]">
          <Tile label="총 매출" value={won(summary.totalSales)} strong />
          <Tile label="총 매입" value={won(summary.totalPurchase)} />
          <Tile label="담당자 수" value={`${rows.filter((r) => r.employeeId !== null).length}명`} />
        </div>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[90px]">사번</th><th className="w-[110px]">담당자</th><th className="w-[110px]">부서</th>
            <th className="w-[70px] text-right">판매건</th>
            <th className="text-right">매출액</th>
            <th className="text-right w-[160px]">비중</th>
            <th className="w-[70px] text-right">구매건</th>
            <th className="text-right">매입액</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="text-center text-ec-hint p-[20px]">
              해당 기간에 전표가 없습니다.
            </td></tr>
          ) : rows.map((r, i) => {
            const unassigned = r.employeeId === null
            return (
              <tr key={r.employeeId ?? 'none'} style={{ background: unassigned ? 'var(--ec-bg-page)' : undefined }}>
                <td className="text-center text-ec-hint">{unassigned ? '' : i + 1}</td>
                <td className="text-ec-hint">{r.employeeCode}</td>
                <td style={{ fontWeight: unassigned ? 400 : 700, color: unassigned ? 'var(--ec-text-hint)' : undefined }}>
                  {r.employeeName}
                </td>
                <td>{r.department ?? ''}</td>
                <td className="text-right text-ec-hint">{r.salesCount}</td>
                <td className="text-right font-bold">{won(r.salesAmount)}</td>
                <td>
                  <div className="flex items-center gap-[6px]">
                    <div style={{ flex: 1, height: 8, background: '#eef1f4', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(r.salesShare, 100)}%`, height: '100%',
                        background: unassigned ? 'var(--ec-line)' : 'var(--ec-blue)',
                      }} />
                    </div>
                    <span className="text-[11.5px] w-[44px] text-right text-ec-label">{r.salesShare}%</span>
                  </div>
                </td>
                <td className="text-right text-ec-hint">{r.purchaseCount}</td>
                <td className="text-right">{won(r.purchaseAmount)}</td>
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
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', borderRadius: 3, padding: '8px 10px', background: strong ? 'var(--ec-blue-wash)' : '#fff' }}>
      <div className="text-[11.5px] text-ec-hint">{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: strong ? 'var(--ec-blue-dark)' : 'var(--ec-text)' }}>{value}</div>
    </div>
  )
}

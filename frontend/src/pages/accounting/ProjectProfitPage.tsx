import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { ProjectProfitSummary } from '../../api/types'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const firstOfMonth = () => new Date().toISOString().slice(0, 8) + '01'
const today = () => new Date().toISOString().slice(0, 10)

/**
 * 회계 II > 프로젝트별 손익 — 전표에 붙은 프로젝트를 집계한다.
 *
 * 매출은 판매전표(공급가액), 원가는 구매전표(공급가액), 비용은 비용전표에서 모은다.
 * 부가세는 손익이 아니므로 뺀다(받아서 내는 돈이지 번 돈이 아니다).
 * 프로젝트가 지정되지 않은 전표는 억지로 배분하지 않고 "미지정"으로 따로 보여준다.
 */
export default function ProjectProfitPage() {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [data, setData] = useState<ProjectProfitSummary | null>(null)
  const [onlyActive, setOnlyActive] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const r = await api.get<ProjectProfitSummary>('/projects/profit', { params: { from, to } })
      setData(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])

  const rows = (data?.rows ?? []).filter((r) =>
    !onlyActive || r.revenue !== 0 || r.purchaseCost !== 0 || r.expense !== 0)

  return (
    <EcListShell title="프로젝트별 손익" actions={[{ label: '조회', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          거래가 있는 프로젝트만
        </label>
        <span style={{ marginLeft: 4, fontSize: 12, color: '#9aa1ab' }}>
          매출·원가는 공급가액 기준(부가세 제외). 판매·구매·비용 입력 시 프로젝트를 지정하면 여기 잡힙니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <Box label="프로젝트 매출" value={`${won(data?.totalRevenue ?? 0)} 원`} color="var(--ec-blue)" bg="#f7f9ff" />
        <Box label="프로젝트 원가·비용" value={`${won(data?.totalCost ?? 0)} 원`} color="#c60a2e" bg="#fdf6f6" />
        <Box
          label="프로젝트 이익"
          value={`${won(data?.totalProfit ?? 0)} 원`}
          color={(data?.totalProfit ?? 0) >= 0 ? '#2f8401' : '#c60a2e'}
          bg={(data?.totalProfit ?? 0) >= 0 ? '#f4faf5' : '#fdf6f6'}
        />
      </div>

      {/* 프로젝트가 없는 전표는 억지로 배분하지 않는다 — 그러면 프로젝트 손익이 거짓말을 한다 */}
      {((data?.unassignedRevenue ?? 0) > 0 || (data?.unassignedCost ?? 0) > 0) && (
        <p style={{ marginBottom: 8, padding: '6px 10px', fontSize: 12, background: '#fffbe6', border: '1px solid #f0e0a0', color: '#7a6300', borderRadius: 3 }}>
          프로젝트 미지정 전표 — 매출 {won(data!.unassignedRevenue)}원 · 원가/비용 {won(data!.unassignedCost)}원.
          일반 영업·간접비는 프로젝트에 넣지 않는 것이 정상입니다(억지로 배분하면 프로젝트 손익이 왜곡됩니다).
        </p>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>프로젝트코드</th>
            <th>프로젝트명</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ textAlign: 'right' }}>매출</th>
            <th style={{ textAlign: 'right' }}>구매원가</th>
            <th style={{ textAlign: 'right' }}>비용</th>
            <th style={{ textAlign: 'right' }}>이익</th>
            <th style={{ textAlign: 'right' }}>이익률</th>
            <th style={{ textAlign: 'center' }}>전표(판매/구매/비용)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              해당 기간에 프로젝트가 지정된 전표가 없습니다.
            </td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.projectId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{r.projectCode}</td>
              <td style={{ fontWeight: 600 }}>{r.projectName}</td>
              <td style={{ textAlign: 'center', color: '#5a626e' }}>{r.status ?? '-'}</td>
              <td style={{ textAlign: 'right' }}>{won(r.revenue)}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.purchaseCost)}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.expense)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.profit >= 0 ? '#2f8401' : '#c60a2e' }}>{won(r.profit)}</td>
              <td style={{ textAlign: 'right', color: r.marginRate >= 0 ? '#2f8401' : '#c60a2e' }}>{r.marginRate.toFixed(1)}%</td>
              <td style={{ textAlign: 'center', color: '#8a929c' }}>
                {r.salesCount} / {r.purchaseCount} / {r.expenseCount}
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={4} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right' }}>{won(data!.totalRevenue)}</td>
              <td colSpan={2} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#c60a2e' }}>{won(data!.totalCost)}</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: data!.totalProfit >= 0 ? '#2f8401' : '#c60a2e' }}>{won(data!.totalProfit)}</td>
              <td colSpan={2} style={{ border: '1px solid var(--ec-border)' }}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

function Box({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: bg, padding: '10px 14px' }}>
      <div style={{ fontSize: 12, color: '#5a626e' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

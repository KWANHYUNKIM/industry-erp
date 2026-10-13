import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { ProjectProfitSummary } from '../../types/api'
import { INQUIRY_FULL_PICKS, ymd } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const firstOfMonth = () => ymd(new Date()).slice(0, 8) + '01'
const today = () => ymd(new Date())

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

  const reset = () => { setFrom(firstOfMonth()); setTo(today()); setOnlyActive(true) }

  return (
    <EcListShell
      title="프로젝트별 손익"
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
        <EcCond label="기타">
          <label className="text-[12px]">
            <input type="checkbox" checked={onlyActive}
                   onChange={(e) => setOnlyActive(e.target.checked)} /> 거래가 있는 프로젝트만
          </label>
        </EcCond>
      </EcStatusPanel>

      <p className="mb-[8px] text-[12px] text-ec-hint">
        매출·원가는 공급가액 기준(부가세 제외). 판매·구매·비용 입력 시 프로젝트를 지정하면 여기 잡힙니다.
      </p>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="flex gap-[10px] mb-[10px]">
        <Box label="프로젝트 매출" value={`${won(data?.totalRevenue ?? 0)} 원`} color="var(--ec-blue)" bg="var(--ec-blue-wash)" />
        <Box label="프로젝트 원가·비용" value={`${won(data?.totalCost ?? 0)} 원`} color="var(--ec-danger)" bg="var(--ec-danger-bg)" />
        <Box
          label="프로젝트 이익"
          value={`${won(data?.totalProfit ?? 0)} 원`}
          color={(data?.totalProfit ?? 0) >= 0 ? '#2f8401' : 'var(--ec-danger)'}
          bg={(data?.totalProfit ?? 0) >= 0 ? 'var(--ec-success-bg)' : 'var(--ec-danger-bg)'}
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
            <th className="w-[34px]"></th>
            <th>프로젝트코드</th>
            <th>프로젝트명</th>
            <th className="text-center">상태</th>
            <th className="text-right">매출</th>
            <th className="text-right">구매원가</th>
            <th className="text-right">비용</th>
            <th className="text-right">이익</th>
            <th className="text-right">이익률</th>
            <th className="text-center">전표(판매/구매/비용)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={10} className="text-center text-ec-hint p-[20px]">
              해당 기간에 프로젝트가 지정된 전표가 없습니다.
            </td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.projectId}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-ec-blue">{r.projectCode}</td>
              <td className="font-semibold">{r.projectName}</td>
              <td className="text-center text-ec-label">{r.status ?? ''}</td>
              <td className="text-right">{won(r.revenue)}</td>
              <td className="text-right text-ec-label">{won(r.purchaseCost)}</td>
              <td className="text-right text-ec-label">{won(r.expense)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.profit >= 0 ? '#2f8401' : 'var(--ec-danger)' }}>{won(r.profit)}</td>
              <td style={{ textAlign: 'right', color: r.marginRate >= 0 ? '#2f8401' : 'var(--ec-danger)' }}>{r.marginRate.toFixed(1)}%</td>
              <td className="text-center text-ec-hint">
                {r.salesCount} / {r.purchaseCount} / {r.expenseCount}
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={4} className="border border-ec-line border-solid py-[5px] px-[8px]">합계</td>
              <td className="border border-ec-line border-solid py-[5px] px-[8px] text-right">{won(data!.totalRevenue)}</td>
              <td colSpan={2} className="border border-ec-line border-solid py-[5px] px-[8px] text-right text-ec-danger">{won(data!.totalCost)}</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: data!.totalProfit >= 0 ? '#2f8401' : 'var(--ec-danger)' }}>{won(data!.totalProfit)}</td>
              <td colSpan={2} className="border border-ec-line border-solid"></td>
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
      <div className="text-[12px] text-ec-label">{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

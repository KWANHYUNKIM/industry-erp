import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import type { ItemProfit } from '../../types/api'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import { periodOf } from '../../utils/periods'

/* 금액은 원 단위로 — 평균 원가 × 수량이라 소수가 붙어 '28,695,516.08 원' 처럼 찍혔다(24회차). */
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
/** 수량·원가단가는 소수가 뜻이 있다(평균 단가) — 둘째 자리까지. */
const dec = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })

const basisColor = (b: string) =>
  b === '제조원가' ? { bg: '#f3eefb', fg: '#6b3fb0' }
    : b === '매입평균' ? { bg: '#eefaf0', fg: '#2f8401' }
      : { bg: '#f0f2f5', fg: 'var(--ec-label)' }

export default function ItemCostPage() {
  const [rows, setRows] = useState<ItemProfit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState(() => periodOf('금월(~오늘)')!)

  useEffect(() => {
    setLoading(true)
    api
      .get<ItemProfit[]>('/accounting/item-profit', { params: period })
      .then((res) => setRows(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [period])


  /* 두 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. */
  const sort = useTableSort(rows, {
    품목코드: (r) => r.code,
    품명: (r) => r.name,
  })

  return (
    <EcListShell title="품목별 원가·이익" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <p className="mb-[8px] text-[11.5px] text-ec-hint">
        품목별 매출·원가·이익 · 원가단가는 매입평균, 제조품은 BOM 소요자재 원가(제조원가)로 산정
      </p>
      {/*
        기간. 예전엔 창업 이래 전부를 더해 보여 줘 "이번 달 이익" 을 볼 수 없었다(48회차). 열면 금월(~오늘).
      */}
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px] flex-wrap">
        <span className="text-ec-label">기간</span>
        <input type="date" className="ec-input" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} style={{ width: 140 }} />
        ~
        <input type="date" className="ec-input" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} style={{ width: 140 }} />
        <EcPeriodPicks onPick={(r) => setPeriod(r)} currentFrom={period.from} />
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="cursor-pointer" onClick={() => sort.toggle('품목코드')}>품목코드 {sort.mark('품목코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('품명')}>품명 {sort.mark('품명')}</th>
            <th className="text-center">원가기준</th>
            <th className="text-right">판매수량</th>
            <th className="text-right">매출액</th>
            <th className="text-right">원가단가</th>
            <th className="text-right">매출원가</th>
            <th className="text-right">매출이익</th>
            <th className="text-right">이익률</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            sort.sorted.map((r, idx) => (
              <tr key={r.itemId}>
                <td className="text-center text-ec-hint">{idx + 1}</td>
                <td>{r.code}</td>
                <td>{r.name}</td>
                <td className="text-center">
                  <span style={{ background: basisColor(r.costBasis).bg, color: basisColor(r.costBasis).fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{r.costBasis}</span>
                </td>
                <td className="text-right">{dec(r.soldQty)}</td>
                <td className="text-right">{won(r.salesAmount)}</td>
                <td className="text-right text-ec-hint">{dec(r.unitCost)}</td>
                <td className="text-right">{won(r.costAmount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.profit >= 0 ? 'var(--ec-blue)' : 'var(--ec-danger)' }}>{won(r.profit)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: r.profit >= 0 ? 'var(--ec-blue)' : 'var(--ec-danger)' }}>{r.marginRate}%</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

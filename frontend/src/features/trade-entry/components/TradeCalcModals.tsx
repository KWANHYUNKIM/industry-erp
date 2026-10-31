import Modal from '../../../components/Modal'
import { fmtNumber } from '../../../utils/format'
import EcNumInput from '../../../components/EcNumInput'
import { num, splitDiscount, type LineInput, type Mode } from '../tradeEntryConfig'
import type { ItemCost, Item, Warehouse } from '../../../types/api'
import type { Dispatch, SetStateAction } from 'react'

/** 재고 · 금액조정 · 이익계산 · 검증 결과 창 — TradeEntry 에서 몸통 그대로 옮겼다. */
export default function TradeCalcModals({
  adjDraft,
  adjFolded,
  adjOpen,
  applyAmountAdjust,
  costs,
  date,
  error,
  itemById,
  lines,
  mode,
  profitOpen,
  profitRows,
  profitTotals,
  setAdjDraft,
  setAdjFolded,
  setAdjOpen,
  setProfitOpen,
  setStockOpen,
  setVerifyResult,
  stockOpen,
  stockWhOf,
  taxable,
  totals,
  verifyResult,
  warehouseId,
  warehouses,
}: {
  adjDraft: string
  adjFolded: boolean
  adjOpen: boolean
  applyAmountAdjust: () => void
  costs: ItemCost[] | null
  date: string
  error: string
  itemById: Map<string, Item>
  lines: LineInput[]
  mode: Mode
  profitOpen: boolean
  profitRows: { name: string; code: string; qty: number; unitPrice: number; revenue: number; unitCost: number | null; cost: number | null; profit: number | null; rate: number | null; }[]
  profitTotals: { revenue: number; cost: number; missing: number; }
  setAdjDraft: Dispatch<SetStateAction<string>>
  setAdjFolded: Dispatch<SetStateAction<boolean>>
  setAdjOpen: Dispatch<SetStateAction<boolean>>
  setProfitOpen: Dispatch<SetStateAction<boolean>>
  setStockOpen: Dispatch<SetStateAction<boolean>>
  setVerifyResult: Dispatch<SetStateAction<string[] | null>>
  stockOpen: boolean
  stockWhOf: (itemId: string) => number
  taxable: boolean
  totals: { qty: number; supply: number; vat: number; extra: number; foreign: number; total: number; }
  verifyResult: string[] | null
  warehouseId: string
  warehouses: Warehouse[]
}) {
  return (
    <>
      {/* ── 재고 ─────────────────────────────────────────── */}
      <Modal error={error} open={stockOpen} title="재고 (명세 품목)" width={620} onClose={() => setStockOpen(false)}>
        <table className="w-full text-left">
          <thead>
            <tr><th>품목</th><th>창고</th><th className="text-right">재고</th><th className="text-right">이 전표 수량</th></tr>
          </thead>
          <tbody>
            {lines.filter((l) => l.itemId).length === 0 ? (
              <tr><td colSpan={4} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
            ) : lines.filter((l) => l.itemId).map((l, i) => {
              const have = stockWhOf(l.itemId)
              const need = num(l.quantity)
              return (
                <tr key={i}>
                  <td>{itemById.get(l.itemId)?.name}</td>
                  <td>{warehouses.find((w) => String(w.id) === warehouseId)?.name ?? ''}</td>
                  <td style={{ textAlign: 'right', color: mode === 'sales' && have < need ? 'var(--ec-danger)' : undefined }}>{fmtNumber(have)}</td>
                  <td className="text-right">{fmtNumber(need)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Modal>

      {/* ── 검증 결과 ────────────────────────────────────── */}
      {/*
        판매입력 II [금액조정] 창(원본 ESD066P, 2026-10-13 loginaa 실측). 나무 모양 표: 합계 ▸ 부가세율 10% 계 ▸ 판매 · 할인 감소(-).
        고칠 수 있는 칸은 <b>할인의 [합계]</b> 하나뿐이고 공급가액 · 부가세는 거기서 나뉜다. [접기] 는 하위 줄을 접는다.
      */}
      <Modal error={null} open={adjOpen} title="금액조정" width={780} onClose={() => setAdjOpen(false)}>
        {(() => {
          const d = splitDiscount(num(adjDraft), taxable)
          const after = { supply: totals.supply - d.supply, vat: totals.vat - d.vat, total: totals.total - d.total }
          return (
            <>
              <button type="button" className="ec-btn ec-btn-sm mb-[6px]" onClick={() => setAdjFolded((v) => !v)}>
                {adjFolded ? '펼치기' : '접기'}
              </button>
              <table className="ec-grid w-full">
                <thead>
                  <tr>
                    <th>금액조정항목명</th>
                    <th className="w-[160px]">증감구분</th>
                    <th className="w-[110px] text-right">공급가액</th>
                    <th className="w-[110px] text-right">부가세</th>
                    <th className="w-[110px] text-right">합계</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-ec-page">
                    <td>▴ 합계</td>
                    <td />
                    <td className="text-right">{fmtNumber(after.supply)}</td>
                    <td className="text-right">{fmtNumber(after.vat)}</td>
                    <td className="text-right">{fmtNumber(after.total)}</td>
                  </tr>
                  {!adjFolded && (
                    <>
                      <tr className="bg-ec-page">
                        <td className="pl-[18px]">▴ {taxable ? '부가세율 10% 계' : '면세 계'}</td>
                        <td />
                        <td className="text-right">{fmtNumber(after.supply)}</td>
                        <td className="text-right">{fmtNumber(after.vat)}</td>
                        <td className="text-right">{fmtNumber(after.total)}</td>
                      </tr>
                      <tr>
                        <td className="pl-[36px]">판매</td>
                        <td />
                        <td className="text-right">{fmtNumber(totals.supply)}</td>
                        <td className="text-right">{fmtNumber(totals.vat)}</td>
                        <td className="text-right">{fmtNumber(totals.total)}</td>
                      </tr>
                      <tr className="bg-ec-page">
                        <td className="pl-[36px]">할인</td>
                        <td className="text-center">감소(-)</td>
                        <td className="text-right">{fmtNumber(d.supply)}</td>
                        <td className="text-right">{fmtNumber(d.vat)}</td>
                        <td className="bg-ec-panel p-0">
                          <EcNumInput
                            className="ec-input w-full text-right"
                            value={adjDraft}
                            onValue={setAdjDraft}
                            aria-label="할인 합계"
                          />
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
              <div className="mt-[9px]">
                <button type="button" className="ec-btn ec-btn-primary" onClick={applyAmountAdjust}>적용(F8)</button>
              </div>
            </>
          )
        })()}
      </Modal>

      {/* 이익계산 — 원본 profitCalc. 원가는 회계(item_costs)가 소유하므로 화면에서 읽어 계산한다. */}
      <Modal error={error} open={profitOpen} title="이익계산" width={780} onClose={() => setProfitOpen(false)}>
        {costs === null ? (
          <div className="p-[20px] text-center text-ec-hint">원가를 불러오는 중…</div>
        ) : profitRows.length === 0 ? (
          <div className="p-[20px] text-center text-ec-hint">명세에 품목이 없습니다.</div>
        ) : (
          <>
            <table className="ec-grid" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th className="text-left">품목</th>
                  <th className="w-[70px] text-right">수량</th>
                  <th className="w-[90px] text-right">매출액</th>
                  <th className="w-[90px] text-right">단위원가</th>
                  <th className="w-[90px] text-right">원가액</th>
                  <th className="w-[90px] text-right">이익</th>
                  <th className="w-[70px] text-right">이익률</th>
                </tr>
              </thead>
              <tbody>
                {profitRows.map((r, i) => (
                  <tr key={i}>
                    <td className="pad">{r.code} {r.name}</td>
                    <td className="pad text-right">{fmtNumber(r.qty)}</td>
                    <td className="pad text-right">{fmtNumber(r.revenue)}</td>
                    {r.cost === null ? (
                      <td className="pad" colSpan={4} style={{ textAlign: 'center', color: '#c98a00' }}>
                        원가 미등록 — [회계 &gt; 원가] 에서 등록해야 이익이 잡힙니다
                      </td>
                    ) : (
                      <>
                        <td className="pad text-right">{fmtNumber(Math.round(r.unitCost!))}</td>
                        <td className="pad text-right">{fmtNumber(Math.round(r.cost))}</td>
                        <td className="pad" style={{ textAlign: 'right', color: r.profit! < 0 ? '#d03a3a' : '#1a7f37' }}>
                          {fmtNumber(Math.round(r.profit!))}
                        </td>
                        <td className="pad" style={{ textAlign: 'right', color: r.profit! < 0 ? '#d03a3a' : '#1a7f37' }}>
                          {r.rate === null ? '' : `${r.rate.toFixed(1)}%`}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 600, background: '#f6f7f9' }}>
                  <td className="pad" colSpan={2}>합계 (원가 등록분)</td>
                  <td className="pad text-right">{fmtNumber(profitTotals.revenue)}</td>
                  <td className="pad" />
                  <td className="pad text-right">{fmtNumber(Math.round(profitTotals.cost))}</td>
                  <td className="pad text-right">
                    {fmtNumber(Math.round(profitTotals.revenue - profitTotals.cost))}
                  </td>
                  <td className="pad text-right">
                    {profitTotals.revenue === 0 ? ''
                      : `${(((profitTotals.revenue - profitTotals.cost) / profitTotals.revenue) * 100).toFixed(1)}%`}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p style={{ marginTop: 10, fontSize: 12, color: '#6b727d', lineHeight: 1.6 }}>
              전표 일자({date.slice(0, 7)})를 넘지 않는 가장 최근 기간의 원가를 씁니다.
              실제원가가 잡혀 있으면 실제를, 아직 없으면 표준을 씁니다(월 마감 전에는 실제원가가 0입니다).
              {profitTotals.missing > 0 && ` 원가가 없는 품목 ${profitTotals.missing}건은 합계에서 뺐습니다.`}
            </p>
          </>
        )}
      </Modal>

      <Modal error={error} open={verifyResult !== null} title="검증 결과" width={520} onClose={() => setVerifyResult(null)}>
        {verifyResult && verifyResult.length === 0 ? (
          <p className="text-ec-success text-[13px] m-0">문제가 없습니다. 저장할 수 있습니다.</p>
        ) : (
          <ul className="pl-[18px] m-0 text-[12.5px] leading-[1.8] text-ec-danger">
            {verifyResult?.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        )}
      </Modal>
    </>
  )
}

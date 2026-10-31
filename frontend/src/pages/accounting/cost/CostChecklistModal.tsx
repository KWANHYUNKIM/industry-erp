import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { EcReportHead, EcReportFoot } from '../../../components/EcReportFrame'

export type CostChecklistKind = 'qty' | 'amount' | 'history'

interface QtyRow { itemCode: string; itemName: string; spec: string | null; bookQty: number | null; costQty: number | null; diff: number }
interface AmountRow {
  itemCode: string; itemName: string; spec: string | null
  nowQty: number; nowAmount: number; costQty: number; costAmount: number; qtyDiff: number; amountDiff: number
}
interface HistoryRow { itemCode: string; itemName: string; calcBy: string | null; calcAt: string | null; status: string }
interface Checklist<T> { fromMonth: string; toMonth: string; rows: T[] }

/* 원본 Checklist 숫자는 소수 두 자리(1,862.00 · 34,001,000.00). 값이 없으면 빈 칸(P004 장부 기초수량). */
const n2 = (v: number | null) => (v == null ? '' : v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const ymText = (m: string) => m.replace('-', '/')
const nameSpec = (name: string, spec: string | null) => (spec ? `${name} [${spec}]` : name)
/* 원본 [이력] 수정시간 '2026/09/25 오후 11:05:04'. */
function when(v: string | null) {
  if (!v) return ''
  const d = new Date(v)
  const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  return `${date} ${d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`
}

const TITLES: Record<CostChecklistKind, string> = { qty: '수량비교', amount: '금액비교', history: '이력' }

/**
 * 원가생성/수정(E040802)의 원가현황 [수량비교] · [전월금액비교] 와 기타 [이력] 창 — 2026-10-13 loginaa 실측.
 *
 * <p>[수량비교] 창 '수량비교' 안에 출력물 '재고수량 Checklist'(그 기간 시작달): 품목코드 · 품목명[규격] · 장부 기초수량 ·
 * 월별원가 기초수량 · 차이(= 장부 − 월별원가), 차이 작은 차례. [전월금액비교] 창 '금액비교' 안에 '금액비교 Checklist'(앞 달):
 * 현재기준 전월 구매수량 · 구매금액 · 이전 월별원가 구매수량 · 구매금액 · 수량차이 · 금액차이, 금액차이 작은 차례.
 * 원본 끝 열 [전표수정이력](보기)은 우리 전표가 고친 이력을 남기지 않아 없다. [이력] 창: 품목코드 · 품목명 · 작업자 · 수정시간 · 최종상태.
 */
export default function CostChecklistModal({ periodId, kind, onClose }: { periodId: number; kind: CostChecklistKind; onClose: () => void }) {
  const [qty, setQty] = useState<Checklist<QtyRow> | null>(null)
  const [amount, setAmount] = useState<Checklist<AmountRow> | null>(null)
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const path = kind === 'qty' ? 'qty-compare' : kind === 'amount' ? 'amount-compare' : 'history'
    api.get(`/cost-periods/${periodId}/${path}`)
      .then((r) => {
        if (kind === 'qty') setQty(r.data as Checklist<QtyRow>)
        else if (kind === 'amount') setAmount(r.data as Checklist<AmountRow>)
        else setHistory(r.data as HistoryRow[])
      })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [periodId, kind])

  const empty = (cols: number) => <tr><td colSpan={cols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>

  return (
    <Modal open title={TITLES[kind]} width={kind === 'history' ? 760 : 1000} error={error} onClose={onClose}>{(
      <div>
        {kind === 'qty' && qty && (
          <>
            <EcReportHead title="재고수량 Checklist" period={`${ymText(qty.fromMonth)} ~ ${ymText(qty.toMonth)}`} />
            <table className="ec-report w-full text-left">
              <thead><tr><th>품목코드</th><th>품목명[규격]</th><th className="text-right">장부 기초수량</th><th className="text-right">월별원가 기초수량</th><th className="text-right">차이</th></tr></thead>
              <tbody>
                {qty.rows.length === 0 ? empty(5) : qty.rows.map((r) => (
                  <tr key={r.itemCode}>
                    <td>{r.itemCode}</td><td>{nameSpec(r.itemName, r.spec)}</td>
                    <td className="text-right">{n2(r.bookQty)}</td><td className="text-right">{n2(r.costQty)}</td><td className="text-right">{n2(r.diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <EcReportFoot page={false} />
          </>
        )}
        {kind === 'amount' && amount && (
          <>
            <EcReportHead title="금액비교 Checklist" period={`${ymText(amount.fromMonth)} ~ ${ymText(amount.toMonth)}`} />
            <table className="ec-report w-full text-left">
              <thead>
                <tr>
                  <th>품목코드</th><th>품목명[규격]</th>
                  <th className="text-right">현재기준 전월 구매수량</th><th className="text-right">현재기준 전월 구매금액</th>
                  <th className="text-right">이전 월별원가 구매수량</th><th className="text-right">이전 월별원가 구매금액</th>
                  <th className="text-right">수량차이</th><th className="text-right">금액차이</th>
                </tr>
              </thead>
              <tbody>
                {amount.rows.length === 0 ? empty(8) : amount.rows.map((r) => (
                  <tr key={r.itemCode}>
                    <td>{r.itemCode}</td><td>{nameSpec(r.itemName, r.spec)}</td>
                    <td className="text-right">{n2(r.nowQty)}</td><td className="text-right">{n2(r.nowAmount)}</td>
                    <td className="text-right">{n2(r.costQty)}</td><td className="text-right">{n2(r.costAmount)}</td>
                    <td className="text-right">{n2(r.qtyDiff)}</td><td className="text-right">{n2(r.amountDiff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <EcReportFoot page={false} />
          </>
        )}
        {kind === 'history' && history && (
          <table className="w-full">
            <thead><tr><th>품목코드</th><th>품목명</th><th className="text-center">작업자</th><th className="text-center">수정시간</th><th className="text-center">최종상태</th></tr></thead>
            <tbody>
              {history.length === 0 ? empty(5) : history.map((r) => (
                <tr key={r.itemCode}>
                  <td>{r.itemCode}</td><td>{r.itemName}</td><td className="text-center">{r.calcBy ?? ''}</td>
                  <td className="text-center">{when(r.calcAt)}</td><td className="text-center">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex gap-[4px] mt-[8px]">
          {kind !== 'history' && <button type="button" className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>}
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    )}</Modal>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import { dateNo } from '../../utils/dateNo'
import type { PurchaseOrder, PurchaseOrderLine } from '../../types/api'
import { ecAlert } from '../../components/EcDialog'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const slash = (d: string | null) => (d ? d.replace(/-/g, '/') : '')

/**
 * 발주서입력 [단가요청] → <b>단가요청조회</b> 창 — 원본 E040301 2026-10-21 loginaa 실측.
 *
 * <p>단가요청 <b>줄마다</b> 한 줄: 단가요청번호 · 거래처명 · 담당자명 · 품목 · 유효기간 · 단가(단가확정 한 확정단가, 안 했으면 빈칸).
 * 단추 적용(F8) · 닫기. 적용하면 머리 거래처와 줄(수량 · 확정단가)이 채워지고 [단가요청] 단추가 툴바에서 사라진다
 * — 원본 10 × 확정 90 → 공급가액 900 · 부가세 90 · 990. 단가요청은 그대로(진행중) 남는다.
 */
export default function PriceRequestPickModal({ onApply, onClose }: {
  onApply: (picked: { order: PurchaseOrder; line: PurchaseOrderLine }[]) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  useEffect(() => {
    api.get<PurchaseOrder[]>('/purchase-orders', { params: { status: 'PRICE_REQUESTED' } })
      .then((r) => setRows(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [])
  const shown = useMemo(() => rows
    .slice()
    .sort((a, b) => (a.orderDate > b.orderDate ? -1 : a.orderDate < b.orderDate ? 1 : b.orderNo.localeCompare(a.orderNo)))
    .flatMap((o) => o.lines.map((line) => ({ order: o, line }))),
  [rows])

  function apply() {
    const picked = shown.filter((x) => checked.has(x.line.id))
    if (picked.length === 0) return ecAlert('리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.')
    onApply(picked)
  }

  return (
    <Modal open title="단가요청조회" width={900} onClose={onClose} error={error}>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((x) => checked.has(x.line.id))}
                onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((x) => x.line.id)) : new Set())} />
            </th>
            <th className="text-center">단가요청번호</th>
            <th>거래처명</th>
            <th>담당자명</th>
            <th>품목</th>
            <th className="text-center">유효기간</th>
            <th className="text-right">단가</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map(({ order: o, line: l }) => {
            const cp = l.confirmedPrice
            return (
              <tr key={l.id}>
                <td className="text-center">
                  <input type="checkbox" aria-label="선택" checked={checked.has(l.id)}
                    onChange={(e) => setChecked((cur) => { const n = new Set(cur); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n })} />
                </td>
                <td className="text-center">{dateNo(o.orderDate, o.orderNo)}</td>
                <td>{o.partnerName}</td>
                <td>{o.employeeName ?? ''}</td>
                <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''}</td>
                <td className="text-center">{slash(o.priceValidUntil)}</td>
                <td className="text-right">{cp == null ? '' : won(Number(cp))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-[10px] flex flex-wrap items-center gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

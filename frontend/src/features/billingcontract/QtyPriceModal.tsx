import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import EcNumInput from '../../components/EcNumInput'
import type { QtyPrice } from './types'

interface Row { minQuantity: string; unitPrice: string; vatIncluded: boolean }
const MIN_ROWS = 5
const empty = (): Row => ({ minQuantity: '', unitPrice: '', vatIncluded: false })
const num = (s: string) => Number(String(s).replace(/,/g, '')) || 0

/**
 * 계약항목등록 [수량별단가 › 설정] 창 — 수량 N 이상이면 그 단가.
 *
 * <p><b>원본 창 미실측</b>(2026-10-29 데이터이관 QA C2: 원본 00003 정수기 렌탈비_월말청구 목록 [수량별단가] 50,000 만 읽음).
 * 칸은 앞서 적어 둔 '수량 N 이상 · 적용단가 · VAT포함' 을 품목연결설정({@link ProductLinkModal})과 같은 꼴의 줄 목록으로 두었다.
 * 수량을 넣은 줄만 저장하고, 서버가 수량 차례로 줄을 세운다 — 목록 [수량별단가] 는 첫 줄의 단가.
 */
export default function QtyPriceModal({ open, value, onApply, onClose }: {
  open: boolean
  value: QtyPrice[]
  onApply: (rows: QtyPrice[]) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    if (!open) return
    const rs: Row[] = value.map((q) => ({ minQuantity: String(Number(q.minQuantity)), unitPrice: String(Number(q.unitPrice)), vatIncluded: q.vatIncluded }))
    while (rs.length < MIN_ROWS) rs.push(empty())
    setRows(rs)
  // 창을 열 때만 값을 다시 읽는다(ProductLinkModal 과 같다).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => {
    const next = rs.map((r, j) => (j === i ? { ...r, ...patch } : r))
    if (i === next.length - 1 && next[i].minQuantity) next.push(empty())
    return next
  })
  function apply() {
    onApply(rows.filter((r) => r.minQuantity.trim() !== '')
      .map((r) => ({ minQuantity: num(r.minQuantity), unitPrice: num(r.unitPrice), vatIncluded: r.vatIncluded }))
      .sort((a, b) => a.minQuantity - b.minQuantity))
  }

  return (
    <Modal open={open} title="수량별단가설정" width={560} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); apply() } }}>
        <h3 className="text-[14px] font-bold mb-[8px]">수량별단가설정</h3>
        <table className="w-full mb-[8px]">
          <thead>
            <tr>
              <th className="w-[30px]" />
              <th className="text-right">수량(이상)</th>
              <th className="text-right">적용단가</th>
              <th className="w-[80px] text-center">VAT포함</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}행 수량`} value={r.minQuantity} onValue={(v) => setRow(i, { minQuantity: v })} /></td>
                <td><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}행 적용단가`} value={r.unitPrice} disabled={!r.minQuantity} onValue={(v) => setRow(i, { unitPrice: v })} /></td>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${i + 1}행 VAT포함`} checked={r.vatIncluded} disabled={!r.minQuantity}
                         onChange={(e) => setRow(i, { vatIncluded: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}

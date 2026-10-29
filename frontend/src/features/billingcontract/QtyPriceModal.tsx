import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import EcNumInput from '../../components/EcNumInput'
import { requireSelection } from '../../components/EcDialog'
import type { QtyPrice } from './types'

interface Row { minQuantity: string; unitPrice: string; vatIncluded: boolean; checked: boolean }
/** 원본 '수량별단가등록' 창은 빈 줄까지 일곱 줄(2026-10-29 데이터이관 QA C4 실측). */
const MIN_ROWS = 7
const empty = (): Row => ({ minQuantity: '', unitPrice: '', vatIncluded: false, checked: false })
const num = (s: string) => Number(String(s).replace(/,/g, '')) || 0
/** 줄에 무엇이든 들어 있는가 — 수량이 비어도 단가를 친 줄은 '처음부터' 줄이다. */
const used = (r: Row) => r.minQuantity.trim() !== '' || r.unitPrice.trim() !== ''

/**
 * 계약항목등록 [수량별단가 › 설정] 창 '수량별단가등록' — 수량 N 이상이면 그 단가.
 *
 * <p>2026-10-29 loginaa 실측(데이터이관 QA C4, 00003 정수기 렌탈비_월말청구): 격자 위 [선택삭제], 줄 맨 앞 체크칸,
 * 열 수량('이상' 글자가 칸 뒤에) · 적용단가 · VAT포함, 빈 줄까지 일곱 줄, 하단 [적용(F8)] [닫기].
 * 원본 첫 줄은 수량 빈칸 + 50,000 — 수량을 비운 줄은 '처음부터'(0 이상)로 저장하고, 다시 열면 0 은 빈칸으로 보인다.
 * 서버가 수량 차례로 줄을 세운다 — 목록 [수량별단가] 는 첫 줄의 단가.
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
    const rs: Row[] = value.map((q) => ({ minQuantity: Number(q.minQuantity) ? String(Number(q.minQuantity)) : '',
      unitPrice: String(Number(q.unitPrice)), vatIncluded: q.vatIncluded, checked: false }))
    while (rs.length < MIN_ROWS) rs.push(empty())
    setRows(rs)
  // 창을 열 때만 값을 다시 읽는다(ProductLinkModal 과 같다).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => {
    const next = rs.map((r, j) => (j === i ? { ...r, ...patch } : r))
    if (i === next.length - 1 && used(next[i])) next.push(empty())
    return next
  })
  const checkedCount = rows.filter((r) => r.checked).length
  function removeChecked() {
    if (!requireSelection(checkedCount)) return
    setRows((rs) => {
      const left = rs.filter((r) => !r.checked)
      while (left.length < MIN_ROWS) left.push(empty())
      return left
    })
  }
  function apply() {
    onApply(rows.filter(used)
      .map((r) => ({ minQuantity: num(r.minQuantity), unitPrice: num(r.unitPrice), vatIncluded: r.vatIncluded }))
      .sort((a, b) => a.minQuantity - b.minQuantity))
  }

  return (
    <Modal open={open} title="수량별단가등록" width={560} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); apply() } }}>
        <h3 className="text-[14px] font-bold mb-[8px]">수량별단가등록</h3>
        <div className="mb-[6px]">
          <button type="button" className="ec-btn ec-btn-sm" onClick={removeChecked}>선택삭제</button>
        </div>
        <table className="w-full mb-[8px]">
          <thead>
            <tr>
              <th className="w-[30px] text-center">
                <input type="checkbox" aria-label="전체선택" checked={rows.length > 0 && checkedCount === rows.length}
                       onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, checked: e.target.checked })))} />
              </th>
              <th className="text-right">수량</th>
              <th className="text-right">적용단가</th>
              <th className="w-[80px] text-center">VAT포함</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${i + 1}행 선택`} checked={r.checked} onChange={(e) => setRow(i, { checked: e.target.checked })} />
                </td>
                <td>
                  <div className="flex items-center gap-[4px] flex-nowrap">
                    <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}행 수량`} value={r.minQuantity} onValue={(v) => setRow(i, { minQuantity: v })} />
                    <span className="shrink-0">이상</span>
                  </div>
                </td>
                <td><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}행 적용단가`} value={r.unitPrice} onValue={(v) => setRow(i, { unitPrice: v })} /></td>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${i + 1}행 VAT포함`} checked={r.vatIncluded}
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

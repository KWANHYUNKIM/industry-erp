import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import { shortDateNo } from '../../utils/dateNo'
import type { PurchaseOrder } from '../../types/api'
import { ecAlert } from '../../components/EcDialog'
import { fmtAmount } from '../../utils/format'

const yy = (d: string | null) => (d ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : '')
type Progress = 'UNCONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'
type Req = PurchaseOrder & { requestProgress?: Progress | null }
const progressOf = (o: Req): Progress => o.requestProgress ?? 'IN_PROGRESS'
const LABEL: Record<Progress, string> = { UNCONFIRMED: '미확인', IN_PROGRESS: '진행중', COMPLETED: '완료' }
type Tab = 'ALL' | 'APPROVAL' | 'UNCONFIRMED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'

/**
 * 발주계획입력 [발주요청] → <b>발주요청검색창(조회)</b> — 원본 E040316 2026-10-20 실측.
 *
 * <p>알약 전체 · 결재중 · 미확인 · 확인 ▸ 진행중 – 완료, 열은 발주요청조회와 같다. 단추 적용(F8) · 닫기.
 * 고른 것 없이 적용하면 '리스트에 선택된 자료가 없습니다. / 체크박스에 체크한 후 다시 시도 바랍니다.'
 * 요청 → 계획 사이에는 잔량이 없다 — 같은 요청을 몇 번이고 베낄 수 있고, 요청 수량이 그대로 들어온다.
 */
export default function RequestPickModal({ onApply, onClose }: {
  onApply: (picked: PurchaseOrder[]) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<Req[]>([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('ALL')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  useEffect(() => {
    api.get<Req[]>('/purchase-orders', { params: { status: 'REQUESTED' } })
      .then((r) => setRows(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [])
  const shown = useMemo(() => rows
    .filter((o) => tab === 'ALL' || (tab === 'CONFIRMED' ? progressOf(o) !== 'UNCONFIRMED' : tab !== 'APPROVAL' && progressOf(o) === tab))
    .sort((a, b) => (a.orderDate > b.orderDate ? -1 : a.orderDate < b.orderDate ? 1 : b.orderNo.localeCompare(a.orderNo))),
  [rows, tab])

  function apply() {
    const picked = shown.filter((o) => checked.has(o.id))
    if (picked.length === 0) return ecAlert('리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.')
    onApply(picked)
  }

  return (
    <Modal open title="발주요청검색창(조회)" width={900} onClose={onClose} error={error}>
      <div className="ec-pills mb-[8px]">
        {([['ALL', '전체'], ['APPROVAL', '결재중'], ['UNCONFIRMED', '미확인'], ['CONFIRMED', '확인 ▸'], ['IN_PROGRESS', '진행중'], ['COMPLETED', '완료']] as const).map(([k, label]) => (
          <button key={k} type="button" className={`ec-pill no-ec${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((o) => checked.has(o.id))}
                onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((o) => o.id)) : new Set())} />
            </th>
            <th className="text-center">발주요청일자</th>
            <th>거래처명</th>
            <th>품목</th>
            <th className="text-center">납기일자</th>
            <th className="text-right">수량</th>
            <th className="text-right">금액(합계)</th>
            <th className="text-center">종결여부</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o) => (
            <tr key={o.id}>
              <td className="text-center">
                <input type="checkbox" aria-label="선택" checked={checked.has(o.id)}
                  onChange={(e) => setChecked((cur) => { const n = new Set(cur); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n })} />
              </td>
              <td className="text-center">{shortDateNo(o.orderDate, o.orderNo)}</td>
              <td>{o.partnerName}</td>
              <td>{o.lines[0]?.itemName ?? ''}{o.lines[0]?.spec ? ` [${o.lines[0].spec}]` : ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td className="text-center">{yy(o.dueDate)}</td>
              <td className="text-right">{o.lines.reduce((a, l) => a + Number(l.quantity), 0).toLocaleString('ko-KR')}</td>
              <td className="text-right">{fmtAmount(Number(o.totalAmount))}</td>
              <td className="text-center">{LABEL[progressOf(o)]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-[10px] flex flex-wrap items-center gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

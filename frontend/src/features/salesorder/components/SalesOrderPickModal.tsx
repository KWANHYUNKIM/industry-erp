import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import { periodOf } from '../../../components/EcPeriodPicks'
import Modal from '../../../components/Modal'
import { dateText } from '../../../utils/dateText'

/** GET /sales-orders 한 건 — [주문] 창이 쓰는 것만. */
export interface SalesOrderLite {
  id: number; orderNo: string; orderDate: string; dueDate: string | null
  partnerId: number | null; partnerName: string | null; employeeName: string | null
  status: string; statusName: string; totalAmount: number
  lines: { itemId: number; itemName: string; quantity: number }[]
}
/** 원본 주문서검색창의 기본 기간과 같다(전월 2일 ~ 다음 달 1일 무렵). */
const ORDER_PERIOD = periodOf('최근30일(+1개월)')!
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 원본 툴바의 <b>[주문]</b> → 주문서검색창(조회). 탭 [전체 | 진행중 | 완료], 줄을 눌러 고르고 [적용(F8)].
 * 작업지시서입력 · 소요시간계산이 같이 쓴다 — 고른 주문으로 무엇을 할지는 부르는 화면이 정한다.
 */
export default function SalesOrderPickModal({ open, onClose, onApply }: {
  open: boolean; onClose: () => void; onApply: (orders: SalesOrderLite[]) => void
}) {
  const [orders, setOrders] = useState<SalesOrderLite[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [tab, setTab] = useState<'전체' | '진행중' | '완료'>('진행중')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setPicked([]); setErr('')
    api.get<SalesOrderLite[]>('/sales-orders', { params: { from: ORDER_PERIOD.from, to: ORDER_PERIOD.to } })
      .then((r) => setOrders(r.data))
      .catch((e) => setErr(extractErrorMessage(e)))
  }, [open])

  function apply() {
    const chosen = orders.filter((o) => picked.includes(o.id))
    if (chosen.length === 0) { setErr('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    onApply(chosen)
  }

  const shown = orders.filter((o) => tab === '전체' || (tab === '완료') === (o.status === 'COMPLETED'))
  return (
    <Modal open={open} title="주문서검색창(조회)" error={err} width={980} onClose={onClose}>
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#8a929c' }}>{dateText(ORDER_PERIOD.from)} ~ {dateText(ORDER_PERIOD.to)}</span>
      </div>
      <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 30 }} />
              <th>일자-No.</th>
              <th>거래처명</th>
              <th>사원(담당)명</th>
              <th>품목명</th>
              <th>납기일자</th>
              <th style={{ textAlign: 'right' }}>주문금액합계</th>
              <th>진행상태</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((o) => (
              <tr key={o.id} style={{ cursor: 'pointer' }}
                  onClick={() => setPicked((p) => (p.includes(o.id) ? p.filter((x) => x !== o.id) : [...p, o.id]))}>
                <td style={{ textAlign: 'center' }}><input type="checkbox" readOnly checked={picked.includes(o.id)} /></td>
                <td>{dateText(o.orderDate)} {o.orderNo}</td>
                <td>{o.partnerName ?? ''}</td>
                <td>{o.employeeName ?? ''}</td>
                <td>{o.lines[0]?.itemName ?? ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
                <td>{dateText(o.dueDate) || ''}</td>
                <td style={{ textAlign: 'right' }}>{won(Number(o.totalAmount))}</td>
                <td>{o.statusName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

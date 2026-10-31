import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import { periodOf } from '../../../components/EcPeriodPicks'
import Modal from '../../../components/Modal'
import { dateText } from '../../../utils/dateText'
import { fmtAmountOf } from '../../../utils/format'

/** 고른 전표의 품목 줄 — Invoice 격자에 그대로 붙는다. */
export interface PickedLine {
  itemId: number; quantity: number; unit: string | null; unitPrice: number
}
/** 고른 전표 한 장 — 거래처를 비워 두었으면 첫 전표의 거래처가 들어간다. */
export interface PickedSlip { partnerId: number | null; lines: PickedLine[] }

interface SlipLine { itemId: number; itemName: string; spec?: string | null; unit: string | null; quantity: number; unitPrice: number }
interface SaleRow {
  id: number; docNo: string; saleDate: string; partnerId: number; partnerName: string
  totalAmount: number; taxable: boolean; warehouseName: string | null
  confirmStatus: string; accountingReflected: boolean; lines: SlipLine[]
}
interface OrderRow {
  id: number; orderNo: string; orderDate: string; dueDate: string | null; partnerId: number | null; partnerName: string | null
  employeeName: string | null; status: string; statusName: string; totalAmount: number; lines: SlipLine[]
}

/* 원본 두 창 모두 [최근30일(+1개월)] 로 열린다(2026-10-12 실측 2026/09/12 ~ 2026/11/11). */
const PERIOD = periodOf('최근30일(+1개월)')!
const summary = (ls: SlipLine[]) => {
  if (ls.length === 0) return ''
  const first = ls[0].spec ? `${ls[0].itemName} [${ls[0].spec}]` : ls[0].itemName
  return ls.length > 1 ? `${first} 외 ${ls.length - 1}건` : first
}
/** 원본 판매검색창 [일자-No.] — '2026/10/28 -1'. */
const slipText = (date: string, no: number) => `${dateText(date)} -${no}`

const SALE_TABS = ['전체', '결재중', '미확인', '확인'] as const
const ORDER_TABS = ['전체', '진행중', '완료'] as const

/**
 * Invoice/Packing List 입력 툴바의 <b>[판매]</b> · <b>[주문]</b> → 판매검색창(조회) · 주문서검색창(조회) — 2026-10-12 loginaa 실측.
 *
 * <p>판매검색창: 탭 [전체 · 결재중 · 미확인 · 확인], 열 [일자-No. · 거래처명 · 품목명(요약) · 금액합계 · 거래유형명 · 창고명 ·
 * 회계반영여부]. 주문서검색창: 열 [일자-No. · 거래처명 · 사원(담당)명 · 품목명(요약) · 납기일자 · 주문금액합계 · 진행상태].
 * 입력 창에 거래처를 먼저 골라 두면 그 거래처 전표만 나온다. 고르고 [적용(F8)] 을 누르면 품목 줄(품목 · 수량 · 단위 · 단가)이
 * 격자로 들어가고 금액은 공급가액(수량 × 단가)이다 — 판매 8,800,000(부가세 포함)이 Invoice 금액 8,000,000 으로 왔다.
 */
export default function ExportSlipPickModal({ kind, partnerId, onClose, onApply }: {
  kind: 'sales' | 'order' | null
  partnerId: number | null
  onClose: () => void
  onApply: (slip: PickedSlip) => void
}) {
  const [sales, setSales] = useState<SaleRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [tab, setTab] = useState('전체')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!kind) return
    setPicked([]); setErr(''); setTab('전체')
    const params = { from: PERIOD.from, to: PERIOD.to }
    if (kind === 'sales') {
      api.get<SaleRow[]>('/sales', { params }).then((r) => setSales(r.data)).catch((e) => setErr(extractErrorMessage(e)))
    } else {
      api.get<OrderRow[]>('/sales-orders', { params }).then((r) => setOrders(r.data)).catch((e) => setErr(extractErrorMessage(e)))
    }
  }, [kind])

  const mine = <T extends { partnerId: number | null }>(rs: T[]) => (partnerId ? rs.filter((r) => r.partnerId === partnerId) : rs)
  /** 같은 날 몇 번째 전표인가 — 먼저 만든 차례. */
  const seq = (rows: { id: number; date: string }[]) => {
    const m = new Map<number, number>()
    const by = new Map<string, number[]>()
    for (const r of rows) by.set(r.date, [...(by.get(r.date) ?? []), r.id])
    for (const ids of by.values()) ids.sort((a, b) => a - b).forEach((id, i) => m.set(id, i + 1))
    return m
  }
  const saleSeq = seq(sales.map((s) => ({ id: s.id, date: s.saleDate })))
  const orderSeq = seq(orders.map((o) => ({ id: o.id, date: o.orderDate })))
  const saleShown = mine(sales)
    .filter((s) => tab === '전체' || (tab === '결재중' ? s.confirmStatus === 'IN_APPROVAL'
      : tab === '미확인' ? s.confirmStatus === 'UNCONFIRMED' : s.confirmStatus === 'CONFIRMED'))
    .sort((a, b) => b.saleDate.localeCompare(a.saleDate) || (saleSeq.get(b.id) ?? 0) - (saleSeq.get(a.id) ?? 0))
  const orderShown = mine(orders)
    .filter((o) => tab === '전체' || (tab === '완료') === (o.status === 'COMPLETED'))
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || (orderSeq.get(b.id) ?? 0) - (orderSeq.get(a.id) ?? 0))

  function apply() {
    const chosen: { partnerId: number | null; lines: SlipLine[] }[] = kind === 'sales'
      ? saleShown.filter((s) => picked.includes(s.id)) : orderShown.filter((o) => picked.includes(o.id))
    if (chosen.length === 0) { setErr('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    onApply({
      partnerId: chosen[0].partnerId,
      lines: chosen.flatMap((c) => c.lines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unit: l.unit, unitPrice: Number(l.unitPrice) }))),
    })
  }
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const tabs: readonly string[] = kind === 'sales' ? SALE_TABS : ORDER_TABS
  const title = kind === 'sales' ? '판매검색창(조회)' : '주문서검색창(조회)'

  return (
    <Modal open={kind !== null} title={title} error={err} width={1100} onClose={onClose}>
      <div className="flex items-center mb-[6px]">
        <div className="ec-pills">
          {tabs.map((t) => (
            <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <span className="ml-auto text-ec-hint">{dateText(PERIOD.from)} ~ {dateText(PERIOD.to)}</span>
      </div>
      <div className="max-h-[55vh] overflow-auto">
        <table className="w-full text-left">
          <thead>
            {kind === 'sales' ? (
              <tr>
                <th className="w-[30px]" /><th>일자-No.</th><th>거래처명</th><th>품목명(요약)</th>
                <th className="text-right">금액합계</th><th>거래유형명</th><th>창고명</th><th>회계반영여부</th>
              </tr>
            ) : (
              <tr>
                <th className="w-[30px]" /><th>일자-No.</th><th>거래처명</th><th>사원(담당)명</th><th>품목명(요약)</th>
                <th>납기일자</th><th className="text-right">주문금액합계</th><th>진행상태</th>
              </tr>
            )}
          </thead>
          <tbody>
            {(kind === 'sales' ? saleShown.length : orderShown.length) === 0 ? (
              <tr><td colSpan={8} className="text-center text-ec-hint">등록된 데이터가 없습니다.</td></tr>
            ) : kind === 'sales' ? saleShown.map((s) => (
              <tr key={s.id} className="cursor-pointer" onClick={() => toggle(s.id)}>
                <td className="text-center"><input type="checkbox" readOnly checked={picked.includes(s.id)} aria-label={`${s.docNo} 선택`} /></td>
                <td className="ec-link">{slipText(s.saleDate, saleSeq.get(s.id) ?? 1)}</td>
                <td>{s.partnerName}</td>
                <td>{summary(s.lines)}</td>
                <td className="text-right">{fmtAmountOf(s.totalAmount)}</td>
                {/* 원본 [거래유형명] 은 부가세 유형이다('부가세율 적용'). 우리 판매는 과세 여부만 든다 — 면세 이름은 원본에서 못 재어 비운다. */}
                <td className="text-center">{s.taxable ? '부가세율 적용' : ''}</td>
                <td className="text-center">{s.warehouseName ?? ''}</td>
                <td className="text-center">{s.accountingReflected ? '반영' : ''}</td>
              </tr>
            )) : orderShown.map((o) => (
              <tr key={o.id} className="cursor-pointer" onClick={() => toggle(o.id)}>
                <td className="text-center"><input type="checkbox" readOnly checked={picked.includes(o.id)} aria-label={`${o.orderNo} 선택`} /></td>
                <td className="ec-link">{slipText(o.orderDate, orderSeq.get(o.id) ?? 1)}</td>
                <td>{o.partnerName ?? ''}</td>
                <td>{o.employeeName ?? ''}</td>
                <td>{summary(o.lines)}</td>
                <td>{dateText(o.dueDate) || ''}</td>
                <td className="text-right">{fmtAmountOf(o.totalAmount)}</td>
                <td className="text-center">{o.statusName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-[4px] mt-[10px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

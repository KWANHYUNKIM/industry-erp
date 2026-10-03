import { useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import { periodOf } from '../../components/EcPeriodPicks'
import { dateNo } from '../../utils/dateNo'

/**
 * 품질검사요청입력(E040628) · 품질검사입력(E040621) 입력 판의 <b>전표 불러오기</b> 단추 — 판매 · 발주 · 주문 · 작업지시서 · 구매 · 생산 · 이동 · A/S접수.
 *
 * <p>2026-10-04 원본 실측: 단추를 누르면 '<종류>검색창(조회)' 이 [일자-No. · 거래처명 · 품목명(요약) · 금액합계 · 창고명]
 * 으로 뜨고(기간 최근30일(+1개월)), 하나를 골라 [적용(F8)] 하면 그 전표의 품목 · 수량이 줄로 들어오고 불러오기 단추들은 사라진다 —
 * 한 전표에서만 불러온다. 원 전표는 저장되지 않는다(조회의 [연결전표]는 이어 만든 다음 전표다).
 * 작업지시서 · 생산 · 이동은 한 줄이 한 행인 응답이라 전표 번호로 묶고 [금액합계]를 비운다. A/S접수(요청입력에만)는 금액이 없어 [금액합계]를 비운다. 재고불러오기는 아직이다.
 */
type Row = Record<string, unknown>
export interface PulledLine { itemId: number; itemName: string; quantity: number }
interface PullDoc { id: number; docNo: string; date: string; partnerName: string; warehouseName: string; totalAmount: number | null; lines: PulledLine[] }

/** 전표에 줄 배열이 든 응답(판매 · 발주 · 주문 · 구매). */
const nested = (no: string, date: string) => (data: Row[]): PullDoc[] => data.map((d) => ({
  id: d.id as number, docNo: d[no] as string, date: d[date] as string,
  partnerName: (d.partnerName as string) ?? '', warehouseName: (d.warehouseName as string) ?? '',
  totalAmount: d.totalAmount == null ? null : Number(d.totalAmount),
  lines: ((d.lines as Row[]) ?? []).map((l) => ({ itemId: l.itemId as number, itemName: l.itemName as string, quantity: Number(l.quantity) })),
}))
/** 한 줄이 한 행인 응답(작업지시서 · 생산 · 이동) — 전표 번호로 묶는다. 금액이 없어 [금액합계]는 비운다. */
const flat = (no: string, date: string, item: string, qty: string, wh: string) => (data: Row[]): PullDoc[] => {
  const by = new Map<string, PullDoc>()
  for (const d of data) {
    const k = d[no] as string
    const doc = by.get(k) ?? { id: d.id as number, docNo: k, date: d[date] as string, partnerName: (d.partnerName as string) ?? '',
      warehouseName: (d[wh] as string) ?? '', totalAmount: null, lines: [] }
    doc.lines.push({ itemId: d[`${item}Id`] as number, itemName: d[`${item}Name`] as string, quantity: Number(d[qty]) })
    by.set(k, doc)
  }
  return [...by.values()]
}

export const PULLS = {
  판매: { url: '/sales', toDocs: nested('docNo', 'saleDate') },
  발주: { url: '/purchase-orders', toDocs: nested('orderNo', 'orderDate') },
  주문: { url: '/sales-orders', toDocs: nested('orderNo', 'orderDate') },
  작업지시서: { url: '/work-orders', toDocs: flat('orderNo', 'orderDate', 'product', 'plannedQty', 'warehouseName') },
  구매: { url: '/purchases', toDocs: nested('docNo', 'purchaseDate') },
  생산: { url: '/productions', toDocs: flat('prodNo', 'productionDate', 'product', 'producedQty', 'warehouseName') },
  이동: { url: '/stock-transfers', toDocs: flat('transferNo', 'transferDate', 'item', 'quantity', 'toWarehouseName') },
  /* A/S접수는 금액이 없다 — [금액합계]를 비운다. */
  'A/S접수': { url: '/as-requests', toDocs: nested('asNo', 'receiptDate') },
} as const
export type PullKind = keyof typeof PULLS

/** 불러오기 단추 하나와 검색창. <code>onApply</code> 가 고른 전표의 줄을 받는다. */
export function DocPullButton({ kind, onApply }: { kind: PullKind; onApply: (lines: PulledLine[]) => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PullDoc[]>([])
  const [pick, setPick] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function show() {
    setOpen(true); setPick(null); setRows([]); setError('')
    const r = periodOf('최근30일(+1개월)')!
    const c = PULLS[kind]
    try {
      const data = (await api.get<Row[]>(c.url, { params: { from: r.from, to: r.to } })).data
      setRows(c.toDocs(data).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id))
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  function apply() {
    const d = rows.find((x) => x.id === pick)
    if (!d) return
    onApply(d.lines)
    setOpen(false)
  }

  return (<>
    <button type="button" className="ec-btn ec-btn-sm" onClick={() => void show()}>{kind}</button>
    <Modal error={error} open={open} title={`${kind}검색창(조회)`} onClose={() => setOpen(false)} width={760}>
      <table className="w-full text-left">
        <thead><tr>
          <th className="w-[34px]"></th><th className="text-center">일자-No.</th><th>거래처명</th><th>품목명(요약)</th>
          <th className="text-right">금액합계</th><th>창고명</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((d) => (
            <tr key={d.id} className="cursor-pointer" onClick={() => setPick(d.id)}>
              <td className="text-center"><input type="radio" name={`pull-${kind}`} checked={pick === d.id} onChange={() => setPick(d.id)} /></td>
              <td className="text-center">{dateNo(d.date, d.docNo)}</td>
              <td>{d.partnerName}</td>
              <td>{d.lines[0] ? `${d.lines[0].itemName}${d.lines.length > 1 ? ` 외 ${d.lines.length - 1}건` : ''}` : ''}</td>
              <td className="text-right">{d.totalAmount == null ? '' : Math.round(d.totalAmount).toLocaleString('ko-KR')}</td>
              <td>{d.warehouseName}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[9px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={pick == null} onClick={apply}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
      </div>
    </Modal>
  </>)
}

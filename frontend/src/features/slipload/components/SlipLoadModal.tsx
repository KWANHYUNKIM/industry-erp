import { useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import { periodOf } from '../../../components/EcPeriodPicks'
import Modal from '../../../components/Modal'
import { dateText } from '../../../utils/dateText'

/** 불러온 전표의 한 줄 — 품목과 수량만 넘긴다(무엇을 할지는 부르는 화면이 정한다). */
export interface LoadedLine { itemId: number; itemName: string; quantity: number }
export interface LoadedSlip { kind: string; no: string; date: string; lines: LoadedLine[] }

interface SlipRow { key: string; no: string; date: string; partner: string; lines: LoadedLine[] }
type Raw = Record<string, unknown> & { lines?: Record<string, unknown>[] }

/** 원본 창의 기본 기간과 같다(최근30일 +1개월). */
const PERIOD = periodOf('최근30일(+1개월)')!
const num = (v: unknown) => Number(v ?? 0)
const str = (v: unknown) => (v == null ? '' : String(v))

/**
 * 원본 툴바의 <b>[전표불러오기]</b> → [메뉴검색](2026-10-02 loginaa 실측: 견적서 · 주문서 · 판매 · 출하지시서 · 출하 ·
 * 발주요청 · 발주계획 · 단가요청서 · 발주서 · 구매 · 작업지시서 · 생산불출 · 창고이동 · …). 메뉴를 고르면 그 전표 목록이
 * 뜨고, 고른 전표의 품목 줄을 넘긴다. 우리 API 가 있는 여섯 메뉴만 둔다.
 */
const MENUS: { group: string; name: string; load: () => Promise<SlipRow[]> }[] = [
  { group: '영업관리', name: '주문서', load: async () => (await api.get<Raw[]>('/sales-orders', { params: PERIOD })).data.map((o) => ({
    key: `SO${o.id}`, no: str(o.orderNo), date: str(o.orderDate), partner: str(o.partnerName),
    lines: (o.lines ?? []).map((l) => ({ itemId: num(l.itemId), itemName: str(l.itemName), quantity: num(l.quantity) })) })) },
  { group: '영업관리', name: '판매', load: async () => (await api.get<Raw[]>('/sales', { params: PERIOD })).data.map((o) => ({
    key: `SA${o.id}`, no: str(o.docNo), date: str(o.saleDate), partner: str(o.partnerName),
    lines: (o.lines ?? []).map((l) => ({ itemId: num(l.itemId), itemName: str(l.itemName), quantity: num(l.quantity) })) })) },
  { group: '구매관리', name: '발주서', load: async () => (await api.get<Raw[]>('/purchase-orders', { params: PERIOD })).data.map((o) => ({
    key: `PO${o.id}`, no: str(o.orderNo), date: str(o.orderDate), partner: str(o.partnerName),
    lines: (o.lines ?? []).map((l) => ({ itemId: num(l.itemId), itemName: str(l.itemName), quantity: num(l.quantity) })) })) },
  { group: '구매관리', name: '구매', load: async () => (await api.get<Raw[]>('/purchases', { params: PERIOD })).data.map((o) => ({
    key: `PU${o.id}`, no: str(o.docNo), date: str(o.purchaseDate), partner: str(o.partnerName),
    lines: (o.lines ?? []).map((l) => ({ itemId: num(l.itemId), itemName: str(l.itemName), quantity: num(l.quantity) })) })) },
  /* 작업지시서·생산불출은 줄이 행 하나씩 온다 — 같은 번호끼리 묶어 전표 하나로 보인다. */
  { group: '생산/외주', name: '작업지시서', load: async () => group((await api.get<Raw[]>('/work-orders', { params: PERIOD })).data,
    (r) => str(r.orderNo), (r) => str(r.orderDate), (r) => str(r.partnerName),
    (r) => ({ itemId: num(r.productId), itemName: str(r.productName), quantity: num(r.plannedQty) })) },
  { group: '생산/외주', name: '생산불출', load: async () => group((await api.get<Raw[]>('/material-issues', { params: PERIOD })).data,
    (r) => str(r.issueNo), (r) => str(r.issueDate), (r) => str(r.toWarehouseName),
    (r) => ({ itemId: num(r.itemId), itemName: str(r.itemName), quantity: num(r.qty) })) },
]

function group(rows: Raw[], no: (r: Raw) => string, date: (r: Raw) => string, partner: (r: Raw) => string,
               line: (r: Raw) => LoadedLine): SlipRow[] {
  const m = new Map<string, SlipRow>()
  for (const r of rows) {
    const k = no(r)
    const g = m.get(k) ?? { key: k, no: k, date: date(r), partner: partner(r), lines: [] }
    g.lines.push(line(r))
    m.set(k, g)
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export default function SlipLoadModal({ open, onClose, onApply }: {
  open: boolean; onClose: () => void; onApply: (slips: LoadedSlip[]) => void
}) {
  const [menu, setMenu] = useState<(typeof MENUS)[number] | null>(null)
  const [rows, setRows] = useState<SlipRow[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [err, setErr] = useState('')

  function close() { setMenu(null); setRows([]); setPicked([]); setErr(''); onClose() }
  async function choose(m: (typeof MENUS)[number]) {
    setErr('')
    try {
      setRows(await m.load()); setPicked([]); setMenu(m)
    } catch (e) {
      setErr(extractErrorMessage(e))
    }
  }
  function apply() {
    const chosen = rows.filter((r) => picked.includes(r.key))
    if (chosen.length === 0) { setErr('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    onApply(chosen.map((r) => ({ kind: menu!.name, no: r.no, date: r.date, lines: r.lines })))
    close()
  }

  return (
    <Modal open={open} title={menu ? `${menu.name} — 전표불러오기` : '메뉴검색'} error={err} width={menu ? 900 : 420} onClose={close}>
      {!menu ? (
        <table className="w-full text-left">
          <thead><tr><th className="w-[120px]">구분</th><th>메뉴</th></tr></thead>
          <tbody>
            {MENUS.map((m) => (
              <tr key={m.name} className="cursor-pointer" onClick={() => void choose(m)}>
                <td>{m.group}</td>
                <td className="text-ec-blue">{m.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="flex gap-[6px] mb-[6px] text-[11.5px] text-ec-hint">
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => { setMenu(null); setRows([]) }}>← 메뉴검색</button>
            <span className="ml-auto">{dateText(PERIOD.from)} ~ {dateText(PERIOD.to)}</span>
          </div>
          <div className="max-h-[55vh] overflow-y-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="w-[30px]" />
                  <th>일자-No.</th>
                  <th>거래처명</th>
                  <th>품목명</th>
                  <th className="text-right">수량합계</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.key} className="cursor-pointer"
                      onClick={() => setPicked((p) => (p.includes(r.key) ? p.filter((x) => x !== r.key) : [...p, r.key]))}>
                    <td className="text-center"><input type="checkbox" readOnly checked={picked.includes(r.key)} /></td>
                    <td>{dateText(r.date)} {r.no}</td>
                    <td>{r.partner}</td>
                    <td>{r.lines[0]?.itemName ?? ''}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
                    <td className="text-right">{r.lines.reduce((n, l) => n + l.quantity, 0).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
            <button type="button" className="ec-btn" onClick={close}>닫기</button>
          </div>
        </>
      )}
    </Modal>
  )
}

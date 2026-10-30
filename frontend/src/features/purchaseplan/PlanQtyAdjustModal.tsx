import { useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import EcNumInput from '../../components/EcNumInput'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateNo } from '../../utils/dateNo'
import type { Item, PurchaseOrder, StockRow, WorkOrder } from '../../types/api'
import EcDateInput from '../../components/ui/EcDateInput'

/** 수량조정에 올리는 계획 줄 하나. */
export interface AdjustLine {
  orderId: number; lineId: number; orderDate: string; orderNo: string
  itemId: number; itemCode: string; itemName: string; spec: string | null
  inputQty: number; qty: number; warehouseId: number | null; warehouseName: string | null; calcDate: string | null
}
interface Calc { itemSafety: number; sold: number; unissued: number; stock: number; unreceived: number; minUnit: number }
interface Formula {
  sold: boolean; itemSafety: boolean; stock: boolean; unreceived: boolean; minUnit: boolean; unissued: boolean
  stockDate: string; stockWh: '입고창고' | '직접입력'; stockWhId: string
  soldDate: string; soldDue: boolean; unrecvDate: string; unrecvDue: boolean; unissDate: string; unissDue: boolean
}
type UnsoldLine = { itemId: number; unsoldQty: number; orderDate: string; dueDate: string | null }
type UnpurchasedLine = { orderId: number; itemId: number; restQty: number; orderDate: string; statusName: string }
type WoReq = { componentId: number; remainingQty: number }

const today = () => new Date().toLocaleDateString('sv-SE')
const n2 = (v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
/** 원본 '26/10/13' */
const yy = (d: string | null) => (d ? d.slice(2).replace(/-/g, '/') : '')
const sumBy = <T,>(rows: T[], key: (r: T) => number, val: (r: T) => number) => {
  const m = new Map<number, number>()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + (Number(val(r)) || 0))
  return m
}

/**
 * 발주계획조회 [수량조정] 창 · [계산처리] 의 '계산식등록' 창 — 원본 C000076 (2026-10-13 loginaa 실측, QA재고1 계획 C004 포장재 7개).
 *
 * <p>격자: 전표번호 · 품목코드 · 품목명 · 규격 · 입력수량 · 품목별 안전재고(+) · 창고별 안전재고(+) · 미판매(+) · 미불출(+) ·
 * 보유재고(-) · 미입고(-) · 최소구매단위 · <b>발주확정수량</b>(입력칸) · 입고창고명 · 최종계산일자. 단추 저장(F8) · Excel · 닫기.
 * 열면 계산 칸은 0, 발주확정수량은 지금 수량(격자에서 고친 9), 입력수량은 처음 넣은 7.
 *
 * <p>계산식등록: [발주계획수량] 전체 · 미판매 · 품목별안전재고 · 창고별안전재고 · 보유재고 · 미입고 · 최소구매단위 · 미불출
 * (기본 창고별안전재고 · 전체만 꺼짐) / 보유재고기준일(오늘) · 보유재고창고(<b>입고창고</b> | 직접입력) /
 * 기준일(영업주기) + '미판매 · 미입고 · 미불출 기준일 납기일자 사용'(꺼짐). [적용(F8)] 이면
 * 입력수량 + 안전재고 + 미판매 + 미불출 − 보유재고 − 미입고 를 발주확정수량에 넣는다. 원본 실측 7 + 3,070 − 14,620 − 10,800 → <b>0</b>
 * (음수는 0). 저장해야 반영되고 [최종계산일자] 가 그날이 된다.
 *
 * <p>추정한 것(원본 자료로 못 가렸다): 기준일은 그날까지의 전표(납기일자 사용이면 납기가 그날까지)를 센다, 최소구매단위는 그 배수로 올린다,
 * 미입고는 발주확정(발주서를 낸) 줄의 남은 수량이다 — 우리 계획은 발주서와 같은 전표라 계획 단계 것까지 세면 저 자신이 들어간다.
 * 창고별 안전재고는 우리에게 없다(안전재고가 품목 단위) — 원본도 이 회사에서 빈칸이었다.
 */
export default function PlanQtyAdjustModal({ lines, onClose, onSaved }: {
  lines: AdjustLine[]
  onClose: () => void
  onSaved: () => void
}) {
  const pickers = useCondPickers(['warehouses'])
  const [calc, setCalc] = useState<Record<number, Calc>>({})
  const [confirmed, setConfirmed] = useState<Record<number, string>>(() => Object.fromEntries(lines.map((l) => [l.lineId, String(l.qty)])))
  const [checked, setChecked] = useState<Set<number>>(() => new Set(lines.map((l) => l.lineId)))
  const [formulaOpen, setFormulaOpen] = useState(false)
  const [f, setF] = useState<Formula>(() => ({
    sold: true, itemSafety: true, stock: true, unreceived: true, minUnit: true, unissued: true,
    stockDate: today(), stockWh: '입고창고', stockWhId: '',
    soldDate: today(), soldDue: false, unrecvDate: today(), unrecvDue: false, unissDate: today(), unissDue: false,
  }))
  const allOn = f.sold && f.itemSafety && f.stock && f.unreceived && f.minUnit && f.unissued
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<Formula>) => setF((cur) => ({ ...cur, ...patch }))
  const picked = useMemo(() => lines.filter((l) => checked.has(l.lineId)), [lines, checked])

  async function apply() {
    setBusy(true)
    setError('')
    try {
      const [items, stock, unsold, unpurchased, orders, wos] = await Promise.all([
        api.get<Item[]>('/items').then((r) => r.data),
        api.get<StockRow[]>('/stock', { params: { asOf: f.stockDate } }).then((r) => r.data),
        f.sold ? api.get<UnsoldLine[]>('/sales-orders/unsold').then((r) => r.data) : Promise.resolve([] as UnsoldLine[]),
        f.unreceived ? api.get<UnpurchasedLine[]>('/purchase-orders/unpurchased').then((r) => r.data) : Promise.resolve([] as UnpurchasedLine[]),
        f.unreceived && f.unrecvDue ? api.get<PurchaseOrder[]>('/purchase-orders').then((r) => r.data) : Promise.resolve([] as PurchaseOrder[]),
        f.unissued ? api.get<WorkOrder[]>('/work-orders').then((r) => r.data) : Promise.resolve([] as WorkOrder[]),
      ])
      const upTo = (d: string | null | undefined, day: string) => !!d && d <= day
      const soldBy = sumBy(unsold.filter((u) => upTo(f.soldDue ? u.dueDate : u.orderDate, f.soldDate)), (u) => u.itemId, (u) => u.unsoldQty)
      const dueOf = new Map(orders.map((o) => [o.id, o.dueDate]))
      const unrecvBy = sumBy(unpurchased
        .filter((u) => u.statusName === '발주확정')
        .filter((u) => upTo(f.unrecvDue ? dueOf.get(u.orderId) : u.orderDate, f.unrecvDate)), (u) => u.itemId, (u) => u.restQty)
      const openWo = wos.filter((w) => w.status !== 'COMPLETED' && upTo(f.unissDue ? w.dueDate : w.orderDate, f.unissDate))
      const reqs = openWo.length === 0 ? [] : (await api.get<WoReq[]>('/material-issues/wo-requirements', {
        params: { workOrderIds: [...new Set(openWo.map((w) => w.id))].join(',') },
      })).data
      const unissBy = sumBy(reqs, (r) => r.componentId, (r) => r.remainingQty)
      const itemOf = new Map(items.map((i) => [i.id, i]))

      const nextCalc: Record<number, Calc> = { ...calc }
      const nextQty: Record<number, string> = { ...confirmed }
      for (const l of picked) {
        const it = itemOf.get(l.itemId)
        const wh = f.stockWh === '입고창고' ? l.warehouseId : Number(f.stockWhId) || null
        const c: Calc = {
          itemSafety: f.itemSafety ? Number(it?.safetyStock ?? 0) : 0,
          sold: f.sold ? soldBy.get(l.itemId) ?? 0 : 0,
          unissued: f.unissued ? unissBy.get(l.itemId) ?? 0 : 0,
          stock: f.stock ? stock.filter((s) => s.itemId === l.itemId && (wh == null || s.warehouseId === wh)).reduce((a, s) => a + Number(s.quantity), 0) : 0,
          unreceived: f.unreceived ? unrecvBy.get(l.itemId) ?? 0 : 0,
          minUnit: f.minUnit ? Number(it?.minPurchaseUnit ?? 0) : 0,
        }
        let q = l.inputQty + c.itemSafety + c.sold + c.unissued - c.stock - c.unreceived
        if (q < 0) q = 0
        if (c.minUnit > 0 && q > 0) q = Math.ceil(q / c.minUnit) * c.minUnit
        nextCalc[l.lineId] = c
        nextQty[l.lineId] = String(q)
      }
      setCalc(nextCalc)
      setConfirmed(nextQty)
      setFormulaOpen(false)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      for (const l of picked) {
        await api.patch(`/purchase-orders/${l.orderId}/lines/${l.lineId}/plan`, { quantity: Number(confirmed[l.lineId]) || 0, calculated: true })
      }
      onSaved()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const box = (label: string, k: 'sold' | 'itemSafety' | 'stock' | 'unreceived' | 'minUnit' | 'unissued') => (
    <label className="inline-flex items-center gap-[3px] mr-[10px]">
      <input type="checkbox" checked={f[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<Formula>)} /> {label}
    </label>
  )
  const dateRow = (label: string, d: 'soldDate' | 'unrecvDate' | 'unissDate', due: 'soldDue' | 'unrecvDue' | 'unissDue', dueLabel: string) => (<>
    <div className="flex items-center gap-[8px]">
      <span className="w-[150px] shrink-0 text-ec-label">{label}</span>
      <EcDateInput className="ec-input w-[150px]" value={f[d]} onChange={(e) => set({ [d]: e.target.value } as Partial<Formula>)} />
    </div>
    <div className="flex items-center gap-[8px]">
      <span className="w-[150px] shrink-0 text-ec-label">{dueLabel}</span>
      <label className="inline-flex items-center gap-[3px]">
        <input type="checkbox" checked={f[due]} onChange={(e) => set({ [due]: e.target.checked } as Partial<Formula>)} /> 사용
      </label>
    </div>
  </>)

  return (
    <Modal open title="수량조정" width={1180} onClose={onClose} error={error}>
      <div className="mb-[6px]">
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFormulaOpen(true)}>계산처리</button>
      </div>
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={lines.every((l) => checked.has(l.lineId))}
                onChange={(e) => setChecked(e.target.checked ? new Set(lines.map((l) => l.lineId)) : new Set())} />
            </th>
            <th className="text-center">전표번호</th>
            <th className="text-center">품목코드</th>
            <th className="text-center">품목명</th>
            <th className="text-center">규격</th>
            <th className="text-center">입력수량</th>
            <th className="text-center">품목별<br />안전재고<br />(+)</th>
            <th className="text-center">창고별<br />안전재고<br />(+)</th>
            <th className="text-center">미판매<br />(+)</th>
            <th className="text-center">미불출<br />(+)</th>
            <th className="text-center">보유재고<br />(-)</th>
            <th className="text-center">미입고<br />(-)</th>
            <th className="text-center">최소구매단<br />위</th>
            <th className="w-[90px] text-center">발주확정수량</th>
            <th className="text-center">입고창고명</th>
            <th className="text-center">최종계산일자</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const c = calc[l.lineId]
            return (
              <tr key={l.lineId}>
                <td className="text-center">
                  <input type="checkbox" aria-label="선택" checked={checked.has(l.lineId)}
                    onChange={(e) => setChecked((cur) => { const s = new Set(cur); if (e.target.checked) s.add(l.lineId); else s.delete(l.lineId); return s })} />
                </td>
                {/* 원본 '2026/10/13-1' — 일자와 번호 사이에 띄움이 없다. */}
                <td>{dateNo(l.orderDate, l.orderNo).replace(' ', '')}</td>
                <td>{l.itemCode}</td>
                <td>{l.itemName}</td>
                <td>{l.spec ?? ''}</td>
                <td className="text-right">{n2(l.inputQty)}</td>
                <td className="text-right">{n2(c?.itemSafety ?? 0)}</td>
                <td className="text-right"></td>
                <td className="text-right">{n2(c?.sold ?? 0)}</td>
                <td className="text-right">{n2(c?.unissued ?? 0)}</td>
                <td className="text-right">{n2(c?.stock ?? 0)}</td>
                <td className="text-right">{n2(c?.unreceived ?? 0)}</td>
                <td className="text-right">{n2(c?.minUnit ?? 0)}</td>
                <td>
                  <EcNumInput className="ec-input w-full h-[25.2px] px-[1.8px] text-right" aria-label="발주확정수량"
                    value={confirmed[l.lineId] ?? ''} onValue={(v) => setConfirmed((m) => ({ ...m, [l.lineId]: v }))} />
                </td>
                <td>{l.warehouseName ?? ''}</td>
                <td>{yy(l.calcDate)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-[10px] flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={busy || picked.length === 0} onClick={() => void save()}>저장(F8)</button>
        <button type="button" className="ec-btn">Excel</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>

      <Modal open={formulaOpen} title="계산식등록" width={760} onClose={() => setFormulaOpen(false)} error={error}>
        <div className="ec-form grid grid-cols-1 gap-y-[6px]">
          <div className="flex items-center gap-[8px] flex-wrap">
            <span className="w-[150px] shrink-0 text-ec-label">발주계획수량</span>
            <label className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="checkbox" checked={allOn} onChange={(e) => set({ sold: e.target.checked, itemSafety: e.target.checked, stock: e.target.checked,
                unreceived: e.target.checked, minUnit: e.target.checked, unissued: e.target.checked })} /> 전체
            </label>
            {box('미판매', 'sold')}
            {box('품목별안전재고', 'itemSafety')}
            {/* 우리 안전재고는 품목 단위라 창고별이 없다. */}
            <label className="inline-flex items-center gap-[3px] mr-[10px] text-ec-hint">
              <input type="checkbox" disabled checked={false} onChange={() => {}} /> 창고별안전재고
            </label>
            {box('보유재고', 'stock')}
            {box('미입고', 'unreceived')}
            {box('최소구매단위', 'minUnit')}
            {box('미불출', 'unissued')}
          </div>
          <div className="flex items-center gap-[8px]">
            <span className="w-[150px] shrink-0 text-ec-label">보유재고기준일</span>
            <EcDateInput className="ec-input w-[150px]" value={f.stockDate} onChange={(e) => set({ stockDate: e.target.value })} />
          </div>
          <div className="flex items-center gap-[8px]">
            <span className="w-[150px] shrink-0 text-ec-label">보유재고창고</span>
            {(['입고창고', '직접입력'] as const).map((v) => (
              <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
                <input type="radio" name="plan-stock-wh" checked={f.stockWh === v} onChange={() => set({ stockWh: v })} /> {v}
              </label>
            ))}
            {f.stockWh === '직접입력' && (
              <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={f.stockWhId} onChange={(v) => set({ stockWhId: v })} items={pickers.warehouses} />
            )}
          </div>
          {dateRow('기준일(영업주기)', 'soldDate', 'soldDue', '미판매기준일 납기일자')}
          {dateRow('기준일(영업주기)', 'unrecvDate', 'unrecvDue', '미입고기준일 납기일자')}
          {dateRow('기준일(영업주기)', 'unissDate', 'unissDue', '미불출기준일 납기일자')}
        </div>
        <div className="mt-[10px] flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={busy} onClick={() => void apply()}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setFormulaOpen(false)}>닫기</button>
        </div>
      </Modal>
    </Modal>
  )
}

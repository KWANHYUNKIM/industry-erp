import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner } from '../../types/api'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { partnerCodeItems } from '../../utils/codeItems'
import { ymd } from '../../components/EcPeriodPicks'
import { dateNo } from '../../utils/dateNo'
import { ecAlert } from '../../components/EcDialog'

/**
 * 출하입력(E040225) · 출하입력(수정) 창이 같이 쓰는 머리 · 격자 · [출하지시] — 2026-10-21 재고1 출하 바퀴.
 *
 * <p>원본 실측(plans/재고1.md 출하 줄): 머리 일자-No. · 거래처 · 담당자 · 출하창고 · 프로젝트 · 연락처 · 우편번호 · 주소
 * (<b>출하예정일 없음</b>), 격자 품목코드 · 품목명 · 규격 · 수량(<b>단가 · 금액 없음</b>, 합계줄 수량만).
 * [출하지시] → 출하지시서검색창 › 잔량적용(F8) 으로 지시서 잔량을 불러오고, 줄이 이어지면 [출하지시] 단추가 사라진다.
 * 저장한 출하는 출하완료(SHIPPED) — 원본 출하 전표는 '나간 것' 이다. 재고는 움직이지 않는다(판매가 움직인다).
 */
export interface ShipLineRes {
  itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
  quantity: number; unitPrice: number; amount: number; remark: string | null
  orderLineId: number | null; shipmentOrderLineId: number | null
}
export interface ShipmentRes {
  id: number; shipNo: string; partnerId: number; partnerName: string; shipDate: string
  salesOrderId: number | null; salesOrderNo: string | null
  warehouseId: number | null; warehouseName: string | null
  employeeId: number | null; employeeName: string | null
  projectId: number | null; projectName: string | null
  contact: string | null; postalCode: string | null; address: string | null
  status: 'READY' | 'SHIPPED' | 'CANCELED'; statusName: string
  totalQuantity: number; totalAmount: number
  remark: string | null; createdBy: string | null
  createdAt: string | null; updatedAt: string | null
  lines: ShipLineRes[]
}
interface SoLine { id: number; itemId: number; itemName: string; spec: string | null; quantity: number; unshippedQty: number; remark: string | null }
interface SoLite {
  id: number; orderNo: string; orderDate: string; partnerId: number; partnerName: string
  employeeId: number | null; warehouseId: number | null; warehouseName: string | null; projectId: number | null
  contact: string | null; postalCode: string | null; address: string | null
  status: 'IN_PROGRESS' | 'COMPLETED'; statusName: string; totalQuantity: number; lines: SoLine[]
}

interface LineInput { itemId: string; quantity: string; remark: string; soLineId: number | null; orderLineId: number | null; unitPrice: number | null }
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', remark: '', soLineId: null, orderLineId: null, unitPrice: null })
interface Head { shipDate: string; partnerId: string; employeeId: string; warehouseId: string; projectId: string; contact: string; postalCode: string; address: string }
const emptyHead = (): Head => ({ shipDate: ymd(new Date()), partnerId: '', employeeId: '', warehouseId: '', projectId: '', contact: '', postalCode: '', address: '' })
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const soSummary = (s: SoLite) => {
  const f = s.lines[0]
  if (!f) return ''
  const n = f.spec ? `${f.itemName} [${f.spec}]` : f.itemName
  return s.lines.length > 1 ? `${n} 외 ${s.lines.length - 1}건` : n
}

export function useShipmentEntry(editing: ShipmentRes | null) {
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<{ id: number; code: string; name: string }[]>([])
  const [employees, setEmployees] = useState<{ id: number; name: string; code?: string }[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [head, setHead] = useState<Head>(emptyHead)
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])
  const [pickOpen, setPickOpen] = useState(false)
  const [orders, setOrders] = useState<SoLite[]>([])
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<Partner[]>('/partners'), api.get<Item[]>('/items'),
      api.get<{ id: number; code: string; name: string }[]>('/warehouses'),
      api.get<{ id: number; name: string; code?: string }[]>('/employees'),
      api.get<{ id: number; code: string; name: string }[]>('/projects'),
    ]).then(([p, i, w, e, pj]) => { setPartners(p.data); setItems(i.data); setWarehouses(w.data); setEmployees(e.data); setProjects(pj.data) })
      .catch((err) => void ecAlert(extractErrorMessage(err)))
  }, [])

  useEffect(() => {
    if (!editing) { setHead(emptyHead()); setLines([emptyLine()]); return }
    setHead({
      shipDate: editing.shipDate, partnerId: String(editing.partnerId),
      employeeId: editing.employeeId ? String(editing.employeeId) : '', warehouseId: editing.warehouseId ? String(editing.warehouseId) : '',
      projectId: editing.projectId ? String(editing.projectId) : '', contact: editing.contact ?? '',
      postalCode: editing.postalCode ?? '', address: editing.address ?? '',
    })
    setLines([...editing.lines.map((l) => ({
      itemId: String(l.itemId), quantity: String(l.quantity), remark: l.remark ?? '',
      soLineId: l.shipmentOrderLineId, orderLineId: l.orderLineId, unitPrice: l.unitPrice,
    })), emptyLine()])
  }, [editing])

  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  const linked = lines.some((l) => l.soLineId != null)
  const totalQty = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0)
  const setH = (k: keyof Head, v: string) => setHead((h) => ({ ...h, [k]: v }))
  function updateLine(idx: number, field: 'itemId' | 'quantity' | 'remark', value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId' && value && idx === ls.length - 1) next.push(emptyLine())
      return next
    })
  }
  function reset() { setHead(emptyHead()); setLines([emptyLine()]) }

  /** 저장 — 됐으면 true. 원본은 말 없이 빈 폼(화면) · 창 닫힘(수정). */
  async function save(): Promise<boolean> {
    const filled = lines.filter((l) => l.itemId && Number(l.quantity) > 0)
    if (filled.length === 0) {
      void ecAlert('아래의 경우 처리가 불가능합니다.\n자세한 내용은 아래의 사항을 참고하시기 바랍니다.\n아래 사항을 수정 후 다시 진행하시기 바랍니다.\n\n출하입력 - 그리드(표)에 최소 1줄 이상 입력되어야 합니다.')
      return false
    }
    const body = {
      shipDate: head.shipDate || undefined,
      partnerId: head.partnerId ? Number(head.partnerId) : null,
      employeeId: head.employeeId ? Number(head.employeeId) : null,
      warehouseId: head.warehouseId ? Number(head.warehouseId) : null,
      projectId: head.projectId ? Number(head.projectId) : null,
      contact: head.contact || null, postalCode: head.postalCode || null, address: head.address || null,
      remark: editing?.remark ?? null,
      ...(editing ? {} : { status: 'SHIPPED' }),
      lines: filled.map((l) => ({
        itemId: Number(l.itemId), quantity: Number(l.quantity), remark: l.remark || null,
        unitPrice: l.unitPrice, shipmentOrderLineId: l.soLineId, orderLineId: l.orderLineId,
      })),
    }
    try {
      if (editing) await api.put(`/shipments/${editing.id}`, body)
      else await api.post('/shipments', body)
      return true
    } catch (err) { void ecAlert(extractErrorMessage(err)); return false }
  }

  async function openPicker() {
    try {
      const res = await api.get<SoLite[]>('/shipment-orders', { params: { from: '2000-01-01', to: '2999-12-31' } })
      setOrders(res.data.filter((o) => o.status === 'IN_PROGRESS')); setPicked(null); setPickOpen(true)
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  /** 잔량적용(F8) — 지시서 줄의 미출하 잔량을 격자에 채우고 머리를 지시서에서 받는다. */
  async function applyRemain() {
    if (picked == null) { void ecAlert('리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    try {
      const so = (await api.get<SoLite>(`/shipment-orders/${picked}`)).data
      const rem = so.lines.filter((l) => l.unshippedQty > 0)
      if (rem.length === 0) { void ecAlert('출하할 잔량이 없습니다.'); return }
      setHead((h) => ({
        ...h, partnerId: String(so.partnerId),
        employeeId: so.employeeId ? String(so.employeeId) : '', warehouseId: so.warehouseId ? String(so.warehouseId) : '',
        projectId: so.projectId ? String(so.projectId) : '', contact: so.contact ?? '',
        postalCode: so.postalCode ?? '', address: so.address ?? '',
      }))
      setLines([...rem.map((l) => ({ itemId: String(l.itemId), quantity: String(l.unshippedQty), remark: l.remark ?? '', soLineId: l.id, orderLineId: null, unitPrice: null })), emptyLine()])
      setPickOpen(false)
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  const form: ReactNode = (
    <>
      <ul className="ec-form">
        <EcCond label="일자-No.">
          <input type="date" className="ec-input w-[140px]" value={head.shipDate} onChange={(e) => setH('shipDate', e.target.value)} />
          {editing && <span className="ml-[6px]">-{Number(editing.shipNo.split('-').pop())}</span>}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="선택 해제" value={head.partnerId} onChange={(v) => setH('partnerId', v)} items={partnerCodeItems(customers)} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="선택 안 함" value={head.employeeId} onChange={(v) => setH('employeeId', v)}
                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="출하창고" pick>
          <CodePickerField label="출하창고" hideLabel width={200} emptyLabel="선택 안 함" value={head.warehouseId} onChange={(v) => setH('warehouseId', v)}
                           items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="선택 안 함" value={head.projectId} onChange={(v) => setH('projectId', v)}
                           items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="연락처"><input className="ec-input w-[200px]" value={head.contact} onChange={(e) => setH('contact', e.target.value)} /></EcCond>
        <EcCond label="우편번호"><input className="ec-input w-[110px]" value={head.postalCode} onChange={(e) => setH('postalCode', e.target.value)} /></EcCond>
        <EcCond label="주소"><input className="ec-input w-[360px]" value={head.address} onChange={(e) => setH('address', e.target.value)} /></EcCond>
      </ul>

      <div className="ec-toolbar my-[6px] flex gap-[4px]">
        {!linked && <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openPicker()}>출하지시</button>}
      </div>
      <table className="w-full table-fixed text-left">
        <colgroup><col className="w-[35px]" /><col className="w-[160px]" /><col className="w-[169px]" /><col className="w-[88px]" /><col className="w-[93px]" /><col /></colgroup>
        <thead><tr><th className="text-center"></th><th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th>적요</th></tr></thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={idx}>
              <td className="text-center text-ec-hint">{idx + 1}</td>
              <td>
                <CodePickerField label="품목" hideLabel fill placeholder="품목" emptyLabel="선택 해제" value={l.itemId} onChange={(v) => updateLine(idx, 'itemId', v)}
                                 items={items.filter((it) => it.active !== false).map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))} />
              </td>
              <td>{itemById.get(l.itemId)?.name ?? ''}</td>
              <td>{itemById.get(l.itemId)?.spec ?? ''}</td>
              <td><input type="number" className="ec-input w-full text-right" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} /></td>
              <td><input className="ec-input w-full" value={l.remark} onChange={(e) => updateLine(idx, 'remark', e.target.value)} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={4} className="text-right">합계</td><td className="text-right">{qty2(totalQty)}</td><td></td></tr>
        </tfoot>
      </table>

      <Modal open={pickOpen} width={760} title="출하지시서검색창(조회)" onClose={() => setPickOpen(false)}>
        <table className="w-full table-fixed text-left">
          <colgroup><col className="w-[35px]" /><col className="w-[130px]" /><col className="w-[110px]" /><col /><col className="w-[90px]" /><col className="w-[80px]" /></colgroup>
          <thead><tr><th></th><th className="text-center">일자-No.</th><th>창고명</th><th>품목명(요약)</th><th className="text-right">수량합계</th><th className="text-center">진행상태</th></tr></thead>
          <tbody>
            {orders.length === 0 ? <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr> : orders.map((o) => (
              <tr key={o.id}>
                <td className="text-center"><input type="checkbox" checked={picked === o.id} onChange={() => setPicked(picked === o.id ? null : o.id)} /></td>
                <td className="text-center">{dateNo(o.orderDate, o.orderNo)}</td>
                <td>{o.warehouseName ?? ''}</td>
                <td>{soSummary(o)}</td>
                <td className="text-right">{qty2(o.totalQuantity)}</td>
                <td className="text-center">{o.statusName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-[8px] flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void applyRemain()}>잔량적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setPickOpen(false)}>닫기</button>
        </div>
      </Modal>
    </>
  )

  return { form, save, reset }
}

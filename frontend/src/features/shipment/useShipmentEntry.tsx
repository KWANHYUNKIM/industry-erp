import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner } from '../../types/api'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcDateField from '../../components/EcDateField'
import { partnerCodeItems } from '../../utils/codeItems'
import { ymd } from '../../components/EcPeriodPicks'
import { dateNo } from '../../utils/dateNo'
import { ecAlert } from '../../components/EcDialog'
import { useSubmitting } from '../../utils/useSubmitting'

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

interface LineInput { itemId: string; quantity: string; remark: string; soLineId: number | null; orderLineId: number | null; unitPrice: number | null; spec: string | null /* 줄 규격 — null = 품목 규격을 따라감, '' = 일부러 비움 */; name?: string | null /* 줄 품목명 — 없으면 품목 이름을 따라감 */ }
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', remark: '', soLineId: null, orderLineId: null, unitPrice: null, spec: null })
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
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [barcodeOpen, setBarcodeOpen] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [verifyResult, setVerifyResult] = useState<string[] | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<Partner[]>('/partners'), api.get<Item[]>('/items'),
      api.get<{ id: number; code: string; name: string }[]>('/warehouses'),
      api.get<{ id: number; name: string; code?: string }[]>('/sales-reps'),
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
      soLineId: l.shipmentOrderLineId, orderLineId: l.orderLineId, unitPrice: l.unitPrice, spec: l.spec ?? null, name: l.itemName ?? null,
    })), emptyLine()])
  }, [editing])

  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  const linked = lines.some((l) => l.soLineId != null)
  const totalQty = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0)
  const setH = (k: keyof Head, v: string) => setHead((h) => ({ ...h, [k]: v }))
  function updateLine(idx: number, field: 'itemId' | 'quantity' | 'remark' | 'spec' | 'name', value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId') next[idx] = { ...next[idx], spec: null, name: null } // 품목을 새로 고르면 규격도 품목 규격으로 다시 채운다(원본)
      if (field === 'itemId' && value && idx === ls.length - 1) next.push(emptyLine())
      return next
    })
  }
  function reset() { setHead(emptyHead()); setLines([emptyLine()]); setVerifyResult(null) }
  /* 사용중단 품목도 담는다 — 지시서에서 불러온 J001 · J002(사용중단)가 품목코드 칸에 보이고, [사용중단포함] 으로 고를 수 있다. */
  const codeItems = useMemo(
    () => items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword, stopped: it.active === false })),
    [items],
  )
  function sortLines() {
    setLines((ls) => {
      const filled = ls.filter((l) => l.itemId)
      filled.sort((a, b) => (itemById.get(a.itemId)?.code ?? '').localeCompare(itemById.get(b.itemId)?.code ?? ''))
      return [...filled, ...ls.filter((l) => !l.itemId)]
    })
  }
  function scanBarcode() {
    const q = barcode.trim()
    if (!q) return
    const hit = items.find((i) => i.barcode === q) ?? items.find((i) => i.code.toLowerCase() === q.toLowerCase())
    if (!hit) { void ecAlert(`'${q}' 에 해당하는 품목이 없습니다.`); return }
    setLines((ls) => {
      const at = ls.findIndex((l) => l.itemId === String(hit.id))
      if (at >= 0) return ls.map((l, i) => (i === at ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l))
      const filled = { ...emptyLine(), itemId: String(hit.id), quantity: '1' }
      const blank = ls.findIndex((l) => !l.itemId)
      if (blank < 0) return [...ls, filled, emptyLine()]
      const next = ls.map((l, i) => (i === blank ? filled : l))
      return blank === ls.length - 1 ? [...next, emptyLine()] : next
    })
    setBarcode('')
  }
  function verify() {
    const msgs: string[] = []
    if (!head.partnerId) msgs.push('거래처를 선택하세요.')
    lines.forEach((l, i) => { if (l.itemId && !(Number(l.quantity) > 0)) msgs.push(`${i + 1}행: 수량이 0입니다.`) })
    if (!lines.some((l) => l.itemId)) msgs.push('품목을 1줄 이상 입력하세요.')
    setVerifyResult(msgs)
  }
  const todo = (why: string) => ({ disabled: true, title: why })

  /** 저장 요청이 도는 동안 두 번째 저장을 막는다(utils/useSubmitting). */
  const submitting = useSubmitting()
  /** 저장 — 됐으면 true. 원본은 말 없이 빈 폼(화면) · 창 닫힘(수정). 저장 중에 또 누르면 false. */
  async function save(): Promise<boolean> {
    return (await submitting.run(saveInner)) ?? false
  }
  async function saveInner(): Promise<boolean> {
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
        unitPrice: l.unitPrice, shipmentOrderLineId: l.soLineId, orderLineId: l.orderLineId, spec: l.spec ?? undefined, itemName: l.name ?? undefined,
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
      /* 원본 판매입력 [주문] 과 같다 — 잔량이 남은 지시서만, 출하 일자보다 늦은 지시서는 빼고(to=출하 일자).
       * 다 나간 지시서(10/17-1 처럼 잔량 0)가 '진행중' 으로 또 떴다(2026-10-29 QA). */
      const res = await api.get<SoLite[]>('/shipment-orders', { params: { from: '2000-01-01', to: head.shipDate || ymd(new Date()) } })
      setOrders(res.data.filter((o) => o.status === 'IN_PROGRESS' && o.lines.some((l) => l.unshippedQty > 0))); setPicked(null); setPickOpen(true)
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
      setLines([...rem.map((l) => ({ itemId: String(l.itemId), quantity: String(l.unshippedQty), remark: l.remark ?? '', soLineId: l.id, orderLineId: null, unitPrice: null, spec: l.spec ?? null, name: l.itemName ?? null })), emptyLine()])
      setPickOpen(false)
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  const form: ReactNode = (
    <>
      <ul className="ec-form">
        <EcCond label="일자-No.">
          <EcDateField value={head.shipDate} onChange={(v) => setH('shipDate', v)} />
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

      {/* 원본 E040225 툴바 차례: 찾기 · 정렬 · My품목 · 출하지시 · 재고불러오기 · 바코드 · 전표 바코드 · 검증 · 전표불러오기. [출하지시] 는 지시서 줄이 이어지면 빠진다. */}
      <div className="ec-toolbar my-[6px] flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFindOpen((v) => !v)}>찾기(F3)</button>
        {findOpen && <input className="ec-input w-[130px]" autoFocus value={findText} placeholder="품목명·적요" onChange={(e) => setFindText(e.target.value)} />}
        <button type="button" className="ec-btn ec-btn-sm" onClick={sortLines}>정렬</button>
        <button type="button" className="ec-btn ec-btn-sm" {...todo('출하입력의 My품목은 아직 없습니다 — 판매입력에서 씁니다.')}>My품목</button>
        {!linked && <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openPicker()}>출하지시</button>}
        <button type="button" className="ec-btn ec-btn-sm" {...todo('출하입력에서 재고를 불러오는 기능은 아직 없습니다.')}>재고불러오기</button>
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setBarcodeOpen((v) => !v)}>바코드</button>
        {barcodeOpen && (
          <input className="ec-input w-[170px]" autoFocus value={barcode} placeholder="바코드/품목코드 후 Enter"
                 onChange={(e) => setBarcode(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanBarcode() } }} />
        )}
        <button type="button" className="ec-btn ec-btn-sm" {...todo('전표 단위 바코드 출력은 아직 없습니다.')}>전표 바코드</button>
        <button type="button" className="ec-btn ec-btn-sm" onClick={verify}>검증</button>
        <button type="button" className="ec-btn ec-btn-sm" {...todo('다른 전표를 복사해 오는 기능은 아직 없습니다 — [출하지시] 로 지시서 잔량을 불러옵니다.')}>전표불러오기</button>
      </div>
      {verifyResult && (
        <div className={`ec-alert my-[4px] mx-0 ${verifyResult.length ? 'ec-alert-danger' : 'ec-alert-info'}`}>
          {verifyResult.length === 0 ? '문제가 없습니다.' : verifyResult.map((m, i) => <div key={i}>{m}</div>)}
          <button type="button" className="ec-btn ec-btn-sm mt-[4px]" onClick={() => setVerifyResult(null)}>닫기</button>
        </div>
      )}
      <table className="w-full table-fixed text-left">
        <colgroup><col className="w-[35px]" /><col className="w-[100px]" /><col className="w-[229px]" /><col className="w-[88px]" /><col className="w-[93px]" /><col /></colgroup>
        <thead><tr><th className="text-center"></th><th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th>적요</th></tr></thead>
        <tbody>
          {lines.map((l, idx) => {
            const it = itemById.get(l.itemId)
            const needle = findText.trim().toLowerCase()
            const hit = !needle || `${l.name ?? it?.name ?? ''} ${it?.code ?? ''} ${l.remark}`.toLowerCase().includes(needle)
            return (
              <tr key={idx} className={hit ? undefined : 'hidden'}>
                <td className="text-center text-ec-hint">{idx + 1}</td>
                {/* 원본은 품목코드 칸에 코드(J001), 품목명 칸에 이름. 예전에는 코드도움이 이 칸에 이름을 띄웠고 사용중단 품목은 빈칸이었다. */}
                <td className="text-ec-label overflow-hidden whitespace-nowrap">{it?.code ?? ''}</td>
                <td>
                  {l.itemId ? (
                    /* 원본 출하입력: 품목을 고르면 품목명 칸이 글자 칸이 되어 줄마다 이름을 고쳐 쓴다. 고르기 전에는 검색 칸. */
                    <div className="flex">
                      <input className="ec-input w-full" placeholder="품목" value={l.name ?? it?.name ?? ''} maxLength={200} onChange={(e) => updateLine(idx, 'name', e.target.value)} />
                      <button type="button" className="no-ec border-0 bg-transparent cursor-pointer text-ec-hint" title="품목 다시 고르기" onClick={() => updateLine(idx, 'itemId', '')}>🔍</button>
                    </div>
                  ) : (
                    <CodePickerField label="품목" hideLabel fill placeholder="품목" emptyLabel="선택 해제" value={l.itemId} onChange={(v) => updateLine(idx, 'itemId', v)} items={codeItems} />
                  )}
                </td>
                <td><input className="ec-input w-full" value={l.spec ?? it?.spec ?? ''} maxLength={200} disabled={!l.itemId} onChange={(e) => updateLine(idx, 'spec', e.target.value)} /></td>
                <td><input type="number" className="ec-input w-full text-right" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} /></td>
                <td><input className="ec-input w-full" value={l.remark} onChange={(e) => updateLine(idx, 'remark', e.target.value)} /></td>
              </tr>
            )
          })}
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

  return { form, save, reset, busy: submitting.busy }
}

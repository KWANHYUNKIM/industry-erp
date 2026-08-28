import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'

/** 영업 > 출하지시서 — 출하지시(READY) 등록 → 출하처리(SHIPPED). 백엔드 /shipments 연동 */
type ShipStatus = 'READY' | 'SHIPPED' | 'CANCELED'
const STATUS_COLOR: Record<ShipStatus, string> = { READY: '#b6791b', SHIPPED: '#1c7c3c', CANCELED: '#8a929c' }

interface ShipLine { itemId: number; itemCode: string; itemName: string; unit: string; quantity: number; unitPrice: number; amount: number; remark: string | null }
interface Shipment {
  id: number; shipNo: string; partnerId: number; partnerName: string; shipDate: string
  /** 미출하현황에서 생성한 출하면 근거 주문이 실려온다. 직접 등록한 출하는 null. */
  salesOrderId: number | null; salesOrderNo: string | null
  /** 원본 출하지시서입력의 머리 항목들 — 출하예정일 · 출하창고 · 담당자 · 배송지. */
  dueDate: string | null
  warehouseId: number | null; warehouseName: string | null
  employeeId: number | null; employeeName: string | null
  contact: string | null; postalCode: string | null; address: string | null
  status: ShipStatus; statusName: string; totalQuantity: number; totalAmount: number
  remark: string | null; createdBy: string | null; lines: ShipLine[]
}

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())
/**
 * 원본 출하지시서입력 그리드 실측(사본): 품목 · 품목명 · 규격 · 수량 · <b>적요</b>.
 * 전표 적요만으로는 "이 품목만 왜 따로 보내는지" 를 줄에 적을 자리가 없다.
 */
interface LineInput { itemId: string; quantity: string; unitPrice: string; remark: string }
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', unitPrice: '', remark: '' })

export default function ShipmentOrderPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')

  const [partnerId, setPartnerId] = useState('')
  const [shipDate, setShipDate] = useState(today())
  /**
   * 원본 출하지시서입력의 머리 항목들 — 출하예정일 · 출하창고 · 담당자 · 연락처 · 우편번호 · 주소.
   *
   * <p>배송지가 없으면 어디로 보낼지 적을 자리가 없어 적요에 손으로 적게 되고,
   * 그러면 아무 화면도 그걸 배송지로 알아보지 못한다. 출하예정일은 미출하현황의 조건이기도
   * 한데, 값이 없어서 그 조건으로는 아무것도 못 걸렀다.
   */
  const [dueDate, setDueDate] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [contact, setContact] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [address, setAddress] = useState('')
  const [warehouses, setWarehouses] = useState<{ id: number; code: string; name: string }[]>([])
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])
  const [remark, setRemark] = useState('')
  /**
   * 귀속 프로젝트. 출하현황의 [프로젝트] 조건이 이 값을 본다 —
   * 조건만 있고 정할 자리가 없으면 그 조건은 늘 빈칸만 거른다.
   */
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])

  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])

  async function load() {
    try {
      const [s, p, i, w, e, pj] = await Promise.all([
        api.get<Shipment[]>('/shipments'),
        api.get<Partner[]>('/partners'),
        api.get<Item[]>('/items'),
        api.get<{ id: number; code: string; name: string }[]>('/warehouses'),
        api.get<{ id: number; name: string }[]>('/employees'),
        api.get<{ id: number; code: string; name: string }[]>('/projects'),
      ])
      setShipments(s.data); setPartners(p.data); setItems(i.data)
      setWarehouses(w.data); setEmployees(e.data); setProjects(pj.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId' && value) {
        const it = itemById.get(value)
        if (it && !next[idx].unitPrice) next[idx] = { ...next[idx], unitPrice: String(it.unitPrice) }
        if (!next[idx].quantity) next[idx] = { ...next[idx], quantity: '1' }
        if (idx === ls.length - 1) next.push(emptyLine())
      }
      return next
    })
  }

  const computed = lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))
  const totals = lines.reduce((a, l, i) => ({ qty: a.qty + (Number(l.quantity) || 0), amount: a.amount + computed[i] }), { qty: 0, amount: 0 })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: l.unitPrice ? Number(l.unitPrice) : undefined, remark: l.remark || null }))
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (validLines.length === 0) return setError('품목·수량을 1줄 이상 입력하세요.')
    try {
      const res = await api.post<Shipment>('/shipments', {
        partnerId: Number(partnerId), shipDate,
        dueDate: dueDate || undefined,
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        employeeId: employeeId ? Number(employeeId) : undefined,
        contact: contact || undefined,
        postalCode: postalCode || undefined,
        address: address || undefined,
        projectId: projectId ? Number(projectId) : null,
        remark: remark || undefined,
        lines: validLines,
      })
      setOk(`${res.data.shipNo} 출하지시 등록 완료 (수량 ${won(res.data.totalQuantity)})`)
      setLines([emptyLine()]); setRemark(''); setProjectId('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function advance(s: Shipment) {
    try { await api.patch(`/shipments/${s.id}/status`, { status: 'SHIPPED' }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }
  async function cancel(s: Shipment) {
    if (!confirm(`${s.shipNo} 출하지시를 취소할까요?`)) return
    try { await api.patch(`/shipments/${s.id}/status`, { status: 'CANCELED' }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function remove(s: Shipment) {
    if (!confirm(`${s.shipNo} 출하지시를 삭제할까요? 되돌릴 수 없습니다.`)) return
    try { await api.delete(`/shipments/${s.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shownRows = shipments.filter((s) => !keyword || s.partnerName.includes(keyword) || s.shipNo.includes(keyword))

  /* 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. */
  const sort = useTableSort(shownRows, {
    출하번호: (s) => s.shipNo,
    출하일: (s) => s.shipDate,
    거래처: (s) => s.partnerName,
  })
  const shown = sort.sorted
  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }

  return (
    <EcListShell
      title="출하지시서"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '출하지시등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">매출처로 반출할 물품의 출하지시 · 출하지시 → 출하완료. 미출하현황에서 대기건 확인.</p>

      <Modal open={showForm} title="출하지시서 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10 }}>
          <table className="w-full text-left" style={{ marginBottom: 8, maxWidth: 700 }}>
            <tbody>
              <tr>
                <th style={th}>매출처 *</th>
                <td>
                  <select className={inputCls} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ minWidth: 220 }}>
                    <option value="">선택하세요</option>
                    {customers.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                  </select>
                </td>
                <th style={th}>출하일자</th>
                <td><input type="date" className={inputCls} value={shipDate} onChange={(e) => setShipDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>출하창고</th>
                <td>
                  <select className={inputCls} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ minWidth: 220 }}>
                    <option value="">선택 안 함</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
                  </select>
                </td>
                <th style={th}>출하예정일</th>
                <td>
                  <input type="date" className={inputCls} value={dueDate}
                         onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} />
                  <span style={{ fontSize: 11, color: '#8a929c', marginLeft: 6 }}>비우면 출하일자</span>
                </td>
              </tr>
              <tr>
                <th style={th}>담당자</th>
                <td>
                  <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={{ minWidth: 220 }}>
                    <option value="">선택 안 함</option>
                    {employees.map((e2) => <option key={e2.id} value={e2.id}>{e2.name}</option>)}
                  </select>
                </td>
                <th style={th}>연락처</th>
                <td><input className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>프로젝트</th>
                <td>
                  <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}
                          style={{ width: '100%' }}>
                    <option value="">선택 안 함</option>
                    {projects.map((x) => <option key={x.id} value={x.id}>[{x.code}] {x.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={th}>우편번호</th>
                <td><input className={inputCls} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} style={{ width: 110 }} /></td>
                {/* 비우면 서버가 거래처 주소를 채운다. 대개 그리로 보내고, 다른 곳이면 여기 적는다. */}
                <th style={th}>주소</th>
                <td><input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)}
                           placeholder="비우면 거래처 주소" /></td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}></th><th>품목</th>
                <th style={{ width: 120, textAlign: 'right' }}>수량</th>
                <th style={{ width: 140, textAlign: 'right' }}>단가</th>
                <th style={{ width: 150, textAlign: 'right' }}>금액</th>
                <th style={{ width: 180 }}>적요</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td>
                    <select className={inputCls} style={{ width: '100%' }} value={l.itemId} onChange={(e) => updateLine(idx, 'itemId', e.target.value)}>
                      <option value="">선택</option>
                      {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
                    </select>
                  </td>
                  <td><input type="number" className={`${inputCls} text-right`} style={{ width: '100%' }} value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} /></td>
                  <td><input type="number" className={`${inputCls} text-right`} style={{ width: '100%' }} value={l.unitPrice} onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)} /></td>
                  <td style={{ textAlign: 'right' }}>{won(computed[idx])}</td>
                  <td><input className={inputCls} style={{ width: '100%' }} value={l.remark}
                             onChange={(e) => updateLine(idx, 'remark', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={2} style={{ textAlign: 'right' }}>합계</td>
                <td style={{ textAlign: 'right' }}>{won(totals.qty)}</td>
                <td></td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.amount)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input className={inputCls} placeholder="비고" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ flex: 1, maxWidth: 400 }} />
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
          </div>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
        </form>
      )}</Modal>

      {!showForm && error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('출하번호')}>출하번호 {sort.mark('출하번호')}</th><th style={{ width: 130 }}>근거주문</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('출하일')}>출하일 {sort.mark('출하일')}</th>
            <th style={{ width: 100 }}>출하예정일</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처')}>거래처 {sort.mark('거래처')}</th><th style={{ width: 110 }}>출하창고</th><th>품목</th>
            <th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>금액</th>
            <th style={{ width: 110 }}>연락처</th><th style={{ width: 150 }}>적요</th>
            <th style={{ textAlign: 'center' }}>상태</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((s, i) => (
            <tr key={s.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{s.shipNo}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: s.salesOrderNo ? 'var(--ec-blue-dark)' : '#b6bcc4' }}>
                {s.salesOrderNo ?? '직접등록'}
              </td>
              <td>{s.shipDate}</td>
              <td style={{ color: s.dueDate ? undefined : '#c9ced6' }}>{s.dueDate ?? '-'}</td>
              <td>{s.partnerName}</td>
              <td style={{ color: s.warehouseName ? undefined : '#c9ced6' }}>{s.warehouseName ?? '-'}</td>
              <td>{s.lines[0]?.itemName}{s.lines.length > 1 ? ` 외 ${s.lines.length - 1}건` : ''}</td>
              <td style={{ textAlign: 'right' }}>{won(s.totalQuantity)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(s.totalAmount)}</td>
              <td style={{ color: s.contact ? undefined : '#c9ced6' }}>{s.contact || '-'}</td>
              <td style={{ color: '#8a929c' }}>{s.remark ?? ''}</td>
              <td style={{ textAlign: 'center', color: STATUS_COLOR[s.status], fontWeight: 700 }}>{s.statusName}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                {s.status === 'READY' && <button className="no-ec" onClick={() => advance(s)} style={{ border: 'none', background: 'none', color: '#1c7c3c', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>→ 출하완료</button>}
                {s.status === 'READY' && <button className="no-ec" onClick={() => cancel(s)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>취소</button>}
                <button className="no-ec" onClick={() => remove(s)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

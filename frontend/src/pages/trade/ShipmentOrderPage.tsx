import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'

/** 영업 > 출하지시서 — 출하지시(READY) 등록 → 출하처리(SHIPPED). 백엔드 /shipments 연동 */
type ShipStatus = 'READY' | 'SHIPPED' | 'CANCELED'
const STATUS_COLOR: Record<ShipStatus, string> = { READY: '#b6791b', SHIPPED: '#1c7c3c', CANCELED: '#8a929c' }

interface ShipLine { itemId: number; itemCode: string; itemName: string; unit: string; quantity: number; unitPrice: number; amount: number }
interface Shipment {
  id: number; shipNo: string; partnerId: number; partnerName: string; shipDate: string
  status: ShipStatus; statusName: string; totalQuantity: number; totalAmount: number
  remark: string | null; createdBy: string | null; lines: ShipLine[]
}

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)
interface LineInput { itemId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', unitPrice: '' })

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
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])

  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])

  async function load() {
    try {
      const [s, p, i] = await Promise.all([
        api.get<Shipment[]>('/shipments'),
        api.get<Partner[]>('/partners'),
        api.get<Item[]>('/items'),
      ])
      setShipments(s.data); setPartners(p.data); setItems(i.data)
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
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: l.unitPrice ? Number(l.unitPrice) : undefined }))
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (validLines.length === 0) return setError('품목·수량을 1줄 이상 입력하세요.')
    try {
      const res = await api.post<Shipment>('/shipments', { partnerId: Number(partnerId), shipDate, remark: remark || undefined, lines: validLines })
      setOk(`${res.data.shipNo} 출하지시 등록 완료 (수량 ${won(res.data.totalQuantity)})`)
      setLines([emptyLine()]); setRemark('')
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

  const shown = shipments.filter((s) => !keyword || s.partnerName.includes(keyword) || s.shipNo.includes(keyword))
  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }

  return (
    <EcListShell
      title="출하지시서"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '출하지시등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">매출처로 반출할 물품의 출하지시 · 출하지시 → 출하완료. 미출하현황에서 대기건 확인.</p>

      {showForm && (
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
            </tbody>
          </table>

          <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}></th><th>품목</th>
                <th style={{ width: 120, textAlign: 'right' }}>수량</th>
                <th style={{ width: 140, textAlign: 'right' }}>단가</th>
                <th style={{ width: 150, textAlign: 'right' }}>금액</th>
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
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={2} style={{ textAlign: 'right' }}>합계</td>
                <td style={{ textAlign: 'right' }}>{won(totals.qty)}</td>
                <td></td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.amount)}</td>
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
      )}

      {!showForm && error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>출하번호 ▼</th><th>출하일 ▼</th><th>거래처 ▼</th><th>품목</th>
            <th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>금액</th>
            <th style={{ textAlign: 'center' }}>상태</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>출하지시 내역이 없습니다.</td></tr>
          ) : shown.map((s, i) => (
            <tr key={s.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{s.shipNo}</td>
              <td>{s.shipDate}</td>
              <td>{s.partnerName}</td>
              <td>{s.lines[0]?.itemName}{s.lines.length > 1 ? ` 외 ${s.lines.length - 1}건` : ''}</td>
              <td style={{ textAlign: 'right' }}>{won(s.totalQuantity)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(s.totalAmount)}</td>
              <td style={{ textAlign: 'center', color: STATUS_COLOR[s.status], fontWeight: 700 }}>{s.statusName}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                {s.status === 'READY' && <button className="no-ec" onClick={() => advance(s)} style={{ border: 'none', background: 'none', color: '#1c7c3c', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>→ 출하완료</button>}
                {s.status === 'READY' && <button className="no-ec" onClick={() => cancel(s)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>취소</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

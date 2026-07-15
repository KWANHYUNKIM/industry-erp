import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

type OrderStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
const STATUS_LABEL: Record<OrderStatus, string> = { RECEIVED: '접수', IN_PROGRESS: '진행중', COMPLETED: '완료', CANCELED: '취소' }
const STATUS_COLOR: Record<OrderStatus, string> = { RECEIVED: '#c07a00', IN_PROGRESS: 'var(--ec-blue)', COMPLETED: '#1c7c3c', CANCELED: '#8a929c' }
const NEXT: Record<OrderStatus, OrderStatus | null> = { RECEIVED: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', COMPLETED: null, CANCELED: null }

interface OrderLine { itemId: number; itemName: string; unit: string; quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number }
interface SalesOrder {
  id: number; orderNo: string; partnerId: number; partnerName: string
  orderDate: string; dueDate: string | null; status: OrderStatus; statusName: string
  supplyAmount: number; vatAmount: number; totalAmount: number; remark: string | null; lines: OrderLine[]
}

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)
interface LineInput { itemId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', unitPrice: '' })

export default function SalesOrderPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL')

  const [partnerId, setPartnerId] = useState('')
  const [orderDate, setOrderDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [taxable, setTaxable] = useState(true)
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])

  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])

  async function load() {
    try {
      const [o, p, i] = await Promise.all([
        api.get<SalesOrder[]>('/sales-orders'),
        api.get<Partner[]>('/partners'),
        api.get<Item[]>('/items'),
      ])
      setOrders(o.data); setPartners(p.data); setItems(i.data)
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

  const computed = lines.map((l) => {
    const supply = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)
    const vat = taxable ? Math.round(supply * 0.1) : 0
    return { supply, vat, total: supply + vat }
  })
  const totals = computed.reduce((a, c) => ({ supply: a.supply + c.supply, vat: a.vat + c.vat, total: a.total + c.total }), { supply: 0, vat: 0, total: 0 })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }))
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (validLines.length === 0) return setError('품목·수량·단가를 1줄 이상 입력하세요.')
    try {
      const res = await api.post<SalesOrder>('/sales-orders', { partnerId: Number(partnerId), orderDate, dueDate: dueDate || undefined, taxable, remark: remark || undefined, lines: validLines })
      setOk(`${res.data.orderNo} 수주 등록 완료 (합계 ${won(res.data.totalAmount)}원)`)
      setLines([emptyLine()]); setRemark(''); setDueDate('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function advance(o: SalesOrder) {
    const next = NEXT[o.status]
    if (!next) return
    try { await api.patch(`/sales-orders/${o.id}/status`, { status: next }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }
  async function cancel(o: SalesOrder) {
    if (!confirm(`${o.orderNo} 주문을 취소할까요?`)) return
    try { await api.patch(`/sales-orders/${o.id}/status`, { status: 'CANCELED' }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = orders
    .filter((o) => statusFilter === 'ALL' || o.status === statusFilter)
    .filter((o) => !keyword || o.partnerName.includes(keyword) || o.orderNo.includes(keyword))

  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }

  return (
    <EcListShell
      title="오더관리 (수주)"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '수주등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">매출처로부터 받은 주문(수주) 관리 · 접수 → 진행중 → 완료. 실제 출고는 판매입력에서.</p>

      <Modal open={showForm} title="오더관리 (수주) 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10 }}>
          <table className="w-full text-left" style={{ marginBottom: 8, maxWidth: 820 }}>
            <tbody>
              <tr>
                <th style={th}>매출처 *</th>
                <td>
                  <select className={inputCls} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ minWidth: 220 }}>
                    <option value="">선택하세요</option>
                    {customers.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                  </select>
                </td>
                <th style={th}>부가세</th>
                <td>
                  <select className={inputCls} value={taxable ? 'Y' : 'N'} onChange={(e) => setTaxable(e.target.value === 'Y')} style={{ width: 120 }}>
                    <option value="Y">과세 (10%)</option><option value="N">면세</option>
                  </select>
                </td>
              </tr>
              <tr>
                <th style={th}>수주일자</th>
                <td><input type="date" className={inputCls} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>납기일자</th>
                <td><input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}></th><th>품목</th>
                <th style={{ width: 110, textAlign: 'right' }}>수량</th>
                <th style={{ width: 130, textAlign: 'right' }}>단가</th>
                <th style={{ width: 130, textAlign: 'right' }}>공급가액</th>
                <th style={{ width: 110, textAlign: 'right' }}>부가세</th>
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
                  <td style={{ textAlign: 'right' }}>{won(computed[idx].supply)}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(computed[idx].vat)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>합계</td>
                <td style={{ textAlign: 'right' }}>{won(totals.supply)}</td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.total)}</td>
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

      {/* 상태 필터 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {(['ALL', 'RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: statusFilter === s ? 'var(--ec-blue)' : '#fff', color: statusFilter === s ? '#fff' : '#3a4453', fontWeight: statusFilter === s ? 700 : 400,
          }}>{s === 'ALL' ? '전체' : STATUS_LABEL[s]} ({s === 'ALL' ? orders.length : orders.filter((o) => o.status === s).length})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>수주번호 ▼</th><th>수주일 ▼</th><th>거래처 ▼</th><th>품목</th>
            <th style={{ textAlign: 'right' }}>합계금액</th><th>납기일</th>
            <th style={{ textAlign: 'center' }}>진행상태</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>수주 내역이 없습니다.</td></tr>
          ) : shown.map((o, i) => (
            <tr key={o.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{o.orderNo}</td>
              <td>{o.orderDate}</td>
              <td>{o.partnerName}</td>
              <td>{o.lines[0]?.itemName}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(o.totalAmount)}</td>
              <td>{o.dueDate ?? ''}</td>
              <td style={{ textAlign: 'center', color: STATUS_COLOR[o.status], fontWeight: 700 }}>{o.statusName}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                {NEXT[o.status] && <button className="no-ec" onClick={() => advance(o)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>→ {STATUS_LABEL[NEXT[o.status]!]}</button>}
                {o.status !== 'COMPLETED' && o.status !== 'CANCELED' && <button className="no-ec" onClick={() => cancel(o)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>취소</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner, PurchaseOrder, PurchaseOrderStatus, Warehouse } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)

const TABS = ['전체', '발주요청', '발주계획', '단가확정', '발주확정', '입고전환', '취소'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, PurchaseOrderStatus> = {
  발주요청: 'REQUESTED', 발주계획: 'PLANNED', 단가확정: 'PRICED',
  발주확정: 'ORDERED', 입고전환: 'RECEIVED', 취소: 'CANCELLED',
}
const statusColor = (s: PurchaseOrderStatus) =>
  s === 'RECEIVED' ? '#1c7c3c' : s === 'CANCELLED' ? '#8a929c' : s === 'ORDERED' ? 'var(--ec-blue)' : '#5a626e'

interface LineForm { itemId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineForm => ({ itemId: '', quantity: '', unitPrice: '' })

/** 발주서 — 구매 흐름의 시작점. 발주요청 → 발주계획 → 단가확정 → 발주확정 → 입고전환(구매전표 생성). */
export default function PurchaseOrderPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [pricing, setPricing] = useState<PurchaseOrder | null>(null)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<PurchaseOrder[]>('/purchase-orders').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => {
    load()
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data.filter((p) => p.type !== 'CUSTOMER'))).catch(() => {})
    api.get<Warehouse[]>('/warehouses').then((r) => setWarehouses(r.data)).catch(() => {})
  }, [])

  const shown = useMemo(() => rows.filter((r) => tab === '전체' || r.status === TAB_STATUS[tab]), [rows, tab])
  const tabCount = (t: Tab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length

  async function plan(po: PurchaseOrder) {
    const dueDate = window.prompt(`${po.orderNo} 납기 요청일 (YYYY-MM-DD)`, po.dueDate ?? today())
    if (dueDate === null) return
    try { await api.post(`/purchase-orders/${po.id}/plan`, { dueDate: dueDate || null }); flash(`${po.orderNo} 발주계획 확정`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function confirm(po: PurchaseOrder) {
    try { await api.post(`/purchase-orders/${po.id}/confirm`); flash(`${po.orderNo} 발주확정 — 매입처로 발주`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function cancel(po: PurchaseOrder) {
    if (!window.confirm(`${po.orderNo}을(를) 취소할까요?`)) return
    try { await api.post(`/purchase-orders/${po.id}/cancel`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function receive(po: PurchaseOrder) {
    if (warehouses.length === 0) return alert('입고할 창고가 없습니다. 창고를 먼저 등록하세요.')
    const wh = warehouses[0]
    const picked = window.prompt(
      `입고 창고를 선택하세요.\n${warehouses.map((w) => `${w.id}: ${w.name}`).join('\n')}`,
      String(wh.id),
    )
    if (picked === null) return
    const warehouseId = Number(picked)
    if (!warehouses.some((w) => w.id === warehouseId)) return alert('창고 번호가 올바르지 않습니다.')
    try {
      const r = await api.post(`/purchase-orders/${po.id}/receive`, { warehouseId, purchaseDate: today() })
      flash(`구매전표 ${r.data.docNo} 생성 — 재고 입고 완료`)
      load()
      if (window.confirm('생성된 구매전표를 확인할까요?')) navigate('/sales/purchase-list')
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="발주서" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 발주요청(F2)</button>
        <button className="ec-btn" onClick={load}>새로고침</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>
          발주요청 → 발주계획 → 단가확정 → 발주확정 → 입고전환. 재고는 입고전환 시에만 증가합니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({tabCount(t)})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>발주번호</th><th>발주일</th><th>납기요청일</th><th>매입처</th>
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th><th style={{ textAlign: 'right' }}>합계</th>
            <th style={{ textAlign: 'center' }}>상태</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>발주서가 없습니다.</td></tr>
          ) : shown.map((po, i) => (
            <Fragment key={po.id}>
              <tr onClick={() => setOpenId(openId === po.id ? null : po.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{openId === po.id ? '▾ ' : '▸ '}{po.orderNo}</td>
                <td>{po.orderDate}</td>
                <td>{po.dueDate ?? ''}</td>
                <td>{po.partnerName}</td>
                <td style={{ textAlign: 'right' }}>{won(po.supplyAmount)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(po.vatAmount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(po.totalAmount)}</td>
                <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(po.status) }}>{po.statusName}</span></td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    {po.status === 'REQUESTED' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => plan(po)}>발주계획</button>}
                    {(po.status === 'PLANNED' || po.status === 'PRICED') && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setPricing(po)}>단가확정</button>}
                    {po.status === 'PRICED' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => confirm(po)}>발주확정</button>}
                    {po.status === 'ORDERED' && <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => receive(po)}>입고전환</button>}
                    {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => cancel(po)}>취소</button>}
                    {po.status === 'RECEIVED' && <span style={{ fontSize: 11, color: '#1c7c3c' }}>구매 #{po.convertedPurchaseId}</span>}
                  </div>
                </td>
              </tr>
              {openId === po.id && (
                <tr className="no-ec">
                  <td colSpan={10} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead><tr><th style={{ width: 34 }}></th><th>품목코드</th><th>품목명</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th></tr></thead>
                      <tbody>
                        {po.lines.map((l) => (
                          <tr key={l.id}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{l.lineNo}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.quantity)} {l.unit}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.unitPrice)}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.supplyAmount)}</td>
                            <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(l.vatAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {showForm && <PurchaseOrderForm items={items} partners={partners} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); flash('발주요청을 등록했습니다.'); load() }} />}
      {pricing && <PriceForm order={pricing} onClose={() => setPricing(null)} onSaved={() => { setPricing(null); flash('단가를 확정했습니다.'); load() }} />}
    </EcListShell>
  )
}

/** 단가요청 회신 반영: 매입처가 준 단가를 라인별로 확정한다. */
function PriceForm({ order, onClose, onSaved }: { order: PurchaseOrder; onClose: () => void; onSaved: () => void }) {
  const [prices, setPrices] = useState<Record<number, string>>(
    Object.fromEntries(order.lines.map((l) => [l.id, String(l.unitPrice)])),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const supply = order.lines.reduce((sum, l) => sum + l.quantity * (Number(prices[l.id]) || 0), 0)
  const vat = order.taxable ? Math.round(supply * 0.1) : 0

  async function save() {
    setError('')
    const lines = order.lines.map((l) => ({ lineId: l.id, unitPrice: Number(prices[l.id]) || 0 }))
    if (lines.some((l) => l.unitPrice <= 0)) return setError('모든 라인의 단가를 0보다 크게 입력하세요.')
    setSaving(true)
    try {
      await api.post(`/purchase-orders/${order.id}/prices`, { lines })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 640, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>단가확정 — {order.orderNo} ({order.partnerName})</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <thead><tr><th style={{ width: 34 }}></th><th>품목</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ width: 120, textAlign: 'right' }}>확정단가</th><th style={{ textAlign: 'right' }}>공급가액</th></tr></thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{l.lineNo}</td>
                  <td>{l.itemCode} {l.itemName}</td>
                  <td style={{ textAlign: 'right' }}>{won(l.quantity)} {l.unit}</td>
                  <td>
                    <input className="ec-input" type="number" value={prices[l.id] ?? ''} style={{ width: '100%', textAlign: 'right' }}
                      onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} />
                  </td>
                  <td style={{ textAlign: 'right' }}>{won(l.quantity * (Number(prices[l.id]) || 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>공급가액 / 부가세 / 합계</td>
                <td colSpan={2} style={{ textAlign: 'right' }}>{won(supply)} / {won(vat)} / <span style={{ color: 'var(--ec-blue-dark)' }}>{won(supply + vat)}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '단가확정(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function PurchaseOrderForm({ items, partners, onClose, onSaved }: {
  items: Item[]; partners: Partner[]; onClose: () => void; onSaved: () => void
}) {
  const [partnerId, setPartnerId] = useState('')
  const [orderDate, setOrderDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [taxable, setTaxable] = useState(true)   // 거래유형: 부가세율 적용 / 면세
  const [remark, setRemark] = useState('')       // 참조
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const specOf = (itemId: string) => items.find((x) => String(x.id) === itemId)?.spec ?? ''

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function pickItem(i: number, itemId: string) {
    const it = items.find((x) => String(x.id) === itemId)
    setLine(i, { itemId, unitPrice: it ? String(it.unitPrice) : '' })
  }

  const calc = lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))
  const supply = calc.reduce((a, b) => a + b, 0)
  const vat = taxable ? Math.round(supply * 0.1) : 0

  async function save() {
    setError('')
    if (!partnerId) return setError('매입처를 선택하세요.')
    const payload = lines
      .filter((l) => l.itemId && Number(l.quantity) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0 }))
    if (payload.length === 0) return setError('품목을 1개 이상 입력하세요.')
    setSaving(true)
    try {
      await api.post('/purchase-orders', {
        partnerId: Number(partnerId), orderDate, dueDate: dueDate || undefined,
        taxable, remark: remark || undefined, lines: payload,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 720, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>발주요청</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left" style={{ marginBottom: 12 }}>
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>매입처<span style={{ color: '#c60a2e' }}>*</span></th>
                <td>
                  <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 240 }}>
                    <option value="">매입처 선택</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <th style={{ width: 70, background: '#f5f7fa' }}>발주일</th>
                <td><input type="date" className="ec-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>납기요청일</th>
                <td><input type="date" className="ec-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={{ background: '#f5f7fa' }}>거래유형</th>
                <td>
                  <select className="ec-input" value={taxable ? 'VAT' : 'FREE'} onChange={(e) => setTaxable(e.target.value === 'VAT')} style={{ width: 150 }}>
                    <option value="VAT">부가세율 적용</option>
                    <option value="FREE">면세</option>
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>참조</th>
                <td colSpan={3}><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="참조/비고" style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-left">
            <thead><tr><th style={{ width: 34 }}></th><th>품목</th><th style={{ width: 120 }}>규격</th><th style={{ width: 80, textAlign: 'right' }}>수량</th><th style={{ width: 100, textAlign: 'right' }}>예상단가</th><th style={{ textAlign: 'right' }}>공급가액</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>
                    <select className="ec-input" value={l.itemId} onChange={(e) => pickItem(i, e.target.value)} style={{ width: '100%' }}>
                      <option value="">품목 선택</option>
                      {items.map((it) => <option key={it.id} value={it.id}>{it.code} {it.name}</option>)}
                    </select>
                  </td>
                  <td style={{ color: '#6b7280' }}>{specOf(l.itemId)}</td>
                  <td><input className="ec-input" type="number" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td><input className="ec-input" type="number" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td style={{ textAlign: 'right' }}>{won(calc[i])}</td>
                  <td style={{ textAlign: 'center' }}>{lines.length > 1 && <button className="ec-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={5} style={{ textAlign: 'right' }}>공급가액 / 부가세 / 합계</td>
                <td style={{ textAlign: 'right' }} colSpan={2}>{won(supply)} / {won(vat)} / <span style={{ color: 'var(--ec-blue-dark)' }}>{won(supply + vat)}</span></td>
              </tr>
            </tfoot>
          </table>
          <button className="ec-btn" style={{ marginTop: 8 }} onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ 행 추가</button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, MallOrder, MallOrderStatus, MallOverview, Partner, Warehouse } from '../../api/types'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)

const TABS = ['전체', '수집', '확인', '판매전환', '취소'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, MallOrderStatus> = {
  수집: 'RECEIVED', 확인: 'CONFIRMED', 판매전환: 'CONVERTED', 취소: 'CANCELLED',
}
const statusColor = (s: MallOrderStatus) =>
  s === 'CONVERTED' ? '#1c7c3c' : s === 'CANCELLED' ? '#8a929c' : s === 'CONFIRMED' ? 'var(--ec-blue)' : '#c07a00'

/**
 * 재고 I > 쇼핑몰관리 — 외부몰 주문 수집 → 확인 → 판매전환.
 *
 * 재고 차감과 채권 계상은 판매전표가 한다. 쇼핑몰이 재고를 직접 건드리면 같은 사실을
 * 두 곳이 기록하게 되고, 두 숫자는 반드시 갈라진다.
 */
export default function MallPage() {
  const [data, setData] = useState<MallOverview | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [showForm, setShowForm] = useState(false)
  const [converting, setConverting] = useState<MallOrder | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load() {
    setError('')
    try {
      const [o, it, p, w] = await Promise.all([
        api.get<MallOverview>('/mall-orders'),
        api.get<Item[]>('/items'),
        api.get<Partner[]>('/partners'),
        api.get<Warehouse[]>('/warehouses'),
      ])
      setData(o.data)
      setItems(it.data)
      setPartners(p.data.filter((x) => x.type !== 'SUPPLIER'))
      setWarehouses(w.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])

  const orders = data?.orders ?? []
  const shown = useMemo(() => orders.filter((o) => tab === '전체' || o.status === TAB_STATUS[tab]), [orders, tab])
  const tabCount = (t: Tab) => orders.filter((o) => t === '전체' || o.status === TAB_STATUS[t]).length

  async function act(o: MallOrder, action: 'confirm' | 'cancel') {
    if (action === 'cancel' && !window.confirm(`${o.mallOrderNo} 주문을 취소할까요?`)) return
    try {
      await api.post(`/mall-orders/${o.id}/${action}`)
      flash(action === 'confirm' ? '주문을 확인했습니다.' : '주문을 취소했습니다.')
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function mapItem(o: MallOrder, itemId: string) {
    if (!itemId) return
    try {
      await api.put(`/mall-orders/${o.id}/item`, { itemId: Number(itemId) })
      flash('품목을 매핑했습니다.')
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="쇼핑몰관리" actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 주문 수집(F2)</button>
        <span style={{ fontSize: 12, color: '#9aa1ab' }}>
          수집 → 확인 → 판매전환. 재고 차감·채권 계상은 판매전표가 합니다(몰이 재고를 직접 건드리지 않습니다).
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <Box label="총 주문" value={`${data?.totalOrders ?? 0} 건`} color="var(--ec-blue-dark)" bg="#f7f9fb" />
        <Box label="주문 금액" value={`${won(data?.totalAmount ?? 0)} 원`} color="var(--ec-blue)" bg="#f7f9ff" />
        <Box label="품목 미매핑" value={`${data?.unmapped ?? 0} 건`} color={(data?.unmapped ?? 0) > 0 ? '#c60a2e' : '#2f8401'} bg={(data?.unmapped ?? 0) > 0 ? '#fdf6f6' : '#f4faf5'} />
        <Box label="미전환" value={`${data?.unconverted ?? 0} 건`} color={(data?.unconverted ?? 0) > 0 ? '#c07a00' : '#2f8401'} bg="#f7f9fb" />
      </div>

      {(data?.byMall.length ?? 0) > 0 && (
        <>
          <div style={{ padding: '6px 8px', background: '#f5f7fa', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            몰별 집계
          </div>
          <table className="w-full text-left" style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th>몰</th>
                <th style={{ textAlign: 'right' }}>주문 건수</th>
                <th style={{ textAlign: 'right' }}>주문 금액</th>
                <th style={{ textAlign: 'right' }}>미전환</th>
              </tr>
            </thead>
            <tbody>
              {data!.byMall.map((m) => (
                <tr key={m.mall}>
                  <td style={{ fontWeight: 600 }}>{m.mall}</td>
                  <td style={{ textAlign: 'right' }}>{m.orderCount}</td>
                  <td style={{ textAlign: 'right' }}>{won(m.totalAmount)}</td>
                  <td style={{ textAlign: 'right', color: m.unconverted > 0 ? '#c07a00' : '#c3c8cf' }}>{m.unconverted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

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
            <th>몰</th>
            <th>몰 주문번호</th>
            <th>주문일</th>
            <th>구매자</th>
            <th>몰 상품명</th>
            <th style={{ width: 180 }}>품목 매핑</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>금액</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ textAlign: 'center', width: 130 }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>주문이 없습니다.</td></tr>
          ) : shown.map((o, i) => {
            const open = o.status === 'RECEIVED' || o.status === 'CONFIRMED'
            return (
              <tr key={o.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{o.mall}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{o.mallOrderNo}</td>
                <td>{o.orderDate}</td>
                <td>{o.buyerName}</td>
                <td style={{ color: '#5a626e' }}>{o.productName}</td>
                <td>
                  {open ? (
                    <select
                      className="ec-input"
                      value={o.itemId ?? ''}
                      onChange={(e) => mapItem(o, e.target.value)}
                      style={{ width: '100%', borderColor: o.itemId ? undefined : '#c60a2e' }}
                    >
                      <option value="">(미매핑)</option>
                      {items.map((it) => <option key={it.id} value={it.id}>{it.code} {it.name}</option>)}
                    </select>
                  ) : (
                    <span>{o.itemName ?? '-'}</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>{won(o.quantity)}</td>
                <td style={{ textAlign: 'right' }}>{won(o.unitPrice)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(o.totalAmount)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: statusColor(o.status) }}>{o.statusName}</span>
                  {o.salesDocNo && <div style={{ fontSize: 10.5, color: '#1c7c3c' }}>{o.salesDocNo}</div>}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    {o.status === 'RECEIVED' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => act(o, 'confirm')}>확인</button>}
                    {o.status === 'CONFIRMED' && (
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => setConverting(o)}>판매전환</button>
                    )}
                    {open && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => act(o, 'cancel')}>취소</button>}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {showForm && (
        <CollectForm
          items={items}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('주문을 수집했습니다.'); load() }}
        />
      )}
      {converting && (
        <ConvertForm
          order={converting}
          partners={partners}
          warehouses={warehouses}
          onClose={() => setConverting(null)}
          onSaved={(docNo) => { setConverting(null); flash(`판매전표 ${docNo} 생성됨`); load() }}
        />
      )}
    </EcListShell>
  )
}

function Box({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: bg, padding: '10px 14px' }}>
      <div style={{ fontSize: 12, color: '#5a626e' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function CollectForm({ items, onClose, onSaved }: {
  items: Item[]; onClose: () => void; onSaved: () => void
}) {
  const [mall, setMall] = useState('스마트스토어')
  const [mallOrderNo, setMallOrderNo] = useState('')
  const [orderDate, setOrderDate] = useState(today())
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [address, setAddress] = useState('')
  const [productName, setProductName] = useState('')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const total = (Number(quantity) || 0) * (Number(unitPrice) || 0)

  async function save() {
    setError('')
    if (!mall.trim() || !mallOrderNo.trim()) return setError('몰과 몰 주문번호를 입력하세요.')
    if (!buyerName.trim()) return setError('구매자명을 입력하세요.')
    if (!productName.trim()) return setError('몰 상품명을 입력하세요.')
    if (!(Number(quantity) > 0)) return setError('수량은 0보다 커야 합니다.')
    setSaving(true)
    try {
      await api.post('/mall-orders', {
        mall: mall.trim(),
        mallOrderNo: mallOrderNo.trim(),
        orderDate,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim() || null,
        address: address.trim() || null,
        productName: productName.trim(),
        itemId: itemId ? Number(itemId) : null,
        quantity: Number(quantity),
        unitPrice: Number(unitPrice) || 0,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="몰 주문 수집" onClose={onClose} onSave={save} saving={saving} error={error}>
      <table className="w-full text-left">
        <tbody>
          <tr>
            <th style={{ width: 100, background: '#f5f7fa' }}>몰<span style={{ color: '#c60a2e' }}>*</span></th>
            <td><input className="ec-input" value={mall} onChange={(e) => setMall(e.target.value)} style={{ width: 140 }} /></td>
            <th style={{ width: 90, background: '#f5f7fa' }}>몰 주문번호<span style={{ color: '#c60a2e' }}>*</span></th>
            <td><input className="ec-input" value={mallOrderNo} onChange={(e) => setMallOrderNo(e.target.value)} placeholder="예: 2026071400123" style={{ width: 160 }} /></td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>주문일</th>
            <td><input type="date" className="ec-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} style={{ width: 140 }} /></td>
            <th style={{ background: '#f5f7fa' }}>구매자<span style={{ color: '#c60a2e' }}>*</span></th>
            <td><input className="ec-input" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} style={{ width: 160 }} /></td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>연락처</th>
            <td><input className="ec-input" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} style={{ width: 140 }} /></td>
            <th style={{ background: '#f5f7fa' }}>배송지</th>
            <td><input className="ec-input" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: 160 }} /></td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>몰 상품명<span style={{ color: '#c60a2e' }}>*</span></th>
            <td colSpan={3}><input className="ec-input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="몰이 보내준 상품명 원문" style={{ width: '100%' }} /></td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>품목 매핑</th>
            <td colSpan={3}>
              <select className="ec-input" value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ width: 280 }}>
                <option value="">(나중에 매핑)</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.code} {it.name}</option>)}
              </select>
              <span style={{ marginLeft: 8, fontSize: 11.5, color: '#9aa1ab' }}>매핑해야 판매전환할 수 있습니다.</span>
            </td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>수량 / 단가</th>
            <td colSpan={3}>
              <input className="ec-input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: 80, textAlign: 'right' }} />
              <span style={{ margin: '0 6px' }}>×</span>
              <input className="ec-input" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} style={{ width: 120, textAlign: 'right' }} />
              <span style={{ marginLeft: 8, fontWeight: 700 }}>= {won(total)} 원</span>
            </td>
          </tr>
        </tbody>
      </table>
    </Modal>
  )
}

function ConvertForm({ order, partners, warehouses, onClose, onSaved }: {
  order: MallOrder
  partners: Partner[]
  warehouses: Warehouse[]
  onClose: () => void
  onSaved: (docNo: string) => void
}) {
  const [partnerId, setPartnerId] = useState('')
  const [warehouseId, setWarehouseId] = useState(warehouses[0] ? String(warehouses[0].id) : '')
  const [taxable, setTaxable] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!partnerId) return setError('거래처(몰)를 선택하세요.')
    if (!warehouseId) return setError('출고 창고를 선택하세요.')
    setSaving(true)
    try {
      const r = await api.post(`/mall-orders/${order.id}/convert`, {
        partnerId: Number(partnerId), warehouseId: Number(warehouseId), taxable,
      })
      onSaved(r.data.docNo)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`판매전환 — ${order.mall} ${order.mallOrderNo}`} onClose={onClose} onSave={save} saving={saving} error={error}>
      <table className="w-full text-left">
        <tbody>
          <tr>
            <th style={{ width: 110, background: '#f5f7fa' }}>주문</th>
            <td>{order.productName} · {won(order.quantity)}개 × {won(order.unitPrice)}원 = <b>{won(order.totalAmount)}원</b></td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>품목</th>
            <td>{order.itemName ?? <span style={{ color: '#c60a2e' }}>미매핑</span>}</td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>거래처(몰)<span style={{ color: '#c60a2e' }}>*</span></th>
            <td>
              <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 220 }}>
                <option value="">매출처 선택</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>출고 창고<span style={{ color: '#c60a2e' }}>*</span></th>
            <td>
              <select className="ec-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ width: 220 }}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>과세</th>
            <td>
              <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} /> 부가세 10% 부과
              </label>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ marginTop: 10, fontSize: 11.5, color: '#9aa1ab' }}>
        ※ 전환하면 판매전표가 만들어지고 재고가 차감됩니다. 재고가 부족하면 전환이 거부됩니다.
      </p>
    </Modal>
  )
}

function Modal({ title, children, onClose, onSave, saving, error }: {
  title: string
  children: React.ReactNode
  onClose: () => void
  onSave: () => void
  saving: boolean
  error: string
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 620, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{title}</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          {children}
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={onSave} disabled={saving}>{saving ? '처리 중…' : '확인(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

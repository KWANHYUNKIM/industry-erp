import { useEffect, useMemo, useState, useRef} from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, MallOrder, MallOrderStatus, MallOverview, Partner, Warehouse } from '../../types/api'
import { partnerCodeItems } from '../../utils/codeItems'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const today = () => ymd(new Date())

const TABS = ['전체', '수집', '확인', '판매전환', '배송', '반품', '교환', '취소'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, MallOrderStatus> = {
  수집: 'RECEIVED', 확인: 'CONFIRMED', 판매전환: 'CONVERTED', 배송: 'SHIPPED',
  반품: 'RETURNED', 교환: 'EXCHANGED', 취소: 'CANCELLED',
}
const statusColor = (s: MallOrderStatus) =>
  s === 'CONVERTED' || s === 'SHIPPED' ? 'var(--ec-success)'
    : s === 'RETURNED' ? 'var(--ec-danger)' : s === 'EXCHANGED' ? '#8a5cf6'
    : s === 'CANCELLED' ? 'var(--ec-text-hint)' : s === 'CONFIRMED' ? 'var(--ec-blue)' : 'var(--ec-warn)'

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
  const [mallNames, setMallNames] = useState<string[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [showForm, setShowForm] = useState(false)
  const [converting, setConverting] = useState<MallOrder | null>(null)
  const [fulfill, setFulfill] = useState<{ order: MallOrder; action: 'ship' | 'return' | 'exchange' } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load() {
    setError('')
    try {
      const [o, it, p, w, ma] = await Promise.all([
        api.get<MallOverview>('/mall-orders'),
        api.get<Item[]>('/items'),
        api.get<Partner[]>('/partners'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ name: string; active: boolean }[]>('/mall-accounts'),
      ])
      setData(o.data)
      setItems(it.data)
      setPartners(p.data.filter((x) => x.type !== 'SUPPLIER'))
      setWarehouses(w.data)
      setMallNames(ma.data.filter((m) => m.active).map((m) => m.name))
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


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '쇼핑몰', [])

  return (
    <EcListShell title="쇼핑몰관리" actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div className="flex items-center gap-[6px] mb-[8px]">
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 주문 수집(F2)</button>
        <span className="text-[12px] text-ec-hint">
          수집 → 확인 → 판매전환. 재고 차감·채권 계상은 판매전표가 합니다(몰이 재고를 직접 건드리지 않습니다).
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <div className="flex gap-[10px] mb-[10px]">
        <Box label="총 주문" value={`${data?.totalOrders ?? 0} 건`} color="var(--ec-blue-dark)" bg="var(--ec-bg-page)" />
        <Box label="주문 금액" value={`${won(data?.totalAmount ?? 0)} 원`} color="var(--ec-blue)" bg="var(--ec-blue-wash)" />
        <Box label="품목 미매핑" value={`${data?.unmapped ?? 0} 건`} color={(data?.unmapped ?? 0) > 0 ? 'var(--ec-danger)' : '#2f8401'} bg={(data?.unmapped ?? 0) > 0 ? 'var(--ec-danger-bg)' : 'var(--ec-success-bg)'} />
        <Box label="미전환" value={`${data?.unconverted ?? 0} 건`} color={(data?.unconverted ?? 0) > 0 ? 'var(--ec-warn)' : '#2f8401'} bg="var(--ec-bg-page)" />
      </div>

      {(data?.byMall.length ?? 0) > 0 && (
        <>
          <div style={{ padding: '6px 8px', background: 'var(--ec-bg-page)', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            몰별 집계
          </div>
          <table className="w-full text-left mb-[12px]">
            <thead>
              <tr>
                <th>몰</th>
                <th className="text-right">주문 건수</th>
                <th className="text-right">주문 금액</th>
                <th className="text-right">미전환</th>
              </tr>
            </thead>
            <tbody>
              {data!.byMall.map((m) => (
                <tr key={m.mall}>
                  <td className="font-semibold">{m.mall}</td>
                  <td className="text-right">{m.orderCount}</td>
                  <td className="text-right">{won(m.totalAmount)}</td>
                  <td style={{ textAlign: 'right', color: m.unconverted > 0 ? 'var(--ec-warn)' : 'var(--ec-text-off)' }}>{m.unconverted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* 상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다. */}
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t} ({tabCount(t)})
          </button>
        ))}
      </div>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th>몰</th>
            <th>몰 주문번호</th>
            <th>주문일</th>
            <th>구매자</th>
            <th>몰 상품명</th>
            <th className="w-[180px]">품목 매핑</th>
            <th className="text-right">수량</th>
            <th className="text-right">단가</th>
            <th className="text-right">금액</th>
            <th className="text-center">상태</th>
            <th className="text-center w-[130px]">처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o, i) => {
            const open = o.status === 'RECEIVED' || o.status === 'CONFIRMED'
            return (
              <tr key={o.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{o.mall}</td>
                <td className="text-ec-blue">{o.mallOrderNo}</td>
                <td>{dateText(o.orderDate)}</td>
                <td>{o.buyerName}</td>
                <td className="text-ec-label">{o.productName}</td>
                <td>
                  {open ? (
                    /* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). 미매핑이면 빨간 테두리는 감싼 칸이 맡는다. */
                    <div style={{ outline: o.itemId ? undefined : '1px solid var(--ec-danger)' }}>
                      <CodePickerField label="품목" hideLabel fill placeholder="품목(미매핑)" emptyLabel="선택 안 함"
                                       value={String(o.itemId ?? '')} onChange={(v) => mapItem(o, v)}
                                       items={items.filter((it) => it.active !== false || it.id === o.itemId).map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))} />
                    </div>
                  ) : (
                    <span>{o.itemName ?? '-'}</span>
                  )}
                </td>
                <td className="text-right">{won(o.quantity)}</td>
                <td className="text-right">{won(o.unitPrice)}</td>
                <td className="text-right font-bold">{won(o.totalAmount)}</td>
                <td className="text-center">
                  <span style={{ color: statusColor(o.status) }}>{o.statusName}</span>
                  {o.salesDocNo && <div className="text-[10.5px] text-ec-success">{o.salesDocNo}</div>}
                  {o.trackingNo && <div className="text-[10.5px] text-ec-label">{o.courier} {o.trackingNo}</div>}
                  {o.closeReason && <div className="text-[10.5px] text-ec-warn">{o.closedAt}: {o.closeReason}</div>}
                </td>
                <td className="text-center">
                  <div className="inline-flex gap-[3px]">
                    {o.status === 'RECEIVED' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => act(o, 'confirm')}>확인</button>}
                    {o.status === 'CONFIRMED' && (
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => setConverting(o)}>판매전환</button>
                    )}
                    {o.status === 'CONVERTED' && (
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => setFulfill({ order: o, action: 'ship' })}>배송처리</button>
                    )}
                    {o.status === 'SHIPPED' && (
                      <>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => setFulfill({ order: o, action: 'return' })}>반품</button>
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#8a5cf6' }} onClick={() => setFulfill({ order: o, action: 'exchange' })}>교환</button>
                      </>
                    )}
                    {open && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => act(o, 'cancel')}>취소</button>}
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
          mallNames={mallNames}
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
      {fulfill && (
        <FulfillForm
          order={fulfill.order}
          action={fulfill.action}
          onClose={() => setFulfill(null)}
          onSaved={(msg) => { setFulfill(null); flash(msg); load() }}
        />
      )}
    </EcListShell>
  )
}

function FulfillForm({ order, action, onClose, onSaved }: {
  order: MallOrder
  action: 'ship' | 'return' | 'exchange'
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isShip = action === 'ship'
  const [courier, setCourier] = useState(order.courier ?? '')
  const [trackingNo, setTrackingNo] = useState(order.trackingNo ?? '')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(today())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const title = isShip ? '배송처리' : action === 'return' ? '반품처리' : '교환처리'

  async function save() {
    setError('')
    if (isShip && (!courier.trim() || !trackingNo.trim())) return setError('택배사와 송장번호를 입력하세요.')
    if (!isShip && !reason.trim()) return setError('사유를 입력하세요.')
    setSaving(true)
    try {
      if (isShip) {
        await api.post(`/mall-orders/${order.id}/ship`, { courier, trackingNo, shippedAt: date })
        onSaved(`${order.mallOrderNo} 배송처리 완료`)
      } else {
        await api.post(`/mall-orders/${order.id}/${action}`, { reason, courier: courier || undefined, trackingNo: trackingNo || undefined, closedAt: date })
        onSaved(`${order.mallOrderNo} ${title} 완료`)
      }
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 460, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">{title}</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <p className="text-[12.5px] text-ec-label mb-[10px]">
            {order.mall} / {order.mallOrderNo} · {order.buyerName} · {order.productName}
          </p>
          <table className="w-full text-left"><tbody>
            {(isShip || action === 'exchange') && (
              <>
                <tr>
                  <th className="w-[90px] bg-ec-page">택배사{isShip && <span className="text-ec-danger">*</span>}</th>
                  <td><input className="ec-input" value={courier} onChange={(e) => setCourier(e.target.value)} style={{ width: '100%' }} placeholder="예: CJ대한통운" /></td>
                </tr>
                <tr>
                  <th className="bg-ec-page">송장번호{isShip && <span className="text-ec-danger">*</span>}</th>
                  <td><input className="ec-input" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} style={{ width: '100%' }} /></td>
                </tr>
              </>
            )}
            {!isShip && (
              <tr>
                <th className="bg-ec-page">사유<span className="text-ec-danger">*</span></th>
                <td><input className="ec-input" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }} placeholder={action === 'return' ? '예: 단순변심' : '예: 사이즈 교환'} /></td>
              </tr>
            )}
            <tr>
              <th className="bg-ec-page">{isShip ? '배송일' : '처리일'}</th>
              <td><input className="ec-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} /></td>
            </tr>
          </tbody></table>
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '처리 중…' : title}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function Box({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: bg, padding: '10px 14px' }}>
      <div className="text-[12px] text-ec-label">{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function CollectForm({ items, mallNames, onClose, onSaved }: {
  items: Item[]; mallNames: string[]; onClose: () => void; onSaved: () => void
}) {
  const [mall, setMall] = useState(mallNames[0] ?? '스마트스토어')
  const [mallOrderNo, setMallOrderNo] = useState('')
  const [orderDate, setOrderDate] = useState(today())
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [address, setAddress] = useState('')
  const [productName, setProductName] = useState('')
  const [mallProductCode, setMallProductCode] = useState('')
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
        mallProductCode: mallProductCode.trim() || null,
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
            <th className="w-[100px] bg-ec-page">몰<span className="text-ec-danger">*</span></th>
            <td>
              <input className="ec-input" value={mall} onChange={(e) => setMall(e.target.value)} style={{ width: 140 }} list="mall-name-list" />
              <datalist id="mall-name-list">{mallNames.map((n) => <option key={n} value={n} />)}</datalist>
            </td>
            <th className="w-[90px] bg-ec-page">몰 주문번호<span className="text-ec-danger">*</span></th>
            <td><input className="ec-input" value={mallOrderNo} onChange={(e) => setMallOrderNo(e.target.value)} placeholder="예: 2026071400123" style={{ width: 160 }} /></td>
          </tr>
          <tr>
            <th className="bg-ec-page">주문일</th>
            <td><input type="date" className="ec-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} style={{ width: 140 }} /></td>
            <th className="bg-ec-page">구매자<span className="text-ec-danger">*</span></th>
            <td><input className="ec-input" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} style={{ width: 160 }} /></td>
          </tr>
          <tr>
            <th className="bg-ec-page">연락처</th>
            <td><input className="ec-input" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} style={{ width: 140 }} /></td>
            <th className="bg-ec-page">배송지</th>
            <td><input className="ec-input" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: 160 }} /></td>
          </tr>
          <tr>
            <th className="bg-ec-page">몰 상품명<span className="text-ec-danger">*</span></th>
            <td colSpan={3}><input className="ec-input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="몰이 보내준 상품명 원문" style={{ width: '100%' }} /></td>
          </tr>
          <tr>
            <th className="bg-ec-page">몰품목코드</th>
            <td colSpan={3}>
              <input className="ec-input" value={mallProductCode} onChange={(e) => setMallProductCode(e.target.value)} placeholder="몰 상품 key (예: NSP-1001)" style={{ width: 220 }} />
              <span className="ml-[8px] text-[11.5px] text-ec-hint">품목코드연결에 등록돼 있으면 품목이 자동 연결됩니다.</span>
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">품목 매핑</th>
            <td colSpan={3}>
            {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다. */}
            <CodePickerField label="품목 매핑" hideLabel width={280} emptyLabel="(비우면 몰품목코드로 자동연결 시도)"
                             value={itemId} onChange={setItemId}
                             items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
              <span className="ml-[8px] text-[11.5px] text-ec-hint">매핑해야 판매전환할 수 있습니다.</span>
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">수량 / 단가</th>
            <td colSpan={3}>
              <input className="ec-input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: 80, textAlign: 'right' }} />
              <span className="my-0 mx-[6px]">×</span>
              <input className="ec-input" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} style={{ width: 120, textAlign: 'right' }} />
              <span className="ml-[8px] font-bold">= {won(total)} 원</span>
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
            <th className="w-[110px] bg-ec-page">주문</th>
            <td>{order.productName} · {won(order.quantity)}개 × {won(order.unitPrice)}원 = <b>{won(order.totalAmount)}원</b></td>
          </tr>
          <tr>
            <th className="bg-ec-page">품목</th>
            <td>{order.itemName ?? <span className="text-ec-danger">미매핑</span>}</td>
          </tr>
          <tr>
            <th className="bg-ec-page">거래처(몰)<span className="text-ec-danger">*</span></th>
            <td>
              <CodePickerField label="거래처(몰)" hideLabel width={220} emptyLabel="선택 안 함" placeholder="매출처 선택"
                               value={partnerId} onChange={setPartnerId}
                               items={partnerCodeItems(partners.filter((p) => p.type !== 'SUPPLIER'))} />
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">출고 창고<span className="text-ec-danger">*</span></th>
            <td>
              <select className="ec-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ width: 220 }}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <th className="bg-ec-page">과세</th>
            <td>
              <label className="text-[12.5px] flex items-center gap-[4px]">
                <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} /> 부가세 10% 부과
              </label>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-[10px] text-[11.5px] text-ec-hint">
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
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">{title}</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          {children}
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={onSave} disabled={saving}>{saving ? '처리 중…' : '확인(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

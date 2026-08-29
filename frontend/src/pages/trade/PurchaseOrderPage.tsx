import { Fragment, useEffect, useMemo, useState, useRef} from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import type { Currency, EmployeeMaster, Item, Partner, PurchaseOrder, PurchaseOrderStatus, Warehouse } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())

const TABS = ['전체', '발주요청', '발주계획', '단가확정', '발주확정', '입고전환', '취소'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, PurchaseOrderStatus> = {
  발주요청: 'REQUESTED', 발주계획: 'PLANNED', 단가확정: 'PRICED',
  발주확정: 'ORDERED', 입고전환: 'RECEIVED', 취소: 'CANCELLED',
}
const statusColor = (s: PurchaseOrderStatus) =>
  s === 'RECEIVED' ? '#1c7c3c' : s === 'CANCELLED' ? '#8a929c' : s === 'ORDERED' ? 'var(--ec-blue)' : '#5a626e'

interface LineForm { itemId: string; quantity: string; unitPrice: string; partnerId: string; remark: string }
const emptyLine = (): LineForm => ({ itemId: '', quantity: '', unitPrice: '', partnerId: '', remark: '' })

/** 발주서 — 구매 흐름의 시작점. 발주요청 → 발주계획 → 단가확정 → 발주확정 → 입고전환(구매전표 생성). */
export default function PurchaseOrderPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [orderNoCond, setOrderNoCond] = useState('')
  const [whCond, setWhCond] = useState('')
  /* 원본 발주서 조건 차례: 발주No. · 내.외자구분 · 창고 · <b>프로젝트</b> · 거래처 · 품목. */
  const [projCond, setProjCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const condPickers = useCondPickers(['warehouses', 'partners', 'items'])
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [pricing, setPricing] = useState<PurchaseOrder | null>(null)
  const [company, setCompany] = useState<DocParty | null>(null)

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
    api.get<{ id: number; code: string; name: string }[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => {})
    api.get<Currency[]>('/currencies').then((r) => setCurrencies(r.data)).catch(() => {})
  }, [])

  /*
   * 원본 발주서의 조건 차례는 <b>발주No. · 내.외자구분 · 창고 · 프로젝트 · 거래처 · 품목 ·
   * 발송여부</b> 다(사본 실측). 우리 목록에는 <b>알약(진행 단계)뿐</b>이라
   * 발주번호를 알아도 눈으로 찾아야 했다. 넷을 만든다 —
   * [프로젝트]는 발주 응답에 그 값이 없고, [내.외자구분]·[발송여부]는 우리 전표에 없다.
   */
  const shown = useMemo(() => rows
    .filter((r) => tab === '전체' || r.status === TAB_STATUS[tab])
    .filter((r) => !orderNoCond || r.orderNo.includes(orderNoCond))
    .filter((r) => !whCond || (r.warehouseName ?? '').includes(whCond))
    .filter((r) => !projCond || r.projectName === projCond)
    .filter((r) => !partnerCond || r.partnerName.includes(partnerCond))
    .filter((r) => !itemCond || r.lines.some((l) => l.itemName.includes(itemCond))),
    [rows, tab, orderNoCond, whCond, projCond, partnerCond, itemCond])
  const tabCount = (t: Tab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length

  useEffect(() => { loadSupplierParty().then(setCompany) }, [])

  /**
   * 발주서 인쇄. 발주서는 우리가 <b>발주자</b>이고 거래처가 물품을 대는 쪽이라,
   * 명세서와 공급자/공급받는자 위치가 반대다.
   */
  async function printOrder(po: PurchaseOrder) {
    const p = partners.find((x) => x.id === po.partnerId)
    await printDocuments([{
      title: '발 주 서',
      docNo: po.orderNo,
      docDate: po.orderDate,
      supplier: {
        label: '수신처(공급자)', name: po.partnerName,
        bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem,
        tel: p?.phone, address: p?.address,
      },
      customer: company ? { ...company, label: '발주자' } : { label: '발주자', name: '(회사정보 미등록)' },
      extra: [
        { label: '납기일', value: po.dueDate },
        /* 납기일과 다른 값이다 — 이건 그 단가가 언제까지 유효하냐다. */
        { label: '단가 유효기간', value: po.priceValidUntil },
        { label: '입고창고', value: po.warehouseName },
        { label: '담당', value: po.employeeName ?? po.createdBy },
        { label: '진행상태', value: po.statusName },
      ],
      remark: po.remark,
      lines: po.lines.map((l) => ({
        itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
        quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount,
      })),
      footNote: '아래와 같이 발주하오니 납기를 준수하여 주시기 바랍니다.',
    }])
  }

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

  async function remove(po: PurchaseOrder) {
    if (!window.confirm(`${po.orderNo}을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return
    try { await api.delete(`/purchase-orders/${po.id}`); load() }
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

      {/* 상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다. */}
      {/* 원본 조건 차례: 발주No. · … · 창고 · … · 거래처 · 품목 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="발주No.">
          <input className="ec-input" value={orderNoCond}
                 onChange={(e) => setOrderNoCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond} items={condPickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projCond} onChange={setProjCond}
                           items={projects.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={condPickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={condPickers.items} />
        </EcCond>
      </ul>

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

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            {/*
              원본 발주서의 열은 <b>일자-No. · 거래처명 · 담당자명 · 품목명[규격명] ·
              납기일자 · 발주금액합계 · 진행상태 · 생성한 전표 · 인쇄</b> 다(사본 실측).
              우리는 이름이 여섯 군데 다르고, 일자와 번호를 둘로 나눴으며,
              <b>담당자·품목·생성한 전표</b> 셋이 아예 없었다 — 셋 다 응답에 이미 오는 값이다.
              규격은 발주 라인 응답에 없어 이름만 적는다 — 열 이름은 원본 그대로 둔다.
              공급가액·부가세는 원본에 없지만 그대로 둔다(더 보여 주는 것이라 어긋남이 아니다).
            */}
            <th style={{ width: 190 }}>일자-No.</th>
            <th>거래처명</th>
            <th style={{ width: 90 }}>담당자명</th>
            <th>품목명[규격명]</th>
            <th style={{ width: 100, textAlign: 'center' }}>납기일자</th>
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th><th style={{ textAlign: 'right' }}>발주금액합계</th>
            <th style={{ textAlign: 'center' }}>진행상태</th>
            {/* 원본은 이 칸을 <b>36px</b> 로 둔다 — 전표로 가는 짧은 링크 자리다.
                우리도 번호만 짧게 적는다(110 은 담당자명·납기일자보다 넓어 앞뒤가 뒤집혔다). */}
            <th style={{ width: 60, textAlign: 'center' }}>생성한 전표</th>
            <th style={{ textAlign: 'center' }}>인쇄</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((po, i) => (
            <Fragment key={po.id}>
              <tr onClick={() => setOpenId(openId === po.id ? null : po.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>
                  {openId === po.id ? '▾ ' : '▸ '}{po.orderDate} {po.orderNo}
                </td>
                <td>{po.partnerName}</td>
                <td style={{ color: po.employeeName ? undefined : '#c9ced6' }}>{po.employeeName ?? '-'}</td>
                {/* 여러 줄이면 첫 줄에 '외 N건' 을 붙인다 — 원본도 한 칸에 대표 품목을 적는다. */}
                <td>
                  {po.lines[0]
                    ? po.lines[0].itemName
                      + (po.lines.length > 1 ? ` 외 ${po.lines.length - 1}건` : '')
                    : ''}
                </td>
                <td style={{ textAlign: 'center' }}>{po.dueDate ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{won(po.supplyAmount)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(po.vatAmount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(po.totalAmount)}</td>
                <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(po.status) }}>{po.statusName}</span></td>
                {/* 원본 [생성한 전표] — 입고로 넘어가며 만들어진 구매 전표를 가리킨다. */}
                <td style={{ textAlign: 'center', color: po.convertedPurchaseId ? 'var(--ec-blue)' : '#c9ced6' }}>
                  {po.convertedPurchaseId ? `#${po.convertedPurchaseId}` : '-'}
                </td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => printOrder(po)}>인쇄</button>
                    {po.status === 'REQUESTED' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => plan(po)}>발주계획</button>}
                    {(po.status === 'PLANNED' || po.status === 'PRICED') && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setPricing(po)}>단가확정</button>}
                    {po.status === 'PRICED' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => confirm(po)}>발주확정</button>}
                    {po.status === 'ORDERED' && <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => receive(po)}>입고전환</button>}
                    {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => cancel(po)}>취소</button>}
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(po)}>삭제</button>
                  </div>
                </td>
              </tr>
              {openId === po.id && (
                <tr className="no-ec">
                  <td colSpan={12} style={{ padding: 0, background: '#fafbfc' }}>
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

      {showForm && <PurchaseOrderForm items={items} partners={partners} employees={employees} warehouses={warehouses} projects={projects} currencies={currencies} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); flash('발주요청을 등록했습니다.'); load() }} />}
      {pricing && <PriceForm order={pricing} onClose={() => setPricing(null)} onSaved={() => { setPricing(null); flash('단가를 확정했습니다.'); load() }} />}
    </EcListShell>
  )
}

/** 단가요청 회신 반영: 매입처가 준 단가를 라인별로 확정한다. */
function PriceForm({ order, onClose, onSaved }: { order: PurchaseOrder; onClose: () => void; onSaved: () => void }) {
  const [prices, setPrices] = useState<Record<number, string>>(
    Object.fromEntries(order.lines.map((l) => [l.id, String(l.unitPrice)])),
  )
  /*
   * 매입처는 단가와 함께 <b>언제까지 유효한지</b>를 준다. 여기서 안 받으면 그 값은
   * 어디서도 들어올 데가 없다 — 원본 단가요청진행단계의 [유효기간] 이 늘 빈칸이 된다.
   * 안 적어도 된다(유효기간을 안 다는 거래처도 있다).
   */
  const [validUntil, setValidUntil] = useState(order.priceValidUntil ?? '')
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
      await api.post(`/purchase-orders/${order.id}/prices`,
        { lines, priceValidUntil: validUntil || undefined })
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
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)', alignItems: 'center' }}>
          <label style={{ fontSize: 12.5, color: '#5a626e', display: 'flex', alignItems: 'center', gap: 5 }}>
            유효기간
            <input type="date" className="ec-input" value={validUntil}
                   onChange={(e) => setValidUntil(e.target.value)} style={{ width: 145 }} />
          </label>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '단가확정(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function PurchaseOrderForm({ items, partners, employees, warehouses, projects, currencies, onClose, onSaved }: {
  items: Item[]; partners: Partner[]; employees: EmployeeMaster[]; warehouses: Warehouse[]
  projects: { id: number; code: string; name: string }[]; currencies: Currency[]
  onClose: () => void; onSaved: () => void
}) {
  const [partnerId, setPartnerId] = useState('')
  const [orderDate, setOrderDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [employeeId, setEmployeeId] = useState('')   // 담당자
  const [warehouseId, setWarehouseId] = useState('') // 입고창고
  /* 원본 발주서입력의 [프로젝트]. 발주 단계가 빠져 프로젝트별 손익에 안 잡혔다. */
  const [projectId, setProjectId] = useState('')
  const [currency, setCurrency] = useState('KRW')    // 통화
  const [taxable, setTaxable] = useState(true)   // 거래유형: 부가세율 적용 / 면세
  const [remark, setRemark] = useState('')       // 참조
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const specOf = (itemId: string) => items.find((x) => String(x.id) === itemId)?.spec ?? ''
  /* 원본 격자의 [단위] — 품목이 들고 있는 값이라 고르면 바로 따라 붙는다. */
  const unitOf = (itemId: string) => items.find((x) => String(x.id) === itemId)?.unit ?? ''

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function pickItem(i: number, itemId: string) {
    const it = items.find((x) => String(x.id) === itemId)
    // 발주는 사는 쪽이다 — 판매단가가 아니라 <b>구매단가</b>를 채운다.
    // 구매단가를 안 정한 품목(0)은 비워 둔다. 판매가를 채우면 그게 발주단가로 굳는다.
    const pp = it?.purchasePrice ?? 0
    setLine(i, { itemId, unitPrice: pp > 0 ? String(pp) : '' })
  }

  const calc = lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))
  const supply = calc.reduce((a, b) => a + b, 0)
  const vat = taxable ? Math.round(supply * 0.1) : 0

  async function save() {
    setError('')
    if (!partnerId) return setError('매입처를 선택하세요.')
    const payload = lines
      .filter((l) => l.itemId && Number(l.quantity) > 0)
      .map((l) => ({
        itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0,
        partnerId: l.partnerId ? Number(l.partnerId) : undefined,
        remark: l.remark || undefined,
      }))
    if (payload.length === 0) return setError('품목을 1개 이상 입력하세요.')
    setSaving(true)
    try {
      await api.post('/purchase-orders', {
        partnerId: Number(partnerId), orderDate, dueDate: dueDate || undefined,
        employeeId: employeeId ? Number(employeeId) : undefined,
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        projectId: projectId ? Number(projectId) : undefined,
        currency,
        taxable, remark: remark || undefined, lines: payload,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '발주서 품목 격자', [])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 880, maxWidth: '96vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
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
                {/* 원본 발주서입력의 이름은 [발주일]이 아니라 <b>[일자]</b> 다(사본 실측). */}
                <th style={{ width: 70, background: '#f5f7fa' }}>일자</th>
                <td><input type="date" className="ec-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                {/* 원본 발주서입력의 이름은 [납기요청일]이 아니라 <b>[납기일자]</b> 다(사본 실측).
                    목록 열도 이미 [납기일자]라 <b>우리끼리도 어긋나</b> 있었다. */}
                <th style={{ background: '#f5f7fa' }}>납기일자</th>
                <td><input type="date" className="ec-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} /></td>
{/* 원본 차례: 담당자 · 거래유형 · 통화 · 참조 — 담당자가 거래유형보다 앞이다. */}
                {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다 —
                    사원·창고가 몇십 개만 돼도 드롭다운으로는 코드로 못 찾는다. */}
                <th style={{ background: '#f5f7fa' }}>담당자</th>
                <td>
                  <CodePickerField label="담당자" hideLabel width={150} emptyLabel="담당자 선택"
                                   value={employeeId} onChange={setEmployeeId}
                                   items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>거래유형</th>
                <td>
                  <select className="ec-input" value={taxable ? 'VAT' : 'FREE'} onChange={(e) => setTaxable(e.target.value === 'VAT')} style={{ width: 150 }}>
                    <option value="VAT">부가세율 적용</option>
                    <option value="FREE">면세</option>
                  </select>
                </td>
                {/* 원본 발주서입력의 이름은 [창고]가 아니라 <b>[입고창고]</b> 다 — 목록 상세도 그렇게 적는다. */}
                <th style={{ background: '#f5f7fa' }}>입고창고</th>
                <td>
                  <CodePickerField label="입고창고" hideLabel width={150} emptyLabel="창고 선택"
                                   value={warehouseId} onChange={setWarehouseId}
                                   items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>통화</th>
                <td>
                  <select className="ec-input" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 150 }}>
                    <option value="KRW">내자(KRW)</option>
                    {currencies.filter((c) => c.code !== 'KRW').map((c) => <option key={c.id} value={c.code}>{c.code} {c.name}</option>)}
                  </select>
                </td>
                <th style={{ background: '#f5f7fa' }}>참조</th>
                <td><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="참조/비고" style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                {/* 원본 발주서입력 차례의 <b>맨 뒤</b>가 [프로젝트]다(사본 실측). */}
                <th style={{ background: '#f5f7fa' }}>프로젝트</th>
                <td colSpan={3}>
                  <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="선택 안 함"
                                   value={projectId} onChange={setProjectId}
                                   items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
            </tbody>
          </table>

          <table ref={tableRef} className="w-full text-left">
            {/*
              원본 발주서입력 격자에는 <b>[No.]·[단위]·[단가(vat포함)]</b> 도 있다(사본 실측).
              줄 번호는 <b>첫 칸에 찍고도 이름이 없어</b> 무엇인지 몰랐고, 단위는 품목이 들고 있는데
              안 보여 "3" 이 세 개인지 세 박스인지 알 수 없었다. 부가세 포함 단가는 <b>매입처가 부르는 값</b>이라
              머릿속으로 곱해 보고 있었다.
            */}
            <thead><tr><th style={{ width: 30 }}></th><th>품목</th><th style={{ width: 100 }}>규격</th><th style={{ width: 130 }}>거래처</th><th style={{ width: 70, textAlign: 'right' }}>수량</th><th style={{ width: 90, textAlign: 'right' }}>예상단가</th><th style={{ textAlign: 'right' }}>공급가액</th><th style={{ width: 110 }}>적요</th><th style={{ width: 40 }}>No.</th><th style={{ width: 46 }}>단위</th><th style={{ width: 100, textAlign: 'right' }}>단가(vat포함)</th><th style={{ width: 34 }}></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>
                    <CodePickerField label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제"
                                     value={l.itemId} onChange={(v) => pickItem(i, v)}
                                     items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} />
                  </td>
                  <td style={{ color: '#6b7280' }}>{specOf(l.itemId)}</td>
                  <td>
                    <select className="ec-input" value={l.partnerId} onChange={(e) => setLine(i, { partnerId: e.target.value })} style={{ width: '100%' }}>
                      <option value="">(헤더 매입처)</option>
                      {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td><input className="ec-input" type="number" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td><input className="ec-input" type="number" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td style={{ textAlign: 'right' }}>{won(calc[i])}</td>
                  <td><input className="ec-input" value={l.remark} onChange={(e) => setLine(i, { remark: e.target.value })} style={{ width: '100%' }} /></td>
                  <td style={{ color: '#6b7280' }}>{i + 1}</td>
                  <td style={{ color: '#6b7280' }}>{unitOf(l.itemId)}</td>
                  <td style={{ textAlign: 'right', color: '#6b7280' }}>{won(Math.round(Number(l.unitPrice || 0) * (taxable ? 1.1 : 1)))}</td>
                  <td style={{ textAlign: 'center' }}>{lines.length > 1 && <button className="ec-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={6} style={{ textAlign: 'right' }}>공급가액 / 부가세 / 합계</td>
                <td style={{ textAlign: 'right' }} colSpan={6}>{won(supply)} / {won(vat)} / <span style={{ color: 'var(--ec-blue-dark)' }}>{won(supply + vat)}</span></td>
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

import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 영업관리 > 주문서현황 (이카운트 E040209)
 * 수주(SalesOrder) 전표를 품목라인 단위로 펼쳐, 주문/출하/미출하 진척과 금액을 보는 현황 화면.
 * 데이터는 GET /api/sales-orders (SalesOrderResponse[]) 를 그대로 사용한다.
 *
 * 이카운트 원본 Search 패널은 기준일자·거래처·창고·품목·프로젝트를 갖지만,
 * 우리 SalesOrderResponse 에는 창고·프로젝트 필드가 없어 두 조건은 **의도적으로 제외**한다
 * (구매현황 선례와 동일 — 값 없는 컨트롤을 흉내내지 않는다). 대신 수주 고유의 상태·미출하를 조건에 둔다.
 */
type OrderStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'

const STATUS_LABEL: Record<OrderStatus, string> = {
  RECEIVED: '접수', IN_PROGRESS: '진행중', COMPLETED: '완료', CANCELED: '취소',
}
const STATUS_COLOR: Record<OrderStatus, string> = {
  RECEIVED: '#c07a00', IN_PROGRESS: 'var(--ec-blue)', COMPLETED: '#1c7c3c', CANCELED: '#8a929c',
}

interface OrderLineResponse {
  lineId: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  quantity: number
  shippedQty: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
}
interface SalesOrderResponse {
  id: number
  orderNo: string
  partnerId: number
  partnerName: string
  orderDate: string
  dueDate: string | null
  status: OrderStatus
  statusName: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  remark: string | null
  createdBy: string | null
  lines: OrderLineResponse[]
}

interface Row {
  key: string
  date: string
  dueDate: string | null
  orderNo: string
  partner: string
  status: OrderStatus
  statusName: string
  itemName: string
  unit: string
  qty: number
  shippedQty: number
  unshipped: number
  unitPrice: number
  supply: number
  vat: number
}

interface Filters {
  dateFrom: string
  dateTo: string
  partner: string
  item: string
  status: '' | OrderStatus
  unshippedOnly: boolean
  sortByDoc: boolean
}

const EMPTY_FILTERS: Filters = {
  dateFrom: '', dateTo: '', partner: '', item: '', status: '', unshippedOnly: false, sortByDoc: false,
}

export default function SalesOrderStatusPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [panelOpen, setPanelOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SalesOrderResponse[]>('/sales-orders')
      const flat: Row[] = []
      for (const d of res.data) {
        d.lines.forEach((l, idx) => {
          const shipped = l.shippedQty ?? 0
          flat.push({
            key: `${d.id}-${l.lineId ?? idx}`,
            date: d.orderDate,
            dueDate: d.dueDate,
            orderNo: d.orderNo,
            partner: d.partnerName,
            status: d.status,
            statusName: d.statusName,
            itemName: l.itemName,
            unit: l.unit,
            qty: l.quantity,
            shippedQty: shipped,
            unshipped: Math.max(l.quantity - shipped, 0),
            unitPrice: l.unitPrice,
            supply: l.supplyAmount,
            vat: l.vatAmount,
          })
        })
      }
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    const f = filters
    const out = rows.filter((r) => {
      if (kw && !r.partner.includes(kw) && !r.itemName.includes(kw) && !r.orderNo.includes(kw)) return false
      if (f.dateFrom && r.date < f.dateFrom) return false
      if (f.dateTo && r.date > f.dateTo) return false
      if (f.partner && !r.partner.includes(f.partner)) return false
      if (f.item && !r.itemName.includes(f.item)) return false
      if (f.status && r.status !== f.status) return false
      if (f.unshippedOnly && r.unshipped <= 0) return false
      return true
    })
    out.sort((a, b) => f.sortByDoc
      ? (a.orderNo < b.orderNo ? 1 : a.orderNo > b.orderNo ? -1 : 0)
      : (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return out
  }, [rows, keyword, filters])

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ supply: s.supply + r.supply, vat: s.vat + r.vat, unshipped: s.unshipped + r.unshipped }),
    { supply: 0, vat: 0, unshipped: 0 },
  ), [shown])

  const activeCount = useMemo(() => {
    let n = 0
    if (filters.dateFrom || filters.dateTo) n++
    if (filters.partner) n++
    if (filters.item) n++
    if (filters.status) n++
    if (filters.unshippedOnly) n++
    if (filters.sortByDoc) n++
    return n
  }, [filters])

  const applyDraft = () => { setFilters(draft); setPanelOpen(false) }
  const resetDraft = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS) }
  const openPanel = () => { setDraft(filters); setPanelOpen((v) => !v) }

  return (
    <EcListShell
      title="주문서현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button className="ec-btn" onClick={openPanel}>
          상세검색 {panelOpen ? '▲' : '▼'}{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        {activeCount > 0 && !panelOpen && (
          <button className="ec-btn" onClick={resetDraft} style={{ fontSize: 12, color: '#8a929c' }}>
            조건 해제
          </button>
        )}
      </div>

      {panelOpen && (
        <SearchPanel
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onApply={applyDraft}
          onReset={resetDraft}
        />
      )}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        미출하수량 <b style={{ color: '#c07a00', fontSize: 14 }}>{totals.unshipped.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자 ▼</th>
            <th>납기</th>
            <th>주문번호</th>
            <th>매출처</th>
            <th style={{ textAlign: 'center' }}>진행</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>주문수량</th>
            <th style={{ textAlign: 'right' }}>출하수량</th>
            <th style={{ textAlign: 'right' }}>미출하</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '주문 내역이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ fontFamily: 'monospace', color: r.dueDate ? '#5a626e' : '#c5cbd3' }}>{r.dueDate ?? '-'}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
              <td>{r.partner}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ color: STATUS_COLOR[r.status], fontWeight: 600, fontSize: 12 }}>
                  {r.statusName || STATUS_LABEL[r.status]}
                </span>
              </td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{r.shippedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: r.unshipped > 0 ? 600 : 400, color: r.unshipped > 0 ? '#c07a00' : '#c5cbd3' }}>{r.unshipped.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>{r.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.vat.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

/** 이카운트 Search 패널 — 기준일자/거래처/품목/진행상태/기타 */
function SearchPanel({
  draft, onChange, onApply, onReset,
}: {
  draft: Filters
  onChange: (patch: Partial<Filters>) => void
  onApply: () => void
  onReset: () => void
}) {
  const label: React.CSSProperties = {
    width: 90, fontSize: 12.5, color: '#3c4553', fontWeight: 600,
    display: 'flex', alignItems: 'center', paddingRight: 8,
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #eef1f5',
  }
  return (
    <div
      onKeyDown={(e) => { if (e.key === 'Enter') onApply() }}
      style={{
        border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe',
        padding: '4px 14px 12px', marginBottom: 10,
      }}
    >
      <div style={rowStyle}>
        <span style={label}>기준일자</span>
        <input type="date" className="ec-input" value={draft.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })} style={{ width: 150 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" value={draft.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })} style={{ width: 150 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>거래처</span>
        <input className="ec-input" placeholder="매출처명 일부" value={draft.partner}
          onChange={(e) => onChange({ partner: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>품목</span>
        <input className="ec-input" placeholder="품목명 일부" value={draft.item}
          onChange={(e) => onChange({ item: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>진행상태</span>
        <select className="ec-input" value={draft.status}
          onChange={(e) => onChange({ status: e.target.value as Filters['status'] })} style={{ width: 150 }}>
          <option value="">전체</option>
          <option value="RECEIVED">접수</option>
          <option value="IN_PROGRESS">진행중</option>
          <option value="COMPLETED">완료</option>
          <option value="CANCELED">취소</option>
        </select>
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>기타</span>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginRight: 16 }}>
          <input type="checkbox" checked={draft.unshippedOnly}
            onChange={(e) => onChange({ unshippedOnly: e.target.checked })} />
          미출하만
        </label>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.sortByDoc}
            onChange={(e) => onChange({ sortByDoc: e.target.checked })} />
          주문번호순(정렬)
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="ec-btn" onClick={onReset}>초기화</button>
        <button className="ec-btn ec-btn-primary" onClick={onApply}>조회</button>
      </div>
    </div>
  )
}

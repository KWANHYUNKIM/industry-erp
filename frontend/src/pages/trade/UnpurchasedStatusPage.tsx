import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../api/types'

/**
 * 구매관리 > 미구매현황 (이카운트 E040307)
 * "발주는 했으나 아직 입고(구매)되지 않은 발주서" — 입고 후속조치 대상.
 * 데이터는 GET /api/purchase-orders 를 그대로 쓰고, 미입고(입고전환·취소 아님) 발주서만 라인 단위로 펼친다.
 *
 * ── 데이터 모델 주의 ──
 * 이카운트 원본은 발주 라인별 '부분 미구매수량'(발주수량 − 이미 입고된 수량)을 보여준다.
 * 우리 모델은 발주서를 **통짜로** 입고 전환한다(PurchaseOrder.convertedPurchaseId 하나). 라인별 부분 입고가 없으므로
 * 미입고 발주의 발주수량 전체가 곧 미구매수량이다. 이 한계 안에서 '입고 안 된 발주'를 충실히 보여준다.
 *
 * 원본 Search 패널의 거래처관리담당자·프로젝트는 PurchaseOrder 에 필드가 없어 **의도적 제외**.
 * 거래처·담당자·발주No.·창고·품목은 실제 필드가 있어 그대로 배선한다(주문서현황·미주문현황보다 조건이 풍부).
 */

/** 미구매 = 아직 입고전환/취소되지 않은 발주 단계 */
const OPEN_STATUS: PurchaseOrderStatus[] = ['REQUESTED', 'PLANNED', 'PRICED', 'ORDERED']
const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '#8a929c', PLANNED: '#8a929c', PRICED: '#c07a00', ORDERED: 'var(--ec-blue)',
  RECEIVED: '#1c7c3c', CANCELLED: '#c5cbd3',
}

interface Row {
  key: string
  date: string
  dueDate: string | null
  orderNo: string
  partner: string
  warehouse: string
  employee: string
  status: PurchaseOrderStatus
  statusName: string
  itemName: string
  qty: number
  unitPrice: number
  supply: number
  vat: number
}

interface Filters {
  dateFrom: string
  dateTo: string
  partner: string
  employee: string
  orderNo: string
  warehouse: string
  item: string
  status: '' | PurchaseOrderStatus
  sortByDoc: boolean
}

const EMPTY_FILTERS: Filters = {
  dateFrom: '', dateTo: '', partner: '', employee: '', orderNo: '', warehouse: '', item: '', status: '', sortByDoc: false,
}

export default function UnpurchasedStatusPage() {
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
      const res = await api.get<PurchaseOrder[]>('/purchase-orders')
      const flat: Row[] = []
      for (const o of res.data) {
        if (!OPEN_STATUS.includes(o.status)) continue   // 입고전환·취소 발주는 미구매 아님
        o.lines.forEach((l) => flat.push({
          key: `${o.id}-${l.id}`,
          date: o.orderDate,
          dueDate: o.dueDate,
          orderNo: o.orderNo,
          partner: o.partnerName,
          warehouse: o.warehouseName ?? '',
          employee: o.employeeName ?? '',
          status: o.status,
          statusName: o.statusName,
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          supply: l.supplyAmount,
          vat: l.vatAmount,
        }))
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
      if (f.employee && !r.employee.includes(f.employee)) return false
      if (f.orderNo && !r.orderNo.includes(f.orderNo)) return false
      if (f.warehouse && !r.warehouse.includes(f.warehouse)) return false
      if (f.item && !r.itemName.includes(f.item)) return false
      if (f.status && r.status !== f.status) return false
      return true
    })
    out.sort((a, b) => f.sortByDoc
      ? (a.orderNo < b.orderNo ? 1 : a.orderNo > b.orderNo ? -1 : 0)
      : (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return out
  }, [rows, keyword, filters])

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ qty: s.qty + r.qty, supply: s.supply + r.supply, vat: s.vat + r.vat }),
    { qty: 0, supply: 0, vat: 0 },
  ), [shown])

  const activeCount = useMemo(() => {
    let n = 0
    if (filters.dateFrom || filters.dateTo) n++
    if (filters.partner) n++
    if (filters.employee) n++
    if (filters.orderNo) n++
    if (filters.warehouse) n++
    if (filters.item) n++
    if (filters.status) n++
    if (filters.sortByDoc) n++
    return n
  }, [filters])

  const applyDraft = () => { setFilters(draft); setPanelOpen(false) }
  const resetDraft = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS) }
  const openPanel = () => { setDraft(filters); setPanelOpen((v) => !v) }

  return (
    <EcListShell
      title="미구매현황"
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
        <span style={{ fontSize: 11.5, color: '#9aa1ab', marginLeft: 'auto' }}>
          미입고(발주요청·계획·단가확정·발주확정) 발주 기준
        </span>
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
        미구매수량 <b style={{ color: '#c07a00', fontSize: 14 }}>{totals.qty.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>발주일자 ▼</th>
            <th>납기</th>
            <th>발주번호</th>
            <th>매입처</th>
            <th>창고</th>
            <th>담당자</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>미구매수량</th>
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
              {rows.length === 0 ? '미구매(미입고) 발주가 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ fontFamily: 'monospace', color: r.dueDate ? '#5a626e' : '#c5cbd3' }}>{r.dueDate ?? '-'}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
              <td>{r.partner}</td>
              <td style={{ color: r.warehouse ? undefined : '#c5cbd3' }}>{r.warehouse || '-'}</td>
              <td style={{ color: r.employee ? undefined : '#c5cbd3' }}>{r.employee || '-'}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ color: STATUS_COLOR[r.status], fontWeight: 600, fontSize: 12 }}>{r.statusName}</span>
              </td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#c07a00' }}>{r.qty.toLocaleString()}</td>
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

/** 이카운트 Search 패널 — 기준일자/거래처/담당자/발주No./창고/품목/상태 */
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
        <input className="ec-input" placeholder="매입처명 일부" value={draft.partner}
          onChange={(e) => onChange({ partner: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>담당자</span>
        <input className="ec-input" placeholder="담당자명 일부" value={draft.employee}
          onChange={(e) => onChange({ employee: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>발주No.</span>
        <input className="ec-input" placeholder="발주번호 일부" value={draft.orderNo}
          onChange={(e) => onChange({ orderNo: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>창고</span>
        <input className="ec-input" placeholder="창고명 일부" value={draft.warehouse}
          onChange={(e) => onChange({ warehouse: e.target.value })} style={{ width: 220 }} />
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
          <option value="">전체(미입고)</option>
          <option value="REQUESTED">발주요청</option>
          <option value="PLANNED">발주계획</option>
          <option value="PRICED">단가확정</option>
          <option value="ORDERED">발주확정</option>
        </select>
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>기타</span>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.sortByDoc}
            onChange={(e) => onChange({ sortByDoc: e.target.checked })} />
          발주번호순(정렬)
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="ec-btn" onClick={onReset}>초기화</button>
        <button className="ec-btn ec-btn-primary" onClick={onApply}>조회</button>
      </div>
    </div>
  )
}

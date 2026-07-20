import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Quotation, QuotationStatus } from '../../api/types'

/**
 * 영업관리 > 미주문현황 (이카운트 E040211)
 * "아직 수주(주문)로 전환되지 않은 견적" — 영업 후속조치 대상 목록.
 * 데이터는 GET /api/quotations 를 그대로 쓰고, 미전환(작성/발송) 견적만 라인 단위로 펼친다.
 *
 * ── 데이터 모델 주의 ──
 * 이카운트 원본은 견적 라인별 '부분 미주문수량'(견적수량 − 이미 주문된 수량)을 보여준다.
 * 우리 모델은 견적서를 **통짜로** 수주 전환한다(Quotation.convertedOrderId 하나). 라인별 부분 전환이 없으므로
 * 미전환 견적의 견적수량 전체가 곧 미주문수량이다. 이 한계 안에서 '전환 안 된 견적'을 충실히 보여준다.
 *
 * 원본 Search 패널의 창고·프로젝트·담당자·거래처관리담당자·관리항목은 Quotation 에 필드가 없어 **의도적 제외**
 * (구매현황·주문서현황 선례와 동일). 실제 데이터가 있는 기준일자·거래처·견적No.·품목만 조건으로 둔다.
 */

/** 미주문 = 아직 수주 전환/취소되지 않은 상태 */
const OPEN_STATUS: QuotationStatus[] = ['DRAFT', 'SENT']
const statusColor = (s: QuotationStatus) => (s === 'SENT' ? 'var(--ec-blue)' : '#5a626e')

interface Row {
  key: string
  date: string
  validUntil: string | null
  quoteNo: string
  partner: string
  status: QuotationStatus
  statusName: string
  itemName: string
  qty: number
  unitPrice: number
  supply: number
  vat: number
  expired: boolean
}

interface Filters {
  dateFrom: string
  dateTo: string
  partner: string
  quoteNo: string
  item: string
  expiredOnly: boolean
  sortByDoc: boolean
}

const EMPTY_FILTERS: Filters = {
  dateFrom: '', dateTo: '', partner: '', quoteNo: '', item: '', expiredOnly: false, sortByDoc: false,
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function UnorderedStatusPage() {
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
      const res = await api.get<Quotation[]>('/quotations')
      const today = todayStr()
      const flat: Row[] = []
      for (const q of res.data) {
        if (!OPEN_STATUS.includes(q.status)) continue   // 수주전환·취소 견적은 미주문 아님
        q.lines.forEach((l) => flat.push({
          key: `${q.id}-${l.id}`,
          date: q.quoteDate,
          validUntil: q.validUntil,
          quoteNo: q.quoteNo,
          partner: q.partnerName,
          status: q.status,
          statusName: q.statusName,
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          supply: l.supplyAmount,
          vat: l.vatAmount,
          expired: !!q.validUntil && q.validUntil < today,
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
      if (kw && !r.partner.includes(kw) && !r.itemName.includes(kw) && !r.quoteNo.includes(kw)) return false
      if (f.dateFrom && r.date < f.dateFrom) return false
      if (f.dateTo && r.date > f.dateTo) return false
      if (f.partner && !r.partner.includes(f.partner)) return false
      if (f.quoteNo && !r.quoteNo.includes(f.quoteNo)) return false
      if (f.item && !r.itemName.includes(f.item)) return false
      if (f.expiredOnly && !r.expired) return false
      return true
    })
    out.sort((a, b) => f.sortByDoc
      ? (a.quoteNo < b.quoteNo ? 1 : a.quoteNo > b.quoteNo ? -1 : 0)
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
    if (filters.quoteNo) n++
    if (filters.item) n++
    if (filters.expiredOnly) n++
    if (filters.sortByDoc) n++
    return n
  }, [filters])

  const applyDraft = () => { setFilters(draft); setPanelOpen(false) }
  const resetDraft = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS) }
  const openPanel = () => { setDraft(filters); setPanelOpen((v) => !v) }

  return (
    <EcListShell
      title="미주문현황"
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
          미전환(작성·발송) 견적 기준
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
        미주문수량 <b style={{ color: '#c07a00', fontSize: 14 }}>{totals.qty.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>견적일자 ▼</th>
            <th>유효기간</th>
            <th>견적번호</th>
            <th>매출처</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>미주문수량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '미주문(미전환) 견적이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ fontFamily: 'monospace', color: r.expired ? '#c60a2e' : r.validUntil ? '#5a626e' : '#c5cbd3' }}>
                {r.validUntil ?? '-'}{r.expired ? ' (경과)' : ''}
              </td>
              <td style={{ fontFamily: 'monospace' }}>{r.quoteNo}</td>
              <td>{r.partner}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ color: statusColor(r.status), fontWeight: 600, fontSize: 12 }}>{r.statusName}</span>
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

/** 이카운트 Search 패널 — 기준일자/거래처/견적No./품목/기타 */
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
        <span style={label}>견적No.</span>
        <input className="ec-input" placeholder="견적번호 일부" value={draft.quoteNo}
          onChange={(e) => onChange({ quoteNo: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>품목</span>
        <input className="ec-input" placeholder="품목명 일부" value={draft.item}
          onChange={(e) => onChange({ item: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>기타</span>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginRight: 16 }}>
          <input type="checkbox" checked={draft.expiredOnly}
            onChange={(e) => onChange({ expiredOnly: e.target.checked })} />
          유효기간 경과만
        </label>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.sortByDoc}
            onChange={(e) => onChange({ sortByDoc: e.target.checked })} />
          견적번호순(정렬)
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="ec-btn" onClick={onReset}>초기화</button>
        <button className="ec-btn ec-btn-primary" onClick={onApply}>조회</button>
      </div>
    </div>
  )
}

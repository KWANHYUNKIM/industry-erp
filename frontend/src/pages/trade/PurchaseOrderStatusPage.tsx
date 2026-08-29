import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../api/types'
import { dateText } from '../../utils/dateText'
import { periodOf } from '../../components/EcPeriodPicks'
import { aggregate, GROUP_KEYS, type GroupKey } from '../../utils/statusAggregate'

/**
 * 구매관리 > 발주서현황 (이카운트 E040306)
 * 발주서(PurchaseOrder) 전체를 품목라인 단위로 펼친 발주 원장. 상태 무관 전량을 본다
 * (미입고만 보는 미구매현황 E040307 과 짝을 이룬다). 데이터는 GET /api/purchase-orders 그대로 사용.
 *
 * 이카운트 원본 Search 패널은 필드가 수십 개(거래처계층그룹·집계조건1~5·품목그룹·프로젝트그룹·최종수정자 등)지만,
 * 우리 PurchaseOrder 데이터로 실제 거를 수 있는 것만 둔다: 거래처·담당자·발주No.·창고·품목·진행상태.
 * 나머지는 대응 필드가 없어 **의도적 제외**(값 없는 컨트롤을 흉내내지 않는다).
 */
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '발주요청', PLANNED: '발주계획', PRICED: '단가확정',
  ORDERED: '발주확정', RECEIVED: '입고전환', CANCELLED: '취소',
}
const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '#8a929c', PLANNED: '#8a929c', PRICED: '#c07a00',
  ORDERED: 'var(--ec-blue)', RECEIVED: '#1c7c3c', CANCELLED: '#c5cbd3',
}

interface Row {
  key: string
  date: string
  dueDate: string | null
  orderNo: string
  partner: string
  warehouse: string
  /** 원본 발주서현황의 [프로젝트]. 발주에 프로젝트 칸을 만들면서 같이 실어 온다. */
  project: string
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
  project: string
  item: string
  status: '' | PurchaseOrderStatus
  sortByDoc: boolean
}

/*
 * 원본 발주서현황은 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 비워 두어 열면 몇 해치 발주가 쏟아졌다.
 */
const initP = periodOf('금월(~오늘)')!

const EMPTY_FILTERS: Filters = {
  dateFrom: initP.from, dateTo: initP.to, partner: '', employee: '', orderNo: '', warehouse: '', project: '', item: '', status: '', sortByDoc: false,
}

export default function PurchaseOrderStatusPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 원본 발주서현황의 <b>[구분]</b>은 [내역]·[집계] 다(사본 실측 — checked 는 내역).
   * 우리는 내역만 있어서 "이 거래처에 이번 달 얼마어치 발주했나" 를 <b>눈으로 더해야</b>
   * 했다. 집계 셈은 판매·구매현황과 같은 규칙(utils/statusAggregate)을 쓴다 —
   * 같은 계산을 세 곳에 적으면 반드시 어긋난다.
   */
  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  const [group1, setGroup1] = useState<GroupKey>('거래처별')
  const [group2, setGroup2] = useState<GroupKey | ''>('')
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
        o.lines.forEach((l) => flat.push({
          key: `${o.id}-${l.id}`,
          date: o.orderDate,
          dueDate: o.dueDate,
          orderNo: o.orderNo,
          partner: o.partnerName,
          warehouse: o.warehouseName ?? '',
          project: o.projectName ?? '',
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
      if (f.project && !r.project.includes(f.project)) return false
      if (f.item && !r.itemName.includes(f.item)) return false
      if (f.status && r.status !== f.status) return false
      return true
    })
    out.sort((a, b) => f.sortByDoc
      ? (a.orderNo < b.orderNo ? 1 : a.orderNo > b.orderNo ? -1 : 0)
      : (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return out
  }, [rows, keyword, filters])

  /* 집계는 판매·구매현황과 같은 규칙을 쓴다 — 계산은 utils/statusAggregate 가 진다. */
  /* 2차 집계조건을 고르면 열이 하나 늘어난다 — 늘 때마다 머리와 칸이 맞는지 본다. */
  const aggRef = useRef<HTMLTableElement>(null)
  const grouped = useMemo(() => (mode !== '집계' ? [] : aggregate(
    shown.map((r) => ({
      ...r, docNo: r.orderNo, warehouseName: r.warehouse, projectName: r.project || null,
      employeeName: r.employee || null, taxable: r.vat > 0, managementItemName: null,
    })), group1, group2)), [shown, mode, group1, group2])

  useTableColumnCheck(aggRef, '발주서현황 집계', [group1, group2])
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


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    발주일자: (r) => r.date,
  })

  return (
    <EcListShell
      title="발주서현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: '인쇄' }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {/* 원본 조건 판 첫째 <b>[구분]</b> — 내역·집계(사본 실측). */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>구분</span>
        <div className="ec-pills">
          {(['내역', '집계'] as const).map((m) => (
            <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                    onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
        {mode === '집계' && (
          <>
            <select className="ec-input" value={group1} onChange={(e) => setGroup1(e.target.value as GroupKey)} style={{ width: 140 }}>
              {GROUP_KEYS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="ec-input" value={group2} onChange={(e) => setGroup2(e.target.value as GroupKey | '')} style={{ width: 140 }}>
              <option value="">(2차 없음)</option>
              {GROUP_KEYS.filter((g) => g !== group1).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </>
        )}
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
        수량 <b style={{ color: '#3c4553', fontSize: 14 }}>{totals.qty.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      {mode === '집계' ? (
        <table ref={aggRef} className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>{group1}</th>
              {group2 && <th>{group2}</th>}
              <th style={{ width: 90, textAlign: 'right' }}>건수</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량</th>
              <th style={{ width: 130, textAlign: 'right' }}>공급가액</th>
              <th style={{ width: 130, textAlign: 'right' }}>부가세</th>
              <th style={{ width: 130, textAlign: 'right' }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr><td colSpan={group2 ? 8 : 7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={`${g.g1}|${g.g2}`}>
                <td style={{ textAlign: 'center', color: '#8a929c', background: '#f3f3f3' }}>{i + 1}</td>
                <td>{g.g1}</td>
                {group2 && <td>{g.g2}</td>}
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.count.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.qty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.supply.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.vat.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#1c6b32' }}>{(g.supply + g.vat).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={group2 ? 3 : 2} style={{ textAlign: 'right' }}>합계 ({grouped.length}개 그룹)</td>
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.count, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.qty, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.vat.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#1c6b32' }}>{(totals.supply + totals.vat).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('발주일자')}>발주일자 {sort.mark('발주일자')}</th>
            <th>납기</th>
            <th>발주번호</th>
            <th>매입처</th>
            <th>창고</th>
            <th>담당자</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>수량</th>
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
              {rows.length === 0 ? '발주 내역이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.date)}</td>
              <td style={{ fontFamily: 'monospace', color: r.dueDate ? '#5a626e' : '#c5cbd3' }}>{dateText(r.dueDate) || ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
              <td>{r.partner}</td>
              <td style={{ color: r.warehouse ? undefined : '#c5cbd3' }}>{r.warehouse || ''}</td>
              <td style={{ color: r.employee ? undefined : '#c5cbd3' }}>{r.employee || ''}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ color: STATUS_COLOR[r.status], fontWeight: 600, fontSize: 12 }}>
                  {r.statusName || STATUS_LABEL[r.status]}
                </span>
              </td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>{r.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.vat.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    </EcListShell>
  )
}

/** 이카운트 Search 패널 — 기준일자/거래처/담당자/발주No./창고/품목/진행상태 */
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
      {/* 원본 발주서현황의 조건 차례는 <b>발주No. · 창고 · 거래처 · 품목</b> 이다(사본 실측).
          우리는 거래처를 맨 앞에 두어 눈으로 훑는 자리가 어긋나 있었다. */}
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
        {/* 원본 발주서현황 차례: 발주No. · 내.외자구분 · 창고 · <b>프로젝트</b> · 거래처 · 품목 */}
        <span style={label}>프로젝트</span>
        <input className="ec-input" placeholder="프로젝트명 일부" value={draft.project}
          onChange={(e) => onChange({ project: e.target.value })} style={{ width: 220 }} />
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
        <span style={label}>품목</span>
        <input className="ec-input" placeholder="품목명 일부" value={draft.item}
          onChange={(e) => onChange({ item: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>진행상태</span>
        <select className="ec-input" value={draft.status}
          onChange={(e) => onChange({ status: e.target.value as Filters['status'] })} style={{ width: 150 }}>
          <option value="">전체</option>
          <option value="REQUESTED">발주요청</option>
          <option value="PLANNED">발주계획</option>
          <option value="PRICED">단가확정</option>
          <option value="ORDERED">발주확정</option>
          <option value="RECEIVED">입고전환</option>
          <option value="CANCELLED">취소</option>
        </select>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginLeft: 20 }}>
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

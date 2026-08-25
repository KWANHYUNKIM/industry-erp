import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc } from '../../api/types'
import EcPeriodPicks, { STATUS_PICKS } from '../../components/EcPeriodPicks'
import { GROUP_KEYS, aggregate, type GroupKey } from '../../utils/statusAggregate'

/** 구매 > 구매현황 — 구매 전표를 품목라인 단위로 펼친 실제 매입 내역 (/api/purchases 연동) */
interface Row {
  key: string
  date: string
  docNo: string
  warehouse: string
  partner: string
  itemName: string
  qty: number
  unitPrice: number
  supply: number
  vat: number
  // 집계(utils/statusAggregate)가 읽는 값들. 화면이 이미 받아 온 전표에서 뽑는다.
  projectName: string | null
  taxable: boolean
  employeeName: string | null
}

/** 이카운트 Search 패널의 검색조건. 이 화면 데이터로 실제 거를 수 있는 항목만 둔다. */
interface Filters {
  dateFrom: string
  dateTo: string
  partner: string
  warehouse: string
  item: string
  sortByModified: boolean
}

const EMPTY_FILTERS: Filters = {
  dateFrom: '', dateTo: '', partner: '', warehouse: '', item: '', sortByModified: false,
}

export default function PurchaseStatusPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  // 원본 상단의 메뉴 토글 — 판매현황과 같은 규칙이다(집계 계산은 utils/statusAggregate 가 진다).
  const [mode, setMode] = useState<'현황' | '집계'>('현황')
  const [group1, setGroup1] = useState<GroupKey | ''>('품목별')
  const [group2, setGroup2] = useState<GroupKey | ''>('')

  // 상세검색 패널
  const [panelOpen, setPanelOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)      // 실제 적용된 조건
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)          // 패널 입력 중인 값

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<PurchaseDoc[]>('/purchases')
      const flat: Row[] = []
      for (const d of res.data) {
        d.lines.forEach((l, idx) => flat.push({
          key: `${d.id}-${idx}`,
          date: d.purchaseDate,
          docNo: d.docNo,
          warehouse: d.warehouseName,
          partner: d.partnerName,
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          supply: l.supplyAmount,
          vat: l.vatAmount,
          projectName: d.projectName,
          taxable: d.vatAmount > 0,
          employeeName: d.employeeName,
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

  /** 상단 키워드 + 상세검색 조건을 모두 통과한 행 */
  const shown = useMemo(() => {
    const kw = keyword.trim()
    const f = filters
    const out = rows.filter((r) => {
      if (kw && !r.partner.includes(kw) && !r.itemName.includes(kw) && !r.docNo.includes(kw)) return false
      if (f.dateFrom && r.date < f.dateFrom) return false
      if (f.dateTo && r.date > f.dateTo) return false
      if (f.partner && !r.partner.includes(f.partner)) return false
      if (f.warehouse && !r.warehouse.includes(f.warehouse)) return false
      if (f.item && !r.itemName.includes(f.item)) return false
      return true
    })
    // 기타: 수정일자순(정렬) 체크 시 전표번호 역순, 기본은 일자 내림차순
    out.sort((a, b) => f.sortByModified
      ? (a.docNo < b.docNo ? 1 : a.docNo > b.docNo ? -1 : 0)
      : (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return out
  }, [rows, keyword, filters])

  /** 집계는 판매현황과 같은 규칙을 쓴다 — 계산은 utils/statusAggregate 가 진다. */
  const grouped = useMemo(
    () => (mode !== '집계' ? [] : aggregate(
      // 구매 라인에는 품목의 관리항목이 실려 있지 않다. 여기서는 묶지 않는다(값이 없으면 '(없음)').
      shown.map((r) => ({ ...r, partner: r.partner, warehouseName: r.warehouse, managementItemName: null })),
      group1,
      group2,
    )),
    [shown, mode, group1, group2],
  )

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ supply: s.supply + r.supply, vat: s.vat + r.vat }),
    { supply: 0, vat: 0 },
  ), [shown])

  const activeCount = useMemo(() => {
    let n = 0
    if (filters.dateFrom || filters.dateTo) n++
    if (filters.partner) n++
    if (filters.warehouse) n++
    if (filters.item) n++
    if (filters.sortByModified) n++
    return n
  }, [filters])

  const applyDraft = () => { setFilters(draft); setPanelOpen(false) }
  const resetDraft = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS) }
  const openPanel = () => { setDraft(filters); setPanelOpen((v) => !v) }

  return (
    <EcListShell
      title="구매현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 상세검색 토글 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button className="ec-btn" onClick={openPanel}>
          상세검색 {panelOpen ? '▲' : '▼'}{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        {activeCount > 0 && !panelOpen && (
          <button
            className="ec-btn"
            onClick={resetDraft}
            style={{ fontSize: 12, color: '#8a929c' }}
          >
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

      {/* 원본 상단의 메뉴 토글 — 판매현황과 같다. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: 'var(--ec-label)', fontSize: 12, minWidth: 54 }}>메뉴</span>
        {(['현황', '집계'] as const).map((m) => (
          <button
            key={m} type="button"
            className={`ec-btn ec-btn-sm${mode === m ? ' ec-btn-primary' : ''}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
        {mode === '집계' && (
          <>
            <span style={{ width: 12 }} />
            <span style={{ color: 'var(--ec-label)', fontSize: 12 }}>집계조건1</span>
            <select className="ec-input" value={group1} onChange={(e) => setGroup1(e.target.value as GroupKey)} style={{ width: 150 }}>
              {GROUP_KEYS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <span style={{ color: 'var(--ec-label)', fontSize: 12 }}>집계조건2</span>
            <select className="ec-input" value={group2} onChange={(e) => setGroup2(e.target.value as GroupKey | '')} style={{ width: 150 }}>
              <option value="">(없음)</option>
              {GROUP_KEYS.filter((g) => g !== group1).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </>
        )}
      </div>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      {mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>{group1 || '집계조건1'}</th>
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
              <tr><td colSpan={group2 ? 8 : 7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>집계할 내역이 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={`${g.g1}|${g.g2}`}>
                <td style={{ textAlign: 'center', color: '#8a929c', background: '#f3f3f3' }}>{i + 1}</td>
                <td>{g.g1}</td>
                {group2 && <td>{g.g2}</td>}
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.count.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.qty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.supply.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.vat.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#1c6b32' }}>
                  {(g.supply + g.vat).toLocaleString()}
                </td>
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
            <th>일자 ▼</th>
            <th>전표번호</th>
            <th>창고</th>
            <th>매입처</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '구매 내역이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
              <td>{r.warehouse}</td>
              <td>{r.partner}</td>
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

/** 이카운트 Search 패널 — 기준일자/거래처/창고/품목/기타 조건 입력 */
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
        <span style={{ width: 8 }} />
        {/* 원본 현황 화면 하단의 기간 빠른선택 — 라벨 묶음이 업무일지와 다르다. */}
        <EcPeriodPicks
          labels={STATUS_PICKS}
          onPick={(r) => onChange({ dateFrom: r.from, dateTo: r.to })}
        />
      </div>
      <div style={rowStyle}>
        <span style={label}>거래처</span>
        <input className="ec-input" placeholder="매입처명 일부" value={draft.partner}
          onChange={(e) => onChange({ partner: e.target.value })} style={{ width: 220 }} />
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
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>기타</span>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.sortByModified}
            onChange={(e) => onChange({ sortByModified: e.target.checked })} />
          전표번호순(정렬)
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="ec-btn" onClick={onReset}>초기화</button>
        <button className="ec-btn ec-btn-primary" onClick={onApply}>조회</button>
      </div>
    </div>
  )
}

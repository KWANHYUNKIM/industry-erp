import { useRef, useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc } from '../../api/types'
import { STATUS_PICKS, comparePeriodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { GROUP_KEYS, aggregate, type GroupKey } from '../../utils/statusAggregate'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

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

  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  // 조건은 고치는 즉시 반영한다 — 원본 조건 판도 접히지 않고 그 자리에서 걸린다.
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const setF = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))

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

  /**
   * 비교기간 — 같은 조건을 같은 길이의 앞 구간에 걸어 다시 합친다.
   * 기간만 바꾸고 나머지 조건은 그대로여야 견주는 의미가 있다.
   */
  const prevRange = comparePeriodOf(filters.dateFrom, filters.dateTo, compare)
  const prevTotals = useMemo(() => {
    if (!prevRange) return null
    const f = filters
    const kw = keyword.trim()
    return rows
      .filter((r) => r.date >= prevRange.from && r.date <= prevRange.to)
      .filter((r) => !f.partner || r.partner.includes(f.partner))
      .filter((r) => !f.warehouse || r.warehouse.includes(f.warehouse))
      .filter((r) => !f.item || r.itemName.includes(f.item))
      .filter((r) => !kw || r.partner.includes(kw) || r.itemName.includes(kw))
      .reduce((s2, r) => ({ supply: s2.supply + r.supply, vat: s2.vat + r.vat }), { supply: 0, vat: 0 })
  }, [rows, prevRange, filters, keyword])

  const reset = () => {
    setFilters(EMPTY_FILTERS); setMode('현황'); setCompare('사용안함'); setKeyword('')
    // 집계조건도 조건이다. 안 되돌리면 '거래처별'로 바꿔 둔 채 다시 작성해도 그대로 남는다.
    setGroup1('품목별'); setGroup2('')
  }

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '구매현황 집계', [group1, group2, grouped.length])

  return (
    <EcListShell
      title="구매현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 조건 판은 현황 화면 공용이다(EcStatusPanel). 원본도 접히지 않고 펼쳐져 있다. */}
      <EcStatusPanel
        mode={mode} onModeChange={setMode}
        compare={compare} onCompareChange={setCompare}
        from={filters.dateFrom} to={filters.dateTo}
        onPeriod={(r) => setF({ dateFrom: r.from, dateTo: r.to })}
        picks={STATUS_PICKS}
      >
        {mode === '집계' && (
          <EcCond label="집계조건">
            <select className="ec-input" value={group1} onChange={(e) => setGroup1(e.target.value as GroupKey)} style={{ width: 150 }}>
              {GROUP_KEYS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="ec-input" value={group2} onChange={(e) => setGroup2(e.target.value as GroupKey | '')} style={{ width: 150 }}>
              <option value="">(2차 없음)</option>
              {GROUP_KEYS.filter((g) => g !== group1).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </EcCond>
        )}
        <EcCond label="거래처" pick>
          <input className="ec-input" placeholder="매입처명 일부" value={filters.partner}
                 onChange={(e) => setF({ partner: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <input className="ec-input" placeholder="창고명 일부" value={filters.warehouse}
                 onChange={(e) => setF({ warehouse: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="품목" pick>
          <input className="ec-input" placeholder="품목명 일부" value={filters.item}
                 onChange={(e) => setF({ item: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="정렬기준">
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={filters.sortByModified}
                   onChange={(e) => setF({ sortByModified: e.target.checked })} /> 전표번호순 (기본: 일자순)
          </label>
        </EcCond>
      </EcStatusPanel>

      {prevTotals && (
        <div style={{ marginBottom: 8, fontSize: 12.5, textAlign: 'right', color: '#5a626e' }}>
          <span style={{ color: 'var(--ec-label)' }}>
            비교기간({prevRange!.from.replace(/-/g, '/')} ~ {prevRange!.to.replace(/-/g, '/')})
          </span>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          공급가액 {prevTotals.supply.toLocaleString()} → {totals.supply.toLocaleString()}
          {prevTotals.supply > 0 && (
            <span style={{ marginLeft: 4, color: totals.supply >= prevTotals.supply ? '#1c7c3c' : '#c60a2e' }}>
              ({totals.supply >= prevTotals.supply ? '+' : ''}
              {Math.round(((totals.supply - prevTotals.supply) / prevTotals.supply) * 100)}%)
            </span>
          )}
        </div>
      )}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      {mode === '집계' ? (
        <table ref={tableRef} className="w-full text-left">
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

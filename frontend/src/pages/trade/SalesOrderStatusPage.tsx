import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { comparePeriodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'

/**
 * 영업관리 > 주문서현황 (이카운트 E040209)
 * 수주(SalesOrder) 전표를 품목라인 단위로 펼쳐, 주문/출하/미출하 진척과 금액을 보는 현황 화면.
 * 데이터는 GET /api/sales-orders (SalesOrderResponse[]) 를 그대로 사용한다.
 *
 * 원본 조건 패널은 접혀 있지 않다 — 화면을 열면 조건이 바로 보이고, 맨 위가 [메뉴 현황|집계],
 * 그 아래 [비교기간], [기준일자]+기간 빠른선택 순이다. 우리는 조건을 '상세검색' 토글 뒤에
 * 숨겨 두었고 메뉴·비교기간이 없었다. 이 판은 현황 화면들이 공통으로 쓰므로
 * `EcStatusPanel` 로 빼서 같이 쓴다.
 *
 * 원본 조건 중 창고·프로젝트는 우리 SalesOrderResponse 에 필드가 없어 **의도적으로 제외**한다
 * (값 없는 컨트롤을 흉내내지 않는다). 대신 수주 고유의 상태·미출하를 조건에 둔다.
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

/*
 * 원본 주문서현황은 <b>금월</b>을 보고 열리고, 기간 단추는 금일·전일·금주(~오늘)·전주·
 * 금월(~오늘)·전월·<b>종료일</b> 일곱이다(사본 실측). 우리는 기간을 <b>비워</b> 두고
 * 단추도 업무일지 묶음(금년·전년·최근3일+7일)을 쓰고 있었다 — 원본에 없는 단추다.
 */
const init = periodOf('금월(~오늘)')!

const EMPTY_FILTERS: Filters = {
  dateFrom: init.from, dateTo: init.to, partner: '', item: '', status: '', unshippedOnly: false, sortByDoc: false,
}

export default function SalesOrderStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'items'])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const setF = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const [mode, setMode] = useState<'현황' | '집계'>('현황')
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SalesOrderResponse[]>('/sales-orders', { params: { from: filters.dateFrom || undefined, to: filters.dateTo || undefined } })
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

  /*
   * <b>기간을 서버에 보낸다.</b> 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내
   * 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() }, [filters.dateFrom, filters.dateTo])

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


  const reset = () => { setFilters(EMPTY_FILTERS); setMode('현황'); setCompare('사용안함'); setKeyword('') }

  /**
   * 비교기간을 고르면 같은 길이의 앞 구간을 같은 조건으로 다시 집계한다.
   * 목록을 두 벌 그리지 않고 합계만 견준다 — 원본도 비교는 숫자로 보여 준다.
   */
  const prevRange = comparePeriodOf(filters.dateFrom, filters.dateTo, compare)
  const prevTotals = useMemo(() => {
    if (!prevRange) return null
    const f = filters
    return rows
      .filter((r) => r.date >= prevRange.from && r.date <= prevRange.to)
      .filter((r) => !f.partner || r.partner.includes(f.partner))
      .filter((r) => !f.item || r.itemName.includes(f.item))
      .filter((r) => !f.status || r.status === f.status)
      .filter((r) => !f.unshippedOnly || r.unshipped > 0)
      .reduce((s2, r) => ({ supply: s2.supply + r.supply, qty: s2.qty + r.qty, count: s2.count + 1 }),
        { supply: 0, qty: 0, count: 0 })
  }, [rows, prevRange, filters])

  /** 집계 보기 — 거래처별로 묶는다. 원본 [집계]도 같은 자료를 묶어서 본다. */
  const grouped = useMemo(() => {
    if (mode !== '집계') return []
    const map = new Map<string, { partner: string; qty: number; shipped: number; unshipped: number; supply: number; vat: number; count: number }>()
    shown.forEach((r) => {
      const g = map.get(r.partner) ?? { partner: r.partner, qty: 0, shipped: 0, unshipped: 0, supply: 0, vat: 0, count: 0 }
      g.qty += r.qty; g.shipped += r.shippedQty; g.unshipped += r.unshipped
      g.supply += r.supply; g.vat += r.vat; g.count += 1
      map.set(r.partner, g)
    })
    return [...map.values()].sort((a, b) => b.supply - a.supply)
  }, [mode, shown])


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    일자: (r) => r.date,
  })

  return (
    <EcListShell
      title="주문서현황"
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

      <EcStatusPanel
        modes={['현황', '집계']} mode={mode} onModeChange={(m) => setMode(m as '현황' | '집계')}
        compare={compare} onCompareChange={setCompare}
        from={filters.dateFrom} to={filters.dateTo}
        onPeriod={(r) => setF({ dateFrom: r.from, dateTo: r.to })}
        picks={INQUIRY_PICKS}
      >
        <EcCond label="진행상태">
          <select className="ec-input" value={filters.status} style={{ width: 130 }}
                  onChange={(e) => setF({ status: e.target.value as Filters['status'] })}>
            <option value="">전체</option>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((k) => (
              <option key={k} value={k}>{STATUS_LABEL[k]}</option>
            ))}
          </select>
          <label style={{ marginLeft: 10, fontSize: 12 }}>
            <input type="checkbox" checked={filters.unshippedOnly}
                   onChange={(e) => setF({ unshippedOnly: e.target.checked })} /> 미출하만
          </label>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={filters.partner} onChange={(v) => setF({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={filters.item} onChange={(v) => setF({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="정렬기준">
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={filters.sortByDoc}
                   onChange={(e) => setF({ sortByDoc: e.target.checked })} /> 주문번호순 (기본: 일자순)
          </label>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        미출하수량 <b style={{ color: '#c07a00', fontSize: 14 }}>{totals.unshipped.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>

      {prevTotals && (
        <div style={{ marginBottom: 8, fontSize: 12.5, textAlign: 'right', color: '#5a626e' }}>
          <span style={{ color: 'var(--ec-label)' }}>
            비교기간({prevRange!.from.replace(/-/g, '/')} ~ {prevRange!.to.replace(/-/g, '/')})
          </span>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          건수 {prevTotals.count.toLocaleString()} → {shown.length.toLocaleString()}
          <Delta now={shown.length} prev={prevTotals.count} />
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          공급가액 {prevTotals.supply.toLocaleString()} → {totals.supply.toLocaleString()}
          <Delta now={totals.supply} prev={prevTotals.supply} />
        </div>
      )}

      {mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>거래처</th>
              <th style={{ textAlign: 'right' }}>건수</th>
              <th style={{ textAlign: 'right' }}>주문수량</th>
              <th style={{ textAlign: 'right' }}>출하수량</th>
              <th style={{ textAlign: 'right' }}>미출하</th>
              <th style={{ textAlign: 'right' }}>공급가액</th>
              <th style={{ textAlign: 'right' }}>부가세</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={g.partner}>
                <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                <td>{g.partner}</td>
                <td style={{ textAlign: 'right' }}>{g.count.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.qty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.shipped.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: g.unshipped > 0 ? '#c07a00' : undefined }}>{g.unshipped.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.supply.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.vat.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('일자')}>일자 {sort.mark('일자')}</th>
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
          ) : sort.sorted.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.date)}</td>
              <td style={{ fontFamily: 'monospace', color: r.dueDate ? '#5a626e' : '#c5cbd3' }}>{dateText(r.dueDate) || ''}</td>
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
      )}
    </EcListShell>
  )
}

/** 비교기간 증감 표시 — 늘면 초록, 줄면 빨강. */
function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev === 0) return null
  const pct = Math.round(((now - prev) / prev) * 100)
  const up = now >= prev
  return (
    <span style={{ marginLeft: 4, color: up ? '#1c7c3c' : '#c60a2e' }}>
      ({up ? '+' : ''}{pct}%)
    </span>
  )
}

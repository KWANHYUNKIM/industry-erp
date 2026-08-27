import { useRef, useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc } from '../../api/types'
import { STATUS_PICKS, comparePeriodOf, periodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { GROUP_KEYS, aggregate, type GroupKey } from '../../utils/statusAggregate'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

/** 구매 > 구매현황 — 구매 전표를 품목라인 단위로 펼친 실제 매입 내역 (/api/purchases 연동) */
type Mode = '내역' | '집계' | '라인별'
const MODES = ['내역', '집계', '라인별'] as const

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
  /** 원본 [거래구분] — 일반 · 반품. 반품 전표는 수량·금액이 음수다. */
  returnSlip: boolean
  employeeName: string | null
}

/** 이카운트 Search 패널의 검색조건. 이 화면 데이터로 실제 거를 수 있는 항목만 둔다. */
interface Filters {
  dateFrom: string
  dateTo: string
  partner: string
  warehouse: string
  item: string
  /** 원본 [프로젝트]. 응답에 있는데 조건이 없어 거를 수가 없었다. */
  project: string
  /** 원본 [거래유형] — 과세 · 면세. */
  taxType: string
  /** 원본 [거래구분] — 일반 · 반품. */
  tradeKind: string
  sortByModified: boolean
}

/*
 * 원본 구매현황의 기본 기간은 <b>[전월+금월]</b> 이다(사본 조건 판에 그 버튼이 눌려 있다).
 * 우리는 <b>비워 두어 전표 전체</b>가 나왔다 — 몇 해치가 한 번에 쏟아지고, 판매현황과
 * 나란히 놓으면 두 화면이 다른 기간을 보여 준다.
 */
const EMPTY_FILTERS: Filters = {
  dateFrom: periodOf('전월+금월')!.from, dateTo: periodOf('전월+금월')!.to,
  partner: '', warehouse: '', item: '',
  project: '', taxType: '', tradeKind: '', sortByModified: false,
}

export default function PurchaseStatusPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  // 원본 상단의 메뉴 토글 — 판매현황과 같은 규칙이다(집계 계산은 utils/statusAggregate 가 진다).
  /*
   * 원본 구매현황의 [구분] 도 판매현황과 같이 <b>내역 · 집계 · 라인별</b> 세 가지다(사본 실측).
   * 우리가 '현황' 이라 부르던 것이 원본의 '라인별'이고, '내역'(전표 단위)이 없었다.
   */
  const [mode, setMode] = useState<Mode>('내역')
  const [view, setView] = useState<'표' | '그래프'>('표')
  const [group1, setGroup1] = useState<GroupKey | ''>('품목별')
  const [group2, setGroup2] = useState<GroupKey | ''>('')

  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  // 조건은 고치는 즉시 반영한다 — 원본 조건 판도 접히지 않고 그 자리에서 걸린다.
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  /*
   * 원본은 조건 판의 창고·거래처·품목·프로젝트를 <b>모두 코드도움</b>으로 둔다.
   * 우리는 "매입처명 일부" 를 손으로 치는 칸이었다 — 거래처가 300곳이 넘으면
   * 이름을 외우고 있는 사람만 쓸 수 있고, 한 글자 틀리면 아무것도 안 나오는데
   * 화면은 "그런 자료가 없다" 처럼 보인다.
   */
  const pickers = useCondPickers(['partners', 'warehouses', 'items', 'projects'])
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
          // 전표가 과세 여부를 들고 있다. 예전에는 부가세 > 0 인지로 되짚어서,
          // 반올림으로 부가세가 0 이 된 과세 전표가 면세로 섞였다.
          taxable: d.taxable,
          returnSlip: d.returnSlip,
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
      if (f.project && !(r.projectName ?? '').includes(f.project)) return false
      if (f.taxType && (f.taxType === '면세' ? r.taxable : !r.taxable)) return false
      if (f.tradeKind && (f.tradeKind === '반품' ? !r.returnSlip : r.returnSlip)) return false
      return true
    })
    // 기타: 수정일자순(정렬) 체크 시 전표번호 역순, 기본은 일자 내림차순
    out.sort((a, b) => f.sortByModified
      ? (a.docNo < b.docNo ? 1 : a.docNo > b.docNo ? -1 : 0)
      : (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return out
  }, [rows, keyword, filters])

  /**
   * 내역 — 전표 하나를 한 줄로 접는다. 원본 구매조회 격자와 같은 칸 구성
   * (일자-No. · 거래처명 · 품목명(요약) · 금액합계 · 창고명).
   */
  const slips = useMemo(() => {
    const by = new Map<string, {
      date: string; docNo: string; partner: string; itemName: string; lineCount: number
      qty: number; supply: number; vat: number; warehouse: string
    }>()
    for (const r of shown) {
      const cur = by.get(r.docNo)
      if (!cur) {
        by.set(r.docNo, {
          date: r.date, docNo: r.docNo, partner: r.partner, itemName: r.itemName, lineCount: 1,
          qty: r.qty, supply: r.supply, vat: r.vat, warehouse: r.warehouse,
        })
      } else {
        cur.lineCount += 1
        cur.qty += r.qty
        cur.supply += r.supply
        cur.vat += r.vat
      }
    }
    return [...by.values()]
  }, [shown])

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

  /*
   * 원본 [데이터 보기형식] · [그래프로 보기]. 지금 보고 있는 [구분]을 따라 그린다.
   * 금액(공급가액)으로 그린다 — 이 화면에서 크기를 비교하는 값이 그것이다.
   */
  const chartRows = useMemo(() => {
    if (mode === '집계') {
      return grouped.map((g) => ({
        label: g.g2 ? `${g.g1} / ${g.g2}` : g.g1, value: g.supply,
      }))
    }
    return shown.map((r) => ({ label: `${r.itemName}`, value: r.supply }))
  }, [mode, grouped, shown])


  /**
   * [라인별] 을 원본 모양으로 — 줄 사이에 <b>월별 소계</b>를 끼우고 끝에 총합계를 둔다.
   *
   * <p>원본 구매현황의 결과는 일자-No. · 품목명(규격) · 수량 · 단가 · 공급가액 · 부가세 ·
   * <b>합계</b> · 거래처명 이고, 월이 바뀌는 자리마다 '2026/06 계' 가 들어간 뒤
   * 맨 끝에 '총합계' 가 온다. 우리는 [합계] 열도 소계도 없어서 "이번 달 얼마 샀나" 를
   * 눈으로 세야 했다.
   *
   * <p>소계를 화면에서 따로 계산하지 않고 목록을 만들면서 같이 넣는다 —
   * 두 벌로 세면 한쪽만 조건이 바뀌었을 때 소계와 줄이 어긋난다.
   */
  const lineRows = useMemo(() => {
    type Row =
      | { kind: 'line'; key: string; no: number; r: typeof shown[number] }
      | { kind: 'subtotal'; key: string; month: string; qty: number; supply: number; vat: number }
    const sorted = [...shown].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const out: Row[] = []
    let month = ''
    let no = 0
    let qty = 0
    let supply = 0
    let vat = 0
    const flush = () => {
      if (month) out.push({ kind: 'subtotal', key: `sub-${month}`, month, qty, supply, vat })
      qty = 0; supply = 0; vat = 0
    }
    for (const r of sorted) {
      const m = r.date.slice(0, 7).replace('-', '/')
      if (m !== month) { flush(); month = m }
      out.push({ kind: 'line', key: r.key, no: ++no, r })
      qty += r.qty
      supply += r.supply
      vat += r.vat
    }
    flush()
    return out
  }, [shown])

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
    setFilters(EMPTY_FILTERS); setMode('내역'); setCompare('사용안함'); setKeyword('')
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
        { label: 'Excel(화면)' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 조건 판은 현황 화면 공용이다(EcStatusPanel). 원본도 접히지 않고 펼쳐져 있다. */}
      <EcStatusPanel
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        view={view} onViewChange={setView}
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
          <CodePickerField label="거래처" hideLabel width={220} placeholder="전체" emptyLabel="전체"
                           value={filters.partner} onChange={(v) => setF({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={220} placeholder="전체" emptyLabel="전체"
                           value={filters.warehouse} onChange={(v) => setF({ warehouse: v })}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} placeholder="전체" emptyLabel="전체"
                           value={filters.item} onChange={(v) => setF({ item: v })}
                           items={pickers.items} />
        </EcCond>
        {/* 원본 구매현황 조건 실측(사본): 구분·기준일자·거래유형·내.외자구분·창고·프로젝트·거래처·품목. */}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} placeholder="전체" emptyLabel="전체"
                           value={filters.project} onChange={(v) => setF({ project: v })}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="거래유형">
          <div className="ec-pills">
            {['', '과세', '면세'].map((v) => (
              <button key={v || 'all'} type="button"
                      className={`ec-pill no-ec${filters.taxType === v ? ' active' : ''}`}
                      onClick={() => setF({ taxType: v })}>{v || '전체'}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="구매구분">
          <div className="ec-pills">
            {['', '일반', '반품'].map((v) => (
              <button key={v || 'all'} type="button"
                      className={`ec-pill no-ec${filters.tradeKind === v ? ' active' : ''}`}
                      onClick={() => setF({ tradeKind: v })}>{v || '전체'}</button>
            ))}
          </div>
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
      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 원" emptyText="조회된 구매가 없습니다." />
      ) : mode === '집계' ? (
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
      ) : mode === '내역' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 190 }}>일자-No.</th>
              <th>매입처</th>
              <th>품목명(요약)</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량</th>
              <th style={{ width: 130, textAlign: 'right' }}>공급가액</th>
              <th style={{ width: 120, textAlign: 'right' }}>부가세</th>
              <th style={{ width: 130, textAlign: 'right' }}>금액합계</th>
              <th style={{ width: 110 }}>창고명</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : slips.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>구매 내역이 없습니다.</td></tr>
            ) : slips.map((sl, i) => (
              <tr key={sl.docNo}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{sl.date} {sl.docNo}</td>
                <td>{sl.partner}</td>
                <td>{sl.itemName}{sl.lineCount > 1 ? ` 외 ${sl.lineCount - 1}건` : ''}</td>
                <td style={{ textAlign: 'right' }}>{sl.qty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{sl.supply.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{sl.vat.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>
                  {(sl.supply + sl.vat).toLocaleString()}
                </td>
                <td>{sl.warehouse}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({slips.length}건)</td>
              <td style={{ textAlign: 'right' }}>{slips.reduce((a, x) => a + x.qty, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.vat.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#1c6b32' }}>
                {(totals.supply + totals.vat).toLocaleString()}
              </td>
              <td></td>
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
            <th style={{ textAlign: 'right' }}>합계</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '구매 내역이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : lineRows.map((x) => x.kind === 'subtotal' ? (
            <tr key={x.key} style={{ background: '#f3f6fa', fontWeight: 700 }}>
              <td colSpan={6} style={{ textAlign: 'right' }}>{x.month} 계</td>
              <td style={{ textAlign: 'right' }}>{x.qty.toLocaleString()}</td>
              <td></td>
              <td style={{ textAlign: 'right' }}>{x.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{x.vat.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{(x.supply + x.vat).toLocaleString()}</td>
            </tr>
          ) : (
            <tr key={x.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{x.no}</td>
              <td style={{ fontFamily: 'monospace' }}>{x.r.date}</td>
              <td style={{ fontFamily: 'monospace' }}>{x.r.docNo}</td>
              <td>{x.r.warehouse}</td>
              <td>{x.r.partner}</td>
              <td>{x.r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{x.r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{x.r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>{x.r.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{x.r.vat.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{(x.r.supply + x.r.vat).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
            <td colSpan={6} style={{ textAlign: 'right' }}>총합계 ({shown.length}줄)</td>
            <td style={{ textAlign: 'right' }}>{shown.reduce((n, r) => n + r.qty, 0).toLocaleString()}</td>
            <td></td>
            <td style={{ textAlign: 'right' }}>{totals.supply.toLocaleString()}</td>
            <td style={{ textAlign: 'right' }}>{totals.vat.toLocaleString()}</td>
            <td style={{ textAlign: 'right', color: '#1c6b32' }}>{(totals.supply + totals.vat).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
      )}
    </EcListShell>
  )
}

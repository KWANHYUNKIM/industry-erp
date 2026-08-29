import { useRef, useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { periodOf, STATUS_PICKS, comparePeriodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { GROUP_KEYS, aggregate, type GroupKey } from '../../utils/statusAggregate'
import type { Item, Partner, SalesDoc, Warehouse } from '../../api/types'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { partnerCodeItems } from '../../utils/codeItems'
import { dateText } from '../../utils/dateText'

/** 영업 > 판매현황 — 판매 전표를 품목라인 단위로 펼친 실제 매출 내역 (/api/sales 연동) */
type Mode = '내역' | '집계' | '라인별'
const MODES = ['내역', '집계', '라인별'] as const

interface Row {
  key: string
  date: string
  docNo: string
  partner: string
  itemName: string
  qty: number
  unitPrice: number
  supply: number
  vat: number
  // 원본 조건이 거르는 값들. 화면이 이미 받아 온 전표에서 뽑아 둔다(추가 요청 없음).
  partnerId: number
  itemId: number
  warehouseName: string
  projectName: string | null
  lotNo: string | null
  taxable: boolean
  /** 원본 [거래구분] — 일반 · 반품. 반품 전표는 수량·금액이 음수다. */
  returnSlip: boolean
  employeeName: string | null
}

export default function SalesStatusPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 기준일자. 원본 판매현황의 **핵심 조건**인데 우리는 아예 없어서 전 기간을 통째로 뿌리고 있었다.
   * 전표가 쌓이면 못 쓴다. 기본은 원본과 같이 '금월(~오늘)'.
   */
  /*
   * 원본 판매현황의 기본 기간은 <b>[전월+금월]</b> 이다(사본 조건 판에 그 버튼이 눌려 있다).
   * 우리는 금월(~오늘) 로 열어서, 같은 화면인데 <b>처음 보이는 숫자가 달랐다</b> —
   * 지난달에 판 것이 안 보이니 "왜 이것밖에 안 되지" 가 되고, 원본과 대조할 때마다
   * 기간부터 맞춰야 했다.
   */
  const [from, setFrom] = useState(() => periodOf('전월+금월')!.from)
  const [to, setTo] = useState(() => periodOf('전월+금월')!.to)
  /*
   * 원본 판매현황의 나머지 조건. 우리 데이터로 실제 거를 수 있는 것만 둔다 —
   * 값이 없는 조건칸을 만드는 건 5장 레시피가 금지한다.
   *   거르는 것 : 거래처 · 품목 · 창고 · 프로젝트 · 시리얼/로트 · 관리항목 · 거래유형(과세/면세)
   *   못 거르는 것: 내·외자구분 · 거래구분(일반/반품) — 우리 모델에 그 개념이 없다.
   * 시리얼/로트는 반복 1(V126 계열)에서, 관리항목은 반복 3(V127)에서 만든 것이 여기서 쓰인다.
   */
  const [partnerId, setPartnerId] = useState('')
  const [itemId, setItemId] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [mgmtItem, setMgmtItem] = useState('')
  const [taxType, setTaxType] = useState<'전체' | '과세' | '면세'>('전체')
  /** 원본 판매현황 조건의 [거래구분] — 전체 · 일반 · 반품. */
  const [tradeKind, setTradeKind] = useState<'전체' | '일반' | '반품'>('전체')
  /*
   * 원본은 상단 [현황|집계] 로 모드를 가르고, 집계 모드에서는 `집계조건1/2` 로 **두 단계 그룹화**를 한다.
   * 우리는 현황(라인 목록)만 있었다.
   */
  /*
   * 원본 판매현황의 [구분] 은 <b>내역 · 집계 · 라인별</b> 세 가지다(원본 사본 실측).
   * 우리는 '현황' 하나뿐이었는데 그게 사실 원본의 '라인별'(전표 라인마다 한 줄)이었다.
   * 없던 것은 '내역' — 전표 하나를 한 줄로 접어 보여 주는 쪽이다. 원본 판매조회 격자가
   * 그 모습을 보여 준다: 일자-No. · 거래처명 · 품목명(요약) · 금액합계 · 창고명.
   */
  const [mode, setMode] = useState<Mode>('내역')
  const [view, setView] = useState<'표' | '그래프'>('표')
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  const [group1, setGroup1] = useState<GroupKey | ''>('품목별')
  const [group2, setGroup2] = useState<GroupKey | ''>('')

  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SalesDoc[]>('/sales')
      const flat: Row[] = []
      for (const d of res.data) {
        d.lines.forEach((l, idx) => flat.push({
          key: `${d.id}-${idx}`,
          date: d.saleDate,
          docNo: d.docNo,
          partner: d.partnerName,
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          supply: l.supplyAmount,
          vat: l.vatAmount,
          partnerId: d.partnerId,
          itemId: l.itemId,
          warehouseName: d.warehouseName,
          projectName: d.projectName,
          lotNo: l.lotNo,
          // 전표가 과세 여부를 들고 있다. 부가세 > 0 으로 되짚으면 반올림으로 0 이 된
          // 과세 전표가 면세로 섞인다.
          taxable: d.taxable,
          returnSlip: d.returnSlip,
          employeeName: d.employeeName,
        }))
      }
      // 최신 일자 우선
      flat.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // 조건에 쓸 마스터. 못 받아도 화면은 뜬다 — 조건만 비어 보인다.
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Warehouse[]>('/warehouses').then((r) => setWarehouses(r.data)).catch(() => {})
  }, [])

  /** 품목의 관리항목은 품목 마스터에서 파생한다(전표 라인이 들고 있지 않다 — 원본도 그렇다). */
  const mgmtOf = (id: number) => items.find((i) => i.id === id)?.managementItemName ?? ''
  const mgmtOptions = [...new Set(items.map((i) => i.managementItemName).filter(Boolean))] as string[]
  const projectOptions = [...new Set(rows.map((r) => r.projectName).filter(Boolean))] as string[]

  const shown = rows
    .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
    .filter((r) => !partnerId || String(r.partnerId) === partnerId)
    .filter((r) => !itemId || String(r.itemId) === itemId)
    .filter((r) => !warehouse || r.warehouseName === warehouse)
    .filter((r) => !project || r.projectName === project)
    .filter((r) => !lotNo || (r.lotNo ?? '').includes(lotNo))
    .filter((r) => !mgmtItem || mgmtOf(r.itemId) === mgmtItem)
    .filter((r) => taxType === '전체' || (taxType === '과세' ? r.taxable : !r.taxable))
    .filter((r) => tradeKind === '전체' || (tradeKind === '반품' ? r.returnSlip : !r.returnSlip))
    .filter((r) => !keyword || r.partner.includes(keyword) || r.itemName.includes(keyword))
  /** 집계는 판매·구매가 같은 규칙을 쓰므로 `utils/statusAggregate` 에 모아 두고 여기서 부른다. */
  const grouped = useMemo(
    () => (mode !== '집계' ? [] : aggregate(
      shown.map((r) => ({ ...r, managementItemName: mgmtOf(r.itemId) || null })),
      group1,
      group2,
    )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, mode, group1, group2, items],
  )

  /**
   * 내역 — 전표 하나를 한 줄로 접는다. 같은 전표번호의 라인을 모아 수량·금액을 더하고
   * 품목은 "첫 품목 외 N건"으로 줄인다(원본 판매조회의 '품목명(요약)' 칸과 같은 방식).
   */
  const slips = useMemo(() => {
    const by = new Map<string, {
      date: string; docNo: string; partner: string; itemName: string; lineCount: number
      qty: number; supply: number; vat: number; warehouseName: string
    }>()
    for (const r of shown) {
      const cur = by.get(r.docNo)
      if (!cur) {
        by.set(r.docNo, {
          date: r.date, docNo: r.docNo, partner: r.partner, itemName: r.itemName, lineCount: 1,
          qty: r.qty, supply: r.supply, vat: r.vat, warehouseName: r.warehouseName,
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
   * <p>원본 판매현황의 결과는 일자-No. · 품목명(규격) · 수량 · 단가 · 공급가액 · 부가세 ·
   * <b>합계</b> · 거래처명 이고, 월이 바뀌는 자리마다 '2026/06 계' 가 들어간 뒤
   * 맨 끝에 '총합계' 가 온다. 우리는 [합계] 열도 소계도 없어서 "이번 달 얼마 팔았나" 를
   * 눈으로 세야 했다. 구매현황과 같은 모양이라 같은 방식으로 맞춘다.
   *
   * <p>소계를 화면에서 따로 계산하지 않고 목록을 만들면서 같이 넣는다 —
   * 두 벌로 세면 한쪽만 조건이 바뀌었을 때 소계와 줄이 어긋난다.
   */
  /*
   * [일자] 머리에 ▼ 를 그려 놓고 <b>눌러도 아무 일이 없었다.</b> 이 표는 실은 늘
   * 일자 오름차순으로 세워져 있었다 — 표시가 '고를 수 있다' 고 말하는데 고를 수가 없었다.
   *
   * <p>이 표는 달이 바뀌는 자리에 <b>월 소계 줄을 끼워 넣는다.</b> 그래서 정렬을
   * <b>풀 수는 없다</b> — 날짜로 묶여 있지 않으면 소계가 엉킨다. 오름/내림만 오간다.
   */
  const sort = useTableSort(shown, { 일자: (r) => r.date }, { key: '일자', dir: 'asc' })

  const lineRows = useMemo(() => {
    type Row =
      | { kind: 'line'; key: string; no: number; r: typeof shown[number] }
      | { kind: 'subtotal'; key: string; month: string; qty: number; supply: number; vat: number }
    const sorted = sort.sorted
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
  }, [shown, sort.sorted])

  /**
   * 비교기간 — 같은 조건을 같은 길이의 앞 구간에 걸어 다시 합친다.
   * 기간만 바꾸고 나머지 조건은 그대로여야 견주는 의미가 있다.
   */
  const reset = () => {
    // [다시 작성]은 화면을 열었을 때로 되돌린다 — 다른 기간으로 되돌리면 그건 초기화가 아니다.
    const m = periodOf('전월+금월')!
    setFrom(m.from); setTo(m.to)
    setMode('내역'); setCompare('사용안함')
    setPartnerId(''); setItemId(''); setWarehouse(''); setProject('')
    setMgmtItem(''); setLotNo(''); setTaxType('전체'); setTradeKind('전체'); setKeyword('')
    // 집계조건도 조건이다. 안 되돌리면 '거래처별'로 바꿔 둔 채 다시 작성해도 그대로 남는다.
    setGroup1('품목별'); setGroup2('')
  }

  const prevRange = comparePeriodOf(from, to, compare)
  const prevTotals = useMemo(() => {
    if (!prevRange) return null
    return rows
      .filter((r) => r.date >= prevRange.from && r.date <= prevRange.to)
      .filter((r) => !partnerId || String(r.partnerId) === partnerId)
      .filter((r) => !itemId || String(r.itemId) === itemId)
      .filter((r) => !warehouse || r.warehouseName === warehouse)
      .filter((r) => !project || r.projectName === project)
      .filter((r) => !lotNo || (r.lotNo ?? '').includes(lotNo))
      .filter((r) => !mgmtItem || mgmtOf(r.itemId) === mgmtItem)
      .filter((r) => taxType === '전체' || (taxType === '과세' ? r.taxable : !r.taxable))
      .filter((r) => tradeKind === '전체' || (tradeKind === '반품' ? r.returnSlip : !r.returnSlip))
      .filter((r) => !keyword || r.partner.includes(keyword) || r.itemName.includes(keyword))
      .reduce((s2, r) => ({ supply: s2.supply + r.supply, vat: s2.vat + r.vat }), { supply: 0, vat: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, prevRange, partnerId, itemId, warehouse, project, lotNo, mgmtItem, taxType, tradeKind, keyword, items])

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '판매현황 집계', [group1, group2, grouped.length])

  return (
    <EcListShell
      title="판매현황"
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

      {/*
        조건 판은 현황 화면들이 공통으로 쓰므로 EcStatusPanel 로 뺐다.
        [메뉴 현황|집계] · [비교기간] · [기준일자]+빠른선택이 그 안에 있고, 아래는 이 화면만의 조건이다.
        코드도움으로 고르는 조건은 `pick` 을 준다 — 원본이 그 라벨만 파랗게 쓴다.
      */}
      <EcStatusPanel
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        view={view} onViewChange={setView}
        compare={compare} onCompareChange={setCompare}
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
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
        {/*
          원본 판매현황 조건 차례 실측(사본): 구분 · 기준일자 · <b>거래유형 · 내.외자구분 ·
          창고 · 프로젝트 · 관리항목 · 거래처 · 품목 · 시리얼/로트No. · 거래구분</b>.
          우리는 거래처·품목을 앞에 두고 거래유형을 뒤로 보내 두었다.
        */}
        <EcCond label="거래유형">
          {(['전체', '과세', '면세'] as const).map((t) => (
            <button
              key={t} type="button"
              className={`ec-btn ec-btn-sm${taxType === t ? ' ec-btn-primary' : ''}`}
              onClick={() => setTaxType(t)}
            >
              {t}
            </button>
          ))}
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField
            label="창고" hideLabel width={220} emptyLabel="전체"
            value={warehouse} onChange={setWarehouse}
            items={warehouses.map((w) => ({ value: w.name, code: w.code, name: w.name, sub: w.location }))}
          />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={projectOptions.map((p) => ({ value: p, name: p }))} />
        </EcCond>
        <EcCond label="관리항목">
          <CodePickerField label="관리항목" hideLabel width={200} emptyLabel="전체"
                           value={mgmtItem} onChange={(v) => setMgmtItem(v)}
                           items={mgmtOptions.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField
            label="거래처" hideLabel width={220} emptyLabel="전체"
            value={partnerId} onChange={setPartnerId}
            items={partnerCodeItems(partners)}
          />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField
            label="품목" hideLabel width={220} emptyLabel="전체"
            value={itemId} onChange={setItemId}
            items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.spec }))}
          />
        </EcCond>
        <EcCond label="시리얼/로트No.">
          <input className="ec-input" value={lotNo} onChange={(e) => setLotNo(e.target.value)}
                 placeholder="부분일치" style={{ width: 220 }} />
        </EcCond>
        <EcCond label="거래구분">
          {(['전체', '일반', '반품'] as const).map((t) => (
            <button
              key={t} type="button"
              className={`ec-btn ec-btn-sm${tradeKind === t ? ' ec-btn-primary' : ''}`}
              onClick={() => setTradeKind(t)}
            >
              {t}
            </button>
          ))}
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
        공급가액 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 원" emptyText="조회된 판매가 없습니다." />
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
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
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
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{(totals.supply + totals.vat).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '내역' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 190 }}>일자-No.</th>
              <th>거래처명</th>
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
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : slips.map((sl, i) => (
              <tr key={sl.docNo}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{dateText(sl.date)} {sl.docNo}</td>
                <td>{sl.partner}</td>
                <td>{sl.itemName}{sl.lineCount > 1 ? ` 외 ${sl.lineCount - 1}건` : ''}</td>
                <td style={{ textAlign: 'right' }}>{sl.qty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{sl.supply.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{sl.vat.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>
                  {(sl.supply + sl.vat).toLocaleString()}
                </td>
                <td>{sl.warehouseName}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({slips.length}건)</td>
              <td style={{ textAlign: 'right' }}>{slips.reduce((a, x) => a + x.qty, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.vat.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
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
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('일자')}>일자 {sort.mark('일자')}</th>
            <th>전표번호</th>
            <th>거래처</th>
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
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : lineRows.map((x) => x.kind === 'subtotal' ? (
            <tr key={x.key} style={{ background: '#f3f6fa', fontWeight: 700 }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>{x.month} 계</td>
              <td style={{ textAlign: 'right' }}>{x.qty.toLocaleString()}</td>
              <td></td>
              <td style={{ textAlign: 'right' }}>{x.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{x.vat.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{(x.supply + x.vat).toLocaleString()}</td>
            </tr>
          ) : (
            <tr key={x.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{x.no}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(x.r.date)}</td>
              <td style={{ fontFamily: 'monospace' }}>{x.r.docNo}</td>
              <td>{x.r.partner}</td>
              <td>{x.r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{x.r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{x.r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{x.r.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{x.r.vat.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{(x.r.supply + x.r.vat).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
            <td colSpan={5} style={{ textAlign: 'right' }}>총합계 ({shown.length}줄)</td>
            <td style={{ textAlign: 'right' }}>{shown.reduce((n, r) => n + r.qty, 0).toLocaleString()}</td>
            <td></td>
            <td style={{ textAlign: 'right' }}>{totals.supply.toLocaleString()}</td>
            <td style={{ textAlign: 'right' }}>{totals.vat.toLocaleString()}</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{(totals.supply + totals.vat).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
      )}
    </EcListShell>
  )
}

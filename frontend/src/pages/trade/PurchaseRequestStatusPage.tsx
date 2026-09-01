import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, PRICE_REQUEST_PICKS, periodOf, comparePeriodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import type { CodeOption, Partner, PurchaseOrder, PurchaseOrderStatus } from '../../api/types'
import { subtotalBy } from '../../utils/subtotalBy'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'

/**
 * 구매관리 > 발주 파이프라인 현황 — 한 컴포넌트를 진입 상태만 바꿔 재사용한다.
 *   발주요청현황 (E040318, 기본 REQUESTED)
 *   발주계획현황 (E041015, 기본 PLANNED)
 *   단가요청현황 (E040325, 기본 PRICED — 백엔드 /prices 가 "단가요청 결과 반영"으로 PRICED 를 매긴다)
 * 상단에 상태별 집계 카드(클릭해 상태 전환), 하단에 선택 상태의 발주서를 라인 단위로 펼친다.
 *
 * 백엔드: 이 화면을 위해 서버사이드 조회를 추가했다 —
 *   GET /api/purchase-orders/summary          → 상태별 집계(건수·금액)
 *   GET /api/purchase-orders?status=REQUESTED  → 특정 상태만 조회
 * (집계·필터를 프론트에서 매번 계산하지 않고 서버가 소유한다. 새 테이블/컬럼이 없어 마이그레이션은 없다.)
 *
 * 조건 판은 현황 화면 공용(`EcStatusPanel`)이다. 원본(E040318)은 [메뉴 현황|집계] · [비교기간] ·
 * 기준일자 · 발주요청No. · 내.외자구분 · 납기일자 · 창고 · 프로젝트 · 관리항목 · 거래처 · 품목을
 * 펼쳐 놓는다. 우리 화면은 조건이 검색어 한 칸뿐이었다.
 * 프로젝트·관리항목·내외자구분은 PurchaseOrder 에 없어 **의도적 제외**(값 없는 컨트롤을 만들지 않는다).
 */

/** 파이프라인 표시 순서 */
const PIPELINE: PurchaseOrderStatus[] = ['REQUESTED', 'PLANNED', 'PRICED', 'ORDERED', 'RECEIVED', 'CANCELLED']
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '발주요청', PLANNED: '발주계획', PRICED: '단가확정',
  ORDERED: '발주확정', RECEIVED: '입고전환', CANCELLED: '취소',
}
const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '#c07a00', PLANNED: '#8a929c', PRICED: '#7a5bb5',
  ORDERED: 'var(--ec-blue)', RECEIVED: '#1c7c3c', CANCELLED: '#9aa1ab',
}

interface SummaryRow {
  status: PurchaseOrderStatus
  statusName: string
  count: number
  supplyAmount: number
  vatAmount: number
  totalAmount: number
}

interface Row {
  key: string
  date: string
  dueDate: string | null
  orderNo: string
  partner: string
  warehouse: string
  employee: string
  /** 원본 조건 [프로젝트]. 응답에 진작 실려 오는데 화면이 안 받아 뒀다. */
  project: string
  itemName: string
  /** 원본 조건 [품목구분]. 품목 마스터의 값이라 서버가 실어 준다. */
  category: string
  /** 원본 조건 [규격]·[적요]. 서버는 진작 보내는데 화면이 안 받아 뒀다. */
  spec: string
  remark: string
  /** 원본 조건 [외화종류]. 안 정했으면 빈 값 — 원화 거래다. */
  currency: string
  /** 원본 조건 [유효기간]. 단가요청 건에 붙는 날짜다(납기일과 다르다). */
  validUntil: string
  qty: number
  unitPrice: number
  supply: number
  vat: number
}

/*
 * 원본은 세 화면 다 <b>금월(~오늘)</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간을 <b>비워</b> 두어서, 열면 몇 해치 발주가 통째로 쏟아졌다.
 */
const init = periodOf('금월(~오늘)')!

export default function PurchaseRequestStatusPage({
  defaultStatus = 'REQUESTED', title = '발주요청현황',
}: {
  defaultStatus?: PurchaseOrderStatus
  title?: string
}) {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'warehouses', 'items', 'employees', 'projects'])
  const [summary, setSummary] = useState<SummaryRow[]>([])
  /** 원본 [품목구분]의 값 목록. 화면이 지어내지 않고 서버가 주는 것을 쓴다. */
  const [cats, setCats] = useState<CodeOption[]>([])
  /**
   * 원본 조건 <b>[거래처관리담당자]</b>. 담당자는 <b>거래처 마스터</b>에 붙어 있고 발주
   * 전표에는 없다 — 전표의 [담당자]는 우리 쪽 구매 담당이라 다른 사람이다.
   * 그래서 거래처 목록을 받아 이름으로 이어 붙인다.
   */
  const [partnerRows, setPartnerRows] = useState<Partner[]>([])
  const [status, setStatus] = useState<PurchaseOrderStatus>(defaultStatus)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 [구분]의 이름은 <b>[내역]</b> 이다(사본 실측 — 발주요청현황·발주계획현황).
   * 우리는 [현황] 이라 적어 두었는데, 같은 자리에 다른 낱말이 서 있으면
   * 원본을 보던 사람이 <b>다른 기능인 줄</b> 안다.
   */
  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  /*
   * <b>단가요청현황만 [구분]이 다르다</b> — 원본은 [요청단가]·[수취단가]·[확정단가]
   * 셋으로 <b>어느 단가를 볼지</b>를 고른다(사본 실측). 우리 발주 전표는 <b>확정단가</b>
   * 하나만 든다 — 매입처가 회신한 금액을 따로 적는 칸이 없다(단가요청진행단계의
   * [수취금액]을 못 만드는 것과 같은 까닭이다). 고를 것이 하나뿐이라 그 셋은 안 그린다.
   */
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  const [cond, setCond] = useState({
    from: init.from, to: init.to, dueFrom: '', dueTo: '',
    orderNo: '', partner: '', item: '', warehouse: '', project: '', employee: '', spec: '', remark: '',
    /* 원본 [품목구분]·[거래처관리담당자]·[외화종류]·[유효기간]. */
    category: '', partnerManager: '', currency: '', validFrom: '', validTo: '',
    /* 원본 [거래유형]·[단가]. */
    taxKind: '', priceFrom: '', priceTo: '',
    qtyFrom: '', qtyTo: '', supplyFrom: '', supplyTo: '', vatFrom: '', vatTo: '',
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  async function loadSummary() {
    try {
      const res = await api.get<SummaryRow[]>('/purchase-orders/summary')
      setSummary(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function loadList(st: PurchaseOrderStatus) {
    setLoading(true)
    try {
      const res = await api.get<PurchaseOrder[]>('/purchase-orders', { params: { status: st } })
      const flat: Row[] = []
      for (const o of res.data) {
        o.lines.forEach((l) => flat.push({
          key: `${o.id}-${l.id}`,
          date: o.orderDate,
          dueDate: o.dueDate,
          orderNo: o.orderNo,
          partner: o.partnerName,
          warehouse: o.warehouseName ?? '',
          employee: o.employeeName ?? '',
          project: o.projectName ?? '',
          itemName: l.itemName,
          category: l.itemCategory ?? '',
          currency: o.currency ?? '',
          validUntil: o.priceValidUntil ?? '',
          spec: l.spec ?? '',
          remark: l.remark ?? '',
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

  useEffect(() => {
    loadSummary()
    api.get<CodeOption[]>('/meta/item-categories').then((r) => setCats(r.data)).catch(() => setCats([]))
    api.get<Partner[]>('/partners').then((r) => setPartnerRows(r.data)).catch(() => setPartnerRows([]))
  }, [])
  useEffect(() => { loadList(status) }, [status])

  const reload = () => { loadSummary(); loadList(status) }

  /** 그 담당자가 맡은 거래처 <b>이름</b> 집합. 전표는 이름으로만 이어져 있어서다. */
  const 담당거래처 = (m: string) =>
    new Set(partnerRows.filter((p) => (p.manager ?? '') === m).map((p) => p.name))

  /** 조건 하나가 늘 때마다 두 곳(목록·비교기간)에 같은 규칙을 적으면 어긋난다 — 한 곳에 모은다. */
  const matches = (r: Row, c: typeof cond, kw: string) =>
    (!kw || r.partner.includes(kw) || r.itemName.includes(kw) || r.orderNo.includes(kw))
    && (!c.orderNo || r.orderNo.includes(c.orderNo))
    && (!c.partner || r.partner.includes(c.partner))
    && (!c.item || r.itemName.includes(c.item))
    && (!c.warehouse || r.warehouse.includes(c.warehouse))
    /* 원본 조건 [프로젝트]. 응답에 진작 실려 오는데 거를 수가 없었다. */
    && (!c.project || r.project === c.project)
    /* 원본 조건 [규격]·[적요]. 같은 품목이라도 규격이 갈리면 다른 물건이다. */
    && (!c.spec || r.spec.includes(c.spec))
    && (!c.remark || r.remark.includes(c.remark))
    /* 원본 조건 [담당자]. 이름은 응답에 진작 실려 오는데 거를 수가 없었다. */
    && (!c.employee || r.employee.includes(c.employee))
    /* 원본 조건 [품목구분]. 원자재를 사는 건인지 상품을 사는 건인지로 먼저 갈라 본다. */
    && (!c.category || r.category === c.category)
    /* 원본 조건 [거래처관리담당자]. 그 거래처를 맡은 사람 — 전표의 담당자와 다르다. */
    && (!c.partnerManager || 담당거래처(c.partnerManager).has(r.partner))
    /* 원본 조건 [외화종류]. 안 정한 건은 원화라 '(원화)' 로 고른다. */
    && (!c.currency || (c.currency === '(원화)' ? !r.currency : r.currency === c.currency))
    /* 원본 조건 [유효기간]. 단가가 언제까지 유효한 건인지로 좁힌다. */
    && (!c.validFrom || (r.validUntil && r.validUntil >= c.validFrom))
    && (!c.validTo || (r.validUntil && r.validUntil <= c.validTo))
    /* 원본 조건 [거래유형]. 판매·구매조회와 같은 규칙 — 부가세가 있으면 과세다. */
    && (!c.taxKind || (c.taxKind === '과세' ? r.vat > 0 : r.vat === 0))
    /*
     * 원본 조건 <b>[수량]·[단가]·[공급가액]·[부가세]</b> — 값의 <b>구간</b>으로 좁힌다.
     *
     * <p>넷 다 우리 표에 <b>열로는</b> 있어서 검사는 '있다' 로 셌지만, 실제로 거를 수 있는
     * 것은 단가 하나뿐이었다(#280). 열로 보이는 것과 그걸로 좁힐 수 있는 것은 다른 일이다 —
     * "부가세가 큰 건만" 을 보려면 표를 눈으로 훑는 수밖에 없었다.
     */
    && (!c.qtyFrom || r.qty >= Number(c.qtyFrom))
    && (!c.qtyTo || r.qty <= Number(c.qtyTo))
    && (!c.priceFrom || r.unitPrice >= Number(c.priceFrom))
    && (!c.priceTo || r.unitPrice <= Number(c.priceTo))
    && (!c.supplyFrom || r.supply >= Number(c.supplyFrom))
    && (!c.supplyTo || r.supply <= Number(c.supplyTo))
    && (!c.vatFrom || r.vat >= Number(c.vatFrom))
    && (!c.vatTo || r.vat <= Number(c.vatTo))
    && (!c.dueFrom || (r.dueDate ?? '') >= c.dueFrom)
    && (!c.dueTo || (r.dueDate ?? '') <= c.dueTo)

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows
      .filter((r) => !cond.from || r.date >= cond.from)
      .filter((r) => !cond.to || r.date <= cond.to)
      .filter((r) => matches(r, cond, kw))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, keyword, cond])

  /** 비교기간 — 기준일자만 앞 구간으로 옮기고 나머지 조건은 그대로 태운다. */
  const prevRange = comparePeriodOf(cond.from, cond.to, compare)
  const prevTotals = useMemo(() => {
    if (!prevRange) return null
    const kw = keyword.trim()
    return rows
      .filter((r) => r.date >= prevRange.from && r.date <= prevRange.to)
      .filter((r) => matches(r, cond, kw))
      .reduce((s2, r) => ({ supply: s2.supply + r.supply, qty: s2.qty + r.qty, count: s2.count + 1 }),
        { supply: 0, qty: 0, count: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, prevRange, cond, keyword])

  /*
   * 원본 조건 <b>[정렬/소계기준]</b> — 집계를 <b>무엇으로 묶을지</b> 고른다(사본 실측).
   * 우리는 매입처로 <b>박아 두어</b>, "무엇을 얼마나 사고 있나" 를 볼 수가 없었다 —
   * 발주계획을 보는 사람이 가장 먼저 묻는 것이 그것이다.
   */
  const SUBTOTALS = ['매입처', '품목', '창고', '담당자'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('매입처')

  /** 집계 — 고른 축으로 묶는다. 원본 [집계]도 같은 자료를 묶어서 본다. */
  const grouped = useMemo(() => {
    if (mode !== '집계') return []
    const keyOf = (r: Row) => (subtotal === '품목' ? r.itemName
      : subtotal === '창고' ? r.warehouse
        : subtotal === '담당자' ? r.employee : r.partner)
    return subtotalBy(shown, keyOf, {
      qty: (r) => r.qty, supply: (r) => r.supply, vat: (r) => r.vat,
    }).sort((a, b) => b.sums.supply - a.sums.supply)
      .map((g) => ({ partner: g.label, count: g.count, qty: g.sums.qty, supply: g.sums.supply, vat: g.sums.vat }))
  }, [mode, shown, subtotal])

  const reset = () => {
    setCond({
      from: init.from, to: init.to, dueFrom: '', dueTo: '', orderNo: '', partner: '', item: '',
      warehouse: '', project: '', employee: '', spec: '', remark: '',
      category: '', partnerManager: '', currency: '', validFrom: '', validTo: '',
      taxKind: '', priceFrom: '', priceTo: '',
      qtyFrom: '', qtyTo: '', supplyFrom: '', supplyTo: '', vatFrom: '', vatTo: '',
    })
    setMode('내역'); setCompare('사용안함'); setKeyword('')
  }

  /** 고를 값은 <b>지금 받아 온 줄</b>에서 모은다 — 마스터에 있어도 안 쓰는 값을 늘어놓지 않는다. */
  const partnerManagers = useMemo(
    () => [...new Set(partnerRows.map((p) => p.manager).filter(Boolean))] as string[], [partnerRows])
  const currencies = useMemo(() => {
    const set = new Set(rows.map((r) => r.currency).filter(Boolean))
    return rows.some((r) => !r.currency) ? ['(원화)', ...set] : [...set]
  }, [rows])

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ qty: s.qty + r.qty, supply: s.supply + r.supply, vat: s.vat + r.vat }),
    { qty: 0, supply: 0, vat: 0 },
  ), [shown])


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    발주일자: (r) => r.date,
  })

  return (
    <EcListShell
      title={title}
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={reload}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: reload },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 발주 파이프라인 집계 카드 — 클릭하면 해당 상태로 전환 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {PIPELINE.map((st) => {
          const s = summary.find((x) => x.status === st)
          const active = st === status
          return (
            <button
              key={st}
              onClick={() => setStatus(st)}
              style={{
                flex: '1 1 0', minWidth: 130, textAlign: 'left', cursor: 'pointer',
                border: active ? `1.5px solid ${STATUS_COLOR[st]}` : '1px solid #d9dee5',
                background: active ? '#fff' : '#fbfcfe',
                borderRadius: 5, padding: '8px 12px',
                boxShadow: active ? `0 1px 4px ${STATUS_COLOR[st]}22` : 'none',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: STATUS_COLOR[st], marginBottom: 3 }}>
                {STATUS_LABEL[st]}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#3c4553', lineHeight: 1 }}>
                {(s?.count ?? 0).toLocaleString()}<span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}> 건</span>
              </div>
              <div style={{ fontSize: 11, color: '#8a929c', marginTop: 3 }}>
                {(s?.supplyAmount ?? 0).toLocaleString()}
              </div>
            </button>
          )
        })}
      </div>

      {/*
        기간 단추가 <b>화면마다 다르다</b>(사본 실측) — 단가요청현황만 [금년]·[전년]이
        더 붙는다. 한 파일이 셋(발주요청·발주계획·단가요청 현황)을 겸한다.
      */}
      <EcStatusPanel
        modes={['내역', '집계']} mode={mode} onModeChange={(m) => setMode(m as '내역' | '집계')}
        compare={compare} onCompareChange={setCompare}
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={title === '단가요청현황' ? PRICE_REQUEST_PICKS : INQUIRY_PICKS}
      >
        <EcCond label="발주No." pick>
          <input className="ec-input" placeholder="발주번호 일부" value={cond.orderNo}
                 onChange={(e) => setC({ orderNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="납기일자">
          <input type="date" className="ec-input" value={cond.dueFrom}
                 onChange={(e) => setC({ dueFrom: e.target.value })} style={{ width: 140 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={cond.dueTo}
                 onChange={(e) => setC({ dueTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        {/*
          원본 <b>단가요청현황</b>의 [유효기간] — 그 단가가 언제까지 유효한 건인지다.
          서버는 진작 보내는데(priceValidUntil) 화면이 받아 두지 않아 거를 수가 없었다.
          납기일자와 <b>다른 값</b>이다 — 물건이 오는 날과 값이 살아 있는 날은 따로다.
        */}
        <EcCond label="유효기간">
          <input type="date" className="ec-input" value={cond.validFrom}
                 onChange={(e) => setC({ validFrom: e.target.value })} style={{ width: 140 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={cond.validTo}
                 onChange={(e) => setC({ validTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        {/* 원본 차례: 납기일자 · <b>창고 · 거래처</b> · 품목 (사본 실측) — 우리는 뒤바뀌어 있었다. */}
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.warehouse} onChange={(v) => setC({ warehouse: v })}
                           items={pickers.warehouses} />
        </EcCond>
        {/*
          원본 <b>두 화면이 프로젝트를 다른 자리에 둔다</b>(사본 실측) —
          발주계획현황은 창고 · <b>프로젝트</b> · 거래처 · 품목, 단가요청현황은
          거래처 · 품목 · <b>프로젝트</b> 다. 한 파일이라 하나만 고를 수 있어
          조건이 더 많은 발주계획현황에 맞춘다.
        */}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={cond.project} onChange={(v) => setC({ project: v })}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={cond.partner} onChange={(v) => setC({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        {/* 원본 차례는 두 화면 모두 [품목] 바로 뒤가 [품목구분]이다(사본 실측). */}
        <EcCond label="품목구분">
          <select className="ec-input" value={cond.category}
                  onChange={(e) => setC({ category: e.target.value })} style={{ width: 130 }}>
            <option value="">전체</option>
            {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </EcCond>
        {/* 원본 조건 [담당자] — 표에는 찍는데 그것으로 거를 수가 없었다. */}
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={cond.employee} onChange={(v) => setC({ employee: v })}
                           items={pickers.employees} />
        </EcCond>
        {/* 원본 차례: 담당자 · <b>거래처관리담당자 · 외화종류</b> (사본 실측 — 두 화면이 같다). */}
        {/* 원본은 사람을 고르는 칸을 <b>코드도움</b>으로 둔다 — 담당자 칸과 같은 모양이다. */}
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={170} emptyLabel="전체"
                           value={cond.partnerManager} onChange={(v) => setC({ partnerManager: v })}
                           items={partnerManagers.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="외화종류">
          <select className="ec-input" value={cond.currency}
                  onChange={(e) => setC({ currency: e.target.value })} style={{ width: 110 }}>
            <option value="">전체</option>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </EcCond>
        {/* 원본 차례: 외화종류 · <b>거래유형</b> (발주계획현황). 판매·구매조회와 같은 규칙이다. */}
        <EcCond label="거래유형">
          <select className="ec-input" value={cond.taxKind}
                  onChange={(e) => setC({ taxKind: e.target.value })} style={{ width: 100 }}>
            <option value="">전체</option>
            <option value="과세">과세</option>
            <option value="면세">면세</option>
          </select>
        </EcCond>
        {/*
          원본 조건 판의 <b>[진행상태]</b>(사본 실측). 우리는 위 <b>단계 카드</b>를 눌러
          고르게만 해 두어서, 조건 판만 보는 사람은 <b>지금 어느 단계를 보고 있는지</b>도
          모르고 다른 단계로 옮길 수도 없었다. 카드와 <b>같은 값</b>을 쓴다.
        */}
        {/*
          원본 차례: 담당자 · <b>규격 · 적요</b> · 진행상태(발주계획현황) 인데,
          단가요청현황은 적요 · 규격 순이다 — 조건이 더 많은 발주계획현황에 맞춘다.
        */}
        <EcCond label="규격">
          <input className="ec-input" value={cond.spec}
                 onChange={(e) => setC({ spec: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        {/* 원본 차례: 규격 · <b>수량 · 단가 · 공급가액 · 부가세</b> (발주계획현황). */}
        <EcCond label="수량">
          <input type="number" className="ec-input text-right" placeholder="이상" value={cond.qtyFrom}
                 onChange={(e) => setC({ qtyFrom: e.target.value })} style={{ width: 90 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="number" className="ec-input text-right" placeholder="이하" value={cond.qtyTo}
                 onChange={(e) => setC({ qtyTo: e.target.value })} style={{ width: 90 }} />
        </EcCond>
        <EcCond label="단가">
          <input type="number" className="ec-input text-right" placeholder="이상" value={cond.priceFrom}
                 onChange={(e) => setC({ priceFrom: e.target.value })} style={{ width: 100 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="number" className="ec-input text-right" placeholder="이하" value={cond.priceTo}
                 onChange={(e) => setC({ priceTo: e.target.value })} style={{ width: 100 }} />
        </EcCond>
        <EcCond label="공급가액">
          <input type="number" className="ec-input text-right" placeholder="이상" value={cond.supplyFrom}
                 onChange={(e) => setC({ supplyFrom: e.target.value })} style={{ width: 110 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="number" className="ec-input text-right" placeholder="이하" value={cond.supplyTo}
                 onChange={(e) => setC({ supplyTo: e.target.value })} style={{ width: 110 }} />
        </EcCond>
        <EcCond label="부가세">
          <input type="number" className="ec-input text-right" placeholder="이상" value={cond.vatFrom}
                 onChange={(e) => setC({ vatFrom: e.target.value })} style={{ width: 100 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="number" className="ec-input text-right" placeholder="이하" value={cond.vatTo}
                 onChange={(e) => setC({ vatTo: e.target.value })} style={{ width: 100 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={cond.remark}
                 onChange={(e) => setC({ remark: e.target.value })} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="진행상태">
          <select className="ec-input" value={status} style={{ width: 140 }}
                  onChange={(e) => setStatus(e.target.value as PurchaseOrderStatus)}>
            {PIPELINE.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </select>
        </EcCond>
        {/* 원본 차례: 조건 판 <b>맨 끝</b>이다(사본 실측 — 두 화면이 같다). */}
        <EcCond label="정렬/소계기준">
          <div className="ec-pills">
            {SUBTOTALS.map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                      onClick={() => setSubtotal(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      {prevTotals && (
        <div style={{ marginBottom: 8, fontSize: 12.5, textAlign: 'right', color: '#5a626e' }}>
          <span style={{ color: 'var(--ec-label)' }}>
            비교기간({prevRange!.from.replace(/-/g, '/')} ~ {prevRange!.to.replace(/-/g, '/')})
          </span>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          건수 {prevTotals.count.toLocaleString()} → {shown.length.toLocaleString()}
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
        <span style={{ color: STATUS_COLOR[status], fontWeight: 700 }}>{STATUS_LABEL[status]}</span>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        수량 <b style={{ color: '#3c4553', fontSize: 14 }}>{totals.qty.toLocaleString()}</b>
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
              {/* 묶은 축의 이름을 그대로 단다 — '매입처' 라 써 놓고 품목을 늘어놓으면 거짓말이 된다. */}
              <th>{subtotal}</th>
              <th style={{ textAlign: 'right' }}>건수</th>
              <th style={{ textAlign: 'right' }}>수량</th>
              <th style={{ textAlign: 'right' }}>공급가액</th>
              <th style={{ textAlign: 'right' }}>부가세</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={g.partner}>
                <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                <td>{g.partner}</td>
                <td style={{ textAlign: 'right' }}>{g.count.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.qty.toLocaleString()}</td>
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
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('발주일자')}>발주일자 {sort.mark('발주일자')}</th>
            <th>납기</th>
            <th>발주번호</th>
            <th>매입처</th>
            <th>창고</th>
            <th>담당자</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? `${STATUS_LABEL[status]} 상태의 발주서가 없습니다.` : '검색조건에 맞는 자료가 없습니다.'}
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

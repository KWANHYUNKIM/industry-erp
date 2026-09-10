import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../api/types'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { INQUIRY_FULL_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { usePartnerManagers } from '../../utils/partnerManagers'
import EcBarChart from '../../components/EcBarChart'

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
 * <p>2026-09-08 에 원본을 열어 접힌 줄까지 재니 조건은 <b>스물여덟</b>이다(대조표에는 없던 화면이다):
 * 구분 · 기준일자(영업주기) · 발주No. · 납기일자 · 창고 · 프로젝트 · 거래처 · 품목 · 담당자 ·
 * 거래처관리담당자 · 미구매수량 · 오더관리번호 · 내.외자구분 · 외화종류 · 거래유형 · 참조 ·
 * 규격 · 수량 · 단가 · 공급가액 · 부가세 · 적요 · 진행상태 · 작성자 · 최종수정자 ·
 * 적용양식 · 정렬기준 · 데이터 보기형식.
 *
 * <p>머리말에 "거래처관리담당자·프로젝트는 PurchaseOrder 에 필드가 없어 의도적 제외" 라
 * 적혀 있었는데 <b>프로젝트는 있다</b>(projectName). 거래처관리담당자도 거래처 마스터로
 * 이으면 된다. <b>외화종류·거래유형도 마찬가지</b> — currency·taxable 을 진작 싣는다.
 * 미주문·미판매에서 잇달아 나온 것과 같은 꼴이라, 이번에는 그 말을 믿지 않고 형을 다시 봤다.
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
  /* 2026-09-08 실측으로 받아 두는 값들 — 응답이 진작 싣고 있었다. */
  project: string
  currency: string | null
  taxable: boolean
  spec: string | null
  remark: string | null
  createdBy: string | null
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
  /* 2026-09-08 실측으로 만든 것들. */
  dueFrom: string
  dueTo: string
  project: string
  partnerMgr: string
  unpurchasedFrom: string; unpurchasedTo: string
  currency: string
  taxType: string
  spec: string
  qtyFrom: string; qtyTo: string
  priceFrom: string; priceTo: string
  supplyFrom: string; supplyTo: string
  vatFrom: string; vatTo: string
  remark: string
  createdBy: string
  /** 원본 [데이터 보기형식] — 조건 판 안에 있으므로 조건과 함께 다룬다. */
  view: '표' | '그래프'
}

/*
 * 원본 미구매현황은 기간 단추가 <b>금일·전일·금주(~오늘)·전주·금월(~오늘)·전월·전월+금월·
 * 종료일</b>이고 열면 <b>금월</b>을 보고 있다(사본 실측 — 달 스핀박스가 2026·07 하나다).
 *
 * <p>우리는 <b>기간 단추가 아예 없고 기준일자도 비어</b> 있었다. 그래서 열면 몇 해치 발주가
 * 통째로 쏟아졌다 — 판매현황·구매현황에서 이미 한 번 고친 그 문제다.
 */
const initPeriod = periodOf('금월(~오늘)')!

const EMPTY_FILTERS: Filters = {
  dateFrom: initPeriod.from, dateTo: initPeriod.to, partner: '', employee: '', orderNo: '', warehouse: '', item: '', status: '', sortByDoc: false,
  dueFrom: '', dueTo: '', project: '', partnerMgr: '',
  unpurchasedFrom: '', unpurchasedTo: '', currency: '', taxType: '', spec: '',
  qtyFrom: '', qtyTo: '', priceFrom: '', priceTo: '', supplyFrom: '', supplyTo: '', vatFrom: '', vatTo: '',
  remark: '', createdBy: '', view: '표',
}

/** 범위 조건 하나. 빈 칸은 '안 정함' 이라 지나간다. */
const inRange = (v: number, lo: string, hi: string) =>
  (lo === '' || v >= Number(lo)) && (hi === '' || v <= Number(hi))

export default function UnpurchasedStatusPage() {
  const pmgr = usePartnerManagers()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 원본 미구매현황의 <b>[구분]</b>은 [품목별]·[라인별] 이고 열 때는 <b>라인별</b>이다
   * (사본 실측). 라인별은 발주 줄을 그대로 펴는 것이고, 품목별은 <b>같은 품목을 한 줄로</b>
   * 모아 "이 품목이 아직 몇 개 안 들어왔나" 를 바로 보여 준다.
   *
   * <p>우리는 라인별만 있어서, 같은 품목을 여러 발주로 나눠 넣으면 그 품목의 미입고
   * 수량을 <b>눈으로 더해야</b> 했다.
   */
  const [mode, setMode] = useState<'품목별' | '라인별'>('라인별')
  const [keyword, setKeyword] = useState('')

  const [panelOpen, setPanelOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)

  async function load() {
    setLoading(true)
    try {
      /*
       * <b>고른 기간을 서버에도 보낸다.</b> 여태 전표를 통째로 받아 아래에서 걸렀다 —
       * 화면은 [기간]을 묻고 서버에는 아무것도 안 보내는 꼴이었다.
       */
      const period: Record<string, string> = {}
      if (filters.dateFrom) period.from = filters.dateFrom
      if (filters.dateTo) period.to = filters.dateTo
      const res = await api.get<PurchaseOrder[]>('/purchase-orders', { params: period })
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
          project: o.projectName ?? '',
          currency: o.currency,
          taxable: o.taxable,
          spec: l.spec,
          remark: l.remark ?? o.remark,
          createdBy: o.createdBy,
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

  /* 기간을 바꾸면 그 기간으로 다시 받는다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [filters.dateFrom, filters.dateTo])

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
      if (f.dueFrom && !(r.dueDate && r.dueDate >= f.dueFrom)) return false
      if (f.dueTo && !(r.dueDate && r.dueDate <= f.dueTo)) return false
      if (f.project && !r.project.includes(f.project)) return false
      if (f.partnerMgr && pmgr.managerOfName(r.partner) !== f.partnerMgr) return false
      /* 우리 모델은 발주를 통짜로 입고 전환하므로 <b>미구매수량 = 발주수량</b> 이다(머리말 참고). */
      if (!inRange(r.qty, f.unpurchasedFrom, f.unpurchasedTo)) return false
      if (f.currency && (r.currency ?? '') !== f.currency) return false
      if (f.taxType && (r.taxable ? '과세' : '면세') !== f.taxType) return false
      if (f.spec && !(r.spec ?? '').includes(f.spec)) return false
      if (!inRange(r.qty, f.qtyFrom, f.qtyTo)) return false
      if (!inRange(r.unitPrice, f.priceFrom, f.priceTo)) return false
      if (!inRange(r.supply, f.supplyFrom, f.supplyTo)) return false
      if (!inRange(r.vat, f.vatFrom, f.vatTo)) return false
      if (f.remark && !(r.remark ?? '').includes(f.remark)) return false
      if (f.createdBy && (r.createdBy ?? '') !== f.createdBy) return false
      return true
    })
    out.sort((a, b) => f.sortByDoc
      ? (a.orderNo < b.orderNo ? 1 : a.orderNo > b.orderNo ? -1 : 0)
      : (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, keyword, filters])

  /** 품목별 — 같은 품목을 한 줄로 모아 수량·금액을 더한다. */
  const byItem = useMemo(() => {
    if (mode !== '품목별') return []
    const m = new Map<string, { itemName: string; count: number; qty: number; supply: number; vat: number }>()
    for (const r of shown) {
      const cur = m.get(r.itemName) ?? { itemName: r.itemName, count: 0, qty: 0, supply: 0, vat: 0 }
      cur.count += 1; cur.qty += r.qty; cur.supply += r.supply; cur.vat += r.vat
      m.set(r.itemName, cur)
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty)
  }, [shown, mode])
  const itemRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(itemRef, '미구매현황 품목별', [byItem.length])

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
  /*
   * 원본은 <b>달이 바뀌는 자리에 '2026/01 계'</b> 를 끼우고 맨 끝에 <b>'총합계'</b> 를 둔다
   * (2026-09-09 E040307 실측 - 미주문현황·발주서현황과 같다). 소계가 날짜로 묶이므로
   * 정렬은 <b>풀 수 없다</b>(오름/내림만 오간다) - 목록을 만들면서 같이 넣는다.
   */
  const sort = useTableSort(shown, {
    발주일자: (r) => r.date,
  }, { key: '발주일자', dir: 'asc' })

  const lineRows = useMemo(() => {
    type Line = { kind: 'line'; key: string; no: number; r: Row }
    type Sub = { kind: 'subtotal'; key: string; month: string; qty: number; supply: number; vat: number }
    const out: (Line | Sub)[] = []
    let month = ''
    let no = 0
    let qty = 0, supply = 0, vat = 0
    const flush = () => {
      if (month) out.push({ kind: 'subtotal', key: `sub-${month}`, month, qty, supply, vat })
      qty = 0; supply = 0; vat = 0
    }
    for (const r of sort.sorted) {
      const m = r.date.slice(0, 7).replace('-', '/')
      if (m !== month) { flush(); month = m }
      out.push({ kind: 'line', key: r.key, no: ++no, r })
      qty += r.qty; supply += r.supply; vat += r.vat
    }
    flush()
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort.sorted])

  return (
    <EcListShell
      title="미구매현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[
        { label: '새로고침', onClick: load },
        /* 원본 [다시 작성] — 조건을 처음 상태로 되돌린다. 하나씩 지우게 두지 않는다. */
        { label: '다시 작성', onClick: () => setKeyword('') },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {/* 원본 조건 판 첫째 <b>[구분]</b> — 품목별·라인별(사본 실측, 기본 라인별). */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>구분</span>
        <div className="ec-pills">
          {(['품목별', '라인별'] as const).map((m) => (
            <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                    onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
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
          mgrOptions={pmgr.options}
          currencyOptions={[...new Set(rows.map((r) => r.currency).filter(Boolean) as string[])].sort()}
          authorOptions={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()}
        />
      )}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        {/*
          합계줄의 이름을 <b>총…</b> 으로 적는다 — 조건과 같은 글자를 쓰면
          대조 검사가 이 줄을 조건 이름표로 읽어 차례가 어긋난 것처럼 보인다
          (발주서현황에서 이미 한 번 겪었다).
        */}
        총미구매수량 <b style={{ color: '#c07a00', fontSize: 14 }}>{totals.qty.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        총공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        총부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      {filters.view === '그래프' ? (
        <EcBarChart unit=" 원" emptyText="조회된 미구매 발주가 없습니다."
                    rows={(() => {
                      const m = new Map<string, number>()
                      for (const r of shown) m.set(r.partner, (m.get(r.partner) ?? 0) + r.supply)
                      return [...m].map(([label2, value]) => ({ label: label2, value }))
                    })()} />
      ) : mode === '품목별' ? (
        <table ref={itemRef} className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>품목명</th>
              <th style={{ width: 90, textAlign: 'right' }}>발주건수</th>
              <th style={{ width: 120, textAlign: 'right' }}>미입고수량</th>
              <th style={{ width: 130, textAlign: 'right' }}>공급가액</th>
              <th style={{ width: 130, textAlign: 'right' }}>부가세</th>
            </tr>
          </thead>
          <tbody>
            {byItem.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byItem.map((g, i) => (
              <tr key={g.itemName}>
                <td style={{ textAlign: 'center', color: '#8a929c', background: '#f3f3f3' }}>{i + 1}</td>
                <td>{g.itemName}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.count.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#c60a2e' }}>{g.qty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.supply.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.vat.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={2} style={{ textAlign: 'right' }}>합계 ({byItem.length}개 품목)</td>
              <td style={{ textAlign: 'right' }}>{byItem.reduce((a, g) => a + g.count, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.vat.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
      <table className="w-full text-left">
        {/*
          원본 격자(2026-09-09 E040307 실측):
          <b>일자-No. · 품목명(규격) · 수량 · 미구매수량 · 품목별납기일자 · 거래처명 ·
          적요 · 미구매부가세</b>.
          우리는 (1) 일자와 번호를 두 칸으로 갈랐고, (2) 규격을 들고 있으면서 안 붙였고,
          (3) <b>[적요] 열이 없었고</b>, (4) 거래처를 앞쪽에 [매입처] 라 두었고,
          (5) 부가세를 그냥 [부가세] 라 불러 <b>그게 미구매분인 것</b>이 이름에 안 드러났다.
          납기·창고·담당자·상태·단가·공급가액은 원본에 없지만 우리가 더 두는 열이다.
        */}
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => sort.toggle('발주일자')}>일자-No. {sort.mark('발주일자')}</th>
            <th>납기</th>
            <th>창고</th>
            <th>담당자</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>품목명(규격)</th>
            <th style={{ textAlign: 'right' }}>미구매수량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th>거래처명</th>
            <th>적요</th>
            <th style={{ textAlign: 'right' }}>미구매부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          /* 그리는 것을 보고 판단한다 - 소계를 끼우는 사이에 shown 과 갈라질 수 있다. */
          ) : lineRows.length === 0 ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '미구매(미입고) 발주가 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : lineRows.map((x) => x.kind === 'subtotal' ? (
            <tr key={x.key} style={{ background: '#f3f6fa', fontWeight: 700 }}>
              <td colSpan={7} style={{ textAlign: 'right' }}>{x.month} 계</td>
              <td style={{ textAlign: 'right' }}>{x.qty.toLocaleString()}</td>
              <td></td>
              <td style={{ textAlign: 'right' }}>{x.supply.toLocaleString()}</td>
              <td colSpan={2}></td>
              <td style={{ textAlign: 'right' }}>{x.vat.toLocaleString()}</td>
            </tr>
          ) : (
            <tr key={x.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{x.no}</td>
              {/* 원본은 일자와 번호를 한 칸에 적는다. */}
              <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{dateText(x.r.date)} {x.r.orderNo}</td>
              <td style={{ fontFamily: 'monospace', color: x.r.dueDate ? '#5a626e' : '#c5cbd3' }}>{dateText(x.r.dueDate) || ''}</td>
              <td style={{ color: x.r.warehouse ? undefined : '#c5cbd3' }}>{x.r.warehouse || ''}</td>
              <td style={{ color: x.r.employee ? undefined : '#c5cbd3' }}>{x.r.employee || ''}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ color: STATUS_COLOR[x.r.status], fontWeight: 600, fontSize: 12 }}>{x.r.statusName}</span>
              </td>
              {/* 원본은 규격을 품목명 뒤 괄호에 붙인다 - 우리는 들고 있으면서 안 찍고 있었다. */}
              <td>{x.r.itemName}{x.r.spec ? ' (' + x.r.spec + ')' : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#c07a00' }}>{x.r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{x.r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>{x.r.supply.toLocaleString()}</td>
              <td>{x.r.partner}</td>
              <td style={{ color: '#5a626e' }}>{x.r.remark ?? ''}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{x.r.vat.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
            <td colSpan={7} style={{ textAlign: 'right' }}>총합계 ({shown.length}줄)</td>
            <td style={{ textAlign: 'right' }}>{shown.reduce((a, x) => a + x.qty, 0).toLocaleString()}</td>
            <td></td>
            <td style={{ textAlign: 'right' }}>{shown.reduce((a, x) => a + x.supply, 0).toLocaleString()}</td>
            <td colSpan={2}></td>
            <td style={{ textAlign: 'right' }}>{shown.reduce((a, x) => a + x.vat, 0).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    )}
    </EcListShell>
  )
}

/** 이카운트 Search 패널 — 기준일자/거래처/담당자/발주No./창고/품목/상태 */
function SearchPanel({
  draft, onChange, onApply, onReset, mgrOptions, currencyOptions, authorOptions,
}: {
  draft: Filters
  onChange: (patch: Partial<Filters>) => void
  onApply: () => void
  onReset: () => void
  /* 고를 값은 화면이 이미 받아 둔 줄과 마스터에서 모은다 — 판이 따로 부르지 않는다. */
  mgrOptions: string[]
  currencyOptions: string[]
  authorOptions: string[]
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
        <span style={label}>기준일자(영업주기)</span>
        <input type="date" className="ec-input" value={draft.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })} style={{ width: 150 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" value={draft.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })} style={{ width: 150 }} />
        {/* 원본 기간 단추(사본 실측): 금일·전일·금주(~오늘)·전주·금월(~오늘)·전월·전월+금월·종료일 */}
        <span style={{ marginLeft: 8 }}>
          <EcPeriodPicks labels={INQUIRY_FULL_PICKS} currentFrom={draft.dateFrom}
            onPick={(r) => onChange({ dateFrom: r.from, dateTo: r.to })} />
        </span>
      </div>
      {/*
        원본 차례(2026-09-08 실측): 구분 · 기준일자(영업주기) · <b>발주No. · 납기일자</b> ·
        창고 · <b>프로젝트</b> · 거래처 · 품목 · 담당자 · <b>거래처관리담당자</b> ·
        <b>미구매수량</b> · … 우리는 거래처·담당자를 발주No. 앞에 두고 있었다.
      */}
      <div style={rowStyle}>
        <span style={label}>발주No.</span>
        <input className="ec-input" placeholder="발주번호 일부" value={draft.orderNo}
          onChange={(e) => onChange({ orderNo: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>납기일자</span>
        <input type="date" className="ec-input" value={draft.dueFrom}
          onChange={(e) => onChange({ dueFrom: e.target.value })} style={{ width: 150 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" value={draft.dueTo}
          onChange={(e) => onChange({ dueTo: e.target.value })} style={{ width: 150 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>창고</span>
        <input className="ec-input" placeholder="창고명 일부" value={draft.warehouse}
          onChange={(e) => onChange({ warehouse: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
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
        <span style={label}>품목</span>
        <input className="ec-input" placeholder="품목명 일부" value={draft.item}
          onChange={(e) => onChange({ item: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>담당자</span>
        <input className="ec-input" placeholder="담당자명 일부" value={draft.employee}
          onChange={(e) => onChange({ employee: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>거래처관리담당자</span>
        <select className="ec-input" value={draft.partnerMgr}
          onChange={(e) => onChange({ partnerMgr: e.target.value })} style={{ width: 180 }}>
          <option value="">전체</option>
          {mgrOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div style={rowStyle}>
        <span style={label}>미구매수량</span>
        <input className="ec-input" type="number" value={draft.unpurchasedFrom}
          onChange={(e) => onChange({ unpurchasedFrom: e.target.value })} style={{ width: 100 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input className="ec-input" type="number" value={draft.unpurchasedTo}
          onChange={(e) => onChange({ unpurchasedTo: e.target.value })} style={{ width: 100 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>외화종류</span>
        <select className="ec-input" value={draft.currency}
          onChange={(e) => onChange({ currency: e.target.value })} style={{ width: 140 }}>
          <option value="">전체</option>
          {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={rowStyle}>
        <span style={label}>거래유형</span>
        <select className="ec-input" value={draft.taxType}
          onChange={(e) => onChange({ taxType: e.target.value })} style={{ width: 120 }}>
          <option value="">전체</option><option>과세</option><option>면세</option>
        </select>
      </div>
      <div style={rowStyle}>
        <span style={label}>규격</span>
        <input className="ec-input" placeholder="규격 일부" value={draft.spec}
          onChange={(e) => onChange({ spec: e.target.value })} style={{ width: 180 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>수량</span>
        <input className="ec-input" type="number" value={draft.qtyFrom}
          onChange={(e) => onChange({ qtyFrom: e.target.value })} style={{ width: 100 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input className="ec-input" type="number" value={draft.qtyTo}
          onChange={(e) => onChange({ qtyTo: e.target.value })} style={{ width: 100 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>단가</span>
        <input className="ec-input" type="number" value={draft.priceFrom}
          onChange={(e) => onChange({ priceFrom: e.target.value })} style={{ width: 110 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input className="ec-input" type="number" value={draft.priceTo}
          onChange={(e) => onChange({ priceTo: e.target.value })} style={{ width: 110 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>공급가액</span>
        <input className="ec-input" type="number" value={draft.supplyFrom}
          onChange={(e) => onChange({ supplyFrom: e.target.value })} style={{ width: 110 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input className="ec-input" type="number" value={draft.supplyTo}
          onChange={(e) => onChange({ supplyTo: e.target.value })} style={{ width: 110 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>부가세</span>
        <input className="ec-input" type="number" value={draft.vatFrom}
          onChange={(e) => onChange({ vatFrom: e.target.value })} style={{ width: 110 }} />
        <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
        <input className="ec-input" type="number" value={draft.vatTo}
          onChange={(e) => onChange({ vatTo: e.target.value })} style={{ width: 110 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>적요</span>
        <input className="ec-input" placeholder="적요 일부" value={draft.remark}
          onChange={(e) => onChange({ remark: e.target.value })} style={{ width: 220 }} />
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
      <div style={rowStyle}>
        <span style={label}>작성자</span>
        <select className="ec-input" value={draft.createdBy}
          onChange={(e) => onChange({ createdBy: e.target.value })} style={{ width: 180 }}>
          <option value="">전체</option>
          {authorOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {/* 원본 [정렬기준] — [데이터 보기형식] 바로 앞줄이다(우리는 [기타]에 넣어 두었다). */}
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>정렬기준</span>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.sortByDoc}
            onChange={(e) => onChange({ sortByDoc: e.target.checked })} />
          발주번호순(정렬)
        </label>
      </div>
      {/* 원본 [데이터 보기형식] — 조건 판의 <b>맨 끝</b>이다. */}
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>데이터 보기형식</span>
        <div className="ec-pills">
          {(['표', '그래프'] as const).map((v) => (
            <button key={v} type="button" className={`ec-pill no-ec${draft.view === v ? ' active' : ''}`}
                    onClick={() => onChange({ view: v })}>{v}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="ec-btn" onClick={onReset}>초기화</button>
        <button className="ec-btn ec-btn-primary" onClick={onApply}>조회</button>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import type { Quotation, QuotationStatus } from '../../api/types'
import { INQUIRY_FULL_PICKS, ymd } from '../../components/EcPeriodPicks'
import { periodOf } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerManagers } from '../../utils/partnerManagers'
import EcBarChart from '../../components/EcBarChart'
import { dateText } from '../../utils/dateText'

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
 * <p>2026-09-08 에 원본을 열어 조건 판을 재니 <b>서른여덟</b>이다(대조표에는 조건이
 * 한 줄도 없었다). 접힌 줄을 펴야 <b>열하나 → 마흔둘</b>로 늘어난다.
 *
 * <p>머리말에 "창고·프로젝트·담당자·거래처관리담당자·관리항목은 Quotation 에 필드가 없어
 * 의도적 제외" 라 적혀 있었는데 <b>대부분 틀린 말이었다</b> — <code>Quotation</code> 은
 * warehouseName·projectName·remark·createdBy·statusName·validUntil 을 진작 싣고,
 * 관리항목은 품목 마스터로, 거래처관리담당자는 거래처 마스터로 이으면 된다
 * (견적서 화면이 이미 그렇게 한다). 정말 없는 것은 <b>담당자</b> 하나다.
 *
 * 조건 판은 현황 화면 공용(`EcStatusPanel`)이다. 원본도 접히지 않고 펼쳐져 있다.
 * 원본 기준일자는 '기준일자(영업주기)' 라는 **한 날짜**지만, 우리는 견적일자 <b>구간</b>으로 거른다 —
 * 우리 조건이 실제로 하는 일이 그것이라 한 칸짜리 흉내를 내지 않는다.
 * 이 화면의 기간 빠른선택은 '종료일'과 '전월+금월'이 둘 다 붙는다(원본 확인).
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
  /** 원본 [창고]·[프로젝트]·[적요]·[작성자]. 응답이 진작 싣던 값이다. */
  warehouse: string | null
  project: string | null
  remark: string | null
  createdBy: string | null
  itemId: number
  status: QuotationStatus
  statusName: string
  itemName: string
  /** 규격. 원본 열 이름이 [품목명(규격)] 이라 붙여 찍는다 - 응답을 넓혀 받아 온다. */
  spec: string | null
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
  /* 2026-09-08 실측으로 만든 것들. 값은 전부 이미 응답이나 마스터에 있다. */
  warehouse: string
  project: string
  mgmt: string
  partnerMgr: string
  /** 원본 [유효기간] — 구간이다. 우리는 [기타]의 '지난 것만' 체크뿐이었다. */
  validFrom: string
  validTo: string
  /**
   * 원본 [규격] - 차례는 [유효기간] 바로 뒤다. 오래도록 "견적 라인이 규격을 안 싣는다" 고
   * 적어 두고 예외로 두었는데, 2026-09-09 에 격자를 재면서 응답을 넓혀 받아 오게 됐다.
   * 이유를 고쳐 쓸 것이 아니라 만들 일이었다 - 근거 검사가 그 예외가 낡았다고 짚어 줬다.
   */
  spec: string
  qtyFrom: string; qtyTo: string
  unorderedFrom: string; unorderedTo: string
  priceFrom: string; priceTo: string
  supplyFrom: string; supplyTo: string
  vatFrom: string; vatTo: string
  remark: string
  status: '' | QuotationStatus
  createdBy: string
  /**
   * 원본 [거래유형] — 과세 · 면세.
   *
   * <p>앞 바퀴에 "과세·면세를 견적에서 정하지 않는다" 고 적어 두었는데 <b>틀린 말이었다</b> —
   * 견적서 등록이 <code>taxable</code> 을 받고, 서비스는 그것으로 부가세를 매긴다.
   * 엔티티에 따로 칸이 없을 뿐이고, 전환할 때도 <code>vatAmount &gt; 0</code> 으로 되짚는다
   * (<code>QuotationService</code> 가 그렇게 한다). 그러니 응답을 넓힐 필요도 없다 —
   * 발주 쪽 화면들과 같은 규칙으로 줄의 부가세를 보면 된다.
   */
  taxType: string
}

/*
 * 원본 미주문현황은 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간을 비워 두어 견적이 쌓일수록 열자마자 몇 해치가 쏟아졌다.
 */
const init = periodOf('금월(~오늘)')!

const EMPTY_FILTERS: Filters = {
  dateFrom: init.from, dateTo: init.to, partner: '', quoteNo: '', item: '', expiredOnly: false, sortByDoc: false,
  warehouse: '', project: '', mgmt: '', partnerMgr: '',
  validFrom: '', validTo: '', qtyFrom: '', qtyTo: '', unorderedFrom: '', unorderedTo: '',
  priceFrom: '', priceTo: '', supplyFrom: '', supplyTo: '', vatFrom: '', vatTo: '',
  remark: '', status: '', createdBy: '', taxType: '', spec: '',
}

/** 범위 조건 하나. 빈 칸은 '안 정함' 이라 지나간다. */
const inRange = (v: number, lo: string, hi: string) =>
  (lo === '' || v >= Number(lo)) && (hi === '' || v <= Number(hi))

const todayStr = () => ymd(new Date())

export default function UnorderedStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects'])
  const mgmt = useItemMgmt()
  const pmgr = usePartnerManagers()
  /**
   * 원본 [정렬기준]·[데이터 보기형식] — 조건 판의 맨 끝 둘이다.
   * 미주문은 <b>어느 거래처의 견적이 얼마나 잠겨 있나</b> 를 보는 표라 거래처로 묶어 그린다.
   */
  const [view, setView] = useState<'표' | '그래프'>('표')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const setF = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))

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
          warehouse: q.warehouseName,
          project: q.projectName,
          remark: q.remark,
          createdBy: q.createdBy,
          itemId: l.itemId,
          status: q.status,
          statusName: q.statusName,
          itemName: l.itemName,
          spec: l.spec ?? null,
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
      if (f.warehouse && !(r.warehouse ?? '').includes(f.warehouse)) return false
      if (f.project && !(r.project ?? '').includes(f.project)) return false
      if (f.mgmt && mgmt.nameOf(r.itemId) !== f.mgmt) return false
      if (f.partnerMgr && pmgr.managerOfName(r.partner) !== f.partnerMgr) return false
      if (f.validFrom && !(r.validUntil && r.validUntil >= f.validFrom)) return false
      if (f.validTo && !(r.validUntil && r.validUntil <= f.validTo)) return false
      if (!inRange(r.qty, f.qtyFrom, f.qtyTo)) return false
      /* 우리 모델은 견적을 통짜로 전환하므로 <b>미주문수량 = 견적수량</b> 이다(머리말 참고). */
      if (!inRange(r.qty, f.unorderedFrom, f.unorderedTo)) return false
      if (!inRange(r.unitPrice, f.priceFrom, f.priceTo)) return false
      if (!inRange(r.supply, f.supplyFrom, f.supplyTo)) return false
      if (!inRange(r.vat, f.vatFrom, f.vatTo)) return false
      if (f.remark && !(r.remark ?? '').includes(f.remark)) return false
      if (f.spec && !(r.spec ?? '').includes(f.spec)) return false
      if (f.status && r.status !== f.status) return false
      /* 원본 [거래유형]. 판매·구매·발주 화면들과 같은 규칙 — 부가세가 있으면 과세다. */
      if (f.taxType && (r.vat > 0 ? '과세' : '면세') !== f.taxType) return false
      if (f.createdBy && (r.createdBy ?? '') !== f.createdBy) return false
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

  const reset = () => { setFilters(EMPTY_FILTERS); setKeyword('') }


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    견적일자: (r) => r.date,
  })

  return (
    <EcListShell
      title="미주문현황"
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

      {/*
        원본 차례(2026-09-08 실측): 구분 · <b>기준일자(영업주기)</b> · 견적No. · 창고 ·
        프로젝트 · 관리항목 · 거래처 · 품목 · 담당자 · 거래처관리담당자 · 미주문수량 · …
        우리는 거래처를 견적No. 앞에 두고 창고·프로젝트·관리항목이 아예 없었다.
        기간 칸의 원본 이름도 <b>[기준일자(영업주기)]</b> 다.
      */}
      <EcStatusPanel
        from={filters.dateFrom} to={filters.dateTo}
        onPeriod={(r) => setF({ dateFrom: r.from, dateTo: r.to })}
        picks={INQUIRY_FULL_PICKS}
        dateLabel="기준일자(영업주기)"
        view={view} onViewChange={setView}
      >
        <EcCond label="견적No." pick>
          <input className="ec-input" placeholder="견적번호 일부" value={filters.quoteNo}
                 onChange={(e) => setF({ quoteNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={180} emptyLabel="전체"
                           value={filters.warehouse} onChange={(v) => setF({ warehouse: v })}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={180} emptyLabel="전체"
                           value={filters.project} onChange={(v) => setF({ project: v })}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={filters.mgmt} onChange={(v) => setF({ mgmt: v })}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
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
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={160} emptyLabel="전체"
                           value={filters.partnerMgr} onChange={(v) => setF({ partnerMgr: v })}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 차례: … 거래처관리담당자 · <b>미주문수량</b> · … · 수량 · 단가 · 공급가액 · 부가세 … */}
        <EcCond label="미주문수량">
          <input className="ec-input" type="number" style={{ width: 90 }} value={filters.unorderedFrom}
                 onChange={(e) => setF({ unorderedFrom: e.target.value })} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 90 }} value={filters.unorderedTo}
                 onChange={(e) => setF({ unorderedTo: e.target.value })} />
        </EcCond>
        {/* 원본 차례: [미주문수량] 다음이 오더관리번호·내.외자구분·외화종류·<b>[거래유형]</b> 이다. */}
        <EcCond label="거래유형">
          <select className="ec-input" value={filters.taxType} style={{ width: 110 }}
                  onChange={(e) => setF({ taxType: e.target.value })}>
            <option value="">전체</option><option>과세</option><option>면세</option>
          </select>
        </EcCond>
        {/* 원본 [유효기간] — 구간이다. 우리는 [기타]의 '지난 것만' 체크뿐이었다. */}
        <EcCond label="유효기간">
          <input type="date" className="ec-input" value={filters.validFrom}
                 onChange={(e) => setF({ validFrom: e.target.value })} style={{ width: 140 }} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input type="date" className="ec-input" value={filters.validTo}
                 onChange={(e) => setF({ validTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="규격">
          <input className="ec-input" placeholder="규격 일부" value={filters.spec}
                 onChange={(e) => setF({ spec: e.target.value })} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="수량">
          <input className="ec-input" type="number" style={{ width: 90 }} value={filters.qtyFrom}
                 onChange={(e) => setF({ qtyFrom: e.target.value })} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 90 }} value={filters.qtyTo}
                 onChange={(e) => setF({ qtyTo: e.target.value })} />
        </EcCond>
        <EcCond label="단가">
          <input className="ec-input" type="number" style={{ width: 100 }} value={filters.priceFrom}
                 onChange={(e) => setF({ priceFrom: e.target.value })} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 100 }} value={filters.priceTo}
                 onChange={(e) => setF({ priceTo: e.target.value })} />
        </EcCond>
        <EcCond label="공급가액">
          <input className="ec-input" type="number" style={{ width: 110 }} value={filters.supplyFrom}
                 onChange={(e) => setF({ supplyFrom: e.target.value })} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 110 }} value={filters.supplyTo}
                 onChange={(e) => setF({ supplyTo: e.target.value })} />
        </EcCond>
        <EcCond label="부가세">
          <input className="ec-input" type="number" style={{ width: 110 }} value={filters.vatFrom}
                 onChange={(e) => setF({ vatFrom: e.target.value })} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 110 }} value={filters.vatTo}
                 onChange={(e) => setF({ vatTo: e.target.value })} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요" value={filters.remark}
                 onChange={(e) => setF({ remark: e.target.value })} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="진행상태">
          <select className="ec-input" value={filters.status} style={{ width: 120 }}
                  onChange={(e) => setF({ status: e.target.value as Filters['status'] })}>
            <option value="">전체</option>
            {OPEN_STATUS.map((k) => <option key={k} value={k}>{k === 'DRAFT' ? '작성' : '발송'}</option>)}
          </select>
        </EcCond>
        <EcCond label="작성자">
          <select className="ec-input" value={filters.createdBy} style={{ width: 140 }}
                  onChange={(e) => setF({ createdBy: e.target.value })}>
            <option value="">전체</option>
            {[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
              .map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={filters.expiredOnly}
                   onChange={(e) => setF({ expiredOnly: e.target.checked })} /> 유효기간 지난 것만
          </label>
        </EcCond>
        {/* 원본 [정렬기준] — [데이터 보기형식] 바로 앞줄이다. */}
        <EcCond label="정렬기준">
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={filters.sortByDoc}
                   onChange={(e) => setF({ sortByDoc: e.target.checked })} /> 견적번호순 (기본: 일자순)
          </label>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        미주문수량 <b style={{ color: '#c07a00', fontSize: 14 }}>{totals.qty.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      {/*
        원본 [데이터 보기형식]이 <b>그래프</b>면 거래처별로 잠긴 금액을 막대로 그린다 —
        미주문은 "어느 거래처의 견적이 얼마나 잠겨 있나" 를 보는 표다.
      */}
      {view === '그래프' ? (
        <EcBarChart unit=" 원" emptyText="조회된 미주문 견적이 없습니다."
                    rows={(() => {
                      const m = new Map<string, number>()
                      for (const r of shown) m.set(r.partner, (m.get(r.partner) ?? 0) + r.supply)
                      return [...m].map(([label, value]) => ({ label, value }))
                    })()} />
      ) : (
      <table className="w-full text-left">
        <thead>
          {/*
            원본 격자(2026-09-09 E040211 실측):
            <b>일자-No. · 품목명(규격) · 수량 · 미주문수량 · 미주문공급가액 · 거래처명 ·
            적요 · 미주문부가세</b>.
            우리는 (1) 일자와 번호를 두 칸으로 갈랐고, (2) 규격을 안 받아 왔고,
            (3) 금액 열을 그냥 [공급가액]·[부가세] 라 불러 <b>그게 미주문분이라는 것</b>이
            이름에 안 드러났고, (4) <b>[적요] 열이 없었고</b>(거를 수는 있었다),
            (5) 거래처를 앞쪽에 [매출처] 라 두고 있었다 - 원본은 <b>미주문공급가액 뒤</b> 의
            [거래처명] 이다. 유효기간·상태·단가는 원본에 없지만 우리가 더 두는 열이다.
          */}
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => sort.toggle('견적일자')}>일자-No. {sort.mark('견적일자')}</th>
            <th>유효기간</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th>품목명(규격)</th>
            <th style={{ textAlign: 'right' }}>미주문수량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>미주문공급가액</th>
            <th>거래처명</th>
            <th>적요</th>
            <th style={{ textAlign: 'right' }}>미주문부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '미주문(미전환) 견적이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              {/* 원본은 일자와 번호를 '2026/03/12 -1' 처럼 한 칸에 적는다. */}
              <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{dateText(r.date)} {r.quoteNo}</td>
              <td style={{ fontFamily: 'monospace', color: r.expired ? '#c60a2e' : r.validUntil ? '#5a626e' : '#c5cbd3' }}>
                {r.validUntil ?? '-'}{r.expired ? ' (경과)' : ''}
              </td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ color: statusColor(r.status), fontWeight: 600, fontSize: 12 }}>{r.statusName}</span>
              </td>
              <td>{r.itemName}{r.spec ? ` (${r.spec})` : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#c07a00' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>{r.supply.toLocaleString()}</td>
              <td>{r.partner}</td>
              <td style={{ color: '#5a626e' }}>{r.remark ?? ''}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.vat.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </EcListShell>
  )
}

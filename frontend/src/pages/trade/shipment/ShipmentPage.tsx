import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../../components/EcStatusPanel'
import EcBarChart from '../../../components/EcBarChart'
import { INQUIRY_PICKS, comparePeriodOf, fetchWindow, periodOf, type ComparePeriod } from '../../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../../api/client'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { useCondPickers } from '../../../utils/useCondPickers'
import { dateNo } from '../../../utils/dateNo'
import { useItemMgmt } from '../../../utils/itemMgmtItems'
import { usePartnerManagers } from '../../../utils/partnerManagers'
import { fmtNumber } from '../../../utils/format'

/**
 * 영업관리 > 출하현황 — 출하 전표를 기간·조건으로 본다 (/api/shipments).
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 내역 | 집계 | 라인별 · [비교기간] · 기준일자(직접입력) + 기간 빠른선택(…전월, 종료일)
 *   출하No. · 창고 · 프로젝트 · 관리항목 · 거래처 · 품목 · 시리얼/로트No.
 * 우리는 조건 판이 없고 상태 필터 버튼줄과 검색어 한 칸이 전부였다.
 *
 * <p>[창고]는 예전에 "출하 전표에 그 값이 없어" 만들지 않았는데, 출하는 진작
 * 창고 칸을 들고 있었다 — 응답에 안 실어서 화면이 몰랐을 뿐이다. 지금은 실린다.
 * 다만 <b>예전에 만든 출하는 창고가 비어 있다</b>(출하지시서에서 고를 수 있게 되기 전 자료라
 * 그렇다). 그 줄들은 이 조건에 안 걸린다 — 지어내서 채우지 않는다.
 * <p>[프로젝트]도 이제 있다. 판매·구매·비용은 진작 프로젝트를 다는데 출하만 안 달아서,
 * 프로젝트별로 얼마를 내보냈는지 셀 수가 없었다.
 * 관리항목·시리얼/로트는 여전히 없어 칸을 만들지 않는다.
 * 상태 필터는 원본에 없지만 우리 출하는 지시/완료/취소를 한 화면에서 보므로 남겨 둔다.
 *
 * <p>내역 행의 칸 구성은 원본 출하조회 격자를 따른다: 일자-No. · 품목명(요약) · 수량합계 · 거래처명.
 */
type ShipStatus = 'READY' | 'SHIPPED' | 'CANCELED'
/*
 * 원본 [구분]은 <b>내역·집계 둘</b>이다(대조표 실측). [라인별]은 우리가 더 둔 갈래였는데,
 * 2026-09-09 에 원본(E040227) 격자를 재 보니 <b>[내역]이 이미 줄 단위</b>였다 —
 * 일자-No. · 품목명(규격) · 수량 · 창고명 · 거래처명 · 적요. 우리 [내역]만 전표로 접고
 * 있어서 줄을 보려고 갈래를 하나 더 만들어 둔 것이다(판매·구매·생산불출·작업내역에 이어
 * <b>다섯 번째</b> 같은 꼴). [내역]을 원본대로 두면 둘이 같은 표가 되므로 갈래를 없앤다.
 */
type Mode = '현황' | '집계'
/** 원본 [메뉴] 현황 · 집계(2026-10-21 실측 — 그 아래 줄이 [구분] 라인별 ▾ · 비교기간). */
const MODES = ['현황', '집계'] as const
/** 원본 [구분] 드롭다운(2026-10-22 E040227 실측) — 현황 메뉴에서 줄을 무엇으로 묶어 보일지. 열은 모두 같다. */
const LINE_KINDS = ['일별', '월별', '라인별', '전표별', '품목별', '전표별품목별', '거래처별', '담당자별'] as const
type LineKind = typeof LINE_KINDS[number]

interface ShipLine {
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  /** 원본 조건 [규격]. 서버는 진작 보내는데 이 화면이 안 받아 두고 있었다. */
  spec: string | null
  quantity: number
  unitPrice: number
  amount: number
  /** 줄 적요. 원본 출하현황의 마지막 열. */
  remark: string | null
}

interface Shipment {
  id: number
  shipNo: string
  partnerId: number
  partnerName: string
  shipDate: string
  status: ShipStatus
  statusName: string
  totalQuantity: number
  totalAmount: number
  salesOrderNo: string | null
  /** 창고명. 원본 출하현황의 [창고명] 열 — 어느 창고에서 나갔는지가 안 보였다. */
  warehouseId: number | null
  warehouseName: string | null
  /** 귀속 프로젝트. 원본 출하현황 조건의 [프로젝트]. */
  projectId: number | null
  projectName: string | null
  remark: string | null
  createdBy: string | null
  /*
   * 2026-09-08 에 원본(E040227)의 <b>접힌 줄을 펼쳐</b> 조건을 전부 쟀다 — 서른이다
   * (사본은 열둘). 아래 셋은 그때 드러난 조건이 보는 값이고, 응답에 진작 오던 것이다.
   */
  employeeName: string | null
  contact: string | null
  address: string | null
  lines: ShipLine[]
}

/** 원본 수량 칸 — '3.00' 소수 둘(2026-10-21 E040227 실측). */
const qty = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ShipmentPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['warehouses', 'projects', 'partners', 'items'])
  const [rows, setRows] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  const [mode, setMode] = useState<Mode>('현황')
  const [lineKind, setLineKind] = useState<LineKind>('라인별')
  const [shipNo, setShipNo] = useState('')
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  /* 원본 [진행상태](2026-10-22 E040227 실측) — 체크 넷: 전체 · 결재중 · 미확인 · 확인(처음 확인만 켜짐). 전체는 나머지 셋을 한꺼번에 켠다.
   우리 출하는 확인 상태만 있어 결재중 · 미확인은 늘 빈 결과(원본도 이 회사 출하가 모두 확인), 취소는 전체 때만 보인다. */
  const [progress, setProgress] = useState<string[]>(['확인'])
  /** 원본은 [품목코드] 아래 조건을 회색 띠 밑에 접어 둔다 */
  const [more, setMore] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get<Shipment[]>('/shipments', { params: fetchWindow(from, to, compare) })
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  /*
   * <b>기간을 서버에 보낸다.</b> 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내
   * 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() }, [from, to, compare])

  const reset = () => {
    setFrom(init.from); setTo(init.to); setCompare('사용안함'); setMode('현황')
    setShipNo(''); setPartner(''); setItem(''); setProgress(['확인']); setWarehouse(''); setProject('')
    /* 접힌 줄을 펼쳐 드러난 조건들도 같이 되돌린다. */
    setOrderNoCond(''); setSpecCond(''); setEmpCond(''); setPmgrCond('')
    setContactCond(''); setAddressCond(''); setAuthorCond('')
  }

  const inRange = (r: Shipment, a: string, b: string) => r.shipDate >= a && r.shipDate <= b
  /**
   * 원본 [관리항목] — 차례는 [프로젝트] 다음, [거래처] 앞이다(사본 실측).
   * 품목 마스터에 붙는 값이라 출하 전표 응답에는 없다. 그래도 만들 수 있다 —
   * 품목 마스터를 받아 <b>줄의 itemId 로 화면에서 잇는다</b>(판매현황이 먼저 그렇게 했다).
   */
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')
  /*
   * 원본 출하현황의 <b>접힌 줄</b>을 펼쳐 드러난 조건들. 사본에는 열둘이라 적혀
   * 있었는데 원본은 <b>서른</b>이다 — 판매현황·구매현황과 같은 구멍이다.
   */
  const [orderNoCond, setOrderNoCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [pmgrCond, setPmgrCond] = useState('')
  const [contactCond, setContactCond] = useState('')
  const [addressCond, setAddressCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const pmgr = usePartnerManagers()

  const matches = (r: Shipment) => {
    if (r.status === 'CANCELED' ? progress.length < 3 : !progress.includes('확인')) return false
    if (shipNo && !r.shipNo.includes(shipNo)) return false
    if (partner && String(r.partnerId) !== partner) return false
    if (item && !r.lines.some((l) => String(l.itemId) === item)) return false
    if (warehouse && String(r.warehouseId) !== warehouse) return false
    if (project && String(r.projectId) !== project) return false
    if (!mgmt.hits(r.lines.map((l) => l.itemId), mgmtCond)) return false
    if (orderNoCond && (r.salesOrderNo ?? '') !== orderNoCond) return false
    if (specCond && !r.lines.some((l) => (l.spec ?? '') === specCond)) return false
    if (empCond && (r.employeeName ?? '') !== empCond) return false
    if (pmgrCond && pmgr.managerOfName(r.partnerName) !== pmgrCond) return false
    if (contactCond && !(r.contact ?? '').includes(contactCond)) return false
    if (addressCond && !(r.address ?? '').includes(addressCond)) return false
    if (authorCond && (r.createdBy ?? '') !== authorCond) return false
    return true
  }

  const shown = useMemo(
    () => rows.filter((r) => inRange(r, from, to) && matches(r)),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [rows, from, to, progress, shipNo, partner, item, warehouse, project, mgmtCond, mgmt.options],
  )

  /** 비교기간 — 같은 조건을 같은 길이의 앞 구간에 걸어 합계만 견준다. */
  const prevRange = compare === '사용안함' ? null : comparePeriodOf(from, to, compare)
  const prevTotals = useMemo(() => {
    if (!prevRange) return null
    const prev = rows.filter((r) => inRange(r, prevRange.from, prevRange.to) && matches(r))
    return {
      count: prev.length,
      qty: prev.reduce((n, r) => n + r.totalQuantity, 0),
      amount: prev.reduce((n, r) => n + r.totalAmount, 0),
    }
  }, [rows, prevRange, progress, shipNo, partner, item, warehouse, project])

  const totals = useMemo(
    () => shown.reduce((a, r) => ({ qty: a.qty + r.totalQuantity, amount: a.amount + r.totalAmount }),
      { qty: 0, amount: 0 }),
    [shown],
  )

  /** 집계 — 거래처 단위로 모은다. */
  const byPartner = useMemo(() => {
    const m = new Map<number, { partnerId: number; name: string; count: number; qty: number; amount: number }>()
    for (const r of shown) {
      const cur = m.get(r.partnerId)
      if (!cur) m.set(r.partnerId, { partnerId: r.partnerId, name: r.partnerName, count: 1, qty: r.totalQuantity, amount: r.totalAmount })
      else { cur.count += 1; cur.qty += r.totalQuantity; cur.amount += r.totalAmount }
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount)
  }, [shown])
  const [view, setView] = useState<'표' | '그래프'>('표')
  /* 원본 [그래프로 보기]. 출하는 <b>어느 거래처로 얼마가 나갔나</b> 를 보는 화면이다. */
  const chartRows = useMemo(() =>
    mode === '집계'
      ? byPartner.map((r) => ({ label: r.name, value: r.amount }))
      : shown.map((r) => ({ label: `${r.partnerName}`, value: r.totalAmount })),
    [mode, byPartner, shown])

  /** 라인별 — 품목 라인마다 한 줄. 원본은 일자 <b>오름차순</b>(2026-10-21 E040227 실측), 같은 날은 번호 차례. */
  const lines = useMemo(
    () => [...shown]
      .sort((a, b) => a.shipDate.localeCompare(b.shipDate) || a.shipNo.localeCompare(b.shipNo))
      .flatMap((r) => r.lines.map((l, i) => ({ key: `${r.id}-${i}`, r, l }))),
    [shown],
  )

  /**
   * 원본 [구분] 여덟 갈래(2026-10-22 E040227 실측)는 모두 같은 6열에 달마다 'YYYY/MM 계' · 총합계를 끼운다 — 묶는 키만 다르다.
   *   일별 = 날짜 · 월별 = 월 · 라인별 = 줄 · 전표별 = 전표 · 품목별 = 월 × 품목 · 전표별품목별 = 전표 × 품목 · 거래처별 = 월 × 거래처 · 담당자별 = 월 × 담당자.
   * 묶인 줄은 첫 줄의 일자-No. · 품목명 · 창고 · 거래처를 찍고 수량은 더한다(일별 10/21 = -1 의 70 + -3 의 10 = 80).
   */
  const byMonth = useMemo(() => {
    type Row = { key: string; r: Shipment; l: ShipLine; q: number }
    const out: { month: string; rows: Row[]; qty: number }[] = []
    let idx = new Map<string, Row>()
    for (const x of lines) {
      const month = x.r.shipDate.slice(0, 7).replace('-', '/')
      let g = out[out.length - 1]
      if (!g || g.month !== month) { g = { month, rows: [], qty: 0 }; out.push(g); idx = new Map() }
      const item = x.l.itemId
      const k = lineKind === '일별' ? x.r.shipDate
        : lineKind === '월별' ? month
        : lineKind === '전표별' ? x.r.shipNo
        : lineKind === '품목별' ? String(item)
        : lineKind === '전표별품목별' ? `${x.r.shipNo}|${item}`
        : lineKind === '거래처별' ? String(x.r.partnerId)
        : lineKind === '담당자별' ? (x.r.employeeName ?? '')
        : x.key
      const q = Number(x.l.quantity)
      const hit = idx.get(k)
      if (hit) hit.q += q
      else { const row = { key: x.key, r: x.r, l: x.l, q }; idx.set(k, row); g.rows.push(row) }
      g.qty += q
    }
    return out
  }, [lines, lineKind])

  return (
    <EcListShell
      title="출하현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel(화면)' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_PICKS}
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        view={view} onViewChange={setView}
        compare={compare} onCompareChange={setCompare}
        modeLabel="메뉴" compareLabel="구분"
        modeExtra={mode === '현황' ? (
          <label className="inline-flex items-center gap-[6px]">
            <select className="ec-input w-[130px]" aria-label="구분" value={lineKind}
                    onChange={(e) => setLineKind(e.target.value as LineKind)}>
              {LINE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        ) : undefined}
      >
        <EcCond label="출하No." pick>
          <input className="ec-input" placeholder="출하번호 일부" value={shipNo}
                 onChange={(e) => setShipNo(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouse} onChange={(v) => setWarehouse(v)}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={pickers.projects} />
        </EcCond>
        {/* 원본 차례: [프로젝트] 다음, [거래처] 앞이다(사본 실측). */}
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={partner} onChange={(v) => setPartner(v)}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        {/*
          2026-10-21 원본 실측: [품목코드] 아래는 회색 띠(view-hidden-item, 높이 10) 밑에 접혀 있다 — 펼치면
          오더관리번호 · 규격 · 담당자 · 거래처관리담당자 · 연락처 · 주소 · (새로운 항목 추가 · 문자형식) · 진행상태 · 작성자 ·
          (최종수정자 · 제목 · 사용자지정). 적요는 없다(뺌).
        */}
        {more && (<>
        {/*
          원본 차례(2026-09-08 실측, 접힌 줄을 펼쳐 서른):
          … 품목 · 시리얼/로트No. · <b>오더관리번호 · 규격 · 담당자 · 거래처관리담당자 ·
          연락처 · 주소 · 적요</b> · (문자형식1~5 · 장문형식1) · 진행상태 · <b>작성자</b> ·
          (최종수정자 · 제목 · 사용자지정) · 적용양식 · 정렬기준 · 데이터 보기형식.
        */}
        <EcCond label="오더관리번호" pick>
          <CodePickerField label="오더관리번호" hideLabel width={140} emptyLabel="전체"
                           value={orderNoCond} onChange={setOrderNoCond}
                           items={[...new Set(rows.map((r) => r.salesOrderNo).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="규격" pick>
          <CodePickerField label="규격" hideLabel width={140} emptyLabel="전체"
                           value={specCond} onChange={setSpecCond}
                           items={[...new Set(rows.flatMap((r) => r.lines.map((l) => l.spec)).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={140} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond}
                           items={[...new Set(rows.map((r) => r.employeeName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={pmgrCond} onChange={setPmgrCond}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [연락처]·[주소] — 배송지다. 출하지시서입력이 받아 저장하고 응답도 싣는다. */}
        <EcCond label="연락처">
          <input className="ec-input" value={contactCond}
                 onChange={(e) => setContactCond(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="주소">
          <input className="ec-input" value={addressCond}
                 onChange={(e) => setAddressCond(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="진행상태">
          {(['전체', '결재중', '미확인', '확인'] as const).map((n) => (
            <label key={n} className="mr-[10px] text-[12px]">
              <input type="checkbox"
                     checked={n === '전체' ? progress.length === 3 : progress.includes(n)}
                     onChange={(e) => setProgress(n === '전체'
                       ? (e.target.checked ? ['결재중', '미확인', '확인'] : [])
                       : e.target.checked ? [...progress, n] : progress.filter((x) => x !== n))} /> {n}
            </label>
          ))}
        </EcCond>
        <EcCond label="작성자" pick>
          <CodePickerField label="작성자" hideLabel width={140} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        </>)}
        <li className="full h-[10.8px] !min-h-0 !p-0 bg-ec-disabled cursor-pointer" role="button" aria-label="조건 더보기"
            onClick={() => setMore((v) => !v)} />
      </EcStatusPanel>

      {/* 원본은 격자 위 건수 · 수량 · 금액 줄이 없다(2026-10-21 실측) — 비교기간을 걸었을 때만 그 합계를 적는다. */}
      {prevTotals && prevRange && (
        <div className="mb-[8px] text-[12.5px] text-ec-hint text-right">
          비교기간({prevRange.from.replace(/-/g, '/')} ~ {prevRange.to.replace(/-/g, '/')})
          {' '}{prevTotals.count}건 · 수량 {fmtNumber(prevTotals.qty)} · 금액 {fmtNumber(prevTotals.amount)}
        </div>
      )}

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 원" emptyText="조회된 출하가 없습니다." />
      ) : mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th>거래처명</th>
              <th className="w-[100px] text-right">건수</th>
              <th className="w-[130px] text-right">수량합계</th>
              <th className="w-[140px] text-right">금액합계</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="ec-empty">불러오는 중…</td></tr>
            ) : byPartner.length === 0 ? (
              <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : byPartner.map((g, i) => (
              <tr key={g.partnerId}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{g.name}</td>
                <td className="text-right text-ec-hint">{fmtNumber(g.count)}</td>
                <td className="text-right">{fmtNumber(g.qty)}</td>
                <td className="text-right font-semibold text-ec-blue">{fmtNumber(g.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={2} className="text-right">합계 ({byPartner.length}거래처)</td>
              <td className="text-right">{fmtNumber(shown.length)}</td>
              <td className="text-right">{fmtNumber(totals.qty)}</td>
              <td className="text-right text-ec-blue">{fmtNumber(totals.amount)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            {/*
              원본 격자(2026-10-21 E040227 실측, 라인별 — 출하지시서현황과 같은 꼴):
              <b>일자-No. 85 · 품목명(규격) 213 · 수량 107 · 창고명 128 · 거래처명 128 · 연락처 192</b> (+ 새로운 항목 추가).
              번호 칸 · 단가 · 금액 · 적요 · 상태 열은 없다. 일자 오름차순, 달마다 'YYYY/MM 계' · 맨 끝 '총합계'(수량 '1,860.00').
            */}
            <tr>
              <th className="w-[85px]">일자-No.</th>
              <th className="w-[213px]">품목명(규격)</th>
              <th className="w-[107px] text-right">수량</th>
              <th className="w-[128px]">창고명</th>
              <th className="w-[128px]">거래처명</th>
              <th className="w-[192px]">연락처</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
            ) : lines.length === 0 ? (
              <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : byMonth.flatMap((g) => [
              ...g.rows.map(({ key, r, l, q }) => (
                <tr key={key}>
                  <td className="whitespace-nowrap">{dateNo(r.shipDate, r.shipNo)}</td>
                  <td>{l.spec ? l.itemName + ' [' + l.spec + ']' : l.itemName}</td>
                  <td className="text-right">{qty(q)}</td>
                  <td>{r.warehouseName ?? ''}</td>
                  <td>{r.partnerName}</td>
                  <td>{r.contact ?? ''}</td>
                </tr>
              )),
              <tr key={'m-' + g.month} className="ec-list-total">
                <td colSpan={2} className="text-center font-bold">{g.month} 계</td>
                <td className="text-right font-bold">{qty(g.qty)}</td>
                <td colSpan={3}></td>
              </tr>,
            ])}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="ec-list-total">
                <td colSpan={2} className="text-center font-bold">총합계</td>
                <td className="text-right font-bold">{qty(lines.reduce((n, x) => n + Number(x.l.quantity), 0))}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </EcListShell>
  )
}

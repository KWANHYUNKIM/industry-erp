import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { INQUIRY_PICKS, periodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateNo } from '../../utils/dateNo'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerManagers } from '../../utils/partnerManagers'

/**
 * 영업관리 > 출력물 > <b>출하지시서현황</b>.
 *
 * <p>원본은 출하지시서 아래에 <b>입력 · 조회 · 현황</b> 세 화면을 둔다. 우리 메뉴는
 * [출하지시서현황]이 출하지시서 <b>조회 화면</b>을 가리키고 있었다 — 라우트는 있으니
 * ui-check 도 통과했고, 눌러 보면 등록 폼이 달린 조회 화면이 떴다.
 *
 * <p>원본 조건 판 실측(2026-09-08, 접힌 줄을 펼쳐 <b>스물둘</b>. 사본에는 열둘뿐이었다):
 *   [구분] 내역 | 집계 | 라인별 · [비교기간] · 일자 · 출하지시No. · 출하예정일 · 창고 ·
 *   프로젝트 · 관리항목 · 거래처 · 품목 · <b>오더관리번호 · 규격 · 담당자 ·
 *   거래처관리담당자 · 진행상태 · 적요 · 작성자</b> · (최종수정자 · 제목 · 사용자지정) ·
 *   적용양식 · 정렬기준 · 데이터 보기형식.
 * <p>결과 열: <b>품목명(규격) · 수량 · 창고명 · 거래처명 · 연락처 · 적요</b>.
 * 출하현황과 달리 <b>연락처</b>가 있다 — 지시서는 물건을 보낼 곳에 연락하려고 보는 것이다.
 *
 * <p><b>[진행상태]를 조건으로 두기 전까지 이 화면은 READY 만 그렸다.</b> 원본은 상태를
 * 고르게 하니 <b>전부</b> 를 그리는 화면이다 — 나간 지시를 아예 안 보여 주면 "지시한 것이
 * 나갔나" 를 여기서 확인할 수가 없었고, 밀린 것만 보는 화면은 <b>미출하현황</b>이 따로 있다.
 * 기본값은 원본과 같이 [전체]다.
 */
interface ShipLine {
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  spec: string | null
  quantity: number
  remark: string | null
}

/** 출하지시서 응답(/shipment-orders) — 필요한 칸만. */
interface ShipmentOrderRow extends Omit<Shipment, 'shipNo' | 'shipDate' | 'salesOrderNo' | 'status'> {
  orderNo: string
  orderDate: string
  status: 'IN_PROGRESS' | 'COMPLETED'
}

interface Shipment {
  id: number
  shipNo: string
  partnerId: number
  partnerName: string
  /** 근거 주문번호. 원본 조건의 [오더관리번호]다. 직접 등록한 지시면 null. */
  salesOrderNo: string | null
  /** 전표 담당자. 거래처를 맡은 사람([거래처관리담당자])과 다른 사람이다. */
  employeeName: string | null
  createdBy: string | null
  shipDate: string
  dueDate: string | null
  status: 'READY' | 'SHIPPED' | 'CANCELED'
  statusName: string
  totalQuantity: number
  warehouseId: number | null
  warehouseName: string | null
  /** 귀속 프로젝트. 서버가 이미 주고 있는데 이 화면이 안 받고 있었다. */
  projectId: number | null
  projectName: string | null
  contact: string | null
  remark: string | null
  lines: ShipLine[]
}

/*
 * 원본 [구분]은 <b>내역·집계 둘</b>이다(대조표 실측). [라인별]은 우리가 더 둔 갈래였는데,
 * 2026-09-09 에 원본(E040222) 격자를 재 보니 <b>[내역]이 이미 줄 단위</b>였다 —
 * 일자-No. · 품목명(규격) · 수량 · 창고명 · 거래처명 · 연락처 · 적요.
 * 우리 [내역]만 지시서로 접고 있어서 줄을 보려고 갈래를 하나 더 만들어 둔 것이다
 * (판매·구매·생산불출·작업내역·출하현황에 이어 <b>여섯 번째</b> 같은 꼴). 갈래를 없앤다.
 */
type Mode = '현황' | '집계'
const MODES = ['현황', '집계'] as const
const num = (n: number) => n.toLocaleString('ko-KR')
/** 원본 수량 칸 — '4.00' 소수 둘(2026-10-20 E040222 실측). */
const qty = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ShipmentOrderStatusPage() {
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
  const [view, setView] = useState<'표' | '그래프'>('표')

  const [more, setMore] = useState(false)
  const [shipNo, setShipNo] = useState('')
  /** 원본 [출하예정일] 은 빈 두 칸(~)이다(2026-10-20 실측). */
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  /** 원본 출하지시서현황 조건의 [프로젝트]. */
  const [project, setProject] = useState('')
  const [item, setItem] = useState('')
  /*
   * 2026-09-08 실측으로 드러난 일곱. 값은 전부 응답에 진작 오던 것이라
   * 서버를 고칠 일이 없었다 — 화면이 묻지 않았을 뿐이다.
   */
  const [orderNoCond, setOrderNoCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [pmgrCond, setPmgrCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'SHIPPED' | 'CANCELED'>('ALL')
  /** [거래처관리담당자] — 거래처 마스터에 매인 사람이라 전표 응답에 없다. 이름으로 잇는다. */
  const pmgr = usePartnerManagers()

  async function load() {
    setLoading(true)
    try {
      /*
       * 2026-10-20 출하지시서를 출하와 다른 전표로 갈랐다(plans/재고1/E040221.md) — 이 화면은 출하지시서(/shipment-orders)를 본다.
       * 옛 줄 모양(shipNo · shipDate · READY/SHIPPED)으로 옮겨 담아 아래 조건 · 격자는 그대로 쓴다. 진행중 → READY 자리, 완료 → SHIPPED 자리.
       */
      const res = await api.get<ShipmentOrderRow[]>('/shipment-orders', { params: { from: from || undefined, to: to || undefined } })
      setRows(res.data.map((o) => ({
        ...o, shipNo: o.orderNo, shipDate: o.orderDate, salesOrderNo: null,
        status: o.status === 'COMPLETED' ? 'SHIPPED' : 'READY',
      })))
      setError('')
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
  useEffect(() => { load() }, [from, to])

  function reset() {
    const p = periodOf('금월(~오늘)')!
    setFrom(p.from); setTo(p.to); setCompare('사용안함'); setMode('현황'); setView('표')
    setShipNo(''); setDueFrom(''); setDueTo(''); setWarehouse(''); setPartner(''); setProject(''); setItem('')
    setOrderNoCond(''); setSpecCond(''); setEmpCond(''); setPmgrCond('')
    setRemarkCond(''); setAuthorCond(''); setStatusFilter('ALL')
  }

  /**
   * 원본 [관리항목] — 차례는 [프로젝트] 다음, [거래처] 앞이다(사본 실측).
   * 품목 마스터에 붙는 값이라 출하 전표 응답에는 없다. 그래도 만들 수 있다 —
   * 품목 마스터를 받아 <b>줄의 itemId 로 화면에서 잇는다</b>(판매현황이 먼저 그렇게 했다).
   */
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')

  const shown = useMemo(() => rows.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (r.shipDate < from || r.shipDate > to) return false
    if (shipNo && !r.shipNo.includes(shipNo)) return false
    if (dueFrom && (r.dueDate ?? '') < dueFrom) return false
    if (dueTo && (r.dueDate ?? '') > dueTo) return false
    if (warehouse && String(r.warehouseId) !== warehouse) return false
    if (partner && String(r.partnerId) !== partner) return false
    if (project && String(r.projectId) !== project) return false
    if (item && !r.lines.some((l) => String(l.itemId) === item)) return false
    if (!mgmt.hits(r.lines.map((l) => l.itemId), mgmtCond)) return false
    if (orderNoCond && (r.salesOrderNo ?? '') !== orderNoCond) return false
    if (specCond && !r.lines.some((l) => (l.spec ?? '') === specCond)) return false
    if (empCond && (r.employeeName ?? '') !== empCond) return false
    if (pmgrCond && pmgr.managerOfName(r.partnerName) !== pmgrCond) return false
    if (remarkCond && !((r.remark ?? '') + ' ' + r.lines.map((l) => l.remark ?? '').join(' ')).includes(remarkCond)) return false
    if (authorCond && (r.createdBy ?? '') !== authorCond) return false
    return true
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }), [rows, from, to, shipNo, dueFrom, dueTo, warehouse, partner, project, item, mgmtCond, mgmt.options,
       orderNoCond, specCond, empCond, pmgrCond, remarkCond, authorCond, statusFilter, pmgr.options])

  /** 라인별 — 원본 결과 격자의 단위다. */
  const lines = useMemo(
    () => [...shown]
      /* 원본은 일자 <b>오름차순</b>이다(2026-10-20 실측). 같은 날은 번호 차례. */
      .sort((a, b) => a.shipDate.localeCompare(b.shipDate) || a.shipNo.localeCompare(b.shipNo))
      .flatMap((r) => r.lines.map((l, i) => ({ key: r.id + '-' + i, r, l }))),
    [shown])

  /** 원본 라인별 격자 — 달마다 'YYYY/MM 계' 줄을 끼운다(lines 가 이미 일자 오름차순). */
  const byMonth = useMemo(() => {
    const out: { month: string; rows: typeof lines; qty: number }[] = []
    for (const x of lines) {
      const month = x.r.shipDate.slice(0, 7).replace('-', '/')
      let g = out[out.length - 1]
      if (!g || g.month !== month) { g = { month, rows: [], qty: 0 }; out.push(g) }
      g.rows.push(x); g.qty += Number(x.l.quantity)
    }
    return out
  }, [lines])

  /** 집계 — 품목 단위로 지시수량을 모은다. */
  const byItem = useMemo(() => {
    const m = new Map<number, {
      itemId: number; name: string; spec: string | null; unit: string; qty: number; count: number
    }>()
    for (const { l } of lines) {
      const cur = m.get(l.itemId)
      if (!cur) {
        m.set(l.itemId, {
          itemId: l.itemId, name: l.itemName, spec: l.spec, unit: l.unit,
          qty: l.quantity, count: 1,
        })
      } else {
        cur.qty += l.quantity
        cur.count += 1
      }
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty)
  }, [lines])

  const totalQty = shown.reduce((n, r) => n + r.totalQuantity, 0)

  /* 원본 [그래프로 보기]. 이 화면이 답하는 질문은 '무엇이 얼마나 밀려 있나' 다. */
  const chartRows = useMemo(() =>
    mode === '집계'
      ? byItem.map((r) => ({ label: r.name, value: r.qty }))
      : shown.map((r) => ({ label: r.shipNo + ' ' + r.partnerName, value: r.totalQuantity })),
    [mode, byItem, shown])

  /** 품목명(규격) — 규격이 없으면 괄호를 붙이지 않는다. 빈 괄호는 자료가 없다는 뜻이 아니다. */
  const itemLabel = (l: ShipLine) => (l.spec ? l.itemName + ' [' + l.spec + ']' : l.itemName)

  return (
    <EcListShell
      title="출하지시서현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel(화면)' },
      ]}
      help={
        <p className="text-[12.5px] leading-[1.7]">
          <b>출하지시</b>를 봅니다. [진행상태]로 아직 안 나간 것만 골라 볼 수 있고,
          밀린 것만 모아 보려면 미출하현황이 따로 있습니다.
        </p>
      }
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_PICKS}
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        compare={compare} onCompareChange={setCompare}
        view={view} onViewChange={setView}
        modeLabel="메뉴" compareLabel="구분"
        dateLabel="일자"
      >
        <EcCond label="출하지시No.">
          <input className="ec-input" placeholder="지시번호 일부" value={shipNo}
                 onChange={(e) => setShipNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="출하예정일">
          <input type="date" className="ec-input" value={dueFrom}
                 onChange={(e) => setDueFrom(e.target.value)} style={{ width: 140 }} />
          <span className="text-ec-label">~</span>
          <input type="date" className="ec-input" value={dueTo}
                 onChange={(e) => setDueTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouse} onChange={(v) => setWarehouse(v)}
                           items={pickers.warehouses} />
        </EcCond>
        {/* 원본 출하지시서현황 조건 실측(사본): 구분·일자·출하지시No.·출하예정일·창고·프로젝트·관리항목·거래처·품목. */}
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
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        {/*
          원본 차례(2026-09-08 실측): … 품목 · <b>오더관리번호 · 규격 · 담당자 ·
          거래처관리담당자 · 진행상태 · 적요</b> · (문자형식1~5 · 장문형식1) · <b>작성자</b> ·
          (최종수정자 · 제목 · 사용자지정) · 적용양식 · 정렬기준 · 데이터 보기형식.
          출하현황과 달리 [시리얼/로트No.]·[연락처]·[주소]가 없다 — 그쪽은 나간 물건을
          좇는 화면이고 여기는 지시를 보는 화면이다.
        */}
        {/* 원본 조건은 품목코드까지(plans 재고1:84) — 그 뒤 우리 조건은 회색 띠 밑에 접어 둔다. */}
        {more && (<>
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
        <EcCond label="진행상태">
          <div className="ec-pills">
            {(['ALL', 'READY', 'SHIPPED'] as const).map((s) => (
              <button key={s} type="button" className={'ec-pill no-ec' + (statusFilter === s ? ' active' : '')}
                      onClick={() => setStatusFilter(s)}>
                {s === 'ALL' ? '전체' : s === 'READY' ? '진행중' : '완료'}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 170 }} />
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

      {error && (
        <p className="ec-alert ec-alert-danger mb-[8px]">
          {error}
        </p>
      )}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="출하지시가 없습니다." />
      ) : mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th>품목명(규격)</th>
              <th className="w-[70px]">단위</th>
              <th className="w-[100px] text-right">지시건수</th>
              <th className="w-[130px] text-right">수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="ec-empty">불러오는 중…</td></tr>
            ) : byItem.length === 0 ? (
              <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : byItem.map((r, i) => (
              <tr key={r.itemId}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{r.spec ? r.name + '(' + r.spec + ')' : r.name}</td>
                <td>{r.unit}</td>
                <td className="text-right">{num(r.count)}</td>
                <td className="text-right font-semibold text-ec-warn">{num(r.qty)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={4} className="text-right">합계 ({byItem.length}품목)</td>
              <td className="text-right text-ec-warn">{num(totalQty)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            {/*
              원본 격자(2026-10-20 E040222 실측, 라인별):
              <b>일자-No. 85 · 품목명(규격) 213 · 수량 107 · 창고명 128 · 거래처명 128 · 연락처 192</b> (+ 새로운 항목 추가).
              번호 칸 · 출하예정일 · 적요 열은 없다. 일자 오름차순, 달마다 'YYYY/MM 계' · 맨 끝 '총합계'(수량 '3,618.00').
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
              ...g.rows.map(({ key, r, l }) => (
                <tr key={key}>
                  <td className="whitespace-nowrap">{dateNo(r.shipDate, r.shipNo)}</td>
                  <td>{itemLabel(l)}</td>
                  <td className="text-right">{qty(l.quantity)}</td>
                  <td>{r.warehouseName ?? ''}</td>
                  <td>{r.partnerName}</td>
                  <td>{r.contact ?? ''}</td>
                </tr>
              )),
              <tr key={`m-${g.month}`} className="ec-list-total">
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

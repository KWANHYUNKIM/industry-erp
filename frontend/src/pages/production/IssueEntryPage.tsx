import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import CodePickerField from '../../components/CodePickerField'
import GridCode from '../../components/GridCode'
import GridFindButton from '../../components/GridFindButton'
import EcDateField from '../../components/EcDateField'
import EcSlipShell from '../../components/EcSlipShell'
import { api, extractErrorMessage } from '../../api/client'
import { ymd, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { useMyItemsPick, MyItemsNote } from '../../components/MyItemsButton'
import SlipLoadModal, { type LoadedSlip } from '../../features/slipload/components/SlipLoadModal'

/** searchKeyword 는 원본 [검색창내용] — 코드도움이 이 값으로도 찾는다. */
interface Item { id: number; code: string; name: string; spec?: string | null; unit: string; searchKeyword: string | null; lotManaged?: boolean }
/** 구분(창고·공장·외주)까지 받는다 — 받는 쪽은 대개 공장이라 앞에 세운다. */
interface Warehouse { id: number; code: string; name: string; kind: string }
interface Project { id: number; code: string; name: string }
interface EmployeeLite { id: number; code: string; name: string }
/** GET /api/stock 한 줄 — 원본 [재고불러오기]가 격자의 수량 칸 셋을 채우는 자료다. */
interface StockRow { itemId: number; warehouseId: number; quantity: number }

/**
 * 격자 한 줄. 원본 생산불출입력은 <b>한 전표에 자재를 여러 줄</b> 넣는다 —
 * 같은 날 같은 작업지시로 자재 다섯 개를 내보내면서 다섯 번 저장할 일이 아니다.
 */
interface FormLine {
  key: number; itemId: string; qty: string; note: string
  /** [시리얼/로트No.] — 로트관리 품목이면 꼭 넣는다. */
  lotNo?: string
  /** 원본 [작업지시서] 로 불러온 줄이면 그 지시. 줄마다 다른 지시에 묶일 수 있다. */
  workOrderId?: string
  workOrderNo?: string
  /** 원본 격자 [불러온 전표일자] · [작업지시품목코드] — 불러온 작업지시서의 지시일 · 생산품목코드. */
  workOrderDate?: string
  productCode?: string
}

/** GET /material-issues/wo-requirements 한 줄 — 작업지시서의 소요자재·기불출·잔량. */
interface WoRequirement {
  workOrderId: number; workOrderNo: string; orderDate: string
  productCode: string; productName: string; plannedQty: number
  employeeId: number | null
  componentId: number; requiredQty: number; issuedQty: number; remainingQty: number
}

/** 작업지시서 고르기 창에 쓸 지시(전체 목록). */
interface WorkOrderFull {
  id: number; orderNo: string; orderDate: string; partnerName: string | null; employeeId: number | null
  productCode: string; productName: string; productSpec: string | null
  plannedQty: number; status: string
}

const inputCls = 'ec-input w-full'
const today = () => ymd(new Date())
let nextLineKey = 1
const emptyLine = (): FormLine => ({ key: nextLineKey++, itemId: '', qty: '', note: '' })
const emptyForm = () => ({
  warehouseId: '', toWarehouseId: '', employeeId: '', issueDate: today(),
  /** 원본 생산불출입력 머리의 [프로젝트]. 안 정할 수 있다. */
  projectId: '',
})
/* [작업지시서] 창이 거는 지시일 기간 — 생산불출조회의 처음 기간과 같다(원본 [최근30일(+1개월)]). */
const woPeriod = periodOf('최근30일(+1개월)')!

/**
 * 재고 I › 생산/외주 › 생산불출입력(E040404). 원본은 목록 위 창이 아니라 <b>입력 화면</b>이다(plans/재고1.md 생산/외주 1바퀴 ·
 * 마무리17 실측): 머리 일자 · 담당자 · 보내는창고 · 받는공장(필수 — 비면 '받는공장을 입력바랍니다.'), [작업지시서] → 잔량으로BOM풀기,
 * 격자 품목코드 칸은 코드 → Enter. 저장하면 말이 없다.
 * 머리 칸 · 단추 · 격자 열은 qa/fixtures 의 원본 사본 실측(ecount-form-fields · ecount-buttons · ecount-column-width)을 따른다:
 * 머리 일자 · 담당자 · 보내는창고 · 받는공장 · 프로젝트, 도구줄 찾기(F3) · 정렬 · My품목 · 작업지시서 · 전표불러오기 · 재고불러오기 · 바코드 · 검증,
 * 격자 불러온 전표일자 · (불러온 전표No.) · 작업지시품목코드 · 품목코드 · 품목명 · 수량 · 적요(ecount-column-align 차례) + 전체수량 · 보내는창고수량 · 받는창고수량.
 * 예전에는 생산불출조회 [신규] 의 '생산불출 등록' 창이었고 격자에 품목코드 열이 없어 코드도움 창으로만 골랐다.
 * [시리얼/로트No.] 열은 원본 사본에 없다(이 회사 로트 설정이 꺼져 있다) — 로트관리 품목을 위해 우리 것을 수량 뒤에 남긴다.
 * 머리 [작업지시] 칸은 원본에 없어 뺐다 — 지시는 [작업지시서] 로 불러온 줄마다 붙는다.
 */
export default function IssueEntryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const tableRef = useRef<HTMLTableElement>(null)
  const [form, setForm] = useState(emptyForm)
  const [lines, setLines] = useState<FormLine[]>(() => Array.from({ length: 5 }, emptyLine))
  const setLine = (key: number, patch: Partial<FormLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  useEffect(() => {
    Promise.all([
      api.get<Item[]>('/items'),
      api.get<Warehouse[]>('/warehouses'),
      api.get<EmployeeLite[]>('/sales-reps'),
      api.get<Project[]>('/projects'),
    ]).then(([it, wh, emp, pj]) => {
      setItems(it.data); setWarehouses(wh.data); setEmployees(emp.data); setProjects(pj.data)
    }).catch((err) => setError(extractErrorMessage(err)))
  }, [])

  /** 원본 격자 툴바의 [My품목]. 불출은 <b>단가를 안 든다</b> — 품목과 수량만 붓는다. */
  const myItems = useMyItemsPick((picked) => setLines((ls) => {
    const kept = ls.filter((l) => l.itemId)
    const added = picked.map((m) => ({ ...emptyLine(), itemId: String(m.itemId), qty: String(m.defaultQty) }))
    return [...kept, ...added, emptyLine()]
  }))

  /**
   * 원본 격자 툴바의 [전표불러오기] → 메뉴검색(주문서 · 판매 · 발주서 · 구매 · 작업지시서 · 생산불출)에서 전표를 골라
   * 그 품목 줄을 불출 자재 줄로 붓는다(수량 그대로).
   */
  const [slipLoadOpen, setSlipLoadOpen] = useState(false)
  function applyLoadedSlips(slips: LoadedSlip[]) {
    const added = slips.flatMap((x) => x.lines).filter((l) => l.itemId > 0 && l.quantity > 0)
    setLines((ls) => [...ls.filter((l) => l.itemId),
      ...added.map((l) => ({ ...emptyLine(), itemId: String(l.itemId), qty: String(l.quantity) })), emptyLine()])
  }

  /**
   * 원본 격자 툴바의 <b>[재고불러오기]</b> — 격자의 전체수량 · 보내는창고수량 · 받는창고수량 세 칸을 채운다.
   * 부르기 전에는 '-' 로 둔다(0 으로 채우면 "재고가 없다" 로 읽힌다).
   */
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [stockLoaded, setStockLoaded] = useState(false)
  const [stockBusy, setStockBusy] = useState(false)
  async function loadStocks() {
    setStockBusy(true)
    try {
      setStocks((await api.get<StockRow[]>('/stock')).data)
      setStockLoaded(true)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setStockBusy(false)
    }
  }
  const stockAllOf = (itemId: string): number | null => {
    if (!stockLoaded || !itemId) return null
    return stocks.filter((s) => String(s.itemId) === itemId).reduce((a, s) => a + s.quantity, 0)
  }
  const stockAtOf = (itemId: string, warehouseId: string): number | null => {
    if (!stockLoaded || !itemId || !warehouseId) return null
    const hit = stocks.find((s) => String(s.itemId) === itemId && String(s.warehouseId) === warehouseId)
    return hit ? hit.quantity : 0
  }
  const qtyCell = (n: number | null) => (n === null ? '-' : n.toLocaleString())

  /*
   * 원본 생산불출입력 툴바의 <b>[작업지시서]</b>. 받는공장을 먼저 정해야 열린다(원본: "받는공장을 입력바랍니다.").
   * [잔량으로BOM풀기] 는 BOM 소요량 × 지시수량 − 이미 낸 불출, [BOM풀기] 는 BOM 소요량 × 지시수량을 격자에 넣는다.
   */
  const [woPickOpen, setWoPickOpen] = useState(false)
  const [woList, setWoList] = useState<WorkOrderFull[]>([])
  const [woPicked, setWoPicked] = useState<number[]>([])
  /** 원본 BOM풀기 갈래 — 1단계(바로 아래 자재) · 전체(반제품을 끝까지 풀어 원재료로). */
  const [bomLevel, setBomLevel] = useState<'ONE' | 'ALL'>('ONE')
  async function openWoPick() {
    if (!form.toWarehouseId) { setError('받는공장을 입력바랍니다.'); return }
    setError('')
    try {
      const r = await api.get<WorkOrderFull[]>('/work-orders', { params: { from: woPeriod.from, to: woPeriod.to } })
      setWoList(r.data.filter((w) => w.status !== 'COMPLETED'))
      setWoPicked([])
      setWoPickOpen(true)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  async function applyWo(remainOnly: boolean) {
    if (woPicked.length === 0) { setWoPickOpen(false); return }
    try {
      const r = await api.get<WoRequirement[]>('/material-issues/wo-requirements', {
        params: { workOrderIds: woPicked.join(','), level: bomLevel },
      })
      const added: FormLine[] = r.data
        .map((q) => ({ q, qty: remainOnly ? Number(q.remainingQty) : Number(q.requiredQty) }))
        .filter(({ qty }) => qty > 0)
        .map(({ q, qty }) => ({
          ...emptyLine(), itemId: String(q.componentId), qty: String(qty),
          workOrderId: String(q.workOrderId), workOrderNo: q.workOrderNo,
          workOrderDate: q.orderDate, productCode: q.productCode,
        }))
      const none = woPicked.filter((id) => !r.data.some((q) => q.workOrderId === id))
      setLines((ls) => [...ls.filter((l) => l.itemId), ...added, emptyLine()])
      // 원본처럼 비어 있는 담당자를 지시서에서 채운다.
      const firstEmp = woList.find((w) => w.id === woPicked[0])?.employeeId
      if (!form.employeeId && firstEmp != null) setForm((f) => ({ ...f, employeeId: String(firstEmp) }))
      if (none.length > 0) setError(`BOM 이 없는 지시는 풀 자재가 없습니다: ${woList.filter((w) => none.includes(w.id)).map((w) => w.orderNo).join(', ')}`)
      else if (added.length === 0) setError(remainOnly ? '고른 지시는 이미 다 불출했습니다(잔량 0).' : '풀 자재가 없습니다.')
      setWoPickOpen(false)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  function reset() {
    setForm(emptyForm())
    setLines(Array.from({ length: 5 }, emptyLine))
    setError('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busyRef.current) return
    setError('')
    /* 원본: 받는공장이 비면 저장되지 않고 '받는공장을 입력바랍니다.'(plans/재고1.md 생산/외주 1바퀴 실측). */
    if (!form.toWarehouseId) { setError('받는공장을 입력바랍니다.'); return }
    const filled = lines.filter((l) => l.itemId && l.qty !== '')
    if (filled.length === 0) { setError('자재를 한 줄 이상 넣으세요.'); return }
    /* 로트관리 품목은 로트No. 가 있어야 한다 — 서버도 거절한다. 어느 줄인지 먼저 알린다. */
    const noLot = filled.find((l) => !(l.lotNo ?? '').trim() && items.find((i) => String(i.id) === l.itemId)?.lotManaged)
    if (noLot) {
      const it = items.find((i) => String(i.id) === noLot.itemId)!
      setError(`${it.code} ${it.name} 은(는) 로트관리 품목입니다 — 로트No.를 입력하세요.`); return
    }
    busyRef.current = true; setBusy(true)
    try {
      /* 줄을 한 번에 보낸다 — 서버가 한 트랜잭션으로 넣고, 한 줄이라도 막히면 전부 되돌린다. */
      await api.post('/material-issues/batch', {
        warehouseId: form.warehouseId === '' ? null : Number(form.warehouseId),
        toWarehouseId: Number(form.toWarehouseId),
        workOrderId: null,
        issueDate: form.issueDate || null,
        employeeId: form.employeeId === '' ? null : Number(form.employeeId),
        projectId: form.projectId === '' ? null : Number(form.projectId),
        lines: filled.map((l) => ({
          itemId: Number(l.itemId), qty: Number(l.qty), note: l.note, lotNo: (l.lotNo ?? '').trim() || null,
          workOrderId: l.workOrderId ? Number(l.workOrderId) : null,
        })),
      })
      /* 원본 생산불출입력 저장은 말이 없다 — 빈 입력으로 돌아간다(우리 예전 창과 같은 비움). */
      reset()
      if (stockLoaded) void loadStocks()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      busyRef.current = false; setBusy(false)
    }
  }

  const itemPicks = items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.spec ?? '' }))
  const itemOf = (id: string) => items.find((i) => String(i.id) === id)

  return (
    <>
    <form onSubmit={submit}>
      <EcSlipShell title="생산불출입력" busy={busy}
                   actions={[
                     { label: '저장(F8)', primary: true, submit: true },
                     { label: '다시 작성', onClick: reset },
                     { label: '리스트', onClick: () => navigate('/production/issue') },
                   ]}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <div className="bg-white p-[14px]">
          <ul className="ec-form mb-[10px]">
            <li>
              <div className="title">일자</div>
              <div className="form"><EcDateField value={form.issueDate} onChange={(v) => setForm((f) => ({ ...f, issueDate: v }))} /></div>
            </li>
            <li>
              <div className="title">담당자</div>
              <div className="form">
                <CodePickerField pair label="담당자" hideLabel width={220} placeholder="담당자" emptyLabel="선택 해제"
                                 value={form.employeeId} onChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
                                 items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
              </div>
            </li>
            <li>
              <div className="title">보내는창고</div>
              <div className="form">
                <CodePickerField pair label="보내는창고" hideLabel width={220} placeholder="보내는창고" emptyLabel="선택 해제"
                                 value={form.warehouseId} onChange={(v) => setForm((f) => ({ ...f, warehouseId: v }))}
                                 items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
              </div>
            </li>
            <li>
              <div className="title">받는공장</div>
              <div className="form">
                {/* 구분이 공장인 창고를 앞에 두고, 보내는 창고와 같은 곳은 뺀다 — 제 창고로 보낼 수는 없다. */}
                <CodePickerField pair label="받는공장" hideLabel width={220} placeholder="받는공장" emptyLabel="선택 해제"
                                 value={form.toWarehouseId} onChange={(v) => setForm((f) => ({ ...f, toWarehouseId: v }))}
                                 items={[...warehouses]
                                   .sort((a, b) => (a.kind === '공장' ? -1 : 1) - (b.kind === '공장' ? -1 : 1))
                                   .filter((w) => String(w.id) !== form.warehouseId)
                                   .map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.kind !== '창고' ? w.kind : null }))} />
              </div>
            </li>
            <li>
              <div className="title">프로젝트</div>
              <div className="form">
                <CodePickerField pair label="프로젝트" hideLabel width={220} placeholder="프로젝트" emptyLabel="선택 해제"
                                 value={form.projectId} onChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
                                 items={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
              </div>
            </li>
          </ul>

          {/* 원본 도구줄 차례(사본 실측). 단추는 화면이 <b>글자로</b> 그린다 — 자식 컴포넌트에 넣으면 버튼 검사가 못 본다.
              [정렬] · [바코드] · [검증] 은 우리에게 아직 없어 모양만(다른 입력 화면 도구줄과 같다). */}
          <div className="ec-toolbar mb-[4px]">
            <GridFindButton tableRef={tableRef} />
            <button type="button" className="ec-btn ec-btn-sm">정렬</button>
            <button type="button" className="ec-btn ec-btn-sm" disabled={myItems.busy} onClick={myItems.pick}>My품목</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openWoPick()}>작업지시서</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => setSlipLoadOpen(true)}>전표불러오기</button>
            <button type="button" className="ec-btn ec-btn-sm" disabled={stockBusy} onClick={loadStocks}>재고불러오기</button>
            <button type="button" className="ec-btn ec-btn-sm">바코드</button>
            <button type="button" className="ec-btn ec-btn-sm">검증</button>
            <MyItemsNote note={myItems.note} />
          </div>
          {woPickOpen && (
            <div className="border border-ec-line border-solid bg-white p-[8px] mb-[8px]">
              <div className="font-bold text-[12.5px] mb-[6px]">작업지시서조회</div>
              <div className="max-h-[220px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className="w-[30px]" />
                      <th>작업지시서일자</th>
                      <th>거래처명</th>
                      <th>품목코드</th>
                      <th>품목명[규격]</th>
                      <th className="text-right">수량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {woList.length === 0 ? (
                      <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                    ) : woList.map((w) => (
                      <tr key={w.id} className="cursor-pointer"
                          onClick={() => setWoPicked((p) => (p.includes(w.id) ? p.filter((x) => x !== w.id) : [...p, w.id]))}>
                        <td className="text-center"><input type="checkbox" readOnly checked={woPicked.includes(w.id)} /></td>
                        <td>{dateText(w.orderDate)} {w.orderNo}</td>
                        <td>{w.partnerName ?? ''}</td>
                        <td>{w.productCode}</td>
                        <td>{w.productName}{w.productSpec ? ` [${w.productSpec}]` : ''}</td>
                        <td className="text-right">{Number(w.plannedQty).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-[4px] mt-[6px]">
                <button type="button" className="ec-btn ec-btn-primary" onClick={() => void applyWo(true)}>잔량으로BOM풀기</button>
                <button type="button" className="ec-btn" onClick={() => void applyWo(false)}>BOM풀기</button>
                <select className="ec-input w-[70px]" value={bomLevel} title="BOM풀기 단계"
                        onChange={(e) => setBomLevel(e.target.value as 'ONE' | 'ALL')}>
                  <option value="ONE">1단계</option>
                  <option value="ALL">전체</option>
                </select>
                <button type="button" className="ec-btn" onClick={() => setWoPickOpen(false)}>닫기</button>
              </div>
            </div>
          )}

          {/* 원본 격자 차례(ecount-column-align 실측): 불러온 전표일자 · 불러온 전표No. · 작업지시품목코드 · 품목코드 · 품목명 · 수량 · 적요.
              폭(ecount-column-width 실측): 품목코드 125 · 품목명 210 · 수량 60 · 불러온 전표일자 65 · 작업지시품목코드 70 · 전체수량 · 보내는창고수량 ·
              받는창고수량 각 67 · 적요 80. [BOM버전] · [불러온 전표No.] 은 우리에게 없다(ui-check 이유). */}
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[25px]"></th>
                <th className="w-[65px]">불러온 전표일자</th>
                <th className="w-[70px]">작업지시품목코드</th>
                <th className="w-[125px]">품목코드</th>
                <th className="w-[210px]">품목명</th>
                <th className="w-[60px] text-right">수량</th>
                <th className="w-[100px]">시리얼/로트No.</th>
                <th className="w-[67px] text-right">전체수량</th>
                <th className="w-[67px] text-right">보내는창고수량</th>
                <th className="w-[67px] text-right">받는창고수량</th>
                <th className="w-[80px]">적요</th>
                <th className="w-[44px] text-center">삭제</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const it = itemOf(l.itemId)
                return (
                  <tr key={l.key} data-line={idx + 1}>
                    <td className="text-center text-ec-hint">{idx + 1}</td>
                    <td>{dateText(l.workOrderDate ?? null)}</td>
                    <td>{l.productCode ?? ''}</td>
                    <td>
                      <GridCode title="품목검색" codeHead="품목코드" nameHead="품목명" subHead="규격" items={itemPicks}
                                value={l.itemId} onPick={(v) => setLine(l.key, { itemId: v })} />
                    </td>
                    <td>
                      {it?.name ?? ''}{it?.spec && <span className="text-ec-hint"> [{it.spec}]</span>}
                      {l.workOrderNo && <div className="text-[11px] text-ec-hint">작업지시 {l.workOrderNo}</div>}
                    </td>
                    <td>
                      <input type="number" step="any" className={`${inputCls} text-right`} aria-label={`${idx + 1}번째 줄 수량`}
                             value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                    </td>
                    <td>
                      <input className={inputCls} value={l.lotNo ?? ''} maxLength={60} aria-label="시리얼/로트No."
                             onChange={(e) => setLine(l.key, { lotNo: e.target.value })} />
                    </td>
                    <td className="text-right text-ec-label">{qtyCell(stockAllOf(l.itemId))}</td>
                    <td className="text-right text-ec-label">{qtyCell(stockAtOf(l.itemId, form.warehouseId))}</td>
                    <td className="text-right text-ec-label">{qtyCell(stockAtOf(l.itemId, form.toWarehouseId))}</td>
                    <td>
                      <input className={inputCls} value={l.note} aria-label={`${idx + 1}번째 줄 적요`}
                             onChange={(e) => setLine(l.key, { note: e.target.value })} />
                    </td>
                    <td className="text-center">
                      <button type="button" className="text-ec-danger bg-transparent border-0 cursor-pointer text-[12px]"
                              onClick={() => setLines(lines.length > 1 ? lines.filter((x) => x.key !== l.key) : [emptyLine()])}>삭제</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  <button type="button" className="ec-btn ec-btn-sm" onClick={() => setLines([...lines, emptyLine()])}>줄 추가</button>
                </td>
                <td className="text-right font-bold">합계</td>
                <td className="text-right font-bold">{lines.reduce((a, l) => a + (Number(l.qty) || 0), 0).toLocaleString()}</td>
                <td colSpan={6}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </EcSlipShell>
    </form>
    <SlipLoadModal open={slipLoadOpen} onClose={() => setSlipLoadOpen(false)} onApply={applyLoadedSlips} />
    </>
  )
}

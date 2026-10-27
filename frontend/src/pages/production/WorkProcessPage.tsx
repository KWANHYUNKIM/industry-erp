import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { WORK_PROCESS_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import EcRowCap, { capRows } from '../../components/EcRowCap'
import { useNavigate } from 'react-router-dom'

/**
 * 생산관리 > 작업지시서작업처리.
 *
 * <p>원본 조건 판 실측(사본): 기준일자(최근30일(+1개월)) · 납기일자(사용안함) ·
 * <b>잔량기준</b>(직전작업) · 생산공장 · 작업품목 · 생산품목 · 담당자 · <b>미작업량</b>.
 * 즉 작업지시 중 <b>아직 안 한 작업</b>을 뽑아 그 자리에서 처리하는 화면이다.
 *
 * <p>우리에겐 이 화면이 아예 없었다. 작업내역입력은 있지만 빈 화면에서 작업지시와 공정을
 * 사람이 골라 적는 식이라, "무엇이 남았나" 를 다른 화면에서 보고 와야 했다.
 *
 * <p>남은 양은 BOR(작업 라우팅)으로 센다. 작업지시 × 공정마다
 * <b>미작업량 = 지시수량 − 그 공정에 기록된 작업수량</b> 이다.
 *
 * <p>원본 [잔량기준]의 '직전작업' 은 <b>앞 공정이 끝난 만큼만</b> 다음 공정을 할 수 있다는
 * 뜻이다. 첫 공정은 지시수량이 상한이고, 그다음부터는 직전 공정의 완료 수량이 상한이다.
 * 이걸 안 보면 조립을 하나도 안 했는데 검사를 100개 했다고 적을 수 있다.
 *
 * <p>생산공장은 우리에게 없다(재고는 창고 단위). <b>작업품목</b>은 BOR 줄에 붙은 품목이고
 * <b>생산품목</b>은 작업지시가 만드는 물건이라 서로 다른 축이다 — 조건도 열도 따로 둔다.
 */
interface WorkOrder {
  id: number
  orderNo: string
  productId: number
  productCode: string
  productName: string
  plannedQty: number
  producedQty: number
  orderDate: string
  dueDate: string | null
  statusName: string
  warehouseName: string | null
  warehouseId: number | null
  /** 원본 조건 판의 [담당자]. 응답에 이미 있는데 이 화면이 안 받고 있었다. */
  employeeId: number | null
}

interface BorRow {
  productId: number
  processId: number
  processName: string
  seq: number
  workName: string
  hoursPerUnit: number
  active: boolean
  /** BOR 줄이 다루는 <b>작업품목</b>. 만드는 물건(생산품목)과 다르다. */
  workItemId: number | null
  workItemCode: string | null
  workItemName: string | null
}

interface WorkResult {
  workOrderId: number | null
  processId: number | null
  goodQty: number
  defectQty: number
}

/** 처리할 한 줄 = 작업지시 × 공정. */
interface Row {
  key: string
  wo: WorkOrder
  seq: number
  processId: number
  processName: string
  workName: string
  workItemId: number | null
  /** [코드] 이름 꼴로 미리 붙여 둔 작업품목. 없으면 빈 글자. */
  workItemLabel: string
  /** 이미 이 공정에 기록된 수량 */
  doneQty: number
  /** 직전 공정이 끝낸 수량. 첫 공정은 지시수량. */
  availableQty: number
  /** 미작업량 = 지시수량 − 이 공정 완료. 잔량기준을 켜면 직전작업까지만. */
  remainQty: number
  /** BOR 의 개당 작업시간(시간) — 작업수량을 넣으면 노무/장치투입시간을 채운다(원본도 그렇다). */
  hoursPerUnit: number
}

const num = (n: number) => n.toLocaleString('ko-KR')

export default function WorkProcessPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'employees'])
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [bor, setBor] = useState<BorRow[]>([])
  const [results, setResults] = useState<WorkResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [item, setItem] = useState('')
  const [orderNo, setOrderNo] = useState('')
  /** 원본 [잔량기준] 직전작업. 켜면 앞 공정이 끝낸 만큼만 처리할 수 있다. */
  const [prevBased, setPrevBased] = useState(true)
  /** 원본 [미작업량] — 이만큼 이상 남은 것만 본다. */
  const [minRemain, setMinRemain] = useState('')
  /**
   * 원본 작업지시서작업처리 조건 실측(사본): 기준일자 · <b>납기일자</b> · 잔량기준 ·
   * <b>생산공장</b> · <b>작업</b> · 작업품목 · 생산품목 · 담당자 · 미작업량.
   *
   * <p>납기일자·생산공장·작업이 빠져 있었다. 처리할 줄이 수십 개면 "오늘 납기인 것부터",
   * "이 공장 것만" 을 못 골라 눈으로 훑게 된다.
   *
   * <p>[작업품목]은 BOR 의 작업기준품목이다. BOR 이 그 값을 안 들던 때에는 조건을 만들 수
   * 없었는데, BOR 에 작업품목이 생긴 뒤로도 <b>이 화면만 그대로 비어 있었다.</b>
   * [담당자]는 이 화면이 작업지시의 담당자를 안 받는다.
   */
  const [dueDate, setDueDate] = useState('')
  const [plant, setPlant] = useState('')
  const [work, setWork] = useState('')
  /** 원본 [작업품목]. BOR 줄에 붙은 품목이라 <b>생산품목과 따로</b> 거른다. */
  const [workItem, setWorkItem] = useState('')
  /** 원본 [담당자]. 값은 사원명이고, 전표에는 id 만 있어 목록으로 잇는다. */
  const [manager, setManager] = useState('')
  /** 줄마다 입력한 처리 수량·시간 */
  const [input, setInput] = useState<Record<string, { qty: string; minutes: string }>>({})
  const navigate = useNavigate()
  /** 원본 줄 앞의 체크 — 작업수량을 넣으면 저절로 켜진다. 켠 줄을 [작업내역입력] 이 가져간다. */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /**
   * 원본 아래 버튼 <b>[작업내역입력]</b>(2026-10-02 loginaa 실측) — 저장하지 않고 <b>작업내역입력 창을 연다</b>.
   * 켠 줄마다 작업지시서 · 작업 · 작업품목 · 작업수량 · 노무/장치투입시간이 한 줄씩 채워지고, 머리의 생산공장은
   * 지시의 공장이다. 저장은 그 창에서 한다.
   */
  function openWorkEntry() {
    const sel = rows.filter((r) => picked.has(r.key))
    if (sel.length === 0) return setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.')
    for (const r of sel) {
      const q = Number(input[r.key]?.qty ?? '')
      if (q > r.remainQty) return setError(`${r.wo.orderNo} ${r.workName}: 미작업량(${num(r.remainQty)})보다 많이 처리할 수 없습니다.`)
    }
    const prefill = {
      /* 원본 창의 [일자]는 오늘이다(조회 기간의 끝이 아니다). */
      workDate: ymd(new Date()),
      warehouseId: sel[0].wo.warehouseId,
      lines: sel.map((r) => ({
        workOrderId: r.wo.id, process: r.processName, workItemId: r.workItemId ?? r.wo.productId,
        goodQty: input[r.key]?.qty ?? '', workTimeMin: input[r.key]?.minutes ?? '',
        note: `${r.wo.orderNo} ${r.seq}.${r.workName}`,
      })),
    }
    try { sessionStorage.setItem('workEntryPrefill', JSON.stringify(prefill)) } catch { /* 저장소가 막혀 있으면 빈 창으로 연다 */ }
    navigate('/production/work-result')
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const period: Record<string, string> = {}
      if (from) period.from = from
      if (to) period.to = to
      const [w, b, r] = await Promise.all([
        /*
         * <b>고른 기간을 서버에도 보낸다.</b> 이 표는 작업지시를 <b>그 지시일로</b> 거른다
         * (아래 <code>wo.orderDate &lt; from</code>) — 서버에 같은 창을 주면 된다.
         */
        api.get<WorkOrder[]>('/work-orders', { params: period }),
        api.get<BorRow[]>('/bor'),
        api.get<WorkResult[]>('/work-results'),
      ])
      setOrders(w.data)
      setBor(b.data)
      setResults(r.data)
      setInput({})
      setPicked(new Set())
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  /* 기간을 바꾸면 그 기간으로 다시 받는다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  /** 품목 → 작업(순서대로) */
  /** 사원 id → 이름. */
  const nameOfEmployee = useMemo(
    () => new Map(pickers.employees.filter((e) => e.id != null).map((e) => [e.id as number, e.name])),
    [pickers.employees])

  const opsOf = useMemo(() => {
    const m = new Map<number, BorRow[]>()
    for (const o of bor) {
      if (!o.active) continue
      const cur = m.get(o.productId) ?? []
      cur.push(o)
      m.set(o.productId, cur)
    }
    for (const list of m.values()) list.sort((a, b) => a.seq - b.seq)
    return m
  }, [bor])

  /** (작업지시, 공정) → 이미 기록된 수량 */
  const doneOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of results) {
      if (r.workOrderId == null || r.processId == null) continue
      const k = `${r.workOrderId}:${r.processId}`
      m.set(k, (m.get(k) ?? 0) + r.goodQty + r.defectQty)
    }
    return m
  }, [results])

  const rows = useMemo(() => {
    const out: Row[] = []
    for (const wo of orders) {
      if (wo.orderDate < from || wo.orderDate > to) continue
      if (orderNo && !wo.orderNo.includes(orderNo)) continue
      if (item && String(wo.productId) !== item) continue
      if (dueDate && (wo.dueDate ?? '') !== dueDate) continue
      if (plant && !(wo.warehouseName ?? '').includes(plant)) continue
      const ops = opsOf.get(wo.productId) ?? []
      let prevDone = wo.plannedQty   // 첫 공정의 상한은 지시수량이다
      for (const o of ops) {
        const done = doneOf.get(`${wo.id}:${o.processId}`) ?? 0
        const byOrder = wo.plannedQty - done
        // 잔량기준(직전작업): 앞 공정이 끝낸 만큼만 할 수 있다.
        const remain = prevBased ? Math.max(0, Math.min(byOrder, prevDone - done)) : Math.max(0, byOrder)
        out.push({
          key: `${wo.id}:${o.processId}`,
          wo, seq: o.seq, processId: o.processId, processName: o.processName, workName: o.workName,
          workItemId: o.workItemId,
          workItemLabel: o.workItemId == null ? '' : `[${o.workItemCode ?? ''}] ${o.workItemName ?? ''}`,
          doneQty: done, availableQty: prevDone, remainQty: remain, hoursPerUnit: o.hoursPerUnit,
        })
        prevDone = done
      }
    }
    const min = Number(minRemain)
    return out
      .filter((r) => !work || `${r.processName} ${r.workName}`.includes(work))
      // 작업품목은 BOR 줄에 붙는다 — 생산품목(작업지시가 만드는 물건)과 다른 축이다.
      .filter((r) => !workItem || String(r.workItemId) === workItem)
      // 원본 [담당자]. 작업지시는 사람을 id 로 가리키므로 사원 목록으로 이름과 잇는다.
      .filter((r) => !manager || (nameOfEmployee.get(r.wo.employeeId ?? -1) ?? '') === manager)
      .filter((r) => (minRemain && !Number.isNaN(min) ? r.remainQty >= min : r.remainQty > 0))
      .sort((a, b) => (a.wo.orderDate < b.wo.orderDate ? 1 : a.wo.orderDate > b.wo.orderDate ? -1
        : a.wo.orderNo.localeCompare(b.wo.orderNo) || a.seq - b.seq))
  }, [orders, opsOf, doneOf, from, to, item, orderNo, prevBased, minRemain, dueDate, plant, work,
    workItem, manager, nameOfEmployee])

  async function process(r: Row) {
    const v = input[r.key]
    const qty = Number(v?.qty ?? '')
    if (!qty || qty <= 0) return setError('처리할 수량을 입력하세요.')
    if (qty > r.remainQty) return setError(`미작업량(${num(r.remainQty)})보다 많이 처리할 수 없습니다.`)
    setError(''); setOk('')
    try {
      /* qa/fixtures 증거가 api.post('/work-results' 글자를 찾는다 — 타입은 받는 쪽에 단다 */
      const res: { data: { resultNo: string } } = await api.post('/work-results', {
        workOrderId: r.wo.id,
        process: r.processName,
        // BOR 이 정해 둔 작업품목을 그대로 실적에 남긴다 — 나중에 무엇을 만졌는지 알 수 있다.
        workItemId: r.workItemId ?? undefined,
        goodQty: qty,
        defectQty: 0,
        workTimeMin: Number(v?.minutes ?? '') || 0,
        workDate: to,
        note: `${r.wo.orderNo} ${r.seq}.${r.workName}`,
      })
      setOk(`${res.data.resultNo} 작업실적 등록 완료 · ${r.wo.orderNo} ${r.processName} ${num(qty)} 처리`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const totalRemain = rows.reduce((n, r) => n + r.remainQty, 0)
  /* 그리는 줄만 자른다 — 위 합계는 rows 전부로 낸 값이다. 자른 것은 표 위에 적는다. */
  const capped = capRows(rows, 300)

  return (
    <EcListShell
      title="작업지시서작업처리"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => {
          setFrom(init.from); setTo(init.to); setItem(''); setOrderNo('')
          setPrevBased(true); setMinRemain('')
          setDueDate(''); setPlant(''); setWork(''); setWorkItem('')
        } },
        { label: '작업내역입력', onClick: openWorkEntry },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={WORK_PROCESS_PICKS}
      >
        <EcCond label="작업지시No." pick>
          <input className="ec-input" placeholder="전체" value={orderNo}
                 onChange={(e) => setOrderNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        {/* 원본 조건의 [납기일자]·[생산공장]·[작업]. 처리할 줄이 많으면 이것 없이는 눈으로 훑게 된다. */}
        <EcCond label="납기일자" pick>
          <input type="date" className="ec-input" value={dueDate}
                 onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} />
        </EcCond>
        {/*
          원본 [잔량기준] — <b>작업지시서 · 직전작업</b> 2단이고 [작업지시서]가 켜진 채 뜬다.
          우리는 체크박스에 '직전작업' 이라고만 적어 두어, <b>안 켰을 때가 무엇인지</b>
          화면이 말하지 않았다. 두 쪽을 다 적는다.
        */}
        <EcCond label="잔량기준">
          <div className="ec-pills">
            {([['지시', '작업지시서'], ['직전', '직전작업']] as const).map(([k, l]) => (
              <button key={k} type="button"
                      className={`ec-pill no-ec${(k === '직전') === prevBased ? ' active' : ''}`}
                      onClick={() => setPrevBased(k === '직전')}>{l}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="생산공장" pick>
          <input className="ec-input" placeholder="공장명 일부" value={plant}
                 onChange={(e) => setPlant(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="작업" pick>
          <input className="ec-input" placeholder="공정명·작업명 일부" value={work}
                 onChange={(e) => setWork(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="작업품목" pick>
          <CodePickerField label="작업품목" hideLabel width={200} emptyLabel="전체"
                           value={workItem} onChange={(v) => setWorkItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="생산품목" pick>
          <CodePickerField label="생산품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={180} emptyLabel="전체"
                           value={manager} onChange={(v) => setManager(v)}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="미작업량">
          <input className="ec-input text-right" type="number" placeholder="이상" value={minRemain}
                 onChange={(e) => setMinRemain(e.target.value)} style={{ width: 110 }} />
        </EcCond>
      </EcStatusPanel>

      <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        {rows.length}줄
        <span className="my-0 mx-[6px] text-ec-off">|</span>
        미작업량 합계 <b className="text-ec-navy text-[14px]">{num(totalRemain)}</b>
      </div>

      <div className="overflow-x-auto">
        <EcRowCap capped={capped.capped} shown={capped.rows.length} total={capped.total}
                  hint="품목이나 공정으로 좁혀 보세요." />
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[160px]">작업지시No.</th>
              <th className="w-[100px]">지시일자</th>
              <th>생산품목</th>
              <th className="w-[60px] text-right">순서</th>
              <th className="w-[130px]">작업/공정</th>
              <th className="w-[150px]">작업품목</th>
              <th className="w-[90px] text-right">지시수량</th>
              <th className="w-[90px] text-right">완료</th>
              <th className="w-[100px] text-right">미작업량</th>
              <th className="w-[90px] text-right">처리수량</th>
              <th className="w-[90px] text-right">작업시간(분)</th>
              <th className="w-[80px] text-center">처리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} className="ec-empty">불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={13} className="text-center text-ec-hint p-[20px]">
                처리할 작업이 없습니다. 품목에 BOR(작업소요시간)이 있어야 여기 나옵니다.
              </td></tr>
            ) : capped.rows.map((r, i) => (
              <tr key={r.key}>
                <td className="text-center text-ec-hint whitespace-nowrap">
                  <input type="checkbox" aria-label={`${r.wo.orderNo} ${r.workName} 선택`} checked={picked.has(r.key)}
                         onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n })} />
                  {' '}{i + 1}
                </td>
                <td>{r.wo.orderNo}</td>
                <td>{r.wo.orderDate.replace(/-/g, '/')}</td>
                <td>[{r.wo.productCode}] {r.wo.productName}</td>
                <td className="text-right">{r.seq}</td>
                <td>{r.workName} <span className="text-ec-hint text-[11.5px]">({r.processName})</span></td>
                <td style={{ color: r.workItemLabel ? undefined : 'var(--ec-text-hint)' }}>{r.workItemLabel || ''}</td>
                <td className="text-right">{num(r.wo.plannedQty)}</td>
                <td className="text-right text-ec-label">{num(r.doneQty)}</td>
                {/* 직전작업 기준이면 앞 공정이 덜 끝난 만큼 여기서 막힌다 */}
                <td className="text-right font-bold text-ec-danger">
                  {num(r.remainQty)}
                  {prevBased && r.remainQty < r.wo.plannedQty - r.doneQty && (
                    <span title={`직전작업 완료 ${num(r.availableQty)}에 막혀 있습니다.`}
                          style={{ color: 'var(--ec-warn)' }}> *</span>
                  )}
                </td>
                <td className="text-right">
                  <input className="ec-input text-right" type="number" style={{ width: 70 }}
                         value={input[r.key]?.qty ?? ''}
                         onChange={(e) => {
                           const qty = e.target.value
                           /* 원본처럼 수량을 넣으면 줄이 켜지고, 투입시간이 비었으면 BOR 개당 시간 × 수량(분)으로 채운다. */
                           setInput((p) => ({ ...p, [r.key]: { qty, minutes: p[r.key]?.minutes || (Number(qty) > 0 && r.hoursPerUnit > 0 ? String(Math.round(r.hoursPerUnit * 60 * Number(qty))) : '') } }))
                           if (Number(qty) > 0) setPicked((s) => new Set(s).add(r.key))
                         }} />
                </td>
                <td className="text-right">
                  <input className="ec-input text-right" type="number" style={{ width: 70 }}
                         value={input[r.key]?.minutes ?? ''}
                         onChange={(e) => setInput((p) => ({ ...p, [r.key]: { qty: p[r.key]?.qty ?? '', minutes: e.target.value } }))} />
                </td>
                <td className="text-center">
                  <button className="ec-btn" style={{ height: 20, padding: '0 6px' }} onClick={() => process(r)}>처리</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 300 && (
          <p className="text-[11.5px] text-ec-warn mt-[6px]">
            * 앞의 300줄만 보여 줍니다({rows.length}줄 중). 기간이나 품목을 좁혀 주세요.
          </p>
        )}
      </div>

      <p className="mt-[8px] text-[11.5px] text-ec-hint">
        * [잔량기준] 직전작업을 켜면 <b>앞 공정이 끝낸 만큼만</b> 처리할 수 있습니다.
        끄면 지시수량까지 열립니다 — 조립을 하나도 안 했는데 검사를 100개 했다고 적히는 것을 막는 장치입니다.
      </p>
    </EcListShell>
  )
}

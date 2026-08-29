import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { WORK_PROCESS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

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

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [w, b, r] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders'),
        api.get<BorRow[]>('/bor'),
        api.get<WorkResult[]>('/work-results'),
      ])
      setOrders(w.data)
      setBor(b.data)
      setResults(r.data)
      setInput({})
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

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
      if (item && !`${wo.productCode} ${wo.productName}`.includes(item)) continue
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
          doneQty: done, availableQty: prevDone, remainQty: remain,
        })
        prevDone = done
      }
    }
    const min = Number(minRemain)
    return out
      .filter((r) => !work || `${r.processName} ${r.workName}`.includes(work))
      // 작업품목은 BOR 줄에 붙는다 — 생산품목(작업지시가 만드는 물건)과 다른 축이다.
      .filter((r) => !workItem || r.workItemLabel.includes(workItem))
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
      await api.post('/work-results', {
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
      setOk(`${r.wo.orderNo} ${r.processName} ${num(qty)} 처리 완료`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const totalRemain = rows.reduce((n, r) => n + r.remainQty, 0)

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
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

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

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {rows.length}줄
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        미작업량 합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(totalRemain)}</b>
      </div>

      <div className="overflow-x-auto">
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 160 }}>작업지시No.</th>
              <th style={{ width: 100 }}>지시일자</th>
              <th>생산품목</th>
              <th style={{ width: 60, textAlign: 'right' }}>순서</th>
              <th style={{ width: 130 }}>작업/공정</th>
              <th style={{ width: 150 }}>작업품목</th>
              <th style={{ width: 90, textAlign: 'right' }}>지시수량</th>
              <th style={{ width: 90, textAlign: 'right' }}>완료</th>
              <th style={{ width: 100, textAlign: 'right' }}>미작업량</th>
              <th style={{ width: 90, textAlign: 'right' }}>처리수량</th>
              <th style={{ width: 90, textAlign: 'right' }}>작업시간(분)</th>
              <th style={{ width: 80, textAlign: 'center' }}>처리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
                처리할 작업이 없습니다. 품목에 BOR(작업소요시간)이 있어야 여기 나옵니다.
              </td></tr>
            ) : rows.slice(0, 300).map((r, i) => (
              <tr key={r.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.wo.orderNo}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.wo.orderDate.replace(/-/g, '/')}</td>
                <td>[{r.wo.productCode}] {r.wo.productName}</td>
                <td style={{ textAlign: 'right' }}>{r.seq}</td>
                <td>{r.workName} <span style={{ color: '#8a929c', fontSize: 11.5 }}>({r.processName})</span></td>
                <td style={{ color: r.workItemLabel ? undefined : '#9aa1ab' }}>{r.workItemLabel || ''}</td>
                <td style={{ textAlign: 'right' }}>{num(r.wo.plannedQty)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(r.doneQty)}</td>
                {/* 직전작업 기준이면 앞 공정이 덜 끝난 만큼 여기서 막힌다 */}
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#c60a2e' }}>
                  {num(r.remainQty)}
                  {prevBased && r.remainQty < r.wo.plannedQty - r.doneQty && (
                    <span title={`직전작업 완료 ${num(r.availableQty)}에 막혀 있습니다.`}
                          style={{ color: '#c07a00' }}> *</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <input className="ec-input text-right" type="number" style={{ width: 70 }}
                         value={input[r.key]?.qty ?? ''}
                         onChange={(e) => setInput((p) => ({ ...p, [r.key]: { qty: e.target.value, minutes: p[r.key]?.minutes ?? '' } }))} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <input className="ec-input text-right" type="number" style={{ width: 70 }}
                         value={input[r.key]?.minutes ?? ''}
                         onChange={(e) => setInput((p) => ({ ...p, [r.key]: { qty: p[r.key]?.qty ?? '', minutes: e.target.value } }))} />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="ec-btn" style={{ height: 20, padding: '0 6px' }} onClick={() => process(r)}>처리</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 300 && (
          <p style={{ fontSize: 11.5, color: '#c07a00', marginTop: 6 }}>
            * 앞의 300줄만 보여 줍니다({rows.length}줄 중). 기간이나 품목을 좁혀 주세요.
          </p>
        )}
      </div>

      <p style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
        * [잔량기준] 직전작업을 켜면 <b>앞 공정이 끝낸 만큼만</b> 처리할 수 있습니다.
        끄면 지시수량까지 열립니다 — 조립을 하나도 안 했는데 검사를 100개 했다고 적히는 것을 막는 장치입니다.
      </p>
    </EcListShell>
  )
}

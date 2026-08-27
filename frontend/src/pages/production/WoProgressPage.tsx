import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'

/**
 * 생산관리 > 작업지시서별진행현황 — 작업지시 하나가 어디까지 갔는지 네 갈래로 본다.
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 생산진행현황 | 불출진행현황 | 원재료투입비교표 | 작업진행현황
 *   기준일(영업주기)(금월(~오늘)) · 작업지시No. · 창고 · 거래처 · 품목 · 담당자
 *
 * <p>우리 화면은 <b>생산진행 하나</b>뿐이었고 조건 판도 없었다. 작업지시 444건이 통째로
 * 쏟아졌고, "자재는 얼마나 나갔나"·"BOM 대로 들어갔나"·"작업은 얼마나 됐나" 는
 * 아예 볼 수가 없었다.
 *
 * <p>네 갈래를 각각 다른 자료로 만든다:
 *   생산진행    /work-orders 의 지시·생산·잔여
 *   불출진행    /material-issues 를 작업지시로 모은다
 *   원재료투입  BOM 소요(지시수량 × BOM 수량) vs 실제 투입(불출 + 생산전표의 소모자재)
 *   작업진행    /work-results 를 작업지시로 모은다
 *
 * <p>[거래처]·[담당자]는 예전에 "작업지시에 그 값이 없어" 만들지 않았는데, 이제 있다
 * (원본 작업지시서입력 머리의 [납품처]·[담당자]). 담당자 <b>이름</b>은 서버가 못 붙인다 —
 * production 은 hr 을 참조할 수 없어(hr → accounting → production 순환) id 만 온다.
 *
 * <p>[거래처관리담당자]는 아직 없다. 거래처 마스터의 담당자를 보는 조건이라
 * 작업지시에서 거래처를 타고 그 값을 다시 받아 와야 한다.
 */
type Mode = '생산진행현황' | '불출진행현황' | '원재료투입비교표' | '작업진행현황'
const MODES = ['생산진행현황', '불출진행현황', '원재료투입비교표', '작업진행현황'] as const

type WoStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'
const STATUS_COLOR: Record<WoStatus, string> = {
  PLANNED: '#8a929c', IN_PROGRESS: '#c07a00', COMPLETED: '#1c7c3c',
}

interface WorkOrder {
  id: number
  orderNo: string
  orderDate: string
  productId: number
  productCode: string
  productName: string
  productUnit: string
  warehouseId: number
  warehouseName: string
  /**
   * 납품처·담당자. 원본 조건 판의 [거래처]·[담당자]가 이 값을 본다.
   * 예전에는 작업지시에 그 값이 없어 두 조건을 만들 수 없었다.
   * 담당자 <b>이름</b>은 서버가 못 붙인다 — production 은 hr 을 참조할 수 없다.
   */
  partnerName: string | null
  employeeId: number | null
  plannedQty: number
  producedQty: number
  remainingQty: number
  status: WoStatus
  statusName: string
}
interface Issue { id: number; workOrderId: number; itemId: number; itemCode: string; itemName: string; qty: number; issueDate: string }
/** 생산전표의 소모자재. 필드 이름이 불출(itemId)과 달리 componentId 다 — 실제 응답을 보고 맞췄다. */
interface ProdMaterial { componentId: number; componentCode: string; componentName: string; quantity: number }
interface Production { id: number; workOrderId: number; productionDate: string; producedQty: number; materials: ProdMaterial[] }
interface WorkResult { id: number; workOrderId: number | null; process: string; goodQty: number; defectQty: number; workTimeMin: number; workDate: string }
interface BomLine { componentId: number; componentCode: string; componentName: string; quantity: number }
interface Bom { productId: number; lines: BomLine[] }

const num = (n: number) => n.toLocaleString('ko-KR')
const pct = (done: number, planned: number) => (planned > 0 ? Math.min(999, (done / planned) * 100) : 0)

export default function WoProgressPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [productions, setProductions] = useState<Production[]>([])
  const [results, setResults] = useState<WorkResult[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [mode, setMode] = useState<Mode>('생산진행현황')
  const [view, setView] = useState<'표' | '그래프'>('표')
  const [orderNo, setOrderNo] = useState('')
  const [item, setItem] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  const [emp, setEmp] = useState('')
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [wo, mi, pr, wr, bm, emps] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders'),
        api.get<Issue[]>('/material-issues'),
        api.get<Production[]>('/productions'),
        api.get<WorkResult[]>('/work-results'),
        api.get<Bom[]>('/boms'),
        api.get<{ id: number; name: string }[]>('/employees'),
      ])
      setOrders(wo.data); setIssues(mi.data); setProductions(pr.data)
      setResults(wr.data); setBoms(bm.data); setEmployees(emps.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to)
    setMode('생산진행현황'); setOrderNo(''); setItem(''); setWarehouse('')
    setPartner(''); setEmp('')
  }

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다. */
  const empName = (id: number | null) =>
    id == null ? '' : (employees.find((x) => x.id === id)?.name ?? '')

  const shown = useMemo(() => orders.filter((o) => {
    if (o.orderDate < from || o.orderDate > to) return false
    if (orderNo && !o.orderNo.includes(orderNo)) return false
    if (item && !`${o.productCode} ${o.productName}`.includes(item)) return false
    if (warehouse && !(o.warehouseName ?? '').includes(warehouse)) return false
    if (partner && !(o.partnerName ?? '').includes(partner)) return false
    if (emp && !empName(o.employeeId).includes(emp)) return false
    return true
  }).sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.id - a.id)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [orders, from, to, orderNo, item, warehouse, partner, emp, employees])

  /** 작업지시별 불출 집계. */
  const issueBy = useMemo(() => {
    const m = new Map<number, { count: number; qty: number; last: string; items: Map<number, { name: string; qty: number }> }>()
    for (const i of issues) {
      const cur = m.get(i.workOrderId) ?? { count: 0, qty: 0, last: '', items: new Map() }
      cur.count += 1
      cur.qty += i.qty
      if (i.issueDate > cur.last) cur.last = i.issueDate
      const it = cur.items.get(i.itemId) ?? { name: `[${i.itemCode}] ${i.itemName}`, qty: 0 }
      it.qty += i.qty
      cur.items.set(i.itemId, it)
      m.set(i.workOrderId, cur)
    }
    return m
  }, [issues])

  /** 작업지시별 생산전표의 소모자재 집계 — 실제 투입의 나머지 절반. */
  const consumedBy = useMemo(() => {
    const m = new Map<number, Map<number, { name: string; qty: number }>>()
    for (const p of productions) {
      const cur = m.get(p.workOrderId) ?? new Map()
      for (const mt of p.materials) {
        const it = cur.get(mt.componentId) ?? { name: `[${mt.componentCode}] ${mt.componentName}`, qty: 0 }
        it.qty += mt.quantity
        cur.set(mt.componentId, it)
      }
      m.set(p.workOrderId, cur)
    }
    return m
  }, [productions])

  /** 작업지시별 작업내역 집계. */
  const resultBy = useMemo(() => {
    const m = new Map<number, { count: number; good: number; defect: number; time: number; last: string }>()
    for (const r of results) {
      if (r.workOrderId == null) continue
      const cur = m.get(r.workOrderId) ?? { count: 0, good: 0, defect: 0, time: 0, last: '' }
      cur.count += 1
      cur.good += r.goodQty
      cur.defect += r.defectQty
      cur.time += r.workTimeMin
      if (r.workDate > cur.last) cur.last = r.workDate
      m.set(r.workOrderId, cur)
    }
    return m
  }, [results])

  const bomBy = useMemo(() => new Map(boms.map((b) => [b.productId, b.lines])), [boms])

  /** 원재료투입비교 — 자재 한 줄씩. 소요 = 지시수량 × BOM 수량, 투입 = 불출 + 소모. */
  const compareLines = useMemo(() => {
    const out: {
      key: string; orderNo: string; product: string
      material: string; required: number; used: number
    }[] = []
    for (const o of shown) {
      const lines = bomBy.get(o.productId) ?? []
      const used = new Map<number, { name: string; qty: number }>()
      for (const [id, v] of issueBy.get(o.id)?.items ?? new Map()) used.set(id, { name: v.name, qty: v.qty })
      for (const [id, v] of consumedBy.get(o.id) ?? new Map()) {
        const cur = used.get(id) ?? { name: v.name, qty: 0 }
        cur.qty += v.qty
        used.set(id, cur)
      }
      const seen = new Set<number>()
      for (const l of lines) {
        seen.add(l.componentId)
        out.push({
          key: `${o.id}-${l.componentId}`, orderNo: o.orderNo,
          product: `[${o.productCode}] ${o.productName}`,
          material: `[${l.componentCode}] ${l.componentName}`,
          required: l.quantity * o.plannedQty,
          used: used.get(l.componentId)?.qty ?? 0,
        })
      }
      // BOM 에 없는데 들어간 자재도 보여 준다 — 숨기면 "왜 재고가 줄었지" 를 못 찾는다.
      for (const [id, v] of used) {
        if (seen.has(id)) continue
        out.push({
          key: `${o.id}-x${id}`, orderNo: o.orderNo,
          product: `[${o.productCode}] ${o.productName}`,
          material: v.name, required: 0, used: v.qty,
        })
      }
    }
    return out
  }, [shown, bomBy, issueBy, consumedBy])

  const totals = useMemo(() => ({
    planned: shown.reduce((n, o) => n + o.plannedQty, 0),
    produced: shown.reduce((n, o) => n + o.producedQty, 0),
    issued: shown.reduce((n, o) => n + (issueBy.get(o.id)?.qty ?? 0), 0),
    good: shown.reduce((n, o) => n + (resultBy.get(o.id)?.good ?? 0), 0),
    defect: shown.reduce((n, o) => n + (resultBy.get(o.id)?.defect ?? 0), 0),
  }), [shown, issueBy, resultBy])

  /* 지금 보고 있는 [구분]이 재는 값을 그린다. */
  const chartRows = useMemo(() => {
    if (mode === '원재료투입비교표') {
      return compareLines.map((l) => ({
        label: `${l.orderNo} / ${l.material}`, value: l.used - l.required,
      }))
    }
    if (mode === '불출진행현황') {
      return shown.map((o) => ({
        label: `${o.orderNo} ${o.productName}`, value: issueBy.get(o.id)?.qty ?? 0,
      }))
    }
    return shown.map((o) => ({
      label: `${o.orderNo} ${o.productName}`, value: o.plannedQty - o.producedQty,
    }))
  }, [mode, shown, compareLines, issueBy])

  const bar = (rate: number) => (
    <div style={{ background: '#eef1f5', height: 12, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(100, rate)}%`, height: '100%',
        background: rate >= 100 ? '#1c7c3c' : rate > 0 ? 'var(--ec-blue)' : 'transparent',
      }} />
    </div>
  )

  return (
    <EcListShell
      title="작업지시서별진행현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        dateLabel="기준일(영업주기)"
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        view={view} onViewChange={setView}
      >
        <EcCond label="작업지시No." pick>
          <input className="ec-input" placeholder="작업지시번호 일부" value={orderNo}
                 onChange={(e) => setOrderNo(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="품목" pick>
          <input className="ec-input" placeholder="품목코드·품명 일부" value={item}
                 onChange={(e) => setItem(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <input className="ec-input" placeholder="거래처명 일부" value={partner}
                 onChange={(e) => setPartner(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="담당자" pick>
          <input className="ec-input" placeholder="담당자명 일부" value={emp}
                 onChange={(e) => setEmp(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <input className="ec-input" placeholder="창고명 일부" value={warehouse}
                 onChange={(e) => setWarehouse(e.target.value)} style={{ width: 180 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        작업지시 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        지시수량 <b>{num(totals.planned)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        생산수량 <b style={{ color: 'var(--ec-blue-dark)' }}>{num(totals.produced)}</b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/*
        원본 [그래프로 보기]. 이 화면이 재는 것은 <b>얼마나 남았나</b> 다 —
        지시수량이 아니라 <b>미생산 잔량(지시−생산)</b>을 그린다. 지시수량을 그리면
        이미 다 만든 지시가 제일 큰 막대로 남아 눈길을 끈다.
        원재료투입비교표는 자재별 <b>초과투입</b>(투입−소요)을 그린다.
      */}
      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="조회된 작업지시가 없습니다." />
      ) : mode === '불출진행현황' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170 }}>작업지시번호</th>
              <th>품목명</th>
              <th style={{ width: 100, textAlign: 'right' }}>지시수량</th>
              <th style={{ width: 100, textAlign: 'right' }}>불출건수</th>
              <th style={{ width: 110, textAlign: 'right' }}>불출수량</th>
              <th style={{ width: 120 }}>최근불출일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((o, i) => {
              const g = issueBy.get(o.id)
              return (
                <tr key={o.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{o.orderNo}</td>
                  <td>[{o.productCode}] {o.productName}</td>
                  <td style={{ textAlign: 'right' }}>{num(o.plannedQty)}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g?.count ?? 0)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: g ? '#a5561b' : '#c9ced6' }}>{num(g?.qty ?? 0)}</td>
                  <td style={{ fontFamily: 'monospace', color: g ? undefined : '#c9ced6' }}>{g?.last ?? '-'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right' }}>{num(totals.planned)}</td>
              <td></td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totals.issued)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '원재료투입비교표' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170 }}>작업지시번호</th>
              <th>생산품목</th>
              <th>원재료</th>
              <th style={{ width: 110, textAlign: 'right' }}>소요(BOM)</th>
              <th style={{ width: 110, textAlign: 'right' }}>투입</th>
              <th style={{ width: 110, textAlign: 'right' }}>차이</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : compareLines.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : compareLines.map((l, i) => {
              const diff = l.used - l.required
              return (
                <tr key={l.key}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{l.orderNo}</td>
                  <td>{l.product}</td>
                  <td style={{ color: l.required === 0 ? '#a5561b' : undefined }}>
                    {l.material}{l.required === 0 ? ' (BOM 밖)' : ''}
                  </td>
                  <td style={{ textAlign: 'right' }}>{num(l.required)}</td>
                  <td style={{ textAlign: 'right' }}>{num(l.used)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: diff > 0 ? '#c60a2e' : diff < 0 ? '#1c7c3c' : '#8a929c' }}>
                    {diff > 0 ? '+' : ''}{num(diff)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : mode === '작업진행현황' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170 }}>작업지시번호</th>
              <th>품목명</th>
              <th style={{ width: 90, textAlign: 'right' }}>작업건수</th>
              <th style={{ width: 100, textAlign: 'right' }}>양품</th>
              <th style={{ width: 100, textAlign: 'right' }}>불량</th>
              <th style={{ width: 110, textAlign: 'right' }}>작업시간(분)</th>
              <th style={{ width: 120 }}>최근작업일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((o, i) => {
              const g = resultBy.get(o.id)
              return (
                <tr key={o.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{o.orderNo}</td>
                  <td>[{o.productCode}] {o.productName}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g?.count ?? 0)}</td>
                  <td style={{ textAlign: 'right', color: '#1c7c3c', fontWeight: 600 }}>{num(g?.good ?? 0)}</td>
                  <td style={{ textAlign: 'right', color: (g?.defect ?? 0) > 0 ? '#c60a2e' : '#8a929c' }}>{num(g?.defect ?? 0)}</td>
                  <td style={{ textAlign: 'right' }}>{num(g?.time ?? 0)}</td>
                  <td style={{ fontFamily: 'monospace', color: g ? undefined : '#c9ced6' }}>{g?.last ?? '-'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: '#1c7c3c' }}>{num(totals.good)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{num(totals.defect)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170 }}>작업지시번호</th>
              <th>품목명</th>
              <th style={{ width: 100, textAlign: 'right' }}>지시수량</th>
              <th style={{ width: 100, textAlign: 'right' }}>완료수량</th>
              <th style={{ width: 100, textAlign: 'right' }}>잔여수량</th>
              <th style={{ width: 160 }}>진행률</th>
              <th style={{ width: 90, textAlign: 'right' }}>진행률(%)</th>
              <th style={{ width: 90, textAlign: 'center' }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((o, i) => {
              const rate = pct(o.producedQty, o.plannedQty)
              return (
                <tr key={o.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{o.orderNo}</td>
                  <td>[{o.productCode}] {o.productName}</td>
                  <td style={{ textAlign: 'right' }}>{num(o.plannedQty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{num(o.producedQty)}</td>
                  <td style={{ textAlign: 'right', color: o.remainingQty > 0 ? '#c60a2e' : '#8a929c' }}>{num(o.remainingQty)}</td>
                  <td>{bar(rate)}</td>
                  <td style={{ textAlign: 'right' }}>{rate.toFixed(1)}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[o.status] }}>{o.statusName}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right' }}>{num(totals.planned)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(totals.produced)}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      )}
    </EcListShell>
  )
}

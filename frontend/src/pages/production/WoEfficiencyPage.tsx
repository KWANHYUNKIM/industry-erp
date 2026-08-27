import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import {
  actualConsume, materialDiff, standardConsume, workTime,
  type BomLine, type PriceOf,
} from '../../utils/woEfficiency'
import { stockCostMap } from '../../utils/stockValue'
import type { Item, PurchaseDoc } from '../../api/types'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 생산관리 > 작업지시서효율현황 — 계획(지시수량) 대비 실적 효율
 * (/api/work-orders + /api/productions)
 *
 * <p>원본 조건 판 실측(사본):
 *   기준일(영업주기)(금월(~오늘)) · <b>납기일자(사용안함)</b> · 작업지시No. · 오더관리번호 ·
 *   창고 · 거래처 · 품목 · 담당자 · 거래처관리담당자 · 규격 · 적요 ·
 *   [진행상태] 전체 | 결재중 | 미확인 | 확인 · 최초작성자 · 최종수정자
 *
 * <p>우리는 조건 판이 없고 검색어 한 칸이 전부였다 — 작업지시 444건이 통째로 쏟아졌다.
 *
 * <p>납기일자는 원본에서 <b>기본이 '사용안함'</b> 인 두 번째 기간이다. 켜면 그 구간의
 * 납기만 본다. 오더관리번호·거래처·담당자·규격·적요·작성자는 작업지시에 그 값이 없어
 * 칸을 만들지 않는다. 진행상태는 우리 상태(예정·진행중·완료)로 갈음한다.
 */
type WoStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'

interface WorkOrderRow {
  id: number
  orderNo: string
  /** BOM(표준소모)을 찾는 열쇠. 응답에 있었는데 이 화면이 안 받고 있었다. */
  productId: number
  productCode: string
  productName: string
  productUnit: string
  plannedQty: number
  producedQty: number
  remainingQty: number
  status: WoStatus
  statusName: string
  orderDate: string
  dueDate: string | null
  /** 원본 조건 판의 [창고]. 응답에 이미 있는데 이 화면이 안 받고 있었다. */
  warehouseName: string | null
}

interface ProductionRow {
  id: number
  prodNo: string
  workOrderId: number
  workOrderNo: string
  productId: number
  producedQty: number
  productionDate: string
  /** 그 실적에 실제로 투입한 자재. 원본 [소모]의 '실제'가 이것이다. */
  materials?: { componentId: number; componentName: string; quantity: number }[]
}

interface BomRow {
  productId: number
  lines: { componentId: number; componentName: string; quantity: number }[]
}

interface ProcessRow {
  id: number
  name: string
  /** 개당 표준시간(분) */
  stdTimeMin: number | null
}

/** BOR(작업소요시간) 한 줄. 품목이 거치는 작업과 1개당 시간(H). */
interface BorRow {
  productId: number
  processId: number
  hoursPerUnit: number
  active: boolean
}

interface WorkResultRow {
  workOrderId: number | null
  processId: number | null
  goodQty: number
  defectQty: number
  workTimeMin: number
}

export default function WoEfficiencyPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'warehouses'])
  const [orders, setOrders] = useState<WorkOrderRow[]>([])
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [boms, setBoms] = useState<BomRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [results, setResults] = useState<WorkResultRow[]>([])
  const [bor, setBor] = useState<BorRow[]>([])
  /** 하위공정(자재)을 펼친 작업지시 id */
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [useDue, setUseDue] = useState(false)
  const [dueFrom, setDueFrom] = useState(init.from)
  const [dueTo, setDueTo] = useState(init.to)
  const [orderNo, setOrderNo] = useState('')
  const [item, setItem] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [status, setStatus] = useState('전체')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [woRes, prodRes, bomRes, itemRes, procRes, resultRes, purchaseRes, borRes] = await Promise.all([
        api.get<WorkOrderRow[]>('/work-orders'),
        api.get<ProductionRow[]>('/productions'),
        api.get<BomRow[]>('/boms'),
        api.get<Item[]>('/items'),
        api.get<ProcessRow[]>('/processes'),
        api.get<WorkResultRow[]>('/work-results'),
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<BorRow[]>('/bor'),
      ])
      setOrders([...woRes.data].sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.id - a.id)))
      setProductions(prodRes.data)
      setBoms(bomRes.data)
      setItems(itemRes.data)
      setProcesses(procRes.data)
      setResults(resultRes.data)
      setPurchases(purchaseRes.data)
      setBor(borRes.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  /**
   * 자재 단가는 재고자산평가와 <b>같은 규칙</b>을 쓴다 — 마지막 입고단가, 없으면 품목의
   * 구매단가, 그것도 없으면 모른다(null). 화면마다 다른 기준을 쓰면 같은 자재가 화면마다
   * 다른 금액으로 보인다.
   *
   * <p>모르는 것을 0원으로 채우지 않는다. 0으로 세면 자재를 두 배 써도 차이가 0으로 보인다.
   */
  const priceOf: PriceOf = useMemo(() => {
    const m = stockCostMap(items, purchases.map((p) => ({
      purchaseDate: p.purchaseDate,
      lines: (p.lines ?? []).map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice })),
    })))
    return (id: number) => m.get(id) ?? null
  }, [items, purchases])

  const bomByProduct = useMemo(
    () => new Map<number, BomLine[]>(boms.map((b) => [b.productId, b.lines])), [boms])

  const stdMinByProcess = useMemo(
    () => new Map(processes.map((p) => [p.id, p.stdTimeMin])), [processes])

  /**
   * 품목의 <b>표준 작업시간</b>(분/개). BOR 라우팅의 1개당 시간 합이다.
   *
   * <p>예전에는 표준시간을 <b>실제로 작업한 공정</b>의 표준시간으로만 셌다. 그러면
   * 빼먹은 공정은 표준에도 안 잡혀서 "공정을 하나 건너뛰었다" 를 영영 못 본다 —
   * 오히려 시간을 아낀 것처럼 보인다. BOR 이 생겼으니 품목 기준으로 센다.
   */
  const borMinPerUnit = useMemo(() => {
    const m = new Map<number, number>()
    for (const b of bor) {
      if (!b.active) continue
      m.set(b.productId, (m.get(b.productId) ?? 0) + b.hoursPerUnit * 60)
    }
    return m
  }, [bor])

  /** 작업지시별 소모(표준·실제)와 시간(표준·실제). 원본의 [소모]·[시간] 묶음이다. */
  const efficiency = useMemo(() => {
    const usedByWo = new Map<number, { componentId: number; componentName: string; quantity: number }[]>()
    const producedByWo = new Map<number, number>()
    for (const p of productions) {
      producedByWo.set(p.workOrderId, (producedByWo.get(p.workOrderId) ?? 0) + p.producedQty)
      const cur = usedByWo.get(p.workOrderId) ?? []
      cur.push(...(p.materials ?? []))
      usedByWo.set(p.workOrderId, cur)
    }
    const timeByWo = new Map<number, { qty: number; minutes: number; stdMinPerUnit: number | null }[]>()
    for (const r of results) {
      if (r.workOrderId == null) continue
      const cur = timeByWo.get(r.workOrderId) ?? []
      cur.push({
        qty: r.goodQty + r.defectQty,
        minutes: r.workTimeMin,
        // BOR 이 없는 품목만 공정 표준시간으로 갈음한다(아래에서 품목 기준으로 덮어쓴다).
        stdMinPerUnit: r.processId != null ? (stdMinByProcess.get(r.processId) ?? null) : null,
      })
      timeByWo.set(r.workOrderId, cur)
    }
    const m = new Map<number, {
      std: ReturnType<typeof standardConsume>
      act: ReturnType<typeof actualConsume>
      time: ReturnType<typeof workTime>
      rows: ReturnType<typeof materialDiff>
    }>()
    for (const wo of orders) {
      const bom = bomByProduct.get(wo.productId) ?? []
      const used = usedByWo.get(wo.id) ?? []
      const produced = producedByWo.get(wo.id) ?? 0
      /*
       * 표준시간은 <b>품목의 BOR × 생산수량</b>이 원칙이다. 실제 작업한 공정만 세면
       * 빼먹은 공정이 안 보인다. BOR 이 없는 품목만 예전처럼 공정 표준시간으로 갈음한다.
       */
      const perUnit = borMinPerUnit.get(wo.productId)
      const rows = timeByWo.get(wo.id) ?? []
      const time = perUnit != null
        ? {
          standard: Math.round(perUnit * produced * 100) / 100,
          actual: rows.reduce((n, r) => n + r.minutes, 0),
          unknown: 0,
        }
        : workTime(rows)

      m.set(wo.id, {
        std: standardConsume(bom, produced, priceOf),
        act: actualConsume(used, priceOf),
        time,
        rows: materialDiff(bom, used, produced, priceOf),
      })
    }
    return m
  }, [orders, productions, results, bomByProduct, stdMinByProcess, borMinPerUnit, priceOf])

  const shown = orders.filter((r) => {
    if (r.orderDate < from || r.orderDate > to) return false
    if (useDue) {
      if (!r.dueDate) return false
      if (r.dueDate < dueFrom || r.dueDate > dueTo) return false
    }
    if (orderNo && !r.orderNo.includes(orderNo)) return false
    if (item && !`${r.productCode} ${r.productName}`.includes(item)) return false
    if (warehouse && !(r.warehouseName ?? '').includes(warehouse)) return false
    if (status !== '전체' && r.statusName !== status) return false
    return true
  })
  const won = (n: number) => n.toLocaleString('ko-KR')
  const avgEff = useMemo(() => {
    const withPlan = shown.filter((r) => r.plannedQty > 0)
    if (withPlan.length === 0) return 0
    return Math.round(withPlan.reduce((s, r) => s + (r.producedQty / r.plannedQty) * 100, 0) / withPlan.length)
  }, [shown])

  /** 표준 − 실제. 음수면 그만큼 자재를 더 썼다는 뜻이다. */
  const consumeTotal = shown.reduce((n, r) => {
    const e = efficiency.get(r.id)
    return e ? n + (e.std.amount - e.act.amount) : n
  }, 0)

  return (
    <EcListShell
      title="작업지시서효율현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => {
          setFrom(init.from); setTo(init.to)
          setUseDue(false); setDueFrom(init.from); setDueTo(init.to)
          setOrderNo(''); setItem(''); setWarehouse(''); setStatus('전체')
        } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        dateLabel="기준일(영업주기)"
      >
        <EcCond label="납기일자">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={useDue} onChange={(e) => setUseDue(e.target.checked)} />
            사용
          </label>
          <input type="date" className="ec-input" value={dueFrom} disabled={!useDue}
                 onChange={(e) => setDueFrom(e.target.value)} style={{ width: 150 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={dueTo} disabled={!useDue}
                 onChange={(e) => setDueTo(e.target.value)} style={{ width: 150 }} />
        </EcCond>
        <EcCond label="작업지시No." pick>
          <input className="ec-input" placeholder="작업지시번호 일부" value={orderNo}
                 onChange={(e) => setOrderNo(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={warehouse} onChange={(v) => setWarehouse(v)}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="진행상태">
          <div className="ec-pills">
            {/* 문구는 응답의 statusName 그대로다 — '예정'이라 적었더니 늘 빈 화면이었다(실측으로 잡음). */}
            {['전체', '계획', '진행중', '완료'].map((s2) => (
              <button key={s2} type="button" className={`ec-pill no-ec${status === s2 ? ' active' : ''}`}
                      onClick={() => setStatus(s2)}>{s2}</button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        작업지시 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        평균 달성효율 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{avgEff}%</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        소모 차이 합계 <b style={{ color: consumeTotal < 0 ? '#c60a2e' : '#1c7c3c', fontSize: 14 }}>{won(consumeTotal)}</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>전표번호</th>
            <th>품목</th>
            <th>납기일자</th>
            <th style={{ textAlign: 'right' }}>계획수량</th>
            <th style={{ textAlign: 'right' }}>생산수량</th>
            <th style={{ textAlign: 'right' }}>차이</th>
            <th style={{ textAlign: 'right' }}>소모 표준</th>
            <th style={{ textAlign: 'right' }}>소모 실제</th>
            <th style={{ textAlign: 'right' }}>소모 차이</th>
            <th style={{ textAlign: 'right' }}>시간 표준</th>
            <th style={{ textAlign: 'right' }}>시간 실제</th>
            <th style={{ textAlign: 'center' }}>하위공정</th>
            <th style={{ textAlign: 'center' }}>진행상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.flatMap((r, i) => {
            const e = efficiency.get(r.id)
            const qtyDiff = r.producedQty - r.plannedQty
            const consumeDiff = e ? e.std.amount - e.act.amount : 0
            const unknown = e ? e.std.unknown + e.act.unknown : 0
            const expanded = open.has(r.id)
            const detail = (e?.rows ?? []).filter((x) => x.stdQty !== 0 || x.actualQty !== 0)
            const rows = [(
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
                <td>[{r.productCode}] {r.productName}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.dueDate ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{r.plannedQty.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right' }}>{r.producedQty.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right', color: qtyDiff < 0 ? '#c60a2e' : qtyDiff > 0 ? '#1c7c3c' : '#8a929c' }}>
                  {qtyDiff.toLocaleString('ko-KR')}
                </td>
                <td style={{ textAlign: 'right' }}>{won(e?.std.amount ?? 0)}</td>
                <td style={{ textAlign: 'right' }}>{won(e?.act.amount ?? 0)}</td>
                {/* 표준 − 실제. 음수면 자재를 더 썼다는 뜻이다. */}
                <td style={{ textAlign: 'right', fontWeight: 700, color: consumeDiff < 0 ? '#c60a2e' : consumeDiff > 0 ? '#1c7c3c' : '#8a929c' }}>
                  {won(consumeDiff)}
                  {unknown > 0 && (
                    <span title={'단가를 모르는 자재 ' + unknown + '건은 빼고 셌습니다.'} style={{ color: '#c07a00' }}> *</span>
                  )}
                </td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{e && e.time.standard ? won(e.time.standard) + '분' : ''}</td>
                <td style={{ textAlign: 'right' }}>{e && e.time.actual ? won(e.time.actual) + '분' : ''}</td>
                <td style={{ textAlign: 'center' }}>
                  {detail.length > 0 ? (
                    <button onClick={() => setOpen((prev) => {
                      const next = new Set(prev)
                      if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                      return next
                    })} style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                      {expanded ? '접기' : '펼치기 (' + detail.length + ')'}
                    </button>
                  ) : <span style={{ color: '#c9ced6' }}>-</span>}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: r.status === 'COMPLETED' ? '#1c7c3c' : r.status === 'IN_PROGRESS' ? '#c07a00' : '#8a929c' }}>{r.statusName}</td>
              </tr>
            )]
            if (expanded) {
              for (const d of detail) {
                rows.push(
                  <tr key={r.id + '-' + d.componentId} style={{ background: '#fafbfc' }}>
                    <td></td>
                    <td colSpan={2} style={{ paddingLeft: 18, color: '#5a626e' }}>└ {d.componentName}</td>
                    <td></td>
                    <td style={{ textAlign: 'right', color: '#8a929c' }}>{d.stdQty.toLocaleString('ko-KR')}</td>
                    <td style={{ textAlign: 'right', color: '#8a929c' }}>{d.actualQty.toLocaleString('ko-KR')}</td>
                    <td style={{ textAlign: 'right', color: '#8a929c' }}>{(d.actualQty - d.stdQty).toLocaleString('ko-KR')}</td>
                    <td style={{ textAlign: 'right' }}>{d.stdAmount != null ? won(d.stdAmount) : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{d.actualAmount != null ? won(d.actualAmount) : '-'}</td>
                    <td style={{ textAlign: 'right', color: d.diffAmount != null && d.diffAmount < 0 ? '#c60a2e' : '#5a626e' }}>
                      {d.diffAmount != null ? won(d.diffAmount) : '단가 없음'}
                    </td>
                    {/* 시간 표준·실제 · 하위공정 · 진행상태 — 자재 줄에는 없다 */}
                    <td colSpan={4}></td>
                  </tr>,
                )
              }
            }
            return rows
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}

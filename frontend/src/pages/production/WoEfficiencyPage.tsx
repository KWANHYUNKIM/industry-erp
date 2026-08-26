import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'

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
  producedQty: number
  productionDate: string
}

export default function WoEfficiencyPage() {
  const [orders, setOrders] = useState<WorkOrderRow[]>([])
  const [productions, setProductions] = useState<ProductionRow[]>([])
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
      const [woRes, prodRes] = await Promise.all([
        api.get<WorkOrderRow[]>('/work-orders'),
        api.get<ProductionRow[]>('/productions'),
      ])
      setOrders([...woRes.data].sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.id - a.id)))
      setProductions(prodRes.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // 작업지시별 실적 집계(실적건수, 마지막 실적일)
  const prodByWo = useMemo(() => {
    const map = new Map<number, { count: number; lastDate: string }>()
    for (const p of productions) {
      const cur = map.get(p.workOrderId)
      if (!cur) map.set(p.workOrderId, { count: 1, lastDate: p.productionDate })
      else map.set(p.workOrderId, { count: cur.count + 1, lastDate: cur.lastDate < p.productionDate ? p.productionDate : cur.lastDate })
    }
    return map
  }, [productions])

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
  const avgEff = useMemo(() => {
    const withPlan = shown.filter((r) => r.plannedQty > 0)
    if (withPlan.length === 0) return 0
    return Math.round(withPlan.reduce((s, r) => s + (r.producedQty / r.plannedQty) * 100, 0) / withPlan.length)
  }, [shown])

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
          <input className="ec-input" placeholder="품목코드·품명 일부" value={item}
                 onChange={(e) => setItem(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <input className="ec-input" placeholder="창고명 일부" value={warehouse}
                 onChange={(e) => setWarehouse(e.target.value)} style={{ width: 180 }} />
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
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>작업지시번호</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>지시수량</th>
            <th style={{ textAlign: 'right' }}>생산수량</th>
            <th style={{ textAlign: 'right' }}>잔여수량</th>
            <th style={{ textAlign: 'right' }}>실적건수</th>
            <th>최근실적일</th>
            <th style={{ textAlign: 'right' }}>효율(%)</th>
            <th style={{ textAlign: 'center' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const eff = r.plannedQty ? Math.round((r.producedQty / r.plannedQty) * 100) : 0
            const agg = prodByWo.get(r.id)
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
                <td>[{r.productCode}] {r.productName}</td>
                <td style={{ textAlign: 'right' }}>{r.plannedQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.producedQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: r.remainingQty > 0 ? '#c60a2e' : '#8a929c' }}>{r.remainingQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{agg ? agg.count.toLocaleString() : 0}</td>
                <td style={{ fontFamily: 'monospace' }}>{agg ? agg.lastDate : '-'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: eff >= 100 ? '#1c7c3c' : '#c60a2e' }}>{eff}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: r.status === 'COMPLETED' ? '#1c7c3c' : r.status === 'IN_PROGRESS' ? '#c07a00' : '#8a929c' }}>{r.statusName}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}

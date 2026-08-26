import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { Warehouse } from '../../api/types'

/**
 * 생산관리 > 생산입고현황 — 생산입고 전표(/api/productions)를 기간·조건으로 본다.
 *
 * <p>예전에는 이 화면이 <b>작업지시 목록</b>(/api/work-orders)을 그대로 보여 줬다.
 * 지시수량·입고수량·잔여수량을 나열하는, 사실상 작업지시서현황이었다.
 * 원본 화면 사본으로 대조해 보니 생산입고현황은 <b>입고된 전표</b>를 보는 자리다.
 *
 * <p>원본 조건 판 실측:
 *   [구분] 내역 | 집계 | 라인별 · 일자(금월(~오늘)) · 창고 · 프로젝트 · 품목 · 담당자 · 적요
 * 우리는 조건 판이 아예 없었다(검색어 한 칸이 전부). 프로젝트·적요는 생산입고에 그 값이
 * 없어 칸을 만들지 않는다 — 값이 없는 조건칸은 만들지 않는다.
 */
type Mode = '내역' | '집계' | '라인별'
const MODES = ['내역', '집계', '라인별'] as const

interface Material {
  itemId: number
  itemCode: string
  itemName: string
  quantity: number
}

interface Production {
  id: number
  prodNo: string
  workOrderId: number
  workOrderNo: string
  productId: number
  productCode: string
  productName: string
  productUnit: string
  warehouseId: number
  warehouseName: string
  producedQty: number
  productionDate: string
  createdBy: string | null
  materials: Material[]
}

const num = (n: number) => n.toLocaleString('ko-KR')

export default function ReceiptStatusPage() {
  const [rows, setRows] = useState<Production[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouseId, setWarehouseId] = useState('')
  const [item, setItem] = useState('')
  const [worker, setWorker] = useState('')
  const [mode, setMode] = useState<Mode>('내역')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [prod, wh] = await Promise.all([
        api.get<Production[]>('/productions'),
        api.get<Warehouse[]>('/warehouses'),
      ])
      setRows([...prod.data].sort((a, b) =>
        (a.productionDate < b.productionDate ? 1 : a.productionDate > b.productionDate ? -1 : b.id - a.id)))
      setWarehouses(wh.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to)
    setWarehouseId(''); setItem(''); setWorker(''); setMode('내역')
  }

  const shown = useMemo(() => rows.filter((r) => {
    if (r.productionDate < from || r.productionDate > to) return false
    if (warehouseId && String(r.warehouseId) !== warehouseId) return false
    if (item && !`${r.productCode} ${r.productName}`.includes(item)) return false
    if (worker && !(r.createdBy ?? '').includes(worker)) return false
    return true
  }), [rows, from, to, warehouseId, item, worker])

  /** 집계 — 품목 단위로 입고수량을 모은다. */
  const byItem = useMemo(() => {
    const m = new Map<number, {
      itemId: number; code: string; name: string; unit: string; qty: number; count: number
    }>()
    for (const r of shown) {
      const cur = m.get(r.productId)
      if (!cur) {
        m.set(r.productId, {
          itemId: r.productId, code: r.productCode, name: r.productName,
          unit: r.productUnit, qty: r.producedQty, count: 1,
        })
      } else {
        cur.qty += r.producedQty
        cur.count += 1
      }
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty)
  }, [shown])

  /** 라인별 — 전표 하나에 소모자재가 여러 줄이므로 자재 줄까지 펼친다. */
  const lines = useMemo(() => shown.flatMap((r) =>
    (r.materials.length === 0
      ? [{ key: `${r.id}`, r, m: null as Material | null }]
      : r.materials.map((m) => ({ key: `${r.id}-${m.itemId}`, r, m })))), [shown])

  const totalQty = shown.reduce((n, r) => n + r.producedQty, 0)

  return (
    <EcListShell
      title="생산입고현황"
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
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
      >
        <EcCond label="창고" pick>
          <select className="ec-input" value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)} style={{ width: 200 }}>
            <option value="">전체</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목" pick>
          <input className="ec-input" placeholder="품목코드·품명 일부" value={item}
                 onChange={(e) => setItem(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="담당자" pick>
          <input className="ec-input" placeholder="작성자 일부" value={worker}
                 onChange={(e) => setWorker(e.target.value)} style={{ width: 160 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        입고 전표 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{shown.length}</b>건
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        입고수량 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(totalQty)}</b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 140 }}>품목코드</th>
              <th>품목명</th>
              <th style={{ width: 100, textAlign: 'right' }}>건수</th>
              <th style={{ width: 130, textAlign: 'right' }}>입고수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byItem.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byItem.map((g, i) => (
              <tr key={g.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{g.code}</td>
                <td>{g.name}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>
                  {num(g.qty)} {g.unit}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계 ({byItem.length}품목)</td>
              <td style={{ textAlign: 'right' }}>{num(shown.length)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(totalQty)}</td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '라인별' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 180 }}>일자-No.</th>
              <th>생산품목</th>
              <th style={{ width: 110, textAlign: 'right' }}>입고수량</th>
              <th>소모자재</th>
              <th style={{ width: 110, textAlign: 'right' }}>소모수량</th>
              <th style={{ width: 130 }}>창고명</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : lines.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : lines.map((l, i) => (
              <tr key={l.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{l.r.productionDate} {l.r.prodNo}</td>
                <td>[{l.r.productCode}] {l.r.productName}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>
                  {num(l.r.producedQty)}
                </td>
                <td style={{ color: l.m ? undefined : '#9aa1ab' }}>
                  {l.m ? `[${l.m.itemCode}] ${l.m.itemName}` : '소모자재 없음'}
                </td>
                <td style={{ textAlign: 'right', color: '#a5561b' }}>{l.m ? num(l.m.quantity) : ''}</td>
                <td>{l.r.warehouseName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 180 }}>일자-No.</th>
              <th style={{ width: 150 }}>작업지시번호</th>
              <th>생산품목</th>
              <th style={{ width: 110, textAlign: 'right' }}>입고수량</th>
              <th style={{ width: 90, textAlign: 'right' }}>소모자재</th>
              <th style={{ width: 130 }}>창고명</th>
              <th style={{ width: 110 }}>담당자</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.productionDate} {r.prodNo}</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{r.workOrderNo}</td>
                <td>[{r.productCode}] {r.productName}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>
                  {num(r.producedQty)} {r.productUnit}
                </td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.materials.length}</td>
                <td>{r.warehouseName}</td>
                <td>{r.createdBy ?? ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(totalQty)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      )}
    </EcListShell>
  )
}

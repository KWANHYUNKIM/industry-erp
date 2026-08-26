import { Fragment, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'

/**
 * 생산 > 생산입고/소모현황 I (이카운트 E040415)
 *
 * 생산/외주현황 그룹에서 우리에게 없던 화면. 생산입고현황(완제품이 몇 개 들어왔나)과
 * 생산불출현황(자재가 얼마나 나갔나)은 따로 있었지만, <b>그 둘을 맞대어</b> 보는 판이 없었다.
 * "이 완제품 100개를 만드는 데 자재가 얼마나 들어갔나"는 두 화면을 번갈아 봐서는 안 나온다.
 *
 * 자료는 GET /api/productions 하나로 충분하다 — 생산실적이 <b>생산품과 소모자재를 같이</b>
 * 들고 있다(Production.materials).
 *
 * 구분:
 *   내역 — 생산 전표마다 입고 한 줄, 그 밑에 소모 자재 줄
 *   품목별 — 품목마다 입고합·소모합. 반제품은 <b>양쪽에 다 뜬다</b>(만들어서 다시 쓰는 것),
 *            그게 이 보기의 쓸모다
 *
 * <b>주의:</b> E040415 자체의 조건 판은 실측하지 못했다(원본 세션 접근 불가).
 * 같은 출력물 묶음에서 실측한 조건 모양(구분 · 일자 구간 기본 금월(~오늘) · 창고 · 품목)을
 * 따랐다. 원본을 다시 열면 대조할 것.
 */
interface ProductionMaterial {
  componentId: number
  componentCode: string
  componentName: string
  unit: string
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
  materials: ProductionMaterial[]
}

const num = (n: number) => n.toLocaleString()

export default function ProductionIssueStatusPage() {
  const [rows, setRows] = useState<Production[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [mode, setMode] = useState<'내역' | '품목별'>('내역')
  const init = periodOf('금월(~오늘)', new Date()) ?? { from: ymd(new Date()), to: ymd(new Date()) }
  const [cond, setCond] = useState({ from: init.from, to: init.to, warehouseId: '', item: '', orderNo: '' })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<Production[]>('/productions'),
      api.get<Warehouse[]>('/warehouses'),
    ])
      .then(([p, w]) => { setRows(p.data); setWarehouses(w.data) })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  /**
   * 품목 조건은 <b>생산품이든 소모자재든</b> 걸리면 잡는다.
   * 한쪽만 보면 "그 자재가 어디에 쓰였나"를 못 찾는다.
   */
  const hitItem = (p: Production) => !cond.item
    || p.productName.includes(cond.item) || p.productCode.includes(cond.item)
    || p.materials.some((m) => m.componentName.includes(cond.item) || m.componentCode.includes(cond.item))

  const shown = rows
    .filter((p) => !cond.from || p.productionDate >= cond.from)
    .filter((p) => !cond.to || p.productionDate <= cond.to)
    .filter((p) => !cond.warehouseId || String(p.warehouseId) === cond.warehouseId)
    .filter((p) => !cond.orderNo || p.workOrderNo.includes(cond.orderNo))
    .filter(hitItem)
    .sort((a, b) => (a.productionDate < b.productionDate ? 1 : -1))

  /** 품목별 — 같은 품목이 입고에도 소모에도 나올 수 있다(반제품). 양쪽을 한 줄에 둔다. */
  const byItem = useMemo(() => {
    const m = new Map<number, { itemId: number; code: string; name: string; unit: string; inQty: number; outQty: number; inCount: number; outCount: number }>()
    const at = (id: number, code: string, name: string, unit: string) => {
      const g = m.get(id) ?? { itemId: id, code, name, unit, inQty: 0, outQty: 0, inCount: 0, outCount: 0 }
      m.set(id, g)
      return g
    }
    shown.forEach((p) => {
      const g = at(p.productId, p.productCode, p.productName, p.productUnit)
      g.inQty += p.producedQty; g.inCount += 1
      p.materials.forEach((mt) => {
        const h = at(mt.componentId, mt.componentCode, mt.componentName, mt.unit)
        h.outQty += mt.quantity; h.outCount += 1
      })
    })
    return [...m.values()].sort((a, b) => (b.inQty + b.outQty) - (a.inQty + a.outQty))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cond])

  const totals = shown.reduce(
    (a, p) => ({
      inQty: a.inQty + p.producedQty,
      outQty: a.outQty + p.materials.reduce((n, m) => n + m.quantity, 0),
      lines: a.lines + 1 + p.materials.length,
    }),
    { inQty: 0, outQty: 0, lines: 0 },
  )

  const reset = () => {
    setMode('내역')
    setCond({ from: init.from, to: init.to, warehouseId: '', item: '', orderNo: '' })
  }

  return (
    <EcListShell
      title="생산입고/소모현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
        dateLabel="생산일자"
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {(['내역', '품목별'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <select className="ec-input" value={cond.warehouseId}
                  onChange={(e) => setC({ warehouseId: e.target.value })} style={{ width: 220 }}>
            <option value="">전체</option>
            {warehouses.map((w) => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목" pick>
          <input className="ec-input" placeholder="생산품·소모자재 어느 쪽이든" value={cond.item}
                 onChange={(e) => setC({ item: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="작업지시번호">
          <input className="ec-input" placeholder="WO-…" value={cond.orderNo}
                 onChange={(e) => setC({ orderNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {mode === '내역' ? '생산' : '품목'}{' '}
        <b style={{ color: '#3c4553' }}>{num(mode === '내역' ? shown.length : byItem.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        입고 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(totals.inQty)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        소모 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totals.outQty)}</b>
      </div>

      <div className="overflow-x-auto">
        {mode === '내역' ? (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '14%' }} /><col style={{ width: '10%' }} />
              <col style={{ width: '13%' }} /><col style={{ width: '13%' }} />
              <col style={{ width: '8%' }} /><col /><col style={{ width: '11%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>생산번호</th>
                <th>생산일자</th>
                <th>작업지시</th>
                <th>창고</th>
                <th style={{ textAlign: 'center' }}>구분</th>
                <th>품목</th>
                <th style={{ textAlign: 'right' }}>수량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((p, i) => (
                <Fragment key={p.id}>
                  <tr style={{ background: '#f2f6fc' }}>
                    <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.prodNo}</td>
                    <td>{p.productionDate.replace(/-/g, '/')}</td>
                    <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{p.workOrderNo}</td>
                    <td>{p.warehouseName}</td>
                    <td style={{ textAlign: 'center', color: 'var(--ec-blue)', fontWeight: 700 }}>입고</td>
                    <td style={{ fontWeight: 700 }}>
                      {p.productName} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{p.productCode}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ec-blue)' }}>
                      {num(p.producedQty)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{p.productUnit}</span>
                    </td>
                  </tr>
                  {p.materials.map((m) => (
                    <tr key={`${p.id}-${m.componentId}`}>
                      <td style={{ textAlign: 'center', background: '#f3f3f3' }}></td>
                      <td colSpan={4}></td>
                      <td style={{ textAlign: 'center', color: '#a5561b' }}>소모</td>
                      <td style={{ paddingLeft: 18, color: '#5a626e' }}>
                        └ {m.componentName} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{m.componentCode}</span>
                      </td>
                      <td style={{ textAlign: 'right', color: '#a5561b' }}>
                        {num(m.quantity)} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{m.unit}</span>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={7} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>
                    입고 {num(totals.inQty)} · 소모 {num(totals.outQty)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.lines)}줄</td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '5%' }} /><col style={{ width: '16%' }} /><col />
              <col style={{ width: '10%' }} /><col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>품목코드</th>
                <th>품목명</th>
                <th style={{ textAlign: 'right' }}>입고건수</th>
                <th style={{ textAlign: 'right' }}>입고수량</th>
                <th style={{ textAlign: 'right' }}>소모건수</th>
                <th style={{ textAlign: 'right' }}>소모수량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : byItem.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : byItem.map((g, i) => (
                // 입고와 소모가 둘 다 있는 품목 = 만들어서 다시 쓰는 반제품. 눈에 띄게 둔다.
                <tr key={g.itemId} style={g.inQty > 0 && g.outQty > 0 ? { background: '#f7f4ff' } : undefined}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.code}</td>
                  <td>
                    {g.name}
                    {g.inQty > 0 && g.outQty > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#6b4bb8' }}>반제품 · 만들어서 다시 씀</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.inCount || ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: g.inQty ? 'var(--ec-blue)' : '#c9ced6' }}>
                    {g.inQty ? num(g.inQty) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.outCount || ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: g.outQty ? '#a5561b' : '#c9ced6' }}>
                    {g.outQty ? num(g.outQty) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {byItem.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{num(totals.inQty)}</td>
                  <td style={{ background: '#f5f7fa' }}></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: '#a5561b' }}>{num(totals.outQty)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </EcListShell>
  )
}

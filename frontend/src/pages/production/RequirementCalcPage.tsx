import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { dateText } from '../../utils/dateText'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import EcDateField from '../../components/EcDateField'
import EcSlipShell from '../../components/EcSlipShell'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import type { Item, Warehouse, WorkOrder } from '../../types/api'

/**
 * 재고 I &gt; 생산/외주 &gt; BOM(소요량) &gt; <b>소요량계산</b>.
 *
 * <p>원본(2026-10-02 loginaa 실측): 머리 일자 · 창고 · BOM구분 · 구분(소요품목집계) · 대표품목기준환산, 격자 품목코드 ·
 * 품목명 · 규격 · 수량, 툴바 [작업지시서] 등, [계산(F8)] 을 누르면 '소요량' 보고서가 뜬다 —
 * <b>I. 생산품목</b>(품목코드 · 품목명 · BOM번호 · BOM버전 · 규격 · 단위 · 생산수량 · 합계)과
 * <b>II. 소모품목</b>(품목코드 · 품목명[규격] · 소요량 · 재고수량 · 거래처명 · 적요 · 합계).
 *
 * <p>저장하지 않는 계산 화면이다. BOM구분 [전체] 는 반제품을 끝까지 풀고 [1단계] 는 바로 아래만,
 * 구분 [소요품목집계] 는 같은 자재를 합치고 [품목별] 은 생산품목마다 나눠 보인다. 재고수량은 창고를 고르면 그 창고,
 * 안 고르면 전 창고 합이다. 거래처명은 자재의 주거래처다. 대표품목기준환산은 우리에게 대표품목 개념이 없어 없다.
 */

interface Line { key: number; itemId: string; qty: string; bomId: string }
interface Need { componentId: number; componentCode: string; componentName: string; componentSpec: string | null; unit: string; quantity: number }
let seq = 1
const blank = (): Line => ({ key: seq++, itemId: '', qty: '', bomId: '' })
const won = (n: number) => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 4 })

export default function RequirementCalcPage() {
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [partners, setPartners] = useState<{ id: number; name: string }[]>([])
  const [versions, setVersions] = useState<{ id: number; productId: number; versionName: string; defaultVersion: boolean }[]>([])
  const [date, setDate] = useState(ymd(new Date()))
  const [warehouseId, setWarehouseId] = useState('')
  const [level, setLevel] = useState<'ALL' | 'ONE'>('ALL')
  const [mode, setMode] = useState<'SUM' | 'BY_ITEM'>('SUM')
  const [lines, setLines] = useState<Line[]>(() => Array.from({ length: 3 }, blank))
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ prod: { line: Line; item: Item; bomNo: number; versionName: string }[]; needs: { owner: Item | null; rows: Need[] }[] } | null>(null)
  const [stock, setStock] = useState<{ itemId: number; warehouseId: number; quantity: number }[]>([])
  const [woOpen, setWoOpen] = useState(false)
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [picked, setPicked] = useState<number[]>([])
  /* 소모품목 표는 구분(집계·품목별)에 따라 묶음 줄이 끼어든다 — 렌더된 표를 직접 잰다. */
  const resultRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(resultRef, '소요량', [result])

  useEffect(() => {
    void Promise.all([
      api.get<Item[]>('/items').then((r) => setItems(r.data.filter((i) => i.active))),
      api.get<Warehouse[]>('/warehouses').then((r) => setWarehouses(r.data.filter((w) => w.active))),
      api.get<{ id: number; name: string }[]>('/partners').then((r) => setPartners(r.data)),
      api.get<typeof versions>('/boms', { params: { versions: 'all' } }).then((r) => setVersions(r.data)),
    ]).catch((e) => setError(extractErrorMessage(e)))
  }, [])

  const itemById = useMemo(() => new Map(items.map((i) => [String(i.id), i])), [items])
  const partnerName = (id: number | null | undefined) => (id == null ? '' : partners.find((p) => p.id === id)?.name ?? '')
  const itemPicks = useMemo(() => items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, sub: i.spec })), [items])

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => {
      const next = ls.map((l) => (l.key === key ? { ...l, ...patch, ...(patch.itemId !== undefined && patch.itemId !== l.itemId ? { bomId: '' } : {}) } : l))
      return next[next.length - 1].itemId ? [...next, blank()] : next
    })
  }

  async function openOrders() {
    try {
      const r = await api.get<WorkOrder[]>('/work-orders')
      setOrders(r.data.filter((o) => o.status !== 'COMPLETED' && Number(o.remainingQty) > 0)); setPicked([]); setWoOpen(true)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  function applyOrders() {
    const add = orders.filter((o) => picked.includes(o.id)).map((o) => ({ ...blank(), itemId: String(o.productId), qty: String(o.remainingQty) }))
    setLines((ls) => [...ls.filter((l) => l.itemId), ...add, blank()])
    setWoOpen(false)
  }

  async function calc(e: FormEvent) {
    e.preventDefault()
    setError('')
    const filled = lines.filter((l) => l.itemId && Number(l.qty) > 0)
    if (filled.length === 0) return setError('품목과 수량을 한 줄 이상 넣으세요.')
    try {
      const st = (await api.get<typeof stock>('/stock')).data
      setStock(st)
      const prod = filled.map((l) => {
        const vs = versions.filter((v) => String(v.productId) === l.itemId)
        const v = l.bomId ? vs.find((x) => String(x.id) === l.bomId) : vs.find((x) => x.defaultVersion)
        return { line: l, item: itemById.get(l.itemId)!, bomNo: v ? vs.indexOf(v) + 1 : 0, versionName: v?.versionName ?? '(BOM 없음)' }
      })
      const per: { owner: Item; rows: Need[] }[] = []
      for (const l of filled) {
        if (!versions.some((v) => String(v.productId) === l.itemId)) continue
        const r = await api.get<Need[]>('/productions/bom-preview', {
          params: { productId: l.itemId, qty: Number(l.qty), level, ...(l.bomId ? { bomId: l.bomId } : {}) },
        })
        per.push({ owner: itemById.get(l.itemId)!, rows: r.data })
      }
      let needs: { owner: Item | null; rows: Need[] }[]
      if (mode === 'SUM') {
        const m = new Map<number, Need>()
        per.forEach((p) => p.rows.forEach((n) => {
          const cur = m.get(n.componentId)
          m.set(n.componentId, cur ? { ...cur, quantity: Number(cur.quantity) + Number(n.quantity) } : { ...n, quantity: Number(n.quantity) })
        }))
        needs = [{ owner: null, rows: [...m.values()].sort((a, b) => a.componentCode.localeCompare(b.componentCode)) }]
      } else {
        needs = per
      }
      setResult({ prod, needs })
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const stockOf = (itemId: number) => stock
    .filter((s) => s.itemId === itemId && (!warehouseId || String(s.warehouseId) === warehouseId))
    .reduce((n, s) => n + Number(s.quantity), 0)

  return (
    <form onSubmit={calc} style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <EcSlipShell
        title="소요량계산"
        actions={[{ label: '계산(F8)', primary: true, submit: true }]}
        help={<p className="m-0">생산할 품목과 수량을 넣고 [계산(F8)]을 누르면 BOM 으로 소요량을 셉니다. 저장하지 않습니다.</p>}
      >
        <ul className="ec-form">
          <li><div className="title">일자</div><div className="form"><EcDateField value={date} onChange={setDate} /></div></li>
          <li>
            <div className="title">창고</div>
            <div className="form">
              <CodePickerField label="창고" hideLabel pair value={warehouseId} onChange={setWarehouseId}
                               items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.kind }))} />
            </div>
          </li>
          <li>
            <div className="title">BOM구분</div>
            <div className="form">
              <select className="ec-input" value={level} onChange={(e) => setLevel(e.target.value as 'ALL' | 'ONE')} style={{ width: 170 }}>
                <option value="ALL">전체</option>
                <option value="ONE">1단계</option>
              </select>
            </div>
          </li>
          <li>
            <div className="title">구분</div>
            <div className="form">
              <select className="ec-input" value={mode} onChange={(e) => setMode(e.target.value as 'SUM' | 'BY_ITEM')} style={{ width: 170 }}>
                <option value="SUM">소요품목집계</option>
                <option value="BY_ITEM">품목별</option>
              </select>
            </div>
          </li>
        </ul>

        <div className="ec-toolbar" style={{ marginTop: 10 }}>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openOrders()}>작업지시서</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setLines(Array.from({ length: 3 }, blank))}>선택삭제</button>
        </div>
        <table className="ec-grid-input no-ec" style={{ tableLayout: 'fixed', minWidth: 800 }}>
          <colgroup>
            <col className="w-[30px]" /><col className="w-[120px]" /><col className="w-[280px]" />
            <col className="w-[140px]" /><col className="w-[110px]" /><col className="w-[110px]" />
          </colgroup>
          <thead>
            <tr>
              <th />
              <th className="text-left">품목코드</th>
              <th className="text-left">품목명</th>
              <th className="text-left">규격</th>
              <th className="text-left">BOM버전</th>
              <th className="text-right">수량</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              const it = itemById.get(l.itemId)
              const vs = versions.filter((v) => String(v.productId) === l.itemId)
              return (
                <tr key={l.key}>
                  <td className="text-center bg-ec-stripe text-ec-hint">{idx + 1}</td>
                  <td className="pad text-ec-label">{it?.code ?? ''}</td>
                  <td className="pad">
                    <CodePickerField label="품목" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                     value={l.itemId} onChange={(v) => setLine(l.key, { itemId: v })} items={itemPicks} />
                  </td>
                  <td className="pad text-ec-label">{it?.spec ?? ''}</td>
                  <td>
                    {vs.length > 1 ? (
                      <select className="cell" value={l.bomId} onChange={(e) => setLine(l.key, { bomId: e.target.value })}>
                        {vs.map((v) => <option key={v.id} value={v.defaultVersion ? '' : String(v.id)}>{v.versionName}{v.defaultVersion ? '(기본)' : ''}</option>)}
                      </select>
                    ) : <span className="pad text-ec-hint text-[12px]">{vs[0]?.versionName ?? ''}</span>}
                  </td>
                  <td>
                    <input className="cell" type="number" step="any" style={{ textAlign: 'right' }} disabled={!l.itemId}
                           value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {error && <p className="ec-alert ec-alert-danger my-[8px] mx-0">{error}</p>}
      </EcSlipShell>

      <Modal open={result != null} title="소요량" error={error} width={900} onClose={() => setResult(null)}>
        {result && (
          <div ref={resultRef} className="max-h-[64vh] overflow-y-auto">
            <div className="font-bold my-[4px] mx-0">I. 생산품목</div>
            <table className="w-full text-left">
              <thead>
                <tr><th>품목코드</th><th>품목명</th><th>BOM번호</th><th>BOM버전</th><th>규격</th><th>단위</th><th className="text-right">생산수량</th></tr>
              </thead>
              <tbody>
                {result.prod.map((p) => (
                  <tr key={p.line.key}>
                    <td>{p.item.code}</td><td>{p.item.name}</td><td>{p.bomNo || ''}</td><td>{p.versionName}</td>
                    <td>{p.item.spec ?? ''}</td><td>{p.item.unit}</td><td className="text-right">{won(Number(p.line.qty))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="text-right font-bold">합계</td>
                  <td className="text-right font-bold">{won(result.prod.reduce((n, p) => n + Number(p.line.qty), 0))}</td>
                </tr>
              </tfoot>
            </table>
            <div className="font-bold mt-[12px] mx-0 mb-[4px]">II. 소모품목</div>
            <table className="w-full text-left">
              <thead>
                <tr><th>품목코드</th><th>품목명[규격]</th><th className="text-right">소요량</th><th className="text-right">재고수량</th><th>거래처명</th><th>적요</th></tr>
              </thead>
              <tbody>
                {result.needs.every((g) => g.rows.length === 0) ? (
                  <tr><td colSpan={6} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
                ) : result.needs.map((g, gi) => (
                  <Fragment key={gi}>
                    {g.owner && (
                      <tr><td colSpan={6} className="bg-ec-page font-bold">{g.owner.code} {g.owner.name}</td></tr>
                    )}
                    {g.rows.map((n) => {
                      const it = itemById.get(String(n.componentId))
                      const onHand = stockOf(n.componentId)
                      return (
                        <tr key={`${gi}-${n.componentId}`}>
                          <td>{n.componentCode}</td>
                          <td>{n.componentName}{n.componentSpec ? ` [${n.componentSpec}]` : ''}</td>
                          <td className="text-right">{won(Number(n.quantity))}</td>
                          <td style={{ textAlign: 'right', color: onHand < Number(n.quantity) ? 'var(--ec-danger)' : undefined }}>{won(onHand)}</td>
                          <td>{partnerName(it?.supplierId)}</td>
                          <td className="text-ec-danger text-[12px]">{onHand < Number(n.quantity) ? `부족 ${won(Number(n.quantity) - onHand)}` : ''}</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="text-right font-bold">합계</td>
                  <td className="text-right font-bold">{won(result.needs.reduce((n, g) => n + g.rows.reduce((m, r) => m + Number(r.quantity), 0), 0))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Modal>

      <Modal open={woOpen} title="작업지시서조회" error={error} width={820} onClose={() => setWoOpen(false)}>
        <div className="max-h-[50vh] overflow-y-auto">
          <table className="w-full text-left">
            <thead><tr><th className="w-[30px]" /><th>작업지시서일자</th><th>품목코드</th><th>품목명</th><th className="text-right">잔량</th></tr></thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="cursor-pointer" onClick={() => setPicked((p) => (p.includes(o.id) ? p.filter((x) => x !== o.id) : [...p, o.id]))}>
                  <td className="text-center"><input type="checkbox" readOnly checked={picked.includes(o.id)} /></td>
                  <td>{dateText(o.orderDate)} {o.orderNo}</td><td>{o.productCode}</td><td>{o.productName}</td>
                  <td className="text-right">{won(Number(o.remainingQty))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-[4px] mt-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={applyOrders}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setWoOpen(false)}>닫기</button>
        </div>
      </Modal>
    </form>
  )
}

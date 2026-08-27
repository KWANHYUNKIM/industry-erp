import { useRef, useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Production, ProductionMaterial, Warehouse, WorkOrder } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'
import { useShortcut } from '../../utils/useShortcut'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())
const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 84 }

/**
 * 생산관리 &gt; <b>생산입고 I(BOM기준소모)</b>.
 *
 * <p>원본 [생산입고]는 I·II·III 셋이고 <b>셋 다 입력 화면</b>이다.
 * I 은 소모품목을 고르지 않고 <b>BOM 대로 자동소모</b>하며 입고한다(II 는 골라서,
 * III 은 고르면서 품질검사요청까지).
 *
 * <p>우리 메뉴의 [생산입고 I(BOM기준소모)]은 오랫동안 <b>조회 화면</b>을 가리키고 있었고,
 * 정작 입력은 원본에 없는 이름인 [생산실적]에 있었다. I·II·III 이 같은 무리인데
 * 하나만 성격이 달라서, 사람은 셋이 같은 종류라고 읽고 I 에서 입력을 찾다가 못 찾는다.
 *
 * <p>원본 머리 실측(사본 '생산입고I-BOM기준소모'): 일자 · 담당자 · 생산된공장 ·
 * 받는창고 · 프로젝트. 격자는 불러온 전표일자/No. · 작업지시품목코드 · 생산품목코드 ·
 * 시리얼/로트No. · 생산품목명 · 규격 · BOM버전 · 수량 · 적요 · 노무시간.
 * BOM버전은 우리 BOM 이 품목당 하나라 없다 — 버전을 만들면 그때 붙인다.
 */

export default function ProductionResultPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [productions, setProductions] = useState<Production[]>([])
  const [preview, setPreview] = useState<ProductionMaterial[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [workOrderId, setWorkOrderId] = useState('')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(today())
  /** 적요 — 원본 생산입고현황의 마지막 열. 전표에 왜 이 입고를 했는지 남긴다. */
  const [note, setNote] = useState('')
  /**
   * 원본 생산입고 I·II 그리드의 <b>[노무시간]</b>(분).
   *
   * <p>실제 노무비를 잴 유일한 근거다. 이 값이 없으면 원가생성은 실제노무비를 표준과
   * 같게 깔아 둘 수밖에 없고, 그러면 차이분석이 늘 0 이다.
   * <b>안 적으면 null 이다</b> — 0(노무가 안 들었다)과 다르다.
   */
  const [laborMinutes, setLaborMinutes] = useState('')
  /** 귀속 프로젝트. 생산입고현황의 [프로젝트] 조건이 이 값을 본다. */
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  /**
   * 원본 생산입고 I 의 머리 항목 — [생산된공장] · [받는창고].
   *
   * 자재는 생산된공장에서 빠지고 완제품은 받는창고로 들어간다. 생산불출(창고 → 공장)의
   * 반대 방향이다. 비워 두면 작업지시의 창고 하나에서 오간다 — 공장을 안 쓰는 회사도 있다.
   */
  const [fromWarehouseId, setFromWarehouseId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  async function loadOrders() {
    const res = await api.get<WorkOrder[]>('/work-orders')
    setOrders(res.data)
  }
  async function loadWarehouses() {
    const res = await api.get<Warehouse[]>('/warehouses')
    setWarehouses(res.data.filter((w) => w.active))
  }
  async function loadProjects() {
    const res = await api.get<{ id: number; code: string; name: string }[]>('/projects')
    setProjects(res.data)
  }
  async function loadProductions() {
    const res = await api.get<Production[]>('/productions')
    setProductions(res.data)
  }

  useEffect(() => {
    loadOrders()
    loadWarehouses()
    loadProjects()
    loadProductions()
  }, [])

  // 소요자재 미리보기
  useEffect(() => {
    if (!workOrderId || !(Number(qty) > 0)) {
      setPreview([])
      return
    }
    let cancelled = false
    api
      .get<ProductionMaterial[]>(`/productions/preview?workOrderId=${workOrderId}&qty=${Number(qty)}`)
      .then((res) => { if (!cancelled) setPreview(res.data) })
      .catch(() => { if (!cancelled) setPreview([]) })
    return () => { cancelled = true }
  }, [workOrderId, qty])

  const selectable = orders.filter((o) => o.status !== 'COMPLETED' && o.remainingQty > 0)
  const selectedOrder = orders.find((o) => String(o.id) === workOrderId)
  // 비워 두면 작업지시의 창고를 쓴다 — 어디로 가는지 빈칸에 미리 적어 준다.
  const orderWarehouse = selectedOrder?.warehouseName ?? ''

  function reset() {
    setQty(''); setWorkOrderId(''); setPreview([]); setError(''); setOk('')
    setFromWarehouseId(''); setToWarehouseId(''); setNote(''); setProjectId('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setOk('')
    if (!workOrderId) return setError('작업지시를 선택하세요.')
    if (!(Number(qty) > 0)) return setError('생산수량을 입력하세요.')
    try {
      const res = await api.post<Production>('/productions', {
        workOrderId: Number(workOrderId),
        producedQty: Number(qty),
        productionDate: date,
        fromWarehouseId: fromWarehouseId ? Number(fromWarehouseId) : null,
        warehouseId: toWarehouseId ? Number(toWarehouseId) : null,
        note: note || null,
        laborMinutes: laborMinutes.trim() === '' ? null : Number(laborMinutes),
        projectId: projectId ? Number(projectId) : null,
      })
      setOk(`${res.data.prodNo} 생산 완료 · 완제품 ${won(res.data.producedQty)} 입고, 자재 ${res.data.materials.length}종 출고`)
      setQty('')
      setWorkOrderId('')
      setFromWarehouseId('')
      setToWarehouseId('')
      setNote('')
      setProjectId('')
      setPreview([])
      loadOrders()
      loadProductions()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const formRef = useRef<HTMLFormElement>(null)
  // 저장(F8) — 버튼 라벨이 약속한 단축키. submit 버튼을 실제로 눌러
  // form 의 검증·onSubmit 을 그대로 태운다(EcSlipShell 과 같은 방식).
  useShortcut('F8', () => formRef.current
    ?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click())

  return (
    <form ref={formRef} onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* ☆ 제목 + 상단 툴바 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>생산입고 I(BOM기준소모)</span>
        <span style={{ marginLeft: 10, fontSize: 11.5, color: '#8a929c' }}>생산 시 BOM 소요량만큼 자재 출고 + 완제품 입고(백플러시)</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
          <button type="button" className="ec-btn" onClick={reset}>초기화</button>
          <button type="button" className="ec-btn">도움말</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 등록 폼 */}
        <div style={{ width: 420, border: '1px solid var(--ec-border)', background: '#fff', padding: 14, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>생산입고 등록</div>
          <table className="w-full text-left" style={{ marginBottom: 10 }}>
            <tbody>
              <tr>
                <th style={th}>작업지시 *</th>
                <td>
                  <select className="ec-input" value={workOrderId} onChange={(e) => setWorkOrderId(e.target.value)} style={{ width: '100%' }}>
                    <option value="">선택하세요</option>
                    {selectable.map((o) => (
                      <option key={o.id} value={o.id}>{o.orderNo} · {o.productName} (잔여 {o.remainingQty})</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={th}>생산수량 *</th>
                <td>
                  <input type="number" step="any" className="ec-input" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 150, textAlign: 'right' }} />
                  {selectedOrder && <span style={{ marginLeft: 8, fontSize: 11.5, color: '#8a929c' }}>잔여 {won(selectedOrder.remainingQty)} {selectedOrder.productUnit}</span>}
                </td>
              </tr>
              <tr>
                <th style={th}>생산일자</th>
                <td><input type="date" className="ec-input" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>생산된공장</th>
                <td>
                  <select className="ec-input" value={fromWarehouseId}
                          onChange={(e) => setFromWarehouseId(e.target.value)} style={{ width: '100%' }}>
                    <option value="">{orderWarehouse ? `${orderWarehouse} (작업지시)` : '작업지시의 창고'}</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>[{w.kind}] {w.name}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: '#8a929c', marginTop: 2 }}>자재가 빠지는 곳</div>
                </td>
              </tr>
              <tr>
                <th style={th}>받는창고</th>
                <td>
                  <select className="ec-input" value={toWarehouseId}
                          onChange={(e) => setToWarehouseId(e.target.value)} style={{ width: '100%' }}>
                    <option value="">{orderWarehouse ? `${orderWarehouse} (작업지시)` : '작업지시의 창고'}</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>[{w.kind}] {w.name}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: '#8a929c', marginTop: 2 }}>완제품이 들어가는 곳</div>
                </td>
              </tr>
              <tr>
                <th style={th}>프로젝트</th>
                <td>
                  <select className="ec-input" value={projectId}
                          onChange={(e) => setProjectId(e.target.value)} style={{ width: '100%' }}>
                    <option value="">선택 안 함</option>
                    {projects.map((x) => <option key={x.id} value={x.id}>[{x.code}] {x.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                {/* 원본 그리드의 마지막 두 열 — 적요 · 노무시간. */}
                <th style={th}>적요</th>
                <td>
                  <input className="ec-input" value={note} onChange={(e) => setNote(e.target.value)}
                         style={{ width: '100%' }} />
                </td>
              </tr>
              <tr>
                <th style={th}>노무시간</th>
                <td>
                  <input className="ec-input" type="number" min={0} value={laborMinutes}
                         onChange={(e) => setLaborMinutes(e.target.value)}
                         placeholder="분" style={{ width: 120 }} />
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: '#8a929c' }}>
                    분 단위. 적어 두면 실제원가의 노무비를 <b>이 시간</b>으로 냅니다
                    (요율은 표준과 같습니다). 비워 두면 표준값을 씁니다.
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          {preview.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#5a626e', marginBottom: 4 }}>예상 소요자재</div>
              <table className="w-full text-left">
                <thead>
                  <tr><th>자재</th><th style={{ textAlign: 'right', width: 130 }}>소요량</th></tr>
                </thead>
                <tbody>
                  {preview.map((m) => (
                    <tr key={m.componentId}>
                      <td>[{m.componentCode}] {m.componentName}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#812d03' }}>-{won(m.quantity)} {m.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

          <button type="submit" className="ec-btn ec-btn-primary" style={{ width: '100%', height: 30 }}>생산 등록</button>
        </div>

        {/* 생산 이력 */}
        <div style={{ flex: 1, minWidth: 380 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-text)', marginBottom: 6 }}>최근 생산입고</div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>생산번호</th>
                <th>일자</th>
                <th>제품</th>
                <th style={{ textAlign: 'right' }}>생산량</th>
                <th>소요자재</th>
              </tr>
            </thead>
            <tbody>
              {productions.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>등록된 데이터가 없습니다.</td></tr>
              ) : productions.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace' }}>{p.prodNo}</td>
                  <td>{p.productionDate}</td>
                  <td>{p.productName}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c7c3c' }}>+{won(p.producedQty)} {p.productUnit}</td>
                  <td style={{ fontSize: 11.5, color: '#8a929c' }}>{p.materials.map((m) => `${m.componentName} ${won(m.quantity)}`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </form>
  )
}

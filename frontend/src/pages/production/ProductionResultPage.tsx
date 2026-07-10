import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Production, ProductionMaterial, WorkOrder } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)
const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 84 }

export default function ProductionResultPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [productions, setProductions] = useState<Production[]>([])
  const [preview, setPreview] = useState<ProductionMaterial[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [workOrderId, setWorkOrderId] = useState('')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(today())

  async function loadOrders() {
    const res = await api.get<WorkOrder[]>('/work-orders')
    setOrders(res.data)
  }
  async function loadProductions() {
    const res = await api.get<Production[]>('/productions')
    setProductions(res.data)
  }

  useEffect(() => {
    loadOrders()
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

  function reset() {
    setQty(''); setWorkOrderId(''); setPreview([]); setError(''); setOk('')
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
      })
      setOk(`${res.data.prodNo} 생산 완료 · 완제품 ${won(res.data.producedQty)} 입고, 자재 ${res.data.materials.length}종 출고`)
      setQty('')
      setWorkOrderId('')
      setPreview([])
      loadOrders()
      loadProductions()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* ☆ 제목 + 상단 툴바 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>생산입고(생산실적)</span>
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
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>생산실적 등록</div>
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
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-text)', marginBottom: 6 }}>최근 생산실적</div>
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
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>생산 이력이 없습니다.</td></tr>
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

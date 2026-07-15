import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

/** 생산관리 > 생산입고 II - 소모품목 선택 — 완제품 입고 시 소모자재 직접 선택 (백엔드 /api/productions 연동) */
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
  createdBy: string
  materials: ProductionMaterial[]
}
interface WorkOrder { id: number; orderNo: string; productName: string; remainingQty: number }
interface Item { id: number; code: string; name: string; unit: string }
interface MaterialLine { itemId: string; quantity: string }

interface FlatRow {
  key: string
  prodNo: string
  workOrderNo: string
  productName: string
  receiptQty: number
  productionDate: string
  materialName: string
  consumeQty: number | null
  warehouseName: string
}

const inputCls = 'ec-input w-full'
const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = { workOrderId: '', producedQty: '', productionDate: today() }

export default function ManualConsumeReceiptPage() {
  const [rows, setRows] = useState<Production[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [lines, setLines] = useState<MaterialLine[]>([])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Production[]>('/productions')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadRefs() {
    try {
      const [wo, it] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders'),
        api.get<Item[]>('/items'),
      ])
      setWorkOrders(wo.data)
      setItems(it.data)
    } catch {
      /* 참조 데이터 로딩 실패는 폼 사용에만 영향 */
    }
  }

  useEffect(() => { load(); loadRefs() }, [])

  /** BOM 예상 소요를 불러와 수동 소모 라인에 채움 */
  async function loadBomPreview() {
    if (form.workOrderId === '' || form.producedQty === '') {
      alert('작업지시와 입고수량을 먼저 입력하세요.')
      return
    }
    try {
      const res = await api.get<ProductionMaterial[]>('/productions/preview', {
        params: { workOrderId: Number(form.workOrderId), qty: Number(form.producedQty) },
      })
      setLines(res.data.map((m) => ({ itemId: String(m.componentId), quantity: String(m.quantity) })))
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  function updateLine(idx: number, patch: Partial<MaterialLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const materials = lines
      .filter((l) => l.itemId !== '' && l.quantity !== '')
      .map((l) => ({ componentId: Number(l.itemId), quantity: Number(l.quantity) }))
    try {
      await api.post('/productions', {
        workOrderId: Number(form.workOrderId),
        producedQty: form.producedQty === '' ? 0 : Number(form.producedQty),
        productionDate: form.productionDate || null,
        materials,
      })
      setForm(emptyForm)
      setLines([])
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const flat: FlatRow[] = rows.flatMap((p): FlatRow[] =>
    p.materials.length === 0
      ? [{
          key: `${p.id}`, prodNo: p.prodNo, workOrderNo: p.workOrderNo, productName: p.productName,
          receiptQty: p.producedQty, productionDate: p.productionDate,
          materialName: '-', consumeQty: null, warehouseName: p.warehouseName,
        }]
      : p.materials.map((m, i) => ({
          key: `${p.id}-${m.componentId}-${i}`, prodNo: p.prodNo, workOrderNo: p.workOrderNo, productName: p.productName,
          receiptQty: p.producedQty, productionDate: p.productionDate,
          materialName: `[${m.componentCode}] ${m.componentName}`, consumeQty: m.quantity, warehouseName: p.warehouseName,
        })),
  )

  const shown = flat.filter((r) => !keyword || r.productName.includes(keyword) || r.workOrderNo.includes(keyword) || r.materialName.includes(keyword))

  return (
    <EcListShell
      title="생산입고 II - 소모품목 선택"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <Modal open={showForm} title="생산입고 II - 소모품목 선택 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>생산입고 등록 (소모품목 직접 선택)</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업지시 *</label>
              <select className={inputCls} value={form.workOrderId} onChange={(e) => setForm({ ...form, workOrderId: e.target.value })}>
                <option value="">선택</option>
                {workOrders.map((w) => <option key={w.id} value={w.id}>{w.orderNo} ({w.productName}, 잔여 {w.remainingQty})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">입고수량 *</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.producedQty} onChange={(e) => setForm({ ...form, producedQty: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">생산일자</label>
              <input type="date" className={inputCls} value={form.productionDate} onChange={(e) => setForm({ ...form, productionDate: e.target.value })} />
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#3f4855' }}>소모자재 선택</span>
            <button type="button" className="ec-btn" onClick={() => setLines([...lines, { itemId: '', quantity: '' }])}>자재행 추가</button>
            <button type="button" className="ec-btn" onClick={loadBomPreview}>BOM 소요 불러오기</button>
            <span style={{ fontSize: 12, color: '#8a929c' }}>※ 자재를 선택하지 않으면 BOM대로 자동 소모됩니다.</span>
          </div>
          {lines.length > 0 && (
            <table className="w-full text-left" style={{ marginTop: 6 }}>
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th>소모자재</th>
                  <th style={{ width: 140, textAlign: 'right' }}>소모수량</th>
                  <th style={{ width: 60, textAlign: 'center' }}>삭제</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                    <td>
                      <select className={inputCls} value={l.itemId} onChange={(e) => updateLine(idx, { itemId: e.target.value })}>
                        <option value="">선택</option>
                        {items.map((i) => <option key={i.id} value={i.id}>{i.code} {i.name} ({i.unit})</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={l.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
          </div>
        </form>
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>생산번호</th>
            <th>작업지시번호</th>
            <th>완제품명</th>
            <th style={{ textAlign: 'right' }}>입고수량</th>
            <th>소모자재</th>
            <th style={{ textAlign: 'right' }}>소모수량</th>
            <th>창고</th>
            <th>생산일자</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>생산입고 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.prodNo}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo}</td>
              <td>{r.productName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.receiptQty.toLocaleString()}</td>
              <td>{r.materialName}</td>
              <td style={{ textAlign: 'right' }}>{r.consumeQty !== null ? r.consumeQty.toLocaleString() : '-'}</td>
              <td>{r.warehouseName}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.productionDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

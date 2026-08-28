import { useEffect, useState, type FormEvent } from 'react'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 생산관리 > 생산입고 II - 소모품목 선택 — 완제품 입고 시 소모자재 직접 선택 (백엔드 /api/productions 연동)
 *
 * {@code withQualityRequest} 를 켜면 이카운트 <b>생산입고 III(E040416)</b> 가 된다. 원본에서 III 가
 * II 와 다른 점은 소모품목 선택이 아니라(그건 II 와 같다) 입고와 동시에 <b>품질검사요청을 생성</b>하는 것이다.
 * 우리는 품질검사요청(QualityInspectionRequest)이 이미 있으므로, 입고 저장 뒤 그 품목·수량으로
 * 요청을 만들어 잇는다(POST /quality-inspection-requests). 요청번호는 등록 직후 알려준다.
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
  fromWarehouseId: number | null
  fromWarehouseName: string | null
  producedQty: number
  productionDate: string
  createdBy: string
  materials: ProductionMaterial[]
}
interface WorkOrder { id: number; orderNo: string; productName: string; remainingQty: number; warehouseName: string }
interface Warehouse { id: number; name: string; kind: string; active: boolean }
/** searchKeyword 는 원본 [검색창내용] — 코드도움이 이 값으로도 찾는다. */
interface Item { id: number; code: string; name: string; unit: string; searchKeyword: string | null }
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
  fromWarehouseName: string
  warehouseName: string
}

const inputCls = 'ec-input w-full'
const today = () => ymd(new Date())
/**
 * 원본 생산입고 II·III 의 머리 항목에 [생산된공장] · [받는창고] 가 있다.
 *
 * 자재는 생산된공장에서 빠지고 완제품은 받는창고로 들어간다 — 생산불출(창고 → 공장)의 반대다.
 * 비워 두면 작업지시의 창고 하나에서 오간다. 공장을 안 쓰는 회사도 있어 강제하지 않는다.
 */
const emptyForm = {
  workOrderId: '', producedQty: '', productionDate: today(),
  fromWarehouseId: '', toWarehouseId: '', note: '', projectId: '',
  /** 원본 생산입고 II·III 머리의 [담당자]. 전표 하나에 한 사람이다. */
  employeeId: '',
}

export default function ManualConsumeReceiptPage({ withQualityRequest = false }: { withQualityRequest?: boolean }) {
  const title = withQualityRequest ? '생산입고 III - 소모품목 선택(품질검사요청)' : '생산입고 II - 소모품목 선택'
  const [makeQr, setMakeQr] = useState(withQualityRequest)
  const [qrType, setQrType] = useState<'PROCESS' | 'INCOMING' | 'SHIPMENT'>('PROCESS')
  const [notice, setNotice] = useState('')
  const [rows, setRows] = useState<Production[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  /** 귀속 프로젝트. 생산입고현황의 [프로젝트] 조건이 이 값을 본다. */
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  /** 원본 머리의 [담당자] 후보. 전표에는 id 만 남고 이름은 화면이 붙인다. */
  const [employees, setEmployees] = useState<{ id: number; code: string; name: string }[]>([])
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
      const [wo, it, wh, pj, em] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ id: number; code: string; name: string }[]>('/projects'),
        api.get<{ id: number; code: string; name: string; active?: boolean }[]>('/employees'),
      ])
      setWorkOrders(wo.data)
      setItems(it.data)
      setWarehouses(wh.data.filter((w) => w.active))
      setProjects(pj.data)
      setEmployees(em.data.filter((e) => e.active !== false))
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
      const res = await api.post<Production>('/productions', {
        workOrderId: Number(form.workOrderId),
        producedQty: form.producedQty === '' ? 0 : Number(form.producedQty),
        productionDate: form.productionDate || null,
        fromWarehouseId: form.fromWarehouseId ? Number(form.fromWarehouseId) : null,
        warehouseId: form.toWarehouseId ? Number(form.toWarehouseId) : null,
        note: form.note || null,
        projectId: form.projectId ? Number(form.projectId) : null,
        employeeId: form.employeeId ? Number(form.employeeId) : null,
        materials,
      })
      let msg = `생산입고 ${res.data.prodNo} 등록`
      // 생산입고 III: 입고한 완제품·수량 그대로 품질검사요청을 만든다.
      // 요청 생성이 실패해도 입고는 이미 끝난 일이라 되돌리지 않고 사유만 알린다.
      if (withQualityRequest && makeQr) {
        try {
          const qr = await api.post<{ requestNo: string }>('/quality-inspection-requests', {
            requestDate: form.productionDate || today(),
            type: qrType,
            itemId: res.data.productId,
            requestQty: res.data.producedQty,
            requester: res.data.createdBy,
            remark: `생산입고 ${res.data.prodNo} 연계`,
          })
          msg += ` · 품질검사요청 ${qr.data.requestNo} 생성`
        } catch (qrErr) {
          msg += ` (품질검사요청 생성 실패: ${extractErrorMessage(qrErr)})`
        }
      }
      setNotice(msg)
      window.setTimeout(() => setNotice(''), 4000)
      setForm(emptyForm)
      setLines([])
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  // 비워 두면 작업지시의 창고를 쓴다 — 어디로 가는지 빈칸에 미리 적어 준다.
  const formWarehouse = workOrders.find((w) => String(w.id) === form.workOrderId)?.warehouseName ?? ''

  const flat: FlatRow[] = rows.flatMap((p): FlatRow[] =>
    p.materials.length === 0
      ? [{
          key: `${p.id}`, prodNo: p.prodNo, workOrderNo: p.workOrderNo, productName: p.productName,
          receiptQty: p.producedQty, productionDate: p.productionDate,
          materialName: '-', consumeQty: null,
          fromWarehouseName: p.fromWarehouseName ?? p.warehouseName, warehouseName: p.warehouseName,
        }]
      : p.materials.map((m, i) => ({
          key: `${p.id}-${m.componentId}-${i}`, prodNo: p.prodNo, workOrderNo: p.workOrderNo, productName: p.productName,
          receiptQty: p.producedQty, productionDate: p.productionDate,
          materialName: `[${m.componentCode}] ${m.componentName}`, consumeQty: m.quantity,
          fromWarehouseName: p.fromWarehouseName ?? p.warehouseName, warehouseName: p.warehouseName,
        })),
  )

  const shown = flat.filter((r) => !keyword || r.productName.includes(keyword) || r.workOrderNo.includes(keyword) || r.materialName.includes(keyword))

  return (
    <EcListShell
      title={title}
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <p style={{ background: '#eaf4ea', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{notice}</p>}

      <Modal open={showForm} title={`${title} 등록`} onClose={() => setShowForm(false)}>{(
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
              <label className="mb-1 block text-sm text-slate-600">일자</label>
              <input type="date" className={inputCls} value={form.productionDate} onChange={(e) => setForm({ ...form, productionDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">담당자</label>
              <select className={inputCls} value={form.employeeId}
                      onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">선택 안 함</option>
                {employees.map((x) => <option key={x.id} value={x.id}>[{x.code}] {x.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">생산된공장</label>
              <select className={inputCls} value={form.fromWarehouseId}
                      onChange={(e) => setForm({ ...form, fromWarehouseId: e.target.value })}>
                <option value="">{formWarehouse ? `${formWarehouse} (작업지시)` : '작업지시의 창고'}</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.kind}] {w.name}</option>)}
              </select>
              <span style={{ fontSize: 11, color: '#8a929c' }}>자재가 빠지는 곳</span>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">받는창고</label>
              <select className={inputCls} value={form.toWarehouseId}
                      onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })}>
                <option value="">{formWarehouse ? `${formWarehouse} (작업지시)` : '작업지시의 창고'}</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.kind}] {w.name}</option>)}
              </select>
              <span style={{ fontSize: 11, color: '#8a929c' }}>완제품이 들어가는 곳</span>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">프로젝트</label>
              <select className={inputCls} value={form.projectId}
                      onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">선택 안 함</option>
                {projects.map((x) => <option key={x.id} value={x.id}>[{x.code}] {x.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-slate-600">적요</label>
              <input className={inputCls} value={form.note} placeholder="원본 그리드의 마지막 열"
                     onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>

          {withQualityRequest && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, background: '#f7f9fb', border: '1px solid var(--ec-border)', padding: '8px 10px' }}>
              <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={makeQr} onChange={(e) => setMakeQr(e.target.checked)} />
                품질검사요청 생성
              </label>
              <select className="ec-input" value={qrType} disabled={!makeQr}
                      onChange={(e) => setQrType(e.target.value as typeof qrType)} style={{ width: 130 }}>
                <option value="PROCESS">공정검사</option>
                <option value="INCOMING">수입검사</option>
                <option value="SHIPMENT">출하검사</option>
              </select>
              <span style={{ fontSize: 12, color: '#8a929c' }}>※ 입고한 완제품·수량으로 검사요청이 생성됩니다(품질관리 &gt; 품질검사요청).</span>
            </div>
          )}

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
                      <CodePickerField label="소모자재" hideLabel fill emptyLabel="선택 해제"
                                       value={l.itemId} onChange={(v) => updateLine(idx, { itemId: v })}
                                       items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.unit }))} />
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
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0).toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
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
            <th>생산된공장</th>
            <th>받는창고</th>
            <th>생산일자</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.prodNo}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo}</td>
              <td>{r.productName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.receiptQty.toLocaleString()}</td>
              <td>{r.materialName}</td>
              <td style={{ textAlign: 'right' }}>{r.consumeQty !== null ? r.consumeQty.toLocaleString() : '-'}</td>
              <td>{r.fromWarehouseName}</td>
              <td>{r.warehouseName}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.productionDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

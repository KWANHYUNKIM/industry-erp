import { useEffect, useState, type FormEvent } from 'react'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import { printDocuments } from '../../utils/printDocument'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'

/** 생산관리 > 생산불출 — 자재 불출 등록/삭제 (백엔드 /api/material-issues 연동) */
interface MaterialIssue {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number | null
  warehouseName: string | null
  toWarehouseId: number | null
  toWarehouseName: string | null
  workOrderId: number | null
  workOrderNo: string | null
  /**
   * 작업지시가 가리키는 생산품목. 원본 생산불출입력 머리의 [생산품목] 이고
   * 그리드의 [작업지시품목코드] 이기도 하다. 작업지시 없이 낸 불출이면 null.
   */
  productCode: string | null
  productName: string | null
  /**
   * 담당자(사원) id. <b>이름은 여기 없다</b> — production 은 hr 을 참조할 수 없어
   * 서버가 붙이지 못한다(hr → accounting → production 이 이미 있어 순환).
   */
  employeeId: number | null
  qty: number
  issueDate: string
  note: string | null
}
/** searchKeyword 는 원본 [검색창내용] — 코드도움이 이 값으로도 찾는다. */
interface Item { id: number; code: string; name: string; unit: string; searchKeyword: string | null }
/** 구분(창고·공장·외주)까지 받는다 — 받는 쪽은 대개 공장이라 앞에 세운다. */
interface Warehouse { id: number; name: string; kind: string }
interface WorkOrder { id: number; orderNo: string; productName: string }
interface EmployeeLite { id: number; code: string; name: string }

const inputCls = 'ec-input w-full'
const today = () => ymd(new Date())
/**
 * 원본 생산불출입력 머리 실측(사본): 일자 · <b>담당자</b> · 보내는창고 · 받는공장 ·
 * <b>생산품목</b>. 생산불출현황 조건에도 [담당자] 가 있다 — 세 화면에서 나온 항목이다.
 *
 * <p>담당자가 없어 "누가 낸 불출인지" 를 적을 자리도, 그걸로 거를 자리도 없었다.
 * 생산품목은 작업지시를 고르면 따라온다 — 원본처럼 따로 고르게 하면 둘이 어긋날 수 있다.
 */
const emptyForm = {
  itemId: '', warehouseId: '', toWarehouseId: '', workOrderId: '',
  employeeId: '', qty: '', issueDate: today(), note: '',
}

export default function IssuePage() {
  const [rows, setRows] = useState<MaterialIssue[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  /** 담당자 이름은 서버가 못 붙여서 화면이 붙인다. */
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<MaterialIssue[]>('/material-issues')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadRefs() {
    try {
      const [it, wh, wo, emp] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<WorkOrder[]>('/work-orders'),
        api.get<EmployeeLite[]>('/employees'),
      ])
      setItems(it.data)
      setWarehouses(wh.data)
      setWorkOrders(wo.data)
      setEmployees(emp.data)
    } catch {
      /* 참조 데이터 로딩 실패는 폼 사용에만 영향 */
    }
  }

  useEffect(() => { load(); loadRefs() }, [])

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다 — 지워진 사원이면 '-'. */
  const empName = (id: number | null) =>
    id == null ? '-' : (employees.find((x) => x.id === id)?.name ?? '-')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/material-issues', {
        itemId: Number(form.itemId),
        warehouseId: form.warehouseId === '' ? null : Number(form.warehouseId),
        toWarehouseId: form.toWarehouseId === '' ? null : Number(form.toWarehouseId),
        workOrderId: form.workOrderId === '' ? null : Number(form.workOrderId),
        qty: form.qty === '' ? 0 : Number(form.qty),
        issueDate: form.issueDate || null,
        employeeId: form.employeeId === '' ? null : Number(form.employeeId),
        note: form.note,
      })
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /**
   * 원본 생산불출조회 격자의 마지막 열 <b>[인쇄]</b> — 그 한 건을 불출증으로 찍는다.
   *
   * <p>금액 칸은 안 그린다. 불출은 사내 이동이라 금액이 없다 — 0 으로 채워 그리면
   * "0원짜리 거래" 로 읽힌다. 공급자/공급받는자 칸도 없다(거래 상대가 없다).
   */
  async function printOne(r: MaterialIssue) {
    await printDocuments([{
      title: '생산불출증',
      docNo: r.workOrderNo ? `${r.issueDate} / ${r.workOrderNo}` : r.issueDate,
      docDate: r.issueDate,
      hideAmounts: true,
      hideParties: true,
      supplier: { label: '', name: '' },
      customer: { label: '', name: '' },
      extra: [
        { label: '보내는창고', value: r.warehouseName },
        { label: '받는공장', value: r.toWarehouseName },
        { label: '담당자', value: r.employeeId ? empName(r.employeeId) : null },
        { label: '생산품목', value: r.productName },
      ],
      remark: r.note,
      lines: [{
        itemCode: r.itemCode, itemName: r.itemName, unit: r.unit,
        quantity: r.qty, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
      }],
    }])
  }

  async function remove(r: MaterialIssue) {
    if (!confirm(`'${r.itemName}' 불출내역을 삭제할까요?`)) return
    try {
      await api.delete(`/material-issues/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.itemName.includes(keyword) || (r.workOrderNo ?? '').includes(keyword))

  return (
    <EcListShell
      title="생산불출"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => setShowForm(true)}
      actions={[{ label: '검색(F8)', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <Modal open={showForm} title="생산불출 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 불출 등록</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">자재 *</label>
              <CodePickerField label="자재" hideLabel fill placeholder="선택" emptyLabel="선택 해제"
                               value={form.itemId} onChange={(v) => setForm({ ...form, itemId: v })}
                               items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.unit }))} />
            </div>
            {/* 원본은 [보내는창고] → [받는공장] 으로 옮기는 전표다. 재고가 그만큼 실제로 움직인다. */}
            <div>
              <label className="mb-1 block text-sm text-slate-600">담당자</label>
              <select className={inputCls} value={form.employeeId}
                      onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">선택 안 함</option>
                {employees.map((x) => <option key={x.id} value={x.id}>[{x.code}] {x.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">보내는창고</label>
              <select className={inputCls} value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                <option value="">선택</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">받는공장</label>
              <select className={inputCls} value={form.toWarehouseId} onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })}>
                <option value="">선택</option>
                {/* 구분이 공장인 창고를 앞에 둔다 — 받는 쪽은 대개 공장이다. */}
                {[...warehouses].sort((a, b) => (a.kind === '공장' ? -1 : 1) - (b.kind === '공장' ? -1 : 1))
                  .filter((w) => String(w.id) !== form.warehouseId)
                  .map((w) => <option key={w.id} value={w.id}>{w.name}{w.kind !== '창고' ? ` (${w.kind})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업지시</label>
              <select className={inputCls} value={form.workOrderId} onChange={(e) => setForm({ ...form, workOrderId: e.target.value })}>
                <option value="">선택</option>
                {workOrders.map((w) => <option key={w.id} value={w.id}>{w.orderNo} ({w.productName})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">불출수량 *</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">불출일자</label>
              <input type="date" className={inputCls} value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">비고</label>
              <input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
          </div>
        </form>
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th>
            <th style={{ width: 90 }}>담당자</th>
            <th>작업지시번호</th>
            <th>생산품목</th>
            <th style={{ width: 120 }}>품목코드</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th>단위</th>
            <th>보내는창고</th>
            <th>받는공장</th>
            <th>적요</th>
            {/* 원본 생산불출조회의 마지막 열 [인쇄] — 그 한 건을 불출증으로 찍는다. */}
            <th style={{ width: 60, textAlign: 'center' }}>인쇄</th>
            <th style={{ width: 60, textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 불출내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.issueDate}</td>
              <td style={{ color: r.employeeId ? undefined : '#c9ced6' }}>{empName(r.employeeId)}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo ?? '-'}</td>
              <td style={{ color: r.productName ? undefined : '#c9ced6' }}>
                {r.productName ? `[${r.productCode}] ${r.productName}` : '-'}
              </td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td>{r.unit}</td>
              <td>{r.warehouseName ?? '-'}</td>
              <td style={{ color: r.toWarehouseName ? undefined : '#c9ced6' }}>{r.toWarehouseName ?? '-'}</td>
              <td>{r.note ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => printOne(r)} style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={7} style={{ textAlign: 'right', fontWeight: 700 }}>합계</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>
                {shown.reduce((a, r) => a + r.qty, 0).toLocaleString()}
              </td>
              <td colSpan={6}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

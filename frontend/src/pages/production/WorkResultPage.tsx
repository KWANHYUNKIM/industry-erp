import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import type { Item } from '../../api/types'

/**
 * 생산관리 > 작업 > 작업내역입력 (/api/work-results).
 *
 * <p>원본 머리 실측(사본): 일자 · <b>생산공장</b> · 담당자 · 생산품목.
 * 그리드는 생산품목코드/명 · 작업품목코드/명 · 수량 · 투입자원 · 작업시간 · <b>적요</b>.
 *
 * <p>생산품목은 우리 쪽이 작업지시에 묶여 있어 지시를 고르면 따라온다.
 * 생산공장과 적요가 빠져 있었다 — 적요는 서버가 이미 받고 있었는데 폼에 칸이 없어
 * 늘 비어 나갔다.
 */
interface WorkResult {
  id: number
  workOrderId: number | null
  workOrderNo: string | null
  process: string
  warehouseId: number | null
  warehouseName: string | null
  productCode: string | null
  productName: string | null
  /** 원본 그리드의 [작업품목] — 이 작업이 다루는 품목. 생산품목과 다르다. */
  workItemId: number | null
  workItemCode: string | null
  workItemName: string | null
  workItemSpec: string | null
  resourceId: number | null
  resourceName: string | null
  worker: string | null
  goodQty: number
  defectQty: number
  workTimeMin: number
  workDate: string
  note: string | null
}
interface WorkOrder { id: number; orderNo: string; productName: string }
interface Process { id: number; name: string }
interface Warehouse { id: number; name: string; kind: string; active: boolean }
interface Project { id: number; code: string; name: string }

const inputCls = 'ec-input w-full'
const today = () => ymd(new Date())
const emptyForm = {
  workOrderId: '', process: '', workItemId: '', warehouseId: '', resourceId: '', worker: '',
  goodQty: '', defectQty: '', workTimeMin: '', workDate: today(), note: '',
  /** 원본 작업내역입력 머리의 [프로젝트]. 안 정할 수 있다. */
  projectId: '',
}

export default function WorkResultPage() {
  const [rows, setRows] = useState<WorkResult[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  /** 원본 그리드의 [작업품목] 후보. */
  const [items, setItems] = useState<Item[]>([])
  /** 원본 그리드의 [투입자원]. 자원등록의 [대상작업]과 짝이다. */
  const [resources, setResources] = useState<{ id: number; code: string; name: string; processId: number | null; processName: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<WorkResult[]>('/work-results')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadRefs() {
    try {
      const [wo, pr, rs, wh, it, pj] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders'),
        api.get<Process[]>('/processes'),
        api.get<{ id: number; code: string; name: string; processId: number | null; processName: string | null }[]>('/resources'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<Item[]>('/items'),
        api.get<Project[]>('/projects'),
      ])
      setWorkOrders(wo.data)
      setProcesses(pr.data)
      setResources(rs.data)
      setWarehouses(wh.data.filter((w) => w.active))
      // 사용중지된 품목은 새로 고를 수 없다 — 서버도 거절한다.
      setItems(it.data.filter((x) => x.active))
      setProjects(pj.data)
    } catch {
      /* 참조 로딩 실패는 폼 사용에만 영향 */
    }
  }

  useEffect(() => { load(); loadRefs() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/work-results', {
        workOrderId: form.workOrderId === '' ? null : Number(form.workOrderId),
        process: form.process,
        workItemId: form.workItemId === '' ? null : Number(form.workItemId),
        warehouseId: form.warehouseId === '' ? null : Number(form.warehouseId),
        resourceId: form.resourceId === '' ? null : Number(form.resourceId),
        worker: form.worker,
        goodQty: form.goodQty === '' ? 0 : Number(form.goodQty),
        defectQty: form.defectQty === '' ? 0 : Number(form.defectQty),
        workTimeMin: form.workTimeMin === '' ? 0 : Number(form.workTimeMin),
        workDate: form.workDate || null,
        projectId: form.projectId === '' ? null : Number(form.projectId),
        note: form.note || null,
      })
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(r: WorkResult) {
    if (!confirm(`'${r.process}' 작업내역을 삭제할까요?`)) return
    try {
      await api.delete(`/work-results/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || (r.workOrderNo ?? '').includes(keyword) || r.process.includes(keyword))

  return (
    <EcListShell
      title="작업내역입력"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <Modal open={showForm} title="작업내역입력" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 작업내역 등록</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업지시</label>
              <select className={inputCls} value={form.workOrderId} onChange={(e) => setForm({ ...form, workOrderId: e.target.value })}>
                <option value="">선택</option>
                {workOrders.map((w) => <option key={w.id} value={w.id}>{w.orderNo} ({w.productName})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">공정 *</label>
              <input className={inputCls} list="wr-process-list" value={form.process} onChange={(e) => setForm({ ...form, process: e.target.value })} placeholder="조립" />
              <datalist id="wr-process-list">
                {processes.map((p) => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>
            {/*
              원본 그리드의 [작업품목]. 생산품목(작업지시가 가리키는 최종 품목)과 다르다 —
              AQD 를 만드는 지시 안에서 이 작업은 'AQD 몸체' 를 다니는 식이다.
              예전에는 이 자리에 공정명을 대신 넣어 조회 화면에 '작업품목(공정)' 이라고
              적어 두고 있었다. 품목별로 작업량을 셀 수가 없었다.
            */}
            <div>
              <CodePickerField
                label="작업품목" placeholder="작업품목 선택" emptyLabel="선택 해제"
                value={form.workItemId} onChange={(v) => setForm({ ...form, workItemId: v })}
                items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec ?? undefined }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">생산공장</label>
              <select className={inputCls} value={form.warehouseId}
                      onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                <option value="">선택 안 함</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.kind}] {w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">투입자원</label>
              {/* 대상작업이 정해진 자원은 그 공정에서만 쓸 수 있다. 지금 고른 공정에 맞는 것만 낸다. */}
              <select className={inputCls} value={form.resourceId}
                      onChange={(e) => setForm({ ...form, resourceId: e.target.value })}>
                <option value="">선택 안 함</option>
                {resources
                  .filter((r) => !r.processName || !form.process || r.processName === form.process)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.processName ? ` (${r.processName})` : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업자</label>
              <input className={inputCls} value={form.worker} onChange={(e) => setForm({ ...form, worker: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업일자</label>
              <input type="date" className={inputCls} value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">양품</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.goodQty} onChange={(e) => setForm({ ...form, goodQty: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">불량</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.defectQty} onChange={(e) => setForm({ ...form, defectQty: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업시간(분)</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.workTimeMin} onChange={(e) => setForm({ ...form, workTimeMin: e.target.value })} />
            </div>
            <div>
              {/* 원본 작업내역입력 머리의 [프로젝트]. 프로젝트별 집계에 이 작업이 잡힌다. */}
              <label className="mb-1 block text-sm text-slate-600">프로젝트</label>
              <CodePickerField label="프로젝트" hideLabel fill placeholder="선택" emptyLabel="선택 해제"
                               value={form.projectId} onChange={(v) => setForm({ ...form, projectId: v })}
                               items={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-slate-600">적요</label>
              <input className={inputCls} value={form.note} placeholder="원본 그리드의 마지막 열"
                     onChange={(e) => setForm({ ...form, note: e.target.value })} />
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
            <th>작업지시번호</th>
            <th>공정</th>
            <th>생산공장</th>
            <th>생산품목명</th>
            <th>투입자원</th>
            <th>작업자</th>
            <th style={{ textAlign: 'right' }}>양품</th>
            <th style={{ textAlign: 'right' }}>불량</th>
            <th style={{ textAlign: 'right' }}>작업시간(분)</th>
            <th>적요</th>
            <th style={{ width: 60, textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 작업내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo ?? '-'}</td>
              <td>{r.process}</td>
              <td style={{ color: r.warehouseName ? undefined : '#c9ced6' }}>{r.warehouseName ?? '-'}</td>
              <td>{r.productName ?? ''}</td>
              <td style={{ color: r.resourceName ? undefined : '#c9ced6' }}>{r.resourceName ?? '-'}</td>
              <td>{r.worker ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.goodQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.defectQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.workTimeMin.toLocaleString()}</td>
              <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={8} style={{ textAlign: 'right', fontWeight: 700 }}>합계</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{shown.reduce((a, r) => a + r.goodQty, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{shown.reduce((a, r) => a + r.defectQty, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{shown.reduce((a, r) => a + r.workTimeMin, 0).toLocaleString()}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

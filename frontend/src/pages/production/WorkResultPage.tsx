import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

/** 생산관리 > 작업내역입력 — 공정별 작업 실적 등록/삭제 (백엔드 /api/work-results 연동) */
interface WorkResult {
  id: number
  workOrderId: number | null
  workOrderNo: string | null
  process: string
  worker: string | null
  goodQty: number
  defectQty: number
  workTimeMin: number
  workDate: string
  note: string | null
}
interface WorkOrder { id: number; orderNo: string; productName: string }
interface Process { id: number; name: string }

const inputCls = 'ec-input w-full'
const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = { workOrderId: '', process: '', worker: '', goodQty: '', defectQty: '', workTimeMin: '', workDate: today() }

export default function WorkResultPage() {
  const [rows, setRows] = useState<WorkResult[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
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
      const [wo, pr] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders'),
        api.get<Process[]>('/processes'),
      ])
      setWorkOrders(wo.data)
      setProcesses(pr.data)
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
        worker: form.worker,
        goodQty: form.goodQty === '' ? 0 : Number(form.goodQty),
        defectQty: form.defectQty === '' ? 0 : Number(form.defectQty),
        workTimeMin: form.workTimeMin === '' ? 0 : Number(form.workTimeMin),
        workDate: form.workDate || null,
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
            <th>작업자</th>
            <th style={{ textAlign: 'right' }}>양품</th>
            <th style={{ textAlign: 'right' }}>불량</th>
            <th style={{ textAlign: 'right' }}>작업시간(분)</th>
            <th style={{ width: 60, textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 작업내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo ?? '-'}</td>
              <td>{r.process}</td>
              <td>{r.worker ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.goodQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.defectQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.workTimeMin.toLocaleString()}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

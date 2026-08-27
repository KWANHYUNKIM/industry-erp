import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import ProcessOperationModal from './ProcessOperationModal'

/** 생산관리 > 공정등록 — 생산 공정 마스터 (백엔드 /api/processes 연동) */
interface ProductionProcess {
  id: number
  code: string
  name: string
  workcenter: string | null
  stdTimeMin: number
  costPerHr: number
  /** 순번. 원본 공정등록의 [순번] 열 — 공정을 고르는 자리마다 이 순서로 나온다. */
  sortOrder: number
  active: boolean
}

const inputCls = 'ec-input w-full'
const emptyForm = { code: '', name: '', workcenter: '', stdTimeMin: '', costPerHr: '', sortOrder: '0' }

export default function ProcessPage() {
  const [rows, setRows] = useState<ProductionProcess[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  /** 원본 공정등록의 [작업코드등록] — 별도 메뉴가 아니라 이 화면에서 연다. */
  const [opOpen, setOpOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<ProductionProcess[]>('/processes')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/processes', {
        sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
        code: form.code,
        name: form.name,
        workcenter: form.workcenter,
        stdTimeMin: form.stdTimeMin === '' ? 0 : Number(form.stdTimeMin),
        costPerHr: form.costPerHr === '' ? 0 : Number(form.costPerHr),
      })
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /**
   * 원본 [사용중단/재사용]. 지우지 않고 내린다 — 지난 작업·경비가 이 공정을 물고 있어서
   * 지우면 그 자료의 근거가 사라진다. 내려 두면 새로 고를 수만 없다.
   */
  async function toggleActive(r: ProductionProcess) {
    try {
      await api.put(`/processes/${r.id}`, {
        code: r.code, name: r.name, workcenter: r.workcenter,
        stdTimeMin: r.stdTimeMin, costPerHr: r.costPerHr, sortOrder: r.sortOrder,
        active: !r.active,
      })
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function remove(p: ProductionProcess) {
    if (!confirm(`공정 '${p.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/processes/${p.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.includes(keyword))
  const total = useMemo(() => shown.reduce((s, r) => s + (r.stdTimeMin ?? 0), 0), [shown])

  return (
    <EcListShell
      title="공정등록"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => setShowForm(true)}
      actions={[{ label: '작업코드등록', onClick: () => setOpOpen(true) }, { label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <Modal open={showForm} title="공정등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 공정 등록</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div>
              <label className="mb-1 block text-sm text-slate-600">생산공정코드 *</label>
              <input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PRC-060" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">생산공정명 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업장</label>
              <input className={inputCls} value={form.workcenter} onChange={(e) => setForm({ ...form, workcenter: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">표준시간(분)</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.stdTimeMin} onChange={(e) => setForm({ ...form, stdTimeMin: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">순번</label>
              <input type="number" className={inputCls} style={{ textAlign: 'right' }} value={form.sortOrder}
                     onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              <p style={{ fontSize: 11.5, color: '#8a929c', marginTop: 3 }}>
                공정을 고르는 자리마다 이 순서로 나옵니다.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">시간당비용</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.costPerHr} onChange={(e) => setForm({ ...form, costPerHr: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
          </div>
        </form>
      )}</Modal>

      {opOpen && (
        <ProcessOperationModal
          processes={rows.map((r) => ({ id: r.id, code: r.code, name: r.name, sortOrder: r.sortOrder, active: r.active }))}
          onClose={() => setOpOpen(false)}
        />
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 60 }}>순번</th>
            <th>생산공정코드</th>
            <th>생산공정명</th>
            <th>작업장</th>
            <th style={{ textAlign: 'right' }}>표준시간(분)</th>
            <th style={{ textAlign: 'right' }}>시간당비용</th>
            <th style={{ width: 110, textAlign: 'center' }}>사용</th>
            <th style={{ width: 60, textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 공정이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ color: '#5a626e' }}>{r.sortOrder}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td>{r.name}</td>
              <td>{r.workcenter ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.stdTimeMin.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.costPerHr.toLocaleString()}</td>
              {/*
                원본 공정등록의 [사용중단/재사용]. 사용 여부는 진작 저장하고 있었는데
                화면에 없어서 아무도 내릴 수가 없었고, 서버도 그 값을 안 봤다.
              */}
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn no-ec" onClick={() => toggleActive(r)}
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer', fontSize: 11.5,
                          fontWeight: 700, color: r.active ? '#1c7c3c' : '#c07a00',
                        }}>
                  {r.active ? '사용' : '사용중단'}
                </button>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', marginTop: 6, color: '#6b7280' }}>
        표준시간 합계: <b>{total.toLocaleString()}</b> 분
      </div>
    </EcListShell>
  )
}

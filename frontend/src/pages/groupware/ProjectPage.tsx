import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE'
const LABEL: Record<ProjectStatus, string> = { PLANNING: '기획', IN_PROGRESS: '진행중', ON_HOLD: '보류', DONE: '완료' }
const COLOR: Record<ProjectStatus, string> = { PLANNING: '#8a929c', IN_PROGRESS: 'var(--ec-blue)', ON_HOLD: '#c07a00', DONE: '#1c7c3c' }
const STATUSES: ProjectStatus[] = ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'DONE']

interface Project {
  id: number
  code: string
  name: string
  manager: string | null
  startDate: string
  endDate: string | null
  progress: number
  status: ProjectStatus
  statusName: string
  remark: string | null
  createdBy: string | null
}

const today = () => new Date().toISOString().slice(0, 10)

/** 그룹웨어 > 프로젝트 — 프로젝트 진행/진척 관리 (실제 연동) */
export default function ProjectPage() {
  const [rows, setRows] = useState<Project[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProjectStatus>('ALL')

  const [name, setName] = useState('')
  const [manager, setManager] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('PLANNING')
  const [remark, setRemark] = useState('')

  async function load() {
    try {
      const r = await api.get<Project[]>('/projects')
      setRows(r.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!name.trim()) return setError('프로젝트명을 입력하세요.')
    try {
      const res = await api.post<Project>('/projects', {
        name, manager: manager || undefined, startDate,
        endDate: endDate || undefined, status, remark: remark || undefined,
      })
      setOk(`${res.data.code} 프로젝트 등록 완료`)
      setName(''); setManager(''); setEndDate(''); setRemark(''); setStatus('PLANNING')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function patch(p: Project, body: Record<string, unknown>) {
    try { await api.patch(`/projects/${p.id}`, body); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  function editProgress(p: Project) {
    const v = prompt(`[${p.name}] 진척률(0~100)`, String(p.progress))
    if (v === null) return
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 100) { alert('0~100 사이 숫자를 입력하세요.'); return }
    patch(p, { progress: n })
  }

  const shown = rows
    .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
    .filter((r) => !keyword || r.name.includes(keyword) || r.code.includes(keyword) || (r.manager ?? '').includes(keyword))

  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }

  return (
    <EcListShell
      title="프로젝트 관리"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '프로젝트등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">프로젝트 진행·진척 관리 · 기획 → 진행중 → 완료(진척 100 자동) · 보류 전환 가능</p>

      {showForm && (
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>프로젝트명 *</th>
                <td><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} placeholder="프로젝트명을 입력하세요" /></td>
                <th style={th}>PM</th>
                <td><input className={inputCls} value={manager} onChange={(e) => setManager(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>시작일</th>
                <td><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>종료(예정)</th>
                <td><input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>상태</th>
                <td>
                  <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} style={{ width: 150 }}>
                    {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                  </select>
                </td>
                <th style={th}>비고</th>
                <td><input className={inputCls} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">등록(F8)</button></div>
        </form>
      )}

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {(['ALL', ...STATUSES] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: statusFilter === s ? 'var(--ec-blue)' : '#fff', color: statusFilter === s ? '#fff' : '#3a4453', fontWeight: statusFilter === s ? 700 : 400,
          }}>{s === 'ALL' ? '전체' : LABEL[s]} ({s === 'ALL' ? rows.length : rows.filter((r) => r.status === s).length})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>코드 ▼</th>
            <th>프로젝트명 ▼</th>
            <th style={{ width: 90 }}>PM</th>
            <th style={{ width: 100 }}>시작일</th>
            <th style={{ width: 100 }}>종료(예정)</th>
            <th style={{ width: 170 }}>진척률</th>
            <th style={{ width: 90, textAlign: 'center' }}>상태 ▼</th>
            <th style={{ width: 120, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>프로젝트가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{r.manager ?? ''}</td>
              <td>{r.startDate}</td>
              <td>{r.endDate ?? ''}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => editProgress(r)} title="클릭하여 진척률 수정">
                  <div style={{ flex: 1, height: 8, background: '#eef1f5', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${r.progress}%`, height: '100%', background: COLOR[r.status] }} />
                  </div>
                  <span style={{ width: 34, textAlign: 'right', fontSize: 11.5 }}>{r.progress}%</span>
                </div>
              </td>
              <td style={{ textAlign: 'center' }}>
                <select
                  className="ec-input"
                  value={r.status}
                  onChange={(e) => patch(r, { status: e.target.value })}
                  style={{ width: 88, color: COLOR[r.status], fontWeight: 700 }}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                </select>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 10px' }} onClick={() => editProgress(r)}>진척수정</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

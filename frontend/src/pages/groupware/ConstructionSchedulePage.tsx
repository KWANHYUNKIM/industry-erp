import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

interface Project {
  id: number
  code: string | null
  name: string
  manager: string | null
  startDate: string | null
  endDate: string | null
  progress: number
  status: 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE'
  statusName: string
  remark: string | null
  createdBy: string | null
}

const STATUS_COLOR: Record<Project['status'], string> = {
  PLANNING: '#5a626e', IN_PROGRESS: '#c07a00', ON_HOLD: '#c60a2e', DONE: '#1c7c3c',
}

const today = () => new Date().toISOString().slice(0, 10)

/** 그룹웨어 > 건설예정공정표 — 공정(프로젝트)별 착수·완료 예정 일정 조회·등록 (실제 연동, /projects 재사용) */
export default function ConstructionSchedulePage() {
  const [rows, setRows] = useState<Project[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')

  const [name, setName] = useState('')
  const [manager, setManager] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [remark, setRemark] = useState('')

  async function load() {
    try { setRows((await api.get<Project[]>('/projects')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!name.trim()) return setError('공정명을 입력하세요.')
    try {
      await api.post<Project>('/projects', {
        name, manager: manager || undefined,
        startDate: startDate || undefined, endDate: endDate || undefined,
        remark: remark || undefined,
      })
      setOk('공정 등록 완료')
      setName(''); setManager(''); setEndDate(''); setRemark('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || (r.manager ?? '').includes(keyword))
  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 84 }

  return (
    <EcListShell
      title="건설예정공정표"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '공정등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">공정(프로젝트)별 착수·완료 예정일 조회/등록 (프로젝트관리와 저장소 공유)</p>

      <Modal open={showForm} title="건설예정공정표 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>착수예정일</th>
                <td><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>완료예정일</th>
                <td><input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>공정명 *</th>
                <td><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} placeholder="예: 골조공사" /></td>
                <th style={th}>담당</th>
                <td><input className={inputCls} value={manager} onChange={(e) => setManager(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>비고</th>
                <td colSpan={3}><input className={inputCls} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} placeholder="공정 메모" /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">등록(F8)</button></div>
        </form>
      )}</Modal>

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>착수예정 ▼</th>
            <th style={{ width: 100 }}>완료예정</th>
            <th>공정명</th>
            <th style={{ width: 100 }}>담당</th>
            <th style={{ width: 70, textAlign: 'center' }}>상태</th>
            <th style={{ width: 70, textAlign: 'right' }}>진척률</th>
            <th>비고</th>
            <th style={{ width: 100 }}>등록자</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 공정이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.startDate ?? '-'}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.endDate ?? '-'}</td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{r.manager ?? ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
              <td style={{ textAlign: 'right' }}>{r.progress}%</td>
              <td style={{ color: '#6b7280' }}>{r.remark ?? ''}</td>
              <td>{r.createdBy ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

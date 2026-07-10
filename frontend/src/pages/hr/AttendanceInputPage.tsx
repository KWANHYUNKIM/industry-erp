import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 관리 > 근태입력 — 사원별 출퇴근 시간 입력 (백엔드 /api/hr/attendance 연동) */
interface Row {
  id: number
  date: string
  empName: string
  department: string | null
  clockIn: string | null
  clockOut: string | null
  workHours: number
  status: string
  note: string | null
}

interface Employee {
  id: number
  name: string
  department: string | null
}

const mono = { fontFamily: 'monospace' as const }
const inputCls = 'ec-input w-full'
function statusColor(s: string) {
  if (s === '정상') return '#1c7c3c'
  if (s === '결근') return '#c60a2e'
  return '#c07a00'
}

const today = new Date().toISOString().slice(0, 10)
const emptyForm = { userId: '', date: today, clockIn: '09:00', clockOut: '18:00', note: '' }

export default function AttendanceInputPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true)
    try {
      const [att, emps] = await Promise.all([
        api.get<Row[]>('/hr/attendance'),
        api.get<Employee[]>('/hr/employees'),
      ])
      setRows(att.data)
      setEmployees(emps.data)
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
    if (!form.userId) {
      setError('사원을 선택하세요.')
      return
    }
    try {
      await api.post('/hr/attendance', {
        userId: Number(form.userId),
        date: form.date,
        clockIn: form.clockIn || null,
        clockOut: form.clockOut || null,
        note: form.note || null,
      })
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.empName.includes(keyword))

  return (
    <EcListShell
      title="근태입력"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      newLabel={showForm ? '입력닫기' : '신규(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {showForm && (
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>근태 입력</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div>
              <label className="mb-1 block text-sm text-slate-600">사원 *</label>
              <select className={inputCls} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                <option value="">선택</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}{emp.department ? ` (${emp.department})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">일자 *</label>
              <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">출근</label>
              <input type="time" className={inputCls} value={form.clockIn} onChange={(e) => setForm({ ...form, clockIn: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">퇴근</label>
              <input type="time" className={inputCls} value={form.clockOut} onChange={(e) => setForm({ ...form, clockOut: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">비고</label>
              <input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">저장</button>
          </div>
        </form>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th>
            <th>사원명</th>
            <th>출근</th>
            <th>퇴근</th>
            <th style={{ textAlign: 'right' }}>근무시간</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={mono}>{r.date}</td>
              <td>{r.empName}</td>
              <td style={mono}>{r.clockIn ?? '-'}</td>
              <td style={mono}>{r.clockOut ?? '-'}</td>
              <td style={{ textAlign: 'right' }}>{r.workHours.toLocaleString()}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: statusColor(r.status) }}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

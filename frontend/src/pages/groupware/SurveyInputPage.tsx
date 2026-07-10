import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

interface Survey {
  id: number
  title: string
  startDate: string | null
  endDate: string | null
  target: number
  responses: number
  responseRate: number
  status: 'OPEN' | 'CLOSED'
  statusName: string
  createdBy: string | null
}

const today = () => new Date().toISOString().slice(0, 10)

/** 그룹웨어 > 설문조사입력 — 신규 설문 등록 (실제 연동, /surveys 재사용) */
export default function SurveyInputPage() {
  const [rows, setRows] = useState<Survey[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [keyword, setKeyword] = useState('')

  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [target, setTarget] = useState('')

  async function load() {
    try { setRows((await api.get<Survey[]>('/surveys')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!title.trim()) return setError('설문 제목을 입력하세요.')
    try {
      await api.post<Survey>('/surveys', {
        title, startDate, endDate: endDate || undefined, target: target ? Number(target) : 0,
      })
      setOk('설문이 등록되었습니다.')
      setTitle(''); setEndDate(''); setTarget('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(s: Survey) {
    if (!confirm(`[${s.title}] 설문을 삭제하시겠습니까?`)) return
    try { await api.delete(`/surveys/${s.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = rows.filter((r) => !keyword || r.title.includes(keyword))
  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }

  return (
    <EcListShell
      title="설문조사입력"
      search={keyword}
      onSearchChange={setKeyword}
      actions={[{ label: '새로고침', onClick: load }]}
    >
      <p className="mb-2 text-xs text-slate-500">신규 설문을 등록합니다 · 등록된 설문의 응답현황은 [설문조사현황]에서 확인</p>

      <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
        <table className="w-full text-left">
          <tbody>
            <tr>
              <th style={th}>설문제목 *</th>
              <td colSpan={3}><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} placeholder="설문 제목을 입력하세요" /></td>
            </tr>
            <tr>
              <th style={th}>시작일</th>
              <td><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 150 }} /></td>
              <th style={th}>종료일</th>
              <td><input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 150 }} /></td>
            </tr>
            <tr>
              <th style={th}>대상인원</th>
              <td><input type="number" className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 100 }} min={0} /></td>
              <th style={th}></th><td></td>
            </tr>
          </tbody>
        </table>
        {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
        <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">등록(F8)</button></div>
      </form>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>설문제목</th>
            <th style={{ width: 100 }}>시작일</th>
            <th style={{ width: 100 }}>종료일</th>
            <th style={{ width: 70, textAlign: 'right' }}>대상</th>
            <th style={{ width: 90, textAlign: 'center' }}>상태</th>
            <th style={{ width: 100 }}>등록자</th>
            <th style={{ width: 70, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 설문이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontWeight: 600 }}>{r.title}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.startDate ?? ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.endDate ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.target.toLocaleString()}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: r.status === 'OPEN' ? '#c07a00' : '#1c7c3c' }}>{r.statusName}</td>
              <td>{r.createdBy ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(r)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

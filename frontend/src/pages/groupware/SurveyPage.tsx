import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

type SurveyStatus = 'OPEN' | 'CLOSED'
const LABEL: Record<SurveyStatus, string> = { OPEN: '진행중', CLOSED: '마감' }
const COLOR: Record<SurveyStatus, string> = { OPEN: '#c07a00', CLOSED: '#1c7c3c' }

interface Survey {
  id: number
  title: string
  startDate: string | null
  endDate: string | null
  target: number
  responses: number
  responseRate: number
  status: SurveyStatus
  statusName: string
  createdBy: string | null
}

const today = () => new Date().toISOString().slice(0, 10)

/** 그룹웨어 > 설문조사 — 사내 설문 등록·응답 현황 (실제 연동) */
export default function SurveyPage() {
  const [rows, setRows] = useState<Survey[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
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
      setOk('설문 등록 완료')
      setTitle(''); setEndDate(''); setTarget('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function patch(s: Survey, body: Record<string, unknown>) {
    try { await api.patch(`/surveys/${s.id}`, body); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function respond(s: Survey) {
    try { await api.post(`/surveys/${s.id}/respond`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
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
      title="설문조사"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '설문등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">사내 설문 등록·응답현황 · 응답 버튼으로 응답수 반영(응답률 자동) · 마감 시 응답 불가</p>

      {showForm && (
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
      )}

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>설문제목 ▼</th>
            <th style={{ width: 100 }}>시작일</th>
            <th style={{ width: 100 }}>종료일</th>
            <th style={{ width: 70, textAlign: 'right' }}>대상</th>
            <th style={{ width: 70, textAlign: 'right' }}>응답</th>
            <th style={{ width: 150 }}>응답률</th>
            <th style={{ width: 80, textAlign: 'center' }}>상태 ▼</th>
            <th style={{ width: 130, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>설문이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontWeight: 600 }}>{r.title}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.startDate ?? ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.endDate ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.target.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.responses.toLocaleString()}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 8, background: '#eef1f5', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, r.responseRate)}%`, height: '100%', background: COLOR[r.status] }} />
                  </div>
                  <span style={{ width: 34, textAlign: 'right', fontSize: 11.5 }}>{r.responseRate}%</span>
                </div>
              </td>
              <td style={{ textAlign: 'center' }}>
                <select className="ec-input" value={r.status} onChange={(e) => patch(r, { status: e.target.value })} style={{ width: 74, color: COLOR[r.status], fontWeight: 700 }}>
                  {(['OPEN', 'CLOSED'] as SurveyStatus[]).map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                </select>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} disabled={r.status === 'CLOSED'} onClick={() => respond(r)}>응답+1</button>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', marginLeft: 4, color: '#c60a2e' }} onClick={() => remove(r)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

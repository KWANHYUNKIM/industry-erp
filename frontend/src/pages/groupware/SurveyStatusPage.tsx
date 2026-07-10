import { useEffect, useState } from 'react'
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

const COLOR: Record<Survey['status'], string> = { OPEN: '#c07a00', CLOSED: '#1c7c3c' }

/** 그룹웨어 > 설문조사현황 — 설문별 응답 현황·응답률 (실제 연동, /surveys 재사용) */
export default function SurveyStatusPage() {
  const [rows, setRows] = useState<Survey[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    try { setRows((await api.get<Survey[]>('/surveys')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function respond(s: Survey) {
    try { await api.post(`/surveys/${s.id}/respond`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function toggle(s: Survey) {
    try { await api.patch(`/surveys/${s.id}`, { status: s.status === 'OPEN' ? 'CLOSED' : 'OPEN' }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = rows.filter((r) => !keyword || r.title.includes(keyword))

  return (
    <EcListShell
      title="설문조사현황"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel="새로고침"
      onNew={load}
      actions={[{ label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">설문별 응답 현황·응답률 · 응답+1 버튼으로 응답 반영 · 마감 시 응답 불가</p>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>설문제목</th>
            <th style={{ width: 90, textAlign: 'right' }}>대상수</th>
            <th style={{ width: 90, textAlign: 'right' }}>응답수</th>
            <th style={{ width: 170 }}>응답률</th>
            <th style={{ width: 80, textAlign: 'center' }}>상태</th>
            <th style={{ width: 140, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>설문이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontWeight: 600 }}>{r.title}</td>
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
              <td style={{ textAlign: 'center', fontWeight: 700, color: COLOR[r.status] }}>{r.statusName}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} disabled={r.status === 'CLOSED'} onClick={() => respond(r)}>응답+1</button>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', marginLeft: 4 }} onClick={() => toggle(r)}>{r.status === 'OPEN' ? '마감' : '재개'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

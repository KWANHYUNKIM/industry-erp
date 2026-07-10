import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Attendance } from '../../api/types'

const fmtMin = (m: number | null) => {
  if (m == null) return ''
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}시간 ${mm}분`
}

/** 그룹웨어 > 근태관리 > 출/퇴근기록부 — 출근/퇴근 처리 + 현황 */
export default function AttendancePage() {
  const [rows, setRows] = useState<Attendance[]>([])
  const [today, setToday] = useState<Attendance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [list, t] = await Promise.all([
        api.get<Attendance[]>('/attendances'),
        api.get<Attendance | ''>('/attendances/today'),
      ])
      setRows(list.data)
      setToday(t.data || null)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function punch(kind: 'clock-in' | 'clock-out') {
    setError('')
    try {
      await api.post(`/attendances/${kind}`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>출/퇴근기록부(ID)</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="ec-btn" onClick={load}>새로고침</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      {/* 오늘 출퇴근 카드 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, border: '1px solid var(--ec-border)', background: '#fff', padding: '14px 18px', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)' }}>오늘 근무</div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
          <div><span style={{ color: '#8a929c' }}>출근</span> <b style={{ marginLeft: 6 }}>{today?.clockIn ?? '--:--'}</b></div>
          <div><span style={{ color: '#8a929c' }}>퇴근</span> <b style={{ marginLeft: 6 }}>{today?.clockOut ?? '--:--'}</b></div>
          <div><span style={{ color: '#8a929c' }}>근무시간</span> <b style={{ marginLeft: 6 }}>{fmtMin(today?.workMinutes ?? null) || '-'}</b></div>
          {today?.late && <span style={{ color: '#c60a2e', fontWeight: 700 }}>지각</span>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="ec-btn ec-btn-primary" onClick={() => punch('clock-in')} disabled={!!today?.clockIn}>출근하기</button>
          <button className="ec-btn" onClick={() => punch('clock-out')} disabled={!today?.clockIn || !!today?.clockOut}>퇴근하기</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>일자 ▼</th>
              <th>사용자</th>
              <th style={{ textAlign: 'center' }}>출근</th>
              <th style={{ textAlign: 'center' }}>퇴근</th>
              <th style={{ textAlign: 'center' }}>근무시간</th>
              <th style={{ textAlign: 'center' }}>지각</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>출퇴근 기록이 없습니다.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.workDate}</td>
                <td>{r.userName}</td>
                <td style={{ textAlign: 'center' }}>{r.clockIn ?? ''}</td>
                <td style={{ textAlign: 'center' }}>{r.clockOut ?? ''}</td>
                <td style={{ textAlign: 'center' }}>{fmtMin(r.workMinutes)}</td>
                <td style={{ textAlign: 'center' }}>{r.late ? <span style={{ color: '#c60a2e' }}>지각</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        <button className="ec-btn">Excel</button>
        <button className="ec-btn">인쇄</button>
      </div>
    </div>
  )
}

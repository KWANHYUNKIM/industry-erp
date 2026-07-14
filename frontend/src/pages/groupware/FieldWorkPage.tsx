import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import type { FieldWork, FieldWorkStatus, FieldWorkSummary } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => today().slice(0, 8) + '01'

const TABS = ['전체', '신청', '승인', '반려'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, FieldWorkStatus> = {
  신청: 'REQUESTED', 승인: 'APPROVED', 반려: 'REJECTED',
}
const statusColor = (s: FieldWorkStatus) =>
  s === 'APPROVED' ? '#1c7c3c' : s === 'REJECTED' ? '#c60a2e' : '#c07a00'

/** 외근조회 — 외근계 신청 → 승인/반려. 자기 외근계는 자기가 승인할 수 없다. */
export default function FieldWorkPage() {
  const { user } = useAuth()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [summary, setSummary] = useState<FieldWorkSummary | null>(null)
  const [tab, setTab] = useState<Tab>('전체')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<FieldWorkSummary>('/field-works', { params: { from, to } })
      .then((r) => setSummary(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const rows = summary?.rows ?? []
  const shown = useMemo(() => rows.filter((r) => tab === '전체' || r.status === TAB_STATUS[tab]), [rows, tab])

  async function approve(f: FieldWork) {
    try { await api.post(`/field-works/${f.id}/approve`); flash(`${f.userName}의 외근계를 승인했습니다.`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function reject(f: FieldWork) {
    const reason = window.prompt('반려 사유를 적으세요.', '')
    if (reason === null || !reason.trim()) return
    try { await api.post(`/field-works/${f.id}/reject`, { reason }); flash('반려했습니다.'); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function cancel(f: FieldWork) {
    if (!window.confirm(`${f.workDate} 외근계를 취소할까요?`)) return
    try { await api.delete(`/field-works/${f.id}`); flash('취소했습니다.'); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="외근조회" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
        <span style={{ color: '#8a929c' }}>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        <button className="ec-btn ec-btn-primary" onClick={load}>조회</button>
        <button className="ec-btn" onClick={() => setShowForm(true)}>+ 외근계 신청</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>
          같은 날 외근계는 한 건만 살아 있습니다. 자기 외근계는 자기가 승인할 수 없습니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {summary && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Tile label="승인 대기" value={`${summary.requestedCount}건`} strong={summary.requestedCount > 0} />
          <Tile label="승인" value={`${summary.approvedCount}건`} />
          <Tile label="반려" value={`${summary.rejectedCount}건`} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>외근일</th><th style={{ width: 100 }}>사원</th><th style={{ width: 90 }}>부서</th>
            <th style={{ width: 110 }}>시간</th><th>외근지</th><th>사유</th>
            <th style={{ width: 90, textAlign: 'center' }}>상태</th>
            <th style={{ width: 130, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>외근계가 없습니다.</td></tr>
          ) : shown.map((f, i) => {
            const mine = f.userId === user?.id
            return (
              <tr key={f.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{f.workDate}</td>
                <td>{f.userName}{mine && <span style={{ fontSize: 11, color: 'var(--ec-blue)' }}> (나)</span>}</td>
                <td>{f.department ?? ''}</td>
                <td style={{ color: '#8a929c' }}>
                  {f.startTime && f.endTime ? `${f.startTime.slice(0, 5)}~${f.endTime.slice(0, 5)}` : '종일'}
                </td>
                <td>{f.destination}</td>
                <td style={{ fontSize: 12.5 }}>
                  {f.purpose}
                  {f.status === 'REJECTED' && f.rejectReason && (
                    <span style={{ color: '#c60a2e', fontSize: 11 }}> · 반려: {f.rejectReason}</span>
                  )}
                </td>
                <td style={{ textAlign: 'center', color: statusColor(f.status) }}>
                  {f.statusName}
                  {f.approverName && <div style={{ fontSize: 10.5, color: '#8a929c' }}>{f.approverName}</div>}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {f.status === 'REQUESTED' && (
                    <div style={{ display: 'inline-flex', gap: 3 }}>
                      {!mine && <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => approve(f)}>승인</button>}
                      {!mine && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => reject(f)}>반려</button>}
                      {mine && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => cancel(f)}>취소</button>}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {showForm && <FieldWorkForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); flash('외근계를 신청했습니다.'); load() }} />}
    </EcListShell>
  )
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', borderRadius: 3, padding: '8px 10px', background: strong ? '#fff8e6' : '#fff' }}>
      <div style={{ fontSize: 11.5, color: '#8a929c' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: strong ? '#c07a00' : '#2b3440' }}>{value}</div>
    </div>
  )
}

function FieldWorkForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [workDate, setWorkDate] = useState(today())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [destination, setDestination] = useState('')
  const [purpose, setPurpose] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!destination.trim()) return setError('외근지를 입력하세요.')
    if (!purpose.trim()) return setError('외근 사유를 입력하세요.')
    setSaving(true)
    try {
      await api.post('/field-works', {
        workDate,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        destination, purpose,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 560, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>외근계 신청</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>외근일<span style={{ color: '#c60a2e' }}>*</span></th>
                <td><input type="date" className="ec-input" value={workDate} onChange={(e) => setWorkDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={{ width: 70, background: '#f5f7fa' }}>시간</th>
                <td>
                  <input type="time" className="ec-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: 100 }} />
                  <span style={{ margin: '0 4px', color: '#8a929c' }}>~</span>
                  <input type="time" className="ec-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: 100 }} />
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>외근지<span style={{ color: '#c60a2e' }}>*</span></th>
                <td colSpan={3}>
                  <input className="ec-input" value={destination} onChange={(e) => setDestination(e.target.value)}
                    style={{ width: '100%' }} placeholder="예: 한울ICT 본사 / 평택 현장" />
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>사유<span style={{ color: '#c60a2e' }}>*</span></th>
                <td colSpan={3}>
                  <input className="ec-input" value={purpose} onChange={(e) => setPurpose(e.target.value)}
                    style={{ width: '100%' }} placeholder="예: 설비 점검 및 견적 협의" />
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 12, color: '#8a929c' }}>
            시간을 비우면 종일 외근으로 봅니다.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '신청 중…' : '신청(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

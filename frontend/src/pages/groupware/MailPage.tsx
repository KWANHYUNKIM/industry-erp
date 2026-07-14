import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import type { Mail, SharedMailBox, User } from '../../api/types'

const when = (s: string) => s.replace('T', ' ').slice(0, 16)

const TABS = ['수신함', '발신함', '공용메일함'] as const
type Tab = (typeof TABS)[number]

const statusColor = (s: Mail['status']) =>
  s === 'HANDLED' ? '#1c7c3c' : s === 'IN_PROGRESS' ? '#c07a00' : s === 'UNREAD' ? 'var(--ec-blue)' : '#8a929c'

/** 공용메일 — 사내메일(수신/발신)과 공용 메일함(담당자 배정→처리). 외부 메일서버 연동은 없다. */
export default function MailPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('수신함')
  const [inbox, setInbox] = useState<Mail[]>([])
  const [sent, setSent] = useState<Mail[]>([])
  const [box, setBox] = useState<SharedMailBox | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [open, setOpen] = useState<Mail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [compose, setCompose] = useState<'internal' | 'shared' | null>(null)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    const fail = (e: unknown) => setError(extractErrorMessage(e))
    api.get<Mail[]>('/mails/inbox').then((r) => setInbox(r.data)).catch(fail)
    api.get<Mail[]>('/mails/sent').then((r) => setSent(r.data)).catch(fail)
    api.get<SharedMailBox>('/mails/shared').then((r) => setBox(r.data)).catch(fail)
  }

  useEffect(() => {
    load()
    api.get<User[]>('/users').then((r) => setUsers(r.data)).catch(() => {})
  }, [])

  async function openMail(m: Mail) {
    setOpen(m)
    if (m.status === 'UNREAD' && (m.type === 'SHARED' || m.recipientId === user?.id)) {
      try { await api.post(`/mails/${m.id}/read`); load() } catch { /* 읽음 처리 실패는 조용히 넘긴다 */ }
    }
  }

  async function assign(m: Mail) {
    const picked = window.prompt(
      `담당자를 선택하세요.\n${users.map((u) => `${u.id}: ${u.name}`).join('\n')}`,
      String(user?.id ?? users[0]?.id ?? ''),
    )
    if (picked === null) return
    const assigneeId = Number(picked)
    if (!users.some((u) => u.id === assigneeId)) return alert('담당자 번호가 올바르지 않습니다.')
    try {
      await api.post(`/mails/${m.id}/assign`, { assigneeId })
      flash('담당자를 배정했습니다.')
      setOpen(null)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function handle(m: Mail) {
    const note = window.prompt('처리 결과를 적으세요.', '')
    if (note === null) return
    try {
      await api.post(`/mails/${m.id}/handle`, { note })
      flash('처리 완료했습니다.')
      setOpen(null)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  const rows = tab === '수신함' ? inbox : tab === '발신함' ? sent : (box?.mails ?? [])
  const unread = inbox.filter((m) => m.status === 'UNREAD').length

  return (
    <EcListShell title="공용메일" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setCompose('internal')}>+ 메일쓰기</button>
        <button className="ec-btn" onClick={() => setCompose('shared')}>공용메일 수신등록</button>
        <button className="ec-btn" onClick={load}>새로고침</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>
          외부 메일서버 연동은 없습니다. 공용메일은 받은 메일을 등록해 담당자를 배정하고 처리를 추적합니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => {
          const badge = t === '수신함' ? unread : t === '공용메일함' ? (box?.pendingCount ?? 0) : 0
          return (
            <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
              padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
              background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
              fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
            }}>
              {t}
              {badge > 0 && (
                <span style={{ marginLeft: 5, fontSize: 11, background: '#c60a2e', color: '#fff', borderRadius: 8, padding: '1px 6px' }}>
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 160 }}>{tab === '발신함' ? '받는 사람' : '보낸 사람'}</th>
            <th>제목</th>
            <th style={{ width: 130 }}>일시</th>
            {tab === '공용메일함' && <th style={{ width: 100 }}>담당자</th>}
            <th style={{ width: 90, textAlign: 'center' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>메일이 없습니다.</td></tr>
          ) : rows.map((m, i) => (
            <tr key={m.id} onClick={() => openMail(m)} style={{ cursor: 'pointer' }}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{tab === '발신함' ? m.recipientName : (m.senderName ?? m.fromAddress)}</td>
              <td style={{ fontWeight: m.status === 'UNREAD' ? 700 : 400 }}>{m.subject}</td>
              <td style={{ color: '#8a929c' }}>{when(m.sentAt)}</td>
              {tab === '공용메일함' && <td>{m.assigneeName ?? <span style={{ color: '#c07a00' }}>미배정</span>}</td>}
              <td style={{ textAlign: 'center', color: statusColor(m.status) }}>{m.statusName}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {open && (
        <MailDetail
          mail={open}
          canHandle={open.type === 'SHARED' && open.assigneeId === user?.id && open.status !== 'HANDLED'}
          canAssign={open.type === 'SHARED' && open.status !== 'HANDLED'}
          onAssign={() => assign(open)}
          onHandle={() => handle(open)}
          onClose={() => setOpen(null)}
        />
      )}

      {compose && (
        <ComposeForm
          mode={compose}
          users={users.filter((u) => u.id !== user?.id)}
          onClose={() => setCompose(null)}
          onSaved={() => {
            setCompose(null)
            flash(compose === 'internal' ? '메일을 보냈습니다.' : '공용메일을 등록했습니다.')
            load()
          }}
        />
      )}
    </EcListShell>
  )
}

function MailDetail({ mail, canAssign, canHandle, onAssign, onHandle, onClose }: {
  mail: Mail
  canAssign: boolean
  canHandle: boolean
  onAssign: () => void
  onHandle: () => void
  onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 640, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{mail.typeName}</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          <table className="w-full text-left" style={{ marginBottom: 10 }}>
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>제목</th>
                <td colSpan={3} style={{ fontWeight: 700 }}>{mail.subject}</td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>보낸 사람</th>
                <td>{mail.senderName ?? mail.fromAddress}</td>
                <th style={{ width: 80, background: '#f5f7fa' }}>일시</th>
                <td>{when(mail.sentAt)}</td>
              </tr>
              {mail.type === 'SHARED' && (
                <tr>
                  <th style={{ background: '#f5f7fa' }}>담당자</th>
                  <td>{mail.assigneeName ?? '미배정'}</td>
                  <th style={{ background: '#f5f7fa' }}>상태</th>
                  <td style={{ color: statusColor(mail.status) }}>{mail.statusName}</td>
                </tr>
              )}
              {mail.handleNote && (
                <tr>
                  <th style={{ background: '#f5f7fa' }}>처리 결과</th>
                  <td colSpan={3}>{mail.handleNote} <span style={{ color: '#8a929c', fontSize: 12 }}>({mail.handledAt ? when(mail.handledAt) : ''})</span></td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ border: '1px solid var(--ec-border)', borderRadius: 3, padding: 12, minHeight: 120, whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {mail.body || <span style={{ color: '#9aa1ab' }}>(내용 없음)</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          {canAssign && <button className="ec-btn" onClick={onAssign}>담당자 배정</button>}
          {canHandle && <button className="ec-btn ec-btn-primary" onClick={onHandle}>처리 완료</button>}
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function ComposeForm({ mode, users, onClose, onSaved }: {
  mode: 'internal' | 'shared'
  users: User[]
  onClose: () => void
  onSaved: () => void
}) {
  const [recipientId, setRecipientId] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (mode === 'internal' && !recipientId) return setError('받는 사람을 선택하세요.')
    if (mode === 'shared' && !fromAddress.trim()) return setError('보낸 사람 주소를 입력하세요.')
    if (!subject.trim()) return setError('제목을 입력하세요.')
    setSaving(true)
    try {
      if (mode === 'internal') {
        await api.post('/mails', { recipientId: Number(recipientId), subject, body })
      } else {
        await api.post('/mails/shared', { fromAddress, subject, body })
      }
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 640, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>
            {mode === 'internal' ? '메일쓰기 (사내메일)' : '공용메일 수신등록'}
          </span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left" style={{ marginBottom: 10 }}>
            <tbody>
              <tr>
                <th style={{ width: 100, background: '#f5f7fa' }}>
                  {mode === 'internal' ? '받는 사람' : '보낸 사람'}<span style={{ color: '#c60a2e' }}>*</span>
                </th>
                <td>
                  {mode === 'internal' ? (
                    <select className="ec-input" value={recipientId} onChange={(e) => setRecipientId(e.target.value)} style={{ width: 240 }}>
                      <option value="">사용자 선택</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}
                    </select>
                  ) : (
                    <input className="ec-input" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)}
                      style={{ width: 260 }} placeholder="예: buyer@partner.co.kr" />
                  )}
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>제목<span style={{ color: '#c60a2e' }}>*</span></th>
                <td><input className="ec-input" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>
          <textarea className="ec-input" value={body} onChange={(e) => setBody(e.target.value)}
            style={{ width: '100%', height: 180, padding: 8, fontFamily: 'inherit' }} placeholder="내용" />
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>
            {saving ? '저장 중…' : mode === 'internal' ? '보내기(F8)' : '등록(F8)'}
          </button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

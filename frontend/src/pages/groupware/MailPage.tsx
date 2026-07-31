import { useEffect, useState, type CSSProperties } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import type { Mail, SharedMailBox, User } from '../../api/types'

const when = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '')

interface SpamRule { id: number; kind: 'FROM_ADDRESS' | 'SUBJECT' | 'BODY'; kindName: string; pattern: string; active: boolean; note: string | null }

const TABS = ['수신함', '발신함', '공용메일함', '스팸메일함', '임시보관함', '지운함'] as const
type Tab = (typeof TABS)[number]

const statusColor = (s: Mail['status']) =>
  s === 'HANDLED' ? '#1c7c3c' : s === 'IN_PROGRESS' ? '#c07a00' : s === 'UNREAD' ? 'var(--ec-blue)' : '#8a929c'

/** 공용메일 — 사내메일(수신/발신)·공용 메일함·임시보관함(초안)·지운함(소프트삭제). 외부 메일서버 연동은 없다. */
export default function MailPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('수신함')
  const [inbox, setInbox] = useState<Mail[]>([])
  const [sent, setSent] = useState<Mail[]>([])
  const [box, setBox] = useState<SharedMailBox | null>(null)
  const [drafts, setDrafts] = useState<Mail[]>([])
  const [trash, setTrash] = useState<Mail[]>([])
  const [spam, setSpam] = useState<Mail[]>([])
  const [rules, setRules] = useState<SpamRule[]>([])
  const [ruleForm, setRuleForm] = useState({ kind: 'SUBJECT' as SpamRule['kind'], pattern: '' })
  const [users, setUsers] = useState<User[]>([])
  const [open, setOpen] = useState<Mail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [compose, setCompose] = useState<'internal' | 'shared' | null>(null)
  const [editDraft, setEditDraft] = useState<Mail | null>(null)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    const fail = (e: unknown) => setError(extractErrorMessage(e))
    api.get<Mail[]>('/mails/inbox').then((r) => setInbox(r.data)).catch(fail)
    api.get<Mail[]>('/mails/sent').then((r) => setSent(r.data)).catch(fail)
    api.get<SharedMailBox>('/mails/shared').then((r) => setBox(r.data)).catch(fail)
    api.get<Mail[]>('/mails/drafts').then((r) => setDrafts(r.data)).catch(fail)
    api.get<Mail[]>('/mails/trash').then((r) => setTrash(r.data)).catch(fail)
    api.get<Mail[]>('/mails/spam').then((r) => setSpam(r.data)).catch(fail)
    api.get<SpamRule[]>('/spam-rules').then((r) => setRules(r.data)).catch(fail)
  }

  useEffect(() => {
    load()
    api.get<User[]>('/users').then((r) => setUsers(r.data)).catch(() => {})
  }, [])

  async function openMail(m: Mail) {
    setOpen(m)
    if (!m.deletedAt && m.status === 'UNREAD' && (m.type === 'SHARED' || m.recipientId === user?.id)) {
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
      flash('담당자를 배정했습니다.'); setOpen(null); load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function handle(m: Mail) {
    const note = window.prompt('처리 결과를 적으세요.', '')
    if (note === null) return
    try {
      await api.post(`/mails/${m.id}/handle`, { note })
      flash('처리 완료했습니다.'); setOpen(null); load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function trashMail(m: Mail) {
    try { await api.delete(`/mails/${m.id}`); flash('지운함으로 옮겼습니다.'); setOpen(null); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }
  async function restoreMail(m: Mail) {
    try { await api.post(`/mails/${m.id}/restore`); flash('복원했습니다.'); setOpen(null); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }
  async function permanentDelete(m: Mail) {
    if (!confirm('영구삭제하면 복구할 수 없습니다. 삭제할까요?')) return
    try { await api.delete(`/mails/${m.id}/permanent`); flash('영구삭제했습니다.'); setOpen(null); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function markSpam(m: Mail, spamOn: boolean) {
    try {
      await api.post(`/mails/${m.id}/${spamOn ? 'spam' : 'not-spam'}`)
      flash(spamOn ? '스팸으로 옮겼습니다.' : '스팸을 해제했습니다.')
      setOpen(null); load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function addRule() {
    if (!ruleForm.pattern.trim()) return alert('걸러낼 문자열을 입력하세요.')
    try {
      await api.post('/spam-rules', { kind: ruleForm.kind, pattern: ruleForm.pattern.trim() })
      setRuleForm({ ...ruleForm, pattern: '' }); flash('규칙을 추가했습니다.'); load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function toggleRule(r: SpamRule) {
    try { await api.put(`/spam-rules/${r.id}`, { kind: r.kind, pattern: r.pattern, active: !r.active, note: r.note }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function removeRule(r: SpamRule) {
    if (!confirm(`[${r.kindName}: ${r.pattern}] 규칙을 삭제할까요?`)) return
    try { await api.delete(`/spam-rules/${r.id}`); load() } catch (err) { alert(extractErrorMessage(err)) }
  }

  const rows = tab === '수신함' ? inbox : tab === '발신함' ? sent
    : tab === '공용메일함' ? (box?.mails ?? []) : tab === '스팸메일함' ? spam
    : tab === '임시보관함' ? drafts : trash
  const unread = inbox.filter((m) => m.status === 'UNREAD').length

  function rowClick(m: Mail) {
    if (tab === '임시보관함') setEditDraft(m)
    else openMail(m)
  }

  return (
    <EcListShell title="공용메일" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setCompose('internal')}>+ 메일쓰기</button>
        <button className="ec-btn" onClick={() => setCompose('shared')}>공용메일 수신등록</button>
        <button className="ec-btn" onClick={load}>새로고침</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>
          외부 메일서버 연동은 없습니다. 초안은 임시보관함, 삭제한 메일은 지운함에서 복원할 수 있습니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => {
          const badge = t === '수신함' ? unread : t === '공용메일함' ? (box?.pendingCount ?? 0) : t === '스팸메일함' ? spam.length : t === '임시보관함' ? drafts.length : 0
          return (
            <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
              padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
              background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
              fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
            }}>
              {t}
              {badge > 0 && (
                <span style={{ marginLeft: 5, fontSize: 11, background: t === '임시보관함' || t === '스팸메일함' ? '#8a929c' : '#c60a2e', color: '#fff', borderRadius: 8, padding: '1px 6px' }}>
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
            <th style={{ width: 160 }}>{tab === '발신함' || tab === '임시보관함' ? '받는 사람' : '보낸 사람'}</th>
            <th>제목</th>
            <th style={{ width: 130 }}>{tab === '지운함' ? '삭제일시' : '일시'}</th>
            {tab === '공용메일함' && <th style={{ width: 100 }}>담당자</th>}
            {tab === '스팸메일함' && <th style={{ width: 220 }}>분류 사유</th>}
            {tab === '임시보관함' || tab === '지운함' || tab === '스팸메일함' ? (
              <th style={{ width: 140, textAlign: 'center' }}>관리</th>
            ) : (
              <th style={{ width: 90, textAlign: 'center' }}>상태</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>메일이 없습니다.</td></tr>
          ) : rows.map((m, i) => (
            <tr key={m.id} onClick={() => rowClick(m)} style={{ cursor: 'pointer' }}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{tab === '발신함' || tab === '임시보관함' ? (m.recipientName ?? <span style={{ color: '#c07a00' }}>미지정</span>) : (m.senderName ?? m.fromAddress)}</td>
              <td style={{ fontWeight: !m.deletedAt && m.status === 'UNREAD' && tab !== '임시보관함' ? 700 : 400 }}>{m.subject}</td>
              <td style={{ color: '#8a929c' }}>{when(tab === '지운함' ? m.deletedAt : m.sentAt)}</td>
              {tab === '공용메일함' && <td>{m.assigneeName ?? <span style={{ color: '#c07a00' }}>미배정</span>}</td>}
              {tab === '스팸메일함' && <td style={{ color: '#8a929c', fontSize: 12 }}>{m.spamReason ?? ''}</td>}
              {tab === '스팸메일함' ? (
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <button className="no-ec" onClick={() => markSpam(m, false)} style={btnLink('#1c7c3c')}>스팸 해제</button>
                </td>
              ) : tab === '임시보관함' ? (
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <button className="no-ec" onClick={() => setEditDraft(m)} style={btnLink('var(--ec-blue)')}>수정</button>
                  <button className="no-ec" onClick={() => trashMail(m)} style={btnLink('#c60a2e')}>삭제</button>
                </td>
              ) : tab === '지운함' ? (
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <button className="no-ec" onClick={() => restoreMail(m)} style={btnLink('#1c7c3c')}>복원</button>
                  <button className="no-ec" onClick={() => permanentDelete(m)} style={btnLink('#c60a2e')}>영구삭제</button>
                </td>
              ) : (
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <span style={{ color: statusColor(m.status) }}>{m.statusName}</span>
                  {(tab === '공용메일함' || tab === '수신함') && (
                    <button className="no-ec" onClick={() => markSpam(m, true)} style={btnLink('#c07a00')} title="스팸메일함으로 옮기기">스팸</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {tab === '스팸메일함' && (
        <div style={{ marginTop: 12, border: '1px solid var(--ec-border)', background: '#fbfcfd', padding: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)', marginBottom: 6 }}>
            스팸 분류 규칙 <span style={{ fontWeight: 400, color: '#8a929c', fontSize: 11.5 }}>
              — 공용메일 수신등록 시 이 규칙과 대조해 스팸함으로 가릅니다(부분일치, 대소문자 무시).
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <select className="ec-input" value={ruleForm.kind} style={{ width: 120 }}
                    onChange={(e) => setRuleForm({ ...ruleForm, kind: e.target.value as SpamRule['kind'] })}>
              <option value="SUBJECT">제목</option>
              <option value="FROM_ADDRESS">보낸주소</option>
              <option value="BODY">본문</option>
            </select>
            <input className="ec-input" style={{ width: 240 }} placeholder="걸러낼 문자열 (예: 【광고】)"
                   value={ruleForm.pattern} onChange={(e) => setRuleForm({ ...ruleForm, pattern: e.target.value })} />
            <button className="ec-btn ec-btn-primary" onClick={addRule}>규칙 추가</button>
          </div>
          <table className="w-full text-left">
            <thead><tr>
              <th style={{ width: 110 }}>기준</th>
              <th>문자열</th>
              <th style={{ width: 90, textAlign: 'center' }}>사용</th>
              <th style={{ width: 60, textAlign: 'center' }}>삭제</th>
            </tr></thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 14 }}>등록된 규칙이 없습니다.</td></tr>
              ) : rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.kindName}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.pattern}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="no-ec" onClick={() => toggleRule(r)} style={btnLink(r.active ? '#1c7c3c' : '#8a929c')}>
                      {r.active ? '사용중' : '사용중단'}
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="no-ec" onClick={() => removeRule(r)} style={btnLink('#c60a2e')}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <MailDetail
          mail={open}
          canHandle={open.type === 'SHARED' && open.assigneeId === user?.id && open.status !== 'HANDLED'}
          canAssign={open.type === 'SHARED' && open.status !== 'HANDLED'}
          canTrash={!open.deletedAt && open.type === 'INTERNAL'}
          inTrash={!!open.deletedAt}
          onAssign={() => assign(open)}
          onHandle={() => handle(open)}
          onTrash={() => trashMail(open)}
          onRestore={() => restoreMail(open)}
          onPermanentDelete={() => permanentDelete(open)}
          onClose={() => setOpen(null)}
        />
      )}

      {(compose || editDraft) && (
        <ComposeForm
          mode={editDraft ? 'internal' : (compose as 'internal' | 'shared')}
          initial={editDraft}
          users={users.filter((u) => u.id !== user?.id)}
          onClose={() => { setCompose(null); setEditDraft(null) }}
          onSaved={(msg) => { setCompose(null); setEditDraft(null); flash(msg); load() }}
        />
      )}
    </EcListShell>
  )
}

function btnLink(color: string): CSSProperties {
  return { border: 'none', background: 'none', color, cursor: 'pointer', fontSize: 12, margin: '0 4px' }
}

function MailDetail({ mail, canAssign, canHandle, canTrash, inTrash, onAssign, onHandle, onTrash, onRestore, onPermanentDelete, onClose }: {
  mail: Mail
  canAssign: boolean
  canHandle: boolean
  canTrash: boolean
  inTrash: boolean
  onAssign: () => void
  onHandle: () => void
  onTrash: () => void
  onRestore: () => void
  onPermanentDelete: () => void
  onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 640, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{mail.typeName}{inTrash && ' · 지운함'}</span>
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
          {inTrash && <button className="ec-btn" onClick={onRestore}>복원</button>}
          {inTrash && <button className="ec-btn" style={{ color: '#c60a2e' }} onClick={onPermanentDelete}>영구삭제</button>}
          {canTrash && <button className="ec-btn" style={{ color: '#c60a2e' }} onClick={onTrash}>삭제</button>}
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function ComposeForm({ mode, initial, users, onClose, onSaved }: {
  mode: 'internal' | 'shared'
  initial?: Mail | null
  users: User[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [recipientId, setRecipientId] = useState(initial?.recipientId ? String(initial.recipientId) : '')
  const [fromAddress, setFromAddress] = useState('')
  const [subject, setSubject] = useState(initial && initial.subject !== '(제목 없음)' ? initial.subject : '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isDraft = !!initial

  async function send() {
    setError('')
    if (mode === 'internal' && !recipientId) return setError('받는 사람을 선택하세요.')
    if (mode === 'shared' && !fromAddress.trim()) return setError('보낸 사람 주소를 입력하세요.')
    if (!subject.trim()) return setError('제목을 입력하세요.')
    setSaving(true)
    try {
      if (isDraft) {
        await api.put(`/mails/drafts/${initial!.id}`, { recipientId: Number(recipientId), subject, body })
        await api.post(`/mails/drafts/${initial!.id}/send`)
        onSaved('메일을 보냈습니다.')
      } else if (mode === 'internal') {
        await api.post('/mails', { recipientId: Number(recipientId), subject, body })
        onSaved('메일을 보냈습니다.')
      } else {
        await api.post('/mails/shared', { fromAddress, subject, body })
        onSaved('공용메일을 등록했습니다.')
      }
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }

  async function saveDraft() {
    setError(''); setSaving(true)
    try {
      const payload = { recipientId: recipientId ? Number(recipientId) : undefined, subject, body }
      if (isDraft) await api.put(`/mails/drafts/${initial!.id}`, payload)
      else await api.post('/mails/drafts', payload)
      onSaved('임시보관함에 저장했습니다.')
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 640, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>
            {mode === 'internal' ? (isDraft ? '임시보관 메일 (수정/발송)' : '메일쓰기 (사내메일)') : '공용메일 수신등록'}
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
          <button className="ec-btn ec-btn-primary" onClick={send} disabled={saving}>
            {saving ? '처리 중…' : mode === 'internal' ? '보내기(F8)' : '등록(F8)'}
          </button>
          {mode === 'internal' && (
            <button className="ec-btn" onClick={saveDraft} disabled={saving}>임시저장</button>
          )}
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, ShortMessage, User } from '../../api/types'
import { shiftMonths, ymd } from '../../components/EcPeriodPicks'
import { partnerCodeItems } from '../../utils/codeItems'

/**
 * 그룹웨어 > 쪽지 (이카운트 E010851 쪽지수발신내역 · C000663 커뮤니케이션센터 — 원본 DOM 이 같은 화면이다)
 *
 * 함(전체/미확인/확인/보관함/보낸쪽지) + 발송일자·보낸사람·받는사람·거래처·내용 조건검색.
 * 시스템 자동알림(전자결재 결재요청·최종완료·반려)은 보낸사람이 'ECOUNT' 로 표시되고
 * 연결전표(기안번호)를 눌러 해당 결재함으로 이동한다.
 */
const BOXES = [
  { key: 'received', label: '전체' },
  { key: 'unread', label: '미확인' },
  { key: 'read', label: '확인' },
  { key: 'archived', label: '보관함' },
  { key: 'sent', label: '보낸쪽지' },
] as const
type BoxKey = (typeof BOXES)[number]['key']

const iso = (d: Date) => ymd(d)
const when = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '')

export default function ShortMessagePage() {
  const navigate = useNavigate()
  const [box, setBox] = useState<BoxKey>('received')
  const [rows, setRows] = useState<ShortMessage[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [checked, setChecked] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const today = iso(new Date())
  const monthAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return iso(d) })()
  const [from, setFrom] = useState(monthAgo)
  const [to, setTo] = useState(today)
  const [senderId, setSenderId] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [keyword, setKeyword] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load(b: BoxKey = box) {
    setLoading(true); setError('')
    try {
      const r = await api.get<ShortMessage[]>('/short-messages', {
        params: {
          box: b, from, to,
          senderId: senderId || undefined,
          recipientId: recipientId || undefined,
          partnerId: partnerId || undefined,
          keyword: keyword.trim() || undefined,
        },
      })
      setRows(r.data)
      setChecked([])
    } catch (err) { setError(extractErrorMessage(err)) } finally { setLoading(false) }
  }

  useEffect(() => { load(box) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [box])
  useEffect(() => {
    api.get<User[]>('/users').then((r) => setUsers(r.data)).catch(() => {})
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
  }, [])

  const unread = useMemo(() => rows.filter((r) => !r.archived && r.readAt === null).length, [rows])

  const preset = (mode: 'today' | 'week' | 'month' | 'm3') => {
    const t = new Date()
    if (mode === 'today') { setFrom(iso(t)); setTo(iso(t)) }
    else if (mode === 'week') { const f = new Date(); f.setDate(f.getDate() - 6); setFrom(iso(f)); setTo(iso(t)) }
    else if (mode === 'month') { setFrom(iso(t).slice(0, 8) + '01'); setTo(iso(t)) }
    // setMonth 를 그냥 쓰면 5월 31일에서 3개월 전이 3월 3일로 넘어간다(2월 31일 → 3월 3일).
    else { setFrom(iso(shiftMonths(t, -3))); setTo(iso(t)) }
  }

  const toggle = (id: number) =>
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  async function markRead(m: ShortMessage) {
    if (m.readAt || box === 'sent') return
    try { await api.post(`/short-messages/${m.id}/read`); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  async function archiveChecked(archived: boolean) {
    if (checked.length === 0) return alert('쪽지를 선택하세요.')
    try {
      await Promise.all(checked.map((id) =>
        api.post(`/short-messages/${id}/${archived ? 'archive' : 'unarchive'}`)))
      flash(archived ? `${checked.length}건을 보관했습니다.` : `${checked.length}건을 보관함에서 꺼냈습니다.`)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function deleteChecked() {
    if (checked.length === 0) return alert('쪽지를 선택하세요.')
    if (!window.confirm(`선택한 ${checked.length}건을 삭제할까요?`)) return
    try {
      await api.post('/short-messages/delete', { ids: checked })
      flash(`${checked.length}건을 삭제했습니다.`); load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  const inputCls = 'ec-input'
  const label = (t: string) => <div style={{ color: '#5a626e', marginBottom: 3 }}>{t}</div>

  return (
    <EcListShell
      title="쪽지"
      formTitle="쪽지 쓰기"
      formWidth={520}
      renderForm={(close) => (
        <ComposeForm users={users} partners={partners} onDone={() => { close(); flash('쪽지를 보냈습니다.'); load() }} />
      )}
      actions={[
        { label: '검색(F8)', onClick: () => load(), primary: true },
        { label: box === 'archived' ? '보관해제' : '보관', onClick: () => archiveChecked(box !== 'archived') },
        { label: '선택삭제', onClick: deleteChecked, disabled: checked.length === 0 },
        { label: 'Excel' },
      ]}
      help={
        <p style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          사용자끼리 주고받는 단문 쪽지입니다. 전자결재 결재요청·최종완료·반려는 시스템이 자동으로
          쪽지를 보냅니다(보낸사람 ECOUNT). 연결전표를 누르면 해당 결재함으로 이동합니다.
        </p>
      }
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <p style={{ background: '#eaf4ea', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{notice}</p>}

      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {BOXES.map((b) => (
          <button
            key={b.key}
            className="ec-btn"
            onClick={() => setBox(b.key)}
            style={box === b.key
              ? { background: 'var(--ec-blue)', color: '#fff', borderColor: 'var(--ec-blue)' }
              : undefined}
          >
            {b.label}{b.key === 'unread' && unread > 0 && box === 'unread' ? ` (${unread})` : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', border: '1px solid var(--ec-border)', background: '#f7f9fb', padding: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 12.5 }}>{label('발송일자')}
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        </label>
        <div style={{ display: 'flex', gap: 3 }}>
          <button className="ec-btn" onClick={() => preset('today')}>금일</button>
          <button className="ec-btn" onClick={() => preset('week')}>최근7일</button>
          <button className="ec-btn" onClick={() => preset('month')}>금월</button>
          <button className="ec-btn" onClick={() => preset('m3')}>3개월</button>
        </div>
        <CodePickerField label="보낸사람" value={senderId} onChange={setSenderId} width={120}
                         items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name, sub: u.department }))} />
        <CodePickerField label="받는사람" value={recipientId} onChange={setRecipientId} width={120}
                         items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name, sub: u.department }))} />
        <CodePickerField label="거래처" value={partnerId} onChange={setPartnerId} width={150}
                         items={partnerCodeItems(partners)} />
        <label style={{ fontSize: 12.5 }}>{label('내용')}
          <input className={inputCls} value={keyword} onChange={(e) => setKeyword(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') load() }} style={{ width: 200 }} placeholder="본문 키워드" /></label>
        <button className="ec-btn ec-btn-primary" onClick={() => load()}>검색(F8)</button>
      </div>

      <div style={{ marginBottom: 6, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        검색결과 <b style={{ color: 'var(--ec-blue-dark)' }}>{rows.length}</b>건
        {box !== 'sent' && <> · 미확인 <b style={{ color: 'var(--ec-blue)' }}>{unread}</b>건</>}
      </div>

      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}>
            <input type="checkbox" checked={rows.length > 0 && checked.length === rows.length}
                   onChange={(e) => setChecked(e.target.checked ? rows.map((r) => r.id) : [])} />
          </th>
          <th style={{ width: 130 }}>{box === 'sent' ? '받는 사람' : '보낸 사람'}</th>
          <th>내용</th>
          <th style={{ width: 140 }}>발송일자</th>
          <th style={{ width: 70, textAlign: 'center' }}>상태</th>
          <th style={{ width: 200 }}>연결전표</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((m) => (
            <tr key={m.id} style={{ background: !m.readAt && box !== 'sent' ? '#f4f8fd' : undefined }}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.includes(m.id)} onChange={() => toggle(m.id)} />
              </td>
              <td style={{ fontWeight: m.system ? 700 : 400, color: m.system ? 'var(--ec-blue-dark)' : undefined }}>
                {box === 'sent' ? m.recipientName : m.senderName}
              </td>
              <td style={{ cursor: box === 'sent' ? 'default' : 'pointer', fontWeight: !m.readAt && box !== 'sent' ? 600 : 400 }}
                  onClick={() => markRead(m)} title={box === 'sent' ? undefined : '클릭하면 확인 처리됩니다.'}>
                {m.content}
                {m.partnerName && <span style={{ color: '#5a626e' }}> · {m.partnerName}</span>}
              </td>
              <td style={{ fontFamily: 'monospace' }}>{when(m.sentAt)}</td>
              <td style={{ textAlign: 'center', color: m.readAt ? '#8a929c' : 'var(--ec-blue)', fontWeight: 700 }}>
                {box === 'sent' ? (m.readAt ? '확인' : '미확인') : m.statusName}
              </td>
              <td>
                {m.linkRef && (
                  m.linkPath
                    ? <button onClick={() => navigate(m.linkPath!)}
                              style={{ background: 'none', border: 0, padding: 0, color: 'var(--ec-blue)', cursor: 'pointer', textDecoration: 'underline', fontSize: 12.5 }}>
                        {m.linkSource} &gt; {m.linkRef}
                      </button>
                    : <span style={{ color: '#5a626e' }}>{m.linkSource} &gt; {m.linkRef}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

/** 쪽지 쓰기 — 받는 사람 복수 선택(사람 수만큼 쪽지가 생긴다), 거래처 연결은 선택. */
function ComposeForm({ users, partners, onDone }: { users: User[]; partners: Partner[]; onDone: () => void }) {
  const [recipientIds, setRecipientIds] = useState<number[]>([])
  const [content, setContent] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setError('')
    if (recipientIds.length === 0) return setError('받는 사람을 선택하세요.')
    if (!content.trim()) return setError('내용을 입력하세요.')
    setSaving(true)
    try {
      await api.post('/short-messages', {
        recipientIds, content: content.trim(), partnerId: partnerId ? Number(partnerId) : undefined,
      })
      onDone()
    } catch (err) { setError(extractErrorMessage(err)) } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', borderRadius: 3 }}>{error}</p>}
      {/* 받는 사람은 원본도 코드도움 팝업 + tags-input(복수)이다. 사용자가 늘면 체크박스 나열은 못 쓴다. */}
      <CodePickerField
        label="받는 사람"
        multiple
        width={320}
        placeholder="받는 사람을 선택하세요"
        values={recipientIds.map(String)}
        onChangeMulti={(vals) => setRecipientIds(vals.map(Number))}
        items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name, sub: u.department }))}
      />
      <label>
        <div style={{ color: '#5a626e', marginBottom: 4 }}>내용</div>
        <textarea className="ec-input" value={content} onChange={(e) => setContent(e.target.value)}
                  rows={4} style={{ width: '100%' }} placeholder="쪽지 내용을 입력하세요." />
      </label>
      <label>
        <div style={{ color: '#5a626e', marginBottom: 4 }}>거래처 (선택)</div>
        <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 220 }}>
          <option value="">지정 안 함</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <div style={{ textAlign: 'right' }}>
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>
          {saving ? '보내는 중…' : '보내기'}
        </button>
      </div>
    </div>
  )
}

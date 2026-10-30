import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import type { ChatMessage, ChatRoom, EmployeeMaster, User } from '../../types/api'
import { useAuth } from '../auth/AuthContext'
import { ecConfirm } from '../../components/EcDialog'
import { Icon } from './icons'
import CodePickerField from '../../components/CodePickerField'

/** 폴링 주기(ms). 소켓 대신 증분 폴링(afterId) — 서버에 실시간 통로가 아직 없다. */
const POLL_MS = 4000
const STATUS = ['온라인', '자리비움', '다른용무중', '오프라인'] as const
type Status = (typeof STATUS)[number]

/**
 * Messenger 창 안 — 원본 2026-10-30 loginaa 캡처 01:
 *   위: 내 동그라미 · '온라인 ▾' · 오른쪽 [검색] [대화] [설정]
 *   목록: 회사 줄 · 알림 줄 / '대화방 (n)' 접기 / '사용자' — 부서별 접기 묶음(사원이 안 이어진 사용자는 '기타'), 접속 안 한 사람은 흐린 글자.
 * 사람을 누르면 1:1 대화 창을 연다(같은 상대와는 늘 같은 방 — 서버 /chat/rooms/direct).
 *
 * <p>접속 여부는 서버가 아직 모른다(접속 신호 API 없음) — 나만 진하게, 나머지는 흐리게 둔다.
 */
export default function Messenger({ companyName, alertCount, onOpenNotices, onOpenChat }: {
  companyName: string | null
  alertCount: number
  onOpenNotices: () => void
  onOpenChat: (room: ChatRoom) => void
}) {
  const { user } = useAuth()
  const meId = user?.id ?? null
  const [status, setStatus] = useState<Status>(() => (localStorage.getItem('ec-messenger-status') as Status) || '온라인')
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [deptOf, setDeptOf] = useState<Map<number, { dept: string; order: number }>>(new Map())
  const [view, setView] = useState<'list' | 'new' | 'settings'>('list')
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const [roomsOpen, setRoomsOpen] = useState(false)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [showOff, setShowOff] = useState(() => localStorage.getItem('ec-messenger-showoff') !== 'n')
  const [picked, setPicked] = useState<number[]>([])
  const [roomName, setRoomName] = useState('')
  const [error, setError] = useState('')

  const loadRooms = useCallback(() => {
    api.get<ChatRoom[]>('/chat/rooms').then((r) => setRooms(r.data)).catch((err) => setError(extractErrorMessage(err)))
  }, [])
  useEffect(() => {
    loadRooms()
    const t = window.setInterval(loadRooms, POLL_MS)
    return () => window.clearInterval(t)
  }, [loadRooms])
  useEffect(() => {
    api.get<User[]>('/users').then((r) => setUsers(r.data.filter((u) => u.enabled))).catch((err) => setError(extractErrorMessage(err)))
    /* 사원의 부서 — 사원등록 순서대로 묶음을 세운다. 사원을 못 보는 사람은 사용자의 부서 글자로 묶는다. */
    api.get<EmployeeMaster[]>('/employees/all')
      .then((r) => setDeptOf(new Map(r.data.map((e, i) => [e.id, { dept: e.department || '기타', order: i }]))))
      .catch(() => setDeptOf(new Map()))
  }, [])

  const unreadByUser = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of rooms) {
      if (!r.direct) continue
      const other = r.members.find((x) => x.userId !== meId)
      if (other) m.set(other.userId, (m.get(other.userId) ?? 0) + r.unread)
    }
    return m
  }, [rooms, meId])
  const unreadTotal = rooms.reduce((n, r) => n + r.unread, 0)

  /* 부서 묶음 — '기타'(사원이 안 이어진 사용자)가 맨 위, 나머지는 사원등록 순서 */
  const groups = useMemo(() => {
    const k = q.trim().toLowerCase()
    const map = new Map<string, { order: number; users: User[] }>()
    for (const u of users) {
      if (k && !u.name.toLowerCase().includes(k) && !u.username.toLowerCase().includes(k)) continue
      const e = u.employeeId != null ? deptOf.get(u.employeeId) : undefined
      const dept = e ? e.dept : u.employeeId == null ? '기타' : (u.department || '기타')
      const order = dept === '기타' ? -1 : e?.order ?? 9999
      const g = map.get(dept) ?? { order, users: [] }
      g.order = Math.min(g.order, order)
      g.users.push(u)
      map.set(dept, g)
    }
    return [...map.entries()]
      .map(([dept, g]) => ({ dept, order: g.order, users: g.users.sort((a, b) => a.name.localeCompare(b.name, 'ko')) }))
      .sort((a, b) => a.order - b.order || a.dept.localeCompare(b.dept, 'ko'))
  }, [users, deptOf, q])

  const online = (u: User) => u.id === meId && status !== '오프라인'

  async function talkTo(u: User) {
    if (u.id === meId) return
    setError('')
    try {
      const { data } = await api.post<ChatRoom>('/chat/rooms/direct', { userId: u.id })
      onOpenChat(data)
      loadRooms()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function startGroup() {
    if (picked.length === 0) return setError('대화 상대를 선택하세요.')
    setError('')
    try {
      const { data } = picked.length === 1
        ? await api.post<ChatRoom>('/chat/rooms/direct', { userId: picked[0] })
        : await api.post<ChatRoom>('/chat/rooms', {
          name: roomName.trim() || users.filter((u) => picked.includes(u.id)).map((u) => u.name).join(', '),
          memberIds: picked,
        })
      setPicked([]); setRoomName(''); setView('list')
      onOpenChat(data)
      loadRooms()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const fold = (key: string) => setClosed((c) => ({ ...c, [key]: !c[key] }))

  return (
    <>
      <div className="ec-msg-top">
        <span className="me" title={user?.name}>{(user?.name ?? '?').slice(0, 1)}</span>
        <select aria-label="상태" value={status} onChange={(e) => { setStatus(e.target.value as Status); localStorage.setItem('ec-messenger-status', e.target.value) }}>
          {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="icons">
          <button type="button" title="검색" aria-label="검색" className={searching ? 'on' : ''} onClick={() => { setSearching((s) => !s); setQ('') }}><Icon name="search" /></button>
          <button type="button" title="대화" aria-label="대화" className={view === 'new' ? 'on' : ''} onClick={() => setView(view === 'new' ? 'list' : 'new')}><Icon name="chat" /></button>
          <button type="button" title="설정" aria-label="설정" className={view === 'settings' ? 'on' : ''} onClick={() => setView(view === 'settings' ? 'list' : 'settings')}><Icon name="gear" /></button>
        </span>
      </div>
      {searching && (
        <div className="ec-msg-search">
          <input className="ec-input" autoFocus placeholder="이름 · 아이디" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {error && <p className="ec-alert ec-alert-danger mx-[10px] mt-[6px] mb-0">{error}</p>}
      {view === 'settings' && (
        <div className="ec-msg-set">
          <label className="flex items-center gap-[6px]">
            <input type="checkbox" checked={showOff} onChange={(e) => { setShowOff(e.target.checked); localStorage.setItem('ec-messenger-showoff', e.target.checked ? 'y' : 'n') }} />
            접속 안 한 사용자도 보기
          </label>
        </div>
      )}

      {view === 'new' ? (
        <>
          <div className="ec-msg-list">
            <div className="ec-msg-sect">대화 상대 고르기</div>
            {picked.length > 1 && <input className="ec-input w-full mb-[6px]" placeholder="대화방 이름 (비우면 참여자 이름)" value={roomName} onChange={(e) => setRoomName(e.target.value)} />}
            {groups.map((g) => (
              <div key={g.dept}>
                <div className="ec-msg-grp">{g.dept} ({g.users.length})</div>
                {g.users.filter((u) => u.id !== meId).map((u) => (
                  <label key={u.id} className="ec-msg-pick">
                    <input type="checkbox" checked={picked.includes(u.id)} onChange={() => setPicked((p) => (p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id]))} />
                    {u.name}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="ec-msg-foot">
            <span className="ec-appwin-hint">{picked.length}명 선택</span>
            <button type="button" className="ec-btn" onClick={() => { setView('list'); setPicked([]) }}>취소</button>
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void startGroup()}>대화 시작</button>
          </div>
        </>
      ) : (
        <div className="ec-msg-list">
          <div className="ec-msg-co"><Icon name="company" />{companyName || '회사'}</div>
          <div className="ec-msg-co" onClick={onOpenNotices}>
            <Icon name="bell" />알림
            {alertCount > 0 && <span className="ec-msg-count">{alertCount > 99 ? '99+' : alertCount}</span>}
          </div>
          <div className="ec-msg-sep" />

          <div className="ec-msg-sect" onClick={() => setRoomsOpen((o) => !o)}>
            대화방 ({rooms.length})
            {unreadTotal > 0 && <span className="ec-msg-count">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
            <span className="fold">{roomsOpen ? '⌃' : '⌄'}</span>
          </div>
          {roomsOpen && (rooms.length === 0
            ? <div className="ec-msg-room ec-appwin-hint">대화방이 없습니다.</div>
            : rooms.map((r) => (
              <div key={r.id} className="ec-msg-room" onClick={() => onOpenChat(r)}>
                <span className="name">{r.title}{!r.direct && ` (${r.memberCount})`}</span>
                <span className="last">{r.lastMessage ?? ''}</span>
                {r.unread > 0 && <span className="ec-msg-count">{r.unread}</span>}
              </div>
            )))}

          <div className="ec-msg-sep" />
          <div className="ec-msg-sect">사용자</div>
          {groups.map((g) => {
            const shown = g.users.filter((u) => showOff || online(u))
            if (shown.length === 0) return null
            return (
              <div key={g.dept}>
                <div className="ec-msg-grp" onClick={() => fold(g.dept)}>{closed[g.dept] ? '›' : '⌄'} {g.dept} ({g.users.length})</div>
                {!closed[g.dept] && shown.map((u) => {
                  const n = unreadByUser.get(u.id) ?? 0
                  return (
                    <div key={u.id} className={`ec-msg-user${online(u) ? '' : ' off'}`} title={u.id === meId ? '나' : `${u.name} — 눌러서 대화`} onClick={() => void talkTo(u)}>
                      {online(u) && <span className="dot" />}
                      {u.name}
                      {n > 0 && <span className="ec-msg-count">{n}</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/** 1:1 · 여럿 대화 창 안 — 메시지 목록 + 입력. 열려 있는 동안 4초마다 새 메시지만 받는다. */
export function ChatRoomView({ room, onLeft, onRead, onChanged }: { room: ChatRoom; onLeft: () => void; onRead: () => void; onChanged: (r: ChatRoom) => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const meId = user?.id ?? null
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<null | 'invite' | 'rename'>(null)
  const [users, setUsers] = useState<User[]>([])
  const [inviteIds, setInviteIds] = useState<string[]>([])
  const [name, setName] = useState(room.title)
  const lastId = useRef(0)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => { lastId.current = messages.length ? messages[messages.length - 1].id : 0 }, [messages])
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'end' }) }, [messages])

  useEffect(() => {
    let alive = true
    api.get<ChatMessage[]>(`/chat/rooms/${room.id}/messages`)
      .then(async (r) => { if (!alive) return; setMessages(r.data); await api.post(`/chat/rooms/${room.id}/read`); onRead() })
      .catch((err) => setError(extractErrorMessage(err)))
    const t = window.setInterval(async () => {
      try {
        const { data } = await api.get<ChatMessage[]>(`/chat/rooms/${room.id}/messages`, { params: { afterId: lastId.current } })
        if (data.length > 0 && alive) {
          setMessages((prev) => [...prev, ...data.filter((m) => !prev.some((p) => p.id === m.id))])
          await api.post(`/chat/rooms/${room.id}/read`)
          onRead()
        }
      } catch { /* 다음 주기에 다시 */ }
    }, POLL_MS)
    return () => { alive = false; window.clearInterval(t) }
  }, [room.id, onRead])

  async function send() {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    try {
      const { data } = await api.post<ChatMessage>(`/chat/rooms/${room.id}/messages`, { content })
      setMessages((prev) => [...prev, data])
      setText('')
    } catch (err) { setError(extractErrorMessage(err)) } finally { setSending(false) }
  }
  async function openInvite() {
    setMode(mode === 'invite' ? null : 'invite')
    if (users.length === 0) api.get<User[]>('/users').then((r) => setUsers(r.data.filter((u) => u.enabled))).catch((err) => setError(extractErrorMessage(err)))
  }
  /* 초대 — 1:1 방에서 초대하면 서버가 그 방을 여럿 방으로 바꾼다 */
  async function invite() {
    if (inviteIds.length === 0) return setError('초대할 사람을 선택하세요.')
    try {
      const { data } = await api.post<ChatRoom>(`/chat/rooms/${room.id}/invite`, { memberIds: inviteIds.map(Number) })
      setInviteIds([]); setMode(null); setError(''); onChanged(data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  /* 이름변경 — 여럿 방만(1:1 은 상대 이름이 곧 제목) */
  async function rename() {
    if (!name.trim()) return setError('대화방 이름을 입력하세요.')
    try {
      const { data } = await api.put<ChatRoom>(`/chat/rooms/${room.id}/name`, { name: name.trim() })
      setMode(null); setError(''); onChanged(data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  async function leave() {
    if (!(await ecConfirm(`[${room.title}] 대화방에서 나갈까요?`))) return
    try { await api.delete(`/chat/rooms/${room.id}/me`); onLeft() } catch (err) { setError(extractErrorMessage(err)) }
  }

  return (
    <>
      <div className="ec-chat-who">
        <span className="members">{room.members.map((m) => m.name + (m.department ? `(${m.department})` : '')).join(' · ')}</span>
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openInvite()}>초대</button>
        {!room.direct && <button type="button" className="ec-btn ec-btn-sm" onClick={() => setMode(mode === 'rename' ? null : 'rename')}>이름변경</button>}
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => void leave()}>나가기</button>
      </div>
      {mode === 'invite' && (
        <div className="ec-chat-who">
          <CodePickerField label="초대" hideLabel multiple width={220} values={inviteIds} onChangeMulti={(v) => setInviteIds(v)}
                           items={users.filter((u) => !room.members.some((m) => m.userId === u.id)).map((u) => ({ value: String(u.id), code: u.username, name: u.name, sub: u.department }))} />
          <button type="button" className="ec-btn ec-btn-sm ec-btn-primary" onClick={() => void invite()}>초대</button>
        </div>
      )}
      {mode === 'rename' && (
        <div className="ec-chat-who">
          <input className="ec-input flex-1" aria-label="대화방 이름" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="ec-btn ec-btn-sm ec-btn-primary" onClick={() => void rename()}>저장</button>
        </div>
      )}
      {error && <p className="ec-alert ec-alert-danger mx-[10px] mt-[6px] mb-0">{error}</p>}
      <div className="ec-chat-log">
        {messages.length === 0 && <p className="ec-chat-sys">첫 메시지를 보내 보세요.</p>}
        {messages.map((m, i) => {
          const day = m.sentAt.slice(0, 10)
          const newDay = i === 0 || messages[i - 1].sentAt.slice(0, 10) !== day
          return (
            <div key={m.id}>
              {newDay && <div className="ec-chat-day">{day.replace(/-/g, '/')}</div>}
              {m.system ? <div className="ec-chat-sys">{m.content}</div> : (
                <div className={`ec-chat-msg${m.senderId === meId ? ' mine' : ''}`}>
                  {m.senderId !== meId && <span className="from">{m.senderName}</span>}
                  <div className="line"><span className="bubble">{m.content}
                    {/* 권한요청 알림 — 원본 메신저 [보기] 로 요청 내역(권한승인대기현황)을 연다 */}
                    {m.linkTo && <button type="button" className="ec-btn ec-btn-sm ec-chat-view" onClick={() => navigate(m.linkTo!)}>보기</button>}
                  </span><span className="time">{m.sentAt.slice(11, 16)}</span></div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottom} />
      </div>
      <div className="ec-chat-input">
        <textarea className="ec-input" aria-label="메시지" value={text} placeholder="메시지 입력 (Enter 보내기 · Shift+Enter 줄바꿈)"
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
        <button type="button" className="ec-btn ec-btn-primary" disabled={sending || !text.trim()} onClick={() => void send()}>보내기</button>
      </div>
    </>
  )
}

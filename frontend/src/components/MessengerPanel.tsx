import { useCallback, useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../api/client'
import type { ChatMessage, ChatRoom, User } from '../api/types'
import { useAuth } from '../auth/AuthContext'

/** 폴링 주기(ms). 소켓 대신 증분 폴링(afterId)이라 새 메시지만 내려온다. */
const POLL_MS = 4000

/**
 * 사내 메신저 패널(앱바 💬).
 *
 * 대화방 목록 → 대화 → 새 대화 세 화면을 한 패널 안에서 오간다.
 * 패널이 열려 있는 동안만 폴링하고 닫히면 멈춘다(배지는 레이아웃이 따로 센다).
 */
export default function MessengerPanel({ onUnreadChange }: { onUnreadChange?: () => void }) {
  const { user } = useAuth()
  const meId = user?.id ?? null
  const [view, setView] = useState<'list' | 'room' | 'new'>('list')
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState('')

  const loadRooms = useCallback(async () => {
    try {
      const { data } = await api.get<ChatRoom[]>('/chat/rooms')
      setRooms(data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }, [])

  useEffect(() => { loadRooms() }, [loadRooms])

  // 목록 화면에서만 방 목록을 갱신한다. 대화 중에는 메시지 폴링이 따로 돈다.
  useEffect(() => {
    if (view !== 'list') return
    const t = window.setInterval(loadRooms, POLL_MS)
    return () => window.clearInterval(t)
  }, [view, loadRooms])

  async function openRoom(r: ChatRoom) {
    setError('')
    setRoom(r)
    setView('room')
    try {
      const { data } = await api.get<ChatMessage[]>(`/chat/rooms/${r.id}/messages`)
      setMessages(data)
      await api.post(`/chat/rooms/${r.id}/read`)
      onUnreadChange?.()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  function backToList() {
    setRoom(null)
    setMessages([])
    setView('list')
    loadRooms()
    onUnreadChange?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {error && (
        <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, margin: '10px 12px 0' }}>
          {error}
        </p>
      )}

      {view === 'list' && (
        <RoomList rooms={rooms} onOpen={openRoom} onNew={() => { setError(''); setView('new') }} />
      )}

      {view === 'new' && (
        <NewChat
          meId={meId}
          onCancel={() => setView('list')}
          onCreated={(r) => { loadRooms(); openRoom(r) }}
          onError={setError}
        />
      )}

      {view === 'room' && room && (
        <RoomView
          room={room}
          meId={meId}
          messages={messages}
          setMessages={setMessages}
          setRoom={setRoom}
          onBack={backToList}
          onError={setError}
          onUnreadChange={onUnreadChange}
        />
      )}
    </div>
  )
}

/* ── 방 목록 ─────────────────────────────────────────────────── */

function RoomList({ rooms, onOpen, onNew }: { rooms: ChatRoom[]; onOpen: (r: ChatRoom) => void; onNew: () => void }) {
  return (
    <>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--ec-border)' }}>
        <button className="ec-btn ec-btn-primary" style={{ width: '100%' }} onClick={onNew}>＋ 새 대화</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {rooms.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 24, fontSize: 12.5 }}>
            대화방이 없습니다.<br />[새 대화]로 시작하세요.
          </p>
        ) : rooms.map((r) => (
          <div
            key={r.id}
            onClick={() => onOpen(r)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderBottom: '1px solid #eef1f5', cursor: 'pointer',
              background: r.unread > 0 ? '#f4f8fd' : '#fff',
            }}
          >
            <Avatar label={r.title} group={!r.direct} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2b3340', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title}
                </span>
                {!r.direct && <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.memberCount}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9aa1ab', whiteSpace: 'nowrap' }}>
                  {shortTime(r.lastMessageAt)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ flex: 1, fontSize: 12, color: '#7b8390', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.lastMessage ? (r.direct ? '' : `${r.lastSenderName}: `) + r.lastMessage : '대화 없음'}
                </span>
                {r.unread > 0 && (
                  <span style={{
                    minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#c60a2e',
                    color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{r.unread}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/* ── 새 대화 ─────────────────────────────────────────────────── */

function NewChat({ meId, onCancel, onCreated, onError }: {
  meId: number | null
  onCancel: () => void
  onCreated: (r: ChatRoom) => void
  onError: (m: string) => void
}) {
  const [users, setUsers] = useState<User[]>([])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<number[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<User[]>('/users')
      .then((r) => setUsers(r.data.filter((u) => u.enabled && u.id !== meId)))
      .catch((err) => onError(extractErrorMessage(err)))
  }, [meId, onError])

  const matched = users.filter((u) => {
    const k = q.trim().toLowerCase()
    if (!k) return true
    return u.name.toLowerCase().includes(k) || (u.department ?? '').toLowerCase().includes(k)
  })

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  /** 한 명이면 1:1(기존 방 재사용), 여러 명이면 그룹방. */
  async function start() {
    if (picked.length === 0) return onError('대화 상대를 선택하세요.')
    setBusy(true)
    try {
      const { data } = picked.length === 1
        ? await api.post<ChatRoom>('/chat/rooms/direct', { userId: picked[0] })
        : await api.post<ChatRoom>('/chat/rooms', {
            name: name.trim() || users.filter((u) => picked.includes(u.id)).map((u) => u.name).join(', '),
            memberIds: picked,
          })
      onCreated(data)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--ec-border)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button className="ec-btn" onClick={onCancel}>← 목록</button>
          <span style={{ alignSelf: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>새 대화</span>
        </div>
        <input
          className="ec-input" value={q} autoFocus onChange={(e) => setQ(e.target.value)}
          placeholder="이름·부서로 찾기" style={{ width: '100%' }}
        />
        {picked.length > 1 && (
          <input
            className="ec-input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="대화방 이름 (비우면 참여자 이름)" style={{ width: '100%', marginTop: 6 }}
          />
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {matched.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 24, fontSize: 12.5 }}>해당하는 사용자가 없습니다.</p>
        ) : matched.map((u) => (
          <label key={u.id} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
            borderBottom: '1px solid #eef1f5', cursor: 'pointer',
            background: picked.includes(u.id) ? 'var(--ec-blue-light)' : '#fff',
          }}>
            <input type="checkbox" checked={picked.includes(u.id)} onChange={() => toggle(u.id)} />
            <Avatar label={u.name} group={false} />
            <span style={{ fontSize: 12.5, color: '#2b3340', fontWeight: 600 }}>{u.name}</span>
            <span style={{ fontSize: 11.5, color: '#9aa1ab' }}>{u.department ?? ''}</span>
          </label>
        ))}
      </div>

      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--ec-border)', display: 'flex', gap: 6 }}>
        <span style={{ alignSelf: 'center', fontSize: 12, color: '#7b8390' }}>{picked.length}명 선택</span>
        <button className="ec-btn ec-btn-primary" style={{ marginLeft: 'auto' }} onClick={start} disabled={busy}>
          {busy ? '여는 중…' : picked.length > 1 ? '그룹 대화 만들기' : '대화 시작'}
        </button>
      </div>
    </>
  )
}

/* ── 대화 ────────────────────────────────────────────────────── */

function RoomView({ room, meId, messages, setMessages, setRoom, onBack, onError, onUnreadChange }: {
  room: ChatRoom
  meId: number | null
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setRoom: (r: ChatRoom) => void
  onBack: () => void
  onError: (m: string) => void
  onUnreadChange?: () => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  // 폴링 콜백이 매번 새로 만들어지지 않도록 마지막 id 를 ref 로 둔다(setInterval 재등록 방지).
  const lastIdRef = useRef(0)

  useEffect(() => {
    lastIdRef.current = messages.length ? messages[messages.length - 1].id : 0
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  // 증분 폴링: 마지막으로 받은 메시지 이후만 가져오고, 새 게 있으면 읽음 처리한다.
  useEffect(() => {
    const t = window.setInterval(async () => {
      try {
        const { data } = await api.get<ChatMessage[]>(`/chat/rooms/${room.id}/messages`, {
          params: { afterId: lastIdRef.current },
        })
        if (data.length > 0) {
          setMessages((prev) => [...prev, ...data])
          await api.post(`/chat/rooms/${room.id}/read`)
          onUnreadChange?.()
        }
      } catch {
        /* 폴링 실패는 조용히 넘긴다 — 다음 주기에 다시 시도한다. */
      }
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [room.id, setMessages, onUnreadChange])

  async function send() {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    try {
      const { data } = await api.post<ChatMessage>(`/chat/rooms/${room.id}/messages`, { content })
      setMessages((prev) => [...prev, data])
      setText('')
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  async function leave() {
    if (!window.confirm(`[${room.title}] 대화방에서 나갈까요?`)) return
    try {
      await api.delete(`/chat/rooms/${room.id}/me`)
      onBack()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  async function invite() {
    const who = window.prompt('초대할 사람의 이름을 입력하세요.')
    if (!who?.trim()) return
    try {
      const { data: users } = await api.get<User[]>('/users')
      const hit = users.filter((u) => u.enabled && u.name === who.trim())
      if (hit.length === 0) return onError(`'${who.trim()}' 사용자를 찾을 수 없습니다.`)
      const { data } = await api.post<ChatRoom>(`/chat/rooms/${room.id}/invite`, { memberIds: hit.map((u) => u.id) })
      setRoom(data)
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--ec-border)' }}>
        <button className="ec-btn" onClick={onBack}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2b3340', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {room.title}
          </div>
          <div
            onClick={() => setShowMembers((v) => !v)}
            style={{ fontSize: 11, color: 'var(--ec-blue)', cursor: 'pointer' }}
          >
            참여자 {room.memberCount}명 {showMembers ? '▲' : '▼'}
          </div>
        </div>
        {!room.direct && <button className="ec-btn" onClick={invite}>초대</button>}
        <button className="ec-btn" style={{ color: '#c60a2e' }} onClick={leave}>나가기</button>
      </div>

      {showMembers && (
        <div style={{ padding: '6px 12px', background: '#f7f9fc', borderBottom: '1px solid var(--ec-border)', fontSize: 11.5, color: '#5a626e' }}>
          {room.members.map((m) => m.name + (m.department ? ` (${m.department})` : '')).join(' · ')}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: 12, background: '#eef1f6' }}>
        {messages.length === 0 && (
          <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20, fontSize: 12.5 }}>첫 메시지를 보내보세요.</p>
        )}
        {messages.map((m, i) => {
          const showDate = i === 0 || dayOf(m.sentAt) !== dayOf(messages[i - 1].sentAt)
          return (
            <div key={m.id}>
              {showDate && (
                <div style={{ textAlign: 'center', margin: '8px 0', fontSize: 11, color: '#8a929c' }}>{dayOf(m.sentAt)}</div>
              )}
              {m.system ? (
                <div style={{ textAlign: 'center', margin: '6px 0', fontSize: 11, color: '#8a929c' }}>{m.content}</div>
              ) : (
                <Bubble message={m} mine={m.senderId === meId} showSender={!room.direct} />
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--ec-border)' }}>
        <textarea
          className="ec-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter 전송 / Shift+Enter 줄바꿈 (메신저 관행)
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
          }}
          placeholder="메시지를 입력하세요. (Enter 전송 · Shift+Enter 줄바꿈)"
          style={{ flex: 1, height: 52, padding: 7, resize: 'none' }}
        />
        <button className="ec-btn ec-btn-primary" onClick={send} disabled={sending || !text.trim()}>전송</button>
      </div>
    </>
  )
}

function Bubble({ message, mine, showSender }: { message: ChatMessage; mine: boolean; showSender: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', margin: '4px 0' }}>
      {!mine && showSender && (
        <span style={{ fontSize: 11, color: '#7b8390', marginBottom: 2 }}>{message.senderName}</span>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flexDirection: mine ? 'row-reverse' : 'row', maxWidth: '86%' }}>
        <div style={{
          padding: '7px 10px', borderRadius: 8, fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: mine ? 'var(--ec-blue)' : '#fff',
          color: mine ? '#fff' : '#2b3340',
          border: mine ? 'none' : '1px solid var(--ec-border)',
        }}>
          {message.content}
        </div>
        <span style={{ fontSize: 10, color: '#8a929c', whiteSpace: 'nowrap' }}>{hhmm(message.sentAt)}</span>
      </div>
    </div>
  )
}

function Avatar({ label, group }: { label: string; group: boolean }) {
  return (
    <span style={{
      width: 28, height: 28, borderRadius: group ? 6 : 14, flexShrink: 0,
      background: group ? '#e6edf8' : 'var(--ec-blue-light)',
      color: 'var(--ec-blue-dark)', fontSize: 12, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {group ? '👥' : (label || '?').slice(0, 1)}
    </span>
  )
}

/* ── 시각 표기 ───────────────────────────────────────────────── */

function dayOf(iso: string) {
  return iso.slice(0, 10).replace(/-/g, '.')
}

function hhmm(iso: string) {
  return iso.slice(11, 16)
}

/** 방 목록의 오른쪽 시각 — 오늘이면 HH:mm, 아니면 MM.DD */
function shortTime(iso: string | null) {
  if (!iso) return ''
  const today = new Date().toISOString().slice(0, 10)
  return iso.slice(0, 10) === today ? hhmm(iso) : iso.slice(5, 10).replace('-', '.')
}

import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { ChatRoom, User } from '../../types/api'
import { useAuth } from '../auth/AuthContext'
import { ecAlert } from '../../components/EcDialog'
import AppWindow from '../appbar/AppWindow'
import { ChatRoomView } from '../appbar/Messenger'

/**
 * 게시판 위젯의 작성자 이름 → 그 사람과의 1:1 대화 창(원본 2026-10-30 홈 공지사항 '이카운트' → '쪽지1:1 대화').
 * 앱바 Messenger 의 1:1 대화 창(같은 상대와는 늘 같은 방 — /chat/rooms/direct)을 그대로 쓴다. 나 자신이면 열 것이 없다.
 */
export default function ChatWithWindow({ username, onClose }: { username: string; onClose: () => void }) {
  const { user } = useAuth()
  const [room, setRoom] = useState<ChatRoom | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const users = (await api.get<User[]>('/users')).data
        const who = users.find((u) => u.username === username)
        if (!who) { await ecAlert('대화할 사용자를 찾을 수 없습니다.'); onClose(); return }
        if (who.username === user?.username) { await ecAlert('본인과는 대화할 수 없습니다.'); onClose(); return }
        const { data } = await api.post<ChatRoom>('/chat/rooms/direct', { userId: who.id })
        if (live) setRoom(data)
      } catch (err) {
        if (live) { void ecAlert(extractErrorMessage(err)); onClose() }
      }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  if (!room) return null
  return (
    <AppWindow title="쪽지1:1 대화" kind="ec-chat" front onClose={onClose}>
      <ChatRoomView room={room} onRead={() => {}} onChanged={setRoom} onLeft={onClose} />
    </AppWindow>
  )
}

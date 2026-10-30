import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import type { ChatRoom, NotificationResponse } from '../../types/api'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { Icon, type IconName } from './icons'
import AppWindow from './AppWindow'
import Messenger, { ChatRoomView } from './Messenger'
import { AiWindow, BookmarkWindow, NoteWindow, NotificationWindow, SearchWindow, ShortMessageWindow, SmsWindow, TimelineWindow, type NoteTab } from './windows'

/**
 * 오른쪽 세로 앱바 — 원본 ec56(2026-10-30 loginaa 실측, plans/데이터이관/오른쪽앱바-메신저) 순서 · 이름 그대로.
 * 마우스를 올리면 왼쪽에 흰 말풍선으로 이름, 메신저 · 알림 · 쪽지는 안 읽은 수를 빨간 배지로, 맨 아래 [숨김 아이콘] 은 아이콘을 접는다.
 * 휴대폰 폭(≤768)에서는 앱바가 숨고 머리의 앱 모음(세 칸 격자)이 같은 목록을 쓴다(EcountLayout).
 */
export type AppKey =
  | 'dark' | 'ai' | 'search' | 'smart' | 'newwin' | 'notes' | 'notifications' | 'shortmsg' | 'messenger' | 'sms' | 'email'
  | 'perm' | 'remote' | 'timeline' | 'bookmark' | 'userpay' | 'hide'
export interface AppItem { key: AppKey; label: string; icon: IconName; tone: string }
export const APP_ITEMS: AppItem[] = [
  { key: 'dark', label: '다크모드로보기', icon: 'dark', tone: 'ink' },
  { key: 'ai', label: '업무지원AI', icon: 'ai', tone: 'sky' },
  { key: 'search', label: '통합검색', icon: 'search', tone: 'blue' },
  { key: 'smart', label: '스마트지원', icon: 'smart', tone: 'teal' },
  { key: 'newwin', label: '새창열기', icon: 'newwin', tone: 'green' },
  { key: 'notes', label: 'E Note', icon: 'enote', tone: 'red' },
  { key: 'notifications', label: '알림', icon: 'bell', tone: 'orange' },
  { key: 'shortmsg', label: '쪽지', icon: 'note', tone: 'green' },
  { key: 'messenger', label: '메신저', icon: 'messenger', tone: 'blue' },
  { key: 'sms', label: 'SMS', icon: 'sms', tone: 'green' },
  { key: 'email', label: 'Email', icon: 'email', tone: 'orange' },
  { key: 'perm', label: '권한있는메뉴만보기', icon: 'perm', tone: 'blue' },
  { key: 'remote', label: '원격지원', icon: 'remote', tone: 'blue' },
  { key: 'timeline', label: '타임라인', icon: 'timeline', tone: 'blue' },
  { key: 'bookmark', label: '북마크', icon: 'bookmark', tone: 'orange' },
  { key: 'userpay', label: 'UserPay', icon: 'userpay', tone: 'ink' },
  { key: 'hide', label: '숨김 아이콘', icon: 'hide', tone: 'ink' },
]

/** 창으로 뜨는 것 — 제목은 원본 창 제목 */
type WinKey = 'ai' | 'search' | 'notes' | 'notifications' | 'shortmsg' | 'sms' | 'timeline' | 'bookmark'
const WIN_TITLE: Record<WinKey, string> = {
  ai: '업무지원AI', search: '통합검색', notes: 'E Note', notifications: '알림', shortmsg: '쪽지', sms: 'SMS', timeline: '타임라인', bookmark: '북마크',
}
const WIN_PAGE: Partial<Record<WinKey, string>> = { shortmsg: '/groupware/messages' }

const NOTE_SUB: { tab: NoteTab; label: string }[] = [
  { tab: 'todo', label: 'To Do' }, { tab: 'memo', label: 'Memo' }, { tab: 'files', label: '개인파일함' }, { tab: 'images', label: '이미지파일함' },
]

/* 스마트지원 메뉴(원본 04) — 공지사항만 우리 화면이 있고, 나머지는 이카운트 고객센터 서비스다 */
const SMART: { icon: IconName; label: string; to?: string }[] = [
  { icon: 'remote', label: '원격지원/상담 신청' }, { icon: 'phone', label: '전화상담' },
  { icon: 'video', label: '동영상 강좌' }, { icon: 'book', label: '매뉴얼' },
  { icon: 'megaphone', label: '공지사항', to: '/groupware/notice' }, { icon: 'list', label: '상담내역' },
  { icon: 'spark', label: '신규기능' }, { icon: 'up', label: '서비스 업그레이드 안내' },
]

export const EMAIL_NOTICE = '이카운트 웹메일 서비스를 사용하지 않는 회사입니다.\n\nWebmail 서비스 신청 후 이용 가능합니다.\n자세한 사항은 회사 관리자에게 문의해 주십시오.'
export const USERPAY_NOTICE = 'UserPay 서비스 대상자가 아닙니다.\nUserPay 서비스를 신청하시겠습니까?'

const isDark = () => localStorage.getItem('ec-dark') === 'y'

export default function AppBar({ companyName, permOnly, onPermOnly }: {
  companyName: string | null
  permOnly: boolean
  onPermOnly: (on: boolean) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [win, setWin] = useState<WinKey | null>(null)
  const [noteTab, setNoteTab] = useState<NoteTab>('todo')
  const [messenger, setMessenger] = useState(false)
  const [chat, setChat] = useState<ChatRoom | null>(null)
  const [smart, setSmart] = useState(false)
  const [front, setFront] = useState<'win' | 'messenger' | 'chat'>('win')
  const [folded, setFolded] = useState(() => localStorage.getItem('ec-appbar-folded') === 'y')
  const [dark, setDark] = useState(isDark)
  const [alertCount, setAlertCount] = useState(0)
  const [chatCount, setChatCount] = useState(0)
  const [noteCount, setNoteCount] = useState(0)
  const [permToast, setPermToast] = useState<NotificationResponse['notifications'][number] | null>(null)
  const closeToast = () => { if (permToast) sessionStorage.setItem('ec-perm-req-seen', String(permToast.count)); setPermToast(null) }

  useEffect(() => { document.documentElement.classList.toggle('ec-dark', dark) }, [dark])

  /* 안 읽은 수 — 창을 열지 않아도 새 것을 알아야 하므로 30초마다 센다. 창을 닫거나 화면을 옮기면 바로 다시 센다. */
  const count = useCallback(() => {
    api.get<NotificationResponse>('/workspace/notifications').then((r) => {
      setAlertCount(r.data.total)
      /* 권한요청이 새로 늘었으면 오른쪽 아래 알림창(마스터만 받는 알림이다) */
      const req = r.data.notifications.find((n) => n.type === 'PERMISSION_REQUEST')
      const seen = Number(sessionStorage.getItem('ec-perm-req-seen') ?? '0')
      if (req && req.count > seen) setPermToast(req)
      if (!req) sessionStorage.setItem('ec-perm-req-seen', '0')
    }).catch(() => setAlertCount(0))
    api.get<{ unread: number }>('/chat/unread-count').then((r) => setChatCount(r.data.unread)).catch(() => setChatCount(0))
    api.get<{ unread: number }>('/short-messages/unread-count').then((r) => setNoteCount(r.data.unread)).catch(() => setNoteCount(0))
  }, [])
  useEffect(() => {
    count()
    const t = window.setInterval(count, 30000)
    return () => window.clearInterval(t)
  }, [count, win, messenger, location.pathname])
  const countChat = useCallback(() => {
    api.get<{ unread: number }>('/chat/unread-count').then((r) => setChatCount(r.data.unread)).catch(() => undefined)
  }, [])

  const act = useCallback(async (key: AppKey) => {
    setSmart(false)
    switch (key) {
      case 'dark': setDark((d) => { localStorage.setItem('ec-dark', d ? 'n' : 'y'); return !d }); return
      case 'smart': setSmart((s) => !s); return
      case 'newwin': window.open(window.location.href, '_blank', 'noopener,noreferrer'); return
      case 'messenger': setMessenger(true); setFront('messenger'); return
      case 'perm': onPermOnly(!permOnly); return
      case 'hide': setFolded((f) => { localStorage.setItem('ec-appbar-folded', f ? 'n' : 'y'); return !f }); return
      case 'email': await ecAlert(EMAIL_NOTICE); return
      case 'userpay':
        if (await ecConfirm(USERPAY_NOTICE)) await ecAlert('UserPay 신청은 이 ERP 에서 받지 않습니다.\n회사 관리자에게 문의해 주십시오.')
        return
      case 'remote':
        await ecAlert('원격지원은 상담원이 이 PC 화면을 함께 보며 도와 드리는 서비스입니다.\n원격지원 프로그램을 내려받아 상담원이 알려 준 접속번호를 넣어 주십시오.\n(이 ERP 에서는 원격지원 상담을 제공하지 않습니다.)')
        return
      case 'notes': setNoteTab('todo'); setWin('notes'); setFront('win'); return
      default: setWin(key); setFront('win')
    }
  }, [onPermOnly, permOnly])

  /* 화면 안의 버튼(근태조회 [메신저] · 설문조사조회 [대화방]) · 휴대폰 앱 모음이 같은 창을 열어 달라고 알린다(components/AppBarPanel) */
  useEffect(() => {
    const open = (e: Event) => void act((e as CustomEvent<AppKey>).detail)
    window.addEventListener('ec:open-panel', open)
    return () => window.removeEventListener('ec:open-panel', open)
  }, [act])

  const badge = (k: AppKey) => (k === 'messenger' ? chatCount : k === 'notifications' ? alertCount : k === 'shortmsg' ? noteCount : 0)
  const label = (a: AppItem) => (a.key === 'dark' && dark ? '라이트모드로보기' : a.key === 'hide' && folded ? '아이콘 보이기' : a.label)
  const on = (k: AppKey) => (k === 'dark' && dark) || (k === 'perm' && permOnly) || (k === 'smart' && smart)
    || (k === 'messenger' && messenger) || (k === win)

  const button = (a: AppItem) => {
    const n = badge(a.key)
    return (
      <button type="button" className={`ec-appbar-btn${on(a.key) ? ' on' : ''}`} data-tone={a.tone} data-app={a.key}
              aria-label={label(a)} onClick={() => void act(a.key)}>
        <Icon name={a.icon} />
        <span className="ec-appbar-tip">{label(a)}</span>
        {n > 0 && <span className="ec-appbar-badge">{n > 99 ? '99+' : n}</span>}
      </button>
    )
  }

  return (
    <>
      <div className={`ec-appbar${folded ? ' folded' : ''}`}>
        {APP_ITEMS.filter((a) => !folded || a.key === 'hide').map((a) => (
          a.key === 'notes' ? (
            <div key={a.key} className="ec-appbar-item">
              {button(a)}
              <div className="ec-appbar-sub">
                <div className="head">E Note</div>
                {NOTE_SUB.map((s) => <button key={s.tab} type="button" onClick={() => { setNoteTab(s.tab); setWin('notes'); setFront('win') }}>{s.label}</button>)}
              </div>
            </div>
          ) : <div key={a.key} className="ec-appbar-item">{button(a)}</div>
        ))}
      </div>

      {smart && (
        <>
          <div className="ec-smart-back" onClick={() => setSmart(false)} />
          <div className="ec-smart-menu" role="menu" aria-label="스마트지원">
            {SMART.map((s) => (
              <button key={s.label} type="button" role="menuitem" onClick={() => {
                setSmart(false)
                if (s.to) navigate(s.to)
                else void ecAlert(`[${s.label}] 은(는) 이카운트 고객센터 서비스입니다.\n이 ERP 에서는 제공하지 않습니다.`)
              }}><Icon name={s.icon} />{s.label}</button>
            ))}
          </div>
        </>
      )}

      {win && (
        <AppWindow title={WIN_TITLE[win]} onClose={() => setWin(null)} popout={WIN_PAGE[win]} front={front === 'win'} onFront={() => setFront('win')}>
          {win === 'ai' ? <AiWindow />
            : win === 'search' ? <SearchWindow onClose={() => setWin(null)} />
            : win === 'notes' ? <NoteWindow key={noteTab} initialTab={noteTab} onClose={() => setWin(null)} />
            : win === 'notifications' ? <NotificationWindow onClose={() => setWin(null)} />
            : win === 'shortmsg' ? <ShortMessageWindow onClose={() => setWin(null)} />
            : win === 'sms' ? <SmsWindow onClose={() => setWin(null)} />
            : win === 'timeline' ? <TimelineWindow onClose={() => setWin(null)} />
            : <BookmarkWindow onClose={() => setWin(null)} />}
        </AppWindow>
      )}

      {messenger && (
        <AppWindow title="Messenger" kind="ec-messenger" front={front === 'messenger'} onFront={() => setFront('messenger')} onClose={() => { setMessenger(false); setChat(null) }}>
          <Messenger companyName={companyName} alertCount={alertCount} onOpenNotices={() => { setWin('notifications'); setFront('win') }} onOpenChat={(r) => { setChat(r); setFront('chat') }} />
        </AppWindow>
      )}
      {permToast && (
        <div className="ec-perm-toast" role="status" aria-label="권한요청 알림">
          <div className="head"><span>{permToast.title}</span><button type="button" aria-label="닫기" onClick={closeToast}>✕</button></div>
          <div className="body">{permToast.message}</div>
          <button type="button" className="ec-btn ec-btn-sm ec-btn-primary" onClick={() => { closeToast(); navigate(permToast.to) }}>보기</button>
        </div>
      )}
      {chat && (
        <AppWindow title={chat.title} kind="ec-chat" side front={front === 'chat'} onFront={() => setFront('chat')} onClose={() => { setChat(null); countChat() }}>
          <ChatRoomView key={chat.id} room={chat} onRead={countChat} onChanged={setChat} onLeft={() => { setChat(null); countChat() }} />
        </AppWindow>
      )}
    </>
  )
}

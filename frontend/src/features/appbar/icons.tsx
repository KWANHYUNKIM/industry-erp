/**
 * 오른쪽 앱바 · 앱바 창의 선 아이콘. 원본(2026-10-30 loginaa 캡처)은 이모지가 아니라 둥근 선 그림이다 —
 * 같은 굵기(1.8) · 둥근 끝 · 글자색(currentColor)으로 그리고, 색은 단추가 고른다(shell.css data-tone).
 */
export type IconName =
  | 'dark' | 'ai' | 'search' | 'smart' | 'newwin' | 'enote' | 'bell' | 'note' | 'messenger' | 'sms' | 'email'
  | 'perm' | 'remote' | 'timeline' | 'bookmark' | 'userpay' | 'hide'
  | 'pin' | 'refresh' | 'max' | 'close' | 'popout' | 'chat' | 'gear' | 'company' | 'video' | 'book' | 'phone' | 'megaphone' | 'list' | 'spark' | 'up'

const PATHS: Record<IconName, string[]> = {
  dark: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  ai: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'],
  search: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'M16 16l4.5 4.5'],
  smart: ['M4 15v-3a8 8 0 0 1 16 0v3', 'M4 14h3v5H5a1 1 0 0 1-1-1z', 'M20 14h-3v5h2a1 1 0 0 0 1-1z'],
  newwin: ['M14 4h6v6', 'M20 4l-8 8', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  enote: ['M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z', 'M6 3v18', 'M10 8h5', 'M10 12h5', 'M10 16h3'],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  note: ['M3 11l18-8-7 18-3-7z', 'M11 14l10-11'],
  messenger: ['M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M8 10.5h.01', 'M12 10.5h.01', 'M16 10.5h.01'],
  sms: ['M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M11 18h2', 'M10 8h4', 'M10 11h4'],
  email: ['M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M3.5 7l8.5 6 8.5-6'],
  perm: ['M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z', 'M9 12l2 2 4-4'],
  remote: ['M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M9 20h6', 'M12 16v4', 'M10 9l-2 1.5L10 12', 'M14 9l2 1.5-2 1.5'],
  timeline: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 7v5l3 2'],
  bookmark: ['M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z'],
  userpay: ['M3 7h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z', 'M3 7l2-3h14l2 3', 'M15 13h3'],
  hide: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  pin: ['M9 3h6l-1 6 3 3H7l3-3z', 'M12 12v9'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  max: ['M5 5h14v14H5z'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  popout: ['M14 4h6v6', 'M20 4l-8 8', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  chat: ['M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  gear: ['M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9l2.1 2.1', 'M17 17l2.1 2.1', 'M4.9 19.1L7 17', 'M17 7l2.1-2.1'],
  company: ['M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16', 'M15 10h4a1 1 0 0 1 1 1v10', 'M3 21h18', 'M8 8h3', 'M8 12h3', 'M8 16h3'],
  video: ['M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M16 10l5-3v10l-5-3'],
  book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 19V5'],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z'],
  megaphone: ['M3 10v4h4l8 5V5L7 10z', 'M18 9a4 4 0 0 1 0 6'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  spark: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'M6 6l2.5 2.5', 'M15.5 15.5L18 18', 'M6 18l2.5-2.5', 'M15.5 8.5L18 6'],
  up: ['M12 20V5', 'M6 11l6-6 6 6'],
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

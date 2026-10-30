/**
 * 화면 틀의 선 아이콘 — 원본(ec56)은 이모지(🔍 📅)나 글자 기호(✕ □ ▾)가 아니라 얇은 단색 선 그림이다
 * (2026-10-30 loginaa 판매조회 실측, plans/데이터이관/원본-아이콘-달력.md).
 *
 *   <EcIcon name="search" />                     돋보기 14px, 색은 글자색(currentColor)
 *   <EcIcon name="caret-down" size={10} glyph="▾" />
 *
 * <ul>
 *   <li>색은 고르지 않는다 — 감싼 단추 · 칸의 글자색(토큰 클래스 text-ec-icon · 흰 창 머리)을 따른다.</li>
 *   <li><b>glyph</b> — 예전 글자 기호(▾ · ✕ · □)를 크기 0 글자로 남긴다. 화면은 그림만 보이고, 단추 글자로 찾는
 *       QA 흐름(`textContent.trim() === '라인별 ▾'`) · 표 오른쪽 메뉴(✕ 단추 = 삭제)는 그대로 맞는다.</li>
 * </ul>
 */
export type EcIconName =
  | 'search' | 'calendar' | 'close' | 'maximize' | 'restore' | 'refresh' | 'pin' | 'new-window'
  | 'chevron-down' | 'chevron-up' | 'chevron-left' | 'chevron-right'
  | 'caret-down' | 'caret-up'
  | 'star' | 'star-outline' | 'check' | 'plus' | 'user' | 'lock' | 'send'

/** 24 칸 판 위의 선. 끝은 둥글게, 굵기는 아래 STROKE. */
const PATHS: Record<EcIconName, string[]> = {
  search: ['M10.5 4.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12z', 'M15 15l5 5'],
  calendar: ['M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z', 'M4 10h16', 'M8.5 3.5v4', 'M15.5 3.5v4'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  maximize: ['M5.5 5.5h13v13h-13z'],
  restore: ['M4.5 9h10.5v10.5H4.5z', 'M9 9V4.5h10.5V15H15'],
  refresh: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.5 4.5v4.5H15'],
  pin: ['M9 3.5h6', 'M10 3.5v6l-3 3.5h10l-3-3.5v-6', 'M12 13v7.5'],
  'new-window': ['M13.5 4.5h6v6', 'M19.5 4.5l-8 8', 'M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'caret-down': [],
  'caret-up': [],
  star: [],
  'star-outline': ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  user: ['M12 4.5a3.75 3.75 0 1 0 0 7.5a3.75 3.75 0 1 0 0-7.5z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  lock: ['M6.5 11h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  // 종이비행기 — 원본 판매입력 아래 줄 맨 앞 단추(2026-10-31 loginad 실측)
  send: ['M20 4L3.5 10.5l6.5 3 3 6.5z', 'M20 4L10 13.5'],
}

/** 채워 그리는 것 — 단추의 펼침 화살(원본 fa-caret)과 담긴 즐겨찾기 ★. */
const FILLS: Partial<Record<EcIconName, string>> = {
  'caret-down': 'M6 9.5h12l-6 6.5z',
  'caret-up': 'M6 14.5h12l-6-6.5z',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
}

/** 선 굵기 — 14px 로 그리면 약 1.3px(원본 1.5px 안팎). */
const STROKE = 2

export default function EcIcon({
  name, size = 14, glyph, className, title,
}: {
  name: EcIconName
  /** 한 변 px(기본 14) */
  size?: number
  /** 예전 글자 기호 — 보이지 않는 글자로 남긴다(위 설명) */
  glyph?: string
  className?: string
  /** 마우스를 올렸을 때 글 — 단추에 title 이 있으면 빼 둔다 */
  title?: string
}) {
  const fill = FILLS[name]
  return (
    <>
      <svg
        className={className ? `ec-icon ${className}` : 'ec-icon'}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
      >
        {title && <title>{title}</title>}
        {fill && <path d={fill} fill="currentColor" stroke="none" />}
        {PATHS[name].map((d, i) => <path key={i} d={d} />)}
      </svg>
      {glyph && <span className="ec-icon-glyph">{glyph}</span>}
    </>
  )
}

export const EC_ICON_NAMES = Object.keys(PATHS) as EcIconName[]

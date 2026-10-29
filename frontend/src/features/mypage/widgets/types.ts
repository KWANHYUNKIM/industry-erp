import type { ReactNode } from 'react'

/**
 * MyPage 홈 위젯 — 원본 ec56 My위젯선택 실측(2026-10-30, .claude/skills/ecount-diff/plans/MyPage-위젯.md).
 *
 * 위젯은 두 갈래다.
 *   - 표 위젯(table): 열 · 종류 · 기준일자 · 정렬 · 줄수를 [설정] 창에서 바꾸고, 같은 틀(TableWidget)이 그린다.
 *   - 그 밖(render): 달력 · 플로우차트처럼 모양이 제각각인 것. 자기 컴포넌트를 갖는다.
 */

export type Cell = string | number | null | undefined
export type Row = Record<string, Cell>

export interface ColumnDef {
  key: string
  label: string
  /** 숫자 — 오른쪽 맞춤 · 천 단위 쉼표 · 종류별(품목별 …)로 묶을 때 더한다 */
  num?: boolean
  /** 처음에 꺼 둔 열(원본 '항목추가'에서 더 고를 수 있는 것) */
  off?: boolean
  /** 누르면 갈 화면(줄 값으로 주소를 만든다) */
  link?: (r: Row) => string | undefined
  /** 칸을 직접 그린다(게시판 '공지' 딱지) */
  cell?: (r: Row) => ReactNode
}

/** [설정] 창 칸 — 위젯마다 원본에 있는 칸만 켠다 */
export interface SettingFields {
  /** 종류 — 라인별이 아닌 값은 kindKey 의 열로 묶는다 */
  kinds?: string[]
  /** 종류 처음 값(없으면 라인별 · 첫 값) */
  defaultKind?: string
  /** 종류를 라디오로(매입매출장) */
  kindRadio?: boolean
  /** 검색조건 — 고르면 값 칸이 생긴다. filterKey 의 열에서 찾는다 */
  conditions?: string[]
  /** 기준일자 빠른선택(없으면 기준일자 칸이 없다) */
  periods?: string[]
  defaultPeriod?: string
  /** 진행상태 같은 위젯만의 고르기 칸 — 첫 값이 기본 */
  selects?: { key: string; label: string; options: string[]; def?: string }[]
  /** 적용양식 */
  forms?: string[]
  /** 줄수 처음 값(원본 기본 5, 게시판 6) */
  defaultRows?: number
  /** 줄수 칸이 없다(자금일보 — 다 보인다) */
  noRows?: boolean
  /** 정렬기준 칸이 없다 */
  noSort?: boolean
  /** 처음 정렬 열 */
  defaultSort?: string
}

export interface WidgetSettings {
  title?: string
  kind?: string
  condition?: string
  conditionValue?: string
  period?: string
  from?: string
  to?: string
  sortKey?: string
  sortDesc?: boolean
  form?: string
  rows?: number
  /** 보일 열 key — 없으면 기본(off 아닌 것 전부) */
  columns?: string[]
  /** selects 값 */
  extra?: Record<string, string>
}

export interface FetchArgs {
  from: string
  to: string
  kind: string
  settings: WidgetSettings
}

export interface TableSpec {
  columns: ColumnDef[]
  fetch: (a: FetchArgs) => Promise<Row[]>
  /** 종류 → 묶을 열 key. '라인별' · 없는 종류는 묶지 않는다 */
  kindKey?: Record<string, string>
  /** 검색조건 → 찾을 열 key(없으면 그 조건은 걸리지 않는다) */
  filterKey?: Record<string, string>
  /** 줄 바탕(게시판 공지 글은 노란 바탕) */
  rowClass?: (r: Row) => string | undefined
  /** 표 위 한 줄(전자결재 '◎ 내 기안문서') */
  caption?: (s: WidgetSettings) => string
}

/** 머리 아이콘 — 원본에 있는 것만. 삭제는 늘 있다 */
export interface Icons {
  window?: boolean
  refresh?: boolean
  new?: boolean
  setting?: boolean
}

export interface WidgetBodyProps {
  settings: WidgetSettings
  /** 새로고침을 누를 때마다 바뀐다 */
  tick: number
}

export interface WidgetDef {
  id: string
  /** My위젯선택 · 머리의 이름 */
  title: string
  /** [설정] 창 제목 칸의 처음 값(미입고현황 → '미구매현황') */
  settingTitle?: string
  group: '재고' | '회계' | '공통' | '게시판'
  icons: Icons
  /** 새창 — 그 메뉴 화면 */
  to?: string
  /** 신규 — 그 메뉴의 입력 화면 */
  newTo?: string
  /** 새로 올릴 때 크기(칸) — 원본 w8 h4, E Note 만 w10 */
  w?: number
  h?: number
  fields?: SettingFields
  /** 열이 정해진 표 위젯 */
  table?: TableSpec
  /** 표가 아닌 위젯 */
  render?: (p: WidgetBodyProps) => ReactNode
  /** 게시판 위젯의 게시판 id */
  boardId?: number
}

/** 원본 [설정] 기준일자 빠른선택(공통) */
export const PERIODS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '직접설정'] as const
/** 원본 [설정] 검색조건(공통) */
export const CONDITIONS = ['품목그룹1', '품목그룹2', '품목그룹3', '창고']
/** 원본 진행상태 고르기(미판매 · 미구매 · 미출하) */
export const PROGRESS = ['전체', '결재중', '미확인', '확인', '확인-진행중']

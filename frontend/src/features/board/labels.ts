import { api } from '../../api/client'

/** 게시판 라벨 마스터 한 줄 — 원본 '라벨조회'(라벨코드 · 라벨명 · 색상). */
export type BoardLabel = { id: number; board: string; code: string; name: string; color: string; active: boolean }

export const fetchLabels = async (board: string) =>
  (await api.get<BoardLabel[]>('/work-post-labels', { params: { board } })).data

/**
 * 원본 라벨 색상 팔레트(2026-10-12 loginaa E200080 '라벨등록' [색상 ▼] 실측) — 11색 × 7단, 열마다 밝은 것부터.
 * 맨 아래 [다른색]은 아무 색이나 고르는 칸이다. 기본은 검정.
 */
export const LABEL_PALETTE: string[][] = [
  ['#ffffff', '#f7f7f7', '#d4d4d4', '#aaaaaa', '#888888', '#555555', '#000000'],
  ['#d4dae4', '#b0b8cd', '#949db1', '#727a8c', '#5e6677', '#3f4757', '#1d2534'],
  ['#ffcdd2', '#fe9998', '#f35c4e', '#e94633', '#d73c2d', '#ca3626', '#bb2b1a'],
  ['#f9e6ad', '#f4d679', '#edb90f', '#eaa100', '#ea8f00', '#ea7e00', '#ea5d00'],
  ['#bce4ce', '#90d2af', '#33b579', '#36955f', '#247346', '#1d5b38', '#17492d'],
  ['#bdf0e9', '#92e7dc', '#02d7c5', '#11b3a5', '#018b80', '#026b60', '#024f43'],
  ['#b3e5fc', '#81d4fa', '#29b6f6', '#039be5', '#0288d1', '#0277bd', '#01579b'],
  ['#aec1ff', '#88a3f9', '#5874cd', '#2349ae', '#163fa2', '#083596', '#002381'],
  ['#c5c0da', '#9f97c1', '#7e6bad', '#584a8f', '#4f4083', '#473776', '#3a265f'],
  ['#d6bdcc', '#c492ac', '#a9537c', '#963a64', '#81355a', '#6e3051', '#4c2640'],
  ['#d2c5c1', '#b4a09a', '#826358', '#624339', '#5d4037', '#4e342e', '#3e2723'],
]
export const LABEL_DEFAULT_COLOR = '#000000'

/**
 * 원본 라벨 칩은 두 가지다 — 'label'(흰 글자)과 'label label-light'(검정 글자).
 * 원본은 밝기로 가르지 않는다: 실측(2026-10-13 E200190 · 2026-10-30 차량 게시판)
 *   검정 글자 — #f9e6ad 진행중 · #f4d679 출고완료 · #f35c4e 완료
 *   흰 글자   — #81d4fa 1차미팅 · 출고예정 · #0277bd · #888888 · (#92e7dc)
 * #f35c4e 가 #81d4fa 보다 어두운데도 검정이라, 팔레트 칸마다 정해 둔 값으로 본다(밝기 공식 하나로는 둘 다 못 맞춘다).
 * 잰 셋 + 같은 열에서 그보다 밝은 칸 + 흰 글자가 안 보일 회색 셋을 '밝은 칸' 으로 둔다. 재지 않은 칸은 흰 글자(원본 기본).
 * 팔레트 밖 [다른색] 은 아주 밝은 색(YIQ 200 이상)만 검정 글자로 — 흰 바탕에 흰 글자가 되지 않게.
 */
const LIGHT_LABEL_COLORS = new Set([
  '#ffffff', '#f7f7f7', '#d4d4d4',
  '#ffcdd2', '#fe9998', '#f35c4e',
  '#f9e6ad', '#f4d679', '#edb90f',
])
const PALETTE_SET = new Set(LABEL_PALETTE.flat())

export function labelIsLight(color?: string | null): boolean {
  if (!color) return false
  const c = color.trim().toLowerCase()
  if (LIGHT_LABEL_COLORS.has(c)) return true
  if (PALETTE_SET.has(c)) return false
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(c)
  if (!m) return false
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16))
  // 일정관리 [라벨] 거르기(2026-10-30 실측): [다른색] #ff0000 · #ff9900 은 검정 글자, #00ffff · #00ff00 · #bbbbbb 는 흰 글자 —
  // 팔레트에서 잰 검정 글자 칸(#f35c4e …)처럼 빨강 성분이 아주 센 색이 검정이다.
  return r >= 0xc8 || (r * 299 + g * 587 + b * 114) / 1000 >= 200
}

/**
 * 일정관리 '일정조회' 창의 라벨 칩 글자색(2026-10-30 실측, 인라인 color) — 칩 바탕의 빨강 성분이 절반 넘으면 검정.
 * #ff0000 · #ff9900 · #826358 · #88a3f9 → 검정, #00ffff · #000000 → 흰. 달력 칸 · 거르기 판과 규칙이 다르다.
 */
export function viewLabelLight(color?: string | null): boolean {
  const m = /^#([0-9a-f]{2})[0-9a-f]{4}$/i.exec((color ?? '').trim())
  return !!m && parseInt(m[1], 16) >= 0x80
}

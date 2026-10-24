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

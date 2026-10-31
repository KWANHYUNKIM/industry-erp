import { pad2 } from './periods.ts'
/**
 * Self-Customizing > 환경설정 > 기본값설정(C001124) 의 표시 값 — 순수 함수.
 * 원본 실측(2026-10-22, plans/self.md): 0값표시 {표시, 표시안함(기본)} — "표시하지 않을 경우 공란으로 표시됩니다." ·
 * 12/24시간제 적용예시 '오전 0:03'(12시간제 · 자정은 오전 0) · 인쇄정렬 {왼쪽, 가운데(기본), 오른쪽} · 인쇄방향 {세로(기본), 가로}.
 */
export interface DisplayPrefs {
  zeroDisplay: boolean
  clock24: boolean
  printAlign: 'LEFT' | 'CENTER' | 'RIGHT'
  printOrientation: 'PORTRAIT' | 'LANDSCAPE'
}

/** 원본 기본값. 서버에 값이 없을 때도 이것. */
export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  zeroDisplay: false, clock24: false, printAlign: 'CENTER', printOrientation: 'PORTRAIT',
}

export function toDisplayPrefs(r: Partial<DisplayPrefs> | null | undefined): DisplayPrefs {
  return {
    zeroDisplay: r?.zeroDisplay ?? DEFAULT_DISPLAY_PREFS.zeroDisplay,
    clock24: r?.clock24 ?? DEFAULT_DISPLAY_PREFS.clock24,
    printAlign: r?.printAlign ?? DEFAULT_DISPLAY_PREFS.printAlign,
    printOrientation: r?.printOrientation ?? DEFAULT_DISPLAY_PREFS.printOrientation,
  }
}

/** 0값표시 — 표시안함이면 0 은 공란, 그 밖은 fmt 그대로. */
export function zeroText(n: number, fmt: (n: number) => string, zeroDisplay: boolean): string {
  return n === 0 && !zeroDisplay ? '' : fmt(n)
}


/** 시각 — 12시간제 '오전 0:03' · '오후 12:30'(원본 적용예시), 24시간제 '0:03' · '13:30'. seconds 면 ':ss' 를 붙인다. */
export function timeText(d: Date, clock24: boolean, seconds = false): string {
  const h = d.getHours()
  const tail = `:${pad2(d.getMinutes())}${seconds ? `:${pad2(d.getSeconds())}` : ''}`
  if (clock24) return `${h}${tail}`
  return `${h < 12 ? '오전' : '오후'} ${h === 12 ? 12 : h % 12}${tail}`
}

/**
 * 인쇄설정 → 출력물 CSS(@page 방향 · 양식 자리). 양식 폭은 A4 세로 인쇄폭(210 − 여백 둘)으로 묶어,
 * 세로(기본)에서는 지금과 같고 가로에서 양식이 정렬대로 왼쪽 · 가운데 · 오른쪽에 선다.
 */
export function printPageCss(p: Pick<DisplayPrefs, 'printAlign' | 'printOrientation'>, marginMm = 12): string {
  const size = p.printOrientation === 'LANDSCAPE' ? 'landscape' : 'portrait'
  const place = p.printAlign === 'LEFT' ? 'margin-right: auto;' : p.printAlign === 'RIGHT' ? 'margin-left: auto;' : 'margin-left: auto; margin-right: auto;'
  return `@page { size: A4 ${size}; margin: ${marginMm}mm; } @media print { .doc { max-width: ${210 - marginMm * 2}mm; ${place} } }`
}

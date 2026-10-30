/**
 * 본문 편집기 도구 모음의 고를 거리 — 원본 기안서작성 편집 도구 모음(2026-10-30 실측, 캡처 11-편집도구모음.png).
 * 색 값은 화면(.tsx)이 아니라 여기 둔다 — 글자색 · 칸 바탕은 문서에 그대로 박히는 <b>자료</b>다.
 */

/** 글꼴 — 표시명 → CSS font-family. 원본 기본은 돋움. */
export const FONTS: { name: string; css: string }[] = [
  { name: '돋움', css: 'Dotum, 돋움, sans-serif' },
  { name: '굴림', css: 'Gulim, 굴림, sans-serif' },
  { name: '바탕', css: 'Batang, 바탕, serif' },
  { name: '궁서', css: 'Gungsuh, 궁서, serif' },
  { name: '맑은 고딕', css: '"Malgun Gothic", 맑은 고딕, sans-serif' },
  { name: '나눔고딕', css: '"Nanum Gothic", 나눔고딕, sans-serif' },
  { name: 'Arial', css: 'Arial, sans-serif' },
  { name: 'Tahoma', css: 'Tahoma, sans-serif' },
  { name: 'Verdana', css: 'Verdana, sans-serif' },
  { name: 'Times New Roman', css: '"Times New Roman", serif' },
  { name: 'Courier New', css: '"Courier New", monospace' },
]

/** 글자 크기(px). 원본 도구 모음은 '10px' 로 서 있다. */
export const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 26, 28, 32, 36, 48]

/** 계산된 font-family 글 → 목록의 표시명(못 찾으면 첫 글꼴). */
export function fontNameOf(css: string): string {
  const first = css.split(',')[0].replace(/["']/g, '').trim().toLowerCase()
  const hit = FONTS.find((f) => f.css.toLowerCase().split(',').some((x) => x.replace(/["']/g, '').trim() === first))
  return hit?.name ?? FONTS[0].name
}

/** 색 판 — 6 × 8. 첫 줄은 회색조. */
export const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#efefef', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8',
  '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6',
  '#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763',
]

/** 도구 모음의 처음 색 — 글자색 · 글자 바탕색 · 칸 바탕색(왼쪽 단추가 바로 칠하는 색). */
export const DEFAULT_COLORS = { text: '#000000', textBg: '#ffff00', cellBg: '#efefef' }

/** 링크 칸 처음 글. */
export const LINK_PREFIX = 'https:' + '//'

/** 테두리 선 — 굵기 × 모양. */
export const LINE_STYLES = ['solid', 'dashed', 'dotted', 'double'] as const
export const borderLine = (px: number, style: string, color = '#000000') => `${style === 'double' ? Math.max(3, px) : px}px ${style} ${color}`

/** 선 넣기(가로줄). */
export const hrHtml = (style: string) =>
  `<hr style="border:0;border-top:${style === 'double' ? 3 : 1}px ${style} #000000;margin:6px 0">`

/** 글상자 — 원본 삽입 › 글상자. 앞 · 뒤로 보내기를 위해 position:relative 로 둔다. */
export const TEXTBOX_HTML =
  '<div class="ec-textbox" style="display:inline-block;position:relative;z-index:1;min-width:120px;min-height:24px;padding:4px 6px;border:1px solid #000000">&nbsp;</div>&nbsp;'

/**
 * 도장 — 내 도장 이미지가 있으면 그것, 없으면 이름을 적은 빨간 동그라미 자리표시.
 * (우리는 아직 도장 · 서명 이미지를 올리는 곳이 없다 — 원본 [My도장/서명].)
 */
export function stampHtml(name: string, imageUrl?: string | null): string {
  if (imageUrl) return `<img class="ec-stamp" src="${imageUrl}" alt="도장" style="width:48px;height:48px;position:relative">`
  const safe = name.replace(/[<>&"]/g, '')
  return '<span class="ec-stamp" style="display:inline-block;position:relative;width:48px;height:48px;line-height:44px;' +
    `border:2px solid #d00000;border-radius:50%;color:#d00000;text-align:center;font-size:12px;font-weight:700">${safe || '인'}</span>&nbsp;`
}

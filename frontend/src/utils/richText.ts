/**
 * 서식 편집기 본문(HTML) 다루기 — 원본 업무일지 입력 창의 에디터(Daum 에디터)가 본문을 HTML 로 저장한다.
 * 예전에 글자로만 저장된 글(태그 없음)도 그대로 읽혀야 해서 둘을 나눈다.
 */
const TAG = /<\/?(p|div|br|b|i|u|s|strike|strong|em|span|font|ul|ol|li|table|tbody|thead|tr|td|th|img|a|h[1-6]|blockquote|pre|hr)\b[^>]*>/i

export function isHtml(s: string | null | undefined): boolean {
  return !!s && TAG.test(s)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 글자로 저장된 본문을 편집기에 넣을 HTML 로(줄바꿈 → 문단). */
export function textToHtml(s: string | null | undefined): string {
  if (!s) return ''
  if (isHtml(s)) return s
  return s.split('\n').map((l) => `<p>${l === '' ? '<br>' : esc(l)}</p>`).join('')
}

/** 검색·인쇄 대신 쓰는 글자 — 태그를 걷고 문단 끝을 줄바꿈으로. */
export function htmlToText(s: string | null | undefined): string {
  if (!s) return ''
  if (!isHtml(s)) return s
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n+$/, '')
}

/** 편집기가 비었는지(빈 문단만 있는지). */
export function isBlankHtml(s: string): boolean {
  return htmlToText(s).trim() === '' && !/<img\b|<table\b/i.test(s)
}

/** 화면에 뿌리기 전 위험한 태그 · 속성을 걷는다(브라우저 전용). */
export function sanitizeHtml(s: string): string {
  if (typeof DOMParser === 'undefined') return esc(s)
  const doc = new DOMParser().parseFromString(`<body>${s}</body>`, 'text/html')
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form').forEach((e) => e.remove())
  doc.querySelectorAll('*').forEach((e) => {
    for (const a of Array.from(e.attributes)) {
      const n = a.name.toLowerCase()
      if (n.startsWith('on') || ((n === 'href' || n === 'src') && /^\s*javascript:/i.test(a.value))) e.removeAttribute(a.name)
    }
  })
  return doc.body.innerHTML
}

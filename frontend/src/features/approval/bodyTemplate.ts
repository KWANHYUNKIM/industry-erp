import type { ApprovalField } from '../../types/api'

/**
 * 공통양식 [기안내용] — 원본 입력화면설정 오른쪽 아래의 본문 서식(2026-10-30 loginaa 실측).
 * 원본 양식은 거의 다 **HTML 표**다('휴 가 신 청 서' 아래 소속 · 성명 · 직위 …).
 *
 * <p>서버 양식 마스터에는 본문 칸이 따로 없다. 그러나 field_schema 는 jsonb 라 무엇이든 받으므로
 * 그 목록 안에 키 `__body` 인 항목 하나로 싣는다 — 스키마를 바꾸지 않고 저장 · 복사(복사대상양식)까지 따라간다.
 * 입력 칸이 아니므로 기안서 작성 · 상세의 칸 목록에서는 {@link formFieldsOf} 로 뺀다.
 */
export const BODY_KEY = '__body'

type BodyEntry = { key: string; label: string; type: string; html?: string }

const isBody = (f: { key: string }) => f.key === BODY_KEY

/** 양식의 본문 서식 HTML. 없으면 ''. */
export function bodyHtmlOf(schema: readonly ApprovalField[] | null | undefined): string {
  const e = (schema ?? []).find(isBody) as BodyEntry | undefined
  return typeof e?.html === 'string' ? e.html : ''
}

/** 본문 서식을 뺀 진짜 입력 칸들. */
export function formFieldsOf(schema: readonly ApprovalField[] | null | undefined): ApprovalField[] {
  return (schema ?? []).filter((f) => !isBody(f))
}

/** 칸 목록 뒤에 본문 서식을 붙인다(빈 서식이면 붙이지 않는다). */
export function withBodyHtml(fields: ApprovalField[], html: string): ApprovalField[] {
  const rest = fields.filter((f) => !isBody(f))
  const clean = sanitizeHtml(html)
  if (!htmlHasContent(clean)) return rest
  const entry: BodyEntry = { key: BODY_KEY, label: '기안내용', type: 'html', html: clean }
  return [...rest, entry as unknown as ApprovalField]
}

/** 본문이 HTML(서식)인가 — 예전 기안서 본문은 맨 글자다. */
export function looksLikeHtml(s: string | null | undefined): boolean {
  return !!s && /<(table|p|div|br|span|b|strong|tr|td|font|h[1-6])\b/i.test(s)
}

/** 태그를 걷어낸 글자 · 표가 하나라도 있으면 내용이 있다. */
function htmlHasContent(html: string): boolean {
  if (/<table\b/i.test(html)) return true
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== ''
}

const DROP_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'select', 'textarea']

/**
 * 붙여 넣은 HTML 을 저장 · 표시 전에 씻는다 — 스크립트 · 이벤트 속성 · javascript: 주소를 뺀다.
 * 표 · 글꼴 · 정렬 · 테두리 같은 서식 속성(style · colspan · rowspan · width · align …)은 남긴다.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return html.replace(/<script[\s\S]*?<\/script>/gi, '')
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  doc.body.querySelectorAll(DROP_TAGS.join(',')).forEach((el) => el.remove())
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase()
      if (n.startsWith('on')) el.removeAttribute(a.name)
      else if ((n === 'href' || n === 'src' || n === 'xlink:href') && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name)
    }
  })
  // 전역 격자 규칙(#root table:not(.no-ec))이 붙여 넣은 서식의 선 · 여백을 덮지 않게 한다.
  doc.body.querySelectorAll('table').forEach((t) => t.classList.add('no-ec'))
  // 워드 · 엑셀에서 붙인 조각의 <!--StartFragment--> 같은 주석은 버린다.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT)
  const comments: Node[] = []
  while (walker.nextNode()) comments.push(walker.currentNode)
  comments.forEach((c) => c.parentNode?.removeChild(c))
  return doc.body.innerHTML.trim()
}

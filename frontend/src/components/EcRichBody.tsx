import { isHtml, sanitizeHtml } from '../utils/richText'

/** 본문 보기 — 서식 편집기가 만든 HTML 이면 그대로(걸러서), 예전 글자 본문이면 줄바꿈만 살린다. */
export default function EcRichBody({ content, className = '' }: { content: string | null | undefined; className?: string }) {
  if (isHtml(content)) return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeHtml(content ?? '') }} />
  return <div className={`whitespace-pre-wrap ${className}`}>{content ?? ''}</div>
}

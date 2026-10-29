import { useEffect, useRef, useState } from 'react'
import { sanitizeHtml } from '../bodyTemplate'

/** 처음 넣는 표 — 원본 서식처럼 이름 칸 · 값 칸 두 열. */
const NEW_TABLE =
  '<table class="no-ec" border="1" style="border-collapse:collapse;width:621px"><tbody>' +
  '<tr><td style="width:120px;text-align:center">&nbsp;</td><td>&nbsp;</td></tr>' +
  '<tr><td style="text-align:center">&nbsp;</td><td>&nbsp;</td></tr>' +
  '<tr><td style="text-align:center">&nbsp;</td><td>&nbsp;</td></tr>' +
  '</tbody></table><p><br></p>'

/**
 * 서식 있는 본문 편집기 — 공통양식 [기안내용] · 기안서 본문.
 *
 * <p>원본 본문은 표로 된 문서 서식이다. 편집 칸은 contentEditable 이라 한글 · 엑셀 · 웹에서 복사한 표를
 * <b>그대로 붙여 넣을 수 있고</b>, [HTML] 로 바꾸면 서식 원문을 직접 고치거나 붙인다.
 * 값은 HTML 글자로 올려 보낸다(저장 전에 {@link sanitizeHtml} 로 스크립트 · 이벤트 속성을 뺀다).
 */
export default function RichBodyEditor({ value, onChange, label = '기안내용', minHeight = 'min-h-[220px]' }: {
  value: string
  onChange: (html: string) => void
  /** 접근성 이름 · 시험이 칸을 찾는 이름 */
  label?: string
  minHeight?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState(false)

  // 밖에서 값이 바뀐 때만(양식을 새로 고름 · 불러옴) 편집 칸을 다시 그린다. 치는 중에 다시 그리면 커서가 튄다.
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== value) el.innerHTML = value
  }, [value, source])

  const emit = () => {
    const el = ref.current
    if (!el) return
    // 붙여 넣은 표가 전역 격자 모양으로 바뀌지 않게(sanitizeHtml 과 같은 꼬리표)
    el.querySelectorAll('table:not(.no-ec)').forEach((t) => t.classList.add('no-ec'))
    onChange(el.innerHTML)
  }

  function insertTable() {
    const el = ref.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    const inside = sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)
    if (inside) document.execCommand('insertHTML', false, NEW_TABLE)
    else el.insertAdjacentHTML('beforeend', NEW_TABLE)
    emit()
  }

  return (
    <div className="ec-rich-editor">
      <div className="ec-editor-bar">
        <div className="ec-editor-group">
          <div className="row">
            <button type="button" className="ec-btn ec-btn-sm" disabled={source} onClick={insertTable}>표 넣기</button>
            <button type="button" className={`ec-btn ec-btn-sm${source ? ' ec-btn-primary' : ''}`}
                    onClick={() => { if (!source) emit(); setSource((v) => !v) }}>HTML</button>
          </div>
          <div className="name">삽입</div>
        </div>
      </div>
      {source ? (
        <textarea aria-label={`${label} HTML`} className={`ec-rich-source ${minHeight}`} value={value}
                  onChange={(e) => onChange(e.target.value)} onBlur={(e) => onChange(sanitizeHtml(e.target.value))} />
      ) : (
        <div ref={ref} role="textbox" aria-multiline="true" aria-label={label} contentEditable suppressContentEditableWarning
             className={`ec-rich ec-rich-edit ${minHeight}`} onInput={emit} onBlur={emit} />
      )}
    </div>
  )
}

/** 저장된 서식 본문을 그린다(상세 · 미리보기). */
export function RichBodyView({ html, className = '' }: { html: string; className?: string }) {
  return <div className={`ec-rich ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
}

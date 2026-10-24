import { useEffect, useRef, useState } from 'react'
import { isBlankHtml, textToHtml } from '../utils/richText'

/**
 * 서식 편집기 — 원본 업무일지 입력 창의 에디터(2026-10-21 실측)와 같은 줄: [HTML] 칸 · 실행취소 · 다시실행 · 글꼴 ·
 * 글자크기 · 굵게 · 기울임 · 밑줄 · 취소선 · 글자색 · 글자 배경색 · 왼쪽/가운데/오른쪽/양쪽 정렬 · 리스트 · 표만들기 · 등록이미지.
 * 가벼운 contenteditable + execCommand 로 그리고 본문은 HTML 로 낸다(원본도 HTML 로 저장).
 */
const FONTS = ['돋움', '굴림', '바탕', '맑은 고딕', 'Arial']
const SIZES: { label: string; v: string }[] = [
  { label: '7pt', v: '1' }, { label: '9pt', v: '2' }, { label: '10pt', v: '3' }, { label: '12pt', v: '4' },
  { label: '14pt', v: '5' }, { label: '18pt', v: '6' }, { label: '24pt', v: '7' },
]

export default function EcRichEditor({ value, onChange, className = '' }: {
  value: string
  onChange: (html: string) => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<string | null>(null)
  const [source, setSource] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)

  /* 바깥에서 값이 바뀐 때만(열기 · 복사) 편집 영역을 다시 채운다 — 치는 중에는 커서가 튀지 않게 둔다. */
  useEffect(() => {
    const el = ref.current
    if (!el || source) return
    if (value !== last.current) {
      el.innerHTML = textToHtml(value)
      last.current = value
    }
  }, [value, source])

  const emit = () => {
    const el = ref.current
    if (!el) return
    const html = isBlankHtml(el.innerHTML) ? '' : el.innerHTML
    last.current = html
    onChange(html)
  }
  const cmd = (name: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(name, false, arg)
    emit()
  }
  const keep = (e: React.MouseEvent) => e.preventDefault()
  const Btn = ({ title, cmdName, arg, children }: { title: string; cmdName: string; arg?: string; children: React.ReactNode }) => (
    <button type="button" className="ec-btn ec-btn-sm" title={title} aria-label={title} onMouseDown={keep} onClick={() => cmd(cmdName, arg)}>{children}</button>
  )
  const addTable = () => cmd('insertHTML',
    `<table class="w-full"><tbody>${'<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'.repeat(3)}</tbody></table><p><br></p>`)
  const addImage = (f: File | undefined) => {
    if (!f) return
    const r = new FileReader()
    r.onload = () => cmd('insertImage', String(r.result))
    r.readAsDataURL(f)
  }

  return (
    <div className={`border-[length:var(--ec-hair)] border-ec-line rounded-ec ${className}`}>
      <div className="flex flex-wrap items-center gap-[3px] p-[3px] bg-ec-page">
        <label className="flex items-center gap-[3px] text-[11px] mr-[3px]" title="에디터 타입">
          <input type="checkbox" checked={source} onChange={(e) => { setSource(e.target.checked); if (!e.target.checked) last.current = null }} />HTML
        </label>
        <Btn title="실행취소 (Ctrl+Z)" cmdName="undo">↶</Btn>
        <Btn title="다시실행 (Ctrl+Y)" cmdName="redo">↷</Btn>
        <select className="ec-input w-[72px]" aria-label="글꼴" defaultValue="돋움" onChange={(e) => cmd('fontName', e.target.value)}>
          {FONTS.map((f) => <option key={f}>{f}</option>)}
        </select>
        <select className="ec-input w-[60px]" aria-label="글자크기" defaultValue="2" onChange={(e) => cmd('fontSize', e.target.value)}>
          {SIZES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <Btn title="굵게 (Ctrl+B)" cmdName="bold"><b>가</b></Btn>
        <Btn title="기울임 (Ctrl+I)" cmdName="italic"><i>가</i></Btn>
        <Btn title="밑줄 (Ctrl+U)" cmdName="underline"><u>가</u></Btn>
        <Btn title="취소선 (Ctrl+D)" cmdName="strikeThrough"><s>가</s></Btn>
        <label className="ec-btn ec-btn-sm" title="글자색">A
          <input type="color" aria-label="글자색" className="w-0 h-0 opacity-0 absolute" onChange={(e) => cmd('foreColor', e.target.value)} />
        </label>
        <label className="ec-btn ec-btn-sm" title="글자 배경색">▨
          <input type="color" aria-label="글자 배경색" className="w-0 h-0 opacity-0 absolute" onChange={(e) => cmd('hiliteColor', e.target.value)} />
        </label>
        <Btn title="왼쪽정렬 (Ctrl+,)" cmdName="justifyLeft">≡</Btn>
        <Btn title="가운데정렬 (Ctrl+.)" cmdName="justifyCenter">≣</Btn>
        <Btn title="오른쪽정렬 (Ctrl+/)" cmdName="justifyRight">☰</Btn>
        <Btn title="양쪽정렬" cmdName="justifyFull">▤</Btn>
        <Btn title="리스트" cmdName="insertUnorderedList">• 리스트</Btn>
        <Btn title="번호 리스트" cmdName="insertOrderedList">1.</Btn>
        <button type="button" className="ec-btn ec-btn-sm" title="표만들기" aria-label="표만들기" onMouseDown={keep} onClick={addTable}>▦</button>
        <button type="button" className="ec-btn ec-btn-sm" title="등록이미지" aria-label="등록이미지" onClick={() => imgRef.current?.click()}>🖼</button>
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { addImage(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      {source ? (
        <textarea className="ec-input w-full h-[200px] py-[8px] resize-y" aria-label="본문(HTML)" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-label="본문" aria-multiline
             className="min-h-[200px] max-h-[320px] overflow-auto p-[8px] text-[12px] outline-none"
             onInput={emit} onBlur={emit} />
      )}
    </div>
  )
}

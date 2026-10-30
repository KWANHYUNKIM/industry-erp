import { useEffect, useRef, useState, type ReactNode } from 'react'
import { sanitizeHtml } from '../bodyTemplate'
import { useAuth } from '../../auth/AuthContext'
import { shrinkImage } from '../../../utils/imageResize'
import EditorIcon from '../editor/EditorIcon'
import {
  FONTS, SIZES, PALETTE, LINE_STYLES, DEFAULT_COLORS, LINK_PREFIX, borderLine, fontNameOf, hrHtml, stampHtml, TEXTBOX_HTML,
} from '../editor/editorOptions'
import {
  applyBorder, cellsIn, coverRect, deleteCols, deleteRows, gridOf, insertCol, insertRow, mergeCells,
  newTableHtml, splitCell, type BorderKind,
} from '../editor/tableGrid'
import EcIcon from '../../../components/ui/EcIcon'

type Cell = HTMLTableCellElement
/** 끌어서 고른 칸 · 고른 글상자/그림 표시 — 저장할 때는 뺀다. */
const SEL = 'ec-cell-sel'
const OBJ = 'ec-obj-sel'
const OBJ_SELECTOR = 'img, .ec-textbox, .ec-stamp'

/** 편집 칸의 HTML — 고른 표시를 빼고, 표에 서식 꼬리표(no-ec)를 단다(sanitizeHtml 과 같은 꼬리표). */
function cleanBody(el: HTMLElement): string {
  const c = el.cloneNode(true) as HTMLElement
  c.querySelectorAll(`.${SEL}, .${OBJ}`).forEach((x) => {
    x.classList.remove(SEL, OBJ)
    if (!x.getAttribute('class')) x.removeAttribute('class')
  })
  c.querySelectorAll('[class=""]').forEach((x) => x.removeAttribute('class'))
  c.querySelectorAll('table:not(.no-ec)').forEach((t) => t.classList.add('no-ec'))
  return c.innerHTML
}

const px = (v: string) => (/^\d+(\.\d+)?$/.test(v.trim()) ? `${v.trim()}px` : v.trim())

/**
 * 서식 있는 본문 편집기 — 기안서작성 본문 · 공통양식 [기안내용].
 *
 * <p>원본 기안서작성 편집 도구 모음(2026-10-30 실측, `plans/데이터이관/원본-전자결재.md` '기안서작성 창')을 그대로 둔다:
 * 되돌리기 · 다시실행 | 글꼴(글꼴 · 크기 · 굵게 · 기울임 · 밑줄 · 취소선 · 글자 바탕색 · 글자색) | 서식(위 · 가운데 · 아래 맞춤,
 * 왼쪽 · 가운데 · 오른쪽 정렬, 칸 바탕색, 줄바꿈 안 함, 문서 정렬) | 삽입(표 · 글상자 · 선 · 그림 · 도장 · 링크) |
 * 레이아웃(테두리 · 줄/칸 넣기 · 칸 합치기/나누기 · 줄/칸 지우기 · 앞으로 · 뒤로 · 크기).
 *
 * <p>표 칸은 끌거나 Shift+누르기로 여러 칸을 고른다 — 합치기 · 테두리 · 바탕색 · 글자 서식이 고른 칸 전부에 먹는다.
 * 글자 서식은 브라우저 execCommand, 표 조작은 {@link ../editor/tableGrid} 가 격자로 펴서 한다.
 * 되돌리기는 execCommand 의 것이 표 조작을 모르므로 편집 칸 HTML 을 따로 쌓아 쓴다.
 * 본문은 원본처럼 돋움 12px · 폭 700 가운데. [HTML] 로 원문을 직접 고친다. 값은 HTML 글자(저장 전에 {@link sanitizeHtml}).
 */
export default function RichBodyEditor({ value, onChange, label = '기안내용', minHeight = 'min-h-[220px]' }: {
  value: string
  onChange: (html: string) => void
  /** 접근성 이름 · 시험이 칸을 찾는 이름 */
  label?: string
  minHeight?: string
}) {
  const { user } = useAuth()
  const ref = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState(false)
  const [drop, setDrop] = useState<string | null>(null)
  const [font, setFont] = useState(FONTS[0].name)
  const [size, setSize] = useState('10')
  const [textColor, setTextColor] = useState(DEFAULT_COLORS.text)
  const [textBg, setTextBg] = useState(DEFAULT_COLORS.textBg)
  const [cellBg, setCellBg] = useState(DEFAULT_COLORS.cellBg)
  const [grid, setGrid] = useState<[number, number]>([0, 0])
  const [lineW, setLineW] = useState(1)
  const [lineS, setLineS] = useState<string>('solid')
  const [href, setHref] = useState(LINK_PREFIX)
  const [imgUrl, setImgUrl] = useState('')
  const [dimW, setDimW] = useState('')
  const [dimH, setDimH] = useState('')
  const [dimTarget, setDimTarget] = useState<'cell' | 'table' | 'object'>('cell')

  const saved = useRef<Range | null>(null)
  const cells = useRef<Cell[]>([])
  const obj = useRef<HTMLElement | null>(null)
  const anchor = useRef<Cell | null>(null)
  const dragging = useRef(false)
  const emitted = useRef<string | null>(null)
  const hist = useRef<{ stack: string[]; i: number }>({ stack: [], i: -1 })
  const typing = useRef<number | undefined>(undefined)

  // 밖에서 값이 바뀐 때만(양식을 새로 고름 · 불러옴 · HTML 로 고침) 편집 칸을 다시 그린다. 치는 중에 다시 그리면 커서가 튄다.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (value !== emitted.current) {
      el.innerHTML = value
      emitted.current = value
      hist.current = { stack: [value], i: 0 }
      cells.current = []
      obj.current = null
    } else if (el.innerHTML === '' && value) {
      el.innerHTML = value   // [HTML] 에서 돌아와 편집 칸이 새로 생겼을 때
    }
  }, [value, source])

  useEffect(() => {
    const onSel = () => {
      const el = ref.current
      const s = window.getSelection()
      if (!el || !s || s.rangeCount === 0) return
      const r = s.getRangeAt(0)
      if (!el.contains(r.commonAncestorContainer)) return
      saved.current = r.cloneRange()
      const node = r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement
      if (node) {
        const cs = getComputedStyle(node)
        setFont(fontNameOf(cs.fontFamily))
        setSize(String(Math.round(parseFloat(cs.fontSize))))
      }
    }
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setDrop(null)
    }
    const onUp = () => {
      dragging.current = false
      ref.current?.classList.remove('selecting')
    }
    document.addEventListener('selectionchange', onSel)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('selectionchange', onSel)
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const emit = () => {
    const el = ref.current
    if (!el) return
    const html = cleanBody(el)
    emitted.current = html
    onChange(html)
  }

  function snapshot() {
    const el = ref.current
    if (!el) return
    const html = cleanBody(el)
    const h = hist.current
    if (h.stack[h.i] === html) return
    h.stack = [...h.stack.slice(0, h.i + 1), html].slice(-100)
    h.i = h.stack.length - 1
  }

  function restoreTo(i: number) {
    const el = ref.current
    const h = hist.current
    if (!el || i < 0 || i >= h.stack.length) return
    h.i = i
    el.innerHTML = h.stack[i]
    cells.current = []
    obj.current = null
    emit()
  }
  const undo = () => { snapshot(); restoreTo(hist.current.i - 1) }
  const redo = () => restoreTo(hist.current.i + 1)

  /** 고친 앞뒤를 되돌리기에 쌓고 값으로 내보낸다. */
  function run(fn: (el: HTMLDivElement) => void) {
    const el = ref.current
    if (!el) return
    snapshot()
    fn(el)
    // 고친 뒤의 고른 자리를 바로 잡아 둔다 — 도구를 잇달아 누르면 selectionchange 가 오기 전에 다음 도구가 돈다.
    const s = window.getSelection()
    if (s && s.rangeCount && el.contains(s.getRangeAt(0).commonAncestorContainer)) saved.current = s.getRangeAt(0).cloneRange()
    snapshot()
    emit()
    setDrop(null)
  }

  /** 도구 모음을 누르기 전의 커서 · 고른 글자로 돌린다. */
  function restore() {
    const el = ref.current
    if (!el) return
    el.focus()
    const s = window.getSelection()
    if (s && saved.current && el.contains(saved.current.commonAncestorContainer)) {
      s.removeAllRanges()
      s.addRange(saved.current)
    }
  }

  const liveCells = () => cells.current.filter((c) => ref.current?.contains(c))

  /** 조작할 칸들 — 끌어서 고른 칸, 없으면 커서가 든 칸. */
  function targetCells(): Cell[] {
    const live = liveCells()
    if (live.length) return live
    const r = saved.current
    const n = r ? (r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement) : null
    const td = n?.closest('td, th') as Cell | null
    return td && ref.current?.contains(td) ? [td] : []
  }
  const targetTable = () => (targetCells()[0]?.closest('table') as HTMLTableElement | null) ?? null

  function markCells(list: Cell[]) {
    ref.current?.querySelectorAll(`.${SEL}`).forEach((x) => {
      x.classList.remove(SEL)
      if (!x.getAttribute('class')) x.removeAttribute('class')
    })
    cells.current = list
    if (list.length > 1) list.forEach((c) => c.classList.add(SEL))
  }

  function selectRect(a: Cell, b: Cell) {
    const table = a.closest('table') as HTMLTableElement
    const g = gridOf(table)
    const rect = coverRect(g, [a, b])
    if (rect) markCells(cellsIn(g, rect))
  }

  /** 글자 서식 — 칸을 여럿 골랐으면 칸마다 그 안 글자 전부에, 아니면 고른 글자에. */
  function fmt(apply: () => void, onCollapsed?: (block: HTMLElement) => void) {
    run((el) => {
      document.execCommand('styleWithCSS', false, 'true')
      const list = liveCells()
      const s = window.getSelection()
      if (list.length > 1 && s) {
        for (const td of list) {
          const r = document.createRange()
          r.selectNodeContents(td)
          s.removeAllRanges()
          s.addRange(r)
          apply()
        }
        return
      }
      restore()
      const r = s && s.rangeCount ? s.getRangeAt(0) : null
      if (r && r.collapsed && onCollapsed) {
        const n = r.startContainer.nodeType === 1 ? (r.startContainer as HTMLElement) : r.startContainer.parentElement
        const block = n?.closest('td, th, p, div, li') as HTMLElement | null
        onCollapsed(block && block !== el && el.contains(block) ? block : el)
        return
      }
      apply()
    })
  }

  const cmd = (name: string, arg?: string) => fmt(() => { document.execCommand(name, false, arg) })

  function applyFont(name: string) {
    setFont(name)
    const css = FONTS.find((f) => f.name === name)?.css ?? name
    fmt(() => { document.execCommand('fontName', false, css) }, (b) => { b.style.fontFamily = css })
  }

  function applySize(v: string) {
    setSize(v)
    const n = Number(v)
    fmt(() => {
      document.execCommand('styleWithCSS', false, 'false')
      document.execCommand('fontSize', false, '7')
      const made: HTMLSpanElement[] = []
      ref.current?.querySelectorAll('font[size="7"]').forEach((f) => {
        const sp = document.createElement('span')
        sp.style.fontSize = `${n}px`
        while (f.firstChild) sp.appendChild(f.firstChild)
        f.replaceWith(sp)
        made.push(sp)
      })
      // <font> 를 바꿔 끼우면 고른 자리가 풀린다 — 바꾼 글자를 다시 골라 둔다(이어서 색을 칠할 수 있게).
      const s = window.getSelection()
      if (made.length && s) {
        const r = document.createRange()
        r.setStart(made[0], 0)
        r.setEnd(made[made.length - 1], made[made.length - 1].childNodes.length)
        s.removeAllRanges()
        s.addRange(r)
      }
      document.execCommand('styleWithCSS', false, 'true')
    }, (b) => { b.style.fontSize = `${n}px` })
  }

  const applyTextColor = (c: string) => { setTextColor(c); fmt(() => { document.execCommand('foreColor', false, c) }, (b) => { b.style.color = c }) }
  const applyTextBg = (c: string) => {
    setTextBg(c)
    fmt(() => { document.execCommand('hiliteColor', false, c) }, (b) => { b.style.backgroundColor = c === 'transparent' ? '' : c })
  }

  /** 칸 서식 — 고른 칸(없으면 커서 칸)에. */
  const cellStyle = (fn: (td: Cell) => void) => run(() => { targetCells().forEach(fn) })

  function align(a: 'left' | 'center' | 'right') {
    const list = targetCells()
    if (list.length) return cellStyle((td) => { td.style.textAlign = a })
    fmt(() => { document.execCommand(a === 'left' ? 'justifyLeft' : a === 'center' ? 'justifyCenter' : 'justifyRight') })
  }

  function applyCellBg(c: string) {
    if (c !== 'transparent') setCellBg(c)
    cellStyle((td) => { td.style.backgroundColor = c === 'transparent' ? '' : c })
  }

  function docAlign(a: 'left' | 'center' | 'right') {
    run((el) => {
      const t = targetTable()
      const tables = t ? [t] : [...el.querySelectorAll<HTMLTableElement>(':scope > table')]
      for (const x of tables) {
        x.style.marginLeft = a === 'left' ? '0' : 'auto'
        x.style.marginRight = a === 'right' ? '0' : 'auto'
      }
      if (!tables.length) el.querySelectorAll<HTMLElement>(':scope > p, :scope > div').forEach((p) => { p.style.textAlign = a })
    })
  }

  function insertHtml(html: string) {
    run((el) => {
      restore()
      const s = window.getSelection()
      const inside = s && s.rangeCount > 0 && el.contains(s.getRangeAt(0).commonAncestorContainer)
      if (inside) document.execCommand('insertHTML', false, html)
      else el.insertAdjacentHTML('beforeend', html)
    })
  }

  const tableOp = (fn: (t: HTMLTableElement, list: Cell[]) => void) => run(() => {
    const list = targetCells()
    const t = list[0]?.closest('table') as HTMLTableElement | null
    if (!t) return
    fn(t, list)
    markCells([])
  })

  function zorder(d: 'up' | 'top' | 'down' | 'bottom') {
    run((el) => {
      const o = obj.current
      if (!o || !el.contains(o)) return
      if (!o.style.position) o.style.position = 'relative'
      const zs = [...el.querySelectorAll<HTMLElement>(OBJ_SELECTOR)].map((x) => parseInt(x.style.zIndex || '0', 10) || 0)
      const z = parseInt(o.style.zIndex || '0', 10) || 0
      const max = Math.max(0, ...zs)
      o.style.zIndex = String(d === 'up' ? z + 1 : d === 'top' ? max + 1 : d === 'down' ? Math.max(0, z - 1) : 0)
    })
  }

  function openDimension() {
    const o = obj.current && ref.current?.contains(obj.current) ? obj.current : null
    const td = targetCells()[0]
    const target: HTMLElement | null = o ?? td ?? null
    setDimTarget(o ? 'object' : 'cell')
    setDimW(target ? String(Math.round(target.getBoundingClientRect().width)) : '')
    setDimH(target ? String(Math.round(target.getBoundingClientRect().height)) : '')
  }

  function applyDimension() {
    run(() => {
      const set = (x: HTMLElement) => {
        if (dimW.trim()) x.style.width = px(dimW)
        if (dimH.trim()) x.style.height = px(dimH)
      }
      if (dimTarget === 'object') { if (obj.current) set(obj.current) }
      else if (dimTarget === 'table') { const t = targetTable(); if (t) set(t) }
      else targetCells().forEach(set)
    })
  }

  function insertLink() {
    const url = href.trim()
    if (!url || url === LINK_PREFIX) return
    const safe = url.replace(/"/g, '%22')
    run(() => {
      restore()
      const s = window.getSelection()
      if (s && s.rangeCount && !s.getRangeAt(0).collapsed) document.execCommand('createLink', false, safe)
      else document.execCommand('insertHTML', false, `<a href="${safe}" target="_blank">${safe.replace(/</g, '&lt;')}</a>`)
    })
  }

  async function pickImage(f: File) {
    const small = await shrinkImage(f)
    // 첨부 저장소(/api/files)는 토큰이 있어야 내려받아 <img> 가 못 그린다 — 본문에 그림 자료를 그대로 싣는다.
    const url = await new Promise<string>((ok, no) => {
      const fr = new FileReader()
      fr.onload = () => ok(String(fr.result))
      fr.onerror = () => no(fr.error)
      fr.readAsDataURL(small)
    })
    insertHtml(`<img src="${url}" alt="" style="max-width:100%;position:relative">`)
  }

  const toggle = (name: string, before?: () => void) => {
    if (drop !== name) before?.()
    setDrop((d) => (d === name ? null : name))
  }
  const dropProps = (name: string, title: string, before?: () => void) => ({
    name, title, open: drop === name, onToggle: () => toggle(name, before),
  })

  const sizeOptions = SIZES.includes(Number(size)) ? SIZES : [...SIZES, Number(size)].sort((a, b) => a - b)

  return (
    <div className="ec-rich-editor">
      <div ref={barRef} className="ec-ed-bar" role="toolbar" aria-label={`${label} 편집 도구`}>
        <ToolBtn title="실행 취소" disabled={source} onClick={undo}><EditorIcon name="undo" /></ToolBtn>
        <ToolBtn title="다시 실행" disabled={source} onClick={redo}><EditorIcon name="redo" /></ToolBtn>

        <span className="ec-ed-label">글꼴</span>
        <select className="ec-ed-select w-[64px]" aria-label="글꼴" disabled={source} value={font}
                onChange={(e) => applyFont(e.target.value)}>
          {FONTS.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
        </select>
        <select className="ec-ed-select w-[56px]" aria-label="글자 크기" disabled={source} value={size}
                onChange={(e) => applySize(e.target.value)}>
          {sizeOptions.map((n) => <option key={n} value={String(n)}>{n}px</option>)}
        </select>
        <ToolBtn title="굵게" disabled={source} onClick={() => cmd('bold')}><b className="ec-ed-ch">T</b></ToolBtn>
        <ToolBtn title="기울임" disabled={source} onClick={() => cmd('italic')}><i className="ec-ed-ch">T</i></ToolBtn>
        <ToolBtn title="밑줄" disabled={source} onClick={() => cmd('underline')}><u className="ec-ed-ch">T</u></ToolBtn>
        <ToolBtn title="취소선" disabled={source} onClick={() => cmd('strikeThrough')}><s className="ec-ed-ch">T</s></ToolBtn>
        <span className="ec-ed-sep" />
        <ToolDrop {...dropProps('textBg', '글자 바탕색')} disabled={source} onMain={() => applyTextBg(textBg)}
                  icon={<span className="ec-ed-colorbtn"><span className="ec-ed-ch ec-ed-boxed">T</span><Swatch color={textBg} bar /></span>}>
          <ColorPanel onPick={applyTextBg} none="바탕색 없음" />
        </ToolDrop>
        <ToolDrop {...dropProps('textColor', '글자색')} disabled={source} onMain={() => applyTextColor(textColor)}
                  icon={<span className="ec-ed-colorbtn"><span className="ec-ed-ch">T</span><Swatch color={textColor} bar /></span>}>
          <ColorPanel onPick={applyTextColor} />
        </ToolDrop>

        <span className="ec-ed-label">서식</span>
        <ToolBtn title="위쪽 맞춤" disabled={source} onClick={() => cellStyle((td) => { td.style.verticalAlign = 'top' })}><EditorIcon name="vTop" /></ToolBtn>
        <ToolBtn title="가운데 맞춤" disabled={source} onClick={() => cellStyle((td) => { td.style.verticalAlign = 'middle' })}><EditorIcon name="vMid" /></ToolBtn>
        <ToolBtn title="아래쪽 맞춤" disabled={source} onClick={() => cellStyle((td) => { td.style.verticalAlign = 'bottom' })}><EditorIcon name="vBottom" /></ToolBtn>
        <ToolBtn title="왼쪽 정렬" disabled={source} onClick={() => align('left')}><EditorIcon name="aLeft" /></ToolBtn>
        <ToolBtn title="가운데 정렬" disabled={source} onClick={() => align('center')}><EditorIcon name="aCenter" /></ToolBtn>
        <ToolBtn title="오른쪽 정렬" disabled={source} onClick={() => align('right')}><EditorIcon name="aRight" /></ToolBtn>
        <span className="ec-ed-sep" />
        <ToolDrop {...dropProps('cellBg', '칸 바탕색')} disabled={source} onMain={() => applyCellBg(cellBg)}
                  icon={<span className="ec-ed-colorbtn"><EditorIcon name="bucket" /><Swatch color={cellBg} bar /></span>}>
          <ColorPanel onPick={applyCellBg} none="바탕색 없음" />
        </ToolDrop>
        <span className="ec-ed-sep" />
        <ToolBtn title="줄바꿈 안 함" disabled={source}
                 onClick={() => cellStyle((td) => { td.style.whiteSpace = td.style.whiteSpace === 'nowrap' ? '' : 'nowrap' })}>
          <EditorIcon name="nowrap" />
        </ToolBtn>
        <ToolDrop {...dropProps('docAlign', '문서 정렬')} disabled={source} icon={<EditorIcon name="docAlign" />}>
          <MenuItem onClick={() => docAlign('left')}>왼쪽</MenuItem>
          <MenuItem onClick={() => docAlign('center')}>가운데</MenuItem>
          <MenuItem onClick={() => docAlign('right')}>오른쪽</MenuItem>
        </ToolDrop>

        <span className="ec-ed-label">삽입</span>
        <ToolDrop {...dropProps('table', '표', () => setGrid([0, 0]))} disabled={source} icon={<EditorIcon name="table" />}>
          <div className="ec-ed-gridpick" onMouseLeave={() => setGrid([0, 0])}>
            {Array.from({ length: 10 }, (_, r) => (
              <div key={r} className="row">
                {Array.from({ length: 10 }, (_, c) => (
                  <button key={c} type="button" aria-label={`${r + 1}×${c + 1} 표`}
                          className={r < grid[0] && c < grid[1] ? 'on' : undefined}
                          onMouseEnter={() => setGrid([r + 1, c + 1])}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertHtml(newTableHtml(r + 1, c + 1))} />
                ))}
              </div>
            ))}
            <div className="ec-ed-hint">{grid[0] ? `${grid[0]} × ${grid[1]}` : '줄 × 칸'}</div>
          </div>
        </ToolDrop>
        <ToolBtn title="글상자" disabled={source} onClick={() => insertHtml(TEXTBOX_HTML)}><EditorIcon name="textbox" /></ToolBtn>
        <ToolDrop {...dropProps('line', '선')} disabled={source} icon={<EditorIcon name="line" />}>
          {LINE_STYLES.map((st) => (
            <MenuItem key={st} onClick={() => insertHtml(hrHtml(st))}>
              <span className={`ec-ed-linesample ${st}`} />
            </MenuItem>
          ))}
        </ToolDrop>
        <ToolDrop {...dropProps('image', '그림')} disabled={source} icon={<EditorIcon name="image" />}>
          <MenuItem onClick={() => { setDrop(null); fileRef.current?.click() }}>내 PC에서</MenuItem>
          <div className="ec-ed-form">
            <input className="ec-input" aria-label="그림 주소" placeholder="그림 주소" value={imgUrl}
                   onChange={(e) => setImgUrl(e.target.value)} />
            <button type="button" className="ec-btn ec-btn-sm"
                    onClick={() => { if (/^(https?:|data:image\/)/i.test(imgUrl.trim())) insertHtml(`<img src="${imgUrl.trim().replace(/"/g, '%22')}" alt="" style="max-width:100%;position:relative">`) }}>
              넣기
            </button>
          </div>
        </ToolDrop>
        <ToolBtn title="도장" disabled={source} onClick={() => insertHtml(stampHtml(user?.name ?? ''))}><EditorIcon name="stamp" /></ToolBtn>
        <ToolDrop {...dropProps('link', '하이퍼링크')} disabled={source} icon={<EditorIcon name="link" />}>
          <div className="ec-ed-form">
            <input className="ec-input" aria-label="링크 주소" value={href} onChange={(e) => setHref(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') insertLink() }} />
            <button type="button" className="ec-btn ec-btn-sm" onClick={insertLink}>확인</button>
          </div>
          <MenuItem onClick={() => run(() => { restore(); document.execCommand('unlink') })}>링크 해제</MenuItem>
        </ToolDrop>

        <span className="ec-ed-label">레이아웃</span>
        <ToolDrop {...dropProps('border', '테두리')} disabled={source} icon={<EditorIcon name="border" />}>
          <div className="ec-ed-form">
            <select className="ec-ed-select" aria-label="테두리 굵기" value={lineW} onChange={(e) => setLineW(Number(e.target.value))}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}px</option>)}
            </select>
            <select className="ec-ed-select" aria-label="테두리 모양" value={lineS} onChange={(e) => setLineS(e.target.value)}>
              {LINE_STYLES.map((st) => <option key={st} value={st}>{({ solid: '실선', dashed: '파선', dotted: '점선', double: '이중선' } as Record<string, string>)[st]}</option>)}
            </select>
          </div>
          {([
            ['all', '모든 테두리'], ['outer', '바깥 테두리'], ['inner', '안쪽 테두리'], ['top', '위 테두리'],
            ['bottom', '아래 테두리'], ['left', '왼쪽 테두리'], ['right', '오른쪽 테두리'], ['none', '테두리 없음'],
          ] as [BorderKind, string][]).map(([k, n]) => (
            <MenuItem key={k} onClick={() => tableOp((t, list) => applyBorder(t, list, k, borderLine(lineW, lineS)))}>{n}</MenuItem>
          ))}
        </ToolDrop>
        <span className="ec-ed-sep" />
        <ToolDrop {...dropProps('tableInsert', '줄/칸 넣기')} disabled={source} icon={<EditorIcon name="rowIns" />}>
          <MenuItem onClick={() => tableOp((t, l) => insertRow(t, l[0], 'above'))}>위에 줄 넣기</MenuItem>
          <MenuItem onClick={() => tableOp((t, l) => insertRow(t, l[l.length - 1], 'below'))}>아래에 줄 넣기</MenuItem>
          <MenuItem onClick={() => tableOp((t, l) => insertCol(t, l[0], 'left'))}>왼쪽에 칸 넣기</MenuItem>
          <MenuItem onClick={() => tableOp((t, l) => insertCol(t, l[l.length - 1], 'right'))}>오른쪽에 칸 넣기</MenuItem>
        </ToolDrop>
        <ToolDrop {...dropProps('tableMerge', '칸 합치기/나누기')} disabled={source} icon={<EditorIcon name="merge" />}>
          <MenuItem onClick={() => tableOp((t, l) => { mergeCells(t, l) })}>칸 합치기</MenuItem>
          <MenuItem onClick={() => tableOp((t, l) => l.forEach((c) => splitCell(t, c)))}>칸 나누기</MenuItem>
        </ToolDrop>
        <ToolDrop {...dropProps('tableDelete', '줄/칸 지우기')} disabled={source} icon={<EditorIcon name="rowDel" />}>
          <MenuItem onClick={() => tableOp((t, l) => deleteRows(t, l))}>줄 지우기</MenuItem>
          <MenuItem onClick={() => tableOp((t, l) => deleteCols(t, l))}>칸 지우기</MenuItem>
          <MenuItem onClick={() => tableOp((t) => t.remove())}>표 지우기</MenuItem>
        </ToolDrop>
        <span className="ec-ed-sep" />
        <ToolDrop {...dropProps('forward', '앞으로 가져오기')} disabled={source} icon={<EditorIcon name="forward" />}>
          <MenuItem onClick={() => zorder('up')}>앞으로 가져오기</MenuItem>
          <MenuItem onClick={() => zorder('top')}>맨 앞으로 가져오기</MenuItem>
        </ToolDrop>
        <ToolDrop {...dropProps('backward', '뒤로 보내기')} disabled={source} icon={<EditorIcon name="backward" />}>
          <MenuItem onClick={() => zorder('down')}>뒤로 보내기</MenuItem>
          <MenuItem onClick={() => zorder('bottom')}>맨 뒤로 보내기</MenuItem>
        </ToolDrop>
        <span className="ec-ed-sep" />
        <ToolDrop {...dropProps('dimension', '크기', openDimension)} disabled={source} icon={<EditorIcon name="dimension" />}>
          <div className="ec-ed-form">
            {([['cell', '칸'], ['table', '표'], ['object', '개체']] as const).map(([k, n]) => (
              <label key={k} className="ec-ed-radio">
                <input type="radio" name="ec-ed-dim" checked={dimTarget === k} onChange={() => setDimTarget(k)} />{n}
              </label>
            ))}
          </div>
          <div className="ec-ed-form">
            <span>너비</span><input className="ec-input w-[64px]" aria-label="너비" value={dimW} onChange={(e) => setDimW(e.target.value)} />
            <span>높이</span><input className="ec-input w-[64px]" aria-label="높이" value={dimH} onChange={(e) => setDimH(e.target.value)} />
            <button type="button" className="ec-btn ec-btn-sm" onClick={applyDimension}>적용</button>
          </div>
        </ToolDrop>

        <button type="button" className={`ec-btn ec-btn-sm ml-auto${source ? ' ec-btn-primary' : ''}`}
                onClick={() => { if (!source) emit(); setDrop(null); setSource((v) => !v) }}>HTML</button>
        <input ref={fileRef} type="file" accept="image/*" hidden
               onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pickImage(f) }} />
      </div>
      {source ? (
        <textarea aria-label={`${label} HTML`} className={`ec-rich-source ${minHeight}`} value={value}
                  onChange={(e) => onChange(e.target.value)} onBlur={(e) => onChange(sanitizeHtml(e.target.value))} />
      ) : (
        <div className="ec-rich-canvas" data-ctx-skip="true">
          <div ref={ref} role="textbox" aria-multiline="true" aria-label={label} contentEditable suppressContentEditableWarning
               className={`ec-rich ec-rich-edit ${minHeight}`}
               onInput={() => { emit(); window.clearTimeout(typing.current); typing.current = window.setTimeout(snapshot, 500) }}
               onBlur={emit}
               onKeyDown={(e) => {
                 if (!(e.ctrlKey || e.metaKey)) return
                 const k = e.key.toLowerCase()
                 if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
                 else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
               }}
               onMouseDown={(e) => {
                 const el = ref.current!
                 const t = e.target as HTMLElement
                 el.querySelectorAll(`.${OBJ}`).forEach((x) => x.classList.remove(OBJ))
                 obj.current = null
                 const o = t.closest(OBJ_SELECTOR) as HTMLElement | null
                 if (o && el.contains(o)) { o.classList.add(OBJ); obj.current = o }
                 const td = t.closest('td, th') as Cell | null
                 if (!td || !el.contains(td)) { markCells([]); anchor.current = null; return }
                 if (e.shiftKey && anchor.current && anchor.current.closest('table') === td.closest('table')) {
                   e.preventDefault()
                   selectRect(anchor.current, td)
                   return
                 }
                 anchor.current = td
                 dragging.current = true
                 markCells([])
               }}
               onMouseOver={(e) => {
                 const a = anchor.current
                 if (!dragging.current || !a) return
                 const td = (e.target as HTMLElement).closest('td, th') as Cell | null
                 if (!td || td === a || td.closest('table') !== a.closest('table')) return
                 ref.current?.classList.add('selecting')
                 window.getSelection()?.removeAllRanges()
                 selectRect(a, td)
               }} />
        </div>
      )}
    </div>
  )
}

function ToolBtn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="ec-ed-btn" title={title} aria-label={title} disabled={disabled}
            onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )
}

/** ▾ 가 붙은 도구 — onMain 이 있으면 왼쪽은 바로 실행(마지막 색), ▾ 는 판을 연다. */
function ToolDrop({ name, title, icon, open, onToggle, onMain, disabled, children }: {
  name: string; title: string; icon: ReactNode; open: boolean; onToggle: () => void; onMain?: () => void
  disabled?: boolean; children: ReactNode
}) {
  return (
    <span className="ec-ed-drop" data-tool={name}>
      <button type="button" className="ec-ed-btn" title={title} aria-label={title} aria-expanded={onMain ? undefined : open}
              disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onMain ?? onToggle}>
        {icon}
      </button>
      <button type="button" className="ec-ed-caret" title={title} aria-label={`${title} 펼치기`} aria-expanded={open}
              disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onToggle}><EcIcon name="caret-down" size={10} glyph="▾" /></button>
      {open && (
        <div className="ec-ed-panel" role="menu" aria-label={title}
             onMouseDown={(e) => { if (!(e.target as HTMLElement).closest('input, select, label')) e.preventDefault() }}>
          {children}
        </div>
      )}
    </span>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" role="menuitem" className="ec-ed-item" onClick={onClick}>{children}</button>
}

/** 색 칸 — 색은 자료라 인라인으로 칠한다(이 파일의 인라인 하나). */
function Swatch({ color, bar }: { color: string; bar?: boolean }) {
  return <i className={bar ? 'ec-ed-swatch bar' : 'ec-ed-swatch'} style={{ background: color }} />
}

function ColorPanel({ onPick, none }: { onPick: (c: string) => void; none?: string }) {
  return (
    <div className="ec-ed-palette">
      {none && <button type="button" className="ec-ed-item" onClick={() => onPick('transparent')}>{none}</button>}
      <div className="grid">
        {PALETTE.map((c) => (
          <button key={c} type="button" className="ec-ed-color" title={c} aria-label={c} onClick={() => onPick(c)}>
            <Swatch color={c} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** 저장된 서식 본문을 그린다(상세 · 미리보기). */
export function RichBodyView({ html, className = '' }: { html: string; className?: string }) {
  return <div className={`ec-rich ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
}

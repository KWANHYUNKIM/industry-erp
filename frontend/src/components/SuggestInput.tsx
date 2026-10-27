import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

/**
 * <b>자동완성 입력칸</b> — 치는 동안 서버가 준 후보를 칸 아래에 띄운다.
 *
 * <p>후보를 화면 코드에 적어 두지 않는다. 회사마다 품목·규격이 다르니(SaaS) 후보는 항상
 * <code>fetchSuggestions</code> 로 그 회사 자료에서 받아 온다. 이 칸은 그것을 보여 주고 고르게만 한다.
 *
 * <ul>
 *   <li>칸에 들어가면(포커스) 빈 채로도 한 번 부른다 — 서버가 많이 쓰는 값부터 준다.</li>
 *   <li>↑↓ 로 고르고 Enter 로 넣는다. 후보를 고르지 않은 Enter 는 그대로 흘려보낸다
 *       (화면이 Enter 로 조회하는 경우를 막지 않는다).</li>
 *   <li>Esc·Tab·바깥 클릭이면 닫힌다. 고르지 않아도 친 글자는 그대로 남는다(부분일치 조회용).</li>
 * </ul>
 */
export default function SuggestInput({
  value, onChange, fetchSuggestions, width, placeholder, title, style, debounceMs = 150,
}: {
  value: string
  onChange: (v: string) => void
  fetchSuggestions: (q: string) => Promise<string[]>
  width?: number | string
  placeholder?: string
  title?: string
  style?: CSSProperties
  debounceMs?: number
}) {
  const [items, setItems] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [focused, setFocused] = useState(false)
  const seq = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  /* 친 값이 바뀔 때마다(포커스 중일 때만) 잠깐 기다렸다 부른다. 늦게 온 옛 응답은 버린다. */
  useEffect(() => {
    if (!focused) return
    const my = ++seq.current
    const t = setTimeout(() => {
      fetchSuggestions(value).then((list) => {
        if (my !== seq.current) return
        // 친 것과 똑같은 후보 하나뿐이면 띄울 이유가 없다.
        const shown = list.length === 1 && list[0] === value ? [] : list
        setItems(shown)
        setActive(-1)
        setOpen(shown.length > 0)
      }).catch(() => { if (my === seq.current) { setItems([]); setOpen(false) } })
    }, debounceMs)
    return () => clearTimeout(t)
  }, [value, focused, fetchSuggestions, debounceMs])

  useEffect(() => {
    if (active < 0) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (v: string) => {
    onChange(v)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopPropagation(); choose(items[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <span className="ec-suggest" style={{ width }}>
      <input
        className="ec-input"
        value={value}
        placeholder={placeholder}
        title={title}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setOpen(false) }}
        onKeyDown={onKeyDown}
        style={{ width: '100%', ...style }}
      />
      {open && (
        <ul className="ec-suggest-list" role="listbox" ref={listRef}>
          {items.map((it, i) => (
            <li
              key={it}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              // mousedown 에서 막아야 input 이 blur 로 목록을 먼저 닫지 않는다.
              onMouseDown={(e) => { e.preventDefault(); choose(it) }}
              onMouseEnter={() => setActive(i)}
            >
              <Highlight text={it} query={value} />
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

/** 친 글자와 겹치는 부분을 굵게 — 왜 이 후보가 떴는지 눈으로 바로 보이게. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<b>{text.slice(i, i + q.length)}</b>{text.slice(i + q.length)}</>
}

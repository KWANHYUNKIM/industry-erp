import { useRef, useState, type RefObject } from 'react'

/**
 * 입력 격자 [찾기(F3)](원본 근무입력 · 근태입력 · 인사발령입력 …, 2026-10-04 실측) — 단추를 누르면 그 아래 작은 찾기 칸이 열린다.
 * 칸에 적고 Enter 를 누르면 격자에서 그 글자가 든 다음 줄로 가서 그 줄의 첫 입력칸에 커서를 둔다(끝까지 가면 처음부터 다시).
 * 줄의 글자와 입력칸 · 고르기 칸의 값(고른 이름 포함)을 함께 본다. 못 찾으면 원본처럼 아무 안내 없이 칸의 글자를 골라 둔다.
 */
export default function GridFindButton({ tableRef }: { tableRef: RefObject<HTMLTableElement | null> }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const last = useRef(-1)
  const findRef = useRef<HTMLInputElement>(null)

  function find() {
    const rows = [...(tableRef.current?.querySelectorAll('tbody tr') ?? [])] as HTMLTableRowElement[]
    const text = (r: HTMLTableRowElement) => [r.innerText,
      ...[...r.querySelectorAll('input, select')].map((el) => {
        const e = el as HTMLInputElement | HTMLSelectElement
        return e instanceof HTMLSelectElement ? e.selectedOptions[0]?.text ?? '' : (e.value || e.title || '')
      }),
      ...[...r.querySelectorAll('[title]')].map((el) => el.getAttribute('title') ?? '')].join(' ')
    const n = rows.length
    for (let k = 1; k <= n; k++) {
      const i = (last.current + k) % n
      if (q && text(rows[i]).includes(q)) {
        last.current = i
        rows[i].scrollIntoView({ block: 'nearest' })
        ;(rows[i].querySelector('input, select, button') as HTMLElement | null)?.focus()
        return
      }
    }
    findRef.current?.select()
  }

  return (
    <span className="relative inline-block">
      <button type="button" className="ec-btn ec-btn-sm" onClick={() => setOpen((v) => !v)}>찾기(F3)</button>
      {open && (
        <span className="absolute left-0 top-full mt-[2px] z-10 flex items-center gap-[4px]">
          <input ref={findRef} className="ec-input w-[160px]" autoFocus aria-label="격자 찾기" value={q}
                 onChange={(e) => { setQ(e.target.value); last.current = -1 }}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); find() } if (e.key === 'Escape') setOpen(false) }} />
        </span>
      )}
    </span>
  )
}

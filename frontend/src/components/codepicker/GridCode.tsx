import { useState } from 'react'
import CodeSearchModal from './CodeSearchModal'
import type { CodeItem } from '../CodePickerField'

/** 원본처럼 칸 위에 뜨는 말풍선 — '유효키항목 필수입력' · '계정코드를 입력 바랍니다.' */
export function ErrTip({ msg }: { msg: string }) {
  return (
    <span className="absolute left-1/2 -translate-x-1/2 bottom-full z-10 whitespace-nowrap rounded-ec bg-white px-[9px] py-[5px] text-[12px] text-ec-text shadow-[var(--ec-shadow-pop)] border border-ec-line">
      {msg}
    </span>
  )
}

/**
 * 입력 격자의 코드칸 — 원본 '계정코드' · '거래처' 열. 코드를 쳐서 Enter 하면 코드 · 이름에 걸리는 것이 한 건일 때 바로 고르고,
 * 여러 건 · 없음이면 그 글자로 검색 창을 연다(채권내역입력 계정 '108' → 1089 외상매출금 한 건이라 바로 고름, 2026-10-12 실측).
 * 코드가 정확히 같아도 다른 것에 함께 걸리면 창이다(일반전표 거래처 '00001', 2026-10-21).
 * F2 · 빈 칸 Enter 도 창을 연다. 이름은 옆 열이 그린다.
 * (회계 I 지출결의서 · 입금보고서 화면 안의 같은 칸을 공용으로 꺼낸 것이다.)
 */
export default function GridCode({ title, codeHead, nameHead, subHead, items, value, onPick, err, showName = false, emptyEnterNext, free = false, freeName }: {
  title: string; codeHead: string; nameHead: string; items: CodeItem[]
  /** 창에 셋째 열(item.sub)을 더한다 — 원본 월근태 '사원검색' 창의 [부서명]. 없으면 두 열 그대로. */
  subHead?: string
  value: string; onPick: (v: string) => void; err?: string | null
  /** 고른 뒤 칸에 코드 대신 이름을 보인다 — 원본 수표내역입력 줄의 [부서] '개발팀' · [프로젝트] '20210801A Project'(이름 열이 따로 없다). */
  showName?: boolean
  /** 빈 칸 Enter 가 창을 열지 않고 다음 칸으로 간다 — 값은 건너뛸 칸 수 + 1(1 = 바로 다음 칸). 원본 영업자별 계약상황 [계약코드] ·
   *  채권회수 상황판 [담당자](거래처를 건너뛰고 목표금액으로, 2026-10-21 실측). 없으면 창을 연다. */
  emptyEnterNext?: number
  /** 마스터에 없는 코드도 친 글자 그대로 받는다(onPick(친 글자)) — 원본 다목적관리 [사번] · [담당자] 는 줄에 코드 · 이름을 글자로 남긴다
   *  (데이터이관 2026-10-30: 원본 자료 S02 박영업 · 담당자 나수리). 맞는 것이 하나면 그대로 고르고, 여럿이면 창. 칸에는 저장된 글자를 보인다. */
  free?: boolean
  /** free + showName — 칸에 보일 저장된 이름(줄의 스냅숏). 마스터의 지금 이름보다 앞선다. */
  freeName?: string
}) {
  const selected = items.find((x) => x.value === value) ?? null
  const [typed, setTyped] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  function goNext(el: HTMLElement, steps: number) {
    const scope = el.closest('table') ?? document
    const all = Array.from(scope.querySelectorAll<HTMLElement>('input:not([disabled]):not([readonly]):not([type=checkbox]), textarea:not([disabled]):not([readonly])'))
    all[all.indexOf(el) + steps]?.focus()
  }
  function submit(el?: HTMLElement) {
    const n = (typed ?? '').trim()
    setTyped(null)
    if (!n && emptyEnterNext && el) { goNext(el, emptyEnterNext); return }
    if (!n) { setQ(''); setOpen(true); return }
    const low = n.toLowerCase()
    // 정확히 같은 코드가 있어도 다른 코드 · 이름에 함께 걸리면 고르지 않고 창 — 원본 일반전표 거래처 '00001'
    // → 00001 · 0000000000001 · SG00001 창(2026-10-21 실측, CodePickerField pair 와 같은 규칙).
    const hits = items.filter((x) => `${x.code ?? ''} ${x.name} ${x.alias ?? ''}`.toLowerCase().includes(low))
    // 원본(2026-10-21 채권회수 [담당자] AS05 Enter 실측): 하나만 맞아 채우면 빈 Enter 와 같은 칸으로 넘어간다(거래처를 건너뜀).
    if (hits.length === 1) { onPick(hits[0].value); if (el && emptyEnterNext) goNext(el, emptyEnterNext); return }
    if (free && hits.length === 0) { onPick(n); if (el && emptyEnterNext) goNext(el, emptyEnterNext); return }
    setQ(n)
    setOpen(true)
  }
  const shown = free
    ? (showName ? (freeName || selected?.name || value) : value)
    : ((showName ? selected?.name : selected?.code) ?? '')

  return (
    <span className="relative block">
      <input className={`ec-input w-full${err ? ' outline outline-1 outline-ec-danger' : ''}`} aria-label={title}
             placeholder={codeHead}
             value={typed ?? shown}
             onChange={(e) => { setTyped(e.target.value); if (!e.target.value) onPick('') }}
             onKeyDown={(e) => {
               if (e.key === 'Enter') { e.preventDefault(); submit(e.currentTarget) }
               if (e.key === 'F2') { e.preventDefault(); setQ(''); setOpen(true) }
             }}
             onBlur={() => { if (typed) submit(); else setTyped(null) }} />
      {err && <ErrTip msg={err} />}
      <CodeSearchModal
        open={open}
        label={nameHead.replace(/명$/, '')}
        title={title}
        items={items}
        columns={subHead ? [
          { head: codeHead, width: 311, cell: (x) => x.code ?? '', link: true },
          { head: nameHead, width: 311, cell: (x) => x.name, link: true },
          { head: subHead, width: 310, cell: (x) => x.sub ?? '' },
        ] : [
          { head: codeHead, width: 466, cell: (x) => x.code ?? '', link: true },
          { head: nameHead, width: 466, cell: (x) => x.name, link: true },
        ]}
        value={value}
        initialQuery={q}
        plain
        onPick={(x) => { if (x) onPick(x.value); setOpen(false) }}
        onClose={() => setOpen(false)}
      />
    </span>
  )
}

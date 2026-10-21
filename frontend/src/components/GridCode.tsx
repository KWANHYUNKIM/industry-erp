import { useState } from 'react'
import CodeSearchModal from './CodeSearchModal'
import type { CodeItem } from './CodePickerField'

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
export default function GridCode({ title, codeHead, nameHead, subHead, items, value, onPick, err, showName = false }: {
  title: string; codeHead: string; nameHead: string; items: CodeItem[]
  /** 창에 셋째 열(item.sub)을 더한다 — 원본 월근태 '사원검색' 창의 [부서명]. 없으면 두 열 그대로. */
  subHead?: string
  value: string; onPick: (v: string) => void; err?: string | null
  /** 고른 뒤 칸에 코드 대신 이름을 보인다 — 원본 수표내역입력 줄의 [부서] '개발팀' · [프로젝트] '20210801A Project'(이름 열이 따로 없다). */
  showName?: boolean
}) {
  const selected = items.find((x) => x.value === value) ?? null
  const [typed, setTyped] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  function submit() {
    const n = (typed ?? '').trim()
    setTyped(null)
    if (!n) { setQ(''); setOpen(true); return }
    const low = n.toLowerCase()
    // 정확히 같은 코드가 있어도 다른 코드 · 이름에 함께 걸리면 고르지 않고 창 — 원본 일반전표 거래처 '00001'
    // → 00001 · 0000000000001 · SG00001 창(2026-10-21 실측, CodePickerField pair 와 같은 규칙).
    const hits = items.filter((x) => `${x.code ?? ''} ${x.name}`.toLowerCase().includes(low))
    if (hits.length === 1) { onPick(hits[0].value); return }
    setQ(n)
    setOpen(true)
  }

  return (
    <span className="relative block">
      <input className={`ec-input w-full${err ? ' outline outline-1 outline-ec-danger' : ''}`} aria-label={title}
             placeholder={codeHead}
             value={typed ?? (showName ? selected?.name : selected?.code) ?? ''}
             onChange={(e) => { setTyped(e.target.value); if (!e.target.value) onPick('') }}
             onKeyDown={(e) => {
               if (e.key === 'Enter') { e.preventDefault(); submit() }
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

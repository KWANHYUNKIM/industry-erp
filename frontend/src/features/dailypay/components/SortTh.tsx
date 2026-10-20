/**
 * 일용근로 출력물(급여현황 E020753 · 근무확정현황 E020754) 격자 머리 — 원본은 머리 글자가 모두 링크(25,53,140 · 밑줄 없음)이고
 * 뒤에 fa-caret-down(14px)이 붙는다. 누르면 그 열의 화살이 위로 바뀌고 표를 다시 그린다(2026-10-20 실측, 자료가 없어 정렬 결과는 못 잼).
 * 우리는 누르면 소계 묶음 안에서 그 열 오름차순(▴) → 다시 누르면 내림차순(▾)으로 줄을 세운다.
 */
export interface SortState { key: string; asc: boolean }

/**
 * wrap — 원본 '귀속연월-NO ' 은 99px 칸(Dotum 12px 700 · 글자 78)에서 화살이 둘째 줄로 내려가 머리 줄이 두 줄(45.3)이 된다.
 * 우리 글꼴은 그 글자가 72px 이라 한 줄에 들어가므로, 그 칸만 화살을 다음 줄에 세운다.
 */
export function SortTh({ label, k, sort, onSort, className, wrap }: {
  label: string; k: string; sort: SortState | null; onSort: (s: SortState) => void; className?: string; wrap?: boolean
}) {
  const up = sort?.key === k && sort.asc
  return (
    <th className={className}>
      <button type="button" className="ec-link font-bold" onClick={() => onSort({ key: k, asc: !(sort?.key === k && sort.asc) })}>
        {label}{' '}
        {wrap && <br />}
        {/* 화살은 ::after 로 — 글자에 넣으면 [Excel] 이 긁는 머리 글자에 섞인다 */}
        <span aria-hidden className={`inline-block w-[14px] text-[14px] leading-[14px] text-center ${up ? "after:content-['▴']" : "after:content-['▾']"}`} />
      </button>
    </th>
  )
}

/** 고른 열로 줄을 세운다(고르지 않았으면 그대로). 숫자는 숫자로, 글자는 가나다로. */
export function sortRows<T>(rows: T[], sort: SortState | null, get: (r: T, key: string) => string | number | null | undefined): T[] {
  if (!sort) return rows
  return [...rows].sort((a, b) => {
    const x = get(a, sort.key) ?? '', y = get(b, sort.key) ?? ''
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko')
    return sort.asc ? c : -c
  })
}

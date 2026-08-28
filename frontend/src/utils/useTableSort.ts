import { useMemo, useState } from 'react'

/**
 * 표 머리를 눌러 정렬한다.
 *
 * <p>원본은 목록 열의 <b>78%</b>에 정렬 표시를 달고 실제로 눌러 정렬한다(사본 실측 —
 * 열 209개 중 162개). 우리는 60개 화면이 머리에 <b>▼ 를 그려 놓고도</b> 정렬 코드가
 * 한 줄도 없었다. 눌러도 아무 일이 없으니 표시가 거짓말을 하고 있었다.
 *
 * <p>값 꺼내는 법만 넘기면 나머지는 여기서 한다. 숫자는 숫자로, 글자는 한국어 순으로
 * 견주고, <b>빈 값은 방향과 상관없이 늘 뒤로</b> 보낸다 — 빈 칸이 위로 몰리면
 * 목록을 정렬한 뜻이 없어진다.
 */
export type SortValue = string | number | null | undefined

export function compareValues(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1        // 빈 값은 늘 뒤
  if (bEmpty) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'ko')
}

/** 한 번 누르면 오름차순, 다시 누르면 내림차순, 세 번째면 원래 차례로 돌아간다. */
export function nextDir(cur: 'asc' | 'desc' | null): 'asc' | 'desc' | null {
  return cur === null ? 'asc' : cur === 'asc' ? 'desc' : null
}

const isEmpty = (v: SortValue) => v === null || v === undefined || v === ''

export function sortRows<T>(rows: T[], get: (r: T) => SortValue, dir: 'asc' | 'desc'): T[] {
  // 원래 차례를 지키려고 자리번호를 함께 든다(같은 값끼리 뒤섞이지 않게).
  return rows
    .map((r, i) => [r, i] as const)
    .sort((x, y) => {
      const a = get(x[0])
      const b = get(y[0])
      /*
       * 빈 값은 <b>방향을 뒤집기 전에</b> 가른다. 뒤집은 뒤에 가르면 내림차순에서
       * 빈 칸이 위로 몰린다 — 정렬해 놓고 맨 위가 죄다 빈 줄이면 볼 것이 없다.
       */
      if (isEmpty(a) || isEmpty(b)) {
        if (isEmpty(a) && isEmpty(b)) return x[1] - y[1]
        return isEmpty(a) ? 1 : -1
      }
      const c = compareValues(a, b)
      return (dir === 'asc' ? c : -c) || x[1] - y[1]
    })
    .map(([r]) => r)
}

export function useTableSort<T>(rows: T[], accessors: Record<string, (r: T) => SortValue>) {
  const [key, setKey] = useState<string | null>(null)
  const [dir, setDir] = useState<'asc' | 'desc' | null>(null)

  const sorted = useMemo(() => {
    if (!key || !dir || !accessors[key]) return rows
    return sortRows(rows, accessors[key], dir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, dir])

  /** 머리를 눌렀을 때. 다른 열을 누르면 그 열의 오름차순부터 시작한다. */
  const toggle = (k: string) => {
    if (k !== key) { setKey(k); setDir('asc'); return }
    const d = nextDir(dir)
    setDir(d)
    if (!d) setKey(null)
  }

  /** 머리에 붙일 표시. 지금 정렬 중인 열만 진하게, 나머지는 '누를 수 있다' 는 뜻으로 흐리게. */
  const mark = (k: string) => (k === key && dir ? (dir === 'asc' ? '▲' : '▼') : '▼')
  const active = (k: string) => k === key && !!dir

  return { sorted, sortKey: key, dir, toggle, mark, active }
}

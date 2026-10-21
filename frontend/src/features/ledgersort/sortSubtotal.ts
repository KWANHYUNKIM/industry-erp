/**
 * 장부 [정렬/소계기준 설정] — 원본 창 '정렬/소계/합계 설정'(2026-10-22 loginaa 분개장 E010802 실측).
 * 순서 1~3 줄마다 정렬/소계기준 · 정렬방법(올림/내림) · 페이지분할 · 소계/합계라인(표시/표시안함), 아래 합계영역(표시/표시안함),
 * 소계/합계 표시항목(기본설정 = 금액 칸 전부 · 직접설정 = 칸마다 ☑). 이 파일은 화면 없이 줄을 나누는 순수 계산만 한다.
 */
export interface SortLevel { key: string; desc: boolean; pageBreak: boolean; subtotal: boolean }
export interface SortSetting {
  levels: SortLevel[]
  /** 합계영역 표시 */
  total: boolean
  /** 소계/합계 표시항목 — 'default' 면 금액 칸 전부 */
  itemMode: 'default' | 'custom'
  /** 직접설정일 때 칸별 [소계, 합계] 표시 */
  items: Record<string, { sub: boolean; total: boolean }>
}

export const emptyLevel = (): SortLevel => ({ key: '', desc: false, pageBreak: false, subtotal: false })
export const defaultSortSetting = (amountKeys: string[]): SortSetting => ({
  levels: [emptyLevel(), emptyLevel(), emptyLevel()],
  total: true,
  itemMode: 'default',
  items: Object.fromEntries(amountKeys.map((k) => [k, { sub: true, total: true }])),
})

export type SortedLine<R> =
  | { type: 'row'; row: R; pageBreak: boolean }
  | { type: 'sub'; level: number; label: string; sums: Record<string, number | null> }

/** 줄을 기준 순서대로 정렬하고, 소계를 켠 기준이 바뀌는 자리에 소계 줄을 끼운다. */
export function applySortSubtotal<R>(
  rows: R[], s: SortSetting, value: (r: R, key: string) => string | number, amountKeys: string[],
): SortedLine<R>[] {
  const levels = s.levels.filter((l) => l.key)
  if (levels.length === 0) return rows.map((row) => ({ type: 'row', row, pageBreak: false }))
  const sorted = [...rows].sort((a, b) => {
    for (const l of levels) {
      const x = value(a, l.key), y = value(b, l.key)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko')
      if (c !== 0) return l.desc ? -c : c
    }
    return 0
  })
  const show = (k: string) => s.itemMode === 'default' || s.items[k]?.sub
  const out: SortedLine<R>[] = []
  const acc = levels.map(() => Object.fromEntries(amountKeys.map((k) => [k, 0])) as Record<string, number>)
  const flush = (from: number, prev: R) => {
    for (let li = levels.length - 1; li >= from; li--) {
      if (levels[li].subtotal) {
        out.push({ type: 'sub', level: li, label: `${value(prev, levels[li].key)} 소계`,
          sums: Object.fromEntries(amountKeys.map((k) => [k, show(k) ? acc[li][k] : null])) })
      }
      for (const k of amountKeys) acc[li][k] = 0
    }
  }
  sorted.forEach((r, i) => {
    let changed = -1
    if (i > 0) {
      const prev = sorted[i - 1]
      changed = levels.findIndex((l) => value(prev, l.key) !== value(r, l.key))
      if (changed >= 0) flush(changed, prev)
    }
    const pageBreak = changed >= 0 && levels.slice(changed).some((l) => l.pageBreak)
    out.push({ type: 'row', row: r, pageBreak })
    for (let li = 0; li < levels.length; li++) for (const k of amountKeys) acc[li][k] += Number(value(r, k)) || 0
  })
  if (sorted.length) flush(0, sorted[sorted.length - 1])
  return out
}

/** 합계 줄에 찍을 칸인가(합계영역 · 표시항목). */
export const showTotal = (s: SortSetting, key: string) => s.total && (s.itemMode === 'default' || !!s.items[key]?.total)

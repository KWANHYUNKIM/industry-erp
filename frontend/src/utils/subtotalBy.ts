/**
 * 원본 현황 화면의 <b>[정렬/소계기준]</b> — 목록을 무엇으로 묶어 소계를 낼지 고르는 줄이다.
 * 사본 실측: 거래처별채권·생산입고현황·작업내역현황 등 여섯 화면 조건 판에 있다.
 *
 * <p>우리는 화면마다 <b>소계 축이 하나로 박혀</b> 있었다. 생산입고현황은 품목으로만,
 * 작업내역현황은 공정으로만 묶였다. 그런데 같은 자료를 창고별로 보고 싶은 사람과
 * 담당자별로 보고 싶은 사람이 따로 있다. 원본은 그걸 고르게 한다.
 *
 * <p>이 규칙을 따로 뺀 이유는 <b>안 정한 값의 처리</b> 때문이다. 창고가 비어 있는 줄을
 * 빈 문자열로 묶으면 서로 다른 줄들이 이름 없는 한 덩어리로 뭉쳐 <b>소계는 맞는데
 * 누구 것인지 모르는</b> 줄이 생긴다. 거래처그룹 소계에서 실제로 겪은 일이라
 * 여기서는 '(미지정)' 으로 이름을 붙여 남긴다.
 */

/** 한 묶음의 소계. */
export interface Subtotal<T> {
  /** 묶은 키의 이름. 값이 없던 줄은 '(미지정)'. */
  label: string
  /** 그 묶음에 든 줄 수. */
  count: number
  /** 재는 값들의 합. 재는 이름별로 하나씩. */
  sums: Record<string, number>
  rows: T[]
}

const UNSET = '(미지정)'

/**
 * 줄들을 <code>keyOf</code> 로 묶고, <code>measures</code> 를 각각 더한다.
 *
 * <p>묶음 차례는 <b>이름 오름차순</b>이고 '(미지정)' 은 늘 <b>맨 뒤</b>다 —
 * 이름 순서에 섞여 들어가면 없는 값이 'ㅁ' 자리에 끼어 눈에 안 띈다.
 */
export function subtotalBy<T>(
  rows: readonly T[],
  keyOf: (row: T) => string | null | undefined,
  measures: Record<string, (row: T) => number>,
): Subtotal<T>[] {
  const map = new Map<string, Subtotal<T>>()
  for (const row of rows) {
    const raw = keyOf(row)
    const label = raw == null || String(raw).trim() === '' ? UNSET : String(raw)
    let cur = map.get(label)
    if (!cur) {
      cur = { label, count: 0, sums: {}, rows: [] }
      for (const name of Object.keys(measures)) cur.sums[name] = 0
      map.set(label, cur)
    }
    cur.count += 1
    cur.rows.push(row)
    for (const [name, of] of Object.entries(measures)) {
      const v = of(row)
      cur.sums[name] += Number.isFinite(v) ? v : 0
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.label === UNSET) return 1
    if (b.label === UNSET) return -1
    return a.label.localeCompare(b.label, 'ko')
  })
}

export const UNSET_LABEL = UNSET

/**
 * 명세 그리드에 <b>불러온 줄을 합치는</b> 규칙.
 *
 * <p>소요시간계산의 [작업지시 불러오기]처럼, 이미 손으로 적어 둔 줄이 있는 그리드에
 * 새 줄을 담을 때 쓴다.
 *
 * <p>따로 뺀 이유는 <b>덮어쓰기가 조용히 일어나기 때문</b>이다. 불러오기가 기존 줄을
 * 통째로 갈아치우면, 방금 적어 둔 수량이 사라진 것을 사람은 한참 뒤에야 안다 —
 * 화면에는 "N건을 담았습니다" 만 뜬다.
 */

export interface MergeableLine {
  /** 품목을 아직 안 고른 줄은 빈 줄로 본다. */
  itemId: string
}

/**
 * 기존 줄 + 불러온 줄.
 *
 * <p>빈 줄(품목 미선택)만 걷어내고 <b>나머지는 그대로 둔 뒤 뒤에 붙인다.</b>
 * 기존이 전부 빈 줄이면 결과는 불러온 줄뿐이다.
 */
export function mergeLoadedLines<T extends MergeableLine>(existing: T[], loaded: T[]): T[] {
  return [...existing.filter((l) => l.itemId), ...loaded]
}

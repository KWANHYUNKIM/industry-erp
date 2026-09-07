/**
 * 현황 화면의 <b>[그래프로 보기]</b> — 막대 길이 계산.
 *
 * <p>원본 현황 17종(판매현황·구매현황·출하현황·수금현황·지급현황·미출하현황·
 * 생산불출현황·생산입고현황·거래처별채권/채무·할인현황들·작업내역현황 …)에 공통으로
 * [데이터 보기형식]과 [그래프로 보기]가 있다. 우리에겐 하나도 없었다.
 *
 * <p>계산만 따로 뺀 이유는 여기가 조용히 틀리기 쉬운 자리이기 때문이다 —
 * 0으로 나누기, 음수(반품·차감), 값이 전부 0인 경우. 화면은 그래도 그려지고
 * 막대만 이상해서 <b>아무도 오류라고 생각하지 않는다.</b>
 */

export interface ChartRow {
  label: string
  value: number
}

export interface Bar extends ChartRow {
  /** 0~100. 가장 큰 <b>절댓값</b>을 100 으로 잡는다. */
  percent: number
  /** 음수 막대(반품·차감)는 반대편으로 그린다. */
  negative: boolean
}

/**
 * 막대로 바꾼다.
 *
 * <p>기준은 <b>절댓값 중 최대</b>다. 최댓값만 보면 음수가 더 큰 자료에서
 * (예: 반품 −500 vs 매출 100) 막대가 다 넘쳐 버린다.
 *
 * <p>전부 0이면 막대를 그리지 않는다(0으로 나누지 않는다). 값이 0인 줄은
 * 목록에서 빼지 않는다 — '0 이었다' 는 것도 자료다.
 */
export function toBars(rows: ChartRow[]): Bar[] {
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.value)), 0)
  return rows.map((r) => ({
    ...r,
    percent: max === 0 ? 0 : Math.round((Math.abs(r.value) / max) * 1000) / 10,
    negative: r.value < 0,
  }))
}

/**
 * 그래프에 담을 줄을 고른다.
 *
 * <p>막대 마흔 개를 그려 봐야 읽히지 않는다. <b>절댓값이 큰 것부터</b> limit 개를 두고,
 * 나머지는 '그 외 N건' 한 줄로 합친다 — 그냥 잘라 버리면 합계가 안 맞아 보인다.
 */
export function topRows(rows: ChartRow[], limit = 15): ChartRow[] {
  if (rows.length <= limit) return rows
  const sorted = [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const head = sorted.slice(0, limit)
  const rest = sorted.slice(limit)
  const restSum = rest.reduce((s, r) => s + r.value, 0)
  return [...head, { label: `그 외 ${rest.length}건`, value: restSum }]
}

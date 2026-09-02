/**
 * 실제원가현황 <b>원가집계표</b>의 품목구분별 소계 — 원본 실측(사본 '원가생성_수정').
 *
 * <p>사본에 찍힌 소계 줄: <b>원재료 계 · 부재료 계 · 반제품 계 · 제품 계 · 상품 계 · 누계</b>.
 * 우리 화면은 품목코드순 한 덩어리에 맨 아래 합계 하나뿐이라, "이 달 원재료가 얼마나
 * 들어와서 얼마가 남았나" 를 보려면 눈으로 골라 세야 했다.
 *
 * <p>이 규칙을 따로 뺀 이유는 둘이다.
 * <ul>
 *   <li><b>구분 순서</b>가 원본과 같아야 한다. 이름순으로 두면 원재료보다 상품이 먼저 온다.</li>
 *   <li><b>모르는 구분을 버리지 않는다.</b> 목록에 없는 구분이 오면 맨 뒤에 그대로 세운다 —
 *       조용히 빼면 소계의 합이 누계와 어긋나고, 그 차이는 아무 데도 안 적힌다.</li>
 * </ul>
 */

/** 원본 원가집계표의 소계 순서. */
export const COST_GROUP_ORDER = ['원재료', '부재료', '반제품', '제품', '상품'] as const

export interface Grouped<T> {
  /** 품목구분 이름. 소계 줄은 `${name} 계` 로 적는다. */
  name: string
  rows: T[]
}

/**
 * 줄을 품목구분별로 묶고 원본 순서로 세운다.
 *
 * @param rows 원가집계표 줄
 * @param nameOf 그 줄의 품목구분 이름. 모르면 빈 문자열을 돌려주면 '(미지정)' 으로 모인다.
 */
export function groupByCategory<T>(rows: T[], nameOf: (row: T) => string): Grouped<T>[] {
  const UNKNOWN = '(미지정)'
  const buckets = new Map<string, T[]>()
  for (const r of rows) {
    const raw = nameOf(r)
    const name = raw && raw.trim() !== '' ? raw : UNKNOWN
    const cur = buckets.get(name)
    if (cur) cur.push(r)
    else buckets.set(name, [r])
  }
  const rank = (name: string) => {
    const i = (COST_GROUP_ORDER as readonly string[]).indexOf(name)
    // 목록에 없는 구분은 버리지 않고 맨 뒤로 — 빼면 소계 합이 누계와 어긋난다.
    return i === -1 ? COST_GROUP_ORDER.length : i
  }
  return [...buckets.entries()]
    .map(([name, rs]) => ({ name, rows: rs }))
    .sort((a, b) => (rank(a.name) - rank(b.name)) || a.name.localeCompare(b.name))
}

/**
 * 노무비/경비등록의 <b>공정별 소계</b> — 원본 실측(사본 '원가생성_수정' 의 노무비/경비 창):
 * 반제품공정 · 200 · 반제품제조 · 0 · 0 / <b>반제품공정 계</b> / 완제품공정 · 201 · … /
 * <b>완제품공정 계</b> / <b>합계</b>.
 *
 * <p>여기는 정해진 순서가 없다(공정은 회사가 만든다). 그래서 <b>목록에 나온 순서</b>를
 * 그대로 지킨다 — 화면이 정렬해 둔 순서를 소계가 다시 흔들면 사람이 줄을 못 따라간다.
 */
export function groupPreservingOrder<T>(rows: T[], nameOf: (row: T) => string): Grouped<T>[] {
  const out: Grouped<T>[] = []
  const at = new Map<string, Grouped<T>>()
  for (const r of rows) {
    const raw = nameOf(r)
    const name = raw && raw.trim() !== '' ? raw : '(미지정)'
    const cur = at.get(name)
    if (cur) cur.rows.push(r)
    else {
      const g = { name, rows: [r] }
      at.set(name, g)
      out.push(g)
    }
  }
  return out
}

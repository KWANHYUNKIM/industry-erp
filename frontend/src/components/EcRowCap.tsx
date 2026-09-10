/**
 * <b>표에 그리는 줄 수 상한과 그 안내.</b>
 *
 * <p>브라우저는 표 한 장에 몇만 줄을 깔면 멈춘다 — 원가집계표의 [감소내역]이
 * 63,486줄을 한 번에 그려 <b>탭이 얼어붙었다</b>(2026-09-10 실측). 사람이 눈으로 읽는
 * 표에 6만 줄을 한 번에 깔 까닭도 없다.
 *
 * <p>그런데 <b>조용히 자르는 것이 더 나쁘다.</b> 이 저장소에는 이미
 * <code>slice(0, 300)</code> 로 말없이 버리는 화면이 셋 있었다(공정별재공·오더관리진행단계·
 * 결제내역자료비교). 자른 줄 모르면 사람은 <b>표에 보이는 것이 전부</b>라고 읽는다.
 * 회계전표조회·재고수불부가 서버에서 자를 때 하는 것과 같은 규칙을 화면 쪽에도 둔다 —
 * <b>자르되 반드시 말한다.</b>
 *
 * <p><b>합계는 자르기 전 전부로 낸다.</b> 그리는 줄만 줄이는 것이지 세는 줄을 줄이는 것이
 * 아니다. 합계까지 잘리면 화면이 조용히 다른 숫자를 낸다 — 느린 것보다 나쁘다.
 */

/** 표 한 장에 그리는 기본 상한. */
export const TABLE_ROW_CAP = 500

/** 앞 <code>cap</code> 줄만 남기고, 잘랐는지와 전체 줄 수를 함께 돌려준다. */
export function capRows<T>(rows: T[], cap: number = TABLE_ROW_CAP): {
  rows: T[]
  capped: boolean
  total: number
} {
  return rows.length > cap
    ? { rows: rows.slice(0, cap), capped: true, total: rows.length }
    : { rows, capped: false, total: rows.length }
}

/**
 * 잘랐을 때 띄우는 안내. 회계전표조회의 문구와 같은 결로 쓴다 —
 * <b>몇 중 몇을 보고 있는지</b>와 <b>합계는 전부로 냈다</b>는 것을 함께 적는다.
 */
export default function EcRowCap({ capped, shown, total, hint, sums = true }: {
  capped: boolean
  shown: number
  total: number
  /** 좁히는 방법을 아는 화면은 그 방법을 적는다(예: '기간을 좁히거나 검색어를 주세요'). */
  hint?: string
  /**
   * 이 표 아래에 <b>합계가 있는가</b>. 있으면 "합계는 전부로 냈다" 고 밝히고,
   * 없으면 그 말을 안 한다 — <b>없는 합계를 있다고 적으면 그것도 거짓</b>이다
   * (미리보기·전표 고르기 창에는 합계가 없다).
   */
  sums?: boolean
}) {
  if (!capped) return null
  return (
    <p style={{
      background: '#fff8e1', color: '#7a5b00', padding: '6px 10px',
      fontSize: 12.5, borderRadius: 3, marginBottom: 8,
    }}>
      모두 {total.toLocaleString('ko-KR')}줄 중 앞 {shown.toLocaleString('ko-KR')}줄만 그렸습니다 —
      표가 너무 길면 브라우저가 멈추기 때문입니다.
      {sums && <> <b>합계는 {total.toLocaleString('ko-KR')}줄 전부로 냈습니다.</b></>}
      {hint ? ` ${hint}` : ''}
    </p>
  )
}

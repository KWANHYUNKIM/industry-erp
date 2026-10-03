/**
 * 근태(휴가) 목록을 서버에 <b>어느 시작일 구간으로</b> 물을지.
 *
 * <p>서버 GET /hr/vacations 는 시작일로 거르고, 안 물으면 <b>올해</b> 것만 준다. 근태현황·근태조회는
 * 그걸 받아 놓고 화면에서 [기준일자](올린 날)·걸친 기간으로 다시 거른다. 그래서 1월에 [전월]을 누르면
 * 작년 12월 근태가 애초에 안 와서 <b>늘 빈 표</b>였다.
 *
 * <p>화면이 거르는 날짜가 시작일과 꼭 같지 않다(전표일자 = 올린 날, 여러 날 걸친 휴가).
 * 미리 올리거나 지나서 올리는 일이 있어 앞뒤로 <b>한 해씩</b> 넓혀 묻고, 정확한 거르기는 화면이 한다.
 * 한쪽만 있으면 다른 쪽은 <b>열어 둔다</b>(시작만 준 조건은 그 뒤 전부다).
 * 둘 다 비었으면 null — 서버 기본(올해)대로 묻는다.
 */
export function vacationFetchRange(from: string, to: string): { from: string; to: string } | null {
  const fy = /^\d{4}/.test(from) ? Number(from.slice(0, 4)) : null
  const ty = /^\d{4}/.test(to) ? Number(to.slice(0, 4)) : null
  if (fy == null && ty == null) return null
  return {
    from: fy == null ? '1900-01-01' : `${fy - 1}-01-01`,
    to: ty == null ? '9999-12-31' : `${ty + 1}-12-31`,
  }
}

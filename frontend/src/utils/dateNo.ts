/**
 * 원본 [일자-No.] 칸 — '2026/07/14 -5'. 날짜 뒤에 그날 전표의 일련번호만 붙인다.
 * 우리 전표번호는 'GL-20260714-0005' 처럼 길어서 끝 일련번호만 떼어 앞 0 을 지운다(판매조회의 dateNo 와 같은 규칙).
 * 번호 끝이 숫자가 아니면 그 조각을 그대로 붙인다.
 */
export function dateNo(date: string, docNo: string): string {
  const seq = docNo.split('-').pop() ?? ''
  return `${date.replace(/-/g, '/')} -${Number(seq) || seq}`
}

/**
 * 원본 재고조정조회 · 재고조정현황의 [입력일자] · [일자-No.] — '26/10/12-1'(2026-10-12 실측). 연도 둘째 자리부터, 번호 앞 칸이 없다.
 */
export function shortDateNo(date: string, docNo: string): string {
  const seq = docNo.split('-').pop() ?? ''
  return `${date.slice(2).replace(/-/g, '/')}-${Number(seq) || seq}`
}

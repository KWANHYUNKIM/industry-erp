/**
 * 원본 [일자-No.] 칸 — '2026/07/14 -5'. 날짜 뒤에 그날 전표의 일련번호만 붙인다.
 * 우리 전표번호는 'GL-20260714-0005' 처럼 길어서 끝 일련번호만 떼어 앞 0 을 지운다(판매조회의 dateNo 와 같은 규칙).
 * 번호 끝이 숫자가 아니면 그 조각을 그대로 붙인다.
 */
export function dateNo(date: string, docNo: string): string {
  const seq = docNo.split('-').pop() ?? ''
  return `${date.replace(/-/g, '/')} -${Number(seq) || seq}`
}

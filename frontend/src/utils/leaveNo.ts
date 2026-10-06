/**
 * 원본 근태번호 · 근태현황 [전표일자] 꼴 '2026/10/29 -1'(2026-10-04 실측).
 * 우리 근태번호 AT-YYYYMMDD-0001 은 날짜 자리가 근태 시작일이고 번호가 그날 안에서 매겨진다 — 그대로 그 꼴로 보인다
 * (원본 날짜 자리는 전표일자지만, 올린 날 + 시작일 번호를 섞으면 같은 번호가 둘 나온다). 번호를 못 읽으면 대신 날짜만.
 */
export function leaveNo(docNo: string | null | undefined, fallbackDate: string): string {
  const m = /^AT-(\d{4})(\d{2})(\d{2})-(\d+)$/.exec(docNo ?? '')
  return m ? `${m[1]}/${m[2]}/${m[3]} -${Number(m[4])}` : fallbackDate.replace(/-/g, '/')
}

/**
 * 회계거래조회에서 연 전표의 차례 — 그 전표들을 여는 주소를 목록 차례대로 담는다.
 * 매출전표 I 수정 창의 [이전] · [다음](원본: [이전]은 목록의 아래 줄 전표, 2026-10-13 loginaa 실측)이 읽는다.
 */
const KEY = 'journal-nav'

export function saveJournalNav(urls: string[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(urls)) } catch { /* 저장소가 막혀도 전표는 연다 */ }
}

/** 지금 주소의 앞(다음) · 뒤(이전) 전표 주소. 목록에서 오지 않았거나 끝이면 null. */
export function journalNeighbors(current: string): { prev: string | null; next: string | null } {
  let urls: string[] = []
  try { urls = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') } catch { urls = [] }
  const i = urls.indexOf(current)
  if (i < 0) return { prev: null, next: null }
  return { prev: urls[i + 1] ?? null, next: urls[i - 1] ?? null }
}

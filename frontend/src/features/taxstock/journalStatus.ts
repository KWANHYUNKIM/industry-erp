import { api } from '../../api/client'

/**
 * 매입 · 매출(세금)계산서조회(재고)(E040219 · E040218)의 [확인] · [확인취소] · [선택삭제] — 회계거래조회와 같은 자리를 부른다.
 * 회계전표의 진행상태(journal_entries.confirm_status)를 바꾸고, 지우기는 서버가 막으면(구매 · 판매에서 온 전표는 회계반영 취소로만)
 * 그 까닭을 돌려준다.
 */
export async function changeJournalStatus(ids: number[], status: 'CONFIRMED' | 'UNCONFIRMED') {
  await api.post('/journals/status', { ids, status })
}

export function deleteJournals(ids: number[]) {
  return Promise.allSettled(ids.map((id) => api.delete(`/journals/${id}`)))
}

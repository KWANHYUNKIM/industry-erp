/** 원본 출력물 수량 칸 — 소수 둘째 자리까지('10.00', 천 단위 쉼표). 창고별재고현황·재고변동표·재고수불부(2026-10-20 실측). */
export const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

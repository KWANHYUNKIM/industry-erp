/**
 * 시리얼/로트 내역 한 줄의 수량을 원본처럼 보이는 값으로.
 *
 * <p>서버의 <code>quantityChange</code> 는 로트 재고가 실제로 움직인 양(들어오면 +, 나가면 −)이다.
 * 원본 화면은 보통 줄을 <b>넣은 수량 그대로</b>(판매 1 → 1.00, 구매 3 → 3.00) 찍지만,
 * 시리얼/로트No.재고조정(E040634)이 남긴 [재고조정] 줄은 <b>출고로 적힌다</b> — 0 → 5 로 맞추면
 * 내역조회 [수량] 이 -5.00, 재고수불부 [출고수량] 이 -5.00 · [재고수량] 5.00, 0 → -1 이면 1.00 · -1.00
 * (2026-10-14 loginaa 실측, QA재고2-ADJ1 · ryu_0025).
 */
export const LOT_ADJUST = '재고조정'

/** 내역조회 · 내역현황 · 상세내역 [수량] 칸. */
export function lotShownQty(t: { docType?: string | null; quantityChange: number | string }): number {
  const q = Number(t.quantityChange)
  return t.docType === LOT_ADJUST ? -q : Math.abs(q)
}

/** 재고수불부 [입고수량] · [출고수량] — 재고조정은 전부 출고 쪽(늘리면 음수 출고). */
export function lotInOut(t: { docType?: string | null; quantityChange: number | string }): { in: number; out: number } {
  const q = Number(t.quantityChange)
  if (t.docType === LOT_ADJUST) return { in: 0, out: -q }
  return { in: Math.max(q, 0), out: Math.max(-q, 0) }
}

/** 내역조회에서 열어 고치고 지울 수 있는 줄 — 손으로 넣은 줄과 재고조정 줄(원본도 같은 내역입력 창이 열린다). */
export function lotTxEditable(t: { manual?: boolean; docType?: string | null }): boolean {
  return !!t.manual || t.docType === LOT_ADJUST
}

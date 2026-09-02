import DiscountStatusPage from './DiscountStatusPage'

/**
 * 구매할인현황 (이카운트).
 *
 * <p>판매·구매·외주비 세 화면은 <b>원본에서 표가 똑같다</b>(월/일 · 거래처명 ·
 * 금액 · 회계반영금액 · 차액 · 적요). 한 화면으로 두고 종류만 바꾼다 —
 * 두 벌로 두면 조건 하나 고칠 때 한쪽만 고치게 된다.
 *
 * <p>원본 표가 외주비할인현황과 같다 — 회계로 안 넘어간 구매금액을 본다.
 */
export default function PurchaseDiscountPage() {
  return <DiscountStatusPage kind="PURCHASE" title="구매할인현황" amountLabel="구매금액" defaultPick="직전기수" withTradeType />
}

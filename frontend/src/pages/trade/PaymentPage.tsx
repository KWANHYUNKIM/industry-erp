import { SettlementStatusPage } from './CollectionPage'

/**
 * 구매관리 > 지급현황 (이카운트).
 *
 * 수금현황과 조건·컬럼이 같고 정산 종류만 다르다(RECEIPT / PAYMENT).
 * 같은 화면을 두 벌 만들면 조건 하나 고칠 때 한쪽만 고치게 된다 — 실제로 두 화면이
 * 서로 다르게 흘러가 있었다.
 */
export default function PaymentPage() {
  return <SettlementStatusPage type="PAYMENT" title="지급현황" moneyLabel="지급" />
}

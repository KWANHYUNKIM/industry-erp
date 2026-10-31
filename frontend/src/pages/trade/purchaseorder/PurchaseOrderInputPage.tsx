import { useNavigate } from 'react-router-dom'
import PurchaseRequestForm from '../../../features/purchaserequest/PurchaseRequestForm'

/**
 * 재고 I &gt; 구매관리 &gt; 발주서 &gt; <b>발주서입력</b> — 원본 발주서 묶음 둘째(2026-10-20 실측: 발주서조회 · 발주서입력 · 발주서현황 · 미구매현황).
 * 원본은 요청 · 계획을 거치지 않고 발주서를 바로 쓸 수 있다. 저장하면 바로 발주서(발주확정 — 구매 [발주] 잔량적용 대상)다.
 */
export default function PurchaseOrderInputPage() {
  const navigate = useNavigate()
  return <PurchaseRequestForm editing={null} page order onList={() => navigate('/sales/purchase-orders')} />
}

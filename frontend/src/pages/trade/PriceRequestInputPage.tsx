import { useNavigate } from 'react-router-dom'
import PurchaseRequestForm from '../../features/purchaserequest/PurchaseRequestForm'

/**
 * 재고 I &gt; 구매관리 &gt; 단가요청 &gt; <b>단가요청입력</b>(E040321, 2026-10-21 loginaa 실측) — 원본 사이드바 단가요청 묶음 첫째.
 * 단가요청은 요청 · 계획 · 발주서와 다른 전표다. 칸 · 열은 PurchaseRequestForm 의 priceRequest 에 적었다.
 */
export default function PriceRequestInputPage() {
  const navigate = useNavigate()
  return <PurchaseRequestForm editing={null} page priceRequest onList={() => navigate('/sales/price-requests')} />
}

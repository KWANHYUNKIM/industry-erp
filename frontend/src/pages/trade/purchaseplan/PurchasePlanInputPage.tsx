import { useNavigate } from 'react-router-dom'
import PurchaseRequestForm from '../../../features/purchaserequest/PurchaseRequestForm'

/**
 * 재고 I &gt; 구매관리 &gt; 발주계획 &gt; <b>발주계획입력</b>(E040316) — 원본 사이드바에 발주계획조회 · 발주계획입력 · 발주계획현황
 * 셋이 따로 있다(2026-10-13 loginaa 실측). 칸은 발주요청입력과 같고 다른 것은 PurchaseRequestForm 의 plan 에 적었다.
 */
export default function PurchasePlanInputPage() {
  const navigate = useNavigate()
  return <PurchaseRequestForm editing={null} page plan onList={() => navigate('/sales/purchase-plans')} />
}

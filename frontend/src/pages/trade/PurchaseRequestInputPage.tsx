import { useNavigate } from 'react-router-dom'
import PurchaseRequestForm from '../../features/purchaserequest/PurchaseRequestForm'

/**
 * 재고 I &gt; 구매관리 &gt; 발주요청 &gt; <b>발주요청입력</b>(E040314) — 원본 사이드바에 발주요청조회 · 발주요청입력 · 발주요청현황
 * 셋이 따로 있다(2026-10-13 loginaa 실측). 입력칸은 발주요청조회의 [신규(F2)] 창과 같고, 단추줄만 화면 것이다.
 */
export default function PurchaseRequestInputPage() {
  const navigate = useNavigate()
  return <PurchaseRequestForm editing={null} page onList={() => navigate('/sales/purchase-requests')} />
}

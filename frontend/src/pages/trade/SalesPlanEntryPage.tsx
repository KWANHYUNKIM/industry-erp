import { useNavigate } from 'react-router-dom'
import EcSlipShell from '../../components/EcSlipShell'
import SalesPlanForm from '../../features/salesplan/components/SalesPlanForm'

/**
 * 재고 II › 계획관리 › 매출계획 › <b>매출계획입력</b>(E040624) — 따로 된 입력 화면(2026-10-14 loginaa 실측).
 *
 * <p>원본은 사이트맵에 매출계획조회와 따로 놓인 입력 화면이다: 머리 [예상매출일자], 격자 빈 줄 셋에 코드를 쳐 Enter,
 * 단추 저장(F8) · 다시 작성 · 리스트 · 웹자료올리기. 저장하면 안내 없이 빈 입력이 남는다.
 * 폼은 매출계획조회의 [신규(F2)] · 수정 창과 같은 부품(features/salesplan/components/SalesPlanForm)이다.
 * 예전에는 조회 화면의 창으로만 넣을 수 있었고 메뉴에 매출계획입력이 없었다.
 */
export default function SalesPlanEntryPage() {
  const navigate = useNavigate()
  return (
    <EcSlipShell title="매출계획입력">
      <SalesPlanForm editing={null} onSaved={() => undefined}
                     extraButtons={<button type="button" className="ec-btn" onClick={() => navigate('/sales/sales-plan-list')}>리스트</button>} />
    </EcSlipShell>
  )
}

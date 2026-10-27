import { api } from '../../api/client'

/**
 * 거래처·품목의 <b>특별단가</b>를 찾는다. 없으면 null — 표준단가를 그대로 두라는 뜻이다(0 이 아니다).
 *
 * 서버가 단가적용순서설정의 '사용' 줄을 차례로 본다(창고별 · 거래처별 특별단가 — 품목별 · 품목그룹별). 화면은 부르기만 한다.
 * 판매입력만 이것을 불렀고 견적서·수주·발주서는 특별단가를 아예 몰랐다(50회차) — 한 곳에 두고 같이 쓴다.
 */
export async function resolveSpecialPrice(
  tradeType: 'SALES' | 'PURCHASE', itemId: string, partnerId: string, warehouseId?: string,
): Promise<number | null> {
  if (!itemId || (!partnerId && !warehouseId)) return null
  try {
    const r = await api.get<{ found: boolean; unitPrice: number | null }>('/special-prices/resolve', {
      params: { tradeType, itemId, partnerId: partnerId || undefined, warehouseId: warehouseId || undefined },
    })
    return r.data.found && r.data.unitPrice != null ? r.data.unitPrice : null
  } catch {
    return null   // 특별단가를 못 읽어도 입력은 계속돼야 한다
  }
}

/** 통장 이름이 들어 있는 최소 모양 — /bank-cards/accounts 응답. */
export interface BankLabelSource { name?: string | null; bankName?: string | null; accountNo?: string | null }

/**
 * 장부에 찍는 통장 이름 — 등록한 통장명, 없으면 원본 모양 '은행명-계좌끝4자리'(원본 예: 기업은행-1122).
 * 자금일보 · 자금현황표 · 경영요약보고서가 같은 이름을 써야 화면끼리 견줄 수 있다.
 * 끝 네 자리는 겹칠 수 있으니 줄을 묶을 때는 이 이름이 아니라 통장 번호(id)로 묶는다.
 */
export function bankLabel(a: BankLabelSource): string {
  if (a.name) return a.name
  return `${a.bankName ?? ''}-${(a.accountNo ?? '').replace(/\D/g, '').slice(-4)}`
}

/**
 * 원본 기본 거래처 [임의거래처] 의 코드. 전표에서 이 거래처를 고르면 거래처 이름 칸이 열려 고칠 수 있고,
 * 저장한 이름이 그 전표의 거래처명이 된다(원본 실측 2026-10-28 — 견적 11/21-2 '경동상회').
 * 서버도 같은 코드로 판별한다(`TradeMasters.ANY_PARTNER_CODE`).
 */
export const ANY_PARTNER_CODE = '12341234'

export function isAnyPartner(p: { code?: string | null } | null | undefined): boolean {
  return !!p && p.code === ANY_PARTNER_CODE
}

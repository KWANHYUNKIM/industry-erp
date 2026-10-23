package com.erp.common;

/**
 * 재고가 0 아래로 내려가도 되는가 — Self-Customizing › 환경설정 › 기능설정 [재고] 의 '재고 마이너스 허용'.
 *
 * <p>원본은 재고가 없어도 판매 · 생산불출 · 생산입고 소모가 저장되고 재고현황에 −로 남는다(2026-10-23 loginaa
 * 창고별재고현황 9/30: J001 본사창고 −322 · 제4공장 G002 −1,620 …). 재고를 빼는 쪽(inventory)이 설정(settings)을
 * 알면 모듈 의존이 뒤집히므로 약속만 여기 두고 구현은 settings 가 맡는다.
 */
public interface NegativeStockPolicy {

    boolean allowsNegativeStock();
}

package com.erp.trade.quotation;

/**
 * 견적서 진행 상태 — 원본 견적서조회(E040202) [진행상태변경] 의 <b>미확인 / 확인(진행중 · 완료)</b>
 * (2026-10-14 loginaa 실측: 새 견적은 '진행중' 으로 저장되고, 사람이 고른 줄을 메뉴로 옮긴다).
 * 수주로 넘어갔는지는 상태가 아니라 {@code convertedOrderId} 가 들고 있다(원본도 주문서를 만들어도 '진행중' 그대로).
 * 취소는 원본에 없다 — 예전 자료만 남는다(주문서와 같다).
 */
public enum QuotationStatus {
    UNCONFIRMED("미확인"),
    IN_PROGRESS("진행중"),
    COMPLETED("완료"),
    CANCELLED("취소");

    private final String displayName;

    QuotationStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}

package com.erp.trade.domain.enums;

/** 쇼핑몰 주문 상태. 수집 → 확인 → 판매전환 → 배송 → (반품 | 교환) / 취소. */
public enum MallOrderStatus {
    RECEIVED("수집"),
    CONFIRMED("확인"),
    CONVERTED("판매전환"),
    SHIPPED("배송"),
    RETURNED("반품"),
    EXCHANGED("교환"),
    CANCELLED("취소");

    private final String displayName;

    MallOrderStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
